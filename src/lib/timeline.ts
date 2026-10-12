import { WIR_1842_HISTORY, formatDate } from "../data/registers";
import type { RegisterView } from "../data/registers";

/**
 * Per-record timelines (Phase D1).
 * Events are assembled only from register dates and documented workflow
 * history; undated or unrecorded parts stay explicitly unknown.
 */

export interface TimelineEvent {
  /** ISO date, or null when no date is recorded. */
  date: string | null;
  event: string;
  detail: string;
  sourceRef: string;
}

/** Documented event timeline for any stored record id, or undefined. */
export function buildTimeline(view: RegisterView, id: string): TimelineEvent[] | undefined {
  const record = view.getRecord(id);
  if (record === undefined) return undefined;
  if (record.id === "WIR-1842") return WIR_1842_HISTORY;
  const ref = record.sourceRef;
  switch (record.kind) {
    case "WIR": {
      const wir = view.wirs.find((w) => w.id === record.id);
      if (wir === undefined) return undefined;
      return [
        {
          date: wir.submissionDate === "" ? null : wir.submissionDate,
          event: "Submitted",
          detail: `Submitted (${wir.location}).`,
          sourceRef: ref
        },
        {
          date: wir.dueDate === "" ? null : wir.dueDate,
          event: "Response due",
          detail: "Response due.",
          sourceRef: ref
        },
        {
          date: null,
          event: "Current state",
          detail: `Latest known state: ${wir.status}. No later event is recorded.`,
          sourceRef: ref
        }
      ];
    }
    case "MIR": {
      const mir = view.mirs.find((m) => m.id === record.id);
      if (mir === undefined) return undefined;
      return [
        {
          date: mir.submissionDate === "" ? null : mir.submissionDate,
          event: "Submitted",
          detail: `Submitted (${mir.material}, ${mir.location}).`,
          sourceRef: ref
        },
        {
          date: null,
          event: "Current state",
          detail: `Latest known state: ${mir.status}. No later event is recorded.`,
          sourceRef: ref
        }
      ];
    }
    case "NCR": {
      const ncr = view.ncrs.find((n) => n.id === record.id);
      if (ncr === undefined) return undefined;
      return [
        {
          date: ncr.openedDate === "" ? null : ncr.openedDate,
          event: "Opened",
          detail: `Opened (${ncr.subject}, ${ncr.location}).`,
          sourceRef: ref
        },
        {
          date: null,
          event: "Current state",
          detail: `Latest known state: ${ncr.status}. No later event is recorded.`,
          sourceRef: ref
        }
      ];
    }
    case "RFI": {
      const rfi = view.rfis.find((r) => r.id === record.id);
      if (rfi === undefined) return undefined;
      return [
        {
          date: rfi.submittedDate === "" ? null : rfi.submittedDate,
          event: "Submitted",
          detail: `Submitted (${rfi.subject}, ${rfi.location}).`,
          sourceRef: ref
        },
        {
          date: null,
          event: "Current state",
          detail: `Latest known state: ${rfi.status}. No later event is recorded.`,
          sourceRef: ref
        }
      ];
    }
    case "Submittal": {
      const sub = view.submittals.find((s) => s.id === record.id);
      if (sub === undefined) return undefined;
      return [
        {
          date: sub.submissionDate === "" ? null : sub.submissionDate,
          event: `Revision ${sub.revision} submitted`,
          detail: `${sub.subject} (${sub.location}).`,
          sourceRef: ref
        },
        {
          date: null,
          event: "Current state",
          detail: `Latest known state: ${sub.status}. No later event is recorded.`,
          sourceRef: ref
        }
      ];
    }
    case "Drawing": {
      const drawing = view.drawings.find((d) => d.id === record.id);
      if (drawing === undefined) return undefined;
      // Revision lineage: what changed across the drawing's life.
      const lineage = view.drawings
        .filter((other) => other.title === drawing.title)
        .sort((a, b) => a.issueDate.localeCompare(b.issueDate))
        .map(
          (revision): TimelineEvent => ({
            date: revision.issueDate === "" ? null : revision.issueDate,
            event: `Rev ${revision.revision} issued`,
            detail: `${revision.id} — ${revision.status}.`,
            sourceRef: `Drawing Register · ${revision.id}`
          })
        );
      return [
        ...lineage,
        {
          date: null,
          event: "Current state",
          detail: `Latest known state of ${drawing.id}: ${drawing.status}. No later event is recorded.`,
          sourceRef: ref
        }
      ];
    }
    default:
      return undefined;
  }
}

export function formatTimelineDate(iso: string | null): string {
  return iso === null ? "Date not recorded" : formatDate(iso);
}
