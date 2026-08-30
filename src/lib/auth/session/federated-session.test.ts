// @vitest-environment jsdom
/**
 * STORE-PR5 §Phase Q/N — federated client session suite (no server, no DB).
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §9.3–9.6.
 *
 * Covers: native secure storage (write/read-back/targeted-clear/device-id), the federated client API
 * (native body vs web cookie, no token in web body), the adapter refresh lifecycle (single-flight, 10
 * concurrent → 1 refresh, one 401 → clear, 5xx/network → preserve, logout/logout-all, storage_error),
 * the unified manager single-active-source + source switching, and the native-restart + web-reload
 * acceptance proofs incl. "no refresh token in browser storage".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FederatedSessionStorage, FEDERATED_NATIVE_STORAGE_KEY, DEVICE_ID_KEY } from "./federated-session-storage";
import { FederatedSessionApi } from "./federated-session-api";
import { FederatedSessionAdapter } from "./federated-session-adapter";
import { requiresIdentityRevalidation } from "./federated-token-claims";
import type { FederatedRedeemResult } from "./app-session.types";

// ── fakes ─────────────────────────────────────────────────────────────────────
function makeSecure() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: vi.fn(async (k: string) => (map.has(k) ? map.get(k)! : null)),
    setItem: vi.fn(async (k: string, v: string) => void map.set(k, v)),
    removeItem: vi.fn(async (k: string) => void map.delete(k)),
  };
}
function makePrefs() {
  const map = new Map<string, string>();
  return {
    map,
    get: vi.fn(async ({ key }: { key: string }) => ({ value: map.has(key) ? map.get(key)! : null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => void map.set(key, value)),
  };
}
function nativeStorage(secure = makeSecure(), prefs = makePrefs()) {
  const s = new FederatedSessionStorage({ isNative: () => true, secureStorage: secure, preferences: prefs, randomId: () => "dev-fixed-id" });
  return { s, secure, prefs };
}
/** Fake api with controllable outcomes; shape-compatible with FederatedSessionApi. */
function fakeApi(overrides: Partial<Record<"refresh" | "logout" | "logoutAll" | "getContext", any>> = {}) {
  const okRefresh = (accessToken: string) => ({ ok: true as const, data: { session: { accessToken, expiresIn: 600, refreshToken: "rt-new", refreshExpiresIn: 2592000 } } });
  return {
    refresh: vi.fn(async () => okRefresh("at-refreshed")),
    logout: vi.fn(async () => ({ ok: true as const, data: { status: "logged_out" } })),
    logoutAll: vi.fn(async () => ({ ok: true as const, data: { status: "logged_out" } })),
    getContext: vi.fn(async () => ({ ok: true as const, data: { authSource: "DilMart_federated", user: { id: "cust-1", email: null, phone: null }, activeRole: "customer", roles: ["customer"], capabilities: {} as any } })),
    ...overrides,
  } as unknown as FederatedSessionApi;
}

/**
 * Build a token shaped like a real federated access token (see FederatedAccessTokenService): the payload
 * carries `sub` = Store customer id plus the session family. The signature is not read by the client.
 */
function fedAccessToken(
  claims: { sub?: string; sessionFamilyId?: string; linkedProfileId?: string },
  extra: Record<string, unknown> = {},
) {
  const b64url = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `${b64url({ alg: "EdDSA", kid: "k1" })}.${b64url({
    ...claims,
    sessionType: "DilMart_federated_customer",
    role: "customer",
    sessionVersion: 1,
    ...extra,
  })}.sig`;
}

const REDEEM: FederatedRedeemResult = {
  status: "authenticated",
  session: { accessToken: "at-1", expiresIn: 600, refreshToken: "rt-1", refreshExpiresIn: 2592000 },
  customer: { id: "cust-1", displayName: "Fed", linkedProfileId: "lp-1", origin: "DilMart" },
  target: "/product/x",
};

// ── native secure storage ───────────────────────────────────────────────────
describe("FederatedSessionStorage (native)", () => {
  it("persists under the federated key with read-back and clears it (targeted)", async () => {
    const { s, secure } = nativeStorage();
    const rec = { version: 1 as const, authSource: "DilMart_federated" as const, accessToken: "a", accessExpiresAt: 1, refreshToken: "r", refreshExpiresAt: 2, customer: { id: "c", email: null, phone: null, linkedProfileId: "lp" }, deviceId: "d" };
    await s.persist(rec);
    expect(secure.map.get(FEDERATED_NATIVE_STORAGE_KEY)).toBe(JSON.stringify(rec));
    expect((await s.load())?.customer.id).toBe("c");
    await s.clear();
    expect(secure.map.has(FEDERATED_NATIVE_STORAGE_KEY)).toBe(false);
    expect(secure.removeItem).toHaveBeenCalledWith(FEDERATED_NATIVE_STORAGE_KEY); // never a global clear
  });

  it("surfaces storage_error when a secure write cannot be verified", async () => {
    const secure = makeSecure();
    secure.setItem.mockImplementation(async () => {}); // write silently drops → read-back mismatch
    const { s } = nativeStorage(secure);
    await expect(s.persist({ version: 1, authSource: "DilMart_federated", accessToken: "a", accessExpiresAt: 1, refreshToken: "r", refreshExpiresAt: 2, customer: { id: "c", email: null, phone: null, linkedProfileId: "lp" }, deviceId: "d" })).rejects.toMatchObject({ code: "storage_error" });
  });

  it("device id is generated once and reused (Preferences, not secure)", async () => {
    const { s, prefs } = nativeStorage();
    const id1 = await s.getOrCreateDeviceId();
    const id2 = await s.getOrCreateDeviceId();
    expect(id1).toBe(id2);
    expect(prefs.map.get(DEVICE_ID_KEY)).toBe(id1);
  });

  it("web mode persists nothing token-bearing (cookie owns it)", async () => {
    const secure = makeSecure();
    const s = new FederatedSessionStorage({ isNative: () => false, secureStorage: secure });
    await s.persist({ version: 1, authSource: "DilMart_federated", accessToken: "a", accessExpiresAt: 1, refreshToken: "r", refreshExpiresAt: 2, customer: { id: "c", email: null, phone: null, linkedProfileId: "lp" }, deviceId: "d" });
    expect(secure.setItem).not.toHaveBeenCalled();
    expect(await s.load()).toBeNull();
  });
});

// ── client api: native body vs web cookie ─────────────────────────────────────
describe("FederatedSessionApi channel", () => {
  it("native sends the refresh token in the body", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ session: { accessToken: "a", expiresIn: 600, refreshToken: "b", refreshExpiresIn: 10 } }) }) as any);
    const api = new FederatedSessionApi({ isNative: () => true, fetchImpl: fetchMock as any, baseUrl: "http://x/api" });
    await api.refresh("secret-rt", "dev-1");
    const init = fetchMock.mock.calls[0][1];
    expect(JSON.parse(init.body).refreshToken).toBe("secret-rt");
    expect(init.credentials).toBe("include");
  });

  it("web sends NO refresh token in the body and uses credentials include", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ session: { accessToken: "a", expiresIn: 600, refreshExpiresIn: 10 } }) }) as any);
    const api = new FederatedSessionApi({ isNative: () => false, fetchImpl: fetchMock as any, baseUrl: "http://x/api" });
    await api.refresh("should-not-be-sent");
    const init = fetchMock.mock.calls[0][1];
    expect(JSON.parse(init.body).refreshToken).toBeUndefined();
    expect(init.credentials).toBe("include");
  });

  it("classifies 401 definitive, 403 forbidden, 503 transient (refresh + getContext)", async () => {
    const mk = (status: number) => new FederatedSessionApi({ isNative: () => true, baseUrl: "http://x/api", fetchImpl: (async () => ({ ok: false, status, text: async () => "", json: async () => ({}) })) as any });
    expect(await mk(401).refresh("t")).toMatchObject({ ok: false, kind: "definitive" });
    expect(await mk(403).refresh("t")).toMatchObject({ ok: false, kind: "forbidden" });
    expect(await mk(503).refresh("t")).toMatchObject({ ok: false, kind: "transient" });
    // BLOCKER C: getContext must classify 403 as forbidden, never definitive.
    expect(await mk(401).getContext("t")).toMatchObject({ ok: false, kind: "definitive" });
    expect(await mk(403).getContext("t")).toMatchObject({ ok: false, kind: "forbidden" });
  });
});

