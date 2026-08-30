import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/use-auth";
import { AuthProvider } from "./AuthProvider";
import { AUTH_REFRESH_OUTCOMES, USER_SCOPED_QUERY_KEYS } from "./auth-events";
import { AuthStorageUnavailableError } from "./auth-errors";

const getAuthContext = vi.fn();
const bootstrapSession = vi.fn();
const refreshSessionSingleFlight = vi.fn();
const getValidAccessToken = vi.fn();
const logoutCurrentDevice = vi.fn(async () => undefined);
const logoutAllDevices = vi.fn(async () => undefined);
let authStateCallback: ((event: string, session: Session | null) => void) | null = null;
let lastBootstrapSession: Session | null = null;

/** Mirror of the provider's Supabase→StoreAppSession normalization for the mock. */
function toAppSession(s: Session | null) {
  if (!s?.access_token) return null;
  return {
    authSource: "supabase" as const,
    accessToken: s.access_token,
    accessExpiresAt: (s.expires_at ?? 0) * 1000,
    user: { id: s.user?.id ?? "", email: s.user?.email ?? null, phone: null },
  };
}

vi.mock("@/lib/capacitor", () => ({
  isNative: () => false,
  openExternal: vi.fn(),
  shouldOpenExternally: () => false,
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: { getAuthContext: (...args: unknown[]) => getAuthContext(...args) },
}));

vi.mock("./auth-actions", () => ({
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  resendSignupEmail: vi.fn(),
  establishProvisionalSession: vi.fn(),
  logoutCurrentDevice: vi.fn(),
  // Supabase OTP actions. The provider only forwards them, so stubs are enough here —
  // their behaviour is covered in otp-auth-actions.test.ts.
  requestEmailOtp: vi.fn(),
  verifyEmailOtp: vi.fn(),
  requestPhoneOtp: vi.fn(),
  verifyPhoneOtp: vi.fn(),
  requestEmailPasswordRecovery: vi.fn(),
  verifyEmailRecoveryOtp: vi.fn(),
  updatePasswordInSession: vi.fn(),
  startPhoneChange: vi.fn(),
  verifyPhoneChange: vi.fn(),
  getVerifiedAuthPhone: vi.fn(),
}));

vi.mock("./auth-session-manager", () => ({
  // Pure helper, mirrored from the real module: mocks must not invent a second owner derivation.
  principalOwnerOf: (session: { authSource?: string; user?: { id?: string } } | null) =>
    session && session.user?.id ? `${session.authSource}:${session.user.id}` : null,
  authSessionManager: {
    // §Phase J — source-neutral bootstrap derives from the Supabase bootstrap for these direct-Supabase tests.
    bootstrapAppSession: async () => {
      lastBootstrapSession = (await bootstrapSession()) as Session | null;
      return toAppSession(lastBootstrapSession);
    },
    getLastKnownSession: () => lastBootstrapSession,
    getAppSession: () => toAppSession(lastBootstrapSession),
    getFederatedIdentityResolution: () => ({ pending: false, epoch: 0 }),
    getActiveSource: () => "supabase",
    subscribe: () => () => undefined,
    applyFederatedIdentity: vi.fn(() => true),
    prepareForSupabaseAuthentication: vi.fn(async () => undefined),
    bootstrapSession: () => bootstrapSession(),
    getValidAccessToken: () => getValidAccessToken(),
    // §9.3 — token acquisition can report an identity transition; these tests are the ordinary path.
    getValidAccessTokenOutcome: async () => ({ token: await getValidAccessToken(), requiresIdentityRevalidation: false }),
    // §9.3 — /auth/context resolves a quarantined identity, so it uses the dedicated token path.
    getAccessTokenForIdentityResolution: async () => ({ token: await getValidAccessToken(), epoch: 0 }),
    refreshSessionSingleFlight: (reason: string) => refreshSessionSingleFlight(reason),
    logoutCurrentDevice: () => logoutCurrentDevice(),
    logoutAllDevices: () => logoutAllDevices(),
    isExpiringSoon: () => false,
    startAutoRefresh: vi.fn(async () => undefined),
    stopAutoRefresh: vi.fn(async () => undefined),
    retryStorageBootstrap: vi.fn(async () => undefined),
    onAuthStateChange: (cb: (event: string, session: Session | null) => void) => {
      authStateCallback = cb;
      return { unsubscribe: vi.fn() };
    },
  },
}));

function makeSession(): Session {
  return {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
    user: { id: "user-1" },
  } as unknown as Session;
}

const AUTH_CONTEXT_RESPONSE = {
  user: { id: "user-1", email: "customer@example.com", phone: null },
  profile: null,
  roles: ["customer"],
  activeRole: "customer",
  merchant: null,
};

function Probe() {
  const { authStatus, session, user, storageError, isOffline, bootstrapDelayed } = useAuth();
  return (
    <div>
      <span data-testid="status">{authStatus}</span>
      <span data-testid="has-session">{session ? "yes" : "no"}</span>
      <span data-testid="user">{user?.id ?? "none"}</span>
      <span data-testid="storage-error">{storageError ? "yes" : "no"}</span>
      <span data-testid="offline">{isOffline ? "yes" : "no"}</span>
      <span data-testid="bootstrap-delayed">{bootstrapDelayed ? "yes" : "no"}</span>
    </div>
  );
}

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
  authStateCallback = null;
  bootstrapSession.mockResolvedValue(null);
  getValidAccessToken.mockResolvedValue("access-token");
  getAuthContext.mockResolvedValue(AUTH_CONTEXT_RESPONSE);
  // React Query's onlineManager is a module-level singleton: without this reset
  // the offline case would pause every query in the tests that follow it.
  onlineManager.setOnline(true);
});

