import { beforeEach, describe, expect, it } from "vitest";
import { store } from "../data/registers";
import {
  approveAction,
  clearActions,
  executeAction,
  listActions,
  proposeAction
} from "./actions";
import {
  countRecords,
  exceptionFindings,
  holderWorkload,
  projectSummary
} from "./intelligence";
import { answerQuestion } from "./respond";
import { buildTimeline } from "./timeline";
import { evaluateWatchers } from "./watchers";

describe("Phase D awareness", () => {
  beforeEach(() => {
    clearActions();
  });

  it("builds the documented WIR-1842 timeline with explicit unknowns", () => {
    const events = buildTimeline(store, "WIR-1842");
    expect(events?.length).toBe(5);
    expect(events?.map((event) => event.event)).toContain("Rejected");
    expect(events?.find((event) => event.event === "Rejected")?.date).toBeNull();
  });

  it("builds drawing timelines from revision lineage", () => {
    const events = buildTimeline(store, "AR-043-Rev-C");
    expect(events?.map((event) => event.event)).toEqual([
      "Rev A issued",
      "Rev B issued",
      "Rev C issued",
      "Current state"
    ]);
  });

  it("returns undefined timelines for unknown records", () => {
    expect(buildTimeline(store, "WIR-9999")).toBeUndefined();
  });

  it("counts open NCRs and holder workload", () => {
    const counted = countRecords(store, "How many NCRs are currently open?");
    expect(counted.count).toBe(1);
    expect(counted.matches.map((record) => record.id)).toEqual(["NCR-031"]);
    const workload = holderWorkload(store);
    expect(workload[0]?.holder).toBe("Consultant QA");
    expect((workload[0]?.items.length ?? 0)).toBeGreaterThanOrEqual(2);
    expect(projectSummary(store).total).toBeGreaterThan(0);
  });

  it("surfaces exception findings and answers attention questions as inferred", () => {
    expect(exceptionFindings(store).length).toBeGreaterThan(0);
    const answer = answerQuestion("What needs attention?", store, null).answer;
    expect(answer.verification).toBe("Inferred from available project records");
    expect(answer.summary).toContain("WIR-1844");
  });

  it("evaluates monitoring watchers", () => {
    const states = evaluateWatchers(store);
    const overdue = states.find((state) => state.def.id === "overdue-wirs");
    expect(overdue?.triggered).toBe(true);
    expect(overdue?.recordIds).toContain("WIR-1844");
    expect(states.find((state) => state.def.id === "open-ncrs")?.recordIds).toContain("NCR-031");
  });

  it("enforces propose -> approve -> execute with no autonomous execution", () => {
    const proposal = proposeAction("escalation", "Escalate WIR-1844", "detail", ["WIR-1844"], "demo-user");
    expect(proposal.status).toBe("proposed");
    const early = executeAction(proposal.id, "demo-user");
    expect(early.ok).toBe(false);
    expect(listActions()[0]?.status).toBe("proposed");
    expect(approveAction(proposal.id, "demo-user")?.status).toBe("approved");
    expect(approveAction(proposal.id, "demo-user")).toBeUndefined();
    const done = executeAction(proposal.id, "demo-user");
    expect(done.ok).toBe(true);
    expect(listActions()[0]?.status).toBe("executed");
    expect(listActions()[0]?.executionNote ?? "").toContain("SIMULATED");
  });

  it("runs the full proposal lifecycle through chat", () => {
    const prepared = answerQuestion("Prepare an escalation for the overdue WIRs.", store, null);
    expect(prepared.answer.verification).toBe("Inferred from available project records");
    const match = prepared.answer.title.match(/(ACT-[A-Z0-9]+)/);
    if (match?.[1] === undefined) throw new Error("proposal id missing from answer");
    const id = match[1];
    expect(answerQuestion(`approve ${id}`, store, null).answer.title).toContain("approved");
    const executed = answerQuestion(`execute ${id}`, store, null).answer;
    expect(executed.title).toContain("executed (simulated)");
  });
});
