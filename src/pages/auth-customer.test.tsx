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
    user: null as { id: string } | null,
    authStatus: "unauthenticated",
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
    user: mockAuthState.user,
    authStatus: mockAuthState.authStatus,
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

describe("Auth.tsx — Customer Identity & Channel Contract Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureFlags.emailOtpEnabled = true;
    mockFeatureFlags.phoneOtpEnabled = true;
    mockFeatureFlags.phoneRegistrationEnabled = false;
    mockAuthState.user = null;
    mockAuthState.authStatus = "unauthenticated";

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

  it("EMAIL OTP ONLY: when phone OTP is disabled, defaults to email and never calls requestPhoneOtp", async () => {
    mockFeatureFlags.phoneOtpEnabled = false;
    mockFeatureFlags.emailOtpEnabled = true;
    mockFeatureFlags.phoneRegistrationEnabled = false;

    renderPage();

    const identifierInput = screen.getByTestId("identifier");
    expect(identifierInput).toBeTruthy();
    expect(identifierInput.getAttribute("type")).toBe("email");

    fireEvent.change(identifierInput, { target: { value: "customer@dilmart.com" } });
    fireEvent.submit(screen.getByTestId("otp-identifier-form"));

    await waitFor(() => {
      expect(requestEmailOtp).toHaveBeenCalledWith("customer@dilmart.com", {
        createUser: false,
        metadata: undefined,
      });
    });
    expect(requestPhoneOtp).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith("أرسلنا رمز التحقق إلى بريدك الإلكتروني");
  });

  it("LOGIN -> REGISTER CHANNEL DRIFT PROOF: switching from Login (phone allowed) to Register (phone disabled) forces email OTP", async () => {
    mockFeatureFlags.phoneOtpEnabled = true;
    mockFeatureFlags.emailOtpEnabled = true;
    mockFeatureFlags.phoneRegistrationEnabled = false; // Phone reg is disabled!

    renderPage();

    // On Login: Phone is active by default
    expect(screen.getByTestId("channel-phone")).toBeTruthy();

    // Switch to Register tab
    const registerTab = screen.getByTestId("tab-register");
    fireEvent.mouseDown(registerTab);
    fireEvent.click(registerTab);

    // Full name input appears for register
    const fullNameInput = await screen.findByTestId("full-name");
    fireEvent.change(fullNameInput, { target: { value: "علي أحمد" } });

    // In Register mode, phoneChannelAllowed is false, so availableChannels is only ['email']
    const identifierInput = screen.getByTestId("identifier");
    expect(identifierInput.getAttribute("type")).toBe("email");

    fireEvent.change(identifierInput, { target: { value: "ali@example.com" } });
    fireEvent.submit(screen.getByTestId("otp-identifier-form"));

    // Critical Invariant: Request MUST be sent to email with createUser=true and full_name metadata
    await waitFor(() => {
      expect(requestEmailOtp).toHaveBeenCalledWith("ali@example.com", {
        createUser: true,
        metadata: { full_name: "علي أحمد" },
      });
    });
    expect(requestPhoneOtp).not.toHaveBeenCalled();
  });

  it("PERSISTENT UNCONFIRMED EMAIL STATE: renders clear persistent UI when signUpWithPassword returns session = null", async () => {
    signUpWithPassword.mockResolvedValueOnce({
      session: null, // Email confirmation required
      user: null,
      requiresEmailConfirmation: true,
    });

    renderPage();

    // Switch to Register tab
    const registerTab = screen.getByTestId("tab-register");
    fireEvent.mouseDown(registerTab);
    fireEvent.click(registerTab);

    // Switch to Password method
    fireEvent.click(screen.getByTestId("method-password"));

    const form = await screen.findByTestId("password-form");
    fireEvent.change(screen.getByTestId("password-identifier"), {
      target: { value: "unconfirmed@example.com" },
    });
    fireEvent.change(screen.getByTestId("password"), { target: { value: "StrongSecret123" } });
    fireEvent.submit(form);

    // Persistent success screen must appear explaining email confirmation is needed
    await waitFor(() => {
      expect(screen.getByText("تم إنشاء الحساب بنجاح")).toBeTruthy();
      expect(screen.getByText("unconfirmed@example.com")).toBeTruthy();
    });

    // Does NOT pretend user is logged in
    expect(navigate).not.toHaveBeenCalled();

    // Button allows going to login screen
    const loginLink = screen.getByRole("button", { name: "الانتقال إلى تسجيل الدخول" });
    fireEvent.click(loginLink);
    expect(screen.getByTestId("tab-login")).toBeTruthy();
  });

  it("AUTH STATE FLASH PREVENTION: renders loading spinner during bootstrapping or authenticated_loading_context", () => {
    mockAuthState.authStatus = "bootstrapping";
    renderPage();

    expect(screen.getByText("جاري التحقق من الجلسة...")).toBeTruthy();
    expect(screen.queryByTestId("otp-identifier-form")).toBeNull();
    expect(screen.queryByTestId("password-form")).toBeNull();
  });
});
