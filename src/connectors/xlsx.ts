import * as XLSX from "xlsx";
import type { CsvBundle } from "../data/registers";
import { splitCsvRows } from "../data/registers";
import type { FolderScan, RegisterKey } from "./localFiles";
import { matchAllCsv } from "./localFiles";

/**
 * Excel cleaning step (Phase C2, no enterprise APIs).
 * Takes the user's .xlsx workbooks as-is and normalizes them into the same
 * CsvBundle the ProjectStore consumes:
 *  - the header row is DETECTED (title/meta rows are skipped) by scoring
 *    candidate rows against each register's required columns;
 *  - header wording variants are mapped to canonical columns, with
 *    positional rules: the first status-like column wins `status`, later
 *    ones become `consultant_status`; the first submit-like column wins the
 *    submission date, consultant/engineer ones become `review_started`;
 *  - location is COMPOSED from zone/venue/level parts (documented);
 *  - statuses are kept VERBATIM — never normalized or invented;
 *  - values are trimmed, empty rows dropped, Excel serial dates converted;
 *  - unmapped columns and missing required columns are REPORTED, never
 *    silently dropped or invented.
 * Shared by the browser file picker (ArrayBuffer) and the node ingest
 * script (file bytes): no network, everything stays on the user's computer.
 */

export type XlsxRegisterKey = RegisterKey;

const REGISTER_KEYS: XlsxRegisterKey[] = ["wir", "mir", "ncr", "rfi", "drawing", "submittal", "mail"];

/** Canonical column order per register — identical to the CSV templates. */
const CANONICAL_ORDER: Record<XlsxRegisterKey, string[]> = {
  wir: [
    "wir_id",
    "revision",
    "project",
    "location",
    "activity",
    "submission_date",
    "status",
    "current_holder",
    "due_date",
    "related_ncr",
    "related_drawing",
    "review_started",
    "consultant_status"
  ],
  mir: [
    "mir_id",
    "revision",
    "project",
    "location",
    "material",
    "description",
    "submission_date",
    "status",
    "current_holder",
    "related_document",
    "review_started",
    "consultant_status"
  ],
  ncr: ["ncr_id", "revision", "project", "location", "subject", "status", "opened_date", "related_wir", "related_drawing"],
  rfi: ["rfi_id", "revision", "project", "location", "subject", "status", "submitted_date", "related_drawing", "review_started", "consultant_status"],
  drawing: ["drawing_id", "project", "title", "revision", "status", "issue_date", "location", "review_started", "consultant_status"],
  submittal: [
    "submittal_id",
    "project",
    "location",
    "subject",
    "material",
    "revision",
    "status",
    "submission_date",
    "related_mir",
    "related_document",
    "review_started",
    "consultant_status"
  ],
  mail: ["mail_id", "subject", "date", "sender", "company", "mail_type", "discipline", "related_mail", "comments", "status"]
};

/** Columns that must map, otherwise the sheet cannot feed its register. */
const REQUIRED: Record<XlsxRegisterKey, string[]> = {
  wir: ["wir_id", "status", "location", "submission_date"],
  mir: ["mir_id", "status", "location", "material", "submission_date"],
  ncr: ["ncr_id", "status", "subject", "opened_date"],
  rfi: ["rfi_id", "status", "subject"],
  drawing: ["drawing_id", "title", "revision", "status"],
  submittal: ["submittal_id", "status", "subject"],
  mail: ["mail_id", "subject"]
};

/** Canonicals holding record ids (trailing dots/dashes stripped: Aconex refs vary). */
const ID_COLUMNS = new Set([
  "wir_id",
  "mir_id",
  "ncr_id",
  "rfi_id",
  "drawing_id",
  "submittal_id",
  "mail_id"
]);
const DATE_COLUMNS = new Set([
  "submission_date",
  "submitted_date",
  "due_date",
  "opened_date",
  "issue_date",
  "review_started",
  "date"
]);

