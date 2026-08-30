import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

// All three channels on, so the tests can exercise the full surface. The flag defaults
// themselves are covered separately in auth-feature-flags.test.ts.
vi.mock("@/lib/auth/auth-feature-flags", () => ({
  emailOtpEnabled: true,
  phoneOtpEnabled: true,
  phoneRegistrationEnabled: true,
  passwordLoginEnabled: true,
  anyOtpEnabled: true,
}));

vi.mock("@/components/Header", () => ({ default: () => <div /> }));
vi.mock("@/components/Footer", () => ({ default: () => <div /> }));

const requestEmailOtp = vi.fn();
const verifyEmailOtp = vi.fn();
const requestPhoneOtp = vi.fn();
const verifyPhoneOtp = vi.fn();
const signInWithPassword = vi.fn();
const signUpWithPassword = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    requestEmailOtp,
    verifyEmailOtp,
    requestPhoneOtp,
    verifyPhoneOtp,
    signInWithPassword,
    signUpWithPassword,
  }),
}));

const getAuthContext = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: { getAuthContext: (...args: unknown[]) => getAuthContext(...args) },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

const Auth = (await import("./Auth")).default;

const SESSION = { access_token: "token", user: { id: "user-1" } };

function renderAuth(route = "/auth", state?: unknown) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: route, state }]}>
        <Auth />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Radix tab triggers activate on mouseDown, not click. */
function switchTab(testId: string) {
  const trigger = screen.getByTestId(testId);
  fireEvent.mouseDown(trigger);
  fireEvent.click(trigger);
}

function typeCode(code: string) {
  fireEvent.paste(screen.getByTestId("otp-digit-0"), {
    clipboardData: { getData: () => code },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requestEmailOtp.mockResolvedValue(undefined);
  requestPhoneOtp.mockResolvedValue(undefined);
  verifyEmailOtp.mockResolvedValue({ session: SESSION, user: SESSION.user });
  verifyPhoneOtp.mockResolvedValue({ session: SESSION, user: SESSION.user });
  getAuthContext.mockResolvedValue({ role: "customer" });
});

describe("login by OTP", () => {
  it("requests an email code without creating a user", async () => {
    renderAuth();
    fireEvent.click(screen.getByTestId("channel-email"));
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "name@example.com" } });
    fireEvent.submit(screen.getByTestId("otp-identifier-form"));

    await waitFor(() => expect(requestEmailOtp).toHaveBeenCalled());
    expect(requestEmailOtp).toHaveBeenCalledWith("name@example.com", {
      createUser: false,
      metadata: undefined,
    });
  });

  it("normalises the phone to E.164 before requesting", async () => {
    renderAuth();
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "07501234567" } });
    fireEvent.submit(screen.getByTestId("otp-identifier-form"));

    await waitFor(() => expect(requestPhoneOtp).toHaveBeenCalled());
    expect(requestPhoneOtp).toHaveBeenCalledWith("+9647501234567", {
      createUser: false,
      metadata: undefined,
    });
  });

  it("verifies, refreshes the auth context, and redirects to the original route", async () => {
    renderAuth("/auth", { from: { pathname: "/checkout" } });
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "07501234567" } });
    fireEvent.submit(screen.getByTestId("otp-identifier-form"));

    await screen.findByTestId("otp-code-form");
    typeCode("123456");
    fireEvent.submit(screen.getByTestId("otp-code-form"));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/checkout", { replace: true }));
    // The context is fetched for the new user before the redirect, so no unauthenticated
    // frame can render.
    expect(getAuthContext).toHaveBeenCalledWith("token");
  });

  it("offers the register path when a login request fails, without confirming the account exists", async () => {
    requestEmailOtp.mockRejectedValue(new Error("Signups not allowed for otp"));
    renderAuth();
    fireEvent.click(screen.getByTestId("channel-email"));
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "ghost@example.com" } });
    fireEvent.submit(screen.getByTestId("otp-identifier-form"));

    await screen.findByTestId("no-account-hint");
    expect(toastSuccess).not.toHaveBeenCalled();
    // Still on the identifier step — no code screen for a request that never went out.
    expect(screen.queryByTestId("otp-code-form")).toBeNull();
  });

  it("does not claim a code was sent when the request fails", async () => {
    requestPhoneOtp.mockRejectedValue(new Error("rate limited"));
    renderAuth();
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "07501234567" } });
    fireEvent.submit(screen.getByTestId("otp-identifier-form"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("surfaces a wrong code and stays on the code step", async () => {
    verifyPhoneOtp.mockRejectedValue(new Error("Token has expired or is invalid"));
    renderAuth();
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "07501234567" } });
    fireEvent.submit(screen.getByTestId("otp-identifier-form"));

    await screen.findByTestId("otp-code-form");
    typeCode("000000");
    fireEvent.submit(screen.getByTestId("otp-code-form"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByTestId("otp-code-form")).toBeTruthy();
  });
});