// ── device binding on refresh ────────────────────────────────────────────────
/**
 * Production regression (proven against prod 2026-08-22): the redeem binds the session family to the
 * app-scoped device id, and `rotate_federated_refresh_token` fails closed when the rotation presents a
 * different (or absent) device hash — "a bound family requires the same device hash at refresh".
 * The web refresh sent an empty body, so EVERY web federated session died 401 on its first refresh
 * (i.e. on the first page reload, or after the 600s access token lapsed), and the 401 cleared the
 * `__Host-` cookie. Same cookie + same endpoint, only the body differing: {} → 401, {device} → 200.
 */
describe("FederatedSessionApi device binding (regression)", () => {
  const okBody = JSON.stringify({ session: { accessToken: "a", expiresIn: 600, refreshExpiresIn: 10 } });
  const mkFetch = () => vi.fn(async () => ({ ok: true, status: 200, text: async () => okBody }) as unknown as Response);
  const sentBody = (m: ReturnType<typeof mkFetch>): Record<string, unknown> =>
    JSON.parse(String((m.mock.calls[0][1] as RequestInit).body));

  it("web sends device{platform:web,deviceId} so the bound family can rotate", async () => {
    const fetchMock = mkFetch();
    const api = new FederatedSessionApi({ isNative: () => false, fetchImpl: fetchMock as unknown as typeof fetch, baseUrl: "http://x/api" });
    await api.refresh(undefined, "dev-web-1");
    expect(sentBody(fetchMock).device).toEqual({ platform: "web", deviceId: "dev-web-1" });
  });

  it("web still sends NO refresh token in the body even when device is present (ambiguity guard)", async () => {
    const fetchMock = mkFetch();
    const api = new FederatedSessionApi({ isNative: () => false, fetchImpl: fetchMock as unknown as typeof fetch, baseUrl: "http://x/api" });
    await api.refresh("must-not-be-sent", "dev-web-1");
    const body = sentBody(fetchMock);
    expect(body.refreshToken).toBeUndefined();
    expect(body.device).toEqual({ platform: "web", deviceId: "dev-web-1" });
  });

  it("web omits device entirely when no device id is known (never binds to a blank id)", async () => {
    const fetchMock = mkFetch();
    const api = new FederatedSessionApi({ isNative: () => false, fetchImpl: fetchMock as unknown as typeof fetch, baseUrl: "http://x/api" });
    await api.refresh(undefined, undefined);
    expect(sentBody(fetchMock)).toEqual({});
  });

  it("native keeps platform:native and still carries the raw refresh token", async () => {
    const fetchMock = mkFetch();
    const api = new FederatedSessionApi({ isNative: () => true, fetchImpl: fetchMock as unknown as typeof fetch, baseUrl: "http://x/api" });
    await api.refresh("secret-rt", "dev-nat-1");
    const body = sentBody(fetchMock);
    expect(body.refreshToken).toBe("secret-rt");
    expect(body.device).toEqual({ platform: "native", deviceId: "dev-nat-1" });
  });
});

describe("web reload restores the federated session from cookie + persisted device id", () => {
  function webStorage(prefs = makePrefs()) {
    const s = new FederatedSessionStorage({ isNative: () => false, secureStorage: makeSecure(), preferences: prefs, randomId: () => "should-not-be-minted" });
    return { s, prefs };
  }

  it("peekDeviceId reads the stored id and does NOT mint one when absent", async () => {
    const { s, prefs } = webStorage();
    expect(await s.peekDeviceId()).toBeNull();
    expect(prefs.set).not.toHaveBeenCalled(); // a non-redeemed visitor must never be assigned an id
    prefs.map.set(DEVICE_ID_KEY, "dev-web-1");
    expect(await s.peekDeviceId()).toBe("dev-web-1");
  });

  it("bootstrap with EMPTY memory (post-reload) forwards the persisted device id to refresh", async () => {
    const { s, prefs } = webStorage();
    prefs.map.set(DEVICE_ID_KEY, "dev-web-1");
    const api = fakeApi();
    const web = new FederatedSessionAdapter({ isNative: () => false, api, storage: s });

    const session = await web.bootstrap();

    expect(session).not.toBeNull();
    // Regression: this argument was `undefined` in production, which is what produced the 401.
    expect(vi.mocked(api.refresh).mock.calls[0]).toEqual([undefined, "dev-web-1"]);
  });

  it("a reload with no persisted device id still refreshes (cookie-only families stay valid)", async () => {
    const { s } = webStorage();
    const api = fakeApi();
    const web = new FederatedSessionAdapter({ isNative: () => false, api, storage: s });

    await web.bootstrap();

    expect(vi.mocked(api.refresh).mock.calls[0]).toEqual([undefined, undefined]);
  });
});