describe("AuthProvider lifecycle", () => {
  it("resolves to unauthenticated when no session is stored", async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(screen.getByTestId("has-session").textContent).toBe("no");
  });

  it("reaches authenticated_ready with the backend-authoritative context", async () => {
    bootstrapSession.mockResolvedValue(makeSession());
    renderProvider();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));
    expect(screen.getByTestId("user").textContent).toBe("user-1");
  });

  it("enters storage_error without clearing the session when secure storage fails", async () => {
    bootstrapSession.mockRejectedValue(new AuthStorageUnavailableError());
    renderProvider();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("storage_error"));
    expect(screen.getByTestId("storage-error").textContent).toBe("yes");
    expect(logoutCurrentDevice).not.toHaveBeenCalled();
    expect(getAuthContext).not.toHaveBeenCalled();
  });

  it("switches to authenticated_offline and keeps the session when connectivity drops", async () => {
    bootstrapSession.mockResolvedValue(makeSession());
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));

    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_offline"));
    expect(screen.getByTestId("has-session").textContent).toBe("yes");
    expect(logoutCurrentDevice).not.toHaveBeenCalled();
  });

  it("refreshes once and retries the context request on 401", async () => {
    bootstrapSession.mockResolvedValue(makeSession());
    getAuthContext
      .mockRejectedValueOnce(Object.assign(new Error("Unauthorized"), { status: 401 }))
      .mockResolvedValue(AUTH_CONTEXT_RESPONSE);
    refreshSessionSingleFlight.mockResolvedValue({
      status: AUTH_REFRESH_OUTCOMES.refreshed,
      session: { ...makeSession(), access_token: "fresh-token" },
      reason: "auth_context_unauthorized",
      error: null,
    });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));
    expect(refreshSessionSingleFlight).toHaveBeenCalledTimes(1);
    expect(getAuthContext).toHaveBeenLastCalledWith("fresh-token");
  });

  it("does not sign out on a 403 from /auth/context", async () => {
    bootstrapSession.mockResolvedValue(makeSession());
    getAuthContext.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));

    renderProvider();

    await waitFor(() => expect(getAuthContext).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("has-session").textContent).toBe("yes"));
    expect(refreshSessionSingleFlight).not.toHaveBeenCalled();
    expect(logoutCurrentDevice).not.toHaveBeenCalled();
  });

  it("clears user-scoped caches on SIGNED_OUT and preserves marketplace caches", async () => {
    bootstrapSession.mockResolvedValue(makeSession());
    const { queryClient } = renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));

    for (const key of USER_SCOPED_QUERY_KEYS) {
      queryClient.setQueryData([key], { cached: true });
    }
    queryClient.setQueryData(["marketplace-home"], { cached: true });

    await act(async () => {
      authStateCallback?.("SIGNED_OUT", null);
    });

    for (const key of USER_SCOPED_QUERY_KEYS) {
      expect(queryClient.getQueryData([key])).toBeUndefined();
    }
    expect(queryClient.getQueryData(["marketplace-home"])).toEqual({ cached: true });
  });

  it("keeps authStatus=bootstrapping after the 8s UI timeout while bootstrap is pending", async () => {
    vi.useFakeTimers();
    bootstrapSession.mockImplementation(() => new Promise(() => undefined));
    renderProvider();

    expect(screen.getByTestId("status").textContent).toBe("bootstrapping");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });

    expect(screen.getByTestId("status").textContent).toBe("bootstrapping");
    expect(screen.getByTestId("bootstrap-delayed").textContent).toBe("yes");
    expect(screen.getByTestId("has-session").textContent).toBe("no");
    vi.useRealTimers();
  });

  it("does not fetch auth context while offline and invalidates it on reconnect", async () => {
    bootstrapSession.mockResolvedValue(makeSession());
    refreshSessionSingleFlight.mockResolvedValue({
      status: AUTH_REFRESH_OUTCOMES.refreshed,
      session: makeSession(),
      reason: "network_online",
      error: null,
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));
    const callsBeforeOffline = getAuthContext.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_offline"));
    expect(getAuthContext.mock.calls.length).toBe(callsBeforeOffline);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(refreshSessionSingleFlight).toHaveBeenCalled());
    await waitFor(() => expect(getAuthContext.mock.calls.length).toBeGreaterThan(callsBeforeOffline));
  });

  it("surfaces storage_error when logout secure-clear fails", async () => {
    bootstrapSession.mockResolvedValue(makeSession());
    logoutCurrentDevice.mockRejectedValueOnce(new AuthStorageUnavailableError());

    function LogoutProbe() {
      const { authStatus, logoutCurrentDevice: logout, storageError } = useAuth();
      return (
        <div>
          <span data-testid="status">{authStatus}</span>
          <span data-testid="storage-error">{storageError ? "yes" : "no"}</span>
          <button type="button" onClick={() => void logout().catch(() => undefined)}>
            logout
          </button>
        </div>
      );
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LogoutProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));
    await act(async () => {
      screen.getByRole("button", { name: "logout" }).click();
    });
    await waitFor(() => expect(screen.getByTestId("storage-error").textContent).toBe("yes"));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("storage_error"));
  });
});
