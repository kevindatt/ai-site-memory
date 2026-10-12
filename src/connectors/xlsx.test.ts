import { describe, expect, it } from "vitest";
import { ProjectStore } from "../data/registers";
import { emptyScan } from "./localFiles";
import {
  buildTestWorkbook,
  detectRegister,
  excelSerialToDate,
  mergeSources,
  normalizeSheet,
  parseWorkbook
} from "./xlsx";

describe("xlsx cleaning step", () => {
  it("detects registers from sheet and file names", () => {
    expect(detectRegister("WIR Log", "registers.xlsx")).toBe("wir");
    expect(detectRegister("Sheet1", "MIR_export.xlsx")).toBe("mir");
    expect(detectRegister("Random", "notes.xlsx")).toBeNull();
  });

  it("maps header variants, trims values, drops empty rows and formats dates", () => {
    const bytes = buildTestWorkbook({
      "WIR Log": [
        ["WIR ID", "Location", "Activity", "Date Submitted", "Status", "Current Holder", "Due", "NCR Ref", "Unknown Col"],
        ["  WIR-9001  ", "Villa 9", "Ceilings", new Date(Date.UTC(2026, 8, 18)), "Submitted", "QA", new Date(Date.UTC(2026, 8, 21)), "NCR-1", "dropped"],
        ["", "", "", "", "", "", "", "", ""]
      ]
    });
    const { sheets, notes } = parseWorkbook(bytes, "registers.xlsx");
    expect(notes).toEqual([]);
    expect(sheets).toHaveLength(1);
    const sheet = sheets[0];
    if (sheet === undefined) throw new Error("sheet missing");
    expect(sheet.register).toBe("wir");
    expect(sheet.notes.join(" ")).toContain('column "Unknown Col" has no mapping');
    const store = new ProjectStore({
      wir: sheet.csv,
      mir: "",
      ncr: "",
      rfi: "",
      drawing: "",
      submittal: ""
    });
    expect(store.wirs).toHaveLength(1);
    expect(store.wirs[0]?.id).toBe("WIR-9001");
    expect(store.wirs[0]?.submissionDate).toBe("2026-09-18");
    expect(store.wirs[0]?.dueDate).toBe("2026-09-21");
    expect(store.wirs[0]?.holder).toBe("QA");
    expect(store.wirs[0]?.relatedNcr).toBe("NCR-1");
  });

  it("skips sheets missing required columns and reports them", () => {
    const sheet = normalizeSheet("r.xlsx", "MIRs", [["Material", "Status"]]);
    expect(sheet.register).toBeNull();
    expect(sheet.csv).toBe("");
    expect(sheet.notes.join(" ")).toContain("required column(s) not found");
  });

  it("concatenates same-register sources instead of dropping sheets", () => {
    const bytes = buildTestWorkbook({
      WIRs: [
        ["wir_id", "location", "submission_date", "status", "due_date"],
        ["WIR-X1", "L", "2026-09-01", "Submitted", "2026-09-02"]
      ],
      MIRs: [
        ["mir_id", "location", "material", "submission_date", "status"],
        ["MIR-X1", "L", "M", "2026-09-01", "Draft"]
      ],
      NCRs: [["ncr_id", "subject", "status", "opened_date"], ["NCR-X1", "S", "Open", "2026-09-01"]],
      RFIs: [["rfi_id", "subject", "status"], ["RFI-X1", "S", "Open"]],
      Drawings: [["drawing_id", "title", "revision", "status"], ["AR-X1", "T", "A", "Approved"]],
      Submittals: [["submittal_id", "subject", "status"], ["SUB-X1", "S", "Approved"]],
      Mail: [["mail_id", "subject"], ["M-X1", "Hello"]]
    });
    const { sheets } = parseWorkbook(bytes, "regs.xlsx");
    const scan = {
      ...emptyScan("mix"),
      csvFiles: {
        "WIR_Register.csv":
          "wir_id,location,submission_date,status,due_date\nWIR-9,L,2026-09-01,Submitted,2026-09-02"
      }
    };
    const merged = mergeSources(scan, sheets);
    expect(merged.bundle).not.toBeNull();
    expect(merged.missing).toEqual([]);
    expect(merged.notes.join(" ")).toContain("Combined 2 sources for wir");
    if (merged.bundle === null) throw new Error("bundle missing");
    const store = new ProjectStore(merged.bundle);
    expect(store.wirs.map((wir) => wir.id).sort()).toEqual(["WIR-9", "WIR-X1"]);
  });

  it("skips id-less section-header rows with a note", () => {
    const sheet = normalizeSheet("s.xlsx", "WIRs", [
      ["wir_id", "location", "submission_date", "status", "due_date"],
      ["WIR-1", "L", "2026-09-01", "Submitted", "2026-09-02"],
      ["Delilah", "", "", "", ""]
    ]);
    expect(sheet.register).toBe("wir");
    expect(sheet.notes.join(" ")).toContain("without document numbers");
    const store = new ProjectStore({
      wir: sheet.csv,
      mir: "",
      ncr: "",
      rfi: "",
      drawing: "",
      submittal: ""
    });
    expect(store.wirs.map((wir) => wir.id)).toEqual(["WIR-1"]);
  });

  it("detects the header row past title rows and composes locations", () => {
    const bytes = buildTestWorkbook({
      "WIR Log": [
        ["", "", "WORK INSPECTION REQUEST (WIR) REGISTER"],
        ["Mail No.", "Zone-Volume", "Venue", "Levels", "Subject", "SubmissionDate", "ALEC Status", "Due Date as per Contract"],
        ["AFO-IN-1", "Tower T1", "Restroom 01", "Ground", "Setting out", new Date(Date.UTC(2026, 8, 18)), "Submitted", 45713]
      ]
    });
    const { sheets } = parseWorkbook(bytes, "registers.xlsx");
    const sheet = sheets[0];
    if (sheet === undefined) throw new Error("sheet missing");
    expect(sheet.register).toBe("wir");
    expect(sheet.notes.join(" ")).toContain("header detected on row 2");
    const store = new ProjectStore({
      wir: sheet.csv,
      mir: "",
      ncr: "",
      rfi: "",
      drawing: "",
      submittal: ""
    });
    expect(store.wirs).toHaveLength(1);
    expect(store.wirs[0]?.id).toBe("AFO-IN-1");
    expect(store.wirs[0]?.location).toBe("Tower T1 · Restroom 01 · Ground");
    expect(store.wirs[0]?.submissionDate).toBe("2026-09-18");
  });

  it("converts Excel serial dates only in plausible range", () => {
    expect(excelSerialToDate(25569)).toBe("1970-01-01");
    expect(excelSerialToDate(45713)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(excelSerialToDate(6)).toBeNull();
    expect(excelSerialToDate(1.5)).toBeNull();
  });

  it("maps real-world NCR headers and reports the rest", () => {
    const sheet = normalizeSheet("n.xlsx", " NCR", [
      ["SL NO", "NCR Reference No", "Rev", "Subject", "Description ", "Zone", "Level", "Action By", " Received Date", "Approval Status"],
      ["1", "NCR-1", "00", "Cove defect", "detail", "Villa 43", "L1", "QA", "2026-09-19", "Open"]
    ]);
    expect(sheet.register).toBe("ncr");
    expect(sheet.notes.join(" ")).toContain('"Description"');
    const store = new ProjectStore({
      wir: "",
      mir: "",
      ncr: sheet.csv,
      rfi: "",
      drawing: "",
      submittal: ""
    });
    expect(store.ncrs).toHaveLength(1);
    expect(store.ncrs[0]?.location).toBe("Villa 43 · L1");
    expect(store.ncrs[0]?.subject).toBe("Cove defect");
  });

  it("prefers submittal over drawing for shop-drawing logs", () => {
    expect(detectRegister("Shop Drawing Submittal", "regs.xlsx")).toBe("submittal");
    expect(detectRegister("DDD Drawing", "regs.xlsx")).toBe("drawing");
  });

  it("keeps non-register tabular sheets as searchable reference tables", () => {
    const bytes = buildTestWorkbook({
      Schedule: [
        ["Item", "Supplier", "Location", "MIR Ref"],
        ["Grab bar", "AL SHAYA", "DELILAH", "AFO-IR-MAT-000801"],
        ["Mop sink", "Elkay", "Cafe", "MIR-303"]
      ],
      Summary: [["Total", "5"]]
    });
    const { sheets } = parseWorkbook(bytes, "schedule.xlsx");
    const schedule = sheets.find((sheet) => sheet.sheet === "Schedule");
    expect(schedule?.register).toBeNull();
    expect(schedule?.table?.rows).toHaveLength(2);
    const summary = sheets.find((sheet) => sheet.sheet === "Summary");
    expect(summary?.table).toBeUndefined();
  });
});
