import { describe, expect, it } from "vitest";
import type { FolderScan } from "./localFiles";
import { buildCsvBundle, classifyFile, emptyScan } from "./localFiles";

const FULL_SCAN: FolderScan = {
  ...emptyScan("test"),
  csvFiles: {
    "WIR_Register.csv": "wir_id\nWIR-1",
    "mir-export.CSV": "mir_id\nMIR-1",
    "NCRs.csv": "ncr_id\nNCR-1",
    "rfi register.csv": "rfi_id\nRFI-1",
    "drawings.csv": "drawing_id\nAR-1",
    "submittals.csv": "submittal_id\nSUB-1"
  }
};

describe("local-file connectors (no APIs)", () => {
  it("maps register CSVs by filename keyword, case-insensitively", () => {
    const { bundle, missing } = buildCsvBundle({
      ...FULL_SCAN,
      csvFiles: { ...FULL_SCAN.csvFiles, "Mail_Export.csv": "mail_id,subject\nM-1,S" }
    });
    expect(missing).toEqual([]);
    expect(bundle?.wir).toContain("WIR-1");
    expect(bundle?.mir).toContain("MIR-1");
  });

  it("reports missing registers instead of guessing", () => {
    const { bundle, missing } = buildCsvBundle({
      ...emptyScan("partial"),
      csvFiles: { "WIR_Register.csv": "wir_id\nWIR-1" }
    });
    expect(bundle).toBeNull();
    expect(missing).toEqual(["mir", "ncr", "rfi", "drawing", "submittal"]);
  });

  it("classifies filenames for folder scans", () => {
    expect(classifyFile("WIR_Register.csv")).toBe("csv");
    expect(classifyFile("notes.md")).toBe("text");
    expect(classifyFile("record.txt")).toBe("text");
    expect(classifyFile("drawing.pdf")).toBe("pdf");
    expect(classifyFile("register.xlsx")).toBe("xlsx");
    expect(classifyFile("photo.png")).toBe("other");
  });
});
