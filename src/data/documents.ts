import doc001 from "../../data/test-project/documents/DOC-001-villa43-cove-observation.md?raw";
import doc002 from "../../data/test-project/documents/DOC-002-cafe-timber-note.md?raw";

/**
 * Synthetic source documents (Phase A2).
 * Short text notes with explicit record tags — the prototype's stand-in for
 * ingested PDF/document text. Tags are explicit links, never inferred.
 */

export interface SourceDocument {
  id: string;
  title: string;
  recordIds: string[];
  text: string;
  sourceRef: string;
}

export function parseDoc(raw: string, id: string): SourceDocument {
  const lines = raw.split(/\r?\n/);
  const titleLine = lines.find((line) => line.startsWith("# ")) ?? `# ${id}`;
  const title = titleLine.replace(/^#\s*/, "").trim();
  const recordsIndex = lines.findIndex((line) => line.toLowerCase().startsWith("records:"));
  const recordsLine = recordsIndex >= 0 ? (lines[recordsIndex] ?? "") : "";
  const recordIds = recordsLine
    .replace(/^[Rr]ecords:\s*/, "")
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter((part) => part.length > 0);
  const text = (recordsIndex >= 0 ? lines.slice(recordsIndex + 1) : lines.slice(2))
    .join("\n")
    .trim();
  return { id, title, recordIds, text, sourceRef: `Document · ${id}` };
}

export const documents: SourceDocument[] = [parseDoc(doc001, "DOC-001"), parseDoc(doc002, "DOC-002")];

/** Documents explicitly tagged with the given record id. */
export function docsForRecord(id: string): SourceDocument[] {
  const key = id.trim().toUpperCase();
  return documents.filter((doc) => doc.recordIds.includes(key));
}
