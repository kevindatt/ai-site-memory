/**
 * Shared project-knowledge types.
 * Mirrors PRD §12 primary entities + Tech Spec §4 data model.
 */

export interface Project {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
}

export type RecordKind = "WIR" | "MIR" | "NCR" | "RFI" | "Submittal" | "Drawing" | "Document" | "Mail" | "Reference";

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
  displayName: string;
  projectIds: string[];
  /**
   * Undefined = full project access. Defined = restricted to matching records.
   * The engine only sees records passing this scope (see applyScope).
   */
  scope?: {
    kinds?: RecordKind[];
    locations?: string[];
  };
}

export interface AnswerFact {
  label: string;
  value: string;
}

export interface Answer {
  title: string;
  summary: string;
  /** Key facts shown as a label/value grid, e.g. status, dates, holder. */
  facts: AnswerFact[];
  relatedIds: string[];
  evidence: string[];
  verification: VerificationState;
  /** Follow-up question shown under the answer (e.g. clarification prompts). */
  followUp?: string;
}
