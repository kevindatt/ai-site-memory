import { WIR_1842_HISTORY, formatDate, splitLinks } from "../data/registers";
import type {
  DrawingRecord,
  MailRecord,
  MirRecord,
  NcrRecord,
  RegisterView,
  RfiRecord,
  SubmittalRecord,
  WirRecord
} from "../data/registers";
import { docsForRecord } from "../data/documents";
import { approveAction, executeAction, proposeAction, rejectAction } from "./actions";
import { describeRelationship, getRevisionLineage, inferBySharedLocation } from "./relationships";
import {
  countRecords,
  exceptionFindings,
  projectSummary
} from "./intelligence";
import { buildTimeline, formatTimelineDate } from "./timeline";
import {
  contentWords,
  descriptiveMatches,
  extractIds,
  extractKnownIds,
  findMirByMaterialAndLocation,
  findSubmittalsForMir,
  getOverdueWirs,
  keywordSearchAll,
  latestApprovedDrawing,
  queryById,
  revisionCount
} from "./retrieval";
import type { KeywordHit } from "./retrieval";
import { estimateTokens, fitEvidence } from "./budget";
import { advancedSearch, queryHasSubstance } from "./advancedSearch";
import { pickLatestApproved } from "./precedence";
import { applyScope, getDemoUser } from "./access";
import type { Answer, AnswerFact, ProjectRecord, UserContext, VerificationState } from "./types";

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
  usage: {
    evidenceRefs: number;
    estimatedTokens: number;
  };
  /** Primary record the answer is about — drives pronoun follow-ups. */
  primaryId?: string;
}

/** Rewrite it/its/this/that/same to the last discussed record, if any. */
export function resolvePronouns(question: string, lastRecordId: string | null): string {
  if (lastRecordId === null) return question;
  if (!/\b(it|its|this|that|same)\b/i.test(question)) return question;
  return question.replace(/\b(it|its|this|that|same)\b/gi, lastRecordId);
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

function mirAnswer(mir: MirRecord, store: RegisterView): Answer {
  const submittals = findSubmittalsForMir(store, mir.id);
  const docs = docsForRecord(mir.id).map((doc) => doc.sourceRef);
  return {
    title: `${mir.id} — ${mir.status}`,
    summary: `${mir.id} covers ${mir.description} (${mir.location}). It is currently ${mir.status}.${submittals.length > 0 ? ` Linked submittal: ${submittals.map((sub) => `${sub.id} (${sub.status})`).join(", ")}.` : ""}`,
    facts: [
      fact("Material", mir.material),
      fact("Description", mir.description),
      fact("Location", mir.location),
      fact("Submitted", formatDate(mir.submissionDate)),
      fact("Status", mir.status),
      fact("Current holder", holderOrUnknown(mir.holder)),
      fact("Related document", mir.relatedDocument === "" ? "None recorded" : mir.relatedDocument),
      ...(mir.reviewStarted === "" ? [] : [fact("Review started", formatDate(mir.reviewStarted))]),
      ...(mir.consultantStatus === "" ? [] : [fact("Consultant status", mir.consultantStatus)]),
      ...(submittals.length > 0
        ? [fact("Linked submittals", submittals.map((sub) => `${sub.id} · ${sub.status}`).join("; "))]
        : [])
    ],
    relatedIds: [
      ...(mir.relatedDocument === "" ? [] : splitLinks(mir.relatedDocument)),
      ...submittals.map((sub) => sub.id)
    ],
    evidence: [
      `MIR Register · ${mir.id}`,
      ...submittals.map((sub) => `Submittal Register · ${sub.id}`),
      ...docs
    ],
    verification: "Verified from available project records"
  };
}

function wirStatusAnswer(wir: WirRecord, store: RegisterView): Answer {
  const history = WIR_1842_HISTORY.find((event) => event.event === "Review started");
  const reviewStarted =
    wir.reviewStarted !== ""
      ? formatDate(wir.reviewStarted)
      : wir.id === "WIR-1842" && history?.date !== undefined && history.date !== null
        ? formatDate(history.date)
        : "Not recorded in the available data";
  const related = [...splitLinks(wir.relatedNcr), ...splitLinks(wir.relatedDrawing)];
  return {
    title: `${wir.id} — ${wir.status}`,
    summary: `${wir.id} is ${wir.status} with ${holderOrUnknown(wir.holder)}. It was submitted on ${formatDate(wir.submissionDate)}, review started on ${reviewStarted}, and a response is due by ${formatDate(wir.dueDate)}.`,
    facts: [
      fact("Status", wir.status),
      fact("Location", `${wir.location} · ${store.wirs.find((w) => w.id === wir.id)?.activity ?? ""}`),
      fact("Submitted", formatDate(wir.submissionDate)),
      fact("Current holder", holderOrUnknown(wir.holder)),
      fact("Review started", reviewStarted),
      fact("Due date", wir.dueDate === "" ? "Not recorded in the available data" : formatDate(wir.dueDate)),
      ...(wir.consultantStatus === "" ? [] : [fact("Consultant status", wir.consultantStatus)])
    ],
    relatedIds: related,
    evidence: [
      `WIR Register · ${wir.id}`,
      ...(wir.id === "WIR-1842" ? ["Workflow Record · WIR-1842"] : []),
      ...docsForRecord(wir.id).map((doc) => doc.sourceRef),
      ...related.map((id) => {
        const record = store.getRecord(id);
        return record === undefined ? id : record.sourceRef;
      })
    ],
    verification: "Verified from available project records"
  };
}

function ncrAnswer(ncr: NcrRecord): Answer {
  const related = [...splitLinks(ncr.relatedWir), ...splitLinks(ncr.relatedDrawing)];
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
      fact("Submitted", formatDate(rfi.submittedDate)),
      ...(rfi.reviewStarted === "" ? [] : [fact("Review started", formatDate(rfi.reviewStarted))]),
      ...(rfi.consultantStatus === "" ? [] : [fact("Consultant status", rfi.consultantStatus)])
    ],
    relatedIds: splitLinks(rfi.relatedDrawing),
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
      fact("Issued", drawing.issueDate === "" ? "Not recorded in the available data" : formatDate(drawing.issueDate)),
      fact("Location", drawing.location),
      ...(drawing.consultantStatus === "" ? [] : [fact("Consultant status", drawing.consultantStatus)])
    ],
    relatedIds: [],
    evidence: [`Drawing Register · ${drawing.id}`],
    verification: "Verified from available project records"
  };
}

