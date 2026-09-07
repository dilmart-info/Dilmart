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

let mockPhoneRegistration = true;

vi.mock("@/lib/auth/auth-feature-flags", () => ({
  get phoneOtpEnabled() {
    return true;
  },
  get phoneRegistrationEnabled() {
    return mockPhoneRegistration;
  },
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

describe("Auth — Phone Registration & Unified Entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders unified entry screen and sends shouldCreateUser: true when registration is enabled", async () => {
    mockPhoneRegistration = true;
    requestPhoneOtp.mockResolvedValue(undefined);

    renderAuth();

    // In unified phone mode, title is "أهلاً بك في ديلمارت" and there are no login/register tabs
    expect(screen.getByRole("heading", { level: 1, name: "أهلاً بك في ديلمارت" })).toBeInTheDocument();
    expect(screen.queryByTestId("tab-login")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tab-register")).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText("07XXXXXXXXX");
    fireEvent.change(input, { target: { value: "07801234567" } });

    const submitBtn = screen.getByTestId("submit-otp-identifier");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(requestPhoneOtp).toHaveBeenCalledTimes(1);
      expect(requestPhoneOtp).toHaveBeenCalledWith("+9647801234567", { createUser: true });
    });
  });

  it("sends shouldCreateUser: false when phone registration is disabled and never auto-retries with true", async () => {
    mockPhoneRegistration = false;
    requestPhoneOtp.mockRejectedValue(new Error("User not found"));

    renderAuth();

    const input = screen.getByPlaceholderText("07XXXXXXXXX");
    fireEvent.change(input, { target: { value: "07801234567" } });

    const submitBtn = screen.getByTestId("submit-otp-identifier");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(requestPhoneOtp).toHaveBeenCalledTimes(1);
      expect(requestPhoneOtp).toHaveBeenCalledWith("+9647801234567", { createUser: false });
    });

    // Verify it did NOT auto-retry with createUser: true
    expect(requestPhoneOtp).toHaveBeenCalledTimes(1);
  });
});
