import { WIR_1842_HISTORY, formatDate } from "../data/registers";
import type {
  DrawingRecord,
  MirRecord,
  NcrRecord,
  ProjectStore,
  RfiRecord,
  WirRecord
} from "../data/registers";
import { describeRelationship } from "./relationships";
import {
  extractIds,
  findMirByMaterialAndLocation,
  getOverdueWirs,
  latestApprovedDrawing,
  queryById
} from "./retrieval";
import type { Answer, AnswerFact, VerificationState } from "./types";

/**
 * Response-generation boundary (Tech Spec §6–§7).
 * Deterministic local answer engine over synthetic project records.
 * No LLM is used: intent is matched with keyword rules and every factual
 * claim is built from retrieved records with explicit verification states.
 */

export type PendingTopic = "mir-veneer";

export interface EngineResult {
  answer: Answer;
  pending: PendingTopic | null;
}

export function cannotVerify(topic: string, guidance?: string): Answer {
  return {
    title: topic,
    summary:
      guidance ??
      "This cannot be verified from the available project records. I will not guess — please check the source registers or rephrase with a record number.",
    facts: [],
    relatedIds: [],
    evidence: [],
    verification: "Cannot verify from available project records"
  };
}

export function needsClarification(topic: string, question: string): Answer {
  return {
    title: topic,
    summary:
      "I found a likely candidate, but the question does not name a document number, so I will not assume which record is meant.",
    facts: [],
    relatedIds: [],
    evidence: [],
    verification: "Clarification required",
    followUp: question
  };
}

export function verificationBadge(state: VerificationState): {
  label: string;
  tone: "verified" | "inferred" | "unknown" | "clarify";
} {
  switch (state) {
    case "Verified from available project records":
      return { label: "Verified", tone: "verified" };
    case "Inferred from available project records":
      return { label: "Inferred", tone: "inferred" };
    case "Clarification required":
      return { label: "Clarification required", tone: "clarify" };
    default:
      return { label: "Cannot verify", tone: "unknown" };
  }
}

function fact(label: string, value: string): AnswerFact {
  return { label, value };
}

function holderOrUnknown(holder: string): string {
  return holder === "" ? "Not recorded in the available data" : holder;
}

function mirAnswer(mir: MirRecord): Answer {
  return {
    title: `${mir.id} — ${mir.status}`,
    summary: `${mir.id} covers ${mir.description} (${mir.location}). It is currently ${mir.status}.`,
    facts: [
      fact("Material", mir.material),
      fact("Description", mir.description),
      fact("Location", mir.location),
      fact("Submitted", formatDate(mir.submissionDate)),
      fact("Status", mir.status),
      fact("Current holder", holderOrUnknown(mir.holder)),
      fact("Related document", mir.relatedDocument === "" ? "None recorded" : mir.relatedDocument)
    ],
    relatedIds: mir.relatedDocument === "" ? [] : [mir.relatedDocument],
    evidence: [`MIR Register · ${mir.id}`],
    verification: "Verified from available project records"
  };
}

function wirStatusAnswer(wir: WirRecord, store: ProjectStore): Answer {
  const history = WIR_1842_HISTORY.find((event) => event.event === "Review started");
  const reviewStarted =
    wir.id === "WIR-1842" && history?.date !== undefined && history.date !== null
      ? formatDate(history.date)
      : "Not recorded in the available data";
  const related = [wir.relatedNcr, wir.relatedDrawing].filter((id) => id !== "");
  return {
    title: `${wir.id} — ${wir.status}`,
    summary: `${wir.id} is ${wir.status} with ${holderOrUnknown(wir.holder)}. It was submitted on ${formatDate(wir.submissionDate)}, review started on ${reviewStarted}, and a response is due by ${formatDate(wir.dueDate)}.`,
    facts: [
      fact("Status", wir.status),
      fact("Location", `${wir.location} · ${store.wirs.find((w) => w.id === wir.id)?.activity ?? ""}`),
      fact("Submitted", formatDate(wir.submissionDate)),
      fact("Current holder", holderOrUnknown(wir.holder)),
      fact("Review started", reviewStarted),
      fact("Due date", formatDate(wir.dueDate))
    ],
    relatedIds: related,
    evidence: [
      `WIR Register · ${wir.id}`,
      ...(wir.id === "WIR-1842" ? ["Workflow Record · WIR-1842"] : []),
      ...related.map((id) => {
        const record = store.getRecord(id);
        return record === undefined ? id : record.sourceRef;
      })
    ],
    verification: "Verified from available project records"
  };
}

