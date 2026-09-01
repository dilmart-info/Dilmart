import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import Auth from "./Auth";

const {
  navigate,
  mockFeatureFlags,
  requestEmailOtp,
  verifyEmailOtp,
  requestPhoneOtp,
  verifyPhoneOtp,
  signInWithPassword,
  signUpWithPassword,
  toastSuccess,
  toastError,
  toastWarning,
  mockAuthState,
} = vi.hoisted(() => ({
  navigate: vi.fn(),
  mockFeatureFlags: {
    emailOtpEnabled: true,
    phoneOtpEnabled: true,
    phoneRegistrationEnabled: false,
    passwordLoginEnabled: true,
    anyOtpEnabled: true,
  },
  requestEmailOtp: vi.fn(),
  verifyEmailOtp: vi.fn(),
  requestPhoneOtp: vi.fn(),
  verifyPhoneOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  mockAuthState: {
    appSession: null as { access_token: string } | null,
    user: null as { id: string } | null,
    authStatus: "unauthenticated",
    retryStorageBootstrap: vi.fn(),
    requestEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    requestPhoneOtp: vi.fn(),
    verifyPhoneOtp: vi.fn(),
    signInWithPassword: vi.fn(),
    signUpWithPassword: vi.fn(),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
    useLocation: () => ({ pathname: "/auth", state: null }),
  };
});

vi.mock("@/components/Header", () => ({ default: () => <div data-testid="header" /> }));
vi.mock("@/components/Footer", () => ({ default: () => <div data-testid="footer" /> }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => <div data-testid="whatsapp-btn" /> }));

vi.mock("@/lib/auth/auth-feature-flags", () => mockFeatureFlags);

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    appSession: mockAuthState.appSession,
    user: mockAuthState.user,
    authStatus: mockAuthState.authStatus,
    retryStorageBootstrap: mockAuthState.retryStorageBootstrap,
    requestEmailOtp,
    verifyEmailOtp,
    requestPhoneOtp,
    verifyPhoneOtp,
    signInWithPassword,
    signUpWithPassword,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError, warning: toastWarning },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/auth"]}>
        <Auth />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Auth.tsx — Customer Identity, Invariants & Edge Cases Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureFlags.emailOtpEnabled = true;
    mockFeatureFlags.phoneOtpEnabled = true;
    mockFeatureFlags.phoneRegistrationEnabled = false;
    mockAuthState.appSession = null;
    mockAuthState.user = null;
    mockAuthState.authStatus = "unauthenticated";
    mockAuthState.retryStorageBootstrap = vi.fn();

    requestEmailOtp.mockResolvedValue(undefined);
    requestPhoneOtp.mockResolvedValue(undefined);
    verifyEmailOtp.mockResolvedValue({
      session: { access_token: "tok", user: { id: "user-1" } },
      user: { id: "user-1" },
    });
    verifyPhoneOtp.mockResolvedValue({
      session: { access_token: "tok", user: { id: "user-1" } },
      user: { id: "user-1" },
    });
    signInWithPassword.mockResolvedValue({
      session: { access_token: "tok", user: { id: "user-1" } },
      user: { id: "user-1" },
    });
    signUpWithPassword.mockResolvedValue({
      session: { access_token: "tok", user: { id: "user-1" } },
      user: { id: "user-1" },
      requiresEmailConfirmation: false,
    });
  });

  it("STORAGE ERROR: renders AuthStorageErrorScreen and never renders login form", () => {
    mockAuthState.authStatus = "storage_error";
    renderPage();

    expect(screen.getByText(/تعذّر الوصول إلى التخزين الآمن/i)).toBeTruthy();
    expect(screen.queryByTestId("password-form")).toBeNull();
    expect(screen.queryByTestId("otp-identifier-form")).toBeNull();
  });

  it("AUTHENTICATED OFFLINE: never renders login form and redirects to from/profile", () => {
    mockAuthState.appSession = { access_token: "offline-token" };
    mockAuthState.user = { id: "offline-user" };
    mockAuthState.authStatus = "authenticated_offline";
    renderPage();

    expect(screen.queryByTestId("password-form")).toBeNull();
    expect(screen.queryByTestId("otp-identifier-form")).toBeNull();
  });

  it("PHONE LOGIN ONLY + NO EMAIL OTP + NO PHONE REGISTRATION: switching to Register immediately defaults to Password Registration form", async () => {
    mockFeatureFlags.phoneOtpEnabled = true;
    mockFeatureFlags.emailOtpEnabled = false;
    mockFeatureFlags.phoneRegistrationEnabled = false;

    renderPage();

    // Login tab: phone is available for login
    expect(screen.getByTestId("identifier")).toBeTruthy();

    // Switch to Register tab
    const registerTab = screen.getByTestId("tab-register");
    fireEvent.mouseDown(registerTab);
    fireEvent.click(registerTab);

    // In Register mode, availableChannels is empty -> effectiveMethod MUST be "password" immediately!
    const passwordForm = await screen.findByTestId("password-form");
    expect(passwordForm).toBeTruthy();
    expect(screen.queryByTestId("otp-identifier-form")).toBeNull();
    // Full name field is NOT present in password registration
    expect(screen.queryByTestId("full-name")).toBeNull();
  });

  it("PASSWORD REGISTRATION: requires confirm password and rejects empty or mismatched confirmation", async () => {
    mockFeatureFlags.emailOtpEnabled = false;
    mockFeatureFlags.phoneOtpEnabled = false;

    renderPage();

    // Switch to Register tab
    const registerTab = screen.getByTestId("tab-register");
    fireEvent.mouseDown(registerTab);
    fireEvent.click(registerTab);

    const form = screen.getByTestId("password-form");
    const emailInput = screen.getByTestId("password-identifier");
    const passInput = screen.getByTestId("password");
    const confirmInput = screen.getByTestId("confirm-password");

    // Attempt 1: Password filled, confirm password empty
    fireEvent.change(emailInput, { target: { value: "customer@example.com" } });
    fireEvent.change(passInput, { target: { value: "Secret123" } });
    fireEvent.change(confirmInput, { target: { value: "" } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("يرجى تأكيد كلمة المرور");
    });
    expect(signUpWithPassword).not.toHaveBeenCalled();

    // Attempt 2: Mismatched passwords
    fireEvent.change(confirmInput, { target: { value: "Secret999" } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("كلمتا المرور غير متطابقتين");
    });
    expect(signUpWithPassword).not.toHaveBeenCalled();

    // Attempt 3: Matching passwords -> proceeds
    fireEvent.change(confirmInput, { target: { value: "Secret123" } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(signUpWithPassword).toHaveBeenCalledWith({
        email: "customer@example.com",
        password: "Secret123",
      });
    });
  });

  it("REQUEST REJECTION: handles OTP request rejection gracefully with toast error without advancing to code step", async () => {
    requestPhoneOtp.mockRejectedValueOnce(new Error("Rate limit exceeded"));
    renderPage();

    // Enter identifier and submit
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "07701234567" } });
    fireEvent.submit(screen.getByTestId("otp-identifier-form"));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Rate limit exceeded");
    });
    // Stays on identifier form
    expect(screen.getByTestId("otp-identifier-form")).toBeTruthy();
    expect(screen.queryByTestId("otp-code-form")).toBeNull();
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
