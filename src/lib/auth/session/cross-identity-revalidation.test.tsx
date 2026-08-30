// @vitest-environment jsdom
/**
 * §9.3 — AuthProvider wiring for the web cross-identity guard.
 *
 * `federated-session.test.ts` proves the ADAPTER drops a retained identity when a refreshed token cannot
 * be proven to be the same customer. That alone is not enough: the identity also lives in React Query,
 * and the `["auth-context", authSource, user.id]` entry is keyed by the PREVIOUS user id. This file is the
 * integration half — it proves the provider drops that state and never renders `authenticated_ready` for
 * customer A while the live access token authorizes as customer B.
 *
 * Lives under `session/` deliberately: it is part of the session-identity contract, and the
 * `test:federated-client` script already covers this directory.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/use-auth";
import { AuthProvider } from "../AuthProvider";
import { USER_SCOPED_QUERY_KEYS } from "../auth-events";

const A = { id: "fed-cust-A", linkedProfileId: "lp-A", token: "token-A" };
const B = { id: "fed-cust-B", linkedProfileId: "lp-B", token: "token-B" };

const getAuthContext = vi.fn();
const applyFederatedIdentity = vi.fn();
const refreshSessionSingleFlight = vi.fn();
/** Captured manager subscriber — the real manager calls this when the adapter publishes a transition. */
let managerSubscriber: (() => void) | null = null;

/** Mutable stand-in for the adapter's in-memory session. */
let mem: { userId: string; linkedProfileId: string; accessToken: string };
/** When set, the NEXT token acquisition reports an identity transition (matrix item 2). */
let acquisitionTransition = false;
/** When set, the manager reports the verified identity write as STALE (superseded epoch). */
let rejectApplyAsStale = false;
/** Mirrors the adapter's persistent barrier + epoch, so the provider sees realistic lifecycle state. */
let identityPending = false;
let currentEpoch = 0;

function appSession() {
  return {
    authSource: "DilMart_federated" as const,
    accessToken: mem.accessToken,
    accessExpiresAt: Date.now() + 600_000,
    user: { id: mem.userId, email: null, phone: null },
    federated: { linkedProfileId: mem.linkedProfileId, refreshExpiresAt: Date.now() + 2_592_000_000 },
  };
}

vi.mock("@/lib/capacitor", () => ({ isNative: () => false, openExternal: vi.fn(), shouldOpenExternally: () => false }));
vi.mock("@/lib/api-client", () => ({ apiClient: { getAuthContext: (...a: unknown[]) => getAuthContext(...a) } }));
vi.mock("../auth-actions", () => ({
  signInWithPassword: vi.fn(), signUpWithPassword: vi.fn(), resendSignupEmail: vi.fn(),
  establishProvisionalSession: vi.fn(), logoutCurrentDevice: vi.fn(),
  requestEmailOtp: vi.fn(), verifyEmailOtp: vi.fn(), requestPhoneOtp: vi.fn(), verifyPhoneOtp: vi.fn(),
  requestEmailPasswordRecovery: vi.fn(), verifyEmailRecoveryOtp: vi.fn(), updatePasswordInSession: vi.fn(),
  startPhoneChange: vi.fn(), verifyPhoneChange: vi.fn(), getVerifiedAuthPhone: vi.fn(),
}));

