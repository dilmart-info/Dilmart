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

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

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

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null, session: null }) }));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastInfo = vi.fn();
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError, info: toastInfo } }));

const ClaimAccount = (await import("./ClaimAccount")).default;
const { ApiError } = await import("@/lib/api-core");
const { WEAK_PASSWORD_MESSAGE_AR } = await import("@/lib/auth/password-errors");

const ARABIC_WEAK_PASSWORD = WEAK_PASSWORD_MESSAGE_AR;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/account/claim"]}>
      <ClaimAccount />
    </MemoryRouter>,
  );
}

/** Walks phone → OTP → password so the assertions run against the real password step. */
async function reachPasswordStep(container: HTMLElement) {
  const phoneInput = container.querySelector("input");
  fireEvent.change(phoneInput as HTMLElement, { target: { value: "07701234567" } });
  fireEvent.submit(container.querySelector("form") as HTMLElement);

  await waitFor(() => expect(verifyAccountClaimOtp).toBeDefined());
  const otpInput = await waitFor(() => {
    const input = container.querySelector("input");
    if (!input) throw new Error("no otp input");
    return input;
  });
  fireEvent.change(otpInput, { target: { value: "123456" } });
  fireEvent.submit(container.querySelector("form") as HTMLElement);

  await waitFor(() => expect(container.querySelectorAll("input").length).toBe(2));
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
    // Still two password inputs on screen: the step never advanced.
    expect(container.querySelectorAll("input").length).toBe(2);
    expect(toastSuccess.mock.calls.length).toBe(successesBefore);
  });

  // Page-level contract only: the action token is preserved and resubmitted unchanged. The backend
  // now accepts that retry immediately in both flows — a deterministic weak_password rejection proves
  // the password was never written, so the claim saga releases the reservation and resumes from its
  // account_merged checkpoint rather than holding the five-minute lease. The two-attempt proof lives
  // in backend/tests/account-claim-weak-password.test.mjs.
  it("preserves the action token and resubmits the corrected password", async () => {
    completeAccountClaim.mockRejectedValueOnce(
      new ApiError(ARABIC_WEAK_PASSWORD, 400, undefined, { code: "WEAK_PASSWORD" }),
    );
    const { container } = renderPage();
    await reachPasswordStep(container);
    submitPasswords(container, "password123");
    await waitFor(() => expect(toastError).toHaveBeenCalled());

    submitPasswords(container, "a-much-better-password");

    await waitFor(() => expect(completeAccountClaim).toHaveBeenCalledTimes(2));
    const [first, second] = completeAccountClaim.mock.calls;
    expect(second[0].action_token).toBe(first[0].action_token);
    expect(second[0].new_password).toBe("a-much-better-password");
    // The claim only reports success on the corrected attempt.
    await waitFor(() => expect(container.querySelectorAll("input").length).toBe(0));
  });

  it("falls back to the generic message for an unrelated failure", async () => {
    completeAccountClaim.mockRejectedValue(new ApiError("فشل غير متوقع", 500));
    const { container } = renderPage();
    await reachPasswordStep(container);
    const successesBefore = toastSuccess.mock.calls.length;
    submitPasswords(container, "password123");

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("فشل غير متوقع"));
    expect(toastSuccess.mock.calls.length).toBe(successesBefore);
  });

  it("does not treat an English message mentioning weak_password as a coded rejection", async () => {
    // No structured code: the page shows whatever the backend said, and applies no special copy.
    completeAccountClaim.mockRejectedValue(new ApiError("weak_password rejected upstream", 503));
    const { container } = renderPage();
    await reachPasswordStep(container);
    submitPasswords(container, "password123");

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("weak_password rejected upstream"));
    expect(toastError).not.toHaveBeenCalledWith(ARABIC_WEAK_PASSWORD);
  });
});