/** Accepted header variants, normalized (lowercased, non-alphanumeric stripped). */
const ALIASES: Record<XlsxRegisterKey, Record<string, string[]>> = {
  wir: {
    wir_id: ["wirid", "wirno", "wirnumber", "mailno"],
    project: ["project", "projectname"],
    location: ["location"],
    activity: ["activity", "subject", "workdescription", "scope", "works"],
    submission_date: ["submissiondate", "datesubmission"],
    status: ["alecstatus"],
    current_holder: ["currentholder", "holder", "with", "assignedto", "holdername", "actionby"],
    due_date: ["duedate", "due", "datedue", "requiredby", "targetdate"],
    related_ncr: ["relatedncr", "ncrref", "linkncr"],
    related_drawing: ["relateddrawing", "drawingref", "linkdrawing"],
    review_started: ["submissiondatetoconsultant"],
    consultant_status: ["dewanstatus"]
  },
  mir: {
    mir_id: ["mirid", "mirno", "mirnumber", "mailno"],
    project: ["project", "projectname"],
    location: ["location"],
    material: ["material", "materialname", "materialsupplied"],
    description: ["description", "desc", "materialdescription", "details", "subject"],
    submission_date: ["submissiondate", "datesubmission"],
    status: ["alecstatus"],
    current_holder: ["currentholder", "holder", "with", "assignedto"],
    related_document: ["relateddocument", "docref", "docno", "documentno", "attachment"],
    review_started: ["submissiondatetoconsultant"],
    consultant_status: []
  },
  ncr: {
    ncr_id: ["ncrid", "ncrno", "ncrnumber", "ncrreferenceno"],
    project: ["project", "projectname"],
    location: ["location"],
    subject: ["subject", "title", "defect", "defectdescription"],
    status: ["approvalstatus"],
    opened_date: ["openeddate", "dateopened", "receiveddate"],
    related_wir: ["relatedwir", "wirref", "linkwir"],
    related_drawing: ["relateddrawing", "drawingref"]
  },
  rfi: {
    rfi_id: ["documentreferencenumber", "rfiid", "rfino", "rfinumber"],
    project: ["project", "projectname"],
    location: ["location"],
    subject: ["subject", "title", "query"],
    status: ["alecstatus"],
    submitted_date: ["datesubmittedtoalec"],
    related_drawing: ["referencedifcdrawing"],
    review_started: [],
    consultant_status: []
  },
  drawing: {
    drawing_id: ["drawingid", "drawingno", "drawingnumber", "dwgno", "documentreferencenumber"],
    project: ["project", "projectname"],
    title: ["title", "drawingtitle", "name"],
    revision: ["revision", "rev"],
    status: ["alecstatus"],
    issue_date: [],
    location: ["location"],
    review_started: [],
    consultant_status: []
  },
  submittal: {
    submittal_id: ["submittalid", "subid", "subno", "submittalno", "documentreferencenumber"],
    project: ["project", "projectname"],
    location: ["location"],
    subject: ["subject", "title", "materialdescription"],
    material: ["material", "materialname", "materialsupplied"],
    revision: ["revision", "rev"],
    status: ["alecstatus"],
    submission_date: ["datesubmittedtoalec"],
    related_mir: ["relatedmir", "mirref"],
    related_document: ["relateddocument", "docref", "attachment"],
    review_started: [],
    consultant_status: []
  },
  mail: {
    mail_id: ["referencenumber", "mailnumber", "number"],
    subject: ["subject"],
    date: ["date", "sentdate", "created", "maildate"],
    sender: ["from", "sender", "author", "fromname"],
    company: ["fromorganization", "company", "organization"],
    mail_type: ["type", "mailtype"],
    discipline: ["maildiscipline", "discipline"],
    related_mail: [],
    comments: ["comments", "inspectioncomments", "remarks", "inspectionremarks"],
    status: ["status"]
  }
};

