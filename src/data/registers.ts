import type { DocumentSource } from "../lib/retrieval";
import type { ProjectRecord } from "../lib/types";
import wirCsv from "../../data/test-project/registers/WIR_Register.csv?raw";
import mirCsv from "../../data/test-project/registers/MIR_Register.csv?raw";
import ncrCsv from "../../data/test-project/registers/NCR_Register.csv?raw";
import rfiCsv from "../../data/test-project/registers/RFI_Register.csv?raw";
import drawingCsv from "../../data/test-project/registers/Drawing_Register.csv?raw";
import submittalCsv from "../../data/test-project/registers/Submittal_Register.csv?raw";

/**
 * Local project-knowledge store built ONLY from the synthetic CSVs under
 * data/test-project/. No external systems, no network, no AI APIs.
 *
 * The CSV files remain the single source of truth; this module normalizes
 * them into typed records at load time so retrieval/relationship logic can
 * later move to a database-backed DocumentSource without changing callers.
 */

export const PROJECT_ID = "qubators-demo";

/**
 * Raw CSV bundle feeding a ProjectStore.
 * The bundled synthetic files are the default; Phase C local-file
 * connectors build the same shape from user-picked files or folders so no
 * code downstream changes regardless of where the CSVs came from.
 */
export interface CsvBundle {
  wir: string;
  mir: string;
  ncr: string;
  rfi: string;
  drawing: string;
  submittal: string;
  /** Optional: mail/correspondence exports (absent in older bundles). */
  mail?: string;
}

const SYNTHETIC_BUNDLE: CsvBundle = {
  wir: wirCsv,
  mir: mirCsv,
  ncr: ncrCsv,
  rfi: rfiCsv,
  drawing: drawingCsv,
  submittal: submittalCsv,
  mail: ""
};

/**
 * RFC-4180 style row splitter: honours quoted cells (including embedded
 * commas, quotes and newlines). Shared by the CSV parser and the
 * multi-source merge so quoted newlines never corrupt row boundaries.
 */
export function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const pushCell = (): void => {
    row.push(cell.trim());
    cell = "";
  };
  const pushRow = (): void => {
    row.push(cell.trim());
    cell = "";
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i] ?? "";
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushCell();
      i += 1;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      pushRow();
      i += 1;
      if (ch === "\r" && text[i] === "\n") i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell !== "" || row.length > 0) pushRow();
  return rows;
}

/**
 * RFC-4180 style CSV parser built on splitCsvRows.
 * Cells are trimmed; fully-empty rows are dropped.
 */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows = splitCsvRows(text).filter((cells) => cells.some((cell) => cell !== ""));
  if (rows.length === 0) return [];
  const headers = (rows[0] ?? []).map((header) => header.trim());
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? "";
    });
    return record;
  });
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

/** "2026-09-18" -> "18 Sep 2026". Empty input returns "". */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (match === null) return iso;
  const month = MONTHS[Number(match[2] ?? "1") - 1] ?? "";
  return `${Number(match[3])} ${month} ${match[1]}`;
}

export interface WirRecord {
  id: string;
  revision: string;
  location: string;
  activity: string;
  submissionDate: string;
  status: string;
  holder: string;
  dueDate: string;
  relatedNcr: string;
  relatedDrawing: string;
  /** Optional: consultant review started / consultant-side status (real registers). */
  reviewStarted: string;
  consultantStatus: string;
}

export interface MirRecord {
  id: string;
  revision: string;
  location: string;
  material: string;
  description: string;
  submissionDate: string;
  status: string;
  holder: string;
  relatedDocument: string;
  reviewStarted: string;
  consultantStatus: string;
}

export interface NcrRecord {
  id: string;
  revision: string;
  location: string;
  subject: string;
  status: string;
  openedDate: string;
  relatedWir: string;
  relatedDrawing: string;
}

export interface RfiRecord {
  id: string;
  revision: string;
  location: string;
  subject: string;
  status: string;
  submittedDate: string;
  relatedDrawing: string;
  reviewStarted: string;
  consultantStatus: string;
}

export interface DrawingRecord {
  id: string;
  title: string;
  revision: string;
  status: string;
  issueDate: string;
  location: string;
  reviewStarted: string;
  consultantStatus: string;
}

export interface SubmittalRecord {
  id: string;
  location: string;
  subject: string;
  material: string;
  revision: string;
  status: string;
  submissionDate: string;
  relatedMir: string;
  relatedDocument: string;
  reviewStarted: string;
  consultantStatus: string;
}

export interface MailRecord {
  id: string;
  subject: string;
  date: string;
  sender: string;
  company: string;
  mailType: string;
  discipline: string;
  relatedMail: string;
  comments: string;
  status: string;
}

