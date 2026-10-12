import { describe, expect, it } from "vitest";
import { checkFileSize } from "../connectors/localFiles";
import { ProjectStore, store, toReferenceRecords } from "../data/registers";
import { answerQuestion, resolvePronouns } from "./respond";

const MOP_SINK_BUNDLE = {
  wir: "wir_id,location,submission_date,status,due_date",
  mir: "mir_id,location,material,description,submission_date,status,current_holder,related_document\nMIR-900,Janitor Room,Mop Sink,Mop sink with wall mounted faucet,2026-09-20,Approved with Comments,QA,MS-900",
  ncr: "ncr_id,location,subject,status,opened_date,related_wir,related_drawing",
  rfi: "rfi_id,location,subject,status,submitted_date,related_drawing",
  drawing: "drawing_id,title,revision,status,issue_date,location",
  submittal: "submittal_id,location,subject,material,revision,status,submission_date,related_mir,related_document"
};

function ask(question: string) {
  return answerQuestion(question, store, null).answer;
}

describe("chatbot evidence behaviors", () => {
  it("lists records awaiting consultant review (empty on synthetic data)", () => {
    const answer = ask("Which documents are awaiting consultant review?");
    expect(answer.verification).toBe("Verified from available project records");
    expect(answer.summary).toContain("No visible record");
  });

  it("finds consultant-review items once registers carry them", () => {
    const local = new ProjectStore({
      wir: "wir_id,location,submission_date,status,due_date,consultant_status\nWIR-1,L,2026-09-01,Submitted,2026-09-05,With consultant",
      mir: "mir_id,location,material,submission_date,status,current_holder,related_document",
      ncr: "ncr_id,location,subject,status,opened_date,related_wir,related_drawing",
      rfi: "rfi_id,location,subject,status,submitted_date,related_drawing",
      drawing: "drawing_id,title,revision,status,issue_date,location",
      submittal: "submittal_id,location,subject,material,revision,status,submission_date,related_mir,related_document"
    });
    const answer = answerQuestion("Which documents are awaiting consultant review?", local, null).answer;
    expect(answer.title).toContain("1 awaiting consultant review");
    expect(answer.relatedIds).toContain("WIR-1");
  });

  it("shows review-started and consultant status facts when present", () => {
    const local = new ProjectStore({
      wir: "wir_id,location,submission_date,status,due_date,review_started,consultant_status\nWIR-1,L,2026-09-01,Submitted,2026-09-05,2026-09-02,With consultant",
      mir: "mir_id,location,material,submission_date,status,current_holder,related_document",
      ncr: "ncr_id,location,subject,status,opened_date,related_wir,related_drawing",
      rfi: "rfi_id,location,subject,status,submitted_date,related_drawing",
      drawing: "drawing_id,title,revision,status,issue_date,location",
      submittal: "submittal_id,location,subject,material,revision,status,submission_date,related_mir,related_document"
    });
    const answer = answerQuestion("What is the status of WIR-1?", local, null).answer;
    expect(answer.facts.find((fact) => fact.label === "Review started")?.value).toBe("2 Sep 2026");
    expect(answer.facts.find((fact) => fact.label === "Consultant status")?.value).toBe("With consultant");
  });

  it("reports correspondence linked to an NCR", () => {
    const answer = ask("What correspondence relates to NCR-031?");
    expect(answer.verification).toBe("Verified from available project records");
    expect(answer.relatedIds).toContain("DOC-001");
    expect(answer.relatedIds).toContain("RFI-077");
  });

  it("asks for the record when correspondence has no target", () => {
    const answer = ask("Show me the correspondence.");
    expect(answer.verification).toBe("Cannot verify from available project records");
  });

  it("compares records and reports agreements on synthetic data", () => {
    const answer = ask("Compare WIR-1842 and NCR-031 and flag any conflicts.");
    expect(answer.verification).toBe("Verified from available project records");
    expect(answer.title).toContain("0 conflict");
    expect(answer.facts.map((fact) => fact.value).join(" ")).toContain("latest approved revision");
  });

  it("checks the whole project for conflicting information", () => {
    const answer = ask("Compare the available records and identify any conflicting information.");
    expect(answer.verification).toBe("Verified from available project records");
    expect(answer.title).toContain("conflict");
  });

  it("detects a status disagreement as a conflict", () => {
    const local = new ProjectStore({
      wir: "wir_id,location,submission_date,status,due_date,consultant_status\nWIR-1,L,2026-09-01,Approved,2026-09-05,Revise and resubmit",
      mir: "mir_id,location,material,submission_date,status,current_holder,related_document",
      ncr: "ncr_id,location,subject,status,opened_date,related_wir,related_drawing",
      rfi: "rfi_id,location,subject,status,submitted_date,related_drawing",
      drawing: "drawing_id,title,revision,status,issue_date,location",
      submittal: "submittal_id,location,subject,material,revision,status,submission_date,related_mir,related_document"
    });
    const answer = answerQuestion("Compare WIR-1 and flag conflicts.", local, null).answer;
    expect(answer.title).toContain("1 conflict");
    expect(answer.facts.map((fact) => fact.value).join(" ")).toContain("disagrees");
  });

  it("resolves pronoun follow-ups to the last record", () => {
    expect(resolvePronouns("What about its drawing?", "WIR-1842")).toBe("What about WIR-1842 drawing?");
    expect(resolvePronouns("What about its drawing?", null)).toBe("What about its drawing?");
    expect(resolvePronouns("What is the status of WIR-1842?", "MIR-302")).toBe(
      "What is the status of WIR-1842?"
    );
    const resolved = resolvePronouns("What is its status?", "MIR-302");
    const answer = answerQuestion(resolved, store, null).answer;
    expect(answer.title).toContain("MIR-302");
  });

  it("never surfaces document body text as instructions or facts", () => {
    // DOC-001's body discusses a deviation; no answer may repeat it as fact
    // or follow any instruction-like sentence it could contain.
    const answer = ask("What is the status of WIR-1842?");
    const body = `${answer.title}\n${answer.summary}\n${answer.facts.map((fact) => fact.value).join("\n")}`;
    expect(body).not.toContain("deviate");
    expect(body).not.toContain("observation");
  });

  it("refuses oversized files with a clear message", () => {
    expect(checkFileSize("huge.xlsx", 30 * 1024 * 1024)).toContain("over the 25 MB");
    expect(checkFileSize("ok.xlsx", 1024)).toBeNull();
  });

  it("answers a free-text material/location question with the line entry", () => {
    const local = new ProjectStore(MOP_SINK_BUNDLE);
    const answer = answerQuestion("What is the status of MIR for janitor room mop sink?", local, null).answer;
    expect(answer.verification).toBe("Verified from available project records");
    expect(answer.title).toContain("MIR-900");
    expect(answer.summary).toContain("Approved with Comments");
    expect(answer.evidence).toContain("MIR Register · MIR-900");
  });

  it("lists every match file-wise when several match a description", () => {
    const local = new ProjectStore({
      ...MOP_SINK_BUNDLE,
      mir:
        "mir_id,location,material,description,submission_date,status,current_holder,related_document\n" +
        "MIR-900,Janitor Room,Mop Sink,Mop sink with wall mounted faucet,2026-09-20,Approved with Comments,QA,MS-900\n" +
        "MIR-901,Janitor Room,Mop Sink,Mop sink with wall mounted faucet,2026-09-21,Draft,,MS-901"
    });
    const answer = answerQuestion("What is the status of MIR for janitor room mop sink?", local, null).answer;
    expect(answer.verification).toBe("Verified from available project records");
    expect(answer.title).toContain("Keyword search results");
    expect(answer.relatedIds).toContain("MIR-900");
    expect(answer.relatedIds).toContain("MIR-901");
  });

  it("lists keyword matches file-wise across all registers", () => {
    const local = new ProjectStore(
      {
        wir: "wir_id,location,submission_date,status,due_date",
        mir: "mir_id,location,material,description,submission_date,status,current_holder,related_document\nMIR-500,Delilah,Accessories,Grab bars for Delilah restaurant,2026-09-20,Approved,QA,MS-500",
        ncr: "ncr_id,location,subject,status,opened_date,related_wir,related_drawing",
        rfi: "rfi_id,location,subject,status,submitted_date,related_drawing",
        drawing: "drawing_id,title,revision,status,issue_date,location",
        submittal: "submittal_id,location,subject,material,revision,status,submission_date,related_mir,related_document\nSUB-500,Delilah,Grab bar submittal,Stainless,1,Approved,2026-09-21,MIR-500,MS-500"
      },
      toReferenceRecords([
        {
          file: "schedule.xlsx",
          sheet: "Schedule",
          headers: ["Item", "Supplier", "Location"],
          rows: [["Grab bar", "AL SHAYA", "DELILAH"]]
        }
      ])
    );
    const answer = answerQuestion("al shaya japanese delilah", local, null).answer;
    expect(answer.verification).toBe("Inferred from available project records");
    expect(answer.title).toContain("Possible matches");
    expect(answer.relatedIds).toContain("MIR-500");
    expect(answer.relatedIds).toContain("SUB-500");
    expect(answer.summary).toContain("MIR Register");
    expect(answer.summary).toContain("Submittal Register");
  });

  it("says keyword not found when nothing matches a substantive search", () => {
    const answer = answerQuestion("Search for zxqvfrobnicate widgets.", store, null).answer;
    expect(answer.verification).toBe("Cannot verify from available project records");
    expect(answer.summary).toContain("keyword not found. Try using another keyword.");
  });

  it("still clarifies the veneer question instead of guessing", () => {
    const result = answerQuestion("Is the MIR for veneer for Townhouse raised?", store, null);
    expect(result.answer.verification).toBe("Clarification required");
  });

  it("still lists draft MIRs via the count path", () => {
    const answer = answerQuestion("Show draft MIRs.", store, null).answer;
    expect(answer.relatedIds).toContain("MIR-303");
  });

  it("finds a delivery-note number inside a description line", () => {
    const local = new ProjectStore({
      wir: "wir_id,location,submission_date,status,due_date",
      mir: "mir_id,location,material,description,submission_date,status,current_holder,related_document\nMIR-965,Podium Zone 5,Lighting Fixtures,Lighting Fixtures from Triangle with attached Delivery Note No: 8145/2026,2026-07-01,ALEC Replied,QA,MS-965",
      ncr: "ncr_id,location,subject,status,opened_date,related_wir,related_drawing",
      rfi: "rfi_id,location,subject,status,submitted_date,related_drawing",
      drawing: "drawing_id,title,revision,status,issue_date,location",
      submittal: "submittal_id,location,subject,material,revision,status,submission_date,related_mir,related_document"
    });
    const answer = answerQuestion("Is the Delivery Note No: 8145/2026 inspected? Check MIR.", local, null).answer;
    expect(answer.verification).toBe("Verified from available project records");
    expect(answer.title).toContain("MIR-965");
    expect(answer.evidence).toContain("MIR Register · MIR-965");
  });

  it("answers mail questions with the correspondence entry", () => {
    const local = new ProjectStore({
      wir: "wir_id,location,submission_date,status,due_date",
      mir: "mir_id,location,material,submission_date,status,current_holder,related_document",
      ncr: "ncr_id,location,subject,status,opened_date,related_wir,related_drawing",
      rfi: "rfi_id,location,subject,status,submitted_date,related_drawing",
      drawing: "drawing_id,title,revision,status,issue_date,location",
      submittal: "submittal_id,location,subject,material,revision,status,submission_date,related_mir,related_document",
      mail: "mail_id,subject,date,sender,company,mail_type,discipline,related_mail,comments\nAFO-IN-001050,Work Inspection Request for Self-leveling Surface Preparation by Quix Flooring at Sales Office,2026-07-25,Gopu,ALEC FITOUT,Inspection Notice,Interior Design,,"
    });
    const direct = answerQuestion("What is AFO-IN-001050?", local, null).answer;
    expect(direct.title).toContain("AFO-IN-001050");
    expect(direct.verification).toBe("Verified from available project records");
    const search = answerQuestion("Search for self leveling for sales.", local, null).answer;
    expect(search.verification).toBe("Verified from available project records");
    expect(search.title).toContain("AFO-IN-001050");
  });
});
