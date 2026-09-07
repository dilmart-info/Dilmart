import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import Auth from "./Auth";
import { apiClient } from "@/lib/api-client";
import * as authActions from "@/lib/auth/auth-actions";
import { toast } from "sonner";

// Spy on toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/components/Header", () => ({ default: () => <div /> }));
vi.mock("@/components/Footer", () => ({ default: () => <div /> }));

vi.mock("@/lib/capacitor", () => ({
  isNative: () => false,
  openExternal: vi.fn(),
  shouldOpenExternally: () => false,
}));

vi.mock("@/lib/auth/auth-feature-flags", () => ({
  phoneOtpEnabled: true,
  phoneRegistrationEnabled: true,
  emailOtpEnabled: false,
  phoneLinkingEnabled: false,
  passwordLoginEnabled: true,
  anyOtpEnabled: true,
}));

let authStateCallback: ((event: string, session: Session | null) => void) | null = null;
let currentSession: Session | null = null;

function toAppSession(s: Session | null) {
  if (!s?.access_token) return null;
  return {
    authSource: "supabase" as const,
    accessToken: s.access_token,
    accessExpiresAt: (s.expires_at ?? 0) * 1000,
    user: { id: s.user?.id ?? "", email: s.user?.email ?? null, phone: s.user?.phone ?? null },
  };
}

const logoutCurrentDeviceMock = vi.fn(async () => {
  currentSession = null;
  if (authStateCallback) {
    authStateCallback("SIGNED_OUT", null);
  }
});

vi.mock("@/lib/auth/auth-session-manager", () => ({
  principalOwnerOf: (s: { authSource?: string; user?: { id?: string } } | null) =>
    s && s.user?.id ? `${s.authSource}:${s.user.id}` : null,
  authSessionManager: {
    bootstrapAppSession: async () => toAppSession(currentSession),
    getLastKnownSession: () => currentSession,
    getAppSession: () => toAppSession(currentSession),
    getFederatedIdentityResolution: () => ({ pending: false, epoch: 0 }),
    getActiveSource: () => "supabase",
    subscribe: () => () => undefined,
    applyFederatedIdentity: vi.fn(() => true),
    prepareForSupabaseAuthentication: vi.fn(async () => undefined),
    bootstrapSession: async () => currentSession,
    getValidAccessToken: async () => currentSession?.access_token ?? null,
    getValidAccessTokenOutcome: async () => ({
      token: currentSession?.access_token ?? null,
      requiresIdentityRevalidation: false,
    }),
    getAccessTokenForIdentityResolution: async () => ({
      token: currentSession?.access_token ?? null,
      epoch: 0,
    }),
    refreshSessionSingleFlight: vi.fn(async () => ({ session: currentSession })),
    logoutCurrentDevice: () => logoutCurrentDeviceMock(),
    logoutAllDevices: vi.fn(async () => undefined),
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

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getAuthContext: vi.fn(),
    updateCustomerProfile: vi.fn(),
  },
}));

