import type { RegisterView } from "../data/registers";
import { getOverdueWirs } from "./retrieval";

/**
 * Monitoring watchers (Phase D3, opt-in style for the local prototype).
 * Each watcher names one exception condition; evaluateWatchers() reports the
 * currently triggered records. Users acknowledge records they have seen, so
 * the panel can highlight what is NEW since the last acknowledgement.
 * No background jobs in the prototype: checks run on demand and on data
 * reload. Nothing is sent anywhere — states are computed locally.
 */

export interface WatcherDef {
  id: string;
  label: string;
  description: string;
}

export const WATCHER_DEFS: WatcherDef[] = [
  {
    id: "overdue-wirs",
    label: "Overdue WIRs",
    description: "Fires while any WIR register status contains Overdue."
  },
  {
    id: "open-ncrs",
    label: "Open NCRs",
    description: "Fires while any NCR is Open."
  },
  {
    id: "draft-mirs",
    label: "Draft MIRs not yet raised",
    description: "Fires while any MIR is still a Draft."
  },
  {
    id: "drawings-for-review",
    label: "Drawings awaiting approval",
    description: "Fires while any drawing is For Review."
  }
];

export interface WatcherState {
  def: WatcherDef;
  triggered: boolean;
  recordIds: string[];
  newIds: string[];
}

const ACK_KEY = "asm-watchers-ack-v1";

function readAck(): Record<string, string[]> {
  try {
    if (typeof localStorage === "undefined") return {};
    const parsed = JSON.parse(localStorage.getItem(ACK_KEY) ?? "{}") as Record<string, string[]>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function evaluateWatchers(view: RegisterView): WatcherState[] {
  const ack = readAck();
  const triggered: Record<string, string[]> = {
    "overdue-wirs": getOverdueWirs(view).map((wir) => wir.id),
    "open-ncrs": view.ncrs.filter((ncr) => ncr.status === "Open").map((ncr) => ncr.id),
    "draft-mirs": view.mirs.filter((mir) => mir.status === "Draft").map((mir) => mir.id),
    "drawings-for-review": view.drawings
      .filter((drawing) => drawing.status === "For Review")
      .map((drawing) => drawing.id)
  };
  return WATCHER_DEFS.map((def) => {
    const recordIds = triggered[def.id] ?? [];
    const seen = new Set(ack[def.id] ?? []);
    return {
      def,
      triggered: recordIds.length > 0,
      recordIds,
      newIds: recordIds.filter((id) => !seen.has(id))
    };
  });
}

export function acknowledgeWatcher(watcherId: string, recordIds: string[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    const ack = readAck();
    const seen = new Set([...(ack[watcherId] ?? []), ...recordIds]);
    ack[watcherId] = [...seen];
    localStorage.setItem(ACK_KEY, JSON.stringify(ack));
  } catch {
    // Storage unavailable — acknowledgement stays session-local (ignored).
  }
}
