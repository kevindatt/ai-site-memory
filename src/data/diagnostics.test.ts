import { describe, expect, it } from "vitest";
import type { RegisterView } from "./registers";
import { store } from "./registers";
import { checkDanglingLinks, checkDuplicates, runDiagnostics } from "./diagnostics";

describe("ingestion diagnostics", () => {
  it("reports the healthy synthetic dataset", () => {
    const report = runDiagnostics(store);
    expect(report.ok).toBe(true);
    expect(report.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(report.counts["WIR"]).toBe(4);
    expect(report.counts["MIR"]).toBe(3);
    expect(report.counts["Submittal"]).toBe(3);
  });

  it("flags duplicate ids (case-insensitive)", () => {
    expect(checkDuplicates("Project", ["WIR-1", "wir-1", "MIR-2"])).toHaveLength(1);
    expect(checkDuplicates("Project", ["WIR-1", "MIR-2"])).toHaveLength(0);
  });

  it("errors on dangling links but only warns on external MS- references", () => {
    const known = new Set(["WIR-1842"]);
    const errors = checkDanglingLinks("WIR Register · WIR-1843", ["WIR-9999"], known);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.severity).toBe("error");
    expect(errors[0]?.code).toBe("DANGLING_LINK");
    const warnings = checkDanglingLinks("MIR Register · MIR-302", ["MS-TH12-VEN-02"], known);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.severity).toBe("warning");
    expect(warnings[0]?.code).toBe("EXTERNAL_REF");
  });

  it("catches missing fields and bad dates on a malformed view", () => {
    const malformed: RegisterView = {
      wirs: [
        {
          id: "WIR-0001",
          revision: "",
          location: "",
          activity: "Test",
          submissionDate: "18/09/2026",
          status: "",
          holder: "",
          dueDate: "",
          relatedNcr: "",
          relatedDrawing: "",
          reviewStarted: "",
          consultantStatus: ""
        }
      ],
      mirs: [],
      ncrs: [],
      rfis: [],
      drawings: [],
      submittals: [],
      mails: [],
      listRecords: () => [],
      getRecord: () => undefined
    };
    const report = runDiagnostics(malformed);
    expect(report.ok).toBe(false);
    const codes = report.issues.map((issue) => issue.code);
    expect(codes).toContain("MISSING_FIELD");
    expect(codes).toContain("BAD_DATE");
    expect(codes).toContain("EMPTY_REGISTER");
  });
});
