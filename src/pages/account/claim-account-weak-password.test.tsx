/**
 * Account claim UI: weak-password rejection.
 *
 * DilMart-STORE-WEAK-PASSWORD-UX-001
 *
 * The backend returns a structured `WEAK_PASSWORD` code. The page must branch on that code — never
 * on message text — keep the user on the password step with the action token intact, and never
 * report the claim as successful.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

vi.mock("@/components/Header", () => ({ default: () => <div /> }));
vi.mock("@/components/Footer", () => ({ default: () => <div /> }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => <div /> }));

const requestAccountClaim = vi.fn();
const verifyAccountClaimOtp = vi.fn();
const completeAccountClaim = vi.fn();
vi.mock("@/lib/api/customer", () => ({
  customerApi: {
    requestAccountClaim: (...args: unknown[]) => requestAccountClaim(...args),
    verifyAccountClaimOtp: (...args: unknown[]) => verifyAccountClaimOtp(...args),
    completeAccountClaim: (...args: unknown[]) => completeAccountClaim(...args),
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "prov-1" },
    session: null,
    authStatus: "authenticated_ready",
    profile: { account_type: "provisional_customer", claim_required: true },
    refetch: vi.fn(),
    logoutCurrentDevice: vi.fn(),
  }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastInfo = vi.fn();
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError, info: toastInfo } }));

const ClaimAccount = (await import("./ClaimAccount")).default;
const { ApiError } = await import("@/lib/api-core");
const { WEAK_PASSWORD_MESSAGE_AR } = await import("@/lib/auth/password-errors");

const ARABIC_WEAK_PASSWORD = WEAK_PASSWORD_MESSAGE_AR;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/account/claim"]}>
        <ClaimAccount />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Walks phone → OTP → password so the assertions run against the real password step. */
async function reachPasswordStep(container: HTMLElement) {
  const phoneInput = container.querySelector("#claimPhone") || container.querySelector("input");
  if (!phoneInput) throw new Error("no phone input");
  fireEvent.change(phoneInput, { target: { value: "07701234567" } });
  fireEvent.submit(container.querySelector("form") as HTMLElement);

  await waitFor(() => expect(verifyAccountClaimOtp).toBeDefined());
  const otpInput = await waitFor(() => {
    const input = screen.queryByTestId("otp-digit-0");
    if (!input) throw new Error("no otp input");
    return input;
  });
  fireEvent.paste(otpInput, { clipboardData: { getData: () => "123456" } });
  fireEvent.submit(container.querySelector("form") as HTMLElement);

  await waitFor(() => expect(container.querySelectorAll("input[type='password'], input[type='text']").length).toBeGreaterThanOrEqual(2));
}

function submitPasswords(container: HTMLElement, value: string) {
  const inputs = container.querySelectorAll("input");
  fireEvent.change(inputs[0] as HTMLElement, { target: { value } });
  fireEvent.change(inputs[1] as HTMLElement, { target: { value } });
  fireEvent.submit(container.querySelector("form") as HTMLElement);
}

beforeEach(() => {
  vi.clearAllMocks();
  requestAccountClaim.mockResolvedValue({ success: true, challenge_id: "challenge-1" });
  verifyAccountClaimOtp.mockResolvedValue({ success: true, action_token: "action-token-1" });
  completeAccountClaim.mockResolvedValue({ success: true, message: "تم" });
});

describe("claim account weak password", () => {
  it("shows the Arabic message and stays on the password step", async () => {
    completeAccountClaim.mockRejectedValue(
      new ApiError(ARABIC_WEAK_PASSWORD, 400, undefined, { code: "WEAK_PASSWORD" }),
    );
    const { container } = renderPage();
    await reachPasswordStep(container);
    // The earlier steps already toasted ("code sent", "phone verified"); only growth matters here.
    const successesBefore = toastSuccess.mock.calls.length;
    submitPasswords(container, "password123");

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(ARABIC_WEAK_PASSWORD));
    expect(toastSuccess.mock.calls.length).toBe(successesBefore);
  });

  // Page-level contract only: the action token is preserved and resubmitted unchanged.
  it("preserves the action token and resubmits the corrected password", async () => {
    completeAccountClaim.mockRejectedValueOnce(
      new ApiError(ARABIC_WEAK_PASSWORD, 400, undefined, { code: "WEAK_PASSWORD" }),
    );
    const { container } = renderPage();
    await reachPasswordStep(container);
    submitPasswords(container, "password123");
    await waitFor(() => expect(toastError).toHaveBeenCalled());

    submitPasswords(container, "a-much-better-password");

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("تم"));
    expect(completeAccountClaim).toHaveBeenCalledTimes(2);
    expect(completeAccountClaim).toHaveBeenLastCalledWith({
      action_token: "action-token-1",
      new_password: "a-much-better-password",
    });
  });

  it("falls back to the generic message for an unrelated failure", async () => {
    completeAccountClaim.mockRejectedValue(new Error("network error"));
    const { container } = renderPage();
    await reachPasswordStep(container);
    submitPasswords(container, "password123");

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("network error"));
  });

  it("does not treat an English message mentioning weak_password as a coded rejection", async () => {
    // Un-coded error whose message happens to mention weak_password in English: must NOT branch.
    completeAccountClaim.mockRejectedValue(new Error("weak_password detected by upstream"));
    const { container } = renderPage();
    await reachPasswordStep(container);
    submitPasswords(container, "password123");

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("weak_password detected by upstream"));
    expect(toastError).not.toHaveBeenCalledWith(ARABIC_WEAK_PASSWORD);
  });
});
