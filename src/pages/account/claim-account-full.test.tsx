import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ClaimAccount from "./ClaimAccount";
import { ApiError } from "@/lib/api-core";
import { WEAK_PASSWORD_MESSAGE_AR } from "@/lib/auth/password-errors";

const {
  navigate,
  mockSearchParams,
  recoverClaimByOrder,
  requestAccountClaim,
  verifyAccountClaimOtp,
  completeAccountClaim,
  toastSuccess,
  toastError,
  toastInfo,
  mockAuthState,
} = vi.hoisted(() => ({
  navigate: vi.fn(),
  mockSearchParams: new URLSearchParams(),
  recoverClaimByOrder: vi.fn(),
  requestAccountClaim: vi.fn(),
  verifyAccountClaimOtp: vi.fn(),
  completeAccountClaim: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  mockAuthState: {
    user: null as { id: string } | null,
    authStatus: "unauthenticated",
    profile: null as { account_type?: string; claim_required?: boolean; phone?: string } | null,
    refetch: vi.fn(),
    logoutCurrentDevice: vi.fn(),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
    useSearchParams: () => [mockSearchParams, vi.fn()],
  };
});

vi.mock("@/components/Header", () => ({ default: () => <div data-testid="header" /> }));
vi.mock("@/components/Footer", () => ({ default: () => <div data-testid="footer" /> }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => <div data-testid="whatsapp-btn" /> }));