/**
 * Second-choice targets: when the explicit alias is already taken by an
 * earlier column, these headers fall back here instead of being dropped.
 * ("Mail No" is the id — unless "Reference Number" already claimed it, in
 * which case it is the in-reply-to reference.)
 */
const SECONDARY: Partial<Record<XlsxRegisterKey, Record<string, string>>> = {
  mail: { mailno: "related_mail" }
};

export interface NormalizedSheet {
  file: string;
  sheet: string;
  register: XlsxRegisterKey | null;
  /** Normalized CSV text, or "" when the sheet was skipped (see notes). */
  csv: string;
  notes: string[];
  /** Searchable reference table for sheets that match no register. */
  table?: ReferenceTable;
}

/**
 * A tabular sheet that is not a register (e.g. a procurement schedule):
 * kept as keyword-searchable reference rows, never as status answers.
 */
export interface ReferenceTable {
  file: string;
  sheet: string;
  headers: string[];
  rows: string[][];
}

const TABLE_SKIP_SHEETS = ["summary", "legend", "toc", "contents", "cover"];
const TABLE_MAX_ROWS = 500;
const TABLE_MAX_COLS = 20;

/** Build a reference table from a non-register sheet, or null. */
export function buildReferenceTable(
  fileName: string,
  sheetName: string,
  rows: unknown[][]
): ReferenceTable | null {
  if (TABLE_SKIP_SHEETS.some((skip) => sheetName.toLowerCase().includes(skip))) return null;
  const firstIndex = rows.findIndex(
    (row) =>
      ((row ?? []) as unknown[]).slice(0, TABLE_MAX_COLS).filter((cell) => cleanValue(cell) !== "").length >= 3
  );
  if (firstIndex < 0) return null;
  const first = (rows[firstIndex] ?? []) as unknown[];
  const headers = first.slice(0, TABLE_MAX_COLS).map((cell) => cleanValue(cell));
  const data = rows
    .slice(firstIndex + 1)
    .map((row) => ((row ?? []) as unknown[]).slice(0, TABLE_MAX_COLS).map((cell) => cleanValue(cell)))
    .filter((cells) => cells.some((cell) => cell !== ""))
    .slice(0, TABLE_MAX_ROWS);
  if (data.length < 2) return null;
  return { file: fileName, sheet: sheetName, headers, rows: data };
}

function normalizeKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function detectRegister(sheetName: string, fileName: string): XlsxRegisterKey | null {
  const text = `${fileName} ${sheetName}`.toLowerCase();
  // "submittal" outranks "drawing": a "Shop Drawing Submittal" log is a
  // submittal-style register, not a drawing revision list.
  const ordered: XlsxRegisterKey[] = ["mail", "wir", "mir", "ncr", "rfi", "submittal", "drawing"];
  for (const key of ordered) {
    if (text.includes(key)) return key;
  }
  return null;
}

function cleanValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value).trim();
}

/** Excel serial day (1900 system) -> YYYY-MM-DD, or null when out of range. */
export function excelSerialToDate(serial: number): string | null {
  if (!Number.isInteger(serial) || serial < 20000 || serial > 80000) return null;
  const millis = Date.UTC(1899, 11, 30) + serial * 86400000;
  const date = new Date(millis);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const MONTH_ABBR: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  sept: "09",
  oct: "10",
  nov: "11",
  dec: "12"
};

/**
 * Normalize unambiguous date strings to YYYY-MM-DD; ambiguous numeric dates
 * default to DD/MM (day-first), the Aconex-export convention used by local
 * files — always reported in the import notes, never silently assumed.
 * Pass dayFirst=false to leave ambiguous formats untouched instead.
 */