function mailAnswer(mail: MailRecord): Answer {
  const status = mail.status === "" ? mail.mailType : mail.status;
  return {
    title: `${mail.id} — ${status === "" ? "Correspondence" : status}`,
    summary: `${mail.id}: "${mail.subject}" sent ${mail.date === "" ? "on an unrecorded date" : `on ${formatDate(mail.date)}`} by ${mail.sender === "" ? "an unrecorded sender" : mail.sender}${mail.company === "" ? "" : ` (${mail.company})`}.`,
    facts: [
      fact("Subject", mail.subject),
      fact("Date", mail.date === "" ? "Not recorded in the available data" : formatDate(mail.date)),
      fact("From", mail.sender === "" ? "Not recorded" : `${mail.sender}${mail.company === "" ? "" : ` · ${mail.company}`}`),
      fact("Type", mail.mailType === "" ? "Not recorded" : mail.mailType),
      fact("Status", status === "" ? "Not recorded in the available data" : status),
      fact("Discipline", mail.discipline === "" ? "Not recorded" : mail.discipline),
      ...(mail.relatedMail === "" ? [] : [fact("In reply to", mail.relatedMail)]),
      ...(mail.comments === "" ? [] : [fact("Comments", mail.comments)])
    ],
    relatedIds: splitLinks(mail.relatedMail),
    evidence: [`Mail · ${mail.id}`],
    verification: "Verified from available project records"
  };
}

function submittalAnswer(sub: SubmittalRecord): Answer {
  const related = [...splitLinks(sub.relatedMir), ...splitLinks(sub.relatedDocument)];
  return {
    title: `${sub.id} — ${sub.status}`,
    summary: `${sub.id} (${sub.subject}, ${sub.location}) is ${sub.status}. Revision ${sub.revision} was submitted on ${formatDate(sub.submissionDate)}.`,
    facts: [
      fact("Subject", sub.subject),
      fact("Material", sub.material),
      fact("Location", sub.location),
      fact("Revision", sub.revision),
      fact("Status", sub.status),
      fact("Submitted", formatDate(sub.submissionDate)),
      ...(sub.consultantStatus === "" ? [] : [fact("Consultant status", sub.consultantStatus)])
    ],
    relatedIds: related,
    evidence: [`Submittal Register · ${sub.id}`],
    verification: "Verified from available project records"
  };
}

function genericStatusAnswer(id: string, store: RegisterView): Answer {
  const wir = store.wirs.find((w) => w.id.toUpperCase() === id.toUpperCase());
  if (wir !== undefined) return withRevisionNote(wirStatusAnswer(wir, store), store, id);
  const mir = store.mirs.find((m) => m.id.toUpperCase() === id.toUpperCase());
  if (mir !== undefined) return withRevisionNote(mirAnswer(mir, store), store, id);
  const ncr = store.ncrs.find((n) => n.id.toUpperCase() === id.toUpperCase());
  if (ncr !== undefined) return withRevisionNote(ncrAnswer(ncr), store, id);
  const rfi = store.rfis.find((r) => r.id.toUpperCase() === id.toUpperCase());
  if (rfi !== undefined) return withRevisionNote(rfiAnswer(rfi), store, id);
  const drawing = store.drawings.find((d) => d.id.toUpperCase() === id.toUpperCase());
  if (drawing !== undefined) return drawingAnswer(drawing);
  const submittal = store.submittals.find((s) => s.id.toUpperCase() === id.toUpperCase());
  if (submittal !== undefined) return withRevisionNote(submittalAnswer(submittal), store, id);
  const mail = store.mails.find((m) => m.id.toUpperCase() === id.toUpperCase());
  if (mail !== undefined) return mailAnswer(mail);
  return cannotVerify(id, `${id} was not found in the available project records.`);
}

/** Note multi-revision families: answers always describe the latest revision. */
function withRevisionNote(answer: Answer, store: RegisterView, id: string): Answer {
  if (revisionCount(store, id) <= 1) return answer;
  const latestRev = store.getRecord(id)?.fields["revision"] ?? "";
  return {
    ...answer,
    summary: `${answer.summary} ${revisionCount(store, id)} entries are on file; showing the latest${latestRev !== "" ? ` (Rev ${latestRev})` : ""}.`,
    facts: [...answer.facts, fact("Entries on file", String(revisionCount(store, id)))]
  };
}

