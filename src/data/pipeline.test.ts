import { describe, expect, it } from "vitest";
import { loadProjectData, reloadProjectData } from "./pipeline";

describe("ingestion pipeline", () => {
  it("loads and validates the synthetic project data", () => {
    const { store, documentCount, report } = loadProjectData();
    expect(report.ok).toBe(true);
    expect(store.wirs.length).toBeGreaterThan(0);
    expect(documentCount).toBe(2);
  });

  it("re-ingestion rebuilds an independent store", () => {
    const first = reloadProjectData();
    const second = reloadProjectData();
    expect(first.store).not.toBe(second.store);
    expect(first.report.ok).toBe(true);
    expect(second.report.ok).toBe(true);
  });
});