export function normalizeDateString(value: string, dayFirst = true): string {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const dmyText = /^(\d{1,2})-([A-Za-z]+)-(\d{4})$/.exec(text);
  if (dmyText !== null) {
    const month = MONTH_ABBR[(dmyText[2] ?? "").toLowerCase()];
    if (month === undefined) return value;
    return `${dmyText[3]}-${month}-${(dmyText[1] ?? "").padStart(2, "0")}`;
  }
  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (slashed !== null) {
    const first = Number(slashed[1]);
    const second = Number(slashed[2]);
    if (first > 12 && second <= 12) {
      return `${slashed[3]}-${String(second).padStart(2, "0")}-${String(first).padStart(2, "0")}`;
    }
    if (second > 12 && first <= 12) {
      return `${slashed[3]}-${String(first).padStart(2, "0")}-${String(second).padStart(2, "0")}`;
    }
    if (dayFirst && first >= 1 && first <= 12 && second >= 1 && second <= 12) {
      return `${slashed[3]}-${String(second).padStart(2, "0")}-${String(first).padStart(2, "0")}`;
    }
  }
  return value;
}

function escapeCsvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function isStatusLike(key: string): boolean {
  return key.includes("status");
}

function isSubmitLike(key: string): boolean {
  return key.includes("submit") || key.includes("submission");
}

function isIdLike(key: string): boolean {
  if (key.includes("alec") || key.includes("transmittal") || key.includes("reply")) return false;
  return (
    key.includes("mail") ||
    key.includes("referenceno") ||
    key.includes("docref") ||
    key.includes("documentreference")
  );
}

function isDueLike(key: string): boolean {
  return key.includes("due");
}

function isLocationPart(key: string): boolean {
  return (
    key.includes("location") ||
    key.includes("zone") ||
    key.includes("venue") ||
    key.includes("level") ||
    key.includes("area")
  );
}

/** First-cell values that mark a repeated header row embedded mid-sheet. */
const HEADER_ROW_MARKERS = new Set([
  "mailno",
  "wirid",
  "mirid",
  "ncrid",
  "rfiid",
  "drawingid",
  "submittalid",
  "documentreferencenumber",
  "slno"
]);

function isConsultantish(key: string): boolean {
  return key.includes("consultant") || key.includes("dewan") || key.includes("approval") || key.includes("engineer");
}

interface ColumnMapping {
  /** canonical -> source column index */
  canonicalIndex: Map<string, number>;
  /** source column indexes consumed as location parts, in file order */
  locationParts: number[];
  dropped: string[];
  /** id came from an explicit alias (strong) rather than a generic rule */
  idStrong: boolean;
}