vi.mock("@/lib/auth/auth-actions", () => ({
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  resendSignupEmail: vi.fn(),
  establishProvisionalSession: vi.fn(),
  logoutCurrentDevice: vi.fn(),
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

function renderIntegratedAuth() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[{ pathname: "/auth", state: { from: { pathname: "/checkout" } } }]}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/checkout" element={<div data-testid="checkout-page">CHECKOUT_PAGE</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function typeCode(code: string) {
  fireEvent.paste(screen.getByTestId("otp-digit-0"), {
    clipboardData: { getData: () => code },
  });
}

describe("Auth — Supervisor Gate Verifications (PR #42 Integration & Logic Audits)", () => {
  const mockNewUserSession: Session = {
    access_token: "jwt-token-new-customer",
    refresh_token: "ref-new-customer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: "user-new-123",
      phone: "+9647701112233",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-09-07T00:00:00Z",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    currentSession = null;
  });

  it("1. Real integration: AuthProvider + Auth + Supabase auth event prevents bypassing onboarding screen", async () => {
    vi.mocked(authActions.requestPhoneOtp).mockResolvedValue(undefined);

    // verifyPhoneOtp simulates Supabase verifying OTP and firing SIGNED_IN auth event
    vi.mocked(authActions.verifyPhoneOtp).mockImplementation(async () => {
      currentSession = mockNewUserSession;
      act(() => {
        if (authStateCallback) {
          authStateCallback("SIGNED_IN", mockNewUserSession);
        }
      });
      return {
        session: mockNewUserSession,
        user: mockNewUserSession.user,
      };
    });

    // auth-context returns a customer without full_name
    vi.mocked(apiClient.getAuthContext).mockResolvedValue({
      user: mockNewUserSession.user as any,
      profile: { id: "user-new-123", full_name: null } as any,
      roles: ["customer"],
      activeRole: "customer",
      merchant: null,
    });

    renderIntegratedAuth();

    // Step 1: User enters phone number and submits
    await waitFor(() => {
      expect(screen.getByTestId("identifier")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "07701112233" } });
    fireEvent.click(screen.getByTestId("submit-otp-identifier"));

    // Step 2: User enters OTP code and submits
    await waitFor(() => {
      expect(screen.getByTestId("otp-digit-0")).toBeInTheDocument();
    });
    typeCode("123456");
    fireEvent.click(screen.getByTestId("submit-otp-code"));

    // Step 3: CRITICAL INVARIANT:
    // Even though SIGNED_IN fired and AuthProvider entered authenticated_ready,
    // the customer MUST NOT be redirected to /checkout before entering their name!
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-screen")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("checkout-page")).not.toBeInTheDocument();

    // Step 4: Complete onboarding by entering name and submitting
    vi.mocked(apiClient.updateCustomerProfile).mockResolvedValue({ success: true } as any);
    vi.mocked(apiClient.getAuthContext).mockResolvedValue({
      user: mockNewUserSession.user as any,
      profile: { id: "user-new-123", full_name: "مروان العراقي" } as any,
      roles: ["customer"],
      activeRole: "customer",
      merchant: null,
    });

    fireEvent.change(screen.getByTestId("onboarding-full-name"), { target: { value: "مروان العراقي" } });
    fireEvent.click(screen.getByTestId("onboarding-submit"));

    // Step 5: After saving name and confirming context, destination is reached
    await waitFor(() => {
      expect(screen.getByTestId("checkout-page")).toBeInTheDocument();
    });
  });

  it("2. Onboarding retry executes context fetch only without re-mutating profile", async () => {
    vi.mocked(authActions.requestPhoneOtp).mockResolvedValue(undefined);
    vi.mocked(authActions.verifyPhoneOtp).mockResolvedValue({
      session: mockNewUserSession,
      user: mockNewUserSession.user,
    });

    // Initial context after OTP verification has blank name
    vi.mocked(apiClient.getAuthContext).mockResolvedValueOnce({
      user: mockNewUserSession.user as any,
      profile: { id: "user-new-123", full_name: "" } as any,
      roles: ["customer"],
      activeRole: "customer",
      merchant: null,
    });

    renderIntegratedAuth();

    await waitFor(() => {
      expect(screen.getByTestId("identifier")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "07701112233" } });
    fireEvent.click(screen.getByTestId("submit-otp-identifier"));

    await waitFor(() => {
      expect(screen.getByTestId("otp-digit-0")).toBeInTheDocument();
    });
    typeCode("123456");
    fireEvent.click(screen.getByTestId("submit-otp-code"));

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-screen")).toBeInTheDocument();
    });

    // Setup: updateCustomerProfile succeeds, but next getAuthContext fails
    vi.mocked(apiClient.updateCustomerProfile).mockResolvedValue({ success: true } as any);
    vi.mocked(apiClient.getAuthContext).mockRejectedValueOnce(new Error("Network glitch on context fetch"));

    fireEvent.change(screen.getByTestId("onboarding-full-name"), { target: { value: "كرار حيدر" } });
    fireEvent.click(screen.getByTestId("onboarding-submit"));

    // Verify error is shown
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-error")).toBeInTheDocument();
    });
    expect(apiClient.updateCustomerProfile).toHaveBeenCalledTimes(1);

    // Second try: context fetch now succeeds
    vi.mocked(apiClient.getAuthContext).mockResolvedValueOnce({
      user: mockNewUserSession.user as any,
      profile: { id: "user-new-123", full_name: "كرار حيدر" } as any,
      roles: ["customer"],
      activeRole: "customer",
      merchant: null,
    });

    // User clicks submit/retry again
    fireEvent.click(screen.getByTestId("onboarding-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("checkout-page")).toBeInTheDocument();
    });

    // CRITICAL ASSERTION: updateCustomerProfile was called EXACTLY ONCE across retries!
    expect(apiClient.updateCustomerProfile).toHaveBeenCalledTimes(1);
    // getAuthContext was called for verification retry
    expect(apiClient.getAuthContext).toHaveBeenCalled();
  });

  it("3. 'استخدام رقم آخر' securely terminates the current session on the device", async () => {
    vi.mocked(authActions.requestPhoneOtp).mockResolvedValue(undefined);
    vi.mocked(authActions.verifyPhoneOtp).mockResolvedValue({
      session: mockNewUserSession,
      user: mockNewUserSession.user,
    });

    // Context loading fails post-verification -> triggers contextError recovery screen
    vi.mocked(apiClient.getAuthContext).mockRejectedValue(new Error("Database connection timeout"));

    renderIntegratedAuth();

    await waitFor(() => {
      expect(screen.getByTestId("identifier")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "07701112233" } });
    fireEvent.click(screen.getByTestId("submit-otp-identifier"));

    await waitFor(() => {
      expect(screen.getByTestId("otp-digit-0")).toBeInTheDocument();
    });
    typeCode("123456");
    fireEvent.click(screen.getByTestId("submit-otp-code"));

    // Context error recovery screen rendered
    await waitFor(() => {
      expect(screen.getByTestId("context-error-screen")).toBeInTheDocument();
    });

    // Click 'استخدام رقم آخر'
    fireEvent.click(screen.getByTestId("change-number-after-error"));

    // CRITICAL ASSERTION: logoutCurrentDevice was explicitly invoked before resetting to phone screen!
    await waitFor(() => {
      expect(logoutCurrentDeviceMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("identifier")).toBeInTheDocument();
    });
  });

  it("4. Account enumeration prevention: unified Arabic error on OTP failure and no account hint leak", async () => {
    // Backend rejects with an internal error revealing provider failure / account non-existence
    vi.mocked(authActions.requestPhoneOtp).mockRejectedValue(
      new Error("WhatsApp provider 404: Phone number not registered with Meta")
    );

    renderIntegratedAuth();

    await waitFor(() => {
      expect(screen.getByTestId("identifier")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "07709998877" } });
    fireEvent.click(screen.getByTestId("submit-otp-identifier"));

    await waitFor(() => {
      // Must NOT leak backend error message; must display unified Arabic error
      expect(toast.error).toHaveBeenCalledWith(
        "تعذر إرسال رمز التحقق. يرجى التأكد من صحة الرقم والمحاولة لاحقاً."
      );
    });

    // Must NOT display any conditional noAccountHint
    expect(screen.queryByTestId("no-account-hint")).not.toBeInTheDocument();
  });

  it("5. Single deterministic context fetch: verifies exactly 1 network call on OTP verification without invalidation refetch", async () => {
    vi.mocked(authActions.requestPhoneOtp).mockResolvedValue(undefined);
    vi.mocked(authActions.verifyPhoneOtp).mockResolvedValue({
      session: mockNewUserSession,
      user: mockNewUserSession.user,
    });

    vi.mocked(apiClient.getAuthContext).mockResolvedValue({
      user: mockNewUserSession.user as any,
      profile: { id: "user-new-123", full_name: "عميل قديم" } as any,
      roles: ["customer"],
      activeRole: "customer",
      merchant: null,
    });

    renderIntegratedAuth();

    await waitFor(() => {
      expect(screen.getByTestId("identifier")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "07701112233" } });
    fireEvent.click(screen.getByTestId("submit-otp-identifier"));

    await waitFor(() => {
      expect(screen.getByTestId("otp-digit-0")).toBeInTheDocument();
    });

    // Reset getAuthContext call count right before typing OTP
    vi.mocked(apiClient.getAuthContext).mockClear();

    typeCode("123456");
    fireEvent.click(screen.getByTestId("submit-otp-code"));

    await waitFor(() => {
      expect(screen.getByTestId("checkout-page")).toBeInTheDocument();
    });

    // CRITICAL ASSERTION: Exactly 1 call to getAuthContext was made! No duplicate from invalidateQueries!
    expect(apiClient.getAuthContext).toHaveBeenCalledTimes(1);
  });
});