// ── adapter refresh lifecycle ─────────────────────────────────────────────────
describe("FederatedSessionAdapter lifecycle", () => {
  it("establish (native) persists the encrypted record; web stores no token", async () => {
    const { s, secure } = nativeStorage();
    const nat = new FederatedSessionAdapter({ isNative: () => true, api: fakeApi(), storage: s });
    const sess = await nat.establishFromRedeem(REDEEM);
    expect(sess.user.id).toBe("cust-1");
    expect(secure.map.has(FEDERATED_NATIVE_STORAGE_KEY)).toBe(true);

    const webSecure = makeSecure();
    const webStore = new FederatedSessionStorage({ isNative: () => false, secureStorage: webSecure });
    const web = new FederatedSessionAdapter({ isNative: () => false, api: fakeApi(), storage: webStore });
    await web.establishFromRedeem({ ...REDEEM, session: { ...REDEEM.session, refreshToken: undefined } });
    expect(webSecure.setItem).not.toHaveBeenCalled();
  });

  it("10 concurrent getValidAccessToken calls trigger exactly ONE refresh", async () => {
    const api = fakeApi();
    let t = 1_000_000;
    const adapter = new FederatedSessionAdapter({ isNative: () => true, api, storage: nativeStorage().s, now: () => t });
    await adapter.establishFromRedeem(REDEEM); // accessExpiresAt = t + 600_000
    t += 700_000; // advance past access expiry → next getValidAccessToken must refresh
    const tokens = await Promise.all(Array.from({ length: 10 }, () => adapter.getValidAccessToken()));
    expect((api.refresh as any).mock.calls.length).toBe(1);
    expect(new Set(tokens)).toEqual(new Set(["at-refreshed"]));
  });

  it("one 401 clears the session (definitive)", async () => {
    const api = fakeApi({ refresh: vi.fn(async () => ({ ok: false, kind: "definitive", status: 401 })) });
    const { s, secure } = nativeStorage();
    const adapter = new FederatedSessionAdapter({ isNative: () => true, api, storage: s });
    await adapter.establishFromRedeem(REDEEM);
    const out = await adapter.refreshSingleFlight();
    expect(out.status).toBe("definitive_failure");
    expect(adapter.hasSession()).toBe(false);
    expect(secure.map.has(FEDERATED_NATIVE_STORAGE_KEY)).toBe(false);
  });

  it("5xx/network preserves the session (transient)", async () => {
    const api = fakeApi({ refresh: vi.fn(async () => ({ ok: false, kind: "transient", status: 503 })) });
    const adapter = new FederatedSessionAdapter({ isNative: () => true, api, storage: nativeStorage().s });
    await adapter.establishFromRedeem(REDEEM);
    const out = await adapter.refreshSingleFlight();
    expect(out.status).toBe("transient_failure");
    expect(adapter.hasSession()).toBe(true);
  });

  it("BLOCKER C: refresh 403 (forbidden) preserves the session — never clears", async () => {
    const api = fakeApi({ refresh: vi.fn(async () => ({ ok: false, kind: "forbidden", status: 403 })) });
    const adapter = new FederatedSessionAdapter({ isNative: () => true, api, storage: nativeStorage().s });
    await adapter.establishFromRedeem(REDEEM);
    const out = await adapter.refreshSingleFlight();
    expect(out.status).toBe("transient_failure");
    expect(adapter.hasSession()).toBe(true);
  });

  it("BLOCKER B: definitive refresh + FAILED secure clear → storage_error (not a raw throw)", async () => {
    const secure = makeSecure();
    secure.removeItem = vi.fn(async () => { throw new Error("keychain locked"); });
    const store = new FederatedSessionStorage({ isNative: () => true, secureStorage: secure, preferences: makePrefs(), randomId: () => "d" });
    const api = fakeApi({ refresh: vi.fn(async () => ({ ok: false, kind: "definitive", status: 401 })) });
    const adapter = new FederatedSessionAdapter({ isNative: () => true, api, storage: store });
    await adapter.establishFromRedeem(REDEEM);
    const out = await adapter.refreshSingleFlight();
    expect(out.status).toBe("storage_error");
    expect(adapter.getStorageError()).toBeTruthy();
  });

  it("logout revokes and clears local secure state", async () => {
    const api = fakeApi();
    const { s, secure } = nativeStorage();
    const adapter = new FederatedSessionAdapter({ isNative: () => true, api, storage: s });
    await adapter.establishFromRedeem(REDEEM);
    await adapter.logout();
    expect((api.logout as any).mock.calls.length).toBe(1);
    expect(adapter.hasSession()).toBe(false);
    expect(secure.map.has(FEDERATED_NATIVE_STORAGE_KEY)).toBe(false);
  });
});

// ── cross-identity guard (web shared __Host- cookie) ─────────────────────────
describe("web refresh cross-identity guard", () => {
  const A = { sub: "cust-A", sessionFamilyId: "fam-A", linkedProfileId: "lp-A" };
  const B = { sub: "cust-B", sessionFamilyId: "fam-B", linkedProfileId: "lp-B" };

  /**
   * One browser profile: the __Host- refresh cookie is scoped to the API host and shared by EVERY tab,
   * and all tabs read the same persisted device id. `cookieOwner` is that single shared credential — the
   * last redeem wins, exactly as the server's Set-Cookie does.
   */
  function browserProfile() {
    const prefs = makePrefs(); // the ONE shared device id
    let cookieOwner = A;
    const newTab = () => {
      const api = fakeApi({
        // Refresh always answers for whoever currently owns the shared cookie.
        refresh: vi.fn(async () => ({
          ok: true as const,
          data: { session: { accessToken: fedAccessToken(cookieOwner), expiresIn: 600, refreshExpiresIn: 2592000 } },
        })),
      });
      const storage = new FederatedSessionStorage({ isNative: () => false, preferences: prefs, randomId: () => "shared-device" });
      return { api, adapter: new FederatedSessionAdapter({ isNative: () => false, api, storage }) };
    };
    const redeem = (who: typeof A): FederatedRedeemResult => {
      cookieOwner = who; // the server replaces the shared cookie on every redeem
      return {
        status: "authenticated",
        session: { accessToken: fedAccessToken(who), expiresIn: 600, refreshExpiresIn: 2592000 },
        customer: { id: who.sub, linkedProfileId: who.linkedProfileId, origin: "DilMart" },
      };
    };
    return { newTab, redeem, prefs };
  }

  it("tab A must NOT keep customer A's identity after tab B's redeem replaces the shared cookie", async () => {
    const profile = browserProfile();
    const tabA = profile.newTab();
    const tabB = profile.newTab();

    const aSession = await tabA.adapter.establishFromRedeem(profile.redeem(A));
    expect(aSession.user.id).toBe("cust-A");

    // Same browser profile, second tab: customer B redeems a handoff. One cookie, one device id.
    await tabB.adapter.establishFromRedeem(profile.redeem(B));
    expect(await profile.prefs.get({ key: DEVICE_ID_KEY })).toEqual({ value: "shared-device" });

    // Tab A now refreshes. The request succeeds — against B's cookie.
    const out = await tabA.adapter.refreshSingleFlight();
    expect(out.status).toBe("refreshed");

    // The regression: A's identity must not silently carry over onto B's token.
    const after = tabA.adapter.getSession();
    // The generic projection must NOT carry the token while the identity is unresolved — it authorizes as
    // a customer we have not verified. The adapter really did adopt B's token; that is asserted through
    // the one path allowed to see it.
    expect(after?.accessToken).toBe("");
    expect((await tabA.adapter.getAccessTokenForIdentityResolution()).token).toBe(fedAccessToken(B));
    expect(after?.user.id).not.toBe("cust-A"); // ← fails before the fix: UI shows A, token authorizes B
    expect(after?.federated?.linkedProfileId).not.toBe("lp-A");
    expect(after?.user.id).toBe(""); // unresolved → the caller re-keys and refetches /auth/context
    expect(after?.federated?.linkedProfileId).toBe("");
    expect(out.requiresIdentityRevalidation).toBe(true);
  });

  it("an ordinary rotation inside the SAME family keeps the identity (no false positive)", async () => {
    // A REAL rotation: new token bytes (fresh jti), identical sub / family / linked profile. Building it
    // from the same claims object would produce a byte-identical JWT and prove nothing.
    const rotatedToken = fedAccessToken(A, { jti: "rotated-1" });
    const api = fakeApi({
      refresh: vi.fn(async () => ({
        ok: true as const,
        data: { session: { accessToken: rotatedToken, expiresIn: 600, refreshExpiresIn: 2592000 } },
      })),
    });
    const adapter = new FederatedSessionAdapter({ isNative: () => false, api, storage: new FederatedSessionStorage({ isNative: () => false }) });
    await adapter.establishFromRedeem({
      status: "authenticated",
      session: { accessToken: fedAccessToken(A), expiresIn: 600, refreshExpiresIn: 2592000 },
      customer: { id: A.sub, linkedProfileId: A.linkedProfileId, origin: "DilMart" },
    });

    const out = await adapter.refreshSingleFlight();
    expect(out.status).toBe("refreshed");
    expect(rotatedToken).not.toBe(fedAccessToken(A)); // genuinely a different token
    expect(adapter.getSession()?.accessToken).toBe(rotatedToken); // and it was adopted
    expect(out.requiresIdentityRevalidation).toBe(false);
    expect(adapter.getSession()?.user.id).toBe("cust-A");
    expect(adapter.getSession()?.federated?.linkedProfileId).toBe("lp-A");
  });

  it("a token whose identity cannot be read fails CLOSED on web (never assumed to be the same user)", async () => {
    const api = fakeApi(); // returns the opaque "at-refreshed"
    const adapter = new FederatedSessionAdapter({ isNative: () => false, api, storage: new FederatedSessionStorage({ isNative: () => false }) });
    await adapter.establishFromRedeem({
      status: "authenticated",
      session: { accessToken: fedAccessToken(A), expiresIn: 600, refreshExpiresIn: 2592000 },
      customer: { id: A.sub, linkedProfileId: A.linkedProfileId, origin: "DilMart" },
    });

    const out = await adapter.refreshSingleFlight();
    expect(adapter.getSession()?.user.id).toBe("");
    expect(out.requiresIdentityRevalidation).toBe(true);
  });

  it("NATIVE rotation is exempt: the refresh token is device-private, so the identity is preserved", async () => {
    const api = fakeApi(); // opaque rotated token
    const adapter = new FederatedSessionAdapter({ isNative: () => true, api, storage: nativeStorage().s });
    await adapter.establishFromRedeem(REDEEM);
    const out = await adapter.refreshSingleFlight();
    expect(out.status).toBe("refreshed");
    expect(out.requiresIdentityRevalidation).toBe(false);
    expect(adapter.getSession()?.user.id).toBe("cust-1");
  });
});

