/**
 * Production frontend target validation.
 *
 * A Vite build bakes its environment into the bundle, so a wrong value here is not a runtime
 * misconfiguration that can be corrected later — it is a wrong artifact. These tests exist to prove the
 * verifier actually refuses each way that can happen, not merely that it accepts the right one.
 */
import { describe, expect, it, vi } from "vitest";
import {
  CANONICAL,
  verifyBackendBinding,
  verifyStoreProductionBuildEnv,
} from "./verify-store-production-build-env.mjs";

const CANONICAL_ENV = {
  VITE_STORE_API_BASE_URL: "https://api.store.DilMart.org/api",
  VITE_SUPABASE_PROJECT_ID: "ztplxqlthuqkuktbznbo",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_placeholder_for_tests",
  VITE_SUPABASE_URL: "https://ztplxqlthuqkuktbznbo.supabase.co",
};

const withEnv = (overrides: Record<string, string | undefined>) => ({
  ...CANONICAL_ENV,
  ...overrides,
});

describe("canonical Production configuration is accepted", () => {
  it("passes with the exact canonical values", () => {
    expect(verifyStoreProductionBuildEnv(CANONICAL_ENV)).toEqual({ ok: true, errors: [] });
  });

  it("tolerates a trailing slash on the API base, which is identical in meaning", () => {
    const result = verifyStoreProductionBuildEnv(
      withEnv({ VITE_STORE_API_BASE_URL: "https://api.store.DilMart.org/api/" }),
    );
    expect(result.ok).toBe(true);
  });

  it("tolerates surrounding whitespace from a pasted secret", () => {
    const result = verifyStoreProductionBuildEnv(
      withEnv({ VITE_SUPABASE_PROJECT_ID: "  ztplxqlthuqkuktbznbo  " }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("missing variables fail closed", () => {
  for (const key of Object.keys(CANONICAL_ENV)) {
    it(`refuses when ${key} is absent`, () => {
      const result = verifyStoreProductionBuildEnv(withEnv({ [key]: undefined }));
      expect(result.ok).toBe(false);
      expect(result.errors.join(" ")).toContain(key);
    });

    it(`refuses when ${key} is blank`, () => {
      const result = verifyStoreProductionBuildEnv(withEnv({ [key]: "   " }));
      expect(result.ok).toBe(false);
      expect(result.errors.join(" ")).toContain(key);
    });
  }
});

describe("the API base must be the same-site Production API", () => {
  const rejected: Array<[string, string]> = [
    ["localhost", "http://localhost:4000/api"],
    ["localhost over https", "https://localhost:4000/api"],
    ["the Render origin", "https://DilMart-store-backend.onrender.com/api"],
    ["another DilMart host", "https://api.DilMart.org/api"],
    ["the storefront host itself", "https://store.DilMart.org/api"],
    ["plain HTTP on the right host", "http://api.store.DilMart.org/api"],
    ["an arbitrary path", "https://api.store.DilMart.org/v2"],
    ["the site root", "https://api.store.DilMart.org/"],
    ["a nested path", "https://api.store.DilMart.org/api/v1"],
    ["a look-alike host", "https://api.store.DilMart.org.evil.test/api"],
    ["not a URL at all", "api.store.DilMart.org/api"],
  ];

  for (const [label, value] of rejected) {
    it(`refuses ${label}`, () => {
      const result = verifyStoreProductionBuildEnv(withEnv({ VITE_STORE_API_BASE_URL: value }));
      expect(result.ok).toBe(false);
      expect(result.errors.join(" ")).toContain("VITE_STORE_API_BASE_URL");
    });
  }
});

describe("the Supabase project must be the Production one", () => {
  it("refuses a different project ref", () => {
    const result = verifyStoreProductionBuildEnv(
      withEnv({ VITE_SUPABASE_PROJECT_ID: "jxylodbuosdrajajsklh" }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("VITE_SUPABASE_PROJECT_ID");
  });

  it("refuses a different Supabase hostname even when the ref is right", () => {
    const result = verifyStoreProductionBuildEnv(
      withEnv({ VITE_SUPABASE_URL: "https://jxylodbuosdrajajsklh.supabase.co" }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("VITE_SUPABASE_URL");
  });

  it("refuses a local Supabase stack", () => {
    const result = verifyStoreProductionBuildEnv(
      withEnv({ VITE_SUPABASE_URL: "http://127.0.0.1:54321" }),
    );
    expect(result.ok).toBe(false);
  });

  it("refuses plain HTTP against the right Supabase host", () => {
    const result = verifyStoreProductionBuildEnv(
      withEnv({ VITE_SUPABASE_URL: "http://ztplxqlthuqkuktbznbo.supabase.co" }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("https:");
  });
});

describe("URLs must be canonical, not merely on the right host", () => {
  // new URL() carries a port, credentials, a query string and a fragment straight through checks that
  // only inspect protocol, hostname and pathname. Each of these changes where requests go, or what
  // travels with them, and is baked into the bundle — so each is refused on its own.
  const apiRejected: Array<[string, string, string]> = [
    ["a non-default port", "https://api.store.DilMart.org:444/api", "port"],
    ["embedded credentials", "https://user:pass@api.store.DilMart.org/api", "credentials"],
    ["a password-only credential", "https://:pass@api.store.DilMart.org/api", "credentials"],
    ["a query string", "https://api.store.DilMart.org/api?x=1", "query"],
    ["a fragment", "https://api.store.DilMart.org/api#x", "fragment"],
  ];

  for (const [label, value, reason] of apiRejected) {
    it(`refuses an API base with ${label}`, () => {
      const result = verifyStoreProductionBuildEnv(withEnv({ VITE_STORE_API_BASE_URL: value }));
      expect(result.ok).toBe(false);
      const joined = result.errors.join(" ");
      expect(joined).toContain("VITE_STORE_API_BASE_URL");
      expect(joined).toContain(reason);
    });
  }

  const supabaseRejected: Array<[string, string, string]> = [
    ["a non-default port", "https://ztplxqlthuqkuktbznbo.supabase.co:444", "port"],
    ["embedded credentials", "https://user:pass@ztplxqlthuqkuktbznbo.supabase.co", "credentials"],
    ["a non-root path", "https://ztplxqlthuqkuktbznbo.supabase.co/foo", "path"],
    ["a query string", "https://ztplxqlthuqkuktbznbo.supabase.co?x=1", "query"],
    ["a fragment", "https://ztplxqlthuqkuktbznbo.supabase.co#x", "fragment"],
  ];

  for (const [label, value, reason] of supabaseRejected) {
    it(`refuses a Supabase URL with ${label}`, () => {
      const result = verifyStoreProductionBuildEnv(withEnv({ VITE_SUPABASE_URL: value }));
      expect(result.ok).toBe(false);
      const joined = result.errors.join(" ");
      expect(joined).toContain("VITE_SUPABASE_URL");
      expect(joined).toContain(reason);
    });
  }

  it("still accepts the canonical Supabase origin with a bare root slash", () => {
    const result = verifyStoreProductionBuildEnv(
      withEnv({ VITE_SUPABASE_URL: "https://ztplxqlthuqkuktbznbo.supabase.co/" }),
    );
    expect(result.ok).toBe(true);
  });

  it("does not mistake the default https port for an explicit one", () => {
    // new URL() normalises :443 away, so this stays canonical rather than tripping the port check.
    const result = verifyStoreProductionBuildEnv(
      withEnv({ VITE_STORE_API_BASE_URL: "https://api.store.DilMart.org:443/api" }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("secret hygiene", () => {
  it("never echoes the publishable key in a diagnostic", () => {
    const secret = "sb_publishable_this_must_never_be_logged";
    const result = verifyStoreProductionBuildEnv(
      withEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: secret, VITE_SUPABASE_PROJECT_ID: "wrong-project" }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).not.toContain(secret);
  });

  it("accepts any non-empty key rather than guessing correctness from its shape", () => {
    // Which project a key belongs to is established by the ref and URL checks, not by how the string
    // looks. Pattern-matching a key would reject valid future formats and accept convincing fakes.
    const result = verifyStoreProductionBuildEnv(withEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: "x" }));
    expect(result.ok).toBe(true);
  });
});

describe("read-only backend binding preflight", () => {
  it("passes when the live API reports the expected project", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, supabaseProjectRef: CANONICAL.supabaseProjectRef }),
    })) as unknown as typeof fetch;

    await expect(verifyBackendBinding(fetchImpl)).resolves.toEqual({ ok: true, errors: [] });
    expect(fetchImpl).toHaveBeenCalledWith(CANONICAL.backendBindingUrl, expect.objectContaining({ method: "GET" }));
  });

  it("fails closed when the live API is bound to another project", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, supabaseProjectRef: "jxylodbuosdrajajsklh" }),
    })) as unknown as typeof fetch;

    const result = await verifyBackendBinding(fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("jxylodbuosdrajajsklh");
  });

  it("fails closed on a non-200 response", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    const result = await verifyBackendBinding(fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("503");
  });

  it("fails closed when the API is unreachable rather than assuming it is fine", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    }) as unknown as typeof fetch;
    const result = await verifyBackendBinding(fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("ENOTFOUND");
  });
});
