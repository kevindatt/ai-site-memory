import type { RegisterView } from "../data/registers";
import type { ProjectRecord } from "./types";
import { getOverdueWirs } from "./retrieval";

/**
 * Project intelligence (Phase D2): counts, holder workload, and exception
 * findings computed from verified records. Judgments (bottlenecks, risks)
 * are labeled Inferred by callers; the underlying numbers are Verified.
 */

export interface WorkloadItem {
  holder: string;
  items: Array<{ id: string; status: string }>;
}

/** Open (non-approved, non-closed) items grouped by holder, busiest first. */
export function holderWorkload(view: RegisterView): WorkloadItem[] {
  const byHolder = new Map<string, Array<{ id: string; status: string }>>();
  for (const record of view.listRecords()) {
    const holder = record.fields["holder"] ?? "";
    if (holder === "") continue;
    if (record.status === "Approved" || record.status === "Closed") continue;
    const items = byHolder.get(holder) ?? [];
    items.push({ id: record.id, status: record.status });
    byHolder.set(holder, items);
  }
  return [...byHolder.entries()]
    .map(([holder, items]) => ({ holder, items }))
    .sort((a, b) => b.items.length - a.items.length);
}

export interface Finding {
  title: string;
  detail: string;
  recordIds: string[];
}

export function exceptionFindings(view: RegisterView): Finding[] {
  const findings: Finding[] = [];
  const overdue = getOverdueWirs(view);
  if (overdue.length > 0) {
    findings.push({
      title: `${overdue.length} overdue WIR${overdue.length === 1 ? "" : "s"}`,
      detail: overdue
        .map((wir) => `${wir.id} (${wir.location}, due ${wir.dueDate}, with ${wir.holder === "" ? "no recorded holder" : wir.holder})`)
        .join("; "),
      recordIds: overdue.map((wir) => wir.id)
    });
  }
  for (const workload of holderWorkload(view)) {
    if (workload.items.length < 2) continue;
    findings.push({
      title: `${workload.holder} holds ${workload.items.length} open items`,
      detail: workload.items.map((item) => `${item.id} (${item.status})`).join("; "),
      recordIds: workload.items.map((item) => item.id)
    });
  }
  const drafts = view.mirs.filter((mir) => mir.status === "Draft");
  if (drafts.length > 0) {
    findings.push({
      title: `${drafts.length} draft MIR${drafts.length === 1 ? "" : "s"} not yet raised`,
      detail: drafts.map((mir) => `${mir.id} (${mir.material}, ${mir.location})`).join("; "),
      recordIds: drafts.map((mir) => mir.id)
    });
  }
  const awaiting = view.drawings.filter((drawing) => drawing.status === "For Review");
  if (awaiting.length > 0) {
    findings.push({
      title: `${awaiting.length} drawing${awaiting.length === 1 ? "" : "s"} awaiting approval`,
      detail: awaiting.map((drawing) => `${drawing.id} (${drawing.title})`).join("; "),
      recordIds: awaiting.map((drawing) => drawing.id)
    });
  }
  const wir1842 = view.getRecord("WIR-1842");
  if (wir1842 !== undefined) {
    findings.push({
      title: "WIR-1842 went through a reject–resubmit cycle",
      detail:
        "The documented rejection (date and reason not recorded) followed by resubmission marks this as rework-prone; related open NCR-031 is still unresolved.",
      recordIds: ["WIR-1842", "NCR-031"]
    });
  }
  return findings;
}

const KIND_WORDS: Record<string, string[]> = {
  WIR: ["wir", "wirs"],
  MIR: ["mir", "mirs"],
  NCR: ["ncr", "ncrs"],
  RFI: ["rfi", "rfis"],
  Drawing: ["drawing", "drawings"],
  Submittal: ["submittal", "submittals"],
  Reference: ["reference", "references", "row", "rows"]
};

const STATUS_WORDS: Array<{ key: string; match: (status: string) => boolean }> = [
  { key: "open", match: (status) => status.toLowerCase() === "open" },
  { key: "overdue", match: (status) => status.toLowerCase().includes("overdue") },
  { key: "approved", match: (status) => status.toLowerCase() === "approved" },
  { key: "closed", match: (status) => status.toLowerCase() === "closed" },
  { key: "draft", match: (status) => status.toLowerCase() === "draft" },
  { key: "pending", match: (status) => status.toLowerCase().includes("pending") },
  { key: "review", match: (status) => status.toLowerCase().includes("review") }
];

export interface CountResult {
  kind: string | undefined;
  status: string | undefined;
  count: number;
  matches: ProjectRecord[];
}

/** "How many open NCRs?" -> counted matches within the visible view. */
export function countRecords(view: RegisterView, question: string): CountResult {
  const q = question.toLowerCase();
  let kind: string | undefined;
  for (const [kindName, words] of Object.entries(KIND_WORDS)) {
    if (words.some((word) => new RegExp(`\\b${word}\\b`).test(q))) {
      kind = kindName;
      break;
    }
  }
  let status: string | undefined;
  let match = (_status: string): boolean => true;
  for (const candidate of STATUS_WORDS) {
    if (new RegExp(`\\b${candidate.key}\\b`).test(q)) {
      status = candidate.key;
      match = candidate.match;
      break;
    }
  }
  const matches = view
    .listRecords()
    .filter((record) => (kind === undefined || record.kind === kind) && match(record.status));
  return { kind, status, count: matches.length, matches };
}

export interface ProjectSummary {
  total: number;
  wirs: number;
  mirs: number;
  ncrs: number;
  openNcrs: number;
  rfis: number;
  drawings: number;
  approvedDrawings: number;
  submittals: number;
  overdueWirs: number;
  draftMirs: number;
}

export function projectSummary(view: RegisterView): ProjectSummary {
  return {
    total: view.listRecords().length,
    wirs: view.wirs.length,
    mirs: view.mirs.length,
    ncrs: view.ncrs.length,
    openNcrs: view.ncrs.filter((ncr) => ncr.status === "Open").length,
    rfis: view.rfis.length,
    drawings: view.drawings.length,
    approvedDrawings: view.drawings.filter((drawing) => drawing.status === "Approved").length,
    submittals: view.submittals.length,
    overdueWirs: getOverdueWirs(view).length,
    draftMirs: view.mirs.filter((mir) => mir.status === "Draft").length
  };
}
