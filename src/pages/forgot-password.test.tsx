import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("@/lib/auth/auth-feature-flags", () => ({
  emailOtpEnabled: true,
  phoneOtpEnabled: true,
  phoneRegistrationEnabled: false,
  passwordLoginEnabled: true,
  anyOtpEnabled: true,
}));

vi.mock("@/components/Header", () => ({ default: () => <div /> }));
vi.mock("@/components/Footer", () => ({ default: () => <div /> }));

const requestEmailPasswordRecovery = vi.fn();
const verifyEmailRecoveryOtp = vi.fn();
const requestPhoneOtp = vi.fn();
const verifyPhoneOtp = vi.fn();
const updatePasswordInSession = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    requestEmailPasswordRecovery,
    verifyEmailRecoveryOtp,
    requestPhoneOtp,
    verifyPhoneOtp,
    updatePasswordInSession,
  }),
}));

const getAuthContext = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: { getAuthContext: (...args: unknown[]) => getAuthContext(...args) },
}));

// The legacy backend reset endpoints must not be reachable from this page.
const legacyRequestPasswordReset = vi.fn();
const legacyVerifyPasswordResetOtp = vi.fn();
const legacyCompletePasswordReset = vi.fn();
vi.mock("@/lib/api/customer", () => ({
  customerApi: {
    requestPasswordReset: legacyRequestPasswordReset,
    verifyPasswordResetOtp: legacyVerifyPasswordResetOtp,
    completePasswordReset: legacyCompletePasswordReset,
  },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

const ForgotPassword = (await import("./ForgotPassword")).default;
const { WeakPasswordError, WEAK_PASSWORD_PWNED_MESSAGE_AR } = await import("@/lib/auth/password-errors");

const SESSION = { access_token: "token", user: { id: "user-1" } };

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/forgot-password"]}>
        <ForgotPassword />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function typeCode(code: string) {
  fireEvent.paste(screen.getByTestId("otp-digit-0"), { clipboardData: { getData: () => code } });
}

async function completeReset() {
  await screen.findByTestId("reset-password-form");
  fireEvent.change(screen.getByTestId("new-password"), { target: { value: "newsecret" } });
  fireEvent.change(screen.getByTestId("confirm-password"), { target: { value: "newsecret" } });
  fireEvent.submit(screen.getByTestId("reset-password-form"));
}

beforeEach(() => {
  vi.clearAllMocks();
  requestEmailPasswordRecovery.mockResolvedValue(undefined);
  requestPhoneOtp.mockResolvedValue(undefined);
  verifyEmailRecoveryOtp.mockResolvedValue({ session: SESSION, user: SESSION.user });
  verifyPhoneOtp.mockResolvedValue({ session: SESSION, user: SESSION.user });
  updatePasswordInSession.mockResolvedValue(undefined);
  getAuthContext.mockResolvedValue({ role: "customer" });
});

describe("email recovery", () => {
  it("uses the Supabase recovery mail and recovery verification", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("reset-channel-email"));
    fireEvent.change(screen.getByTestId("reset-identifier"), {
      target: { value: "name@example.com" },
    });
    fireEvent.submit(screen.getByTestId("reset-identifier-form"));

    await waitFor(() => expect(requestEmailPasswordRecovery).toHaveBeenCalledWith("name@example.com"));

    await screen.findByTestId("reset-code-form");
    typeCode("123456");
    fireEvent.submit(screen.getByTestId("reset-code-form"));

    await waitFor(() => expect(verifyEmailRecoveryOtp).toHaveBeenCalledWith("name@example.com", "123456"));
  });

  it("changes the password inside the verified session", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("reset-channel-email"));
    fireEvent.change(screen.getByTestId("reset-identifier"), {
      target: { value: "name@example.com" },
    });
    fireEvent.submit(screen.getByTestId("reset-identifier-form"));
    await screen.findByTestId("reset-code-form");
    typeCode("123456");
    fireEvent.submit(screen.getByTestId("reset-code-form"));

    await completeReset();
    await waitFor(() => expect(updatePasswordInSession).toHaveBeenCalledWith("newsecret"));
    await screen.findByTestId("reset-done");
  });
});

describe("phone authenticated password reset", () => {
  it("is an ordinary phone OTP login that never creates an account", async () => {
    renderPage();
    fireEvent.change(screen.getByTestId("reset-identifier"), { target: { value: "07501234567" } });
    fireEvent.submit(screen.getByTestId("reset-identifier-form"));

    await waitFor(() => expect(requestPhoneOtp).toHaveBeenCalled());
    expect(requestPhoneOtp).toHaveBeenCalledWith("+9647501234567", { createUser: false });
  });

  it("verifies with the sms type, not a recovery token", async () => {
    renderPage();
    fireEvent.change(screen.getByTestId("reset-identifier"), { target: { value: "07501234567" } });
    fireEvent.submit(screen.getByTestId("reset-identifier-form"));

    await screen.findByTestId("reset-code-form");
    typeCode("123456");
    fireEvent.submit(screen.getByTestId("reset-code-form"));

    await waitFor(() => expect(verifyPhoneOtp).toHaveBeenCalledWith("+9647501234567", "123456"));
    expect(verifyEmailRecoveryOtp).not.toHaveBeenCalled();
  });
});

