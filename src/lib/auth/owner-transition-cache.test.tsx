// @vitest-environment jsdom
/**
 * §9.3 — user-scoped caches belong to exactly one principal, and "the principal changed" is a question
 * about the complete owner, not about one auth source.
 *
 * Enumerating only the federated transitions left every crossing case uncovered: `federated:A → null`,
 * `federated:A → supabase:B`, and `supabase:A → supabase:B` all kept the previous customer's profile,
 * addresses, orders and loyalty in the query cache, readable under the new session. The Supabase path
 * matters on its own, because the manager does not publish a source-neutral notification for Supabase
 * auth events — a provider that only listened there would never see `supabase:A → supabase:B` at all.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock("@/lib/capacitor", () => ({ isNative: () => false, openExternal: vi.fn(), shouldOpenExternally: () => false }));
vi.mock("@/lib/api-client", () => ({ apiClient: { getAuthContext: vi.fn(async () => ({ user: null, roles: [], capabilities: {} })) } }));
vi.mock("./auth-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth-storage")>()),
  clearPersistedAuthSession: vi.fn(async () => undefined),
}));
vi.mock("./auth-actions", () => {
  const noop = vi.fn(async () => ({}) as any);
  return {
    establishProvisionalSession: noop, signInWithPassword: noop, signUpWithPassword: noop,
    resendSignupEmail: noop, requestEmailOtp: noop, verifyEmailOtp: noop, requestPhoneOtp: noop,
    verifyPhoneOtp: noop, requestEmailPasswordRecovery: noop, verifyEmailRecoveryOtp: noop,
    updatePasswordInSession: noop, startPhoneChange: noop, verifyPhoneChange: noop,
    getVerifiedAuthPhone: noop,
  };
});

import { AuthProvider } from "./AuthProvider";
import { authSessionManager } from "./auth-session-manager";

function supabaseSession(id: string): Session {
  return {
    access_token: `at-${id}`,
    refresh_token: `rt-${id}`,
    expires_at: Math.floor((Date.now() + 600_000) / 1000),
    user: { id, email: null, phone: null },
  } as unknown as Session;
}

const FED = (id: string) => ({
  authSource: "DilMart_federated" as const,
  accessToken: `fat-${id}`,
  accessExpiresAt: Date.now() + 600_000,
  user: { id, email: null, phone: null },
  federated: { linkedProfileId: `lp-${id}`, refreshExpiresAt: Date.now() + 2_592_000_000 },
});

function makeAdapter() {
  let session: ReturnType<typeof FED> | null = null;
  let listener: ((e: unknown) => void) | null = null;
  return {
    install: (next: ReturnType<typeof FED> | null) => {
      session = next;
      listener?.({ type: "session_changed" });
    },
    setLifecycleListener: (l: (e: unknown) => void) => { listener = l; },
    getSession: () => session,
    bootstrap: async () => session,
    establishFromRedeem: async () => session,
    logout: vi.fn(async () => { session = null; listener?.({ type: "session_cleared" }); }),
    getIdentityEpoch: () => 1,
    isIdentityResolutionPending: () => false,
    getStorageError: () => null,
    logoutAll: vi.fn(async () => undefined),
    refreshSingleFlight: vi.fn(async () => ({ status: "refreshed", accessToken: "fat" })),
    getValidAccessToken: async () => session?.accessToken ?? null,
    getValidAccessTokenOutcome: async () => ({ token: session?.accessToken ?? null }),
    getAccessTokenForIdentityResolution: async () => ({ token: session?.accessToken ?? null, epoch: 1 }),
    getOrCreateDeviceId: async () => "dev",
    applyVerifiedIdentity: () => true,
  };
}

let adapter: ReturnType<typeof makeAdapter>;
let queryClient: QueryClient;
let globalSession: Session | null;
let emitAuthState: (event: string, session: Session | null) => void;

const userScoped = () => [
  queryClient.getQueryData(["customer-profile", "seed"]),
  queryClient.getQueryData(["customer-addresses", "seed"]),
];
const publicCache = () => queryClient.getQueryData(["marketplace-products"]);

async function renderProvider() {
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <div>ready</div>
      </AuthProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(authSessionManager.getActiveSource()).toBeTruthy());
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return result;
}

beforeEach(() => {
  authSessionManager.resetForTests();
  adapter = makeAdapter();
  authSessionManager.setFederatedAdapter(adapter as any);
  globalSession = null;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  authSessionManager.setClient({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: globalSession }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: globalSession }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      setSession: vi.fn(async () => ({ data: { session: globalSession }, error: null })),
      onAuthStateChange: vi.fn((cb: (e: string, s: Session | null) => void) => {
        emitAuthState = (event, session) => { globalSession = session; cb(event, session); };
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      startAutoRefresh: vi.fn(async () => undefined),
      stopAutoRefresh: vi.fn(async () => undefined),
    },
  } as any);
  authSessionManager.setNativeRuntimeForTests(() => false);
});

afterEach(() => {
  authSessionManager.resetForTests();
});

describe("§9.3 user-scoped caches follow the COMPLETE owner", () => {
  it("MANDATORY: federated A → null drops the user-scoped caches", async () => {
    adapter.install(FED("cust-A"));
    await renderProvider();
    queryClient.setQueryData(["customer-profile", "seed"], { owner: "cust-A" });
    queryClient.setQueryData(["customer-addresses", "seed"], [{ owner: "cust-A" }]);
    queryClient.setQueryData(["marketplace-products"], [{ id: "public" }]);

    await act(async () => { adapter.install(null); });

    expect(userScoped()).toEqual([undefined, undefined]);
    // Browsing stays warm: public caches are not principal-scoped and must survive.
    expect(publicCache()).toEqual([{ id: "public" }]);
  });

  it("MANDATORY: federated A → federated B drops the user-scoped caches", async () => {
    adapter.install(FED("cust-A"));
    await renderProvider();
    queryClient.setQueryData(["customer-profile", "seed"], { owner: "cust-A" });
    queryClient.setQueryData(["customer-addresses", "seed"], [{ owner: "cust-A" }]);

    await act(async () => { adapter.install(FED("cust-B")); });

    expect(userScoped()).toEqual([undefined, undefined]);
  });

  /**
   * The manager publishes no source-neutral notification for a Supabase auth event, so this transition
   * reaches the provider only through the Supabase subscription. A provider that handled owner changes in
   * one place would never see it.
   */
  it("MANDATORY: supabase A → supabase B drops the user-scoped caches", async () => {
    globalSession = supabaseSession("cust-A");
    await renderProvider();
    await act(async () => { emitAuthState("SIGNED_IN", supabaseSession("cust-A")); });
    queryClient.setQueryData(["customer-profile", "seed"], { owner: "cust-A" });
    queryClient.setQueryData(["customer-addresses", "seed"], [{ owner: "cust-A" }]);
    queryClient.setQueryData(["marketplace-products"], [{ id: "public" }]);

    await act(async () => { emitAuthState("SIGNED_IN", supabaseSession("cust-B")); });

    expect(userScoped()).toEqual([undefined, undefined]);
    expect(publicCache()).toEqual([{ id: "public" }]);
  });

  it("the SAME owner keeps its caches — a rotation must not flush what the customer is looking at", async () => {
    globalSession = supabaseSession("cust-A");
    await renderProvider();
    await act(async () => { emitAuthState("SIGNED_IN", supabaseSession("cust-A")); });
    queryClient.setQueryData(["customer-profile", "seed"], { owner: "cust-A" });

    await act(async () => { emitAuthState("TOKEN_REFRESHED", supabaseSession("cust-A")); });

    expect(queryClient.getQueryData(["customer-profile", "seed"])).toEqual({ owner: "cust-A" });
  });

  it("guest → provisional keeps the guest's state — nothing user-scoped can belong to nobody", async () => {
    await renderProvider();
    queryClient.setQueryData(["customer-profile", "seed"], { owner: "guest-draft" });
    queryClient.setQueryData(["marketplace-products"], [{ id: "public" }]);

    await act(async () => { emitAuthState("SIGNED_IN", supabaseSession("provisional-P")); });

    expect(queryClient.getQueryData(["customer-profile", "seed"])).toEqual({ owner: "guest-draft" });
    expect(publicCache()).toEqual([{ id: "public" }]);
  });
});