// ── restart / reload acceptance proofs ────────────────────────────────────────
describe("acceptance: restart / reload", () => {
  it("NATIVE restart: a fresh adapter over the same secure store restores the same customer", async () => {
    const secure = makeSecure();
    const prefs = makePrefs();
    const store1 = new FederatedSessionStorage({ isNative: () => true, secureStorage: secure, preferences: prefs, randomId: () => "d1" });
    const a1 = new FederatedSessionAdapter({ isNative: () => true, api: fakeApi(), storage: store1 });
    await a1.establishFromRedeem(REDEEM);

    // Destroy JS memory → brand new manager instances, SAME encrypted store.
    const store2 = new FederatedSessionStorage({ isNative: () => true, secureStorage: secure, preferences: prefs, randomId: () => "d1" });
    const a2 = new FederatedSessionAdapter({ isNative: () => true, api: fakeApi(), storage: store2 });
    const restored = await a2.bootstrap();
    expect(restored?.user.id).toBe("cust-1");
  });

  it("WEB reload: a fresh adapter mints an access token from the cookie (no body token); NO refresh token in browser storage", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const api = fakeApi();
    const web = new FederatedSessionAdapter({ isNative: () => false, api, storage: new FederatedSessionStorage({ isNative: () => false }) });
    const restored = await web.bootstrap(); // cookie refresh
    expect(restored).not.toBeNull();
    expect((api.refresh as any).mock.calls.length).toBe(1);
    // The web refresh call carried no body token (cookie owns it): fakeApi ignores args, so assert storage is clean.
    const blob = JSON.stringify({ ls: { ...localStorage }, ss: { ...sessionStorage } });
    expect(blob).not.toContain("rt-");
    expect(blob).not.toContain("refreshToken");
  });
});

// ── claim contract: continuation must be PROVEN, never assumed ───────────────
/**
 * The decode is unverified and is never an authorization decision — it only decides whether to distrust
 * a token the client already holds. So every unprovable case must resolve to "revalidate": the worst a
 * forged or garbled payload can achieve is an extra /auth/context round trip, never a silent handover.
 */
describe("requiresIdentityRevalidation contract", () => {
  const CLAIMS = { sub: "cust-A", sessionFamilyId: "fam-A", linkedProfileId: "lp-A" };
  const tokenA = fedAccessToken(CLAIMS);
  const held = { accessToken: tokenA, storeCustomerId: "cust-A" };

  it("same sub + same family + new token bytes → continuation (no revalidation)", () => {
    const rotated = fedAccessToken(CLAIMS, { jti: "r2" });
    expect(rotated).not.toBe(tokenA);
    expect(requiresIdentityRevalidation(held, rotated)).toBe(false);
  });

  it("different sub → revalidate", () => {
    expect(requiresIdentityRevalidation(held, fedAccessToken({ ...CLAIMS, sub: "cust-B" }))).toBe(true);
  });

  it("same sub but DIFFERENT family → revalidate (approved decision: family replacement is untrusted)", () => {
    expect(requiresIdentityRevalidation(held, fedAccessToken({ ...CLAIMS, sessionFamilyId: "fam-B" }))).toBe(true);
  });

  it("next token missing sessionFamilyId → revalidate (unprovable, not benign)", () => {
    expect(requiresIdentityRevalidation(held, fedAccessToken({ sub: "cust-A", linkedProfileId: "lp-A" }))).toBe(true);
  });

  it("PREVIOUS token missing sessionFamilyId → revalidate", () => {
    const prevNoFamily = { accessToken: fedAccessToken({ sub: "cust-A", linkedProfileId: "lp-A" }), storeCustomerId: "cust-A" };
    expect(requiresIdentityRevalidation(prevNoFamily, fedAccessToken(CLAIMS))).toBe(true);
  });

  it("either token unreadable → revalidate", () => {
    expect(requiresIdentityRevalidation(held, "not-a-jwt")).toBe(true);
    expect(requiresIdentityRevalidation({ accessToken: "opaque", storeCustomerId: "cust-A" }, tokenA)).toBe(true);
  });

  it("token sub disagrees with the identity held in memory → revalidate", () => {
    expect(requiresIdentityRevalidation({ accessToken: tokenA, storeCustomerId: "cust-OTHER" }, fedAccessToken(CLAIMS))).toBe(true);
  });

  it("same sub + same family but DIFFERENT linkedProfileId → revalidate", () => {
    expect(requiresIdentityRevalidation(held, fedAccessToken({ ...CLAIMS, linkedProfileId: "lp-OTHER" }))).toBe(true);
  });
});

// ── persistent barrier: the full cross-tab state machine ────────────────────
/**
 * The security property is not "the refresh that noticed returns a flag" — it is that the replacement
 * token stays QUARANTINED from generic use until /auth/context resolves it. A returned boolean cannot do
 * that: once adopted, the token is no longer expiring, so the NEXT acquisition would hand it out as
 * ordinary. These tests drive the real adapter through the whole transition.
 */
