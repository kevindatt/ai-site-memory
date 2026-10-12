import type { RegisterView } from "./registers";
import { splitLinks } from "./registers";

/**
 * Ingestion diagnostics (Phase A1).
 * Validates the normalized synthetic registers: row counts, required fields,
 * duplicate ids, date formats and dangling relationship links.
 * Run via `npm run ingest`, which exits non-zero when errors are found.
 */

export type DiagnosticSeverity = "error" | "warning";

export interface DiagnosticIssue {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
}

export interface DiagnosticReport {
  counts: Record<string, number>;
  issues: DiagnosticIssue[];
  ok: boolean;
}

/** Reference prefixes that legitimately live outside the registers (e.g. material docs). */
const EXTERNAL_PREFIXES = ["MS-"];

function required(
  issues: DiagnosticIssue[],
  kind: string,
  id: string,
  fields: Record<string, string>
): void {
  for (const [name, value] of Object.entries(fields)) {
    if (value.trim() === "") {
      issues.push({
        severity: "error",
        code: "MISSING_FIELD",
        message: `${kind} ${id || "(no id)"} is missing required field "${name}".`
      });
    }
  }
}

function validDate(value: string): boolean {
  if (value.trim() === "") return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match === null) return false;
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** Duplicate-id check over an explicit id list (pure; unit-testable). */
/**
 * Duplicate-entry check over composite "id‖revision" keys (pure; unit-testable).
 * The same document number across different revisions is a revision family,
 * not a duplicate. An identical id+revision twice is a data-quality WARNING:
 * the store keeps the later row (registers list activity chronologically)
 * and answers stay correct, but the repeat is reported, never hidden.
 */
export function checkDuplicates(kind: string, ids: string[]): DiagnosticIssue[] {
  const seen = new Set<string>();
  const issues: DiagnosticIssue[] = [];
  for (const id of ids) {
    const key = id.toUpperCase();
    if (seen.has(key)) {
      issues.push({
        severity: "warning",
        code: "DUPLICATE_ID",
        message: `${kind} repeats entry "${id}" — later row kept, earlier row(s) superseded for answers.`
      });
    }
    seen.add(key);
  }
  return issues;
}

function compositeId(kind: string, id: string, revision: string): string {
  const rev = revision.trim() === "" ? "" : `‖${revision.trim()}`;
  return `${kind}‖${id}${rev}`;
}

/**
 * Dangling-link check over explicit links (pure; unit-testable).
 * Missing links to drawings are warnings, not errors: drawing references
 * routinely point at a separate drawing-management set that is not ingested
 * here, and blocking the whole import over them would hide real data.
 * Same-kind structural links (WIR/MIR/NCR/RFI/Submittal) stay errors.
 */
export function checkDanglingLinks(
  sourceRef: string,
  links: string[],
  knownIds: Set<string>,
  missingSeverity: DiagnosticSeverity = "error"
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  for (const link of links) {
    if (knownIds.has(link.toUpperCase())) continue;
    if (EXTERNAL_PREFIXES.some((prefix) => link.toUpperCase().startsWith(prefix))) {
      issues.push({
        severity: "warning",
        code: "EXTERNAL_REF",
        message: `${sourceRef} references ${link}, which has no ingested copy (external reference).`
      });
    } else {
      issues.push({
        severity: missingSeverity,
        code: "DANGLING_LINK",
        message: `${sourceRef} references ${link}, which does not exist in the project data.`
      });
    }
  }
  return issues;
}

