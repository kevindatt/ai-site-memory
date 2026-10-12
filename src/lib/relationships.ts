import type { RegisterView } from "../data/registers";
import type { DocumentSource } from "./retrieval";
import type { ProjectRecord } from "./types";

/**
 * Relationship-resolution boundary (Tech Spec §7).
 * Explicit register links only. No inferred links.
 */
export function resolveRelated(source: DocumentSource, record: ProjectRecord): ProjectRecord[] {
  const out: ProjectRecord[] = [];
  for (const id of record.relatedIds ?? []) {
    const hit = source.getRecord(id);
    if (hit !== undefined) out.push(hit);
  }
  return out;
}

/**
 * One-sentence explanation of how two records relate, based only on explicit
 * register links and shared locations/drawings. Returns undefined when no
 * evidence-supported relationship exists.
 */
export function describeRelationship(a: ProjectRecord, b: ProjectRecord): string | undefined {
  const aLinksB = (a.relatedIds ?? []).some((id) => id.toUpperCase() === b.id.toUpperCase());
  const bLinksA = (b.relatedIds ?? []).some((id) => id.toUpperCase() === a.id.toUpperCase());
  if (aLinksB && bLinksA) {
    return `${a.id} and ${b.id} reference each other directly in their registers.`;
  }
  if (aLinksB) {
    return `${a.id} references ${b.id} in its register entry.`;
  }
  if (bLinksA) {
    return `${b.id} references ${a.id} in its register entry.`;
  }
  const shared = (a.relatedIds ?? []).filter((id) =>
    (b.relatedIds ?? []).some((other) => other.toUpperCase() === id.toUpperCase())
  );
  if (shared.length > 0) {
    return `${a.id} and ${b.id} are both linked to ${shared.join(", ")}.`;
  }
  if (
    a.location !== undefined &&
    b.location !== undefined &&
    a.location !== "" &&
    a.location.toLowerCase() === b.location.toLowerCase()
  ) {
    return `${a.id} and ${b.id} share the location ${a.location}.`;
  }
  return undefined;
}

/**
 * Revision lineage (Phase B3): other revisions sharing the drawing title,
 * oldest first. Used to show that superseded revisions were considered and
 * passed over by the precedence rules — never silently ignored.
 */
export function getRevisionLineage(
  view: RegisterView,
  drawingId: string
): Array<{ id: string; status: string }> {
  const drawing = view.drawings.find(
    (candidate) => candidate.id.toUpperCase() === drawingId.toUpperCase()
  );
  if (drawing === undefined) return [];
  return view.drawings
    .filter((other) => other.id !== drawing.id && other.title === drawing.title)
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate))
    .map((other) => ({ id: other.id, status: other.status }));
}

/**
 * Shared-location inference (Phase B3): records in the same location that are
 * NOT explicitly linked. Callers must label these Inferred, never Verified.
 */
export function inferBySharedLocation(
  view: RegisterView,
  record: ProjectRecord,
  limit = 3
): ProjectRecord[] {
  if (record.location === undefined || record.location === "") return [];
  const here = record.location.toLowerCase();
  return view
    .listRecords()
    .filter(
      (candidate) =>
        candidate.id !== record.id &&
        candidate.location !== undefined &&
        candidate.location.toLowerCase() === here
    )
    .slice(0, limit);
}