describe("§9.3 persistent identity barrier", () => {
  const A = { sub: "cust-A", sessionFamilyId: "fam-A", linkedProfileId: "lp-A" };
  const B = { sub: "cust-B", sessionFamilyId: "fam-B", linkedProfileId: "lp-B" };

  function tab(cookieOwner: { current: typeof A }) {
    const events: string[] = [];
    const api = fakeApi({
      refresh: vi.fn(async () => ({
        ok: true as const,
        data: { session: { accessToken: fedAccessToken(cookieOwner.current), expiresIn: 600, refreshExpiresIn: 2592000 } },
      })),
    });
    const adapter = new FederatedSessionAdapter({
      isNative: () => false,
      api,
      storage: new FederatedSessionStorage({ isNative: () => false, preferences: makePrefs(), randomId: () => "shared-device" }),
      onLifecycleEvent: (e) => events.push(e.type),
    });
    return { adapter, events, api };
  }

  /** `expiresIn` under the 60s proactive threshold, so acquisition triggers a refresh. */
  const redeemFor = (who: typeof A, expiresIn = 30) => ({
    status: "authenticated" as const,
    session: { accessToken: fedAccessToken(who), expiresIn, refreshExpiresIn: 2592000 },
    customer: { id: who.sub, linkedProfileId: who.linkedProfileId, origin: "DilMart" },
  });

  it("acquisition A to B: quarantines the token, blocks the NEXT request too, resolves only via context", async () => {
    const cookieOwner = { current: A };
    const { adapter, events } = tab(cookieOwner);
    await adapter.establishFromRedeem(redeemFor(A));
    expect(adapter.isIdentityResolutionPending()).toBe(false);

    // Another tab of this browser profile redeemed B, replacing the shared __Host- cookie.
    cookieOwner.current = B;

    // (1) Acquisition refreshes the expiring token and lands on B.
    const first = await adapter.getValidAccessTokenOutcome();
    expect(first).toEqual({ token: null, requiresIdentityRevalidation: true });
    expect(adapter.isIdentityResolutionPending()).toBe(true);
    expect(adapter.getSession()?.user.id).toBe(""); // A's identity dropped
    expect(events).toEqual(["federated_identity_revalidation_required"]);

    // (2) THE REGRESSION: the second request must ALSO be blocked. B's token is now in memory and is no
    // longer expiring, so a flag-only design would hand it over here and execute as B under A's UI.
    const second = await adapter.getValidAccessTokenOutcome();
    expect(second).toEqual({ token: null, requiresIdentityRevalidation: true });
    expect(await adapter.getValidAccessToken()).toBeNull();

    // (3) The one legitimate consumer can still get the token, or the barrier would deadlock.
    expect((await adapter.getAccessTokenForIdentityResolution()).token).toBe(fedAccessToken(B));
    expect(adapter.isIdentityResolutionPending()).toBe(true); // reading it does NOT clear the barrier

    // (4) Verified resolution — the only normal way out.
    adapter.applyVerifiedIdentity({ id: B.sub, email: null, phone: null }, B.linkedProfileId, adapter.getIdentityEpoch());
    expect(adapter.isIdentityResolutionPending()).toBe(false);
    expect(events).toEqual(["federated_identity_revalidation_required", "federated_identity_resolved"]);

    // (5) Generic traffic flows again, as the verified new customer.
    const third = await adapter.getValidAccessTokenOutcome();
    expect(third.requiresIdentityRevalidation).toBe(false);
    expect(third.token).toBe(fedAccessToken(B));
    expect(adapter.getSession()?.user.id).toBe("cust-B");
  });

  it("publishes exactly one event per logical transition, however many refreshes occur", async () => {
    const cookieOwner = { current: A };
    const { adapter, events } = tab(cookieOwner);
    await adapter.establishFromRedeem(redeemFor(A));
    cookieOwner.current = B;

    await adapter.getValidAccessTokenOutcome();
    await adapter.getValidAccessTokenOutcome();
    await adapter.getValidAccessTokenOutcome();
    expect(events).toEqual(["federated_identity_revalidation_required"]); // not three

    adapter.applyVerifiedIdentity({ id: B.sub, email: null, phone: null }, B.linkedProfileId, adapter.getIdentityEpoch());
    adapter.applyVerifiedIdentity({ id: B.sub, email: null, phone: null }, B.linkedProfileId, adapter.getIdentityEpoch());
    expect(events).toEqual(["federated_identity_revalidation_required", "federated_identity_resolved"]);
  });

  it("same customer, NEW family still revalidates, then context restores the same customer", async () => {
    const A2 = { ...A, sessionFamilyId: "fam-A2" };
    const cookieOwner = { current: A };
    const { adapter, events } = tab(cookieOwner);
    await adapter.establishFromRedeem(redeemFor(A));
    cookieOwner.current = A2;

    expect(await adapter.getValidAccessTokenOutcome()).toEqual({ token: null, requiresIdentityRevalidation: true });
    adapter.applyVerifiedIdentity({ id: A.sub, email: null, phone: null }, A.linkedProfileId, adapter.getIdentityEpoch());
    expect(adapter.getSession()?.user.id).toBe("cust-A"); // same customer, no user-visible logout
    expect(events).toEqual(["federated_identity_revalidation_required", "federated_identity_resolved"]);
  });

  it("same family rotation is a fast path: no barrier, no event, token flows straight through", async () => {
    const cookieOwner = { current: A };
    const { adapter, events } = tab(cookieOwner);
    await adapter.establishFromRedeem(redeemFor(A));

    const out = await adapter.getValidAccessTokenOutcome();
    expect(out.requiresIdentityRevalidation).toBe(false);
    expect(out.token).toBe(fedAccessToken(A));
    expect(adapter.isIdentityResolutionPending()).toBe(false);
    expect(events).toEqual([]);
    expect(adapter.getSession()?.user.id).toBe("cust-A");
  });

  it("web cold bootstrap has a token but no verified customer: context only, generic blocked", async () => {
    const cookieOwner = { current: A };
    const { adapter, events } = tab(cookieOwner);

    const session = await adapter.bootstrap(); // no memory — mints from the cookie
    expect(session).not.toBeNull();
    expect(adapter.isIdentityResolutionPending()).toBe(true);
    expect(events).toEqual(["federated_identity_revalidation_required"]);

    expect(await adapter.getValidAccessTokenOutcome()).toEqual({ token: null, requiresIdentityRevalidation: true });
    expect((await adapter.getAccessTokenForIdentityResolution()).token).toBe(fedAccessToken(A));

    adapter.applyVerifiedIdentity({ id: A.sub, email: null, phone: null }, A.linkedProfileId, adapter.getIdentityEpoch());
    expect((await adapter.getValidAccessTokenOutcome()).token).toBe(fedAccessToken(A));
  });

  it("a transient refresh failure does NOT raise the barrier or lose the resolved identity", async () => {
    const api = fakeApi({ refresh: vi.fn(async () => ({ ok: false as const, kind: "transient" as const, status: 503 })) });
    const events: string[] = [];
    const adapter = new FederatedSessionAdapter({
      isNative: () => false,
      api,
      storage: new FederatedSessionStorage({ isNative: () => false, preferences: makePrefs(), randomId: () => "d" }),
      onLifecycleEvent: (e) => events.push(e.type),
    });
    await adapter.establishFromRedeem(redeemFor(A));

    const out = await adapter.getValidAccessTokenOutcome();
    expect(out.requiresIdentityRevalidation).toBe(false);
    expect(out.token).toBe(fedAccessToken(A)); // the current token may still be accepted
    expect(adapter.isIdentityResolutionPending()).toBe(false);
    expect(events).toEqual([]);
    expect(adapter.getSession()?.user.id).toBe("cust-A");
  });

  it("NATIVE is exempt: no barrier, no event", async () => {
    const events: string[] = [];
    const adapter = new FederatedSessionAdapter({
      isNative: () => true,
      api: fakeApi(),
      storage: nativeStorage().s,
      onLifecycleEvent: (e) => events.push(e.type),
    });
    await adapter.establishFromRedeem(REDEEM);
    await adapter.refreshSingleFlight();
    expect(adapter.isIdentityResolutionPending()).toBe(false);
    expect(events).toEqual([]);
    expect(adapter.getSession()?.user.id).toBe("cust-1");
  });
});

// ── generation-bound resolution: a late /auth/context must not close a newer barrier ──
/**
 * The barrier alone is not enough. Resolution is asynchronous, so a /auth/context started for customer B
 * can land AFTER another refresh already moved the session to customer C. Applying it then would install
 * B's identity over C's token and clear C's barrier — UI=B while API=C. Every identity write is therefore
 * bound to the resolution generation it was started for.
 */
