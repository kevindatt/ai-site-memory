/**
 * AI provider abstraction (Phase B5, per PRD §18).
 * Application code must never depend directly on one model vendor.
 * The local prototype uses DeterministicProvider (no network, no model);
 * HttpLlmProvider exists for future configured use and is never called
 * with real credentials in this prototype. No vendor SDKs are imported —
 * the HTTP provider speaks plain fetch so vendors stay swappable.
 */

export interface AIProvider {
  readonly name: string;
  complete(question: string, evidence: string[]): Promise<string>;
}

/** Offline, evidence-grounded stub. The only provider active in the prototype. */
export class DeterministicProvider implements AIProvider {
  readonly name = "deterministic-local";

  async complete(question: string, evidence: string[]): Promise<string> {
    const refs =
      evidence.length === 0 ? "no evidence references" : evidence.join("; ");
    return `Local deterministic answer for "${question}" grounded in ${evidence.length} evidence reference(s): ${refs}. No model was called.`;
  }
}

export interface HttpLlmOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Vendor-neutral HTTP chat-completions provider. Requires explicit configuration. */
export class HttpLlmProvider implements AIProvider {
  readonly name = "http-llm";
  private readonly options: HttpLlmOptions;

  constructor(options: HttpLlmOptions) {
    this.options = options;
  }

  static fromEnv(env: Record<string, string | undefined>): HttpLlmProvider | undefined {
    const baseUrl = env["AI_BASE_URL"];
    const apiKey = env["AI_API_KEY"];
    const model = env["AI_MODEL"];
    if (baseUrl === undefined || apiKey === undefined || model === undefined) return undefined;
    if (baseUrl === "" || apiKey === "" || model === "") return undefined;
    return new HttpLlmProvider({ baseUrl, apiKey, model });
  }

  async complete(question: string, evidence: string[]): Promise<string> {
    const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.apiKey}`
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: [
          {
            role: "system",
            content:
              "Answer ONLY from the provided evidence. State uncertainty when evidence is insufficient. Never fabricate project facts."
          },
          { role: "user", content: `Question: ${question}\nEvidence:\n${evidence.join("\n")}` }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`AI provider request failed with HTTP ${response.status}.`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content;
    if (text === undefined || text === "") {
      throw new Error("AI provider returned an empty completion.");
    }
    return text;
  }
}
