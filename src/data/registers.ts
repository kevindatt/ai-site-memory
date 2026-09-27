import type { DocumentSource } from "../lib/retrieval";
import type { ProjectRecord } from "../lib/types";
import wirCsv from "../../data/test-project/registers/WIR_Register.csv?raw";
import mirCsv from "../../data/test-project/registers/MIR_Register.csv?raw";
import ncrCsv from "../../data/test-project/registers/NCR_Register.csv?raw";
import rfiCsv from "../../data/test-project/registers/RFI_Register.csv?raw";
import drawingCsv from "../../data/test-project/registers/Drawing_Register.csv?raw";

/**
 * Local project-knowledge store built ONLY from the synthetic CSVs under
 * data/test-project/. No external systems, no network, no AI APIs.
 *
 * The CSV files remain the single source of truth; this module normalizes
 * them into typed records at load time so retrieval/relationship logic can
 * later move to a database-backed DocumentSource without changing callers.
 */

export const PROJECT_ID = "qubators-demo";

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const headers = (lines[0] ?? "").split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
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
  location: string;
  activity: string;
  submissionDate: string;
  status: string;
  holder: string;
  dueDate: string;
  relatedNcr: string;
  relatedDrawing: string;
}

export interface MirRecord {
  id: string;
  location: string;
  material: string;
  description: string;
  submissionDate: string;
  status: string;
  holder: string;
  relatedDocument: string;
}

export interface NcrRecord {
  id: string;
  location: string;
  subject: string;
  status: string;
  openedDate: string;
  relatedWir: string;
  relatedDrawing: string;
}

export interface RfiRecord {
  id: string;
  location: string;
  subject: string;
  status: string;
  submittedDate: string;
  relatedDrawing: string;
}

export interface DrawingRecord {
  id: string;
  title: string;
  revision: string;
  status: string;
  issueDate: string;
  location: string;
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

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export class ProjectStore implements DocumentSource {
  readonly wirs: WirRecord[];
  readonly mirs: MirRecord[];
  readonly ncrs: NcrRecord[];
  readonly rfis: RfiRecord[];
  readonly drawings: DrawingRecord[];
  private readonly byId = new Map<string, ProjectRecord>();

  constructor() {
    this.wirs = parseCsv(wirCsv).map((row) => ({
      id: row["wir_id"] ?? "",
      location: row["location"] ?? "",
      activity: row["activity"] ?? "",
      submissionDate: row["submission_date"] ?? "",
      status: row["status"] ?? "",
      holder: row["current_holder"] ?? "",
      dueDate: row["due_date"] ?? "",
      relatedNcr: row["related_ncr"] ?? "",
      relatedDrawing: row["related_drawing"] ?? ""
    }));
    this.mirs = parseCsv(mirCsv).map((row) => ({
      id: row["mir_id"] ?? "",
      location: row["location"] ?? "",
      material: row["material"] ?? "",
      description: row["description"] ?? "",
      submissionDate: row["submission_date"] ?? "",
      status: row["status"] ?? "",
      holder: row["current_holder"] ?? "",
      relatedDocument: row["related_document"] ?? ""
    }));
    this.ncrs = parseCsv(ncrCsv).map((row) => ({
      id: row["ncr_id"] ?? "",
      location: row["location"] ?? "",
      subject: row["subject"] ?? "",
      status: row["status"] ?? "",
      openedDate: row["opened_date"] ?? "",
      relatedWir: row["related_wir"] ?? "",
      relatedDrawing: row["related_drawing"] ?? ""
    }));
    this.rfis = parseCsv(rfiCsv).map((row) => ({
      id: row["rfi_id"] ?? "",
      location: row["location"] ?? "",
      subject: row["subject"] ?? "",
      status: row["status"] ?? "",
      submittedDate: row["submitted_date"] ?? "",
      relatedDrawing: row["related_drawing"] ?? ""
    }));
    this.drawings = parseCsv(drawingCsv).map((row) => ({
      id: row["drawing_id"] ?? "",
      title: row["title"] ?? "",
      revision: row["revision"] ?? "",
      status: row["status"] ?? "",
      issueDate: row["issue_date"] ?? "",
      location: row["location"] ?? ""
    }));

    for (const wir of this.wirs) {
      this.register({
        kind: "WIR",
        id: wir.id,
        projectId: PROJECT_ID,
        status: wir.status,
        location: wir.location,
        sourceRef: `WIR Register · ${wir.id}`,
        relatedIds: [wir.relatedNcr, wir.relatedDrawing].filter(nonEmpty),
        fields: {
          activity: wir.activity,
          submissionDate: wir.submissionDate,
          holder: wir.holder,
          dueDate: wir.dueDate
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
        relatedIds: [mir.relatedDocument].filter(nonEmpty),
        fields: {
          material: mir.material,
          description: mir.description,
          submissionDate: mir.submissionDate,
          holder: mir.holder
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
        relatedIds: [ncr.relatedWir, ncr.relatedDrawing].filter(nonEmpty),
        fields: { subject: ncr.subject, openedDate: ncr.openedDate }
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
        relatedIds: [rfi.relatedDrawing].filter(nonEmpty),
        fields: { subject: rfi.subject, submittedDate: rfi.submittedDate }
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
          issueDate: drawing.issueDate
        }
      });
    }
  }

  private register(record: ProjectRecord): void {
    this.byId.set(record.id.toUpperCase(), record);
  }

  listRecords(): ProjectRecord[] {
    return [...this.byId.values()];
  }

  getRecord(id: string): ProjectRecord | undefined {
    return this.byId.get(id.trim().toUpperCase());
  }
}

/** Shared singleton for the local prototype (single demo project). */
export const store = new ProjectStore();
