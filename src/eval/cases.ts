import { store } from "../data/registers";
import { answerQuestion } from "../lib/respond";
import type { VerificationState } from "../lib/types";

/**
 * Evaluation harness (Phase A3).
 * Each case maps to a PRD use case (UC-01–UC-11) or acceptance criterion
 * (AC-01–AC-11) and asserts grounded, evidence-backed behavior.
 * Run with: npm run eval
 */

export interface EvalCase {
  id: string;
  question: string;
  mustContain: string[];
  mustNotContain?: string[];
  verification: VerificationState;
  relatedContains?: string[];
  evidenceContains?: string[];
  followUpContains?: string[];
}

export interface EvalResult {
  id: string;
  question: string;
  passed: boolean;
  failures: string[];
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: "UC-01",
    question: "What is the status of WIR-1842?",
    mustContain: ["Pending Consultant Review", "18 Sep 2026", "Consultant QA", "19 Sep 2026", "21 Sep 2026"],
    verification: "Verified from available project records",
    relatedContains: ["NCR-031", "AR-043-Rev-C"],
    evidenceContains: ["WIR Register · WIR-1842"]
  },
  {
    id: "UC-02",
    question: "Who is currently holding MIR-302?",
    mustContain: ["Consultant Materials"],
    verification: "Verified from available project records",
    evidenceContains: ["MIR Register · MIR-302"]
  },
  {
    id: "UC-03",
    question: "What is the latest approved drawing for the Villa 43 ceiling?",
    mustContain: ["AR-043-Rev-C", "Superseded"],
    verification: "Verified from available project records",
    evidenceContains: ["Drawing Register · AR-043-Rev-C"]
  },
  {
    id: "UC-04",
    question: "Show all overdue WIRs.",
    mustContain: ["WIR-1844"],
    mustNotContain: ["WIR-1842 is"],
    verification: "Verified from available project records",
    evidenceContains: ["WIR Register"]
  },
  {
    id: "UC-05",
    question: "Which NCR is related to WIR-1842?",
    mustContain: ["NCR-031", "AR-043"],
    verification: "Verified from available project records",
    relatedContains: ["WIR-1842"],
    evidenceContains: ["NCR Register · NCR-031"]
  },
  {
    id: "UC-06",
    question: "What happened after WIR-1842 was rejected?",
    mustContain: ["resubmitted", "not recorded"],
    verification: "Verified from available project records",
    evidenceContains: ["Project Notes · WIR-1842"]
  },
  {
    id: "UC-09",
    question: "Why is WIR-1842 still pending?",
    mustContain: ["not recorded"],
    verification: "Verified from available project records"
  },
  {
    id: "UC-10",
    question: "What did the consultant verbally tell the supervisor yesterday?",
    mustContain: ["not captured"],
    verification: "Cannot verify from available project records"
  },
  {
    id: "UC-10b-wall",
    question: "Is the color of this wall blue or is there a change?",
    mustContain: ["cannot verify"],
    verification: "Cannot verify from available project records"
  },
  {
    id: "UC-11-veneer",
    question: "Is the MIR for veneer for Townhouse raised?",
    mustContain: ["will not assume"],
    verification: "Clarification required",
    followUpContains: ["MIR-302"]
  },
  {
    id: "UC-11-timber",
    question: "What is the status of the MIR for Timber in Cafe?",
    mustContain: ["MIR-303", "Draft"],
    verification: "Verified from available project records"
  },
  {
    id: "AC-10",
    question: "What is the status of WIR-9999?",
    mustContain: ["cannot verify"],
    verification: "Cannot verify from available project records"
  },
  {
    id: "UC-07",
    question: "How many NCRs are currently open?",
    mustContain: ["1", "NCR-031"],
    verification: "Verified from available project records",
    evidenceContains: ["NCR Register"]
  },
  {
    id: "UC-06b-timeline",
    question: "Show the timeline for WIR-1842.",
    mustContain: ["Rejected", "Review started"],
    verification: "Verified from available project records",
    evidenceContains: ["Workflow Record · WIR-1842"]
  },
  {
    id: "D2-attention",
    question: "What needs attention?",
    mustContain: ["WIR-1844"],
    verification: "Inferred from available project records"
  },
  {
    id: "CB-awaiting",
    question: "Which documents are awaiting consultant review?",
    mustContain: ["No visible record"],
    verification: "Verified from available project records"
  },
  {
    id: "CB-correspondence",
    question: "What correspondence relates to NCR-031?",
    mustContain: ["DOC-001", "RFI-077"],
    verification: "Verified from available project records"
  },
  {
    id: "CB-compare",
    question: "Compare WIR-1842 and NCR-031 and flag any conflicts.",
    mustContain: ["0 conflict", "latest approved revision"],
    verification: "Verified from available project records"
  }
];

function check(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function runEval(): { results: EvalResult[]; passed: number; total: number } {
  const results = EVAL_CASES.map((c): EvalResult => {
    const failures: string[] = [];
    const answer = answerQuestion(c.question, store, null).answer;
    const body = `${answer.title}\n${answer.summary}\n${answer.facts.map((f) => `${f.label}: ${f.value}`).join("\n")}`;
    for (const needle of c.mustContain) {
      if (!check(body, needle)) failures.push(`expected to contain "${needle}"`);
    }
    for (const needle of c.mustNotContain ?? []) {
      if (check(body, needle)) failures.push(`expected NOT to contain "${needle}"`);
    }
    if (answer.verification !== c.verification) {
      failures.push(`expected verification "${c.verification}", got "${answer.verification}"`);
    }
    for (const needle of c.relatedContains ?? []) {
      if (!answer.relatedIds.some((id) => check(id, needle))) {
        failures.push(`expected related records to contain "${needle}"`);
      }
    }
    for (const needle of c.evidenceContains ?? []) {
      if (!answer.evidence.some((source) => check(source, needle))) {
        failures.push(`expected evidence to contain "${needle}"`);
      }
    }
    for (const needle of c.followUpContains ?? []) {
      if (!check(answer.followUp ?? "", needle)) {
        failures.push(`expected follow-up to contain "${needle}"`);
      }
    }
    return { id: c.id, question: c.question, passed: failures.length === 0, failures };
  });
  return { results, passed: results.filter((r) => r.passed).length, total: results.length };
}