vi.mock("../auth-session-manager", () => ({
  // Pure helper, mirrored from the real module: mocks must not invent a second owner derivation.
  principalOwnerOf: (session: { authSource?: string; user?: { id?: string } } | null) =>
    session && session.user?.id ? `${session.authSource}:${session.user.id}` : null,
  authSessionManager: {
    bootstrapAppSession: async () => appSession(),
    getLastKnownSession: () => null,
    getAppSession: () => appSession(),
    getFederatedIdentityResolution: () => ({ pending: identityPending, epoch: currentEpoch }),
    getActiveSource: () => "DilMart_federated",
    getValidAccessToken: async () => mem.accessToken,
    // The authority path is never quarantined — it is what lifts the barrier.
    getAccessTokenForIdentityResolution: async () => {
      if (acquisitionTransition) {
        acquisitionTransition = false;
        mem = { userId: "", linkedProfileId: "", accessToken: B.token };
      }
      return { token: mem.accessToken, epoch: currentEpoch };
    },
    getValidAccessTokenOutcome: async () => {
      if (acquisitionTransition) {
        acquisitionTransition = false;
        // Mirrors the adapter: the refresh landed on another family, so the resolved identity is dropped.
        mem = { userId: "", linkedProfileId: "", accessToken: B.token };
        return { token: B.token, requiresIdentityRevalidation: true };
      }
      return { token: mem.accessToken, requiresIdentityRevalidation: false };
    },
    applyFederatedIdentity: (u: { id: string }, profileId?: string, epoch?: number) => {
      // Mirrors the real manager: the verified backend context fills the identity, and the write is
      // epoch-bound so a superseded resolution is REJECTED rather than applied.
      applyFederatedIdentity(u, profileId, epoch);
      if (rejectApplyAsStale) return false;
      mem.userId = u.id;
      if (profileId) mem.linkedProfileId = profileId;
      return true;
    },
    prepareForSupabaseAuthentication: vi.fn(async () => undefined),
    subscribe: (cb: () => void) => {
      managerSubscriber = cb;
      return () => undefined;
    },
    refreshSessionSingleFlight: (reason: string) => refreshSessionSingleFlight(reason),
    logoutCurrentDevice: vi.fn(async () => undefined),
    logoutAllDevices: vi.fn(async () => undefined),
    isExpiringSoon: () => false,
    startAutoRefresh: vi.fn(async () => undefined),
    stopAutoRefresh: vi.fn(async () => undefined),
    retryStorageBootstrap: vi.fn(async () => undefined),
    onAuthStateChange: (_cb: (e: string, s: Session | null) => void) => ({ unsubscribe: vi.fn() }),
  },
}));

function contextFor(who: typeof A) {
  return {
    user: { id: who.id, email: null, phone: null },
    profile: { id: who.linkedProfileId, role: "customer" },
    roles: ["customer"],
    activeRole: "customer",
    merchant: null,
    authSource: "DilMart_federated",
    claim_required: false,
    capabilities: { customerCommerce: true, phoneIdentity: false, accountClaim: false, passwordManagement: false, federatedLogoutAll: true },
  };
}

function unauthorized() {
  return Object.assign(new Error("Unauthorized"), { status: 401 });
}

/**
 * Route the backend context by the token actually presented, rather than by call order — the provider's
 * retry/re-key path makes the number of calls an implementation detail we should not assert on.
 * `expire` makes the NEXT call with that token 401 exactly once, standing in for the cookie having been
 * replaced by another tab.
 */
function installContextByToken(expire?: string) {
  let pending = expire;
  getAuthContext.mockImplementation(async (token: string) => {
    if (pending && token === pending) {
      pending = undefined;
      throw unauthorized();
    }
    if (token === B.token) return contextFor(B);
    return contextFor(A); // A's original and rotated tokens both resolve to A
  });
}

/** Records every (status, renderedUser, liveToken) triple the UI actually committed. */
const seen: Array<{ status: string; user: string; token: string }> = [];

function Probe() {
  const { authStatus, user } = useAuth();
  seen.push({ status: authStatus, user: user?.id ?? "none", token: mem.accessToken });
  return (
    <div>
      <span data-testid="status">{authStatus}</span>
      <span data-testid="user">{user?.id ?? "none"}</span>
    </div>
  );
}

function renderProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider><Probe /></AuthProvider>
    </QueryClientProvider>,
  );
  return { queryClient };
}

beforeEach(() => {
  mem = { userId: A.id, linkedProfileId: A.linkedProfileId, accessToken: A.token };
  acquisitionTransition = false;
  rejectApplyAsStale = false;
  identityPending = false;
  currentEpoch = 0;
  managerSubscriber = null;
  seen.length = 0;
  getAuthContext.mockReset();
  applyFederatedIdentity.mockReset();
  refreshSessionSingleFlight.mockReset();
});

