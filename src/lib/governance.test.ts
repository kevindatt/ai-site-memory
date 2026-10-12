import { describe, expect, it } from "vitest";
import { USERS, getUser } from "./access";
import { clearAudit, logAccess, readAudit } from "./audit";

describe("governance (ACL mapping + audit log)", () => {
  it("loads users and scopes from the local access-control mapping", () => {
    expect(USERS.map((user) => user.userId).sort()).toEqual(["demo-user", "site-viewer"]);
    expect(getUser("demo-user")?.scope).toBeUndefined();
    expect(getUser("site-viewer")?.scope?.kinds).toEqual(["WIR", "Drawing", "Document"]);
    expect(getUser("site-viewer")?.scope?.locations).toEqual(["Villa 43"]);
  });

  it("records and clears audit entries locally", () => {
    clearAudit();
    expect(readAudit()).toEqual([]);
    logAccess({
      ts: "2026-09-27T00:00:00.000Z",
      userId: "demo-user",
      question: "What is the status of WIR-1842?",
      verification: "Verified from available project records",
      evidenceRefs: 4,
      allowed: true
    });
    const entries = readAudit();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.allowed).toBe(true);
    expect(entries[0]?.userId).toBe("demo-user");
    clearAudit();
    expect(readAudit()).toEqual([]);
  });
});
