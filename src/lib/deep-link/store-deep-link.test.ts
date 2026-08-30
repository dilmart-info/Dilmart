/**
 * STORE-PR6 §24/§25/§26 — deep-link core: strict /open parser, target allowlist, single-flight redeem dedup.
 */
import { describe, expect, it, vi } from "vitest";
import { parseHandoffOpenUrl, handoffFingerprint, HandoffCryptoUnavailableError } from "./store-open-url";
import { validateTarget } from "./store-target";
import { StoreHandoffController } from "./store-handoff-controller";

const OK = "https://store.DilMart.org/open?code=abc123&state=xyz789";

// ── §24 parser: only the exact production shape is accepted ────────────────────
describe("parseHandoffOpenUrl", () => {
  it("accepts the exact production shape (prod + staging hosts)", () => {
    expect(parseHandoffOpenUrl(OK)).toEqual({ ok: true, params: { code: "abc123", state: "xyz789" } });
    expect(parseHandoffOpenUrl("https://staging-store.DilMart.org/open?code=a&state=b").ok).toBe(true);
  });

  const bad: Array<[string, unknown]> = [
    ["foreign host", "https://evil.example/open?code=a&state=b"],
    ["http production host", "http://store.DilMart.org/open?code=a&state=b"],
    ["javascript scheme", "javascript:alert(1)//store.DilMart.org/open?code=a&state=b"],
    ["data scheme", "data:text/html,<x>"],
    ["protocol relative", "//store.DilMart.org/open?code=a&state=b"],
    ["/openx", "https://store.DilMart.org/openx?code=a&state=b"],
    ["/open/foo", "https://store.DilMart.org/open/foo?code=a&state=b"],
    ["fragment", "https://store.DilMart.org/open?code=a&state=b#frag"],
    ["missing code", "https://store.DilMart.org/open?state=b"],
    ["missing state", "https://store.DilMart.org/open?code=a"],
    ["duplicate code", "https://store.DilMart.org/open?code=a&code=b&state=c"],
    ["duplicate state", "https://store.DilMart.org/open?code=a&state=b&state=c"],
    ["extra param", "https://store.DilMart.org/open?code=a&state=b&x=1"],
    ["oversized code", `https://store.DilMart.org/open?code=${"a".repeat(600)}&state=b`],
    ["oversized state", `https://store.DilMart.org/open?code=a&state=${"b".repeat(600)}`],
    ["userinfo", "https://user:pass@store.DilMart.org/open?code=a&state=b"],
    ["empty", ""],
    ["non-string", 123],
    ["bad charset", "https://store.DilMart.org/open?code=a b&state=c"],
  ];
  for (const [name, input] of bad) {
    it(`rejects: ${name}`, () => {
      expect(parseHandoffOpenUrl(input).ok).toBe(false);
    });
  }

  it("fingerprint is SHA-256, stable, collision-resistant, and never contains the raw values", async () => {
    const fp = await handoffFingerprint({ code: "abc123", state: "xyz789" });
    expect(fp).toBe(await handoffFingerprint({ code: "abc123", state: "xyz789" }));
    expect(fp).toMatch(/^fp_[0-9a-f]{64}$/); // SHA-256 hex, not a 32-bit hash
    expect(fp).not.toContain("abc123");
    expect(fp).not.toContain("xyz789");
    // The separator prevents (code,state) ambiguity: ("ab","c") ≠ ("a","bc").
    expect(await handoffFingerprint({ code: "ab", state: "c" })).not.toBe(await handoffFingerprint({ code: "a", state: "bc" }));
  });

  it("§5 FAILS CLOSED (throws) when Web Crypto SHA-256 is unavailable — never a weak/djb2 fallback", async () => {
    vi.stubGlobal("crypto", {}); // SubtleCrypto missing
    try {
      await expect(handoffFingerprint({ code: "abc123", state: "xyz789" })).rejects.toBeInstanceOf(HandoffCryptoUnavailableError);
    } finally {
      vi.unstubAllGlobals();
    }
    // sanity: real crypto is restored → SHA-256 resumes.
    expect(await handoffFingerprint({ code: "a", state: "b" })).toMatch(/^fp_[0-9a-f]{64}$/);
  });

  it("rejects malformed percent-encoding before URLSearchParams normalization (§4)", () => {
    for (const bad of ["%ZZ", "%", "%2", "%E0%A4%A", "%GG%20"]) {
      expect(parseHandoffOpenUrl(`https://store.DilMart.org/open?code=${bad}&state=ok`).ok, bad).toBe(false);
    }
    // A well-formed %20 (space) decodes to a space → rejected by the opaque charset, but not as malformed.
    expect(parseHandoffOpenUrl("https://store.DilMart.org/open?code=a%20b&state=ok").ok).toBe(false);
  });
});

