import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import Auth from "./Auth";
import { apiClient } from "@/lib/api-client";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

const requestPhoneOtp = vi.fn();
const verifyPhoneOtp = vi.fn();

vi.mock("@/components/Header", () => ({ default: () => <div /> }));
vi.mock("@/components/Footer", () => ({ default: () => <div /> }));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    appSession: null,
    authStatus: "unauthenticated",
    retryStorageBootstrap: vi.fn(),
    signInWithPassword: vi.fn(),
    signUpWithPassword: vi.fn(),
    requestEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    requestPhoneOtp,
    verifyPhoneOtp,
  }),
}));

vi.mock("@/lib/auth/auth-feature-flags", () => ({
  phoneOtpEnabled: true,
  phoneRegistrationEnabled: true,
  emailOtpEnabled: false,
  phoneLinkingEnabled: false,
  passwordLoginEnabled: true,
  anyOtpEnabled: true,
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getAuthContext: vi.fn(),
    updateCustomerProfile: vi.fn(),
  },
}));

function typeCode(code: string) {
  fireEvent.paste(screen.getByTestId("otp-digit-0"), {
    clipboardData: { getData: () => code },
  });
}

function renderAuth(initialState = { from: { pathname: "/products" } }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: "/auth", state: initialState }]}>
        <Auth />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Auth — Deterministic Post-OTP Customer Onboarding Journey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSession = {
    access_token: "token-abc",
    refresh_token: "ref-abc",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: "user-new", phone: "+9647701112233" },
  };

  it("transitions to lightweight onboarding if profile is null or full_name is blank", async () => {
    requestPhoneOtp.mockResolvedValue(undefined);
    verifyPhoneOtp.mockResolvedValue({
      session: mockSession,
      user: mockSession.user,
    });

    // auth-context returns null profile (new customer)
    vi.mocked(apiClient.getAuthContext).mockResolvedValueOnce({
      user: mockSession.user as any,
      profile: null,
      roles: ["customer"],
      activeRole: "customer",
      merchant: null,
    });

    renderAuth();

    // Step 1: Submit Phone
    fireEvent.change(screen.getByPlaceholderText("07XXXXXXXXX"), {
      target: { value: "07701112233" },
    });
    fireEvent.click(screen.getByTestId("submit-otp-identifier"));

    await waitFor(() => {
      expect(screen.getByTestId("otp-code-form")).toBeInTheDocument();
    });

    // Step 2: Submit OTP
    typeCode("654321");
    fireEvent.click(screen.getByTestId("submit-otp-code"));

    // Step 3: Verify lightweight onboarding screen is rendered
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-screen")).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { level: 1, name: "إكمال بيانات الحساب" })).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-full-name")).toBeInTheDocument();
    // No email, password, or PIN requested!
    expect(screen.queryByLabelText(/كلمة المرور/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/البريد الإلكتروني/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/PIN/i)).not.toBeInTheDocument();

    // Step 4: Submit Full Name
    vi.mocked(apiClient.updateCustomerProfile).mockResolvedValueOnce({ success: true } as any);
    vi.mocked(apiClient.getAuthContext).mockResolvedValueOnce({
      user: mockSession.user as any,
      profile: {
        id: "user-new",
        role: "customer",
        full_name: "سامر البدري",
        email: null,
        phone: "07701112233",
        address: null,
        points: 0,
      },
      roles: ["customer"],
      activeRole: "customer",
      merchant: null,
    });

    fireEvent.change(screen.getByTestId("onboarding-full-name"), {
      target: { value: "سامر البدري" },
    });
    fireEvent.click(screen.getByTestId("onboarding-submit"));

    await waitFor(() => {
      expect(apiClient.updateCustomerProfile).toHaveBeenCalledWith({ full_name: "سامر البدري" });
      expect(apiClient.getAuthContext).toHaveBeenCalledTimes(2); // 1st after OTP, 2nd to verify save
      expect(navigate).toHaveBeenCalledWith("/products", { replace: true });
    });
  });

  it("navigates directly if full_name is already present in auth-context", async () => {
    requestPhoneOtp.mockResolvedValue(undefined);
    verifyPhoneOtp.mockResolvedValue({
      session: mockSession,
      user: mockSession.user,
    });

    // auth-context already has full_name (existing customer)
    vi.mocked(apiClient.getAuthContext).mockResolvedValueOnce({
      user: mockSession.user as any,
      profile: {
        id: "user-new",
        role: "customer",
        full_name: "أحمد علي",
        email: null,
        phone: "07701112233",
        address: null,
        points: 50,
      },
      roles: ["customer"],
      activeRole: "customer",
      merchant: null,
    });

    renderAuth();

    fireEvent.change(screen.getByPlaceholderText("07XXXXXXXXX"), {
      target: { value: "07701112233" },
    });
    fireEvent.click(screen.getByTestId("submit-otp-identifier"));

    await waitFor(() => {
      expect(screen.getByTestId("otp-code-form")).toBeInTheDocument();
    });

    typeCode("654321");
    fireEvent.click(screen.getByTestId("submit-otp-code"));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/products", { replace: true });
    });

    // Onboarding screen was never shown
    expect(screen.queryByTestId("onboarding-screen")).not.toBeInTheDocument();
  });

  it("transitions to onboarding when profile exists but has a blank full_name", async () => {
    requestPhoneOtp.mockResolvedValue(undefined);
    verifyPhoneOtp.mockResolvedValue({
      session: mockSession,
      user: mockSession.user,
    });

    // profile exists but has whitespace-only full_name
    vi.mocked(apiClient.getAuthContext).mockResolvedValueOnce({
      user: mockSession.user as any,
      profile: {
        id: "user-new",
        role: "customer",
        full_name: "   ",
        email: null,
        phone: "07701112233",
        address: null,
        points: 0,
      },
      roles: ["customer"],
      activeRole: "customer",
      merchant: null,
    });

    renderAuth();

    fireEvent.change(screen.getByPlaceholderText("07XXXXXXXXX"), {
      target: { value: "07701112233" },
    });
    fireEvent.click(screen.getByTestId("submit-otp-identifier"));

    await waitFor(() => {
      expect(screen.getByTestId("otp-code-form")).toBeInTheDocument();
    });

    typeCode("654321");
    fireEvent.click(screen.getByTestId("submit-otp-code"));

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-screen")).toBeInTheDocument();
    });
  });

  it("preserves onboarding session and shows error if context refresh fails after profile update", async () => {
    requestPhoneOtp.mockResolvedValue(undefined);
    verifyPhoneOtp.mockResolvedValue({
      session: mockSession,
      user: mockSession.user,
    });

    vi.mocked(apiClient.getAuthContext).mockResolvedValueOnce({
      user: mockSession.user as any,
      profile: null,
      roles: ["customer"],
      activeRole: "customer",
      merchant: null,
    });

    renderAuth();

    fireEvent.change(screen.getByPlaceholderText("07XXXXXXXXX"), {
      target: { value: "07701112233" },
    });
    fireEvent.click(screen.getByTestId("submit-otp-identifier"));

    await waitFor(() => {
      expect(screen.getByTestId("otp-code-form")).toBeInTheDocument();
    });

    typeCode("654321");
    fireEvent.click(screen.getByTestId("submit-otp-code"));

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-screen")).toBeInTheDocument();
    });

    // updateCustomerProfile succeeds, but 2nd getAuthContext rejects
    vi.mocked(apiClient.updateCustomerProfile).mockResolvedValueOnce({ success: true } as any);
    vi.mocked(apiClient.getAuthContext).mockRejectedValueOnce(new Error("Network glitch during context refresh"));

    fireEvent.change(screen.getByTestId("onboarding-full-name"), {
      target: { value: "علي البدري" },
    });
    fireEvent.click(screen.getByTestId("onboarding-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-error")).toBeInTheDocument();
    });

    // Session is preserved; user is NOT kicked back to OTP step
    expect(screen.getByTestId("onboarding-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("otp-code-form")).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("prevents duplicate profile update or duplicate redirect when submit is clicked repeatedly", async () => {
    requestPhoneOtp.mockResolvedValue(undefined);
    verifyPhoneOtp.mockResolvedValue({
      session: mockSession,
      user: mockSession.user,
    });

    vi.mocked(apiClient.getAuthContext).mockResolvedValueOnce({
      user: mockSession.user as any,
      profile: null,
      roles: ["customer"],
      activeRole: "customer",
      merchant: null,
    });

    renderAuth();

    fireEvent.change(screen.getByPlaceholderText("07XXXXXXXXX"), {
      target: { value: "07701112233" },
    });
    fireEvent.click(screen.getByTestId("submit-otp-identifier"));

    await waitFor(() => {
      expect(screen.getByTestId("otp-code-form")).toBeInTheDocument();
    });

    typeCode("654321");
    fireEvent.click(screen.getByTestId("submit-otp-code"));

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-screen")).toBeInTheDocument();
    });

    let resolveUpdate: (val: any) => void;
    const updatePromise = new Promise((resolve) => {
      resolveUpdate = resolve;
    });
    vi.mocked(apiClient.updateCustomerProfile).mockReturnValueOnce(updatePromise as any);

    fireEvent.change(screen.getByTestId("onboarding-full-name"), {
      target: { value: "يوسف حسن" },
    });

    const submitBtn = screen.getByTestId("onboarding-submit");
    // Fire click twice rapidly while pending
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    expect(apiClient.updateCustomerProfile).toHaveBeenCalledTimes(1);

    // Now resolve
    resolveUpdate!({ success: true });
    vi.mocked(apiClient.getAuthContext).mockResolvedValueOnce({
      user: mockSession.user as any,
      profile: {
        id: "user-new",
        role: "customer",
        full_name: "يوسف حسن",
        email: null,
        phone: "07701112233",
        address: null,
        points: 0,
      },
      roles: ["customer"],
      activeRole: "customer",
      merchant: null,
    });

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledTimes(1);
    });
  });
});
