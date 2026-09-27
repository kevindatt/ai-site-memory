import type { DocumentSource } from "./retrieval";
import type { ProjectRecord } from "./types";

/**
 * Relationship-resolution boundary (Tech Spec §7).
 * Phase-0: explicit `relatedIds` traversal only. No inferred links.
 */
export function resolveRelated(source: DocumentSource, record: ProjectRecord): ProjectRecord[] {
  const out: ProjectRecord[] = [];
  for (const id of record.relatedIds ?? []) {
    const hit = source.getRecord(id);
    if (hit !== undefined) out.push(hit);
  }
  return out;
}
