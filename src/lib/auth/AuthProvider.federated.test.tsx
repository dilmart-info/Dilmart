// @vitest-environment jsdom
/**
 * STORE-PR5 §Phase J/K + §21 — AuthProvider federated React integration.
 * Proves: a federated bootstrap reaches authenticated_ready with authSource=DilMart_federated and the
 * backend capabilities exposed (customerCommerce on; accountClaim/phoneIdentity/passwordManagement off),
 * and that a Supabase SIGNED_OUT event can NEVER erase the active federated React session (blocker D).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/use-auth";
import { AuthProvider } from "./AuthProvider";

const getAuthContext = vi.fn();
let authStateCallback: ((event: string, session: Session | null) => void) | null = null;

const FED_SESSION = {
  authSource: "DilMart_federated" as const,
  accessToken: "fed-access",
  accessExpiresAt: Date.now() + 600_000,
  user: { id: "fed-cust-1", email: null, phone: null },
  federated: { linkedProfileId: "lp-1", refreshExpiresAt: Date.now() + 2_592_000_000 },
};

vi.mock("@/lib/capacitor", () => ({ isNative: () => false, openExternal: vi.fn(), shouldOpenExternally: () => false }));
vi.mock("@/lib/api-client", () => ({ apiClient: { getAuthContext: (...a: unknown[]) => getAuthContext(...a) } }));
vi.mock("./auth-actions", () => ({
  signInWithPassword: vi.fn(), signUpWithPassword: vi.fn(), resendSignupEmail: vi.fn(),
  establishProvisionalSession: vi.fn(), logoutCurrentDevice: vi.fn(),
  requestEmailOtp: vi.fn(), verifyEmailOtp: vi.fn(), requestPhoneOtp: vi.fn(), verifyPhoneOtp: vi.fn(),
  requestEmailPasswordRecovery: vi.fn(), verifyEmailRecoveryOtp: vi.fn(), updatePasswordInSession: vi.fn(),
  startPhoneChange: vi.fn(), verifyPhoneChange: vi.fn(), getVerifiedAuthPhone: vi.fn(),
}));

vi.mock("./auth-session-manager", () => ({
  // Pure helper, mirrored from the real module: mocks must not invent a second owner derivation.
  principalOwnerOf: (session: { authSource?: string; user?: { id?: string } } | null) =>
    session && session.user?.id ? `${session.authSource}:${session.user.id}` : null,
  authSessionManager: {
    bootstrapAppSession: async () => FED_SESSION,
    getLastKnownSession: () => null, // no Supabase session for a federated identity
    getAppSession: () => FED_SESSION,
    getFederatedIdentityResolution: () => ({ pending: false, epoch: 0 }),
    getActiveSource: () => "DilMart_federated",
    getValidAccessToken: async () => "fed-access",
    getValidAccessTokenOutcome: async () => ({ token: "fed-access", requiresIdentityRevalidation: false }),
    getAccessTokenForIdentityResolution: async () => ({ token: "fed-access", epoch: 0 }),
    applyFederatedIdentity: vi.fn(() => true),
    prepareForSupabaseAuthentication: vi.fn(async () => undefined),
    subscribe: () => () => undefined,
    refreshSessionSingleFlight: vi.fn(),
    logoutCurrentDevice: vi.fn(async () => undefined),
    logoutAllDevices: vi.fn(async () => undefined),
    isExpiringSoon: () => false,
    startAutoRefresh: vi.fn(async () => undefined),
    stopAutoRefresh: vi.fn(async () => undefined),
    retryStorageBootstrap: vi.fn(async () => undefined),
    onAuthStateChange: (cb: (e: string, s: Session | null) => void) => { authStateCallback = cb; return { unsubscribe: vi.fn() }; },
  },
}));

const FED_CONTEXT = {
  user: { id: "fed-cust-1", email: null, phone: null },
  profile: { id: "fed-cust-1", role: "customer" },
  roles: ["customer"],
  activeRole: "customer",
  merchant: null,
  authSource: "DilMart_federated",
  claim_required: false,
  capabilities: { customerCommerce: true, phoneIdentity: false, accountClaim: false, passwordManagement: false, federatedLogoutAll: true },
};

function Probe() {
  const { authStatus, authSource, capabilities, user } = useAuth();
  return (
    <div>
      <span data-testid="status">{authStatus}</span>
      <span data-testid="source">{authSource ?? "none"}</span>
      <span data-testid="user">{user?.id ?? "none"}</span>
      <span data-testid="cap-commerce">{String(capabilities?.customerCommerce)}</span>
      <span data-testid="cap-claim">{String(capabilities?.accountClaim)}</span>
      <span data-testid="cap-password">{String(capabilities?.passwordManagement)}</span>
      <span data-testid="cap-logoutall">{String(capabilities?.federatedLogoutAll)}</span>
    </div>
  );
}

function renderProvider() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider><Probe /></AuthProvider>
    </QueryClientProvider>,
  );
}

describe("AuthProvider — federated integration", () => {
  it("reaches authenticated_ready as DilMart_federated with capabilities gated", async () => {
    getAuthContext.mockResolvedValue(FED_CONTEXT);
    renderProvider();

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));
    expect(screen.getByTestId("source").textContent).toBe("DilMart_federated");
    expect(screen.getByTestId("user").textContent).toBe("fed-cust-1");
    expect(screen.getByTestId("cap-commerce").textContent).toBe("true");
    expect(screen.getByTestId("cap-claim").textContent).toBe("false");
    expect(screen.getByTestId("cap-password").textContent).toBe("false");
    expect(screen.getByTestId("cap-logoutall").textContent).toBe("true");
  });

  it("BLOCKER D: a Supabase SIGNED_OUT event does NOT erase the federated session", async () => {
    getAuthContext.mockResolvedValue(FED_CONTEXT);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated_ready"));

    await act(async () => { authStateCallback?.("SIGNED_OUT", null); });

    expect(screen.getByTestId("status").textContent).toBe("authenticated_ready");
    expect(screen.getByTestId("source").textContent).toBe("DilMart_federated");
  });
});
