import { describe, expect, it } from "vitest";
import { ProjectStore, parseCsv } from "./registers";

describe("CSV parsing (real-world cells)", () => {
  it("honours quoted commas, quotes and embedded newlines", () => {
    const rows = parseCsv(
      'wir_id,location,activity,submission_date,status,current_holder,due_date,related_ncr,related_drawing\n' +
        'WIR-1,"Villa, 43","Line1\nLine2 with ""quoted"" text",2026-09-01,Submitted,QA,2026-09-02,,'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.["location"]).toBe("Villa, 43");
    expect(rows[0]?.["activity"]).toBe('Line1\nLine2 with "quoted" text');
  });

  it("builds records from quoted real-world style rows", () => {
    const bundle = {
      wir: 'wir_id,location,activity,submission_date,status,current_holder,due_date,related_ncr,related_drawing\nWIR-1,"Tower T1 · Restroom, 01","Setting out, drywall",2026-09-01,Submitted,QA,2026-09-02,,',
      mir: "mir_id,location,material,description,submission_date,status,current_holder,related_document",
      ncr: "ncr_id,location,subject,status,opened_date,related_wir,related_drawing",
      rfi: "rfi_id,location,subject,status,submitted_date,related_drawing",
      drawing: "drawing_id,title,revision,status,issue_date,location",
      submittal: "submittal_id,location,subject,material,revision,status,submission_date,related_mir,related_document"
    };
    const store = new ProjectStore(bundle);
    expect(store.wirs).toHaveLength(1);
    expect(store.wirs[0]?.location).toBe("Tower T1 · Restroom, 01");
    expect(store.wirs[0]?.activity).toBe("Setting out, drywall");
  });
});