/** Map one header row onto a register. First match wins per canonical. */
function mapHeader(register: XlsxRegisterKey, header: unknown[]): ColumnMapping {
  const order = CANONICAL_ORDER[register];
  const aliases = ALIASES[register];
  const canonicalIndex = new Map<string, number>();
  const idCanonical =
    register === "wir"
      ? "wir_id"
      : register === "mir"
        ? "mir_id"
        : register === "ncr"
          ? "ncr_id"
          : register === "rfi"
            ? "rfi_id"
            : register === "drawing"
              ? "drawing_id"
              : "submittal_id";
  const mapping: ColumnMapping = { canonicalIndex, locationParts: [], dropped: [], idStrong: false };
  const { locationParts, dropped } = mapping;
  const supports = (column: string): boolean => order.includes(column);

  header.forEach((cell, index) => {
    const key = normalizeKey(cleanValue(cell));
    if (key === "") return;
    // 1. Explicit: canonical name or listed alias.
    const explicit = order.find(
      (column) => normalizeKey(column) === key || (aliases[column] ?? []).includes(key)
    );
    if (explicit !== undefined && !canonicalIndex.has(explicit)) {
      canonicalIndex.set(explicit, index);
      if (explicit === idCanonical) mapping.idStrong = true;
      return;
    }
    // 1b. Second-choice target when the id is already taken by an earlier
    // column (e.g. "Mail No" is the id — unless "Reference Number" claimed
    // it first, in which case it is the in-reply-to reference).
    const secondary = SECONDARY[register]?.[key];
    if (
      secondary !== undefined &&
      !canonicalIndex.has(secondary) &&
      canonicalIndex.has(idCanonical)
    ) {
      canonicalIndex.set(secondary, index);
      return;
    }
    // 2. Location parts compose the location (handled after the loop).
    if (isLocationPart(key)) {
      locationParts.push(index);
      return;
    }
    // 3. Generic rules, first match wins per canonical.
    if (isStatusLike(key)) {
      if (!canonicalIndex.has("status") && supports("status")) {
        canonicalIndex.set("status", index);
        return;
      }
      if (!canonicalIndex.has("consultant_status") && supports("consultant_status")) {
        canonicalIndex.set("consultant_status", index);
        return;
      }
      dropped.push(cleanValue(cell));
      return;
    }
    if (isSubmitLike(key) && !key.includes("planned")) {
      const submitCanonical =
        register === "rfi" ? "submitted_date" : register === "drawing" ? "issue_date" : "submission_date";
      if (!canonicalIndex.has(submitCanonical) && supports(submitCanonical)) {
        canonicalIndex.set(submitCanonical, index);
        return;
      }
      if (
        isConsultantish(key) &&
        !canonicalIndex.has("review_started") &&
        supports("review_started")
      ) {
        canonicalIndex.set("review_started", index);
        return;
      }
      dropped.push(cleanValue(cell));
      return;
    }
    if (isIdLike(key)) {
      const idCanonical =
        register === "wir"
          ? "wir_id"
          : register === "mir"
            ? "mir_id"
            : register === "ncr"
              ? "ncr_id"
              : register === "rfi"
                ? "rfi_id"
                : register === "drawing"
                  ? "drawing_id"
                  : "submittal_id";
      if (!canonicalIndex.has(idCanonical)) {
        canonicalIndex.set(idCanonical, index);
        return;
      }
      dropped.push(cleanValue(cell));
      return;
    }
    if (key === "subject" || key === "title") {
      const subjectCanonical =
        register === "drawing" ? "title" : supports("subject") ? "subject" : undefined;
      if (subjectCanonical !== undefined && !canonicalIndex.has(subjectCanonical)) {
        canonicalIndex.set(subjectCanonical, index);
        return;
      }
      dropped.push(cleanValue(cell));
      return;
    }
    if (isDueLike(key)) {
      if (!canonicalIndex.has("due_date") && supports("due_date")) {
        canonicalIndex.set("due_date", index);
        return;
      }
      dropped.push(cleanValue(cell));
      return;
    }
    if ((key === "rev" || key === "revision") && supports("revision") && !canonicalIndex.has("revision")) {
      canonicalIndex.set("revision", index);
      return;
    }
    dropped.push(cleanValue(cell));
  });

  // Real MIR registers often carry no material column: the subject names it.
  if (
    register === "mir" &&
    !canonicalIndex.has("material") &&
    canonicalIndex.has("description")
  ) {
    canonicalIndex.set("material", canonicalIndex.get("description") as number);
  }
  return mapping;
}

/**
 * Required canonicals a mapping satisfies. A composed location (zone/venue/
 * level parts) counts even without a literal Location column.
 */
function requiredCovered(register: XlsxRegisterKey, mapping: ColumnMapping): string[] {
  return REQUIRED[register].filter((column) => {
    if (mapping.canonicalIndex.has(column)) return true;
    if (column === "location") return mapping.locationParts.length > 0;
    return false;
  });
}

const MAX_HEADER_SCAN_ROWS = 10;