// ── §25 target allowlist ──────────────────────────────────────────────────────
describe("validateTarget", () => {
  const valid = ["/", "/products", "/offers", "/stores", "/cart", "/checkout", "/wishlist", "/my-account/orders", "/my-account/addresses", "/track-order", "/category/example", "/product/example", "/store/example",
    // §1 — Arabic slugs must match the backend (lowercase latin + digits + Arabic + hyphen-separated).
    "/product/مثال", "/product/عناية-الشعر", "/category/العناية-بالشعر", "/store/متجر-مثال"];
  for (const t of valid) it(`allows ${t}`, () => expect(validateTarget(t)).toBe(t));

  const invalid = ["https://external.example", "//external.example", "/admin", "/merchant", "/agent", "/../../admin", "/product/../../admin", "/product/%2e%2e%2fadmin", "/category/%2e%2e", "/store/x%00", "/category/x?foo=1", "/product/x#y", "/unknown-route", "/my-account/settings", "", "product/x"];
  for (const t of invalid) it(`rejects ${JSON.stringify(t)} → /`, () => expect(validateTarget(t)).toBe("/"));

  // The single allowlisted query contract — must survive validation, because stripping it would
  // silently land the customer on the UNFILTERED products page instead of the brand they tapped.
  const validBrand: Array<[string, string]> = [
    ["/products?brand=Big%20Roc", "/products?brand=Big%20Roc"],
    ["/products?brand=Gavaro", "/products?brand=Gavaro"],
    ["/products?brand=%D8%B9%D8%B7%D9%88%D8%B1", "/products?brand=%D8%B9%D8%B7%D9%88%D8%B1"],
  ];
  for (const [input, expected] of validBrand) {
    it(`allows ${input}`, () => expect(validateTarget(input)).toBe(expected));
  }

  const invalidQuery = [
    "/products?foo=bar",            // unknown key
    "/products?brand=x&foo=y",      // unknown key alongside an allowed one
    "/products?brand=a&brand=b",    // duplicate
    "/products?brand=",             // empty
    "/products?brand=%3Cscript%3E", // markup
    "/products?brand=%2520",        // double-encoded
    "/products?brand=%E0%A4%A",     // malformed percent-encoding
    "/offers?brand=x",              // query not allowed on this route
    "/admin?brand=x",               // privileged route stays rejected
    "//evil.example?brand=x",       // protocol-relative stays rejected
  ];
  for (const t of invalidQuery) it(`rejects ${JSON.stringify(t)} → /`, () => expect(validateTarget(t)).toBe("/"));
});

// ── §26 controller: single-flight + dedup ─────────────────────────────────────
function authOutcome(target = "/product/example") {
  return { kind: "authenticated" as const, result: { status: "authenticated", session: { accessToken: "at", expiresIn: 600, refreshExpiresIn: 100 }, customer: { id: "c", linkedProfileId: "lp", origin: "DilMart" }, target } };
}
function makeController(redeem: any, over: any = {}) {
  const establishSession = over.establishSession ?? vi.fn(async () => ({ identityEpoch: 0 }));
  const getDevice = over.getDevice ?? vi.fn(async () => ({ platform: "web" as const, deviceId: "d1" }));
  return { c: new StoreHandoffController({ redeem, establishSession, getDevice }), establishSession, getDevice };
}