describe("registration by OTP", () => {
  it("asks Supabase to create the user and passes the full name", async () => {
    renderAuth();
    switchTab("tab-register");
    fireEvent.change(screen.getByTestId("full-name"), { target: { value: "زينب" } });
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "07501234567" } });
    fireEvent.submit(screen.getByTestId("otp-identifier-form"));

    await waitFor(() => expect(requestPhoneOtp).toHaveBeenCalled());
    expect(requestPhoneOtp).toHaveBeenCalledWith("+9647501234567", {
      createUser: true,
      metadata: { full_name: "زينب" },
    });
  });
});

describe("OTP input behaviour", () => {
  it("accepts a pasted six-digit code", async () => {
    renderAuth();
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "07501234567" } });
    fireEvent.submit(screen.getByTestId("otp-identifier-form"));

    await screen.findByTestId("otp-code-form");
    typeCode("987654");
    expect((screen.getByTestId("otp-digit-5") as HTMLInputElement).value).toBe("4");
  });

  it("starts a resend countdown and disables resend until it elapses", async () => {
    renderAuth();
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "07501234567" } });
    fireEvent.submit(screen.getByTestId("otp-identifier-form"));

    const resend = await screen.findByTestId("resend");
    expect((resend as HTMLButtonElement).disabled).toBe(true);
    expect(resend.textContent).toMatch(/إعادة الإرسال بعد/);
  });

  it("returns to the identifier step when the user changes it", async () => {
    renderAuth();
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "07501234567" } });
    fireEvent.submit(screen.getByTestId("otp-identifier-form"));

    await screen.findByTestId("otp-code-form");
    fireEvent.click(screen.getByTestId("change-identifier"));
    expect(screen.getByTestId("otp-identifier-form")).toBeTruthy();
  });

  it("does not submit twice while a request is in flight", async () => {
    let release: (() => void) | undefined;
    requestPhoneOtp.mockImplementation(
      () => new Promise<void>((resolve) => (release = () => resolve())),
    );

    renderAuth();
    fireEvent.change(screen.getByTestId("identifier"), { target: { value: "07501234567" } });
    fireEvent.submit(screen.getByTestId("otp-identifier-form"));
    fireEvent.submit(screen.getByTestId("otp-identifier-form"));
    fireEvent.submit(screen.getByTestId("otp-identifier-form"));

    release?.();
    await waitFor(() => expect(requestPhoneOtp).toHaveBeenCalledTimes(1));
  });
});

describe("method and tab switching", () => {
  it("switches between OTP and password without losing the page", () => {
    renderAuth();
    expect(screen.getByTestId("otp-identifier-form")).toBeTruthy();
    fireEvent.click(screen.getByTestId("toggle-method"));
    expect(screen.getByTestId("password-form")).toBeTruthy();
    fireEvent.click(screen.getByTestId("toggle-method"));
    expect(screen.getByTestId("otp-identifier-form")).toBeTruthy();
  });

  it("keeps password login working for existing users", async () => {
    signInWithPassword.mockResolvedValue({ session: SESSION, user: SESSION.user });
    renderAuth();
    fireEvent.click(screen.getByTestId("toggle-method"));
    fireEvent.change(screen.getByTestId("password-identifier"), {
      target: { value: "name@example.com" },
    });
    fireEvent.change(screen.getByTestId("password"), { target: { value: "secret123" } });
    fireEvent.submit(screen.getByTestId("password-form"));

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalled());
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "name@example.com",
      password: "secret123",
    });
  });

  it("sends the user to the dedicated reset page, not to claim-account", () => {
    renderAuth();
    fireEvent.click(screen.getByTestId("forgot-password"));
    expect(navigate).toHaveBeenCalledWith("/forgot-password");
    expect(navigate).not.toHaveBeenCalledWith("/claim-account");
  });

  it("still offers the separate account claim entry", () => {
    renderAuth();
    fireEvent.click(screen.getByTestId("claim-account"));
    expect(navigate).toHaveBeenCalledWith("/claim-account");
  });
});
