/**
 * Local audit log (Phase C4).
 * Every answered question is recorded with who asked, what was asked, the
 * verification outcome and whether access was granted. Browser storage keeps
 * this entirely on the user's computer; an in-memory fallback covers
 * non-browser runtimes (tests, scripts). No data leaves the machine.
 */

export interface AuditEntry {
  ts: string;
  userId: string;
  question: string;
  verification: string;
  evidenceRefs: number;
  allowed: boolean;
}

const STORAGE_KEY = "asm-audit-log-v1";
const MAX_ENTRIES = 200;

const memoryFallback: AuditEntry[] = [];

function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function logAccess(entry: AuditEntry): void {
  const storage = browserStorage();
  if (storage === undefined) {
    memoryFallback.push(entry);
    while (memoryFallback.length > MAX_ENTRIES) memoryFallback.shift();
    return;
  }
  try {
    const current = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]") as AuditEntry[];
    current.push(entry);
    storage.setItem(STORAGE_KEY, JSON.stringify(current.slice(-MAX_ENTRIES)));
  } catch {
    memoryFallback.push(entry);
  }
}

export function readAudit(): AuditEntry[] {
  const storage = browserStorage();
  if (storage === undefined) return [...memoryFallback];
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]") as AuditEntry[];
    return Array.isArray(parsed) ? parsed : [...memoryFallback];
  } catch {
    return [...memoryFallback];
  }
}

export function clearAudit(): void {
  memoryFallback.length = 0;
  try {
    browserStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — memory already cleared.
  }
}
