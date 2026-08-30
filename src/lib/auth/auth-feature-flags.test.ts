import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The flags default to off. A missing, empty or misspelled variable must never enable a
 * flow, because these gates are what keep phone registration closed until the identity
 * audit has been read.
 */
async function loadFlags(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.stubGlobal("import.meta", { env });
  // Vitest exposes import.meta.env through the same object the module reads.
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
  return import("./auth-feature-flags");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("auth feature flag defaults", () => {
  it("everything OTP is off when nothing is configured", async () => {
    const flags = await loadFlags({});
    expect(flags.emailOtpEnabled).toBe(false);
    expect(flags.phoneOtpEnabled).toBe(false);
    expect(flags.phoneRegistrationEnabled).toBe(false);
    expect(flags.anyOtpEnabled).toBe(false);
  });

  it("password login is never gated", async () => {
    const flags = await loadFlags({});
    expect(flags.passwordLoginEnabled).toBe(true);
  });

  it("only explicit truthy strings enable a flag", async () => {
    for (const value of ["false", "0", "no", "off", "", "  ", "maybe", "TRUEISH"]) {
      const flags = await loadFlags({ VITE_AUTH_EMAIL_OTP_ENABLED: value });
      expect(flags.emailOtpEnabled, `value ${JSON.stringify(value)} must not enable`).toBe(false);
    }
  });

  it("accepts the documented truthy spellings", async () => {
    for (const value of ["true", "TRUE", " true ", "1", "yes", "on"]) {
      const flags = await loadFlags({ VITE_AUTH_EMAIL_OTP_ENABLED: value });
      expect(flags.emailOtpEnabled, `value ${JSON.stringify(value)} must enable`).toBe(true);
    }
  });

  it("phone registration is independent of phone login", async () => {
    const flags = await loadFlags({ VITE_AUTH_PHONE_OTP_ENABLED: "true" });
    expect(flags.phoneOtpEnabled).toBe(true);
    // Enabling login must not quietly enable registration — that is the duplicate-account
    // risk the identity audit exists to measure.
    expect(flags.phoneRegistrationEnabled).toBe(false);
  });
});
