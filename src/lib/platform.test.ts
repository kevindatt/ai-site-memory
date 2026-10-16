import { describe, expect, it } from "vitest";
import type { DrawingRecord } from "../data/registers";
import { store } from "../data/registers";
import { getProvider } from "./aiConfig";
import { DeterministicProvider, HttpLlmProvider } from "./aiProvider";
import { estimateTokens, fitEvidence } from "./budget";
import { pickLatestApproved } from "./precedence";
import { answerQuestion } from "./respond";
import { keywordSearch } from "./retrieval";

function drawing(id: string, status: string, issueDate: string, revision: string): DrawingRecord {
  return { id, title: "Test Detail", revision, status, issueDate, location: "Test", reviewStarted: "", consultantStatus: "" };
}

describe("Phase B boundaries", () => {
  it("never selects a superseded revision, however new (precedence)", () => {
    const latest = pickLatestApproved([
      drawing("AR-X-Rev-A", "Approved", "2026-09-01", "A"),
      drawing("AR-X-Rev-B", "Superseded", "2026-09-20", "B")
    ]);
    expect(latest?.id).toBe("AR-X-Rev-A");
  });

  it("breaks approval-date ties by higher revision", () => {
    const latest = pickLatestApproved([
      drawing("AR-X-Rev-A", "Approved", "2026-09-10", "A"),
      drawing("AR-X-Rev-B", "Approved", "2026-09-10", "B")
    ]);
    expect(latest?.id).toBe("AR-X-Rev-B");
  });

  it("caps evidence and estimates tokens (budgets)", () => {
    expect(fitEvidence(["a", "b", "c"], 2)).toEqual(["a", "b"]);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("")).toBe(1);
  });

  it("finds keyword matches for topical questions", () => {
    const hits = keywordSearch(store, "ceiling");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((hit) => hit.record.id)).toContain("WIR-1842");
    expect(keywordSearch(store, "xyzzy plugh")).toEqual([]);
  });

  it("answers full-text topical queries as verified super-search results with usage", () => {
    const result = answerQuestion("ceiling works", store, null);
    expect(result.answer.verification).toBe("Verified from available project records");
    expect(result.answer.title).toContain("Super-search");
    expect(result.answer.relatedIds).toContain("WIR-1842");
    expect(result.usage.evidenceRefs).toBeGreaterThan(0);
    expect(result.usage.estimatedTokens).toBeGreaterThan(0);
  });

  it("answers partial topical queries as inferred keyword matches with usage", () => {
    const result = answerQuestion("ceiling xyzzy", store, null);
    expect(result.answer.verification).toBe("Inferred from available project records");
    expect(result.usage.evidenceRefs).toBeGreaterThan(0);
  });

  it("keeps unknown named records as cannot-verify (no keyword papering-over)", () => {
    const result = answerQuestion("What is the status of WIR-9999?", store, null);
    expect(result.answer.verification).toBe("Cannot verify from available project records");
  });

  it("defaults to the deterministic local provider", async () => {
    expect(getProvider({}).name).toBe("deterministic-local");
    expect(HttpLlmProvider.fromEnv({})).toBeUndefined();
    const configured = HttpLlmProvider.fromEnv({
      AI_BASE_URL: "https://example.invalid",
      AI_API_KEY: "test",
      AI_MODEL: "test-model"
    });
    expect(configured?.name).toBe("http-llm");
    const text = await new DeterministicProvider().complete("q?", ["MIR Register · MIR-302"]);
    expect(text).toContain("MIR Register · MIR-302");
    expect(text).toContain("No model was called");
  });
});
