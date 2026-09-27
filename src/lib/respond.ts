import type { Answer } from "./types";

/**
 * Response-generation boundary (Tech Spec §6–§7).
 * Phase-0: uncertainty/clarification placeholders only.
 * Real evidence-backed formatting lands in Phase 1/2.
 */
export function cannotVerify(topic: string): Answer {
  return {
    title: topic,
    summary: "This cannot be verified from the available project records.",
    relatedIds: [],
    evidence: [],
    verification: "Cannot verify from available project records"
  };
}

export function needsClarification(topic: string, question: string): Answer {
  return {
    title: topic,
    summary: question,
    relatedIds: [],
    evidence: [],
    verification: "Clarification required"
  };
}