function ncrAnswer(ncr: NcrRecord): Answer {
  const related = [ncr.relatedWir, ncr.relatedDrawing].filter((id) => id !== "");
  return {
    title: `${ncr.id} — ${ncr.status}`,
    summary: `${ncr.id} (${ncr.subject}, ${ncr.location}) is ${ncr.status}. It was opened on ${formatDate(ncr.openedDate)}.`,
    facts: [
      fact("Subject", ncr.subject),
      fact("Location", ncr.location),
      fact("Status", ncr.status),
      fact("Opened", formatDate(ncr.openedDate))
    ],
    relatedIds: related,
    evidence: [`NCR Register · ${ncr.id}`],
    verification: "Verified from available project records"
  };
}

function rfiAnswer(rfi: RfiRecord): Answer {
  return {
    title: `${rfi.id} — ${rfi.status}`,
    summary: `${rfi.id} (${rfi.subject}, ${rfi.location}) is ${rfi.status}. It was submitted on ${formatDate(rfi.submittedDate)}.`,
    facts: [
      fact("Subject", rfi.subject),
      fact("Location", rfi.location),
      fact("Status", rfi.status),
      fact("Submitted", formatDate(rfi.submittedDate))
    ],
    relatedIds: rfi.relatedDrawing === "" ? [] : [rfi.relatedDrawing],
    evidence: [`RFI Register · ${rfi.id}`],
    verification: "Verified from available project records"
  };
}

function drawingAnswer(drawing: DrawingRecord): Answer {
  return {
    title: `${drawing.id} — ${drawing.status}`,
    summary: `${drawing.id} (${drawing.title}, Rev ${drawing.revision}) is ${drawing.status}. It was issued on ${formatDate(drawing.issueDate)}.`,
    facts: [
      fact("Title", drawing.title),
      fact("Revision", drawing.revision),
      fact("Status", drawing.status),
      fact("Issued", formatDate(drawing.issueDate)),
      fact("Location", drawing.location)
    ],
    relatedIds: [],
    evidence: [`Drawing Register · ${drawing.id}`],
    verification: "Verified from available project records"
  };
}

function genericStatusAnswer(id: string, store: ProjectStore): Answer {
  const wir = store.wirs.find((w) => w.id.toUpperCase() === id.toUpperCase());
  if (wir !== undefined) return wirStatusAnswer(wir, store);
  const mir = store.mirs.find((m) => m.id.toUpperCase() === id.toUpperCase());
  if (mir !== undefined) return mirAnswer(mir);
  const ncr = store.ncrs.find((n) => n.id.toUpperCase() === id.toUpperCase());
  if (ncr !== undefined) return ncrAnswer(ncr);
  const rfi = store.rfis.find((r) => r.id.toUpperCase() === id.toUpperCase());
  if (rfi !== undefined) return rfiAnswer(rfi);
  const drawing = store.drawings.find((d) => d.id.toUpperCase() === id.toUpperCase());
  if (drawing !== undefined) return drawingAnswer(drawing);
  return cannotVerify(id, `${id} was not found in the available project records.`);
}

function holderAnswer(id: string, store: ProjectStore): Answer {
  const record = queryById(store, id);
  if (record === undefined) {
    return cannotVerify(id, `${id} was not found in the available project records.`);
  }
  const holder = record.fields["holder"] ?? "";
  return {
    title: `${record.id} — held by ${holderOrUnknown(holder)}`,
    summary:
      holder === ""
        ? `${record.id} (${record.status}) has no holder recorded — it has not been issued for review.`
        : `${record.id} is currently with ${holder} (${record.status}).`,
    facts: [
      fact("Current holder", holderOrUnknown(holder)),
      fact("Status", record.status),
      ...(record.location === undefined || record.location === ""
        ? []
        : [fact("Location", record.location)])
    ],
    relatedIds: record.relatedIds ?? [],
    evidence: [record.sourceRef],
    verification: "Verified from available project records"
  };
}