describe("§9.3 identity-resolution generation", () => {
  const A = { sub: "cust-A", sessionFamilyId: "fam-A", linkedProfileId: "lp-A" };
  const B = { sub: "cust-B", sessionFamilyId: "fam-B", linkedProfileId: "lp-B" };
  const C = { sub: "cust-C", sessionFamilyId: "fam-C", linkedProfileId: "lp-C" };

  function tab(cookieOwner: { current: typeof A }) {
    const events: Array<{ type: string; epoch: number }> = [];
    const api = fakeApi({
      refresh: vi.fn(async () => ({
        ok: true as const,
        data: { session: { accessToken: fedAccessToken(cookieOwner.current), expiresIn: 30, refreshExpiresIn: 2592000 } },
      })),
    });
    const adapter = new FederatedSessionAdapter({
      isNative: () => false,
      api,
      storage: new FederatedSessionStorage({ isNative: () => false, preferences: makePrefs(), randomId: () => "shared-device" }),
      onLifecycleEvent: (e) => events.push({ type: e.type, epoch: e.epoch }),
    });
    return { adapter, events };
  }

  const redeemFor = (who: typeof A) => ({
    status: "authenticated" as const,
    session: { accessToken: fedAccessToken(who), expiresIn: 30, refreshExpiresIn: 2592000 },
    customer: { id: who.sub, linkedProfileId: who.linkedProfileId, origin: "DilMart" },
  });

  it("a stale B resolution is REJECTED after the session moves to C, and C then resolves", async () => {
    const cookieOwner = { current: A };
    const { adapter, events } = tab(cookieOwner);
    await adapter.establishFromRedeem(redeemFor(A));

    // A → B raises the barrier at generation N.
    cookieOwner.current = B;
    await adapter.getValidAccessTokenOutcome();
    const credentialB = await adapter.getAccessTokenForIdentityResolution();
    const generationB = credentialB.epoch;
    expect(adapter.isIdentityResolutionPending()).toBe(true);

    // While /auth/context for B is still in flight, another refresh installs C. Note this cannot come
    // from generic acquisition — that short-circuits at the quarantine and never refreshes while pending.
    // In production it is the already-in-flight request 401-ing, or the resolution path renewing an
    // expiring token, that discovers the cookie has moved again.
    cookieOwner.current = C;
    await adapter.refreshSingleFlight();
    const generationC = adapter.getIdentityEpoch();
    expect(generationC).toBe(generationB + 1);
    expect(adapter.isIdentityResolutionPending()).toBe(true);

    // NOW B's response arrives. It must not apply, and must not clear C's barrier.
    const appliedStale = adapter.applyVerifiedIdentity({ id: B.sub, email: null, phone: null }, B.linkedProfileId, generationB);
    expect(appliedStale).toBe(false);
    expect(adapter.isIdentityResolutionPending()).toBe(true);
    expect(adapter.getSession()?.user.id).toBe(""); // still unresolved — never B
    expect(await adapter.getValidAccessToken()).toBeNull(); // generic traffic still blocked

    // The current generation's resolution succeeds.
    const appliedCurrent = adapter.applyVerifiedIdentity({ id: C.sub, email: null, phone: null }, C.linkedProfileId, generationC);
    expect(appliedCurrent).toBe(true);
    expect(adapter.isIdentityResolutionPending()).toBe(false);
    expect(adapter.getSession()?.user.id).toBe("cust-C");
    expect((await adapter.getValidAccessTokenOutcome()).token).toBe(fedAccessToken(C));

    // Two distinct unresolved contexts → two transition events, one resolve.
    expect(events.map((e) => e.type)).toEqual([
      "federated_identity_revalidation_required",
      "federated_identity_revalidation_required",
      "federated_identity_resolved",
    ]);
    expect(events[0].epoch).toBe(generationB);
    expect(events[1].epoch).toBe(generationC);
  });

  it("the authoritative identity write REQUIRES an epoch — an unbound write is not expressible", async () => {
    const cookieOwner = { current: A };
    const { adapter } = tab(cookieOwner);
    await adapter.establishFromRedeem(redeemFor(A));

    // Arity 3: the epoch has no default and is not optional, so it cannot be omitted at a call site.
    expect(adapter.applyVerifiedIdentity.length).toBe(3);
    // The old unbound path is gone entirely, not merely deprecated.
    expect((adapter as unknown as Record<string, unknown>).applyIdentity).toBeUndefined();

    // COMPILE-TIME CONTRACT. The epoch is branded, so a caller cannot invent one from a bare number.
    // If the brand were ever removed, `number extends EpochParam` becomes true and the `false` literal
    // below stops type-checking — the regression is caught by tsc, not by this assertion.
    type EpochParam = Parameters<typeof adapter.applyVerifiedIdentity>[2];
    const epochIsANumber: EpochParam extends number ? true : false = true;
    const anyNumberIsAnEpoch: number extends EpochParam ? true : false = false;
    expect(epochIsANumber).toBe(true);
    expect(anyNumberIsAnEpoch).toBe(false);
  });

  it("REDEEM replacement: a late context from the previous session cannot overwrite the new one", async () => {
    const cookieOwner = { current: A };
    const { adapter } = tab(cookieOwner);
    await adapter.establishFromRedeem(redeemFor(A));

    // A -> B raises the barrier; /auth/context for B starts under this epoch.
    cookieOwner.current = B;
    await adapter.getValidAccessTokenOutcome();
    const epochB = (await adapter.getAccessTokenForIdentityResolution()).epoch;
    expect(adapter.isIdentityResolutionPending()).toBe(true);

    // Before B's response lands, the SAME TAB redeems a brand-new handoff for customer C. That result is
    // authoritative, so the session becomes RESOLVED — the state in which the epoch check used to be
    // skipped entirely, which is what let B's late response overwrite C.
    cookieOwner.current = C;
    await adapter.establishFromRedeem(redeemFor(C));
    expect(adapter.isIdentityResolutionPending()).toBe(false);
    expect(adapter.getSession()?.user.id).toBe("cust-C");
    const epochC = adapter.getIdentityEpoch();
    expect(epochC).toBe(epochB + 1);

    // NOW B's response arrives, carrying the epoch it started under.
    const applied = adapter.applyVerifiedIdentity({ id: B.sub, email: null, phone: null }, B.linkedProfileId, epochB);
    expect(applied).toBe(false);

    // C is completely untouched: identity, linked profile and token all still C's.
    expect(adapter.getSession()?.user.id).toBe("cust-C");
    expect(adapter.getSession()?.federated?.linkedProfileId).toBe("lp-C");
    expect(adapter.getSession()?.accessToken).toBe(fedAccessToken(C));
    expect(adapter.isIdentityResolutionPending()).toBe(false);
  });

  it("a stale epoch is rejected even when the session is RESOLVED (not only while pending)", async () => {
    const cookieOwner = { current: A };
    const { adapter } = tab(cookieOwner);
    await adapter.establishFromRedeem(redeemFor(A));
    const epochA = adapter.getIdentityEpoch();

    // Replace the session; the new one is immediately resolved.
    cookieOwner.current = C;
    await adapter.establishFromRedeem(redeemFor(C));
    expect(adapter.isIdentityResolutionPending()).toBe(false);

    // A write bound to the OLD epoch must still be rejected. This is the exact case the previous
    // implementation waved through, because it only compared epochs while the barrier was up.
    expect(adapter.applyVerifiedIdentity({ id: A.sub, email: null, phone: null }, A.linkedProfileId, epochA)).toBe(false);
    expect(adapter.getSession()?.user.id).toBe("cust-C");

    // The current epoch still writes normally.
    expect(
      adapter.applyVerifiedIdentity({ id: C.sub, email: null, phone: null }, C.linkedProfileId, adapter.getIdentityEpoch()),
    ).toBe(true);
    expect(adapter.getSession()?.user.id).toBe("cust-C");
  });

  it("out-of-order responses: the newer epoch resolves and the older one is rejected on arrival", async () => {
    const cookieOwner = { current: A };
    const { adapter } = tab(cookieOwner);
    await adapter.establishFromRedeem(redeemFor(A));

    cookieOwner.current = B;
    await adapter.getValidAccessTokenOutcome();
    const epochB = adapter.getIdentityEpoch(); // request N starts

    cookieOwner.current = C;
    await adapter.refreshSingleFlight();
    const epochC = adapter.getIdentityEpoch(); // request N+1 starts
    expect(epochC).toBe(epochB + 1);

    // N+1 returns FIRST and resolves.
    expect(adapter.applyVerifiedIdentity({ id: C.sub, email: null, phone: null }, C.linkedProfileId, epochC)).toBe(true);
    expect(adapter.getSession()?.user.id).toBe("cust-C");
    expect(adapter.isIdentityResolutionPending()).toBe(false);

    // N returns LAST and must not overwrite it.
    expect(adapter.applyVerifiedIdentity({ id: B.sub, email: null, phone: null }, B.linkedProfileId, epochB)).toBe(false);
    expect(adapter.getSession()?.user.id).toBe("cust-C");
  });

  it("logout invalidates the epoch so a resolution for the destroyed session cannot apply", async () => {
    const cookieOwner = { current: A };
    const { adapter } = tab(cookieOwner);
    await adapter.establishFromRedeem(redeemFor(A));
    const epochBefore = adapter.getIdentityEpoch();

    await adapter.logout();
    expect(adapter.getIdentityEpoch()).not.toBe(epochBefore);

    // Re-establish, then try to apply a result from the pre-logout session.
    await adapter.establishFromRedeem(redeemFor(A));
    expect(adapter.applyVerifiedIdentity({ id: B.sub, email: null, phone: null }, B.linkedProfileId, epochBefore)).toBe(false);
    expect(adapter.getSession()?.user.id).toBe("cust-A");
  });

  it("a token rotation inside the SAME pending context keeps the generation and stays silent", async () => {
    const cookieOwner = { current: A };
    const { adapter, events } = tab(cookieOwner);
    await adapter.establishFromRedeem(redeemFor(A));

    cookieOwner.current = B;
    await adapter.getValidAccessTokenOutcome();
    const generation = adapter.getIdentityEpoch();

    // Same customer AND same family — an ordinary rotation of the context we are already resolving.
    // The bytes MUST differ: spreading B unchanged produces a byte-identical JWT, which would assert
    // the epoch is preserved without ever exercising a rotation.
    const beforeRotation = (await adapter.getAccessTokenForIdentityResolution()).token;
    cookieOwner.current = { ...B, jti: "rotated-in-place" } as typeof B;
    await adapter.refreshSingleFlight();
    const afterRotation = (await adapter.getAccessTokenForIdentityResolution()).token;
    expect(afterRotation).not.toBe(beforeRotation); // a real rotation

    expect(adapter.getIdentityEpoch()).toBe(generation); // in-flight resolution stays valid
    expect(events.filter((e) => e.type === "federated_identity_revalidation_required")).toHaveLength(1);
    expect(adapter.applyVerifiedIdentity({ id: B.sub, email: null, phone: null }, B.linkedProfileId, generation)).toBe(true);
  });

  it("a NEW family for the SAME customer while pending DOES start a new generation", async () => {
    const cookieOwner = { current: A };
    const { adapter } = tab(cookieOwner);
    await adapter.establishFromRedeem(redeemFor(A));

    cookieOwner.current = B;
    await adapter.getValidAccessTokenOutcome();
    const generation = adapter.getIdentityEpoch();

    cookieOwner.current = { ...B, sessionFamilyId: "fam-B2" }; // same customer, replaced family
    await adapter.refreshSingleFlight(); // discovered by a 401-triggered refresh, not generic acquisition

    expect(adapter.getIdentityEpoch()).toBe(generation + 1);
    // The older resolution is now stale even though the customer never changed.
    expect(adapter.applyVerifiedIdentity({ id: B.sub, email: null, phone: null }, B.linkedProfileId, generation)).toBe(false);
    expect(adapter.isIdentityResolutionPending()).toBe(true);
  });

  it("an in-flight 401 refresh while the barrier is up reports pending and exposes no token", async () => {
    const cookieOwner = { current: A };
    const { adapter } = tab(cookieOwner);
    await adapter.establishFromRedeem(redeemFor(A));

    cookieOwner.current = B;
    await adapter.getValidAccessTokenOutcome(); // barrier up, identity blanked

    // The request that was already in flight as A now 401s and triggers its own refresh. Even though this
    // refresh detects no NEW transition (the identity is already blank), the outcome must stay quarantined
    // — reporting false here is exactly what let api-core replay the request as B.
    const out = await adapter.refreshSingleFlight();
    expect(out.status).toBe("refreshed");
    expect(out.requiresIdentityRevalidation).toBe(true);
    expect(out.accessToken).toBeNull();
  });
});