export function normalizeSheet(
  fileName: string,
  sheetName: string,
  rows: unknown[][]
): NormalizedSheet {
  if (rows.length === 0) {
    return {
      file: fileName,
      sheet: sheetName,
      register: null,
      csv: "",
      notes: [`${fileName} :: ${sheetName}: no rows found; skipped.`]
    };
  }
  const nameHint = detectRegister(sheetName, fileName);
  // Score by FRACTION of required columns covered (registers need different
  // counts), then by total mapped columns; the filename hint breaks ties.
  const candidates = REGISTER_KEYS.map((register) => {
    let bestRow = 0;
    let bestFraction = -1;
    let bestMapped = -1;
    let bestIdStrong = false;
    rows.slice(0, MAX_HEADER_SCAN_ROWS).forEach((row, index) => {
      const cells = (row ?? []) as unknown[];
      if (cells.every((cell) => cleanValue(cell) === "")) return;
      const mapping = mapHeader(register, cells);
      const fraction = requiredCovered(register, mapping).length / REQUIRED[register].length;
      if (
        fraction > bestFraction ||
        (fraction === bestFraction && mapping.canonicalIndex.size > bestMapped)
      ) {
        bestFraction = fraction;
        bestMapped = mapping.canonicalIndex.size;
        bestIdStrong = mapping.idStrong;
        bestRow = index;
      }
    });
    return { register, rowIndex: bestRow, fraction: bestFraction, idStrong: bestIdStrong };
  }).sort((a, b) => {
    if (b.fraction !== a.fraction) return b.fraction - a.fraction;
    // An explicitly named id outranks a generically matched one: a "Shop
    // Drawing" sheet also parses as WIR-shaped, but its document reference
    // is explicitly a drawing number.
    if (a.idStrong !== b.idStrong) return a.idStrong ? -1 : 1;
    // Filename hint outranks schema size: a "Material Submittal" sheet that
    // also parses as WIR-shaped must still resolve to submittal.
    if (nameHint !== null) {
      if (a.register === nameHint) return -1;
      if (b.register === nameHint) return 1;
    }
    return 0;
  });
  const best = candidates[0];
  if (best === undefined || best.fraction <= 0) {
    return {
      file: fileName,
      sheet: sheetName,
      register: null,
      csv: "",
      notes: [`${fileName} :: ${sheetName}: no register header detected; skipped.`],
      table: buildReferenceTable(fileName, sheetName, rows) ?? undefined
    };
  }
  const register = best.register;
  const header = (rows[best.rowIndex] ?? []) as unknown[];
  const emitted = emitCanonicalCsv(
    register,
    `${fileName} :: ${sheetName}`,
    header,
    rows.slice(best.rowIndex + 1)
  );
  if (!emitted.ok) {
    return {
      file: fileName,
      sheet: sheetName,
      register: null,
      csv: "",
      notes: [
        `${fileName} :: ${sheetName}: best match is ${register} (header row ${best.rowIndex + 1}) but ${emitted.problem}; skipped.`
      ],
      table: buildReferenceTable(fileName, sheetName, rows) ?? undefined
    };
  }
  const notes: string[] = [];
  if (best.rowIndex > 0) {
    notes.push(`${fileName} :: ${sheetName}: header detected on row ${best.rowIndex + 1}; ${best.rowIndex} title/meta row(s) skipped.`);
  }
  notes.push(...emitted.notes);
  return {
    file: fileName,
    sheet: sheetName,
    register,
    csv: [emitted.header, ...emitted.dataLines].join("\n"),
    notes
  };
}

export interface EmittedTable {
  header: string;
  dataLines: string[];
  notes: string[];
  ok: boolean;
  problem?: string;
}

/**
 * Emit canonical CSV lines for one register from a mapped header + data rows.
 * Shared by workbook sheets and explicit user CSVs so multi-source merges
 * never misalign columns: every source is re-emitted in canonical order.
 */