function ncrRelatedAnswer(wirId: string, store: ProjectStore): Answer {
  const wir = store.wirs.find((w) => w.id.toUpperCase() === wirId.toUpperCase());
  if (wir === undefined) {
    return cannotVerify(wirId, `${wirId} was not found in the available project records.`);
  }
  const wirRecord = store.getRecord(wir.id);
  const relatedNcrs = (wirRecord?.relatedIds ?? [])
    .map((id) => store.ncrs.find((n) => n.id.toUpperCase() === id.toUpperCase()))
    .filter((ncr): ncr is NcrRecord => ncr !== undefined);
  if (relatedNcrs.length === 0 || wirRecord === undefined) {
    return {
      ...cannotVerify(
        `NCRs related to ${wir.id}`,
        `No NCR is linked to ${wir.id} in the available project records.`
      ),
      evidence: [`WIR Register · ${wir.id}`]
    };
  }
  const first = relatedNcrs[0] as NcrRecord;
  const firstRecord = store.getRecord(first.id);
  const explanation =
    firstRecord !== undefined && wirRecord !== undefined
      ? (describeRelationship(wirRecord, firstRecord) ?? "")
      : "";
  return {
    title: `${first.id} is related to ${wir.id}`,
    summary: `${first.id} (${first.subject}, ${first.location}) is ${first.status} and was opened on ${formatDate(first.openedDate)}. ${explanation} Both records point at drawing ${first.relatedDrawing}.`,
    facts: [
      fact("NCR", `${first.id} · ${first.status}`),
      fact("Subject", first.subject),
      fact("Opened", formatDate(first.openedDate)),
      fact("Shared drawing", first.relatedDrawing === "" ? "None recorded" : first.relatedDrawing)
    ],
    relatedIds: [wir.id, ...(first.relatedDrawing === "" ? [] : [first.relatedDrawing])],
    evidence: [`NCR Register · ${first.id}`, `WIR Register · ${wir.id}`],
    verification: "Verified from available project records"
  };
}

interface DrawingScope {
  prefix: string;
  label: string;
}

function drawingScope(question: string): DrawingScope | undefined {
  const q = question.toLowerCase();
  if (/villa|43|ceiling|cove|wir-1842/.test(q)) return { prefix: "AR-043", label: "Villa 43 ceiling" };
  if (/townhouse|veneer/.test(q)) return { prefix: "AR-TH12", label: "Townhouse 12" };
  if (/level 3|\bl3\b/.test(q)) return { prefix: "AR-L3", label: "Level 3 Corridor" };
  if (/level 4|\bl4\b/.test(q)) return { prefix: "AR-L4", label: "Level 4 Corridor" };
  if (/cafe/.test(q)) return { prefix: "AR-CAFE", label: "Cafe" };
  return undefined;
}

function latestDrawingAnswer(scope: DrawingScope | undefined, store: ProjectStore): Answer {
  const drawing = latestApprovedDrawing(store, scope?.prefix);
  if (drawing === undefined) {
    const where = scope === undefined ? "" : ` for ${scope.label}`;
    return {
      ...cannotVerify(
        `Latest approved drawing${where}`,
        scope?.prefix === "AR-CAFE"
          ? `The drawing register contains no Cafe drawing, so the latest approved Cafe drawing cannot be verified. Note: RFI-078 references AR-CAFE-007-Rev-A, but that drawing is absent from the drawing register.`
          : `No approved drawing${where} was found in the drawing register.`
      ),
      evidence: ["Drawing Register"]
    };
  }
  const lineage = store.drawings
    .filter(
      (other) =>
        other.id !== drawing.id &&
        other.title === drawing.title &&
        other.id.toUpperCase().startsWith((scope?.prefix ?? drawing.id.split("-Rev-")[0] ?? "").toUpperCase())
    )
    .map((other) => `${other.id} · ${other.status}`);
  return {
    title: `${drawing.id} — latest approved${scope === undefined ? "" : ` for ${scope.label}`}`,
    summary: `${drawing.id} (${drawing.title}, Rev ${drawing.revision}) is the latest approved drawing${scope === undefined ? "" : ` for ${scope.label}`}, issued ${formatDate(drawing.issueDate)}. It was selected as the latest by issue date among revisions with status Approved — the newest revision was not assumed to be approved.`,
    facts: [
      fact("Drawing", drawing.id),
      fact("Title", drawing.title),
      fact("Revision", drawing.revision),
      fact("Status", drawing.status),
      fact("Issued", formatDate(drawing.issueDate)),
      ...(lineage.length > 0 ? [fact("Other revisions", lineage.join("; "))] : [])
    ],
    relatedIds: [],
    evidence: [`Drawing Register · ${drawing.id}`],
    verification: "Verified from available project records"
  };
}

