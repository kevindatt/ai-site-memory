/**
 * Local auth seam (demo only) — Better Auth + PostgreSQL ready.
 *
 * Current: email + password accounts in browser localStorage so the Android
 * WebView/APK works offline with zero backend. Production path (user chose):
 * replace `createAccount/login/currentSessionEmail/logout` internals with
 * Better Auth (www.better-auth.com) free tier backed by PostgreSQL
 * (postgresql.org) — the UI contract (email-only identity, AUTH_ERROR text)
 * stays the same.
 *
 * Security note: passwords here are DEMO-hashed (cyrb53, NOT salted) only to
 * avoid plaintext on device. Real hashing (scrypt/argon2 via Better Auth)
 * must happen server-side before any pilot with real users.
 */

export const ALLOWED_DOMAIN = "alec.ae";
export const AUTH_ERROR = "Un-registered email or password";
export const MIN_PASSWORD_LENGTH = 5;
/** Master admin — full access + allow/restrict controls for now. */
export const ADMIN_EMAIL = "kdatt@alec.ae";

const USERS_KEY = "asm-auth-users-v1";
const SESSION_KEY = "asm-auth-session-v1";
const RESTRICTED_KEY = "asm-auth-restricted-v1";

export interface LocalAccount {
  email: string;
  passHash: string;
  createdAt: string;
}

const memoryUsers = new Map<string, LocalAccount>();
let memorySession: string | null = null;
const memoryRestricted = new Set<string>();

/** Admin check — email-only, case-insensitive. */
export function isAdmin(email: string | null | undefined): boolean {
  if (email === null || email === undefined) return false;
  return normalizeEmail(email) === ADMIN_EMAIL;
}

function readRestricted(): Set<string> {
  const storage = browserStorage();
  if (storage === undefined) return new Set(memoryRestricted);
  try {
    const raw = storage.getItem(RESTRICTED_KEY);
    if (raw === null || raw === "") return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed.map((email) => normalizeEmail(String(email))).filter((email) => email !== ""));
  } catch {
    return new Set();
  }
}

function writeRestricted(restricted: Set<string>): void {
  const storage = browserStorage();
  if (storage === undefined) {
    memoryRestricted.clear();
    for (const email of restricted) memoryRestricted.add(email);
    return;
  }
  try {
    storage.setItem(RESTRICTED_KEY, JSON.stringify([...restricted]));
  } catch {
    // Quota / private mode — memory still works.
  }
}

/** Sorted restricted list for the Admin panel. */
export function getRestrictedEmails(): string[] {
  return [...readRestricted()].sort();
}

export function isEmailRestricted(email: string): boolean {
  return readRestricted().has(normalizeEmail(email));
}

function requireAdmin(actor: string): { ok: boolean; error?: string } {
  if (!isAdmin(actor)) return { ok: false, error: AUTH_ERROR };
  return { ok: true };
}

/** Admin: block an email from logging in / registering. Admin itself is exempt. */
export function restrictEmail(actor: string, target: string): { ok: boolean; error?: string } {
  const gate = requireAdmin(actor);
  if (!gate.ok) return gate;
  const normalized = normalizeEmail(target);
  if (!isAllowedDomain(normalized)) return { ok: false, error: AUTH_ERROR };
  if (normalized === ADMIN_EMAIL) return { ok: false, error: "Admin cannot be restricted." };
  const restricted = readRestricted();
  restricted.add(normalized);
  writeRestricted(restricted);
  return { ok: true };
}

/** Admin: re-allow a previously restricted email. */
export function allowEmail(actor: string, target: string): { ok: boolean; error?: string } {
  const gate = requireAdmin(actor);
  if (!gate.ok) return gate;
  const restricted = readRestricted();
  restricted.delete(normalizeEmail(target));
  writeRestricted(restricted);
  return { ok: true };
}

/** Sorted account list for the Admin panel (admin only). */
export function listAccounts(actor: string): LocalAccount[] {
  if (!isAdmin(actor)) return [];
  return [...readUsers().values()].sort((a, b) => a.email.localeCompare(b.email));
}

