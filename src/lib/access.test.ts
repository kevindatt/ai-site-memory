import { describe, expect, it } from "vitest";
import { store } from "../data/registers";
import { applyScope, getUser } from "./access";
import { answerQuestion } from "./respond";

const viewer = getUser("site-viewer");
if (viewer === undefined) throw new Error("site-viewer test user is missing.");

describe("scoped permissions (PRD §16)", () => {
  it("lets the restricted viewer see WIR-1842", () => {
    const answer = answerQuestion("What's the status of WIR-1842?", store, null, viewer).answer;
    expect(answer.verification).toBe("Verified from available project records");
  });

  it("denies the restricted viewer MIR-302 when named explicitly", () => {
    const answer = answerQuestion("Who is holding MIR-302?", store, null, viewer).answer;
    expect(answer.title).toContain("Access denied");
    expect(answer.evidence).toEqual([]);
  });

  it("finds no NCR link for the restricted viewer (NCR-031 is outside scope)", () => {
    const answer = answerQuestion("Which NCR is related to WIR-1842?", store, null, viewer).answer;
    expect(answer.verification).toBe("Cannot verify from available project records");
  });

  it("shows the restricted viewer no overdue WIRs (WIR-1844 is outside scope)", () => {
    const answer = answerQuestion("Which WIRs are overdue?", store, null, viewer).answer;
    expect(answer.verification).toBe("Cannot verify from available project records");
  });

  it("scopes the record view to Villa 43 WIRs, drawings and documents", () => {
    const view = applyScope(store, viewer);
    expect(view.wirs.map((wir) => wir.id)).toEqual(["WIR-1842"]);
    expect(view.mirs).toHaveLength(0);
    expect(view.ncrs).toHaveLength(0);
    expect(view.drawings.map((drawing) => drawing.id)).toEqual([
      "AR-043-Rev-A",
      "AR-043-Rev-B",
      "AR-043-Rev-C"
    ]);
    expect(view.getRecord("MIR-302")).toBeUndefined();
    expect(view.getRecord("WIR-1842")?.status).toBe("Pending Consultant Review");
  });
});