export interface WorkflowEvent {
  recordId: string;
  /** ISO date, or null when the date is not recorded in the available data. */
  date: string | null;
  event: string;
  detail: string;
  sourceRef: string;
}

/**
 * Synthetic workflow history for WIR-1842. The rejection/resubmission cycle is
 * documented in data/test-project/documents/PROJECT_NOTES.md (without dates or
 * reasons); the dated review events are the prototype's synthetic workflow
 * record. Anything not recorded is kept as explicitly unknown — never guessed.
 */
export const WIR_1842_HISTORY: WorkflowEvent[] = [
  {
    recordId: "WIR-1842",
    date: "2026-09-18",
    event: "Submitted",
    detail: "Submitted for consultant review (Villa 43, Ground Floor Ceiling Works).",
    sourceRef: "WIR Register · WIR-1842"
  },
  {
    recordId: "WIR-1842",
    date: null,
    event: "Rejected",
    detail:
      "Rejected in an earlier workflow event. The rejection date, reviewer comments and reason are not recorded in the available data.",
    sourceRef: "Project Notes · WIR-1842"
  },
  {
    recordId: "WIR-1842",
    date: null,
    event: "Resubmitted",
    detail:
      "Resubmitted for a further review cycle. The resubmission date is not recorded in the available data.",
    sourceRef: "Project Notes · WIR-1842"
  },
  {
    recordId: "WIR-1842",
    date: "2026-09-19",
    event: "Review started",
    detail: "Consultant QA started review of the current cycle.",
    sourceRef: "Workflow Record · WIR-1842"
  },
  {
    recordId: "WIR-1842",
    date: "2026-09-21",
    event: "Response due",
    detail: "Consultant response due.",
    sourceRef: "WIR Register · WIR-1842"
  }
];

const LINK_PLACEHOLDERS = new Set(["NA", "N/A", "-"]);

/**
 * Split a relationship cell into individual links. Real registers pack
 * several references into one cell (newlines, semicolons) and use NA/- for
 * none — both are handled without inventing links.
 */
export function splitLinks(value: string): string[] {
  return value
    .split(/[\n\r;,]+/)
    .map((part) => part.trim().replace(/[.\-/]+$/g, ""))
    .filter((part) => part !== "" && !LINK_PLACEHOLDERS.has(part.toUpperCase()));
}

/**
 * Latest revision wins for repeated ids (ties keep file order).
 * Real registers repeat document numbers across revisions; the id alone is
 * not unique. Non-mail records outrank mail rows (registers are authoritative
 * over correspondence); then highest revision string wins — documented,
 * deterministic.
 */
export function latestOf(records: ProjectRecord[]): ProjectRecord | undefined {
  const rank = (record: ProjectRecord): number => (record.kind === "Mail" ? 0 : 1);
  let best: ProjectRecord | undefined;
  for (const record of records) {
    if (best === undefined) {
      best = record;
      continue;
    }
    if (rank(record) !== rank(best)) {
      if (rank(record) > rank(best)) best = record;
      continue;
    }
    const candidate = record.fields["revision"] ?? "";
    const current = best.fields["revision"] ?? "";
    if (candidate >= current) best = record;
  }
  return best;
}

/**
 * Read view over the normalized registers.
 * ProjectStore is the full view; permission scoping (Phase A4) produces
 * filtered views of the same shape, so retrieval/response logic never
 * branches on users — it only sees the records a user may access.
 */
export interface RegisterView extends DocumentSource {
  readonly wirs: WirRecord[];
  readonly mirs: MirRecord[];
  readonly ncrs: NcrRecord[];
  readonly rfis: RfiRecord[];
  readonly drawings: DrawingRecord[];
  readonly submittals: SubmittalRecord[];
  readonly mails: MailRecord[];
}

export class ProjectStore implements RegisterView {
  readonly wirs: WirRecord[];
  readonly mirs: MirRecord[];
  readonly ncrs: NcrRecord[];
  readonly rfis: RfiRecord[];
  readonly drawings: DrawingRecord[];
  readonly submittals: SubmittalRecord[];
  readonly mails: MailRecord[];
  private readonly byId = new Map<string, ProjectRecord>();
  private readonly byBaseId = new Map<string, ProjectRecord[]>();