export function runDiagnostics(store: RegisterView): DiagnosticReport {
  const issues: DiagnosticIssue[] = [];
  const counts: Record<string, number> = {
    WIR: store.wirs.length,
    MIR: store.mirs.length,
    NCR: store.ncrs.length,
    RFI: store.rfis.length,
    Drawing: store.drawings.length,
    Submittal: store.submittals.length,
    Mail: store.mails.length,
    Reference: store.listRecords().filter((record) => record.kind === "Reference").length
  };

  for (const [kind, count] of Object.entries(counts)) {
    // Empty registers (except never-required Reference) are warnings, not
    // errors: partial loads are legitimate (e.g. a single workbook picked on
    // a phone), and answers simply say cannot-verify for missing kinds.
    if (count === 0 && kind !== "Mail" && kind !== "Reference") {
      issues.push({
        severity: "warning",
        code: "EMPTY_REGISTER",
        message: `${kind} register is empty — questions needing it will say it cannot be verified.`
      });
    }
  }

  const knownIds = new Set(store.listRecords().map((record) => record.id.toUpperCase()));
  const allIds: string[] = [];

  for (const wir of store.wirs) {
    allIds.push(compositeId("WIR", wir.id, wir.revision));
    required(issues, "WIR", wir.id, {
      wir_id: wir.id,
      status: wir.status,
      location: wir.location,
      submission_date: wir.submissionDate
    });
    for (const date of [wir.submissionDate, wir.dueDate]) {
      if (!validDate(date)) {
        issues.push({
          severity: "error",
          code: "BAD_DATE",
          message: `WIR ${wir.id} has an invalid date "${date}" (expected YYYY-MM-DD).`
        });
      }
    }
    issues.push(
      ...checkDanglingLinks(`WIR Register · ${wir.id}`, splitLinks(wir.relatedNcr), knownIds),
      ...checkDanglingLinks(`WIR Register · ${wir.id}`, splitLinks(wir.relatedDrawing), knownIds, "warning")
    );
  }

  for (const mir of store.mirs) {
    allIds.push(compositeId("MIR", mir.id, mir.revision));
    required(issues, "MIR", mir.id, {
      mir_id: mir.id,
      status: mir.status,
      location: mir.location,
      material: mir.material,
      submission_date: mir.submissionDate
    });
    if (!validDate(mir.submissionDate)) {
      issues.push({
        severity: "error",
        code: "BAD_DATE",
        message: `MIR ${mir.id} has an invalid date "${mir.submissionDate}".`
      });
    }
    issues.push(
      ...checkDanglingLinks(
        `MIR Register · ${mir.id}`,
        splitLinks(mir.relatedDocument),
        knownIds
      )
    );
  }

  for (const ncr of store.ncrs) {
    allIds.push(compositeId("NCR", ncr.id, ncr.revision));
    required(issues, "NCR", ncr.id, {
      ncr_id: ncr.id,
      status: ncr.status,
      subject: ncr.subject,
      opened_date: ncr.openedDate
    });
    issues.push(
      ...checkDanglingLinks(`NCR Register · ${ncr.id}`, splitLinks(ncr.relatedWir), knownIds),
      ...checkDanglingLinks(`NCR Register · ${ncr.id}`, splitLinks(ncr.relatedDrawing), knownIds, "warning")
    );
  }

  for (const rfi of store.rfis) {
    allIds.push(compositeId("RFI", rfi.id, rfi.revision));
    required(issues, "RFI", rfi.id, {
      rfi_id: rfi.id,
      status: rfi.status,
      subject: rfi.subject
    });
    issues.push(
      ...checkDanglingLinks(
        `RFI Register · ${rfi.id}`,
        splitLinks(rfi.relatedDrawing),
        knownIds,
        "warning"
      )
    );
  }

  for (const drawing of store.drawings) {
    allIds.push(compositeId("Drawing", drawing.id, ""));
    required(issues, "Drawing", drawing.id, {
      drawing_id: drawing.id,
      status: drawing.status,
      title: drawing.title,
      revision: drawing.revision
    });
  }

  for (const submittal of store.submittals) {
    allIds.push(compositeId("Submittal", submittal.id, submittal.revision));
    required(issues, "Submittal", submittal.id, {
      submittal_id: submittal.id,
      status: submittal.status,
      subject: submittal.subject
    });
    issues.push(
      ...checkDanglingLinks(
        `Submittal Register · ${submittal.id}`,
        splitLinks(submittal.relatedMir),
        knownIds
      )
    );
  }

  for (const mail of store.mails) {
    // Mail threads repeat ids by design (notice + responses); the store
    // keeps the latest row per id, so repeats are not duplicates.
    required(issues, "Mail", mail.id, {
      mail_id: mail.id,
      subject: mail.subject
    });
    if (!validDate(mail.date)) {
      issues.push({
        severity: "error",
        code: "BAD_DATE",
        message: `Mail ${mail.id} has an invalid date "${mail.date}" (expected YYYY-MM-DD).`
      });
    }
    issues.push(
      ...checkDanglingLinks(`Mail · ${mail.id}`, splitLinks(mail.relatedMail), knownIds)
    );
  }

  issues.push(...checkDuplicates("Project", allIds));

  return { counts, issues, ok: !issues.some((issue) => issue.severity === "error") };
}
