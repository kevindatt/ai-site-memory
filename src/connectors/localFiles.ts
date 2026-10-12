import type { CsvBundle } from "../data/registers";

/**
 * Local-file connectors (Phase C, no enterprise APIs).
 * C1 (Aconex exports), C2 (Excel registers saved as CSV) and C3 (local
 * folders / Egnyte-synced copies) all arrive as plain files on the user's
 * computer. Both the browser file picker and the node ingest script produce
 * the same FolderScan, which maps onto the CsvBundle the ProjectStore
 * already consumes. Nothing downstream changes regardless of file origin.
 */

export interface FolderScan {
  /** Display label: folder name, "picked files", etc. */
  label: string;
  /** CSV filename -> raw text. */
  csvFiles: Record<string, string>;
  /** Text-note filename (.md/.txt) -> raw text. */
  textDocs: Record<string, string>;
  /** PDFs are indexed by name only — content parsing is a later phase. */
  pdfFiles: string[];
  /** Workbooks parsed in-app (SheetJS); listed here for reporting. */
  xlsxFiles: string[];
  otherFiles: string[];
}

export function emptyScan(label: string): FolderScan {
  return { label, csvFiles: {}, textDocs: {}, pdfFiles: [], xlsxFiles: [], otherFiles: [] };
}

/** Per-file import cap: oversized files are rejected with a clear message. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function checkFileSize(name: string, bytes: number): string | null {
  if (bytes <= MAX_FILE_BYTES) return null;
  return `${name} is ${(bytes / 1048576).toFixed(1)} MB, over the 25 MB per-file import limit — split it or confirm before importing.`;
}

const REGISTER_KEYS = ["wir", "mir", "ncr", "rfi", "drawing", "submittal", "mail"] as const;

type RegisterKey = (typeof REGISTER_KEYS)[number];

export type { RegisterKey };

/**
 * Match scanned CSVs onto registers by filename keyword
 * (e.g. "WIR_Register.csv", "mir-export.CSV"). Returns the bundle when every
 * register matched, otherwise the list of missing register keys.
 */
export function buildCsvBundle(scan: FolderScan): {
  bundle: CsvBundle | null;
  missing: RegisterKey[];
} {
  const picked = {} as Record<RegisterKey, string | undefined>;
  for (const key of REGISTER_KEYS) {
    picked[key] = matchCsv(scan, key);
  }
  const missing = REGISTER_KEYS.filter((key) => key !== "mail" && picked[key] === undefined);
  if (missing.length > 0) return { bundle: null, missing };
  return {
    bundle: {
      wir: picked.wir as string,
      mir: picked.mir as string,
      ncr: picked.ncr as string,
      rfi: picked.rfi as string,
      drawing: picked.drawing as string,
      submittal: picked.submittal as string,
      mail: picked.mail
    },
    missing: []
  };
}

/** Raw text of the scanned CSV matching a register, if any. */
export function matchCsv(scan: FolderScan, key: RegisterKey): string | undefined {
  const hit = Object.keys(scan.csvFiles).find((name) => name.toLowerCase().includes(key));
  return hit === undefined ? undefined : scan.csvFiles[hit];
}

/** Every scanned CSV matching a register (multi-source merges use all). */
export function matchAllCsv(scan: FolderScan, key: RegisterKey): Array<{ name: string; text: string }> {
  return Object.entries(scan.csvFiles)
    .filter(([name]) => name.toLowerCase().includes(key))
    .map(([name, text]) => ({ name, text: text ?? "" }));
}

/** Classify one filename for folder scans (node) and picked files (browser). */
export function classifyFile(filename: string): "csv" | "text" | "pdf" | "xlsx" | "other" {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".md") || lower.endsWith(".txt")) return "text";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  return "other";
}