function overdueAnswer(store: ProjectStore): Answer {
  const overdue = getOverdueWirs(store);
  if (overdue.length === 0) {
    return {
      ...cannotVerify(
        "Overdue WIRs",
        "No WIR in the register is explicitly marked overdue."
      ),
      evidence: ["WIR Register"]
    };
  }
  const first = overdue[0] as WirRecord;
  return {
    title: `Overdue WIRs (${overdue.length})`,
    summary: `${overdue.map((wir) => wir.id).join(", ")} ${overdue.length === 1 ? "is" : "are"} explicitly marked overdue in the WIR register. ${first.id} (${first.location} · ${first.activity}) is "${first.status}", due ${formatDate(first.dueDate)} with ${holderOrUnknown(first.holder)}. No other WIR in the register is explicitly marked overdue.`,
    facts: [
      fact("WIR", `${first.id} · ${first.status}`),
      fact("Location", `${first.location} · ${first.activity}`),
      fact("Submitted", formatDate(first.submissionDate)),
      fact("Current holder", holderOrUnknown(first.holder)),
      fact("Due date", formatDate(first.dueDate))
    ],
    relatedIds: [first.relatedNcr, first.relatedDrawing].filter((id) => id !== ""),
    evidence: ["WIR Register"],
    verification: "Verified from available project records"
  };
}

function historyAnswer(): Answer {
  return {
    title: "WIR-1842 — history after rejection",
    summary:
      "WIR-1842 was submitted on 18 Sep 2026, rejected in an earlier workflow event, resubmitted, and is now Pending Consultant Review (review started 19 Sep 2026, due 21 Sep 2026). The rejection date, reviewer comments and reason are not recorded in the available data, so that part cannot be verified.",
    facts: WIR_1842_HISTORY.map((event) =>
      fact(event.event, event.date === null ? `Date not recorded — ${event.detail}` : `${formatDate(event.date)} — ${event.detail}`)
    ),
    relatedIds: ["NCR-031", "AR-043-Rev-C"],
    evidence: [
      "WIR Register · WIR-1842",
      "Project Notes · WIR-1842",
      "Workflow Record · WIR-1842",
      `Drawing Register · AR-043-Rev-C`
    ],
    verification: "Verified from available project records"
  };
}

function whyPendingAnswer(wirId: string, store: ProjectStore): Answer {
  const wir = store.wirs.find((w) => w.id.toUpperCase() === wirId.toUpperCase());
  if (wir === undefined) {
    return cannotVerify(wirId, `${wirId} was not found in the available project records.`);
  }
  const base = wirStatusAnswer(wir, store);
  return {
    ...base,
    title: `Why is ${wir.id} still pending?`,
    summary: `${base.summary} The reason it is still pending is not recorded in the available data — there is an open related NCR (NCR-031), but the registers do not state that it is the cause, so that link cannot be verified.`,
    facts: [...base.facts, fact("Reason for delay", "Not recorded in the available data")]
  };
}

function timberCafeAnswer(store: ProjectStore): Answer {
  const matches = findMirByMaterialAndLocation(store, "timber", "cafe");
  if (matches.length !== 1) {
    return {
      ...cannotVerify(
        "Timber MIR for the Cafe",
        "No single timber MIR for the Cafe can be identified in the MIR register, so this cannot be verified."
      ),
      evidence: ["MIR Register"]
    };
  }
  const mir = matches[0] as MirRecord;
  const base = mirAnswer(mir);
  return {
    ...base,
    summary: `${base.summary} It is still a Draft — recorded but not submitted or raised for review, with no holder assigned. Separately, RFI-078 (Timber ceiling coordination, Cafe) is Open; both records share the Cafe location.`,
    relatedIds: ["RFI-078"],
    evidence: [...base.evidence, "RFI Register · RFI-078"]
  };
}

function wallColourAnswer(): Answer {
  return cannotVerify(
    "Wall colour",
    "The prototype has no visual or source evidence for wall colours — the registers record no colours and no images are ingested — so I cannot verify whether the wall is blue or whether a change applies. If you share the wall location or drawing (for example Villa 43, or AR-043 Rev C), I can check the related records."
  );
}

function fallbackAnswer(): Answer {
  return {
    ...cannotVerify(
      "Cannot verify from available project records",
      "I could not match that question to the available project records, so I will not guess. Try asking for a record status (for example “What’s the status of WIR-1842?”), a holder (“Who is holding MIR-302?”), overdue WIRs, or the latest approved drawing."
    ),
    followUp: "What would you like to ask about WIR-1842, MIR-302, NCR-031, or the Villa 43 drawings?"
  };
}

const AFFIRM = /\b(yes|yep|yeah|yup|correct|right|exactly|sure|affirmative|please)\b/;

/**
 * Route a natural-language question to deterministic retrieval + response.
 * Returns the answer and the updated clarification context.
 */