describe("§9.3 AuthProvider — web cookie refresh that changes identity", () => {
  it("drops A's user-scoped caches and never shows A ready under B's token", async () => {
    // 1) Customer A is fully established.
    installContextByToken();
    const { queryClient } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));
    expect(screen.getByTestId("user").textContent).toBe(A.id);

    // 2) A's user-scoped state is warm, including the auth-context entry keyed by A's id.
    for (const key of USER_SCOPED_QUERY_KEYS) queryClient.setQueryData([key], { owner: A.id });
    queryClient.setQueryData(["auth-context", "DilMart_federated", A.id], contextFor(A));
    queryClient.setQueryData(["marketplace-home"], { cached: true }); // public, must survive

    // 3) Another tab of this browser profile redeemed customer B, replacing the shared __Host- cookie.
    //    A's next call 401s, and the refresh succeeds — as B. The adapter blanks the unprovable identity,
    //    exactly as federated-session-adapter does on identityChanged.
    installContextByToken(A.token); // A's token is now stale → one 401
    refreshSessionSingleFlight.mockImplementationOnce(async () => {
      mem = { userId: "", linkedProfileId: "", accessToken: B.token };
      return { status: "refreshed", session: { access_token: B.token }, reason: "auth_context_unauthorized", error: null, requiresIdentityRevalidation: true };
    });
    // 4) The re-keyed query then resolves the real identity from the backend (routed by token → B).

    await queryClient.invalidateQueries({ queryKey: ["auth-context"] });

    // Settles on the verified new identity.
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe(B.id));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));

    // A's user-scoped caches are gone; the public cache is untouched.
    for (const key of USER_SCOPED_QUERY_KEYS) {
      expect(queryClient.getQueryData([key])).toBeUndefined();
    }
    // The stale entry keyed by A's id must not survive — it holds A's roles.
    expect(queryClient.getQueryData(["auth-context", "DilMart_federated", A.id])).toBeUndefined();
    expect(queryClient.getQueryData(["marketplace-home"])).toEqual({ cached: true });

    // THE INVARIANT: no committed render ever paired A's identity with B's token.
    const mixed = seen.filter((s) => s.token === B.token && s.user === A.id);
    expect(mixed).toEqual([]);
    // And specifically never a ready state for A under B's token.
    expect(seen.some((s) => s.token === B.token && s.user === A.id && s.status === "authenticated_ready")).toBe(false);

    // The new identity came from the backend context, not from carried-over memory.
    // Generation-bound: the provider must pass the generation its context request was started for, so a
    // superseded resolution can be rejected rather than silently applied.
    expect(applyFederatedIdentity).toHaveBeenCalledWith(
      { id: B.id, email: null, phone: null },
      B.linkedProfileId,
      expect.any(Number),
    );
  });

  it("an ordinary same-identity refresh keeps A's session and caches (no false positive)", async () => {
    installContextByToken();
    const { queryClient } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));

    queryClient.setQueryData(["customer-orders"], { owner: A.id });

    installContextByToken(A.token); // one 401, then the rotated token resolves to A again
    refreshSessionSingleFlight.mockImplementationOnce(async () => {
      mem = { ...mem, accessToken: "token-A-rotated" }; // same customer, rotated token
      return { status: "refreshed", session: { access_token: "token-A-rotated" }, reason: "auth_context_unauthorized", error: null, requiresIdentityRevalidation: false };
    });

    await queryClient.invalidateQueries({ queryKey: ["auth-context"] });

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));
    expect(screen.getByTestId("user").textContent).toBe(A.id);
    // Not an identity change → user-scoped state is NOT dropped.
    expect(queryClient.getQueryData(["customer-orders"])).toEqual({ owner: A.id });
  });

  it("drops A's state when the adapter publishes a transition from the ACQUISITION path", async () => {
    installContextByToken();
    const { queryClient } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));

    for (const key of USER_SCOPED_QUERY_KEYS) queryClient.setQueryData([key], { owner: A.id });
    queryClient.setQueryData(["auth-context", "DilMart_federated", A.id], contextFor(A));
    queryClient.setQueryData(["marketplace-home"], { cached: true });

    // The transition happens during token ACQUISITION, which never reaches the provider's 401-retry
    // branch. In production the ADAPTER publishes it the moment it enters the barrier and the manager
    // forwards it to this subscriber — that is what makes this entry point safe, not caller discipline.
    acquisitionTransition = true;
    mem = { userId: "", linkedProfileId: "", accessToken: B.token };
    managerSubscriber?.();

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe(B.id));

    // A's user-scoped state is gone; the public cache survives.
    for (const key of USER_SCOPED_QUERY_KEYS) {
      expect(queryClient.getQueryData([key])).toBeUndefined();
    }
    expect(queryClient.getQueryData(["auth-context", "DilMart_federated", A.id])).toBeUndefined();
    expect(queryClient.getQueryData(["marketplace-home"])).toEqual({ cached: true });
    expect(seen.some((s) => s.token === B.token && s.user === A.id)).toBe(false);
  });

  it("epoch-validates EVERY federated context response, even when the customer id is unchanged", async () => {
    installContextByToken();
    const { queryClient } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));
    expect(screen.getByTestId("user").textContent).toBe(A.id);

    applyFederatedIdentity.mockClear();
    await queryClient.invalidateQueries({ queryKey: ["auth-context"] });
    await waitFor(() => expect(applyFederatedIdentity).toHaveBeenCalled());

    // The context resolves the SAME customer that is already installed. This previously skipped the
    // write entirely — and with it the epoch check — because the ids matched, which is how a response
    // from a replaced session family stayed authoritative. Epoch validity and id equality are
    // independent concerns, so the epoch-bound write must run regardless.
    expect(applyFederatedIdentity).toHaveBeenCalledWith(
      { id: A.id, email: null, phone: null },
      A.linkedProfileId,
      expect.any(Number),
    );
  });

  it("a STALE resolution for the same customer never becomes authoritative", async () => {
    installContextByToken();
    const { queryClient } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));

    queryClient.setQueryData(["customer-orders"], { owner: A.id });

    // The session moved to a new identity context while this response was in flight, so the manager
    // rejects the write. The result must not be cached as the current context.
    rejectApplyAsStale = true;
    await queryClient.invalidateQueries({ queryKey: ["auth-context"] });
    await waitFor(() => expect(applyFederatedIdentity).toHaveBeenCalled());

    // The rejected answer did not overwrite the installed identity.
    expect(mem.userId).toBe(A.id);
    expect(seen.every((s) => s.user === A.id || s.user === "none")).toBe(true);
  });

  it("MANDATORY: a resolved A replaced by a resolved B clears A's user-scoped caches", async () => {
    installContextByToken();
    const { queryClient } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));
    expect(screen.getByTestId("user").textContent).toBe(A.id);

    // A's data is warm across every user-scoped key, plus a public cache that must survive.
    for (const key of USER_SCOPED_QUERY_KEYS) queryClient.setQueryData([key], { owner: A.id });
    queryClient.setQueryData(["marketplace-home"], { cached: true });

    // A NEW handoff redeem installs customer B directly. There is no unresolved step: B is resolved
    // immediately and the epoch advances. "Became unresolved" never fires — which is exactly why A's
    // caches used to survive into B's session.
    currentEpoch += 1;
    mem = { userId: B.id, linkedProfileId: B.linkedProfileId, accessToken: B.token };
    managerSubscriber?.();

    // Before B is usable, none of A's user-scoped data may remain.
    for (const key of USER_SCOPED_QUERY_KEYS) {
      expect(queryClient.getQueryData([key])).toBeUndefined();
    }
    expect(queryClient.getQueryData(["marketplace-home"])).toEqual({ cached: true }); // public survives

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe(B.id));
    expect(seen.some((s) => s.token === B.token && s.user === A.id)).toBe(false);
  });

  it("MANDATORY: a same-customer re-resolution does NOT flush caches", async () => {
    installContextByToken();
    const { queryClient } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));

    queryClient.setQueryData(["customer-orders"], { owner: A.id });

    // Same customer, new token bytes — a rotation, not a replacement. Flushing here would throw away
    // data the customer is actively looking at for no security benefit.
    mem = { ...mem, accessToken: "token-A-rotated" };
    managerSubscriber?.();

    expect(queryClient.getQueryData(["customer-orders"])).toEqual({ owner: A.id });
  });

  it("MANDATORY: a pending federated identity is never authenticated_ready, even if context fails", async () => {
    installContextByToken();
    const { queryClient } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));

    // The barrier goes up and /auth/context then fails outright, so the query stops fetching. The
    // session must NOT present as ready: the token is quarantined and the identity unverified.
    identityPending = true;
    currentEpoch += 1;
    mem = { userId: "", linkedProfileId: "", accessToken: B.token };
    getAuthContext.mockRejectedValue(new Error("context unavailable"));
    managerSubscriber?.();
    await queryClient.invalidateQueries({ queryKey: ["auth-context"] });

    // Wait for the query to SETTLE as an error — asserting while it is still fetching would pass
    // trivially via `contextBootstrapping` and prove nothing about the pending-identity guard.
    await waitFor(() => expect(getAuthContext).toHaveBeenCalled());
    // The auth-context query sets its own `retry: 1`, and React Query's default backoff makes that one
    // retry land ~1s later — longer than waitFor's 1s default, so the budget has to be raised. It is
    // deliberately kept UNDER Vitest's 5s per-test timeout: a longer waitFor than the test itself gets
    // can never actually elapse, so the test would die on its own timeout with a far less useful message.
    await waitFor(
      () => expect(queryClient.getQueryCache().getAll().some((q) => q.state.fetchStatus === "fetching")).toBe(false),
      { timeout: 3000 },
    );
    await act(async () => {
      await Promise.resolve();
    });

    // The query is settled and NOT fetching, so `contextBootstrapping` is false. Readiness is held back
    // solely by the unresolved federated identity.
    expect(screen.getByTestId("status").textContent).toBe("authenticated_loading_context");
    // And no committed render ever claimed readiness while unresolved.
    expect(seen.some((s) => s.status === "authenticated_ready" && s.user === "none")).toBe(false);
  });

  it("MANDATORY: the 401-RETRY context answer is epoch-validated too", async () => {
    installContextByToken();
    const { queryClient } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));

    applyFederatedIdentity.mockClear();

    // The initial request 401s, the refresh succeeds, and the RETRY answer comes back. That retry used
    // to `return await apiClient.getAuthContext(...)` directly — a second authority path that never
    // checked the epoch. Here the session has moved on, so the manager rejects the write as stale.
    refreshSessionSingleFlight.mockResolvedValue({
      status: "refreshed",
      session: { access_token: mem.accessToken },
      reason: "auth_context_unauthorized",
      error: null,
      requiresIdentityRevalidation: false,
    });
    rejectApplyAsStale = true;
    installContextByToken(mem.accessToken); // one 401, then the retry succeeds

    await queryClient.invalidateQueries({ queryKey: ["auth-context"] });

    // The retry response went through the SAME epoch validation as the initial one.
    await waitFor(() => expect(applyFederatedIdentity).toHaveBeenCalled());
    // Rejected, so it never became the authoritative context.
    expect(mem.userId).toBe(A.id);
  });
});

