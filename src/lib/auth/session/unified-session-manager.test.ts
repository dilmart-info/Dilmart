// @vitest-environment jsdom
/**
 * STORE-PR5 §Phase F/I/J — unified session facade (authSessionManager) source-neutral behavior.
 * Proves: establishing a federated session switches the ONE active source (best-effort Supabase sign-out),
 * token/refresh/logout route to the federated adapter, and federated logout returns the source to Supabase.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { authSessionManager } from "../auth-session-manager";
import { FederatedSessionAdapter } from "./federated-session-adapter";
import { FederatedSessionApi } from "./federated-session-api";
import { FederatedSessionStorage } from "./federated-session-storage";
import { AUTH_REFRESH_OUTCOMES } from "../auth-events";
import type { FederatedRedeemResult } from "./app-session.types";

/**
 * Real federated access tokens are signed JWTs carrying sub / sessionFamilyId / linkedProfileId. These
 * routing tests must use realistically shaped tokens: an opaque string is UNREADABLE, and the 9.3
 * claim contract deliberately fails closed on unreadable claims, so an opaque fixture would raise the
 * identity barrier and quarantine the token — testing the barrier instead of the routing.
 */
const ID = { sub: 'cust-9', sessionFamilyId: 'fam-9', linkedProfileId: 'lp-9' };
function fedToken(claims: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${b64url({ alg: 'EdDSA', kid: 'k1' })}.${b64url({ ...claims, ...extra })}.sig`;
}
const TOKEN_INITIAL = fedToken(ID);
const TOKEN_ROTATED = fedToken(ID, { jti: 'rotated' }); // same identity + family, different bytes

/** Typed stub so new tests do not add to this file's pre-existing `as any` count. */
type MinimalClient = Parameters<typeof authSessionManager.setClient>[0];
const stubClient = () => ({ auth: { signOut: vi.fn(async () => ({ error: null })) } }) as unknown as MinimalClient;

function fakeApi() {
  return {
    refresh: vi.fn(async () => ({ ok: true as const, data: { session: { accessToken: TOKEN_ROTATED, expiresIn: 600, refreshExpiresIn: 2592000 } } })),
    logout: vi.fn(async () => ({ ok: true as const, data: { status: "logged_out" } })),
    logoutAll: vi.fn(async () => ({ ok: true as const, data: { status: "logged_out" } })),
    getContext: vi.fn(async () => ({ ok: true as const, data: {} as any })),
  } as unknown as FederatedSessionApi;
}

function webAdapter(api = fakeApi()) {
  return new FederatedSessionAdapter({ isNative: () => false, api, storage: new FederatedSessionStorage({ isNative: () => false }) });
}

const REDEEM: FederatedRedeemResult = {
  status: "authenticated",
  session: { accessToken: TOKEN_INITIAL, expiresIn: 600, refreshExpiresIn: 2592000 },
  customer: { id: "cust-9", linkedProfileId: "lp-9", origin: "DilMart" },
};

describe("authSessionManager unified facade", () => {
  afterEach(() => authSessionManager.resetForTests());

  it("establishFederatedSessionFromRedeem flips the active source and best-effort signs out Supabase", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    authSessionManager.setClient({ auth: { signOut } } as any);
    authSessionManager.setFederatedAdapter(webAdapter());

    expect(authSessionManager.getActiveSource()).toBe("supabase");
    const established = await authSessionManager.establishFederatedSessionFromRedeem(REDEEM);
    expect(established.session.authSource).toBe("DilMart_federated");
    // The redeem also reports the identity epoch it established, so handoff readiness can require
    // THIS context rather than a leftover ready-state for the same customer.
    expect(typeof established.identityEpoch).toBe("number");
    expect(authSessionManager.getActiveSource()).toBe("DilMart_federated");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" }); // left Supabase cleanly (single active source)
  });

  it("getValidAccessToken and refreshSessionSingleFlight route to the federated adapter", async () => {
    const api = fakeApi();
    authSessionManager.setClient({ auth: { signOut: vi.fn(async () => ({ error: null })) } } as any);
    authSessionManager.setFederatedAdapter(webAdapter(api));
    await authSessionManager.establishFederatedSessionFromRedeem(REDEEM);

    expect(await authSessionManager.getValidAccessToken()).toBe(TOKEN_INITIAL);
    const out = await authSessionManager.refreshSessionSingleFlight();
    expect(out.status).toBe(AUTH_REFRESH_OUTCOMES.refreshed);
    expect(out.session?.access_token).toBe(TOKEN_ROTATED);
    // Same customer + same family: an ordinary rotation, so no barrier and the token flows through.
    expect(out.requiresIdentityRevalidation).toBe(false);
  });

  it('9.3 an UNREADABLE refreshed token fails closed at the facade: barrier up, token withheld', async () => {
    const api = fakeApi();
    (api.refresh as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      ok: true,
      data: { session: { accessToken: 'opaque-not-a-jwt', expiresIn: 600, refreshExpiresIn: 2592000 } },
    });
    authSessionManager.setClient(stubClient());
    authSessionManager.setFederatedAdapter(webAdapter(api));
    await authSessionManager.establishFederatedSessionFromRedeem(REDEEM);

    const out = await authSessionManager.refreshSessionSingleFlight();
    expect(out.requiresIdentityRevalidation).toBe(true);
    expect(out.session?.access_token).toBeUndefined(); // quarantined at the exit
    expect(authSessionManager.getFederatedIdentityResolution().pending).toBe(true);
    // And generic acquisition stays blocked for every later caller, not just this one.
    expect(await authSessionManager.getValidAccessToken()).toBeNull();
  });

  it("federated logoutCurrentDevice revokes, clears, and returns the source to Supabase", async () => {
    const api = fakeApi();
    authSessionManager.setClient({ auth: { signOut: vi.fn(async () => ({ error: null })) } } as any);
    authSessionManager.setFederatedAdapter(webAdapter(api));
    await authSessionManager.establishFederatedSessionFromRedeem(REDEEM);

    const notified = vi.fn();
    authSessionManager.subscribe(notified);
    await authSessionManager.logoutCurrentDevice();
    expect((api.logout as any).mock.calls.length).toBe(1);
    expect(authSessionManager.getActiveSource()).toBe("supabase");
    expect(notified).toHaveBeenCalled();
  });

  it("federated logoutAllDevices calls logout-all", async () => {
    const api = fakeApi();
    authSessionManager.setClient({ auth: { signOut: vi.fn(async () => ({ error: null })) } } as any);
    authSessionManager.setFederatedAdapter(webAdapter(api));
    await authSessionManager.establishFederatedSessionFromRedeem(REDEEM);
    await authSessionManager.logoutAllDevices();
    expect((api.logoutAll as any).mock.calls.length).toBe(1);
    expect(authSessionManager.getActiveSource()).toBe("supabase");
  });

  // §5 — federated → Supabase single-active-source switch.
  it("prepareForSupabaseAuthentication revokes federated + switches source to supabase", async () => {
    const api = fakeApi();
    authSessionManager.setClient({ auth: { signOut: vi.fn(async () => ({ error: null })) } } as any);
    authSessionManager.setFederatedAdapter(webAdapter(api));
    await authSessionManager.establishFederatedSessionFromRedeem(REDEEM);
    expect(authSessionManager.getActiveSource()).toBe("DilMart_federated");

    await authSessionManager.prepareForSupabaseAuthentication();
    expect((api.logout as any).mock.calls.length).toBe(1); // federated family revoked
    expect(authSessionManager.getActiveSource()).toBe("supabase");
  });

  it("prepareForSupabaseAuthentication FAILS CLOSED on secure-clear failure (source stays federated)", async () => {
    const api = fakeApi();
    const secure = {
      map: new Map<string, string>(),
      getItem: vi.fn(async (k: string) => (secure.map.has(k) ? secure.map.get(k)! : null)),
      setItem: vi.fn(async (k: string, v: string) => void secure.map.set(k, v)),
      removeItem: vi.fn(async () => { throw new Error("keychain locked"); }), // secure clear cannot complete
    };
    const prefs = { get: vi.fn(async () => ({ value: "dev" })), set: vi.fn(async () => undefined) };
    const nativeAdapter = new FederatedSessionAdapter({
      isNative: () => true,
      api,
      storage: new FederatedSessionStorage({ isNative: () => true, secureStorage: secure as any, preferences: prefs as any, randomId: () => "dev" }),
    });
    authSessionManager.setClient({ auth: { signOut: vi.fn(async () => ({ error: null })) } } as any);
    authSessionManager.setFederatedAdapter(nativeAdapter);
    await authSessionManager.establishFederatedSessionFromRedeem({ ...REDEEM, session: { ...REDEEM.session, refreshToken: "rt-native" } });

    await expect(authSessionManager.prepareForSupabaseAuthentication()).rejects.toThrow();
    expect(authSessionManager.getActiveSource()).toBe("DilMart_federated"); // never two identities
  });

  // §4 — the Supabase auto-refresh ticker must not run for a federated identity.
  it("startAutoRefresh does NOT start the Supabase ticker while federated is active", async () => {
    const startAutoRefresh = vi.fn(async () => undefined);
    authSessionManager.setClient({ auth: { signOut: vi.fn(async () => ({ error: null })), startAutoRefresh } } as any);
    authSessionManager.setFederatedAdapter(webAdapter());
    await authSessionManager.establishFederatedSessionFromRedeem(REDEEM);
    await authSessionManager.startAutoRefresh();
    expect(startAutoRefresh).not.toHaveBeenCalled();
  });
});