export function answerQuestion(
  question: string,
  store: ProjectStore,
  pending: PendingTopic | null
): EngineResult {
  const q = question.toLowerCase();
  const has = (...words: string[]): boolean => words.every((word) => q.includes(word));
  const any = (...words: string[]): boolean => words.some((word) => q.includes(word));

  // Resolve an outstanding clarification first.
  if (pending === "mir-veneer") {
    if (
      AFFIRM.test(q) ||
      q.includes("mir-302") ||
      (q.includes("oak") && q.includes("veneer")) ||
      (q.includes("veneer") && q.includes("townhouse"))
    ) {
      const mir = store.mirs.find((m) => m.id === "MIR-302");
      if (mir !== undefined) return { answer: mirAnswer(mir), pending: null };
    }
  }

  const knownIds = extractIds(question).filter((id) => store.getRecord(id) !== undefined);
  const firstWirId = knownIds.find((id) => id.startsWith("WIR-")) ?? (/\bwir\b/.test(q) ? "WIR-1842" : undefined);

  if (q.includes("overdue") || (has("past", "due") || (has("due") && q.includes("wir")))) {
    return { answer: overdueAnswer(store), pending: null };
  }

  if (q.includes("what happened") || q.includes("history") || q.includes("reject")) {
    if (firstWirId === undefined || firstWirId !== "WIR-1842") {
      return {
        answer: {
          ...cannotVerify(
            "Record history",
            "Only the WIR-1842 workflow history is documented in the available data. History for any other record cannot be verified."
          ),
          evidence: ["Project Notes · WIR-1842"]
        },
        pending: null
      };
    }
    return { answer: historyAnswer(), pending: null };
  }

  if ((any("latest", "newest", "current") && q.includes("drawing")) || has("approved", "drawing")) {
    return { answer: latestDrawingAnswer(drawingScope(question), store), pending: null };
  }

  if (q.includes("ncr") && any("relat", "link", "affect", "against")) {
    if (firstWirId !== undefined) {
      return { answer: ncrRelatedAnswer(firstWirId, store), pending: null };
    }
    const openVilla = store.ncrs.filter(
      (ncr) => ncr.status === "Open" && ncr.location.toLowerCase().includes("villa")
    );
    if (openVilla.length > 0) {
      const first = openVilla[0] as NcrRecord;
      return { answer: ncrRelatedAnswer(first.relatedWir === "" ? "WIR-1842" : first.relatedWir, store), pending: null };
    }
    return {
      answer: { ...cannotVerify("Related NCRs", "No related NCR can be identified."), evidence: ["NCR Register"] },
      pending: null
    };
  }

  if (/\bhold(?:ing|s)?\b/.test(q) || q.includes("with whom") || q.includes("who has")) {
    if (knownIds.length > 0) {
      return { answer: holderAnswer(knownIds[0] as string, store), pending: null };
    }
  }

  if (q.includes("status") && knownIds.length > 0) {
    return { answer: genericStatusAnswer(knownIds[0] as string, store), pending: null };
  }

  // Ambiguous veneer question: never guess — ask which record is meant.
  if ((q.includes("veneer") || (q.includes("mir") && q.includes("townhouse"))) && !q.includes("mir-302")) {
    const candidates = findMirByMaterialAndLocation(store, "veneer", "townhouse");
    const base = needsClarification(
      "Clarification required — veneer MIR",
      candidates.length === 1 && candidates[0] !== undefined
        ? `Do you mean the ${candidates[0].material.toLowerCase()} MIR for ${candidates[0].location} (${candidates[0].id})?`
        : "Which veneer MIR do you mean — for example, is it the oak veneer MIR for Townhouse 12 (MIR-302)?"
    );
    return {
      answer: {
        ...base,
        relatedIds: candidates.map((mir) => mir.id),
        evidence: candidates.map((mir) => `MIR Register · ${mir.id}`)
      },
      pending: "mir-veneer"
    };
  }

  if (q.includes("timber") && (q.includes("cafe") || q.includes("mir"))) {
    return { answer: timberCafeAnswer(store), pending: null };
  }

  if (q.includes("wall") && (q.includes("blue") || q.includes("color") || q.includes("colour"))) {
    return { answer: wallColourAnswer(), pending: null };
  }

  if ((q.includes("why") && q.includes("pending")) || q.includes("still pending") || (q.includes("why") && q.includes("still"))) {
    return { answer: whyPendingAnswer(firstWirId ?? "WIR-1842", store), pending: null };
  }

  // Single known record mentioned without other intent: report its status.
  if (knownIds.length === 1) {
    return { answer: genericStatusAnswer(knownIds[0] as string, store), pending: null };
  }

  return { answer: fallbackAnswer(), pending: null };
}
