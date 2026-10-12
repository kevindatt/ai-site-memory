import aclCsv from "../../data/test-project/access-control.csv?raw";
import type { ProjectRecord, RecordKind, UserContext } from "./types";
import type { RegisterView } from "../data/registers";
import { latestOf } from "../data/registers";

/**
 * Authorization boundary (PRD §16).
 * Users and their record scopes come from a local access-control mapping
 * (Phase C4: data/test-project/access-control.csv — the stand-in for a
 * future enterprise permission mapping). Permission checks run BEFORE
 * retrieval: the answer engine only ever sees applyScope(store, user).
 * Local prototype users only — production SSO maps onto UserContext later.
 */

const KNOWN_KINDS: RecordKind[] = ["WIR", "MIR", "NCR", "RFI", "Submittal", "Drawing", "Document", "Mail", "Reference"];

function parseAcl(text: string): UserContext[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return [];
  const headers = (lines[0] ?? "").split(",").map((header) => header.trim());
  const users: UserContext[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",").map((cell) => cell.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    const kinds = (row["kinds"] ?? "")
      .split(";")
      .map((kind) => kind.trim())
      .filter((kind): kind is RecordKind =>
        KNOWN_KINDS.includes(kind as RecordKind)
      );
    const locations = (row["locations"] ?? "")
      .split(";")
      .map((location) => location.trim())
      .filter((location) => location !== "");
    const projectIds = (row["project_ids"] ?? "")
      .split(";")
      .map((id) => id.trim())
      .filter((id) => id !== "");
    const userId = row["user_id"] ?? "";
    if (userId === "") continue;
    users.push({
      userId,
      displayName: row["display_name"] ?? userId,
      projectIds,
      scope:
        kinds.length === 0 && locations.length === 0
          ? undefined
          : {
              ...(kinds.length > 0 ? { kinds } : {}),
              ...(locations.length > 0 ? { locations } : {})
            }
    });
  }
  return users;
}

const FALLBACK_USERS: UserContext[] = [
  {
    userId: "demo-user",
    displayName: "Demo User — full project access",
    projectIds: ["qubators-demo"]
  }
];

const PARSED_USERS = parseAcl(aclCsv);

export const USERS: UserContext[] = PARSED_USERS.length > 0 ? PARSED_USERS : FALLBACK_USERS;

export function getDemoUser(): UserContext {
  const user = USERS[0];
  if (user === undefined) throw new Error("No demo user configured.");
  return user;
}

export function getUser(userId: string): UserContext | undefined {
  return USERS.find((user) => user.userId === userId);
}

export function checkAccess(user: UserContext, projectId: string): boolean {
  return user.projectIds.includes(projectId);
}

function recordVisible(
  user: UserContext,
  record: { kind: RecordKind; location?: string }
): boolean {
  const scope = user.scope;
  if (scope === undefined) return true;
  if (scope.kinds !== undefined && !scope.kinds.includes(record.kind)) return false;
  if (
    scope.locations !== undefined &&
    (record.location === undefined ||
      !scope.locations.some((loc) => loc.toLowerCase() === record.location?.toLowerCase()))
  ) {
    return false;
  }
  return true;
}

/** Filtered read view: only records the user is authorized to access. */
export function applyScope(store: RegisterView, user: UserContext): RegisterView {
  if (user.scope === undefined) return store;
  const wirs = store.wirs.filter((record) =>
    recordVisible(user, { kind: "WIR", location: record.location })
  );
  const mirs = store.mirs.filter((record) =>
    recordVisible(user, { kind: "MIR", location: record.location })
  );
  const ncrs = store.ncrs.filter((record) =>
    recordVisible(user, { kind: "NCR", location: record.location })
  );
  const rfis = store.rfis.filter((record) =>
    recordVisible(user, { kind: "RFI", location: record.location })
  );
  const drawings = store.drawings.filter((record) =>
    recordVisible(user, { kind: "Drawing", location: record.location })
  );
  const submittals = store.submittals.filter((record) =>
    recordVisible(user, { kind: "Submittal", location: record.location })
  );
  const mails = store.mails.filter(() => recordVisible(user, { kind: "Mail" }));
  const visibleIds = new Set<string>();
  for (const records of [wirs, mirs, ncrs, rfis, drawings, submittals, mails]) {
    for (const record of records) visibleIds.add(record.id.toUpperCase());
  }
  // Reference rows carry arbitrary table content: visible only with full
  // access, never inside a restricted scope.
  if (user.scope === undefined) {
    for (const record of store.listRecords()) {
      if (record.kind === "Reference") visibleIds.add(record.id.toUpperCase());
    }
  }
  const scoped = new Map<string, ProjectRecord>();
  for (const record of store
    .listRecords()
    .filter((candidate) => visibleIds.has(candidate.id.toUpperCase()))) {
    const key = `${record.kind}‖${record.id.toUpperCase()}‖${(record.fields["revision"] ?? "").toUpperCase()}`;
    scoped.set(key, record);
  }
  return {
    wirs,
    mirs,
    ncrs,
    rfis,
    drawings,
    submittals,
    mails,
    listRecords: () => [...scoped.values()],
        getRecord: (id: string) => {
      const key = id.trim().toUpperCase();
      return latestOf([...scoped.values()].filter((record) => record.id.toUpperCase() === key));
    }
  };
}