export function emitCanonicalCsv(
  register: XlsxRegisterKey,
  label: string,
  header: unknown[],
  dataRows: unknown[][]
): EmittedTable {
  const mapping = mapHeader(register, header);
  // Real MIR registers often carry no material column: the subject names it.
  let materialFromSubject = false;
  if (
    register === "mir" &&
    !mapping.canonicalIndex.has("material") &&
    mapping.canonicalIndex.has("description")
  ) {
    mapping.canonicalIndex.set("material", mapping.canonicalIndex.get("description") as number);
    materialFromSubject = true;
  }
  const missingRequired = REQUIRED[register].filter(
    (column) => !requiredCovered(register, mapping).includes(column)
  );
  if (missingRequired.length > 0) {
    return {
      header: "",
      dataLines: [],
      notes: [],
      ok: false,
      problem: `required column(s) not found: ${missingRequired.join(", ")}`
    };
  }
  const order = CANONICAL_ORDER[register];
  const notes: string[] = [];
  if (materialFromSubject) {
    notes.push(`${label}: no material column; using the subject as material.`);
  }
  for (const dropped of mapping.dropped) {
    notes.push(`${label}: column "${dropped}" has no mapping and was dropped.`);
  }
  const locationCol = order.includes("location") ? mapping.canonicalIndex.get("location") : undefined;
  let serialDates = 0;
  let stringDates = 0;
  let skippedNoId = 0;
  const dataLines: string[] = [];
  for (const row of dataRows) {
    const cells = (row ?? []) as unknown[];
    if (cells.every((cell) => cleanValue(cell) === "")) continue;
    const values = order.map((column) => {
      if (column === "location") {
        const parts: string[] = [];
        if (locationCol !== undefined) {
          const direct = cleanValue(cells[locationCol]);
          if (direct !== "") parts.push(direct);
        }
        for (const partIndex of mapping.locationParts) {
          if (partIndex === locationCol) continue;
          const part = cleanValue(cells[partIndex]);
          if (part !== "" && !parts.includes(part)) parts.push(part);
        }
        return parts.join(" · ");
      }
      const sourceIndex = mapping.canonicalIndex.get(column);
      if (sourceIndex === undefined) return "";
      const raw = cells[sourceIndex];
      if (typeof raw === "number" && DATE_COLUMNS.has(column)) {
        const converted = excelSerialToDate(raw);
        if (converted !== null) {
          serialDates += 1;
          return converted;
        }
      }
      const cleaned = cleanValue(raw);
      if (ID_COLUMNS.has(column) && cleaned !== "") {
        return cleaned.replace(/[.\-/]+$/g, "");
      }
      if (typeof raw === "string" && DATE_COLUMNS.has(column)) {
        const normalized = normalizeDateString(cleaned);
        if (normalized !== cleaned) stringDates += 1;
        return normalized;
      }
      return cleaned;
    });
    // Skip rows with no id (section sub-headers), id-less text rows such as
    // section titles (real document numbers always contain digits), and
    // repeated header rows embedded mid-sheet.
    if ((values[0] ?? "") === "") continue;
    if (!/\d/.test(values[0] ?? "")) {
      skippedNoId += 1;
      continue;
    }
    if (HEADER_ROW_MARKERS.has(normalizeKey(values[0] ?? ""))) continue;
    dataLines.push(values.map(escapeCsvCell).join(","));
  }
  if (skippedNoId > 0) {
    notes.push(`${label}: skipped ${skippedNoId} row(s) without document numbers (section headers).`);
  }
  if (serialDates > 0) {
    notes.push(`${label}: converted ${serialDates} Excel serial date(s) to YYYY-MM-DD.`);
  }
  if (stringDates > 0) {
    notes.push(`${label}: normalized ${stringDates} date string(s) to YYYY-MM-DD (ambiguous DD/MM assumed day-first, per Aconex-export convention).`);
  }
  return { header: order.map(escapeCsvCell).join(","), dataLines, notes, ok: true };
}

/**
 * Normalize an explicit user CSV through the same mapping (headers may vary
 * or arrive in any order) so it merges safely with workbook output.
 */
export function csvToCanonical(
  register: XlsxRegisterKey,
  label: string,
  text: string
): EmittedTable {
  const rows = splitCsvRows(text);
  if (rows.length === 0) {
    return { header: "", dataLines: [], notes: [], ok: false, problem: "file is empty" };
  }
  return emitCanonicalCsv(register, label, rows[0] as unknown[], rows.slice(1));
}

export interface WorkbookResult {
  sheets: NormalizedSheet[];
  notes: string[];
}