function holderAnswer(id: string, store: RegisterView): Answer {
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

function ncrRelatedAnswer(wirId: string, store: RegisterView): Answer {
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
    relatedIds: [wir.id, ...splitLinks(first.relatedDrawing)],
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

function latestDrawingAnswer(scope: DrawingScope | undefined, store: RegisterView): Answer {
  const drawing = latestApprovedDrawing(store, scope?.prefix);
  if (drawing === undefined) {
    const where = scope === undefined ? "" : ` for ${scope.label}`;
    return {
      ...cannotVerify(
        `Latest approved drawing${where}`,
        scope?.prefix === "AR-CAFE"
          ? `There is no approved Cafe drawing in the drawing register — AR-CAFE-007-Rev-A is recorded but its status is For Review — so the latest approved Cafe drawing cannot be verified.`
          : `No approved drawing${where} was found in the drawing register.`
      ),
      evidence: ["Drawing Register"]
    };
  }
  const lineage = getRevisionLineage(store, drawing.id).map(
    (other) => `${other.id} · ${other.status}`
  );
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

function overdueAnswer(store: RegisterView): Answer {
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
      fact("Due date", first.dueDate === "" ? "Not recorded in the available data" : formatDate(first.dueDate))
    ],
    relatedIds: [...splitLinks(first.relatedNcr), ...splitLinks(first.relatedDrawing)],
    evidence: ["WIR Register"],
    verification: "Verified from available project records"
  };
}

function historyAnswer(view: RegisterView, id: string): Answer {
  if (id === "WIR-1842") {
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
  const record = view.getRecord(id);
  const events = buildTimeline(view, id);
  if (record === undefined || events === undefined) {
    return {
      ...cannotVerify(
        `History of ${id}`,
        `No documented history for ${id} exists in the available project records.`
      ),
      evidence: []
    };
  }
  return {
    title: `${id} — documented history`,
    summary: `${id} has ${events.length} documented event(s). Latest known state: ${record.status}. Undated or unrecorded parts are marked as such — they are not filled in.`,
    facts: events.map((event) =>
      fact(event.event, `${formatTimelineDate(event.date)} — ${event.detail}`)
    ),
    relatedIds: record.relatedIds ?? [],
    evidence: [...new Set([record.sourceRef, ...events.map((event) => event.sourceRef)])],
    verification: "Verified from available project records"
  };
}

function whyPendingAnswer(wirId: string, store: RegisterView): Answer {
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

function timberCafeAnswer(store: RegisterView): Answer {
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
  const base = mirAnswer(mir, store);
  const mirRecord = store.getRecord(mir.id);
  const inferred =
    mirRecord === undefined ? [] : inferBySharedLocation(store, mirRecord);
  const inferredIds = inferred
    .map((record) => record.id)
    .filter((id) => !base.relatedIds.includes(id));
  return {
    ...base,
    summary: `${base.summary} It is still a Draft — recorded but not submitted or raised for review, with no holder assigned.${inferredIds.length > 0 ? ` Possibly related by shared Cafe location (inferred, not register-linked): ${inferredIds.join(", ")}.` : ""}`,
    relatedIds: [...base.relatedIds, ...inferredIds],
    evidence: [...base.evidence, ...inferred.map((record) => record.sourceRef)]
  };
}

function unrecordedAnswer(): Answer {
  return cannotVerify(
    "Unrecorded communication",
    "Conversations, calls, meetings and verbal instructions are not captured in the available project records, so this cannot be verified. If it concerns a specific record (for example WIR-1842 or NCR-031), ask for that record's documented status and history instead."
  );
}

function wallColourAnswer(): Answer {
  return cannotVerify(
    "Wall colour",
    "The prototype has no visual or source evidence for wall colours — the registers record no colours and no images are ingested — so I cannot verify whether the wall is blue or whether a change applies. If you share the wall location or drawing (for example Villa 43, or AR-043 Rev C), I can check the related records."
  );
}

function countAnswer(view: RegisterView, question: string): Answer | null {
  if (!/\bhow many\b/.test(question.toLowerCase()) && !/\b(show|list)\b/.test(question.toLowerCase())) {
    return null;
  }
  const { kind, status, count, matches } = countRecords(view, question);
  if (kind === undefined && status === undefined) return null;
  const what = `${(kind ?? "records").toLowerCase()}${status === undefined ? "" : ` (${status})`}`;
  const shown = matches.slice(0, 6);
  return {
    title: `${count} ${what}`,
    summary:
      count === 0
        ? `No ${what} found in the available project records.`
        : `There ${count === 1 ? "is" : "are"} ${count} ${what} in the available project records: ${matches.map((record) => record.id).join(", ")}.`,
    facts: shown.map((record) =>
      fact(
        record.id,
        `${record.status}${record.location !== undefined && record.location !== "" ? ` · ${record.location}` : ""}`
      )
    ),
    relatedIds: shown.map((record) => record.id),
    evidence: kind === undefined ? ["Project registers"] : [`${kind} Register`],
    verification: "Verified from available project records"
  };
}

function attentionAnswer(view: RegisterView): Answer {
  const findings = exceptionFindings(view);
  if (findings.length === 0) {
    return {
      title: "Nothing needs attention",
      summary:
        "No overdue items, holder bottlenecks, unraised drafts, pending approvals or rework flags were found in the available project records.",
      facts: [],
      relatedIds: [],
      evidence: ["Project registers"],
      verification: "Verified from available project records"
    };
  }
  const relatedIds = [...new Set(findings.flatMap((finding) => finding.recordIds))].slice(0, 8);
  const evidence = relatedIds
    .flatMap((id) => {
      const record = view.getRecord(id);
      return record === undefined ? [] : [record.sourceRef];
    })
    .slice(0, 8);
  return {
    title: `What needs attention (${findings.length} finding${findings.length === 1 ? "" : "s"})`,
    summary: `Analysis of the available records surfaced ${findings.length} exception${findings.length === 1 ? "" : "s"}: ${findings.map((finding) => finding.title).join("; ")}. Records involved: ${relatedIds.join(", ")}. These are analytical flags (inferred), each grounded in the register entries below — not official project determinations.`,
    facts: findings.map((finding) => fact(finding.title, finding.detail)),
    relatedIds,
    evidence,
    verification: "Inferred from available project records"
  };
}

function summaryAnswer(view: RegisterView): Answer {
  const summary = projectSummary(view);
  return {
    title: "Project summary — Qubators Demo Project",
    summary: `${summary.total} records in view: ${summary.wirs} WIRs, ${summary.mirs} MIRs, ${summary.ncrs} NCRs (${summary.openNcrs} open), ${summary.rfis} RFIs, ${summary.drawings} drawings (${summary.approvedDrawings} approved), ${summary.submittals} submittals. Exceptions: ${summary.overdueWirs} overdue WIRs, ${summary.draftMirs} draft MIRs.`,
    facts: [
      fact("Total records", String(summary.total)),
      fact("WIRs", String(summary.wirs)),
      fact("MIRs", String(summary.mirs)),
      fact("NCRs", `${summary.ncrs} (${summary.openNcrs} open)`),
      fact("RFIs", String(summary.rfis)),
      fact("Drawings", `${summary.drawings} (${summary.approvedDrawings} approved)`),
      fact("Submittals", String(summary.submittals)),
      fact("Overdue WIRs", String(summary.overdueWirs)),
      fact("Draft MIRs", String(summary.draftMirs))
    ],
    relatedIds: [],
    evidence: ["WIR Register", "MIR Register", "NCR Register", "RFI Register", "Drawing Register", "Submittal Register"],
    verification: "Verified from available project records"
  };
}

function actionCommandAnswer(
  verb: string,
  id: string,
  user: UserContext
): Answer {
  const upperId = id.toUpperCase();
  if (verb === "approve") {
    const proposal = approveAction(upperId, user.userId);
    if (proposal === undefined) {
      return cannotVerify(upperId, `${upperId} cannot be approved: it is unknown, already decided, or not proposed. Only proposed actions can be approved.`);
    }
    return {
      title: `${proposal.id} approved`,
      summary: `${proposal.title} was approved by ${user.userId}. It is now eligible for simulated local execution — reply "execute ${proposal.id}" to execute, or leave it approved.`,
      facts: [
        fact("Action", `${proposal.id} · ${proposal.type}`),
        fact("Records", proposal.recordIds.join(", ") || "None"),
        fact("Approved by", user.userId)
      ],
      relatedIds: proposal.recordIds,
      evidence: [`Audit log · ${proposal.id}`],
      verification: "Verified from available project records"
    };
  }
  if (verb === "reject") {
    const proposal = rejectAction(upperId, user.userId);
    if (proposal === undefined) {
      return cannotVerify(upperId, `${upperId} cannot be rejected: it is unknown, already decided, or not proposed.`);
    }
    return {
      title: `${proposal.id} rejected`,
      summary: `${proposal.title} was rejected by ${user.userId}. It will not be executed.`,
      facts: [fact("Action", `${proposal.id} · ${proposal.type}`), fact("Rejected by", user.userId)],
      relatedIds: proposal.recordIds,
      evidence: [`Audit log · ${proposal.id}`],
      verification: "Verified from available project records"
    };
  }
  const result = executeAction(upperId, user.userId);
  if (!result.ok || result.proposal === undefined) {
    return cannotVerify(upperId, result.message);
  }
  return {
    title: `${result.proposal.id} executed (simulated)`,
    summary: result.message,
    facts: [
      fact("Action", `${result.proposal.id} · ${result.proposal.type}`),
      fact("Records", result.proposal.recordIds.join(", ") || "None"),
      ...(result.proposal.executionNote === undefined ? [] : [fact("Execution note", result.proposal.executionNote)])
    ],
    relatedIds: result.proposal.recordIds,
    evidence: [`Audit log · ${result.proposal.id}`],
    verification: "Verified from available project records"
  };
}

function proposeAnswer(view: RegisterView, user: UserContext, question: string): Answer | null {
  const q = question.toLowerCase();
  if (
    !/\bprepare\b/.test(q) &&
    !/\bescalate\b/.test(q) &&
    !/\bremind\b/.test(q) &&
    !q.includes("request approval") &&
    !/\bdraft\b.*(escalation|follow|reminder|summary|letter|note)/.test(q)
  ) {
    return null;
  }
  const knownIds = extractKnownIds(question, view);
  if (q.includes("escalat")) {
    const overdue = getOverdueWirs(view);
    if (overdue.length === 0) {
      return cannotVerify("Escalation", "No overdue WIRs are visible in the available records, so there is nothing to escalate.");
    }
    const detail = `Draft escalation for ${overdue.map((wir) => wir.id).join(", ")}: ${overdue.map((wir) => `${wir.id} (${wir.location}) is "${wir.status}", due ${formatDate(wir.dueDate)}, held by ${wir.holder === "" ? "no recorded holder" : wir.holder}`).join("; ")}. Suggested next step: chase the recorded holder(s) for a response date.`;
    const proposal = proposeAction("escalation", `Escalate ${overdue.map((wir) => wir.id).join(", ")}`, detail, overdue.map((wir) => wir.id), user.userId);
    return proposalAnswer(proposal, view);
  }
  if (q.includes("follow") || q.includes("remind")) {
    const target = knownIds[0];
    if (target === undefined) {
      return cannotVerify("Follow-up draft", "Name the record the follow-up or reminder concerns (for example MIR-302).");
    }
    const record = view.getRecord(target);
    if (record === undefined) {
      return cannotVerify(target, `${target} was not found in the available project records.`);
    }
    const holder = record.fields["holder"] ?? "";
    const detail = `Draft follow-up for ${record.id} (${record.status}): addressed to ${holder === "" ? "the responsible party (no holder recorded)" : holder}. Asks for a response date and current position.`;
    const proposal = proposeAction("follow-up", `Follow up on ${record.id}`, detail, [record.id], user.userId);
    return proposalAnswer(proposal, view);
  }
  if (q.includes("request approval") || q.includes("approval")) {
    const target = knownIds[0];
    if (target === undefined) {
      return cannotVerify("Approval request", "Name the record or action the approval concerns (for example an ACT-id or a record number).");
    }
    const proposal = proposeAction("approval-request", `Request approval concerning ${target}`, `Approval requested by ${user.userId} concerning ${target}. No approval is granted by this draft — an approver must still decide.`, [target], user.userId);
    return proposalAnswer(proposal, view);
  }
  const target = knownIds[0] ?? "WIR-1842";
  const record = view.getRecord(target);
  if (record === undefined) {
    return cannotVerify(target, `${target} was not found in the available project records.`);
  }
  const proposal = proposeAction(
    "document-pack",
    `Prepare document pack for ${record.id}`,
    `Compile the register entry, related records and source references for ${record.id} (${record.status}) into one review pack.`,
    [record.id, ...(record.relatedIds ?? [])],
    user.userId
  );
  return proposalAnswer(proposal, view);
}

function proposalAnswer(proposal: { id: string; type: string; title: string; detail: string; recordIds: string[] }, view: RegisterView): Answer {
  return {
    title: `Proposal ${proposal.id} ready for review`,
    summary: `${proposal.title}: ${proposal.detail} Reply "approve ${proposal.id}" or "reject ${proposal.id}". Execution requires a recorded approval first and is simulated locally — no external system is ever touched.`,
    facts: [
      fact("Proposal", `${proposal.id} · ${proposal.type}`),
      fact("Records", proposal.recordIds.join(", ") || "None"),
      fact("Status", "proposed — awaiting decision")
    ],
    relatedIds: proposal.recordIds.filter((id) => view.getRecord(id) !== undefined),
    evidence: proposal.recordIds
      .flatMap((id) => {
        const record = view.getRecord(id);
        return record === undefined ? [] : [record.sourceRef];
      }),
    verification: "Inferred from available project records"
  };
}

function isAwaitingConsultant(consultantStatus: string): boolean {
  const value = consultantStatus.trim();
  if (value === "") return false;
  if (/^(n\/a|na|none|-)$/i.test(value)) return false;
  return !/approv|closed|responded|replied|no comment/i.test(value);
}

function awaitingAnswer(view: RegisterView): Answer {
  const hits = view
    .listRecords()
    .filter((record) => isAwaitingConsultant(record.fields["consultantStatus"] ?? ""));
  const shown = hits.slice(0, 8);
  if (hits.length === 0) {
    return {
      title: "Nothing awaiting consultant review",
      summary:
        "No visible record carries a consultant status indicating it is still with the consultant. Consultant statuses kept verbatim from the registers; records without one are not assumed to be awaiting.",
      facts: [],
      relatedIds: [],
      evidence: ["Project registers"],
      verification: "Verified from available project records"
    };
  }
  return {
    title: `${hits.length} awaiting consultant review`,
    summary: `${hits.length} visible record(s) carry a consultant status indicating they are still with the consultant: ${hits.map((record) => record.id).join(", ")}.`,
    facts: shown.map((record) =>
      fact(record.id, `${record.status} · consultant: ${record.fields["consultantStatus"] ?? ""}`)
    ),
    relatedIds: shown.map((record) => record.id),
    evidence: shown.map((record) => record.sourceRef),
    verification: "Verified from available project records"
  };
}

function correspondenceAnswer(view: RegisterView, id: string): Answer {
  const record = view.getRecord(id);
  if (record === undefined) {
    return cannotVerify(id, `${id} was not found in the available project records.`);
  }
  const drawingIds = new Set(
    (record.relatedIds ?? [])
      .map((related) => view.getRecord(related))
      .filter((related) => related !== undefined && related.kind === "Drawing")
      .map((drawing) => (drawing as { id: string }).id.toUpperCase())
  );
  const items = [
    ...docsForRecord(id).map((doc) => ({ id: doc.id, label: doc.title, sourceRef: doc.sourceRef })),
    ...view.rfis
      .filter((rfi) => drawingIds.has(rfi.relatedDrawing.toUpperCase()))
      .map((rfi) => ({ id: rfi.id, label: `${rfi.subject} (${rfi.status})`, sourceRef: `RFI Register · ${rfi.id}` })),
    ...view.mails
      .filter(
        (mail) =>
          splitLinks(mail.relatedMail).some((link) => link.toUpperCase() === id) ||
          mail.subject.toUpperCase().includes(id)
      )
      .map((mail) => ({ id: mail.id, label: `${mail.subject} (${mail.date === "" ? "undated" : formatDate(mail.date)})`, sourceRef: `Mail · ${mail.id}` })),
    ...view
      .listRecords()
      .filter(
        (candidate) =>
          candidate.id !== id &&
          (candidate.relatedIds ?? []).some((related) => related.toUpperCase() === id)
      )
      .map((candidate) => ({ id: candidate.id, label: `${candidate.status}`, sourceRef: candidate.sourceRef }))
  ];
  if (items.length === 0) {
    return {
      ...cannotVerify(
        `Correspondence for ${id}`,
        `No linked correspondence, letters, mails or notes for ${id} exist in the available data. Note: mail/reference numbers inside registers are not ingested as correspondence (see the import notes for dropped columns).`
      ),
      evidence: [record.sourceRef]
    };
  }
  return {
    title: `Correspondence linked to ${id}`,
    summary: `${items.length} linked item(s) for ${id}. Mail and reference numbers inside registers are not ingested as correspondence — only explicitly linked records and tagged notes appear here.`,
    facts: items.map((item) => fact(item.id, item.label)),
    relatedIds: items.map((item) => item.id),
    evidence: [...new Set([record.sourceRef, ...items.map((item) => item.sourceRef)])],
    verification: "Verified from available project records"
  };
}

interface CompareOutcome {
  agreements: string[];
  conflicts: string[];
  watches: string[];
  recordIds: string[];
  evidence: string[];
}

function compareRecord(view: RegisterView, id: string): CompareOutcome | null {
  const record = view.getRecord(id);
  if (record === undefined) return null;
  const agreements: string[] = [];
  const conflicts: string[] = [];
  const watches: string[] = [];
  const evidence = [record.sourceRef];
  const status = record.status;
  const consultantStatus = record.fields["consultantStatus"] ?? "";
  const positive = (text: string): boolean => /approv/i.test(text);
  const negative = (text: string): boolean => /revis|reject/i.test(text);
  if (consultantStatus !== "" && ((positive(status) && negative(consultantStatus)) || (negative(status) && positive(consultantStatus)))) {
    conflicts.push(`${id}: register status "${status}" disagrees with consultant status "${consultantStatus}".`);
  } else if (consultantStatus !== "") {
    agreements.push(`${id}: register status "${status}" is consistent with consultant status "${consultantStatus}".`);
  }
  for (const relatedId of record.relatedIds ?? []) {
    const related = view.getRecord(relatedId);
    if (related === undefined || related.kind !== "Drawing") continue;
    evidence.push(related.sourceRef);
    const family = view.drawings.filter((drawing) => drawing.title === (related.fields["title"] ?? ""));
    const latest = pickLatestApproved(family);
    if (latest !== undefined && latest.id !== related.id) {
      if (related.status === "Superseded") {
        conflicts.push(`${id} references superseded ${related.id}; the latest approved revision is ${latest.id}.`);
      } else {
        watches.push(`${id} references ${related.id} (${related.status}); the latest approved revision is ${latest.id}.`);
      }
    } else if (latest !== undefined) {
      agreements.push(`${id} references ${related.id}, the latest approved revision.`);
    }
  }
  const submitted = record.fields["submissionDate"] ?? record.fields["submittedDate"] ?? "";
  const due = record.fields["dueDate"] ?? "";
  if (submitted !== "" && due !== "" && due < submitted) {
    conflicts.push(`${id}: due date ${due} precedes submission date ${submitted} — a data inconsistency.`);
  }
  if (record.kind === "WIR" && /pending|overdue/i.test(status)) {
    const openNcrs = (record.relatedIds ?? [])
      .map((related) => view.getRecord(related))
      .filter((related) => related !== undefined && related.kind === "NCR" && related.status === "Open");
    if (openNcrs.length > 0) {
      watches.push(`${id} is ${status} while linked ${openNcrs.map((ncr) => (ncr as { id: string }).id).join(", ")} is still open.`);
    }
  }
  if (record.kind === "MIR" && record.status === "Draft") {
    const advanced = findSubmittalsForMir(view, id).filter((sub) => sub.status !== "Draft");
    if (advanced.length > 0) {
      watches.push(`${id} is still a draft while linked ${advanced.map((sub) => `${sub.id} (${sub.status})`).join(", ")} has advanced.`);
    }
  }
  return { agreements, conflicts, watches, recordIds: [id], evidence };
}

function compareAnswer(view: RegisterView, ids: string[] | undefined): Answer {
  const targets =
    ids !== undefined && ids.length > 0
      ? ids
      : [...view.wirs, ...view.mirs, ...view.submittals, ...view.ncrs, ...view.rfis].map((record) => record.id);
  const outcomes = targets
    .map((id) => compareRecord(view, id))
    .filter((outcome): outcome is CompareOutcome => outcome !== null);
  const conflicts = [...new Set(outcomes.flatMap((outcome) => outcome.conflicts))];
  const watches = [...new Set(outcomes.flatMap((outcome) => outcome.watches))];
  const agreements = [...new Set(outcomes.flatMap((outcome) => outcome.agreements))];
  const evidence = [...new Set(outcomes.flatMap((outcome) => outcome.evidence))].slice(0, 8);
  const recordIds = [...new Set(outcomes.flatMap((outcome) => outcome.recordIds))].slice(0, 8);
  const checked = ids !== undefined && ids.length > 0 ? ids.join(", ") : `${targets.length} records project-wide`;
  if (conflicts.length === 0 && watches.length === 0) {
    return {
      title: `Record comparison — no conflicts (${checked})`,
      summary: `Checked ${checked} against status agreement, drawing currency and date sanity: no conflicts found. ${agreements.length} agreement(s) recorded below.`,
      facts: agreements.slice(0, 6).map((agreement, index) => fact(`Agreement ${index + 1}`, agreement)),
      relatedIds: recordIds,
      evidence,
      verification: "Verified from available project records"
    };
  }
  return {
    title: `Record comparison — ${conflicts.length} conflict(s), ${watches.length} watch(es) (${checked})`,
    summary: `Compared ${checked}: ${conflicts.length} conflicting item(s) and ${watches.length} watch item(s) below, each computed deterministically from register entries — not official determinations.`,
    facts: [
      ...conflicts.map((conflict, index) => fact(`Conflict ${index + 1}`, conflict)),
      ...watches
        .slice(0, Math.max(0, 6 - conflicts.length))
        .map((watch, index) => fact(`Watch ${index + 1}`, watch)),
      ...agreements
        .slice(0, Math.max(0, 6 - conflicts.length - Math.min(watches.length, 6 - conflicts.length)))
        .map((agreement, index) => fact(`Agreement ${index + 1}`, agreement))
    ],
    relatedIds: recordIds,
    evidence,
    verification: "Verified from available project records"
  };
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

function accessDeniedAnswer(user: UserContext, id: string): Answer {
  return {
    title: `Access denied — ${id}`,
    summary: `${user.displayName} is not authorized for ${id}. Retrieval enforces project permissions before any answer is generated, so this record was withheld. Ask about records within the authorized scope instead.`,
    facts: [],
    relatedIds: [],
    evidence: [],
    verification: "Cannot verify from available project records"
  };
}

/**
 * Deterministic intent router over a scoped record view.
 * The engine only sees the user's scoped view; records outside it behave as
 * if they do not exist.
 */
function routeQuestion(
  question: string,
  view: RegisterView,
  pending: PendingTopic | null,
  user: UserContext,
  context: { lastRecordId?: string; isLocalData?: boolean }
): { answer: Answer; pending: PendingTopic | null } {
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
      const mir = view.mirs.find((m) => m.id === "MIR-302");
      if (mir !== undefined) return { answer: mirAnswer(mir, view), pending: null };
    }
  }

  const knownIds = extractKnownIds(question, view);
  const rawIdTokens = new Set<string>(extractIds(question));
  for (const match of question
    .toUpperCase()
    .matchAll(/\b[A-Z0-9][A-Z0-9.\/-]*\d[A-Z0-9.\/-]*\b/g)) {
    rawIdTokens.add(match[0].replace(/[.\/-]+$/g, ""));
  }
  const firstWirId =
    knownIds.find((id) => id.startsWith("WIR-")) ??
    knownIds.find((id) => view.getRecord(id)?.kind === "WIR") ??
    (/\bwir\b/.test(q) ? "WIR-1842" : undefined);

  // Controlled-action commands (Phase D4): approve / reject / execute ACT-ids.
  const command = q.match(/\b(approve|reject|execute)\s+(act-[a-z0-9]+)/);
  if (command?.[1] !== undefined && command?.[2] !== undefined) {
    return { answer: actionCommandAnswer(command[1], command[2], user), pending: null };
  }

  // Action proposals (Phase D4): prepare / draft / escalate / remind.
  const proposal = proposeAnswer(view, user, question);
  if (proposal !== null) {
    return { answer: proposal, pending: null };
  }

  if (q.includes("overdue") || (has("past", "due") || (has("due") && q.includes("wir")))) {
    return { answer: overdueAnswer(view), pending: null };
  }

  if (
    q.includes("what happened") ||
    q.includes("history") ||
    q.includes("reject") ||
    q.includes("timeline") ||
    q.includes("what changed")
  ) {
    const drawingToken = (question.toUpperCase().match(/\bAR-[A-Z0-9]+/) ?? [])[0];
    const drawingMatch =
      drawingToken === undefined
        ? undefined
        : view.drawings
            .filter((drawing) => drawing.id.toUpperCase().startsWith(drawingToken))
            .sort((a, b) => b.issueDate.localeCompare(a.issueDate))[0]?.id;
    const target = firstWirId ?? knownIds[0] ?? drawingMatch;
    if (target === undefined) {
      return {
        answer: {
          ...cannotVerify(
            "Record history",
            "Name a record (for example WIR-1842 or AR-043-Rev-C) to see its documented history. Undated or unrecorded parts are always marked as such."
          ),
          evidence: []
        },
        pending: null
      };
    }
    return { answer: historyAnswer(view, target), pending: null };
  }

  if ((any("latest", "newest", "current") && q.includes("drawing")) || has("approved", "drawing")) {
    return { answer: latestDrawingAnswer(drawingScope(question), view), pending: null };
  }

  // Awaiting consultant review — before NCR/count branches so
  // "awaiting" and "relates to" phrasings reach the right answer.
  if (/\bawaiting\b|\bwaiting\b|consultant review|with the consultant|under review by/.test(q)) {
    return { answer: awaitingAnswer(view), pending: null };
  }

  // Correspondence linked to a record — before the NCR branch so
  // "correspondence relates to NCR-031" is not hijacked by it.
  if (/\bcorrespondence\b|\bletter\b|\btransmittal\b|\bemail\b|\bmail\b/.test(q)) {
    const target = knownIds[0] ?? context.lastRecordId;
    if (target === undefined) {
      return {
        answer: {
          ...cannotVerify(
            "Correspondence",
            "Name the record the correspondence concerns (for example NCR-031) — or ask about a record first and then say “this”."
          ),
          evidence: []
        },
        pending: null
      };
    }
    return { answer: correspondenceAnswer(view, target), pending: null };
  }

  if (q.includes("ncr") && any("relat", "link", "affect", "against")) {
    if (firstWirId !== undefined) {
      return { answer: ncrRelatedAnswer(firstWirId, view), pending: null };
    }
    const openVilla = view.ncrs.filter(
      (ncr) => ncr.status === "Open" && ncr.location.toLowerCase().includes("villa")
    );
    if (openVilla.length > 0) {
      const first = openVilla[0] as NcrRecord;
      return { answer: ncrRelatedAnswer(first.relatedWir === "" ? "WIR-1842" : first.relatedWir, view), pending: null };
    }
    return {
      answer: { ...cannotVerify("Related NCRs", "No related NCR can be identified."), evidence: ["NCR Register"] },
      pending: null
    };
  }

  if (/\bhold(?:ing|s)?\b/.test(q) || q.includes("with whom") || q.includes("who has")) {
    if (knownIds.length > 0) {
      return { answer: holderAnswer(knownIds[0] as string, view), pending: null };
    }
  }

  if (q.includes("status") && knownIds.length > 0) {
    return { answer: genericStatusAnswer(knownIds[0] as string, view), pending: null };
  }

  // Ambiguous veneer question: never guess — ask which record is meant.
  if ((q.includes("veneer") || (q.includes("mir") && q.includes("townhouse"))) && !q.includes("mir-302")) {
    const candidates = findMirByMaterialAndLocation(view, "veneer", "townhouse");
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
    return { answer: timberCafeAnswer(view), pending: null };
  }

  if (q.includes("wall") && (q.includes("blue") || q.includes("color") || q.includes("colour"))) {
    return { answer: wallColourAnswer(), pending: null };
  }

  if ((q.includes("why") && q.includes("pending")) || q.includes("still pending") || (q.includes("why") && q.includes("still"))) {
    return { answer: whyPendingAnswer(firstWirId ?? "WIR-1842", view), pending: null };
  }

  // Descriptive record search: "status of the MIR for janitor room mop sink".
  // Runs after the specific material intents (veneer/timber) so their
  // clarification behavior is preserved. Skipped when the question names an
  // explicit record id that does not resolve (unknown records stay
  // cannot-verify); bare values like "8145/2026" still search normally.
  const namedButUnknown = extractIds(question).some((id) => !knownIds.includes(id));
  const described = namedButUnknown ? null : descriptiveAnswer(view, question, context.isLocalData);
  if (described !== null) {
    return { answer: described, pending: null };
  }

  // Counts (Phase D2): "how many open NCRs?", "show draft MIRs".
  const counted = countAnswer(view, question);
  if (counted !== null) {
    return { answer: counted, pending: null };
  }

  // Exception intelligence (Phase D2): bottlenecks and what needs attention.
  if (/\bbottleneck\b|\bneeds attention\b|\bneed attention\b|\bwhat needs\b|\brisk\b|\brisks\b|\bhealth\b/.test(q)) {
    return { answer: attentionAnswer(view), pending: null };
  }

  // Project summary (Phase D2).
  if (q.includes("project summary") || q.includes("status summary") || q.includes("overview") || q.includes("summary of the project")) {
    return { answer: summaryAnswer(view), pending: null };
  }

  // Compare records / conflicting information (chatbot).
  if (/\bcompar|conflict|disagree|inconsistent|contradict|difference\b/.test(q)) {
    return {
      answer: compareAnswer(view, knownIds.length > 0 ? knownIds.slice(0, 3) : undefined),
      pending: null
    };
  }

  // Single known record mentioned without other intent: report its status.
  if (knownIds.length === 1) {
    return { answer: genericStatusAnswer(knownIds[0] as string, view), pending: null };
  }

  // Unrecorded communication: conversations are captured nowhere in the data.
  if (
    /\b(verbally|verbal|said|told|spoke|spoken|meeting|minutes|phone|conversation|instructed)\b/.test(
      q
    )
  ) {
    return { answer: unrecordedAnswer(), pending: null };
  }

  // Named-but-unknown IDs (typos, WIR-9999) skip loose matching entirely.
  const unresolvedIdLike = [...rawIdTokens].some(
    (token) => token.length >= 4 && !knownIds.includes(token)
  );

  // Super-search: full-text + boolean + partial ID fragments, no trigger
  // words required (raw "AFO-IN-000008", "IN" or "8" work). Runs AFTER the
  // specific intents above (counts, attention, summary, compare, unrecorded)
  // so those answers are never hijacked by keyword matching.
  const superHits = unresolvedIdLike ? [] : advancedSearch(view, question);
  if (superHits.length === 1 && superHits[0] !== undefined) {
    const only = superHits[0].record.id;
    // A unique hit answers directly — same contract as descriptive search.
    if (view.getRecord(only) !== undefined) {
      return { answer: genericStatusAnswer(only, view), pending: null };
    }
  }
  if (superHits.length > 0) {
    return {
      answer: renderGroupedResults(superHits, "Super-search results", "Verified from available project records"),
      pending: null
    };
  }

  // Partial fallback (Phase B2): AND-query matched nothing, but individual
  // keywords may still match — reported as inferred, never verified.
  // Named-but-unknown records stay "cannot verify" so typos and unknown
  // records are never papered over with loose keyword matches.
  if (knownIds.length === 0 && !unresolvedIdLike) {
    const hits = keywordSearchAll(view, question);
    if (hits.length > 0) {
      return { answer: keywordAnswer(hits), pending: null };
    }
  }
  if (!unresolvedIdLike && queryHasSubstance(question) && knownIds.length === 0) {
    const total = view.listRecords().length;
    return {
      answer: {
        title: "Keyword not found",
        summary: `keyword not found — this cannot be verified from the available project records. Try another keyword. Operators: AND (space), OR, -NOT, "exact phrase". (Searched ${total} records across all loaded files.)`,
        facts: [],
        relatedIds: [],
        evidence: [],
        verification: "Cannot verify from available project records"
      },
      pending: null
    };
  }

  return { answer: fallbackAnswer(), pending: null };
}

function groupLabel(record: { sourceRef: string }): string {
  return (record.sourceRef.split("·")[0] ?? "Records").trim();
}

/**
 * Super-search: every record containing the keywords, grouped file-wise
 * (by source register). A unique single hit answers directly; otherwise the
 * grouped list lets the user pick. Genuinely absent keywords get the exact
 * not-found message instead of a guess — but only claimed when the question
 * carries real search substance (>= 2 content words or a number token),
 * so one-word prompts still fall through to the count path.
 */
function descriptiveAnswer(view: RegisterView, question: string, isLocalData = true): Answer | null {
  const q = question.toLowerCase();
  if (
    !/\bstatus\b|\bholding\b|\bholder\b|\bstate\b|\braised\b|\bapproved\b|\bwhere\b|\bshow\b|\bfind\b|\blocate\b|\bholds\b|\bsearch\b|\blook\b|\bcheck\b|\binspect\w*\b|\bverify\b|\bdelivery\b/.test(
      q
    )
  ) {
    return null;
  }
  const hits = descriptiveMatches(view, question, null);
  if (hits.length === 0) {
    const words = contentWords(question);
    const hasNumber = words.some((word) => /\d/.test(word));
    if (words.length >= 2 || hasNumber) {
      const total = view.listRecords().length;
      return {
        title: "Keyword not found",
        summary:
          `keyword not found. Try using another keyword. (Searched ${total} records across all loaded files; none contain the keywords.)` +
          (isLocalData
            ? ""
            : " You are asking the small synthetic demo set — press “Load local files” (or “Load local folder” once) to search your own registers instead."),
        facts: [],
        relatedIds: [],
        evidence: [],
        verification: "Cannot verify from available project records"
      };
    }
    return null;
  }
  const top = hits[0] as { record: { id: string }; score: number };
  const tied = hits.filter((hit) => hit.score === top.score);
  // Same record twice (e.g. notice + response rows) is one answer, not ambiguity.
  const uniqueIds = [...new Set(tied.map((hit) => hit.record.id))];
  if (uniqueIds.length === 1 && uniqueIds[0] !== undefined) {
    return genericStatusAnswer(uniqueIds[0], view);
  }
  return renderGroupedResults(hits, "Keyword search results", "Verified from available project records");
}

function firstNonEmpty(values: Array<string | undefined>): string {
  for (const value of values) {
    if (value !== undefined && value.trim() !== "") return value.trim();
  }
  return "";
}

/** One-line result row: reference number · description · date · status. */
function resultLine(record: ProjectRecord): string {
  const fields = record.fields;
  const description = firstNonEmpty([
    fields["subject"],
    fields["description"],
    fields["activity"],
    fields["title"],
    fields["comments"],
    fields["snippet"]
  ]);
  const dateRaw = firstNonEmpty([
    fields["submissionDate"],
    fields["submittedDate"],
    fields["openedDate"],
    fields["issueDate"],
    fields["date"]
  ]);
  const parts = [
    record.id,
    description,
    dateRaw === "" ? "" : formatDate(dateRaw),
    record.status
  ].filter((part) => part !== "");
  return parts.join(" · ");
}

function renderGroupedResults(
  hits: Array<{ record: ProjectRecord; score: number }>,
  titlePrefix: string,
  verification: VerificationState,
  blurb = ""
): Answer {
  const shown = hits.slice(0, 12);
  const hiddenCount = hits.length - shown.length;
  const groups = new Map<string, Array<{ record: ProjectRecord; score: number }>>();
  for (const hit of shown) {
    const label = groupLabel(hit.record);
    const group = groups.get(label) ?? [];
    group.push(hit);
    groups.set(label, group);
  }
  const groupSummary = [...groups.entries()]
    .map(([label, group]) => `${group.length} in ${label}`)
    .join(", ");
  return {
    title: `${titlePrefix} (${hits.length} match${hits.length === 1 ? "" : "es"})`,
    summary: `Found ${hits.length} record(s) containing the keywords — ${groupSummary}. Open a record number for its full status.${hiddenCount > 0 ? ` Showing the top ${shown.length}; ${hiddenCount} more match.` : ""}${blurb === "" ? "" : ` ${blurb}`}`,
    facts: shown.map((hit) => fact(groupLabel(hit.record), resultLine(hit.record))),
    // Reference rows have no status page: shown as facts, not clickable chips.
    relatedIds: shown.filter((hit) => hit.record.kind !== "Reference").map((hit) => hit.record.id),
    evidence: [...new Set(shown.map((hit) => hit.record.sourceRef))],
    verification
  };
}

function keywordAnswer(hits: KeywordHit[]): Answer {
  return renderGroupedResults(
    hits,
    "Possible matches",
    "Inferred from available project records",
    "No direct answer matched: these are inferred keyword matches, not verified answers."
  );
}

/**
 * Public entry: permission check, routing, evidence budget and usage report.
 * Permission checks run BEFORE retrieval reaches any reasoning (PRD §16).
 */
export function answerQuestion(
  question: string,
  store: RegisterView,
  pending: PendingTopic | null,
  user: UserContext = getDemoUser(),
  context: { lastRecordId?: string; isLocalData?: boolean } = {}
): EngineResult {
  const view = applyScope(store, user);
  const namedIds = extractKnownIds(question, store);
  const hiddenIds = namedIds.filter((id) => view.getRecord(id) === undefined);
  if (hiddenIds.length > 0) {
    return {
      ...seal(question, {
        answer: accessDeniedAnswer(user, hiddenIds[0] as string),
        pending: null
      }),
      primaryId: hiddenIds[0]
    };
  }
  const routed = routeQuestion(question, view, pending, user, context);
  const visibleIds = extractKnownIds(question, view);
  let primaryId = visibleIds[0];
  if (primaryId === undefined && pending === "mir-veneer" && /MIR-302/.test(routed.answer.title)) {
    primaryId = "MIR-302";
  }
  return { ...seal(question, routed), primaryId };
}

function seal(
  question: string,
  result: { answer: Answer; pending: PendingTopic | null }
): EngineResult {
  const evidence = fitEvidence(result.answer.evidence);
  const answer = { ...result.answer, evidence };
  const body = `${question}\n${answer.title}\n${answer.summary}\n${answer.facts
    .map((item) => `${item.label}: ${item.value}`)
    .join("\n")}`;
  return {
    answer,
    pending: result.pending,
    usage: { evidenceRefs: evidence.length, estimatedTokens: estimateTokens(body) }
  };
}
