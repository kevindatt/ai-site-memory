import { beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_EMAIL,
  AUTH_ERROR,
  allowEmail,
  clearAuthForTests,
  createAccount,
  currentSessionEmail,
  isAdmin,
  isAllowedDomain,
  listAccounts,
  login,
  logout,
  removeAccount,
  restrictEmail,
  validatePassword
} from "./auth";

beforeEach(() => {
  clearAuthForTests();
});

describe("local auth seam (alec.ae gate)", () => {
  it("allows only alec.ae domains", () => {
    expect(isAllowedDomain("user@alec.ae")).toBe(true);
    expect(isAllowedDomain("User@ALEC.AE")).toBe(true);
    expect(isAllowedDomain("user@gmail.com")).toBe(false);
    expect(isAllowedDomain("not-an-email")).toBe(false);
  });

  it("requires a 5-character minimum password", () => {
    expect(validatePassword("1234").ok).toBe(false);
    expect(validatePassword("12345").ok).toBe(true);
    expect(validatePassword("any!@").ok).toBe(true);
  });

  it("rejects non-alec.ae registration with the exact prompt", () => {
    const result = createAccount("user@gmail.com", "12345");
    expect(result.ok).toBe(false);
    expect(result.error).toBe(AUTH_ERROR);
  });

  it("creates, sessions, and logs out an alec.ae account", () => {
    expect(createAccount("eng@alec.ae", "12345").ok).toBe(true);
    expect(currentSessionEmail()).toBe("eng@alec.ae");
    logout();
    expect(currentSessionEmail()).toBeNull();
    expect(login("eng@alec.ae", "12345").ok).toBe(true);
    expect(currentSessionEmail()).toBe("eng@alec.ae");
  });

  it("returns the same prompt for wrong password (no enumeration)", () => {
    createAccount("qa@alec.ae", "12345");
    logout();
    const result = login("qa@alec.ae", "wrong");
    expect(result.ok).toBe(false);
    expect(result.error).toBe(AUTH_ERROR);
  });

  it("recognises the admin user", () => {
    expect(isAdmin(ADMIN_EMAIL)).toBe(true);
    expect(isAdmin("eng@alec.ae")).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it("lets admin restrict and re-allow an email", () => {
    expect(createAccount("site@alec.ae", "12345").ok).toBe(true);
    logout();
    expect(restrictEmail(ADMIN_EMAIL, "site@alec.ae").ok).toBe(true);
    expect(login("site@alec.ae", "12345").ok).toBe(false);
    expect(login("site@alec.ae", "12345").error).toBe(AUTH_ERROR);
    expect(allowEmail(ADMIN_EMAIL, "site@alec.ae").ok).toBe(true);
    expect(login("site@alec.ae", "12345").ok).toBe(true);
  });

  it("blocks non-admin allow/restrict and protects the admin", () => {
    expect(restrictEmail("eng@alec.ae", "site@alec.ae").ok).toBe(false);
    expect(restrictEmail(ADMIN_EMAIL, ADMIN_EMAIL).ok).toBe(false);
    expect(removeAccount(ADMIN_EMAIL, ADMIN_EMAIL).ok).toBe(false);
    expect(listAccounts("eng@alec.ae")).toEqual([]);
  });
});