export function parseWorkbook(data: Uint8Array | ArrayBuffer, fileName: string): WorkbookResult {
  let workbook;
  try {
    workbook = XLSX.read(data, { type: "array", cellDates: true });
  } catch {
    return { sheets: [], notes: [`${fileName}: could not be parsed as a workbook.`] };
  }
  const sheets = workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    if (worksheet === undefined) {
      return { file: fileName, sheet: name, register: null, csv: "", notes: [`${fileName} :: ${name}: empty sheet; skipped.`] };
    }
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: true,
      blankrows: false
    }) as unknown[][];
    return normalizeSheet(fileName, name, rows);
  });
  return { sheets, notes: [] };
}

/**
 * Merge explicit CSVs with normalized workbook sheets into one bundle per
 * register. Same-register sources CONCATENATE (e.g. three drawing sheets);
 * every source is re-emitted in canonical order first, so differing headers
 * can never misalign columns. Repeats across sources surface as duplicate
 * warnings in diagnostics rather than silent overwrites.
 */
export function mergeSources(
  scan: FolderScan,
  sheets: NormalizedSheet[]
): { bundle: CsvBundle | null; missing: RegisterKey[]; notes: string[]; tables: ReferenceTable[] } {
  const notes: string[] = [];
  const tables: ReferenceTable[] = [];
  for (const sheet of sheets) {
    notes.push(...sheet.notes);
    if (sheet.table !== undefined) {
      tables.push(sheet.table);
      notes.push(`${sheet.file} :: ${sheet.sheet}: kept as a searchable reference table (${sheet.table.rows.length} rows).`);
    }
  }
  const partial: Partial<CsvBundle> = {};
  const missing: RegisterKey[] = [];
  for (const key of REGISTER_KEYS) {
    const chunks: string[][] = [];
    let sources = 0;
    for (const { name, text } of matchAllCsv(scan, key)) {
      const converted = csvToCanonical(key, name, text);
      notes.push(...converted.notes);
      if (!converted.ok) {
        notes.push(`${name}: skipped as ${key} (${converted.problem ?? "unusable"}).`);
        continue;
      }
      sources += 1;
      chunks.push(converted.dataLines);
    }
    for (const sheet of sheets) {
      if (sheet.register !== key || sheet.csv === "") continue;
      sources += 1;
      // Re-parse our own emission (RFC-aware) so quoted embedded newlines
      // survive the merge instead of splitting rows.
      chunks.push(splitCsvRows(sheet.csv).slice(1).map((cells) => cells.map(escapeCsvCell).join(",")));
    }
    if (sources === 0) {
      // Mail is optional: no mail source is a valid bundle without it.
      if (key !== "mail") missing.push(key);
      continue;
    }
    if (sources > 1) {
      notes.push(`Combined ${sources} sources for ${key}; repeats are reported by diagnostics.`);
    }
    partial[key] = [CANONICAL_ORDER[key].map(escapeCsvCell).join(","), ...chunks.flat()].join("\n");
  }
  // Partial loads are legitimate (e.g. one workbook picked on a phone):
  // succeed whenever at least one register resolved; missing kinds stay
  // empty and answers say cannot-verify for them (diagnostics warns).
  const resolved = REGISTER_KEYS.filter((key) => partial[key] !== undefined);
  if (resolved.length === 0) return { bundle: null, missing, notes, tables };
  return {
    bundle: {
      wir: partial.wir ?? "",
      mir: partial.mir ?? "",
      ncr: partial.ncr ?? "",
      rfi: partial.rfi ?? "",
      drawing: partial.drawing ?? "",
      submittal: partial.submittal ?? "",
      mail: partial.mail
    },
    missing,
    notes,
    tables
  };
}

/** Test helper: build an in-memory workbook binary from row arrays. */
export function buildTestWorkbook(sheets: Record<string, unknown[][]>): Uint8Array {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const out = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as unknown;
  if (out instanceof Uint8Array) return out;
  return new Uint8Array(out as ArrayBuffer);
}