  constructor(bundle: CsvBundle = SYNTHETIC_BUNDLE, reference: ProjectRecord[] = []) {
    this.wirs = parseCsv(bundle.wir).map((row) => ({
      id: row["wir_id"] ?? "",
      revision: row["revision"] ?? "",
      location: row["location"] ?? "",
      activity: row["activity"] ?? "",
      submissionDate: row["submission_date"] ?? "",
      status: row["status"] ?? "",
      holder: row["current_holder"] ?? "",
      dueDate: row["due_date"] ?? "",
      relatedNcr: row["related_ncr"] ?? "",
      relatedDrawing: row["related_drawing"] ?? "",
      reviewStarted: row["review_started"] ?? "",
      consultantStatus: row["consultant_status"] ?? ""
    }));
    this.mirs = parseCsv(bundle.mir).map((row) => ({
      id: row["mir_id"] ?? "",
      revision: row["revision"] ?? "",
      location: row["location"] ?? "",
      material: row["material"] ?? "",
      description: row["description"] ?? "",
      submissionDate: row["submission_date"] ?? "",
      status: row["status"] ?? "",
      holder: row["current_holder"] ?? "",
      relatedDocument: row["related_document"] ?? "",
      reviewStarted: row["review_started"] ?? "",
      consultantStatus: row["consultant_status"] ?? ""
    }));
    this.ncrs = parseCsv(bundle.ncr).map((row) => ({
      id: row["ncr_id"] ?? "",
      revision: row["revision"] ?? "",
      location: row["location"] ?? "",
      subject: row["subject"] ?? "",
      status: row["status"] ?? "",
      openedDate: row["opened_date"] ?? "",
      relatedWir: row["related_wir"] ?? "",
      relatedDrawing: row["related_drawing"] ?? ""
    }));
    this.rfis = parseCsv(bundle.rfi).map((row) => ({
      id: row["rfi_id"] ?? "",
      revision: row["revision"] ?? "",
      location: row["location"] ?? "",
      subject: row["subject"] ?? "",
      status: row["status"] ?? "",
      submittedDate: row["submitted_date"] ?? "",
      relatedDrawing: row["related_drawing"] ?? "",
      reviewStarted: row["review_started"] ?? "",
      consultantStatus: row["consultant_status"] ?? ""
    }));
    this.drawings = parseCsv(bundle.drawing).map((row) => ({
      id: row["drawing_id"] ?? "",
      title: row["title"] ?? "",
      revision: row["revision"] ?? "",
      status: row["status"] ?? "",
      issueDate: row["issue_date"] ?? "",
      location: row["location"] ?? "",
      reviewStarted: row["review_started"] ?? "",
      consultantStatus: row["consultant_status"] ?? ""
    }));
    this.submittals = parseCsv(bundle.submittal).map((row) => ({
      id: row["submittal_id"] ?? "",
      location: row["location"] ?? "",
      subject: row["subject"] ?? "",
      material: row["material"] ?? "",
      revision: row["revision"] ?? "",
      status: row["status"] ?? "",
      submissionDate: row["submission_date"] ?? "",
      relatedMir: row["related_mir"] ?? "",
      relatedDocument: row["related_document"] ?? "",
      reviewStarted: row["review_started"] ?? "",
      consultantStatus: row["consultant_status"] ?? ""
    }));
    this.mails = parseCsv(bundle.mail ?? "").map((row) => ({
      id: row["mail_id"] ?? "",
      subject: row["subject"] ?? "",
      date: row["date"] ?? "",
      sender: row["sender"] ?? "",
      company: row["company"] ?? "",
      mailType: row["mail_type"] ?? "",
      discipline: row["discipline"] ?? "",
      relatedMail: row["related_mail"] ?? "",
      comments: row["comments"] ?? "",
      status: row["status"] ?? ""
    }));

    for (const wir of this.wirs) {
      this.register({
        kind: "WIR",
        id: wir.id,
        projectId: PROJECT_ID,
        status: wir.status,
        location: wir.location,
        sourceRef: `WIR Register · ${wir.id}`,
        relatedIds: [...splitLinks(wir.relatedNcr), ...splitLinks(wir.relatedDrawing)],
        fields: {
          activity: wir.activity,
          submissionDate: wir.submissionDate,
          holder: wir.holder,
          dueDate: wir.dueDate,
          revision: wir.revision,
          reviewStarted: wir.reviewStarted,
          consultantStatus: wir.consultantStatus
        }
      });
    }
    for (const mir of this.mirs) {
      this.register({
        kind: "MIR",
        id: mir.id,
        projectId: PROJECT_ID,
        status: mir.status,
        location: mir.location,
        sourceRef: `MIR Register · ${mir.id}`,
        relatedIds: splitLinks(mir.relatedDocument),
        fields: {
          material: mir.material,
          description: mir.description,
          submissionDate: mir.submissionDate,
          holder: mir.holder,
          revision: mir.revision,
          reviewStarted: mir.reviewStarted,
          consultantStatus: mir.consultantStatus
        }
      });
    }
    for (const ncr of this.ncrs) {
      this.register({
        kind: "NCR",
        id: ncr.id,
        projectId: PROJECT_ID,
        status: ncr.status,
        location: ncr.location,
        sourceRef: `NCR Register · ${ncr.id}`,
        relatedIds: [...splitLinks(ncr.relatedWir), ...splitLinks(ncr.relatedDrawing)],
        fields: { subject: ncr.subject, openedDate: ncr.openedDate, revision: ncr.revision }
      });
    }
    for (const rfi of this.rfis) {
      this.register({
        kind: "RFI",
        id: rfi.id,
        projectId: PROJECT_ID,
        status: rfi.status,
        location: rfi.location,
        sourceRef: `RFI Register · ${rfi.id}`,
        relatedIds: splitLinks(rfi.relatedDrawing),
        fields: {
          subject: rfi.subject,
          submittedDate: rfi.submittedDate,
          revision: rfi.revision,
          reviewStarted: rfi.reviewStarted,
          consultantStatus: rfi.consultantStatus
        }
      });
    }
    for (const drawing of this.drawings) {
      this.register({
        kind: "Drawing",
        id: drawing.id,
        projectId: PROJECT_ID,
        status: drawing.status,
        location: drawing.location,
        sourceRef: `Drawing Register · ${drawing.id}`,
        relatedIds: [],
        fields: {
          title: drawing.title,
          revision: drawing.revision,
          issueDate: drawing.issueDate,
          reviewStarted: drawing.reviewStarted,
          consultantStatus: drawing.consultantStatus
        }
      });
    }
    for (const submittal of this.submittals) {
      this.register({
        kind: "Submittal",
        id: submittal.id,
        projectId: PROJECT_ID,
        status: submittal.status,
        location: submittal.location,
        sourceRef: `Submittal Register · ${submittal.id}`,
        relatedIds: [...splitLinks(submittal.relatedMir), ...splitLinks(submittal.relatedDocument)],
        fields: {
          subject: submittal.subject,
          material: submittal.material,
          revision: submittal.revision,
          submissionDate: submittal.submissionDate,
          reviewStarted: submittal.reviewStarted,
          consultantStatus: submittal.consultantStatus
        }
      });
    }
    for (const mail of this.mails) {
      this.register({
        kind: "Mail",
        id: mail.id,
        projectId: PROJECT_ID,
        status: mail.status === "" ? mail.mailType : mail.status,
        location: "",
        sourceRef: `Mail · ${mail.id}`,
        relatedIds: splitLinks(mail.relatedMail),
        fields: {
          subject: mail.subject,
          date: mail.date,
          sender: mail.sender,
          company: mail.company,
          discipline: mail.discipline,
          comments: mail.comments,
          revision: ""
        }
      });
    }
    for (const ref of reference) {
      this.register(ref);
    }
  }