// ── global ready authority must be bound to the CURRENT epoch ───────────────
/**
 * `pending === false` is not sufficient. establishFromRedeem installs an authoritative customer and
 * clears the barrier while ADVANCING the epoch, so a same-customer re-handoff leaves pending false with
 * the accepted context still belonging to the PREVIOUS epoch. If /auth/context for the new epoch then
 * fails and settles, contextBootstrapping goes false and the session would present as ready on a context
 * the current identity never verified.
 */
describe("§9.3 authenticated_ready requires the current epoch's context", () => {
  it("a settled FAILURE for the current epoch never reports ready, and success then does", async () => {
    installContextByToken();
    const { queryClient } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));
    expect(screen.getByTestId("user").textContent).toBe(A.id);

    // The SAME customer redeems a new family: the epoch advances, the barrier stays closed (the redeem
    // result is authoritative), and the context for the new epoch is attempted.
    currentEpoch += 1;
    getAuthContext.mockRejectedValue(new Error("context unavailable"));
    managerSubscriber?.();
    await queryClient.invalidateQueries({ queryKey: ["auth-context"] });

    // Let the query settle as an error — asserting mid-fetch would pass trivially via
    // contextBootstrapping and prove nothing about the epoch invariant.
    await waitFor(
      () => expect(queryClient.getQueryCache().getAll().some((q) => q.state.fetchStatus === "fetching")).toBe(false),
      { timeout: 3000 },
    );

    expect(screen.getByTestId("status").textContent).not.toBe("authenticated_ready");

    // Now the current epoch's context succeeds.
    installContextByToken();
    await queryClient.invalidateQueries({ queryKey: ["auth-context"] });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));
    expect(screen.getByTestId("user").textContent).toBe(A.id);
  });
});