describe("validation and failures", () => {
  it("rejects a reused or expired code and stays on the code step", async () => {
    verifyPhoneOtp.mockRejectedValue(new Error("Token has expired or is invalid"));
    renderPage();
    fireEvent.change(screen.getByTestId("reset-identifier"), { target: { value: "07501234567" } });
    fireEvent.submit(screen.getByTestId("reset-identifier-form"));

    await screen.findByTestId("reset-code-form");
    typeCode("000000");
    fireEvent.submit(screen.getByTestId("reset-code-form"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.getByTestId("reset-code-form")).toBeTruthy();
    expect(updatePasswordInSession).not.toHaveBeenCalled();
  });

  it("refuses mismatched passwords", async () => {
    renderPage();
    fireEvent.change(screen.getByTestId("reset-identifier"), { target: { value: "07501234567" } });
    fireEvent.submit(screen.getByTestId("reset-identifier-form"));
    await screen.findByTestId("reset-code-form");
    typeCode("123456");
    fireEvent.submit(screen.getByTestId("reset-code-form"));

    await screen.findByTestId("reset-password-form");
    fireEvent.change(screen.getByTestId("new-password"), { target: { value: "newsecret" } });
    fireEvent.change(screen.getByTestId("confirm-password"), { target: { value: "different" } });
    fireEvent.submit(screen.getByTestId("reset-password-form"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(updatePasswordInSession).not.toHaveBeenCalled();
  });

  it("does not claim a code was sent when the request failed", async () => {
    requestPhoneOtp.mockRejectedValue(new Error("rate limited"));
    renderPage();
    fireEvent.change(screen.getByTestId("reset-identifier"), { target: { value: "07501234567" } });
    fireEvent.submit(screen.getByTestId("reset-identifier-form"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe("weak password rejection", () => {
  // DilMart-STORE-WEAK-PASSWORD-UX-001. Once HIBP is enabled this becomes a routine outcome, and
  // the user must be able to correct the password on the spot rather than request a new code.
  async function reachPasswordStep() {
    renderPage();
    fireEvent.change(screen.getByTestId("reset-identifier"), { target: { value: "07501234567" } });
    fireEvent.submit(screen.getByTestId("reset-identifier-form"));
    await screen.findByTestId("reset-code-form");
    typeCode("123456");
    fireEvent.submit(screen.getByTestId("reset-code-form"));
    await screen.findByTestId("reset-password-form");
  }

  function submitPassword(value: string) {
    fireEvent.change(screen.getByTestId("new-password"), { target: { value } });
    fireEvent.change(screen.getByTestId("confirm-password"), { target: { value } });
    fireEvent.submit(screen.getByTestId("reset-password-form"));
  }

  it("stays on the password form and shows the localized message", async () => {
    updatePasswordInSession.mockRejectedValue(new WeakPasswordError(["pwned"]));
    await reachPasswordStep();
    submitPassword("password123");

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(WEAK_PASSWORD_PWNED_MESSAGE_AR));
    expect(screen.getByTestId("reset-password-form")).toBeTruthy();
    // The "code sent" toast fired earlier in the flow; what must NOT appear is a password success.
    expect(toastSuccess).not.toHaveBeenCalledWith("تم تحديث كلمة المرور بنجاح");
  });

  it("does not enter the done state", async () => {
    updatePasswordInSession.mockRejectedValue(new WeakPasswordError(["pwned"]));
    await reachPasswordStep();
    submitPassword("password123");

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.queryByTestId("reset-done")).toBeNull();
    expect(screen.getByTestId("reset-password-form")).toBeTruthy();
  });

  it("accepts a corrected second password without a new code", async () => {
    updatePasswordInSession.mockRejectedValueOnce(new WeakPasswordError(["pwned"]));
    await reachPasswordStep();
    submitPassword("password123");
    await waitFor(() => expect(toastError).toHaveBeenCalled());

    // No new OTP was requested; the verified session is reused for the retry.
    const otpRequestsBefore = requestPhoneOtp.mock.calls.length;
    updatePasswordInSession.mockResolvedValueOnce(undefined);
    submitPassword("a-much-better-password");

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("تم تحديث كلمة المرور بنجاح"));
    expect(updatePasswordInSession).toHaveBeenCalledTimes(2);
    expect(updatePasswordInSession).toHaveBeenLastCalledWith("a-much-better-password");
    expect(requestPhoneOtp.mock.calls.length).toBe(otpRequestsBefore);
  });
});

describe("legacy endpoints", () => {
  it("never calls the deprecated backend password-reset API", async () => {
    renderPage();
    fireEvent.change(screen.getByTestId("reset-identifier"), { target: { value: "07501234567" } });
    fireEvent.submit(screen.getByTestId("reset-identifier-form"));
    await screen.findByTestId("reset-code-form");
    typeCode("123456");
    fireEvent.submit(screen.getByTestId("reset-code-form"));
    await completeReset();

    expect(legacyRequestPasswordReset).not.toHaveBeenCalled();
    expect(legacyVerifyPasswordResetOtp).not.toHaveBeenCalled();
    expect(legacyCompletePasswordReset).not.toHaveBeenCalled();
  });
});
