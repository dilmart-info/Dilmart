import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import Auth from "./Auth";

vi.mock("@/components/Header", () => ({ default: () => <div /> }));
vi.mock("@/components/Footer", () => ({ default: () => <div /> }));

const mockFlags = {
  phoneOtpEnabled: false,
  phoneRegistrationEnabled: false,
  emailOtpEnabled: false,
  phoneLinkingEnabled: false,
  passwordLoginEnabled: true,
  anyOtpEnabled: false,
};

vi.mock("@/lib/auth/auth-feature-flags", () => ({
  get phoneOtpEnabled() {
    return mockFlags.phoneOtpEnabled;
  },
  get phoneRegistrationEnabled() {
    return mockFlags.phoneRegistrationEnabled;
  },
  get emailOtpEnabled() {
    return mockFlags.emailOtpEnabled;
  },
  get phoneLinkingEnabled() {
    return mockFlags.phoneLinkingEnabled;
  },
  get passwordLoginEnabled() {
    return mockFlags.passwordLoginEnabled;
  },
  get anyOtpEnabled() {
    return mockFlags.phoneOtpEnabled || mockFlags.emailOtpEnabled;
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    appSession: null,
    authStatus: "unauthenticated",
    retryStorageBootstrap: vi.fn(),
    signInWithPassword: vi.fn(),
    signUpWithPassword: vi.fn(),
    requestEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    requestPhoneOtp: vi.fn(),
    verifyPhoneOtp: vi.fn(),
  }),
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

describe("Auth — Phone Feature Flag Behavior Matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Row 1: all flags false -> defaults to legacy password/email only, no WhatsApp controls", () => {
    mockFlags.phoneOtpEnabled = false;
    mockFlags.phoneRegistrationEnabled = false;
    mockFlags.phoneLinkingEnabled = false;

    renderAuth();

    expect(screen.getByTestId("password-form")).toBeInTheDocument();
    expect(screen.queryByTestId("submit-otp-identifier")).not.toBeInTheDocument();
    expect(screen.queryByTestId("method-otp")).not.toBeInTheDocument();
  });

  it("Row 2: phoneOtp=true, reg=false, link=false -> login-only phone OTP active", () => {
    mockFlags.phoneOtpEnabled = true;
    mockFlags.phoneRegistrationEnabled = false;
    mockFlags.phoneLinkingEnabled = false;

    renderAuth();

    expect(screen.getByRole("heading", { level: 1, name: "تسجيل الدخول" })).toBeInTheDocument();
    expect(screen.getByTestId("submit-otp-identifier")).toHaveTextContent("المتابعة عبر واتساب");
    // Tab list is present because registration via email might exist, but phone registration is disabled
    expect(screen.getByTestId("tab-login")).toBeInTheDocument();
  });

  it("Row 3: phoneOtp=true, reg=true, link=false -> unified phone entry screen active", () => {
    mockFlags.phoneOtpEnabled = true;
    mockFlags.phoneRegistrationEnabled = true;
    mockFlags.phoneLinkingEnabled = false;

    renderAuth();

    expect(screen.getByRole("heading", { level: 1, name: "أهلاً بك في ديلمارت" })).toBeInTheDocument();
    expect(screen.getByTestId("submit-otp-identifier")).toHaveTextContent("المتابعة عبر واتساب");
    expect(screen.queryByTestId("tab-login")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tab-register")).not.toBeInTheDocument();
  });

  it("Row 4: phoneOtp=false, reg=true -> invalid config; fails closed and phone registration remains unavailable", () => {
    mockFlags.phoneOtpEnabled = false;
    mockFlags.phoneRegistrationEnabled = true;
    mockFlags.phoneLinkingEnabled = false;

    renderAuth();

    // Since phone OTP is false, OTP flow cannot be mounted -> falls back to legacy password form
    expect(screen.getByTestId("password-form")).toBeInTheDocument();
    expect(screen.queryByTestId("submit-otp-identifier")).not.toBeInTheDocument();
  });

  it("Row 5: phoneOtp=false, reg=false, link=true -> legacy auth on /auth (linking is for authenticated users in Profile)", () => {
    mockFlags.phoneOtpEnabled = false;
    mockFlags.phoneRegistrationEnabled = false;
    mockFlags.phoneLinkingEnabled = true;

    renderAuth();

    expect(screen.getByTestId("password-form")).toBeInTheDocument();
    expect(screen.queryByTestId("submit-otp-identifier")).not.toBeInTheDocument();
  });

  it("Row 6: phoneOtp=true, reg=false, link=true -> login-only phone OTP on /auth, linking enabled for existing users", () => {
    mockFlags.phoneOtpEnabled = true;
    mockFlags.phoneRegistrationEnabled = false;
    mockFlags.phoneLinkingEnabled = true;

    renderAuth();

    expect(screen.getByRole("heading", { level: 1, name: "تسجيل الدخول" })).toBeInTheDocument();
    expect(screen.getByTestId("submit-otp-identifier")).toHaveTextContent("المتابعة عبر واتساب");
  });

  it("Row 7: phoneOtp=true, reg=true, link=true -> full production unified phone auth active", () => {
    mockFlags.phoneOtpEnabled = true;
    mockFlags.phoneRegistrationEnabled = true;
    mockFlags.phoneLinkingEnabled = true;

    renderAuth();

    expect(screen.getByRole("heading", { level: 1, name: "أهلاً بك في ديلمارت" })).toBeInTheDocument();
    expect(screen.getByTestId("submit-otp-identifier")).toHaveTextContent("المتابعة عبر واتساب");
  });
});
