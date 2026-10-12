import type { DrawingRecord } from "../data/registers";

/**
 * Source precedence rules (Phase B4, per PRD §14).
 * Order of authority when multiple records could answer a question:
 *  1. explicit approval status — only "Approved" can win; Superseded,
 *     For Review, Draft or any other state never wins;
 *  2. latest issue date among the approved set;
 *  3. higher revision string as the final tie-break.
 * The newest revision is NEVER assumed to be the approved one.
 */
export function pickLatestApproved(drawings: DrawingRecord[]): DrawingRecord | undefined {
  return drawings
    .filter((drawing) => drawing.status === "Approved")
    .sort(
      (a, b) =>
        b.issueDate.localeCompare(a.issueDate) || b.revision.localeCompare(a.revision)
    )[0];
}
