import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import Auth from "./Auth";

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
  phoneRegistrationEnabled: false, // Login-only phone mode
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

function renderAuth() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Auth />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Auth — Phone-First UX & WhatsApp Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders phone-first WhatsApp login by default when phoneOtpEnabled is true", () => {
    renderAuth();

    expect(screen.getByRole("heading", { level: 1, name: "تسجيل الدخول" })).toBeInTheDocument();
    expect(screen.getByLabelText(/رقم الهاتف/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("07XXXXXXXXX")).toBeInTheDocument();
    expect(screen.getByTestId("submit-otp-identifier")).toHaveTextContent("المتابعة عبر واتساب");
    expect(screen.getByTestId("toggle-method")).toHaveTextContent("الدخول بكلمة المرور");
  });

  it("normalizes Iraqi local number and sends shouldCreateUser: false in login-only mode", async () => {
    requestPhoneOtp.mockResolvedValue(undefined);

    renderAuth();

    const input = screen.getByPlaceholderText("07XXXXXXXXX");
    fireEvent.change(input, { target: { value: "0770 123 4567" } });

    const submitBtn = screen.getByTestId("submit-otp-identifier");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(requestPhoneOtp).toHaveBeenCalledTimes(1);
      expect(requestPhoneOtp).toHaveBeenCalledWith("+9647701234567", { createUser: false });
    });

    // Step transitions to OTP code entry
    expect(screen.getByText(/أدخل رمز التحقق المرسل عبر واتساب إلى/)).toBeInTheDocument();
    // Verify phone is masked in display: +964 7XX *** 4567
    expect(screen.getByTestId("masked-identifier")).toHaveTextContent("+964 7XX *** 4567");
  });

  it("toggles between WhatsApp OTP and password flow smoothly", async () => {
    renderAuth();

    expect(screen.getByLabelText(/رقم الهاتف/)).toBeInTheDocument();

    // Click "الدخول بكلمة المرور"
    const toggleBtn = screen.getByTestId("toggle-method");
    fireEvent.click(toggleBtn);

    // Now password form is visible
    expect(screen.getByTestId("password-form")).toBeInTheDocument();
    expect(screen.getByTestId("password")).toBeInTheDocument();
    expect(screen.getByTestId("toggle-method")).toHaveTextContent("الدخول عبر واتساب");

    // Toggle back
    fireEvent.click(screen.getByTestId("toggle-method"));
    expect(screen.getByTestId("otp-identifier-form")).toBeInTheDocument();
  });
});
