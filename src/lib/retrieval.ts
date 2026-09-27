import type { ProjectRecord } from "./types";

/**
 * Retrieval boundary (PRD §10.3, Tech Spec §7).
 * Phase-0: interface + in-memory stub only.
 * Phase 2 plugs in CSV/XLSX normalization + structured/semantic retrieval.
 * Future connectors (Aconex / Egnyte / Graph) implement this interface.
 */
export interface DocumentSource {
  listRecords(): ProjectRecord[];
  getRecord(id: string): ProjectRecord | undefined;
}

export function queryById(source: DocumentSource, id: string): ProjectRecord | undefined {
  return source.getRecord(id.trim().toUpperCase());
}