vi.mock("@/lib/api/customer", () => ({
  customerApi: {
    recoverClaimByOrder: (...args: unknown[]) => recoverClaimByOrder(...args),
    requestAccountClaim: (...args: unknown[]) => requestAccountClaim(...args),
    verifyAccountClaimOtp: (...args: unknown[]) => verifyAccountClaimOtp(...args),
    completeAccountClaim: (...args: unknown[]) => completeAccountClaim(...args),
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockAuthState,
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError, info: toastInfo },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/claim-account"]}>
        <ClaimAccount />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ClaimAccount — Guest & Provisional Flows & Invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.user = null;
    mockAuthState.authStatus = "unauthenticated";
    mockAuthState.profile = null;
    mockAuthState.refetch = vi.fn().mockResolvedValue({});
    mockAuthState.logoutCurrentDevice = vi.fn().mockResolvedValue(undefined);

    recoverClaimByOrder.mockResolvedValue({ request_id: "opaque-req-123", message: "ok" });
    requestAccountClaim.mockResolvedValue({ challenge_id: "challenge-456", resend_after: 60 });
    verifyAccountClaimOtp.mockResolvedValue({ success: true, action_token: "action-token-xyz" });
    completeAccountClaim.mockResolvedValue({
      success: true,
      merged: false,
      user_id: "u-1",
      message: "تم استلام الحساب بنجاح",
    });
  });

  it("GUEST FLOW: shows both Order Number and Phone fields, rejects empty order number, calls recoverClaimByOrder", async () => {
    renderPage();

    // Order number input MUST be present and visible for guest
    const orderInput = screen.getByLabelText(/رقم الطلب/i);
    const phoneInput = screen.getByLabelText(/رقم الهاتف/i);
    expect(orderInput).toBeTruthy();
    expect(phoneInput).toBeTruthy();

    // Try submitting with only phone
    fireEvent.change(phoneInput, { target: { value: "07701234567" } });
    fireEvent.submit(screen.getByRole("button", { name: /إرسال رمز التوثيق/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("يرجى إدخال رقم الطلب المرتبط بحسابك");
    });
    expect(recoverClaimByOrder).not.toHaveBeenCalled();
    expect(requestAccountClaim).not.toHaveBeenCalled();

    // Now fill order number and submit
    fireEvent.change(orderInput, { target: { value: "DUK-998877" } });
    fireEvent.submit(screen.getByRole("button", { name: /إرسال رمز التوثيق/i }));

    await waitFor(() => {
      expect(recoverClaimByOrder).toHaveBeenCalledWith("DUK-998877", "07701234567");
    });
    expect(requestAccountClaim).not.toHaveBeenCalled();
    // Neutral anti-enumeration wording
    expect(toastInfo).toHaveBeenCalledWith("إذا كانت البيانات صحيحة، فقد تم إرسال رمز التحقق.");
  });

  it("GUEST FLOW: rejects invalid Iraqi phone client-side before dispatching network request", async () => {
    renderPage();

    const orderInput = screen.getByLabelText(/رقم الطلب/i);
    const phoneInput = screen.getByLabelText(/رقم الهاتف/i);

    fireEvent.change(orderInput, { target: { value: "DUK-123456" } });
    fireEvent.change(phoneInput, { target: { value: "12345" } }); // Invalid phone
    fireEvent.submit(screen.getByRole("button", { name: /إرسال رمز التوثيق/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("يرجى إدخال رقم هاتف عراقي صحيح");
    });
    expect(recoverClaimByOrder).not.toHaveBeenCalled();
  });

  it("PROVISIONAL FLOW: allows claiming without order number using requestAccountClaim", async () => {
    mockAuthState.user = { id: "provisional-uid-1" };
    mockAuthState.authStatus = "authenticated_ready";
    mockAuthState.profile = {
      account_type: "provisional_customer",
      claim_required: true,
      phone: "07701234567",
    };

    renderPage();

    // For provisional user with no orderNumber param, order number is optional
    const phoneInput = screen.getByLabelText(/رقم الهاتف/i);
    expect(phoneInput).toBeTruthy();

    fireEvent.submit(screen.getByRole("button", { name: /إرسال رمز التوثيق/i }));

    await waitFor(() => {
      expect(requestAccountClaim).toHaveBeenCalledWith("07701234567");
    });
    expect(recoverClaimByOrder).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith("أرسلنا رمز التوثيق إلى واتساب");
  });

  it("OTP & PASSWORD STEP: verifies OTP with challengeId and handles WEAK_PASSWORD by preserving token", async () => {
    mockAuthState.user = { id: "provisional-uid-1" };
    mockAuthState.authStatus = "authenticated_ready";
    mockAuthState.profile = {
      account_type: "provisional_customer",
      claim_required: true,
      phone: "07701234567",
    };

    renderPage();
    fireEvent.submit(screen.getByRole("button", { name: /إرسال رمز التوثيق/i }));

    // Step moves to OTP
    await waitFor(() => {
      expect(screen.getByTestId("otp-digit-0")).toBeTruthy();
    });

    // Paste 6-digit OTP
    fireEvent.paste(screen.getByTestId("otp-digit-0"), {
      clipboardData: { getData: () => "654321" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /تأكيد الرمز والمتابعة/i }));

    await waitFor(() => {
      expect(verifyAccountClaimOtp).toHaveBeenCalledWith("challenge-456", "654321");
    });
    expect(toastSuccess).toHaveBeenCalledWith("تم إثبات ملكية الرقم بنجاح");

    // Step moves to Password Entry
    const newPasswordInput = await screen.findByLabelText(/كلمة المرور الجديدة/i);
    const confirmPasswordInput = screen.getByLabelText(/تأكيد كلمة المرور/i);

    // 1st attempt: weak password returns WEAK_PASSWORD
    completeAccountClaim.mockRejectedValueOnce(
      new ApiError(WEAK_PASSWORD_MESSAGE_AR, 400, undefined, { code: "WEAK_PASSWORD" })
    );

    fireEvent.change(newPasswordInput, { target: { value: "pass12" } });
    fireEvent.change(confirmPasswordInput, { target: { value: "pass12" } });
    fireEvent.submit(screen.getByRole("button", { name: /حفظ الحساب وتأكيده/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(WEAK_PASSWORD_MESSAGE_AR);
    });

    // Stays on password form with same actionToken
    expect(screen.getByLabelText(/كلمة المرور الجديدة/i)).toBeTruthy();

    // 2nd attempt: strong password succeeds
    completeAccountClaim.mockResolvedValueOnce({
      success: true,
      merged: false,
      user_id: "provisional-uid-1",
      message: "تم استلام حسابك وتعيين كلمة المرور بنجاح",
    });

    fireEvent.change(newPasswordInput, { target: { value: "StrongPass99!" } });
    fireEvent.change(confirmPasswordInput, { target: { value: "StrongPass99!" } });
    fireEvent.submit(screen.getByRole("button", { name: /حفظ الحساب وتأكيده/i }));

    await waitFor(() => {
      expect(completeAccountClaim).toHaveBeenCalledTimes(2);
      expect(completeAccountClaim).toHaveBeenLastCalledWith({
        action_token: "action-token-xyz",
        new_password: "StrongPass99!",
      });
    });
  });

  it("OUTCOME merged === false (UPGRADE IN PLACE): calls refetch() and navigates to /profile", async () => {
    mockAuthState.user = { id: "provisional-uid-1" };
    mockAuthState.authStatus = "authenticated_ready";
    mockAuthState.profile = {
      account_type: "provisional_customer",
      claim_required: true,
      phone: "07701234567",
    };

    renderPage();
    fireEvent.submit(screen.getByRole("button", { name: /إرسال رمز التوثيق/i }));

    await waitFor(() => expect(screen.getByTestId("otp-digit-0")).toBeTruthy());
    fireEvent.paste(screen.getByTestId("otp-digit-0"), {
      clipboardData: { getData: () => "123456" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /تأكيد الرمز والمتابعة/i }));

    const newPasswordInput = await screen.findByLabelText(/كلمة المرور الجديدة/i);
    const confirmPasswordInput = screen.getByLabelText(/تأكيد كلمة المرور/i);

    completeAccountClaim.mockResolvedValueOnce({
      success: true,
      merged: false,
      user_id: "provisional-uid-1",
      message: "تم استلام حسابك وتعيين كلمة المرور بنجاح",
    });

    fireEvent.change(newPasswordInput, { target: { value: "ValidPassword123" } });
    fireEvent.change(confirmPasswordInput, { target: { value: "ValidPassword123" } });
    fireEvent.submit(screen.getByRole("button", { name: /حفظ الحساب وتأكيده/i }));

    await waitFor(() => {
      expect(mockAuthState.refetch).toHaveBeenCalled();
    });
    expect(mockAuthState.logoutCurrentDevice).not.toHaveBeenCalled();

    // Shows upgraded success UI with button to /profile
    const profileBtn = await screen.findByRole("button", { name: /الانتقال إلى حسابي/i });
    expect(profileBtn).toBeTruthy();
    fireEvent.click(profileBtn);
    expect(navigate).toHaveBeenCalledWith("/profile", { replace: true });
  });

  it("OUTCOME merged === true (MERGED TO TARGET ACCOUNT): ends provisional session safely with logoutCurrentDevice() and prompts login at /auth", async () => {
    mockAuthState.user = { id: "provisional-uid-1" };
    mockAuthState.authStatus = "authenticated_ready";
    mockAuthState.profile = {
      account_type: "provisional_customer",
      claim_required: true,
      phone: "07701234567",
    };

    renderPage();
    fireEvent.submit(screen.getByRole("button", { name: /إرسال رمز التوثيق/i }));

    await waitFor(() => expect(screen.getByTestId("otp-digit-0")).toBeTruthy());
    fireEvent.paste(screen.getByTestId("otp-digit-0"), {
      clipboardData: { getData: () => "123456" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /تأكيد الرمز والمتابعة/i }));

    const newPasswordInput = await screen.findByLabelText(/كلمة المرور الجديدة/i);
    const confirmPasswordInput = screen.getByLabelText(/تأكيد كلمة المرور/i);

    completeAccountClaim.mockResolvedValueOnce({
      success: true,
      merged: true,
      user_id: "permanent-target-uid-999",
      message: "تم دمج حسابك بنجاح",
    });

    fireEvent.change(newPasswordInput, { target: { value: "ValidPassword123" } });
    fireEvent.change(confirmPasswordInput, { target: { value: "ValidPassword123" } });
    fireEvent.submit(screen.getByRole("button", { name: /حفظ الحساب وتأكيده/i }));

    await waitFor(() => {
      expect(mockAuthState.logoutCurrentDevice).toHaveBeenCalled();
    });

    // Shows merged success UI with button directing user to sign in
    const loginBtn = await screen.findByRole("button", { name: /تسجيل الدخول إلى حسابك/i });
    expect(loginBtn).toBeTruthy();
    fireEvent.click(loginBtn);
    expect(navigate).toHaveBeenCalledWith("/auth", { replace: true });
  });
});