  private register(record: ProjectRecord): void {
    const revision = (record.fields["revision"] ?? "").trim().toUpperCase();
    const key = `${record.kind}‖${record.id.toUpperCase()}‖${revision}`;
    // Last row wins for identical kind+id+revision: registers list activity
    // chronologically, so the later row carries the newer state. Repeats are
    // still flagged by diagnostics (DUPLICATE_ID warning), never silently merged.
    this.byId.set(key, record);
    const base = record.id.toUpperCase();
    const family = this.byBaseId.get(base) ?? [];
    family.push(record);
    this.byBaseId.set(base, family);
  }

  listRecords(): ProjectRecord[] {
    return [...this.byId.values()];
  }

  getRecord(id: string): ProjectRecord | undefined {
    const key = id.trim().toUpperCase();
    const family = this.byBaseId.get(key) ?? [];
    // Exact composite keys cannot be addressed bare; family lookup always
    // applies so cross-kind duplicates never shadow register rows.
    return latestOf(family);
  }
}

/**
 * Reference rows (non-register tabular sheets) as search-only records.
 * They participate in keyword/descriptive search with a stable id and
 * source reference, but never in status answers, counts, timelines or
 * watchers — those read the typed arrays, which reference rows bypass.
 */
export function toReferenceRecords(
  tables: Array<{ file: string; sheet: string; headers: string[]; rows: string[][] }>
): ProjectRecord[] {
  const records: ProjectRecord[] = [];
  for (const table of tables) {
    table.rows.forEach((cells, index) => {
      const pairs: string[] = [];
      table.headers.forEach((header, column) => {
        const value = (cells[column] ?? "").trim();
        if (header !== "" && value !== "") pairs.push(`${header}: ${value}`);
      });
      if (pairs.length === 0) return;
      const snippet = pairs.join(" · ").slice(0, 220);
      records.push({
        kind: "Reference",
        id: `${table.file} :: ${table.sheet} #${index + 1}`,
        projectId: PROJECT_ID,
        status: "",
        location: "",
        sourceRef: `Table · ${table.file} :: ${table.sheet}`,
        relatedIds: [],
        fields: { snippet, revision: "" }
      });
    });
  }
  return records;
}

/** Shared singleton for the local prototype (single demo project). */
export const store = new ProjectStore();