// ── exit-level quarantine: no boundary yields a usable token while pending ──
describe("§9.3 token exit audit", () => {
  const A = { sub: "cust-A", sessionFamilyId: "fam-A", linkedProfileId: "lp-A" };
  const B = { sub: "cust-B", sessionFamilyId: "fam-B", linkedProfileId: "lp-B" };

  it("a TRANSIENT refresh failure while the barrier is up exposes no token at any exit", async () => {
    const owner = { current: A };
    let failTransiently = false;
    const api = fakeApi({
      refresh: vi.fn(async () =>
        failTransiently
          ? ({ ok: false as const, kind: "transient" as const, status: 503 })
          : ({
              ok: true as const,
              data: { session: { accessToken: fedAccessToken(owner.current), expiresIn: 30, refreshExpiresIn: 2592000 } },
            }),
      ),
    });
    const adapter = new FederatedSessionAdapter({
      isNative: () => false,
      api,
      storage: new FederatedSessionStorage({ isNative: () => false, preferences: makePrefs(), randomId: () => "d" }),
    });
    await adapter.establishFromRedeem({
      status: "authenticated",
      session: { accessToken: fedAccessToken(A), expiresIn: 30, refreshExpiresIn: 2592000 },
      customer: { id: A.sub, linkedProfileId: A.linkedProfileId, origin: "DilMart" },
    });

    owner.current = B;
    await adapter.getValidAccessTokenOutcome(); // barrier up
    expect(adapter.isIdentityResolutionPending()).toBe(true);

    // Now every subsequent refresh fails transiently. The transient exit normally returns the current
    // token so an offline caller can keep working — but it is unresolved, so it must stay inside.
    failTransiently = true;
    const out = await adapter.refreshSingleFlight();
    expect(out.status).toBe("transient_failure");
    expect(out.accessToken).toBeNull();
    expect(out.requiresIdentityRevalidation).toBe(true);
    expect(await adapter.getValidAccessToken()).toBeNull();
    expect((await adapter.getValidAccessTokenOutcome()).token).toBeNull();

    // The authority path still works — otherwise the barrier could never lift.
    expect((await adapter.getAccessTokenForIdentityResolution()).token).toBe(fedAccessToken(B));
  });
});