/** Admin: delete a local account. Admin itself is protected. */
export function removeAccount(actor: string, target: string): { ok: boolean; error?: string } {
  const gate = requireAdmin(actor);
  if (!gate.ok) return gate;
  const normalized = normalizeEmail(target);
  if (normalized === ADMIN_EMAIL) return { ok: false, error: "Admin cannot be removed." };
  const users = readUsers();
  if (!users.has(normalized)) return { ok: false, error: AUTH_ERROR };
  users.delete(normalized);
  writeUsers(users);
  return { ok: true };
}

function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Only @alec.ae addresses may register / log in. */
export function isAllowedDomain(email: string): boolean {
  const normalized = normalizeEmail(email);
  const parts = normalized.split("@");
  if (parts.length !== 2) return false;
  return parts[1] === ALLOWED_DOMAIN;
}

export function validatePassword(password: string): { ok: boolean; message?: string } {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  return { ok: true };
}

/** Demo-only hash (cyrb53). Replaced by Better Auth server hashing in prod. */
export function hashPassword(password: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < password.length; i++) {
    const ch = password.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function readUsers(): Map<string, LocalAccount> {
  const storage = browserStorage();
  if (storage === undefined) return new Map(memoryUsers);
  try {
    const raw = storage.getItem(USERS_KEY);
    if (raw === null || raw === "") return new Map();
    const parsed = JSON.parse(raw) as LocalAccount[];
    const map = new Map<string, LocalAccount>();
    for (const account of parsed) {
      if (account.email !== undefined && account.email !== "") map.set(account.email, account);
    }
    return map;
  } catch {
    return new Map();
  }
}

function writeUsers(users: Map<string, LocalAccount>): void {
  const storage = browserStorage();
  if (storage === undefined) {
    memoryUsers.clear();
    for (const [key, value] of users) memoryUsers.set(key, value);
    return;
  }
  try {
    storage.setItem(USERS_KEY, JSON.stringify([...users.values()]));
  } catch {
    // Quota / private mode — session still works in memory.
  }
}

export function createAccount(email: string, password: string): { ok: boolean; error?: string } {
  const normalized = normalizeEmail(email);
  if (!isAllowedDomain(normalized)) return { ok: false, error: AUTH_ERROR };
  if (!isAdmin(normalized) && isEmailRestricted(normalized)) return { ok: false, error: AUTH_ERROR };
  const valid = validatePassword(password);
  if (!valid.ok) return { ok: false, error: valid.message ?? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  const users = readUsers();
  if (users.has(normalized)) return { ok: false, error: AUTH_ERROR };
  users.set(normalized, {
    email: normalized,
    passHash: hashPassword(password),
    createdAt: new Date().toISOString()
  });
  writeUsers(users);
  setSession(normalized);
  return { ok: true };
}

export function login(email: string, password: string): { ok: boolean; error?: string } {
  const normalized = normalizeEmail(email);
  if (!isAllowedDomain(normalized)) return { ok: false, error: AUTH_ERROR };
  if (!isAdmin(normalized) && isEmailRestricted(normalized)) return { ok: false, error: AUTH_ERROR };
  const users = readUsers();
  const account = users.get(normalized);
  if (account === undefined) return { ok: false, error: AUTH_ERROR };
  if (account.passHash !== hashPassword(password)) return { ok: false, error: AUTH_ERROR };
  setSession(normalized);
  return { ok: true };
}

function setSession(email: string): void {
  const storage = browserStorage();
  if (storage === undefined) {
    memorySession = email;
    return;
  }
  try {
    storage.setItem(SESSION_KEY, email);
  } catch {
    memorySession = email;
  }
}

export function logout(): void {
  memorySession = null;
  try {
    browserStorage()?.removeItem(SESSION_KEY);
  } catch {
    // Already cleared in memory.
  }
}

/** Email-only identity used by the UI once inside the main page. */
export function currentSessionEmail(): string | null {
  const storage = browserStorage();
  if (storage === undefined) return memorySession;
  try {
    const value = storage.getItem(SESSION_KEY);
    if (value === null || value === "") return memorySession;
    return normalizeEmail(value);
  } catch {
    return memorySession;
  }
}

/** Test-only reset. */
export function clearAuthForTests(): void {
  memoryUsers.clear();
  memorySession = null;
  memoryRestricted.clear();
  try {
    browserStorage()?.removeItem(USERS_KEY);
    browserStorage()?.removeItem(SESSION_KEY);
    browserStorage()?.removeItem(RESTRICTED_KEY);
  } catch {
    // No browser storage in tests.
  }
}
