import { describe, expect, it } from "vitest";
import { LocalSourceConnector } from "./source";

describe("source connector lifecycle", () => {
  it("connects, refreshes, stales and disconnects local sources", () => {
    const connector = new LocalSourceConnector("local-files");
    const connected = connector.connect("picked files", "6 registers");
    expect(connected.status).toBe("connected");
    expect(connected.lastSyncAt).not.toBeNull();
    expect(connector.list()).toHaveLength(1);
    const refreshed = connector.refresh(connected.id, "6 registers, refreshed");
    expect(refreshed?.status).toBe("connected");
    const stale = connector.markStale(connected.id, "folder unreadable");
    expect(stale?.status).toBe("stale");
    connector.disconnect(connected.id);
    expect(connector.list()).toHaveLength(0);
  });

  it("ignores unknown ids instead of throwing", () => {
    const connector = new LocalSourceConnector("synthetic");
    expect(connector.refresh("nope", "x")).toBeUndefined();
    expect(connector.markStale("nope", "x")).toBeUndefined();
  });
});
