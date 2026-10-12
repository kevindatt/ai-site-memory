import { documents } from "./documents";
import type { DiagnosticReport } from "./diagnostics";
import { runDiagnostics } from "./diagnostics";
import { ProjectStore } from "./registers";

/**
 * Ingestion pipeline (Phase B1).
 * Single entry point that rebuilds project knowledge from
 * data/test-project/ (re-ingestion = build a fresh store), validates it,
 * and reports counts. All loaders sit behind the DocumentSource interface
 * so future enterprise connectors slot in without changing callers.
 */

export interface PipelineResult {
  store: ProjectStore;
  documentCount: number;
  report: DiagnosticReport;
}

export function loadProjectData(): PipelineResult {
  const fresh = new ProjectStore();
  return {
    store: fresh,
    documentCount: documents.length,
    report: runDiagnostics(fresh)
  };
}

/** Re-ingestion: rebuild from source files after they change. */
export function reloadProjectData(): PipelineResult {
  return loadProjectData();
}
