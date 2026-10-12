/**
 * AI cost controls (Phase B2, per PRD §29).
 * The prototype runs fully locally, so these budgets are enforced on the
 * evidence set attached to each answer and reported per request — the same
 * guards a future metered model call would use.
 */

/** Hard cap on evidence references attached to a single answer. */
export const MAX_EVIDENCE_REFS = 8;

/** Rough token estimate used for budget reporting (characters / 4). */
export const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

export function fitEvidence(evidence: string[], max: number = MAX_EVIDENCE_REFS): string[] {
  return evidence.slice(0, max);
}
