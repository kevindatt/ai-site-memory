import type { AIProvider } from "./aiProvider";
import { DeterministicProvider, HttpLlmProvider } from "./aiProvider";

/**
 * Provider selection (Phase B5).
 * The prototype always resolves to the deterministic local provider; a
 * configured HTTP provider is used only when all AI_* settings are present,
 * so no model call can happen by accident and no credentials are required.
 */
export function getProvider(env: Record<string, string | undefined>): AIProvider {
  return HttpLlmProvider.fromEnv(env) ?? new DeterministicProvider();
}