describe("StoreHandoffController", () => {
  it("valid URL → redeem once → success + validated target", async () => {
    const redeem = vi.fn(async () => authOutcome("/product/example"));
    const { c, establishSession } = makeController(redeem);
    const r = await c.handle(OK);
    // §2 — success now carries the verified Store customer id for the identity-bound readiness gate.
    expect(r).toEqual({ state: "success", target: "/product/example", customerId: "c", identityEpoch: 0 });
    expect(redeem).toHaveBeenCalledTimes(1);
    expect(establishSession).toHaveBeenCalledTimes(1);
  });

  it("§5 crypto unavailable (fingerprint throws) → unavailable, NEVER redeems", async () => {
    const redeem = vi.fn(async () => authOutcome());
    const fingerprint = vi.fn(async () => { throw new HandoffCryptoUnavailableError(); });
    const c = new StoreHandoffController({ redeem, establishSession: async () => ({ identityEpoch: 0 }), getDevice: async () => ({ platform: "web" as const, deviceId: "d" }), fingerprint });
    expect((await c.handle(OK)).state).toBe("unavailable");
    expect(redeem).not.toHaveBeenCalled();
  });

  it("10 concurrent same-handoff calls → exactly ONE redeem (single-flight)", async () => {
    // Deterministic: block the single in-flight run on getDevice so it cannot COMPLETE (and consume the
    // handoff) before all 10 concurrent dispatches coalesce onto it. Then release → all resolve to success.
    let releaseDevice: () => void = () => {};
    const deviceGate = new Promise<void>((r) => (releaseDevice = r));
    const redeem = vi.fn(async () => authOutcome("/cart"));
    const getDevice = vi.fn(async () => { await deviceGate; return { platform: "web" as const, deviceId: "d" }; });
    const c = new StoreHandoffController({ redeem, establishSession: async () => ({ identityEpoch: 0 }), getDevice });

    const all = Promise.all(Array.from({ length: 10 }, () => c.handle(OK)));
    await new Promise((r) => setTimeout(r, 25)); // all 10 dispatches await their fingerprint + coalesce
    releaseDevice();
    const results = await all;

    expect(redeem).toHaveBeenCalledTimes(1); // single-flight
    expect(getDevice).toHaveBeenCalledTimes(1); // only the one coalesced run resolved the device
    expect(results.every((r) => r.state === "success")).toBe(true);
  });

  it("after success, the same handoff → already_used, no second redeem", async () => {
    const redeem = vi.fn(async () => authOutcome("/"));
    const { c } = makeController(redeem);
    await c.handle(OK);
    const again = await c.handle(OK);
    expect(again).toEqual({ state: "already_used" });
    expect(redeem).toHaveBeenCalledTimes(1);
  });

  it("retryable error is NOT consumed (can retry same code); definitive error IS consumed", async () => {
    const rl = vi.fn(async () => ({ kind: "error" as const, code: "HANDOFF_RATE_LIMITED" as const, retryable: true }));
    const { c: c1 } = makeController(rl);
    expect((await c1.handle(OK)).state).toBe("retryable_error");
    expect((await c1.handle(OK)).state).toBe("retryable_error"); // retried
    expect(rl).toHaveBeenCalledTimes(2);

    const exp = vi.fn(async () => ({ kind: "error" as const, code: "HANDOFF_EXPIRED" as const, retryable: false }));
    const { c: c2 } = makeController(exp);
    expect((await c2.handle(OK)).state).toBe("expired");
    expect((await c2.handle(OK)).state).toBe("already_used"); // consumed → no re-redeem
    expect(exp).toHaveBeenCalledTimes(1);
  });

  it("identity_link_required → identity_verification_required (consumed)", async () => {
    const redeem = vi.fn(async () => ({ kind: "identity_link_required" as const }));
    const { c } = makeController(redeem);
    expect((await c.handle(OK)).state).toBe("identity_verification_required");
  });

  it("session establishment failure (storage_error) → unavailable, no navigation target", async () => {
    const redeem = vi.fn(async () => authOutcome("/"));
    const establishSession = vi.fn(async () => { throw Object.assign(new Error("x"), { code: "storage_error" }); });
    const { c } = makeController(redeem, { establishSession });
    expect((await c.handle(OK)).state).toBe("unavailable");
  });

  it("invalid URL → invalid, NEVER calls redeem", async () => {
    const redeem = vi.fn(async () => authOutcome());
    const { c } = makeController(redeem);
    expect((await c.handle("https://evil.example/open?code=a&state=b")).state).toBe("invalid");
    expect(redeem).not.toHaveBeenCalled();
  });

  it("blocked identity → blocked state", async () => {
    const redeem = vi.fn(async () => ({ kind: "error" as const, code: "IDENTITY_BLOCKED" as const, retryable: false }));
    const { c } = makeController(redeem);
    expect((await c.handle(OK)).state).toBe("blocked");
  });
});
