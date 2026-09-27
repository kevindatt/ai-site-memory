import type {
  DrawingRecord,
  MirRecord,
  ProjectStore,
  WirRecord
} from "../data/registers";
import type { ProjectRecord } from "./types";

/**
 * Retrieval boundary (PRD §10.3, Tech Spec §7).
 * Deterministic structured retrieval over the local synthetic registers.
 * Future connectors (Aconex / Egnyte / Graph) implement DocumentSource and
 * these helpers move behind it without changing response logic.
 */
export interface DocumentSource {
  listRecords(): ProjectRecord[];
  getRecord(id: string): ProjectRecord | undefined;
}

export function queryById(source: DocumentSource, id: string): ProjectRecord | undefined {
  return source.getRecord(id.trim().toUpperCase());
}

/** WIRs explicitly flagged overdue by the register status (never inferred). */
export function getOverdueWirs(store: ProjectStore): WirRecord[] {
  return store.wirs.filter((wir) => wir.status.toLowerCase().includes("overdue"));
}

export function findMirByMaterialAndLocation(
  store: ProjectStore,
  material: string,
  location: string
): MirRecord[] {
  const mat = material.toLowerCase();
  const loc = location.toLowerCase();
  return store.mirs.filter(
    (mir) =>
      mir.material.toLowerCase().includes(mat) && mir.location.toLowerCase().includes(loc)
  );
}

/**
 * Approved drawings, optionally scoped to an id prefix (e.g. "AR-043").
 * Sorted by issue date descending. Superseded / For Review revisions are
 * excluded: the newest revision is never assumed to be the approved one.
 */
export function approvedDrawings(store: ProjectStore, idPrefix?: string): DrawingRecord[] {
  return store.drawings
    .filter(
      (drawing) =>
        drawing.status === "Approved" &&
        (idPrefix === undefined || drawing.id.toUpperCase().startsWith(idPrefix.toUpperCase()))
    )
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
}

export function latestApprovedDrawing(
  store: ProjectStore,
  idPrefix?: string
): DrawingRecord | undefined {
  return approvedDrawings(store, idPrefix)[0];
}

/** Explicit record identifiers mentioned in free text (WIR/MIR/NCR/RFI/Drawing). */
export function extractIds(text: string): string[] {
  const upper = text.toUpperCase();
  const found = new Set<string>();
  for (const match of upper.matchAll(/\b(WIR|MIR|NCR|RFI)-(\d+)\b/g)) {
    found.add(`${match[1]}-${match[2]}`);
  }
  for (const match of upper.matchAll(/\bAR-[A-Z0-9]+(?:-REV-[A-Z])?\b/g)) {
    found.add(match[0]);
  }
  return [...found];
}
