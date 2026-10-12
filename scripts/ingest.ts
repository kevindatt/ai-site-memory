/**
 * Ingestion entry point (Phases A1 + C): validate the bundled synthetic data,
 * or scan an external local folder (--source <dir>) containing the user's
 * own CSV exports, notes, PDFs and workbooks. No network, no APIs.
 * Run with: npm run ingest [-- --source <folder>]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { FolderScan } from "../src/connectors/localFiles";
import { checkFileSize, classifyFile, emptyScan } from "../src/connectors/localFiles";
import type { NormalizedSheet } from "../src/connectors/xlsx";
import { mergeSources, parseWorkbook } from "../src/connectors/xlsx";
import { runDiagnostics } from "../src/data/diagnostics";
import { ProjectStore, toReferenceRecords } from "../src/data/registers";

const VERBOSE = process.argv.includes("--verbose");
const MAX_SHOWN_ISSUES = 30;

function printReport(store: ProjectStore): boolean {
  const report = runDiagnostics(store);
  for (const [kind, count] of Object.entries(report.counts)) {
    console.log(`  ${kind} register: ${count} rows`);
  }
  if (report.issues.length === 0) console.log("  No issues found.");
  const shown = VERBOSE ? report.issues : report.issues.slice(0, MAX_SHOWN_ISSUES);
  for (const issue of shown) {
    console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
  }
  if (!VERBOSE && report.issues.length > MAX_SHOWN_ISSUES) {
    console.log(`  … and ${report.issues.length - MAX_SHOWN_ISSUES} more issues (re-run with --verbose for all).`);
  }
  return report.ok;
}

function printCounts(store: ProjectStore): void {
  if (printReport(store)) {
    console.log("Ingestion OK.");
  } else {
    console.error("Ingestion FAILED: fix the errors above and re-run.");
    process.exitCode = 1;
  }
}

function scanExternal(dir: string): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    console.error(`Cannot read folder: ${dir}`);
    process.exitCode = 1;
    return;
  }
  const scan: FolderScan = emptyScan(dir);
  const sheets: NormalizedSheet[] = [];
  const sheetNotes: string[] = [];
  const sizeErrors: string[] = [];
  for (const name of entries) {
    let size = 0;
    let isFile = false;
    try {
      const stats = statSync(join(dir, name));
      isFile = stats.isFile();
      size = stats.size;
    } catch {
      continue;
    }
    if (!isFile) continue;
    const tooBig = checkFileSize(name, size);
    if (tooBig !== null) {
      sizeErrors.push(tooBig);
      continue;
    }
    const kind = classifyFile(name);
    if (kind === "csv") {
      try {
        scan.csvFiles[name] = readFileSync(join(dir, name), "utf8");
      } catch {
        console.error(`Cannot read file: ${name}`);
        process.exitCode = 1;
        return;
      }
    } else if (kind === "text") {
      scan.textDocs[name] = name;
    } else if (kind === "pdf") {
      scan.pdfFiles.push(name);
    } else if (kind === "xlsx") {
      scan.xlsxFiles.push(name);
      try {
        const parsed = parseWorkbook(new Uint8Array(readFileSync(join(dir, name))), name);
        sheets.push(...parsed.sheets);
        sheetNotes.push(...parsed.notes);
      } catch {
        sheetNotes.push(`${name}: could not be read as a workbook.`);
      }
    } else {
      scan.otherFiles.push(name);
    }
  }

  console.log(`AI Site Memory — local folder scan (no APIs used)`);
  console.log(`  Folder: ${dir}`);
  console.log(`  CSV files: ${Object.keys(scan.csvFiles).join(", ") || "(none)"}`);
  console.log(`  Text notes: ${Object.keys(scan.textDocs).join(", ") || "(none)"}`);
  console.log(`  PDFs indexed by name only: ${scan.pdfFiles.join(", ") || "(none)"}`);
  const usedSheets = sheets.filter((sheet) => sheet.csv !== "");
  if (usedSheets.length > 0) {
    console.log(
      `  Workbook sheets normalized: ${usedSheets.map((sheet) => `${sheet.file} :: ${sheet.sheet} -> ${sheet.register}`).join(", ")}`
    );
  }
  for (const error of sizeErrors) {
    console.log(`  [error] FILE_TOO_LARGE: ${error}`);
  }
  const merged = mergeSources(scan, sheets);
  for (const note of [...sheetNotes, ...merged.notes]) {
    console.log(`  [xlsx] ${note}`);
  }
  if (merged.bundle === null) {
    console.error(
      `  Cannot build project data: no register source found for ${merged.missing.join(", ")}.`
    );
    if (scan.xlsxFiles.length > 0 && usedSheets.length === 0) {
      console.error(`  (Workbooks were found but no sheet could be normalized — see [xlsx] notes above.)`);
    }
    process.exitCode = 1;
    return;
  }
  const reference = toReferenceRecords(merged.tables);
  if (reference.length > 0) {
    console.log(`  Reference tables: ${reference.length} searchable rows (status answers excluded).`);
  }
  const dataOk = printReport(new ProjectStore(merged.bundle, reference));
  if (sizeErrors.length > 0) {
    process.exitCode = 1;
    console.error("Ingestion FAILED: oversized files were skipped (see FILE_TOO_LARGE above).");
  } else if (dataOk) {
    console.log("Ingestion OK.");
  } else {
    console.error("Ingestion FAILED: fix the errors above and re-run.");
    process.exitCode = 1;
  }
}

const sourceIndex = process.argv.indexOf("--source");
if (sourceIndex >= 0) {
  const dir = process.argv[sourceIndex + 1];
  if (dir === undefined || dir === "") {
    console.error("Usage: npm run ingest -- --source <folder>");
    process.exitCode = 1;
  } else {
    scanExternal(dir);
  }
} else {
  console.log("AI Site Memory — ingestion diagnostics (synthetic data only)");
  printCounts(new ProjectStore());
}