// ── same customer + new family + stale context, and the session-shaped exit ──
describe("§9.3 same-customer context replacement", () => {
  const A1 = { sub: "cust-A", sessionFamilyId: "fam-1", linkedProfileId: "lp-1" };
  const A2 = { sub: "cust-A", sessionFamilyId: "fam-2", linkedProfileId: "lp-2" };
  const B = { sub: "cust-B", sessionFamilyId: "fam-B", linkedProfileId: "lp-B" };

  function tab(owner: { current: typeof A1 }) {
    const api = fakeApi({
      refresh: vi.fn(async () => ({
        ok: true as const,
        data: { session: { accessToken: fedAccessToken(owner.current), expiresIn: 30, refreshExpiresIn: 2592000 } },
      })),
    });
    return new FederatedSessionAdapter({
      isNative: () => false,
      api,
      storage: new FederatedSessionStorage({ isNative: () => false, preferences: makePrefs(), randomId: () => "d" }),
    });
  }

  const redeemFor = (who: typeof A1) => ({
    status: "authenticated" as const,
    session: { accessToken: fedAccessToken(who), expiresIn: 30, refreshExpiresIn: 2592000 },
    customer: { id: who.sub, linkedProfileId: who.linkedProfileId, origin: "DilMart" },
  });

  it("MANDATORY 1: the SAME customer redeeming a new family invalidates the in-flight context", async () => {
    const owner = { current: A1 };
    const adapter = tab(owner);
    await adapter.establishFromRedeem(redeemFor(A1));
    expect(adapter.isIdentityResolutionPending()).toBe(false);

    // /auth/context starts under this epoch, for customer A on family-1.
    const epochN = (await adapter.getAccessTokenForIdentityResolution()).epoch;

    // Same customer A redeems a NEW family. The customer id does not change and the result is
    // immediately RESOLVED — the exact combination that previously skipped every guard.
    owner.current = A2;
    await adapter.establishFromRedeem(redeemFor(A2));
    expect(adapter.getSession()?.user.id).toBe("cust-A"); // same customer throughout
    expect(adapter.isIdentityResolutionPending()).toBe(false);
    const epochNext = adapter.getIdentityEpoch();
    expect(epochNext).toBe(epochN + 1);

    // The family-1 response now returns. It must not become authoritative for the family-2 session.
    const stale = adapter.applyVerifiedIdentity({ id: A1.sub, email: null, phone: null }, A1.linkedProfileId, epochN);
    expect(stale).toBe(false);
    expect(adapter.getSession()?.federated?.linkedProfileId).toBe("lp-2"); // family-1 profile did NOT land
    expect(adapter.getIdentityEpoch()).toBe(epochNext);

    // The current epoch resolves normally.
    expect(
      adapter.applyVerifiedIdentity({ id: A2.sub, email: null, phone: null }, A2.linkedProfileId, epochNext),
    ).toBe(true);
    expect(adapter.getSession()?.federated?.linkedProfileId).toBe("lp-2");
  });

  it("MANDATORY 2: the session-shaped exit is quarantined, but the resolution credential is not", async () => {
    const owner = { current: A1 };
    const adapter = tab(owner);
    await adapter.establishFromRedeem(redeemFor(A1));
    expect(adapter.getSession()?.accessToken).toBe(fedAccessToken(A1)); // usable while resolved

    owner.current = B;
    await adapter.getValidAccessTokenOutcome(); // A -> B, barrier up
    expect(adapter.isIdentityResolutionPending()).toBe(true);

    // Every generic projection withholds the token — including the session-shaped one.
    expect(adapter.getSession()?.accessToken).toBe("");
    expect(await adapter.getValidAccessToken()).toBeNull();
    expect((await adapter.getValidAccessTokenOutcome()).token).toBeNull();

    // The authority path still sees it, paired with the epoch — no deadlock.
    const credential = await adapter.getAccessTokenForIdentityResolution();
    expect(credential.token).toBe(fedAccessToken(B));
    expect(credential.epoch).toBe(adapter.getIdentityEpoch());

    // And once resolved, the generic projection carries the token again.
    adapter.applyVerifiedIdentity({ id: B.sub, email: null, phone: null }, B.linkedProfileId, credential.epoch);
    expect(adapter.getSession()?.accessToken).toBe(fedAccessToken(B));
  });

  it("MANDATORY 3 (adapter half): a cold web bootstrap exposes no generic token but can still resolve", async () => {
    const owner = { current: A1 };
    const adapter = tab(owner); // no memory at all — a cold reload

    const session = await adapter.bootstrap();
    expect(session).not.toBeNull();
    expect(adapter.isIdentityResolutionPending()).toBe(true);
    expect(adapter.getSession()?.accessToken).toBe(""); // quarantined
    expect(adapter.getSession()?.user.id).toBe(""); // identity unknown until /auth/context

    const credential = await adapter.getAccessTokenForIdentityResolution();
    expect(credential.token).toBe(fedAccessToken(A1)); // resolution can proceed

    adapter.applyVerifiedIdentity({ id: A1.sub, email: null, phone: null }, A1.linkedProfileId, credential.epoch);
    expect(adapter.isIdentityResolutionPending()).toBe(false);
    expect(adapter.getSession()?.accessToken).toBe(fedAccessToken(A1)); // usable again
    expect(adapter.getSession()?.user.id).toBe("cust-A");
  });
});

// ── the REAL 401-retry epoch race, using genuine adapter/manager mechanics ──
/**
 * A previous version of this proved only that the retry path CALLS the epoch-bound writer, by forcing the
 * writer to return false. That is not the race. Here the epoch really advances mid-flight — via a genuine
 * establishFromRedeem — and the real applyVerifiedIdentity rejects the retry answer on its own merits.
 */
describe("§9.3 401-retry epoch race (real mechanics)", () => {
  const A = { sub: "cust-A", sessionFamilyId: "fam-A", linkedProfileId: "lp-A" };
  const C = { sub: "cust-C", sessionFamilyId: "fam-C", linkedProfileId: "lp-C" };

  it("a retry answer for epoch N cannot apply after a real redeem advanced the session to N+1", async () => {
    const owner = { current: A };
    const api = fakeApi({
      refresh: vi.fn(async () => ({
        ok: true as const,
        data: { session: { accessToken: fedAccessToken(owner.current), expiresIn: 600, refreshExpiresIn: 2592000 } },
      })),
    });
    const adapter = new FederatedSessionAdapter({
      isNative: () => false,
      api,
      storage: new FederatedSessionStorage({ isNative: () => false, preferences: makePrefs(), randomId: () => "d" }),
    });

    await adapter.establishFromRedeem({
      status: "authenticated",
      session: { accessToken: fedAccessToken(A), expiresIn: 600, refreshExpiresIn: 2592000 },
      customer: { id: A.sub, linkedProfileId: A.linkedProfileId, origin: "DilMart" },
    });

    // The auth-context request for epoch N captures its credential.
    const credentialN = await adapter.getAccessTokenForIdentityResolution();
    const epochN = credentialN.epoch;

    // The request 401s; a SAME-FAMILY refresh succeeds, so no barrier is raised and the epoch is intact.
    const refreshed = await adapter.refreshSingleFlight();
    expect(refreshed.status).toBe("refreshed");
    expect(refreshed.requiresIdentityRevalidation).toBe(false);
    expect(adapter.getIdentityEpoch()).toBe(epochN);

    // The retry is now in flight. Before its answer arrives, a REAL new handoff redeem replaces the
    // session with customer C — no forced flag, the adapter advances the epoch itself.
    owner.current = C;
    await adapter.establishFromRedeem({
      status: "authenticated",
      session: { accessToken: fedAccessToken(C), expiresIn: 600, refreshExpiresIn: 2592000 },
      customer: { id: C.sub, linkedProfileId: C.linkedProfileId, origin: "DilMart" },
    });
    const epochNext = adapter.getIdentityEpoch();
    expect(epochNext).toBe(epochN + 1);

    // The retry answer for epoch N returns and is rejected by the real epoch comparison.
    const applied = adapter.applyVerifiedIdentity({ id: A.sub, email: null, phone: null }, A.linkedProfileId, epochN);
    expect(applied).toBe(false);

    // Nothing about the current session moved.
    expect(adapter.getSession()?.user.id).toBe("cust-C");
    expect(adapter.getSession()?.federated?.linkedProfileId).toBe("lp-C");
    expect(adapter.getIdentityEpoch()).toBe(epochNext);
    expect(adapter.isIdentityResolutionPending()).toBe(false);
  });
});
