import { describe, expect, it } from "vitest";
import {
  FALLBACK_LEGACY_AUTH_STORAGE_KEY,
  getLegacySupabaseAuthStorageKey,
  isLikelyPersistedAuthSession,
  parseSupabaseProjectRef,
} from "./auth-storage-keys";

function sessionBlob(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    access_token: "header.payload.signature",
    refresh_token: "refresh-value",
    expires_at: 1893456000,
    user: { id: "11111111-2222-3333-4444-555555555555" },
    ...overrides,
  });
}

describe("parseSupabaseProjectRef", () => {
  it("extracts the project ref from a full Supabase URL", () => {
    expect(parseSupabaseProjectRef("https://ztplxqlthuqkuktbznbo.supabase.co")).toBe("ztplxqlthuqkuktbznbo");
  });

  it("extracts the project ref from a bare hostname", () => {
    expect(parseSupabaseProjectRef("ztplxqlthuqkuktbznbo.supabase.co")).toBe("ztplxqlthuqkuktbznbo");
  });

  it("returns null for unusable input", () => {
    expect(parseSupabaseProjectRef(undefined)).toBeNull();
    expect(parseSupabaseProjectRef("")).toBeNull();
    expect(parseSupabaseProjectRef("not a url at all")).toBeNull();
  });
});

describe("getLegacySupabaseAuthStorageKey", () => {
  it("builds the historical Supabase localStorage key", () => {
    expect(getLegacySupabaseAuthStorageKey("https://abcdefgh.supabase.co")).toBe("sb-abcdefgh-auth-token");
  });

  it("falls back to a deterministic key when the URL is unparsable", () => {
    expect(getLegacySupabaseAuthStorageKey("")).toBe(FALLBACK_LEGACY_AUTH_STORAGE_KEY);
  });
});

describe("isLikelyPersistedAuthSession", () => {
  it("accepts a well-formed session blob", () => {
    expect(isLikelyPersistedAuthSession(sessionBlob())).toBe(true);
  });

  it("accepts a session nested under currentSession", () => {
    const nested = JSON.stringify({ currentSession: JSON.parse(sessionBlob()) });
    expect(isLikelyPersistedAuthSession(nested)).toBe(true);
  });

  it("rejects non-JSON, empty and non-string values", () => {
    expect(isLikelyPersistedAuthSession("")).toBe(false);
    expect(isLikelyPersistedAuthSession("   ")).toBe(false);
    expect(isLikelyPersistedAuthSession("not-json")).toBe(false);
    expect(isLikelyPersistedAuthSession(null)).toBe(false);
    expect(isLikelyPersistedAuthSession({ access_token: "x" })).toBe(false);
  });

  it("rejects blobs missing any required field", () => {
    expect(isLikelyPersistedAuthSession(sessionBlob({ access_token: undefined }))).toBe(false);
    expect(isLikelyPersistedAuthSession(sessionBlob({ refresh_token: "" }))).toBe(false);
    expect(isLikelyPersistedAuthSession(sessionBlob({ user: {} }))).toBe(false);
    expect(isLikelyPersistedAuthSession(sessionBlob({ user: null }))).toBe(false);
  });
});
