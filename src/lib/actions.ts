/**
 * Controlled actions (Phase D4, per PRD Phase 6 guardrails).
 * Lifecycle: propose -> approve/reject -> execute, every transition owned by
 * an explicit user decision and auditable. NOTHING executes without a
 * recorded approval, and execution itself is SIMULATED locally: it records an
 * execution note and never contacts any external system. There is no
 * autonomous Official project action anywhere in this path.
 */

export type ActionStatus = "proposed" | "approved" | "rejected" | "executed";

export interface ActionProposal {
  id: string;
  type: string;
  title: string;
  detail: string;
  recordIds: string[];
  status: ActionStatus;
  createdBy: string;
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
  executionNote?: string;
}

const STORAGE_KEY = "asm-actions-v1";

const memoryFallback: ActionProposal[] = [];

function nowIso(): string {
  return new Date().toISOString();
}

function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function persist(all: ActionProposal[]): void {
  const storage = browserStorage();
  if (storage === undefined) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable — memory already updated.
  }
}

function readAll(): ActionProposal[] {
  const storage = browserStorage();
  if (storage === undefined) return memoryFallback;
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]") as ActionProposal[];
    memoryFallback.length = 0;
    if (Array.isArray(parsed)) memoryFallback.push(...parsed);
    return memoryFallback;
  } catch {
    return memoryFallback;
  }
}

export function listActions(): ActionProposal[] {
  return [...readAll()];
}

export function clearActions(): void {
  memoryFallback.length = 0;
  try {
    browserStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // Already cleared in memory.
  }
}

function nextId(): string {
  return `ACT-${nowIso().replace(/[^0-9]/g, "").slice(-8)}${String(readAll().length + 1).padStart(2, "0")}`;
}

export function proposeAction(
  type: string,
  title: string,
  detail: string,
  recordIds: string[],
  createdBy: string
): ActionProposal {
  const proposal: ActionProposal = {
    id: nextId(),
    type,
    title,
    detail,
    recordIds,
    status: "proposed",
    createdBy,
    createdAt: nowIso()
  };
  const all = readAll();
  all.push(proposal);
  persist(all);
  return proposal;
}

function decide(id: string, status: ActionStatus, userId: string): ActionProposal | undefined {
  const all = readAll();
  const proposal = all.find((item) => item.id.toUpperCase() === id.toUpperCase());
  if (proposal === undefined || proposal.status !== "proposed") return undefined;
  proposal.status = status;
  proposal.decidedBy = userId;
  proposal.decidedAt = nowIso();
  persist(all);
  return proposal;
}

export function approveAction(id: string, userId: string): ActionProposal | undefined {
  return decide(id, "approved", userId);
}

export function rejectAction(id: string, userId: string): ActionProposal | undefined {
  return decide(id, "rejected", userId);
}

export function executeAction(
  id: string,
  userId: string
): { ok: boolean; message: string; proposal?: ActionProposal } {
  const all = readAll();
  const proposal = all.find((item) => item.id.toUpperCase() === id.toUpperCase());
  if (proposal === undefined) {
    return { ok: false, message: `${id} does not match any action proposal.` };
  }
  if (proposal.status !== "approved") {
    return {
      ok: false,
      message: `${proposal.id} is ${proposal.status} — execution requires a recorded approval first. Reply with an approval (or approve it in the Actions panel) before executing.`,
      proposal
    };
  }
  proposal.status = "executed";
  proposal.executionNote = `SIMULATED execution by ${userId} at ${nowIso()}: recorded locally for audit. No external system was contacted and no project record was modified.`;
  persist(all);
  return { ok: true, message: `${proposal.id} executed (simulated, local audit record only).`, proposal };
}
