import type {
  DrawingRecord,
  MirRecord,
  RegisterView,
  SubmittalRecord,
  WirRecord
} from "../data/registers";
import type { ProjectRecord } from "./types";
import type { RecordKind } from "./types";
import { pickLatestApproved } from "./precedence";

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
export function getOverdueWirs(store: RegisterView): WirRecord[] {
  return store.wirs.filter((wir) => wir.status.toLowerCase().includes("overdue"));
}

export function findMirByMaterialAndLocation(
  store: RegisterView,
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
export function approvedDrawings(store: RegisterView, idPrefix?: string): DrawingRecord[] {
  return store.drawings
    .filter(
      (drawing) =>
        drawing.status === "Approved" &&
        (idPrefix === undefined || drawing.id.toUpperCase().startsWith(idPrefix.toUpperCase()))
    )
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
}

export function latestApprovedDrawing(
  store: RegisterView,
  idPrefix?: string
): DrawingRecord | undefined {
  return pickLatestApproved(approvedDrawings(store, idPrefix));
}

/** Submittals whose register entry references the given MIR. */
export function findSubmittalsForMir(store: RegisterView, mirId: string): SubmittalRecord[] {
  const key = mirId.trim().toUpperCase();
  return store.submittals.filter((submittal) => submittal.relatedMir.toUpperCase() === key);
}

/** Explicit record identifiers mentioned in free text (WIR/MIR/NCR/RFI/Submittal/Drawing). */
export function extractIds(text: string): string[] {
  const upper = text.toUpperCase();
  const found = new Set<string>();
  for (const match of upper.matchAll(/\b(WIR|MIR|NCR|RFI|SUB)-(\d+)\b/g)) {
    found.add(`${match[1]}-${match[2]}`);
  }
  for (const match of upper.matchAll(/\bAR-[A-Z0-9]+(?:-REV-[A-Z])?\b/g)) {
    found.add(match[0]);
  }
  return [...found];
}

/**
 * Record ids actually present in the source: fast patterns plus any
 * token shaped like a document number (e.g. AFO-IN-000001) that resolves.
 * Real registers use site-specific numbering no pattern can enumerate.
 */
export function extractKnownIds(text: string, source: DocumentSource): string[] {
  const found = new Set<string>(extractIds(text).filter((id) => source.getRecord(id) !== undefined));
  const upper = text.toUpperCase();
  for (const match of upper.matchAll(/\b[A-Z0-9][A-Z0-9.\/-]*\d[A-Z0-9.\/-]*\b/g)) {
    const token = match[0].replace(/[.\/-]+$/g, "");
    if (token.length >= 4 && source.getRecord(token) !== undefined) {
      found.add(token);
    }
  }
  return [...found];
}

/** Distinct revisions on file for a record id (1 when unrevised). */
export function revisionCount(view: RegisterView, id: string): number {
  const key = id.trim().toUpperCase();
  const revisions = new Set(
    view
      .listRecords()
      .filter((record) => record.id.toUpperCase() === key)
      .map((record) => record.fields["revision"] ?? "")
  );
  return revisions.size;
}

const DESCRIPTIVE_EXTRA_STOPWORDS = [
  "mir",
  "mirs",
  "wir",
  "wirs",
  "ncr",
  "ncrs",
  "rfi",
  "rfis",
  "drawing",
  "drawings",
  "submittal",
  "submittals",
  "mail",
  "mails",
  "material",
  "inspection",
  "request",
  "work",
  "information",
  "non",
  "conformance",
  "search",
  "find",
  "found",
  "look",
  "looking",
  "for",
  "about"
];

/** Record kind hinted by the question wording, if any. */
export function kindHint(question: string): RecordKind | null {
  const q = question.toLowerCase();
  if (/\bmirs?\b/.test(q)) return "MIR";
  if (/\bwirs?\b/.test(q)) return "WIR";
  if (/\bncrs?\b/.test(q)) return "NCR";
  if (/\brfis?\b/.test(q)) return "RFI";
  if (/\bdrawings?\b/.test(q)) return "Drawing";
  if (/\bsubmittals?\b/.test(q)) return "Submittal";
  if (/\bmails?\b|\bletters?\b|\bcorrespondence\b/.test(q)) return "Mail";
  return null;
}

export interface DescriptiveHit {
  record: ProjectRecord;
  score: number;
}

/** Significant content words: what the user is actually searching for. */
export function contentWords(question: string): string[] {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(
      (word) =>
        word.length > 2 &&
        !STOPWORDS.has(word) &&
        !DESCRIPTIVE_EXTRA_STOPWORDS.includes(word)
    );
}

/**
 * Free-text record search for "status of the MIR for janitor room mop sink"
 * style questions: scores material/description/subject/activity/title (2 per
 * word) and location (1 per word). Returns matches with score >= 4, best
 * first. Callers decide: exactly one -> answer it; several -> clarify.
 */
export function descriptiveMatches(
  view: RegisterView,
  question: string,
  kind: RecordKind | null
): DescriptiveHit[] {
  const words = contentWords(question);
  if (words.length === 0) return [];
  const hits: DescriptiveHit[] = [];
  for (const record of view.listRecords()) {
    if (kind !== null && record.kind !== kind) continue;
    let score = 0;
    const text = [
      record.fields["material"] ?? "",
      record.fields["description"] ?? "",
      record.fields["subject"] ?? "",
      record.fields["activity"] ?? "",
      record.fields["title"] ?? "",
      record.fields["comments"] ?? "",
      record.fields["snippet"] ?? ""
    ]
      .join(" ")
      .toLowerCase();
    const location = (record.location ?? "").toLowerCase();
    for (const word of words) {
      if (/^\d+$/.test(word)) {
        const pattern = new RegExp(`(?:^|\\D)${word}(?=\\D|$)`);
        if (pattern.test(text)) score += 2;
        else if (pattern.test(location)) score += 1;
      } else if (text.includes(word)) score += 2;
      else if (location.includes(word)) score += 1;
    }
    // Phrase bonus: adjacent question words appearing in order (e.g. the
    // full "Delivery Note No: 8145/2026" line) promote the true row above
    // scattered keyword matches.
    for (let i = 0; i + 1 < words.length; i++) {
      const first = words[i] as string;
      const second = words[i + 1] as string;
      const at = text.indexOf(first);
      if (at >= 0 && text.indexOf(second, at + first.length) >= 0) score += 3;
    }
    if (score >= 4) hits.push({ record, score });
  }
  // No slicing here: callers need full ties to dedupe and count.
  return hits.sort((a, b) => b.score - a.score);
}

const STOPWORDS = new Set([
  "what",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "whose",
  "is",
  "are",
  "was",
  "were",
  "the",
  "a",
  "an",
  "of",
  "for",
  "and",
  "or",
  "to",
  "in",
  "on",
  "at",
  "by",
  "how",
  "why",
  "show",
  "tell",
  "give",
  "list",
  "all",
  "any",
  "does",
  "do",
  "did",
  "has",
  "have",
  "had",
  "with",
  "from",
  "there",
  "here",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "as",
  "be",
  "been",
  "about",
  "into",
  "over",
  "after",
  "before",
  "me",
  "please",
  "status",
  "record",
  "records",
  "project",
  "related",
  "relation",
  "latest",
  "approved",
  "approval",
  "drawing",
  "drawings",
  "revision",
  "holder",
  "holding",
  "held",
  "current",
  "still",
  "pending",
  "open",
  "overdue"
]);

export interface KeywordHit {
  record: ProjectRecord;
  score: number;
}

/**
 * Keyword fallback (Phase B2): score visible records against question words.
 * Used only when no deterministic intent matches; results are reported as
 * Inferred keyword matches, never as verified answers.
 */
export function keywordSearchAll(view: RegisterView, question: string): KeywordHit[] {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
  if (words.length === 0) return [];
  const hits: KeywordHit[] = [];
  for (const record of view.listRecords()) {
    let score = 0;
    const id = record.id.toLowerCase();
    const location = (record.location ?? "").toLowerCase();
    const status = record.status.toLowerCase();
    const detail = Object.values(record.fields).join(" ").toLowerCase();
    for (const word of words) {
      if (id.includes(word)) score += 4;
      if (location.includes(word)) score += 2;
      if (detail.includes(word)) score += 2;
      if (status.includes(word)) score += 1;
    }
    if (score > 0) hits.push({ record, score });
  }
  return hits.sort((a, b) => b.score - a.score);
}

/** Top-N keyword hits (bounded convenience over keywordSearchAll). */
export function keywordSearch(view: RegisterView, question: string, limit = 3): KeywordHit[] {
  return keywordSearchAll(view, question).slice(0, limit);
}
