/**
 * Shared project-knowledge types (Phase-0 scaffold).
 * Mirrors PRD §12 primary entities + Tech Spec §4 data model.
 * Full CSV normalization lands with the functional MVP; these types fix the contract now.
 */

export interface Project {
  id: string;
  name: string;
}

export type RecordKind = "WIR" | "MIR" | "NCR" | "RFI" | "Submittal" | "Drawing" | "Document";

export type VerificationState =
  | "Verified from available project records"
  | "Inferred from available project records"
  | "Cannot verify from available project records"
  | "Clarification required";

export interface ProjectRecord {
  kind: RecordKind;
  id: string;
  projectId: string;
  status: string;
  location?: string;
  /** Stable source reference shown to the user, e.g. "WIR Register · WIR-1842". */
  sourceRef: string;
  relatedIds?: string[];
  fields: Record<string, string>;
}

export interface UserContext {
  userId: string;
  projectIds: string[];
}

export interface Answer {
  title: string;
  summary: string;
  relatedIds: string[];
  evidence: string[];
  verification: VerificationState;
}
