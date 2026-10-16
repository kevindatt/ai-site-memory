import { describe, expect, it } from "vitest";
import { store } from "../data/registers";
import type { RegisterView } from "../data/registers";
import type { ProjectRecord } from "./types";
import { advancedSearch, matchTerm, parseBooleanQuery, queryHasSubstance } from "./advancedSearch";

function fakeRecord(id: string, fields: Record<string, string> = {}): ProjectRecord {
  return {
    kind: "WIR",
    id,
    projectId: "test",
    status: "Open",
    location: "Zone IN-8",
    sourceRef: `WIR Register · ${id}`,
    relatedIds: [],
    fields: { description: "Cove ceiling works", ...fields }
  };
}

function fakeView(records: ProjectRecord[]): RegisterView {
  return {
    wirs: [],
    mirs: [],
    ncrs: [],
    rfis: [],
    drawings: [],
    submittals: [],
    mails: [],
    listRecords: () => records,
    getRecord: (id: string) => records.find((record) => record.id.toUpperCase() === id.trim().toUpperCase())
  };
}

const AFO = fakeRecord("AFO-IN-000008");
const AFO2 = fakeRecord("AFO-IN-000009");
const MIR = { ...fakeRecord("MIR-302"), kind: "MIR" as const };

describe("super-search full-text + boolean", () => {
  it("finds partial fragments IN and 8 inside AFO-IN-000008", () => {
    const view = fakeView([AFO, AFO2, MIR]);
    expect(advancedSearch(view, "AFO-IN-000008").map((hit) => hit.record.id)).toEqual(["AFO-IN-000008"]);
    expect(advancedSearch(view, "IN").map((hit) => hit.record.id).sort()).toEqual([
      "AFO-IN-000008",
      "AFO-IN-000009"
    ]);
    expect(advancedSearch(view, "8").map((hit) => hit.record.id)).toEqual(["AFO-IN-000008"]);
    expect(advancedSearch(view, "000008").map((hit) => hit.record.id)).toEqual(["AFO-IN-000008"]);
  });

  it("supports AND / OR / NOT and quoted phrases", () => {
    const view = fakeView([AFO, AFO2, MIR]);
    expect(advancedSearch(view, "AFO 000008").map((hit) => hit.record.id)).toEqual(["AFO-IN-000008"]);
    expect(advancedSearch(view, "000008 OR MIR-302").map((hit) => hit.record.id).sort()).toEqual([
      "AFO-IN-000008",
      "MIR-302"
    ]);
    expect(advancedSearch(view, "AFO NOT 000009").map((hit) => hit.record.id)).toEqual(["AFO-IN-000008"]);
    expect(advancedSearch(view, "AFO -000009").map((hit) => hit.record.id)).toEqual(["AFO-IN-000008"]);
    expect(advancedSearch(view, '"cove ceiling"').map((hit) => hit.record.id).sort()).toEqual([
      "AFO-IN-000008",
      "AFO-IN-000009",
      "MIR-302"
    ]);
  });

  it("parses OR groups with exclusions", () => {
    expect(parseBooleanQuery("a OR b NOT c")).toEqual([
      { include: ["a"], exclude: [] },
      { include: ["b"], exclude: ["c"] }
    ]);
  });

  it("detects query substance for short fragments", () => {
    expect(queryHasSubstance("IN")).toBe(true);
    expect(queryHasSubstance("8")).toBe(true);
    expect(queryHasSubstance("a")).toBe(false);
    expect(queryHasSubstance("")).toBe(false);
  });

  it("matches numeric fragments against the synthetic store", () => {
    const ids = advancedSearch(store, "1842").map((hit) => hit.record.id);
    expect(ids).toContain("WIR-1842");
  });

  it("scores exact IDs above partial matches", () => {
    const haystack = "afo-in-000008 open zone in-8 wir register · afo-in-000008 cove ceiling works";
    expect(matchTerm(AFO, haystack, "afo-in-000008")).toBeGreaterThan(matchTerm(AFO, haystack, "afo"));
  });
});
