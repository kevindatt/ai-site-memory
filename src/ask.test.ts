import { describe, expect, it } from "vitest";
import { store } from "./data/registers";
import { answerQuestion } from "./lib/respond";

/**
 * Core demonstration questions + edge cases for the Ask-the-Project engine.
 * All expectations are grounded in data/test-project/ synthetic registers.
 */

function ask(question: string) {
  return answerQuestion(question, store, null).answer;
}

function factValue(question: string, label: string): string | undefined {
  return ask(question).facts.find((fact) => fact.label === label)?.value;
}

describe("Ask the Project demonstration questions", () => {
  it("returns the exact WIR-1842 status facts", () => {
    const answer = ask("What's the status of WIR-1842?");
    expect(answer.verification).toBe("Verified from available project records");
    expect(factValue("What's the status of WIR-1842?", "Status")).toBe(
      "Pending Consultant Review"
    );
    expect(factValue("What's the status of WIR-1842?", "Submitted")).toBe("18 Sep 2026");
    expect(factValue("What's the status of WIR-1842?", "Current holder")).toBe("Consultant QA");
    expect(factValue("What's the status of WIR-1842?", "Review started")).toBe("19 Sep 2026");
    expect(factValue("What's the status of WIR-1842?", "Due date")).toBe("21 Sep 2026");
    expect(answer.relatedIds).toContain("NCR-031");
    expect(answer.relatedIds).toContain("AR-043-Rev-C");
    expect(answer.evidence.length).toBeGreaterThan(0);
  });

  it("returns the MIR-302 holder", () => {
    const answer = ask("Who is holding MIR-302?");
    expect(answer.verification).toBe("Verified from available project records");
    expect(answer.summary).toContain("Consultant Materials");
    expect(factValue("Who is holding MIR-302?", "Current holder")).toBe("Consultant Materials");
  });

  it("explains the NCR relationship to WIR-1842", () => {
    const answer = ask("Which NCR is related to WIR-1842?");
    expect(answer.relatedIds).toContain("WIR-1842");
    expect(answer.summary).toContain("NCR-031");
    expect(answer.summary).toContain("AR-043");
    expect(answer.evidence).toContain("NCR Register · NCR-031");
  });

  it("identifies the latest approved Villa 43 ceiling drawing without assuming newest-approved", () => {
    const answer = ask("What is the latest approved drawing for Villa 43 ceiling?");
    expect(answer.title).toContain("AR-043-Rev-C");
    expect(factValue("What is the latest approved drawing for Villa 43 ceiling?", "Status")).toBe(
      "Approved"
    );
    // Superseded revisions must never be selected.
    expect(answer.title).not.toContain("Rev-A");
    expect(answer.title).not.toContain("Rev-B");
  });

  it("asks for clarification on the veneer question instead of guessing", () => {
    const result = answerQuestion("Is the MIR for veneer for Townhouse raised?", store, null);
    expect(result.answer.verification).toBe("Clarification required");
    expect(result.answer.followUp ?? "").toContain("MIR-302");
    expect(result.pending).toBe("mir-veneer");
  });

  it("resolves the clarified veneer question to MIR-302", () => {
    const clarified = answerQuestion("Yes, the oak veneer one", store, "mir-veneer");
    expect(clarified.answer.title).toContain("MIR-302");
    expect(clarified.answer.verification).toBe("Verified from available project records");
    expect(clarified.pending).toBeNull();
  });

  it("answers the Timber-in-Cafe MIR from the register (Draft, not raised)", () => {
    const answer = ask("What is the status of the MIR for Timber in Cafe?");
    expect(answer.title).toContain("MIR-303");
    expect(factValue("What is the status of the MIR for Timber in Cafe?", "Status")).toBe("Draft");
    expect(answer.verification).toBe("Verified from available project records");
  });

  it("states it cannot verify the wall colour (no visual evidence)", () => {
    const answer = ask("Is the color of this wall blue or is there a change?");
    expect(answer.verification).toBe("Cannot verify from available project records");
  });

  it("lists overdue WIRs from the register status", () => {
    const answer = ask("Which WIRs are overdue?");
    expect(answer.summary).toContain("WIR-1844");
    expect(answer.summary).not.toContain("WIR-1842 is");
    expect(answer.verification).toBe("Verified from available project records");
  });

  it("reconstructs WIR-1842 history and marks unknowns explicitly", () => {
    const answer = ask("What happened after WIR-1842 was rejected?");
    expect(answer.facts.some((fact) => fact.label === "Rejected")).toBe(true);
    expect(answer.summary).toContain("not recorded");
    expect(answer.evidence).toContain("Project Notes · WIR-1842");
  });

  it("does not fabricate answers for unknown records", () => {
    const answer = ask("What is the status of WIR-9999?");
    expect(answer.verification).toBe("Cannot verify from available project records");
  });
});
