import { describe, expect, it } from "vitest";
import { checkAccess, getDemoUser } from "./lib/access";
import { queryById } from "./lib/retrieval";
import { resolveRelated } from "./lib/relationships";
import type { DocumentSource } from "./lib/retrieval";

const stub: DocumentSource = {
  listRecords: () => [],
  getRecord: (id: string) =>
    id === "WIR-1842"
      ? {
          kind: "WIR",
          id: "WIR-1842",
          projectId: "qubators-demo",
          status: "Pending Consultant Review",
          location: "Villa 43",
          sourceRef: "WIR Register · WIR-1842",
          relatedIds: ["NCR-031"],
          fields: {}
        }
      : id === "NCR-031"
        ? {
            kind: "NCR",
            id: "NCR-031",
            projectId: "qubators-demo",
            status: "Open",
            sourceRef: "NCR Register · NCR-031",
            relatedIds: [],
            fields: {}
          }
        : undefined
};

describe("Phase-0 scaffold boundaries", () => {
  it("restricts access to the demo project", () => {
    expect(checkAccess(getDemoUser(), "qubators-demo")).toBe(true);
    expect(checkAccess(getDemoUser(), "other-project")).toBe(false);
  });

  it("resolves a record by id (case-insensitive)", () => {
    expect(queryById(stub, "wir-1842")?.status).toBe("Pending Consultant Review");
    expect(queryById(stub, "UNKNOWN-1")).toBeUndefined();
  });

  it("traverses explicit relationships only", () => {
    const wir = queryById(stub, "WIR-1842");
    if (wir === undefined) throw new Error("stub missing WIR-1842");
    expect(resolveRelated(stub, wir).map((r) => r.id)).toEqual(["NCR-031"]);
  });
});
