/**
 * Weak-password classification and copy.
 *
 * DilMart-STORE-WEAK-PASSWORD-UX-001
 *
 * The whole point of this module is that classification is code-only. Half these tests exist to
 * prove what is NOT classified: an error carrying the SDK class name, or a message that mentions
 * `weak_password`, without the stable code must fall through to ordinary error handling.
 */
import { describe, expect, it } from "vitest";
import {
  WEAK_PASSWORD_CHARACTERS_MESSAGE_AR,
  WEAK_PASSWORD_ERROR_CODE,
  WEAK_PASSWORD_LENGTH_MESSAGE_AR,
  WEAK_PASSWORD_MESSAGE_AR,
  WEAK_PASSWORD_PWNED_MESSAGE_AR,
  WeakPasswordError,
  isWeakPasswordRejection,
  normalizePasswordSecurityWarning,
  readWeakPasswordReasons,
  toWeakPasswordError,
  weakPasswordMessage,
} from "./password-errors";

describe("isWeakPasswordRejection", () => {
  it("classifies an error carrying the stable code", () => {
    expect(isWeakPasswordRejection({ code: WEAK_PASSWORD_ERROR_CODE })).toBe(true);
  });

  it("does NOT classify AuthWeakPasswordError without a code", () => {
    const error = Object.assign(new Error("Password is known to be weak and easy to guess."), {
      name: "AuthWeakPasswordError",
      status: 422,
      reasons: ["pwned"],
    });
    expect(isWeakPasswordRejection(error)).toBe(false);
  });

  it("does NOT classify a message that merely mentions weak_password", () => {
    expect(isWeakPasswordRejection({ message: "upstream weak_password validator failed", status: 503 })).toBe(false);
  });

  it("does NOT classify by status alone", () => {
    expect(isWeakPasswordRejection({ status: 422, message: "Unprocessable" })).toBe(false);
  });

  it("ignores non-objects and a different code", () => {
    expect(isWeakPasswordRejection(null)).toBe(false);
    expect(isWeakPasswordRejection("weak_password")).toBe(false);
    expect(isWeakPasswordRejection({ code: "invalid_credentials" })).toBe(false);
  });
});

describe("readWeakPasswordReasons", () => {
  it("keeps only the published reasons and de-duplicates", () => {
    expect(readWeakPasswordReasons(["pwned", "pwned", "length"])).toEqual(["pwned", "length"]);
  });

  it("drops anything outside the allowlist, so arbitrary server data cannot reach the UI", () => {
    expect(readWeakPasswordReasons(["pwned", "<script>", 42, null, { reasons: "x" }])).toEqual(["pwned"]);
  });

  it("returns an empty list for non-arrays", () => {
    expect(readWeakPasswordReasons(undefined)).toEqual([]);
    expect(readWeakPasswordReasons("pwned")).toEqual([]);
  });
});

describe("weakPasswordMessage", () => {
  it("prefers the breach message, which is the most actionable", () => {
    expect(weakPasswordMessage(["length", "pwned"])).toBe(WEAK_PASSWORD_PWNED_MESSAGE_AR);
  });

  it("falls back to length, then characters", () => {
    expect(weakPasswordMessage(["length", "characters"])).toBe(WEAK_PASSWORD_LENGTH_MESSAGE_AR);
    expect(weakPasswordMessage(["characters"])).toBe(WEAK_PASSWORD_CHARACTERS_MESSAGE_AR);
  });

  it("uses the approved generic message when no reason is known", () => {
    expect(weakPasswordMessage([])).toBe(WEAK_PASSWORD_MESSAGE_AR);
    expect(weakPasswordMessage()).toBe(WEAK_PASSWORD_MESSAGE_AR);
  });

  it("never returns English", () => {
    for (const reasons of [[], ["pwned"], ["length"], ["characters"]] as const) {
      expect(weakPasswordMessage(reasons)).not.toMatch(/[a-zA-Z]{4}/);
    }
  });
});

describe("toWeakPasswordError", () => {
  it("maps a coded rejection with pwned to the breach message", () => {
    const mapped = toWeakPasswordError({ code: WEAK_PASSWORD_ERROR_CODE, reasons: ["pwned"] });
    expect(mapped).toBeInstanceOf(WeakPasswordError);
    expect(mapped?.message).toBe(WEAK_PASSWORD_PWNED_MESSAGE_AR);
    expect(mapped?.reasons).toEqual(["pwned"]);
    expect(mapped?.code).toBe(WEAK_PASSWORD_ERROR_CODE);
  });

  it("maps a coded rejection without reasons to the generic message", () => {
    expect(toWeakPasswordError({ code: WEAK_PASSWORD_ERROR_CODE })?.message).toBe(WEAK_PASSWORD_MESSAGE_AR);
  });

  it("returns null for anything unproven, so the caller keeps its own handling", () => {
    expect(toWeakPasswordError({ name: "AuthWeakPasswordError", reasons: ["pwned"] })).toBeNull();
    expect(toWeakPasswordError(new Error("weak_password"))).toBeNull();
    expect(toWeakPasswordError({ code: "over_request_rate_limit" })).toBeNull();
  });
});

describe("normalizePasswordSecurityWarning", () => {
  it("keeps the reasons from a successful sign-in warning", () => {
    expect(normalizePasswordSecurityWarning({ reasons: ["pwned"], message: "This password is known." }))
      .toEqual({ reasons: ["pwned"] });
  });

  it("drops the server message, so nothing unlocalized reaches the UI", () => {
    const warning = normalizePasswordSecurityWarning({ reasons: ["length"], message: "Password is too short." });
    expect(warning).toEqual({ reasons: ["length"] });
    expect(JSON.stringify(warning)).not.toContain("too short");
  });

  it("returns null when absent or carrying no recognised reason", () => {
    expect(normalizePasswordSecurityWarning(undefined)).toBeNull();
    expect(normalizePasswordSecurityWarning(null)).toBeNull();
    expect(normalizePasswordSecurityWarning({ reasons: [] })).toBeNull();
    expect(normalizePasswordSecurityWarning({ reasons: ["unknown-reason"] })).toBeNull();
  });
});
