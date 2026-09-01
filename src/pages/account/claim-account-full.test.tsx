import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ClaimAccount from "./ClaimAccount";

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
    appSession: null as { access_token: string } | null,
    user: null as { id: string } | null,
    authStatus: "unauthenticated",
    retryStorageBootstrap: vi.fn(),
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

describe("ClaimAccount — Guest, Provisional, Offline & Post-Claim Finalization Invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.appSession = null;
    mockAuthState.user = null;
    mockAuthState.authStatus = "unauthenticated";
    mockAuthState.profile = null;
    mockAuthState.retryStorageBootstrap = vi.fn();
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

  it("STORAGE ERROR: renders AuthStorageErrorScreen and never renders claim form", () => {
    mockAuthState.authStatus = "storage_error";
    renderPage();

    expect(screen.getByText(/تعذّر الوصول إلى التخزين الآمن/i)).toBeTruthy();
    expect(screen.queryByTestId("order-number")).toBeNull();
  });

  it("AUTHENTICATED OFFLINE: renders non-destructive offline notice and is NOT classified as Guest", () => {
    mockAuthState.appSession = { access_token: "tok" };
    mockAuthState.user = { id: "offline-user-1" };
    mockAuthState.authStatus = "authenticated_offline";
    renderPage();

    expect(screen.getByText("يلزم اتصال بالإنترنت لاستلام الحساب.")).toBeTruthy();
    expect(screen.queryByTestId("order-number")).toBeNull();
    expect(screen.queryByTestId("claim-phone")).toBeNull();
  });

  it("GUEST FLOW: shows both Order Number and Phone fields, rejects empty order number, calls recoverClaimByOrder", async () => {
    renderPage();

    const orderInput = screen.getByLabelText(/رقم الطلب/i);
    const phoneInput = screen.getByLabelText(/رقم الهاتف/i);
    expect(orderInput).toBeTruthy();
    expect(phoneInput).toBeTruthy();

    fireEvent.change(phoneInput, { target: { value: "07701234567" } });
    fireEvent.submit(screen.getByRole("button", { name: /إرسال رمز التوثيق/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("يرجى إدخال رقم الطلب المرتبط بحسابك");
    });
    expect(recoverClaimByOrder).not.toHaveBeenCalled();
    expect(requestAccountClaim).not.toHaveBeenCalled();

    fireEvent.change(orderInput, { target: { value: "DUK-998877" } });
    fireEvent.submit(screen.getByRole("button", { name: /إرسال رمز التوثيق/i }));

    await waitFor(() => {
      expect(recoverClaimByOrder).toHaveBeenCalledWith("DUK-998877", "07701234567");
    });
    expect(requestAccountClaim).not.toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalledWith("إذا كانت البيانات صحيحة، فقد تم إرسال رمز التحقق.");
  });

  it("PROVISIONAL FLOW: allows claiming without order number using requestAccountClaim", async () => {
    mockAuthState.appSession = { access_token: "provisional-token" };
    mockAuthState.user = { id: "provisional-uid-1" };
    mockAuthState.authStatus = "authenticated_ready";
    mockAuthState.profile = {
      account_type: "provisional_customer",
      claim_required: true,
      phone: "07701234567",
    };

    renderPage();

    const phoneInput = screen.getByLabelText(/رقم الهاتف/i);
    expect(phoneInput).toBeTruthy();
    expect(screen.queryByLabelText(/رقم الطلب/i)).toBeNull();

    fireEvent.submit(screen.getByRole("button", { name: /إرسال رمز التوثيق/i }));

    await waitFor(() => {
      expect(requestAccountClaim).toHaveBeenCalledWith("07701234567");
    });
    expect(recoverClaimByOrder).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith("أرسلنا رمز التوثيق إلى واتساب");
  });

  it("POST-CLAIM: merged === true with logout failure DOES NOT claim success, shows retry button which retries ONLY logout", async () => {
    mockAuthState.appSession = { access_token: "provisional-token" };
    mockAuthState.user = { id: "provisional-uid-1" };
    mockAuthState.authStatus = "authenticated_ready";
    mockAuthState.profile = { account_type: "provisional_customer", claim_required: true, phone: "07701234567" };
    mockAuthState.logoutCurrentDevice = vi.fn().mockRejectedValueOnce(new Error("SecureStorage clear failed"));

    renderPage();
    fireEvent.submit(screen.getByRole("button", { name: /إرسال رمز التوثيق/i }));

    await waitFor(() => expect(screen.getByTestId("otp-digit-0")).toBeTruthy());
    fireEvent.paste(screen.getByTestId("otp-digit-0"), { clipboardData: { getData: () => "123456" } });
    fireEvent.submit(screen.getByRole("button", { name: /تأكيد الرمز والمتابعة/i }));

    const newPasswordInput = await screen.findByLabelText(/كلمة المرور الجديدة/i);
    const confirmPasswordInput = screen.getByLabelText(/تأكيد كلمة المرور/i);

    completeAccountClaim.mockResolvedValueOnce({
      success: true,
      merged: true,
      user_id: "permanent-uid-888",
      message: "تم دمج حسابك بنجاح",
    });

    fireEvent.change(newPasswordInput, { target: { value: "ValidPass123" } });
    fireEvent.change(confirmPasswordInput, { target: { value: "ValidPass123" } });
    fireEvent.submit(screen.getByRole("button", { name: /حفظ الحساب وتأكيده/i }));

    await waitFor(() => {
      expect(completeAccountClaim).toHaveBeenCalledTimes(1);
    });

    // Error notice shown
    const errorNotices = await screen.findAllByText("تم دمج الحساب، لكن تعذر إنهاء الجلسة الحالية بأمان.");
    expect(errorNotices.length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /تسجيل الدخول إلى حسابك/i })).toBeNull();

    // Retry button is present
    const retryBtn = screen.getByRole("button", { name: /إعادة محاولة إنهاء الجلسة/i });
    expect(retryBtn).toBeTruthy();

    // Clicking retry calls logoutCurrentDevice again WITHOUT calling completeAccountClaim again
    mockAuthState.logoutCurrentDevice.mockResolvedValueOnce(undefined);
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockAuthState.logoutCurrentDevice).toHaveBeenCalledTimes(2);
      expect(completeAccountClaim).toHaveBeenCalledTimes(1);
    });

    // Successful login button now appears
    const loginBtn = await screen.findByRole("button", { name: /تسجيل الدخول إلى حسابك/i });
    expect(loginBtn).toBeTruthy();
    fireEvent.click(loginBtn);
    expect(navigate).toHaveBeenCalledWith("/auth", { replace: true });
  });

  it("POST-CLAIM: merged === false with refetch failure DOES NOT expose profile, shows retry button which retries ONLY refetch", async () => {
    mockAuthState.appSession = { access_token: "provisional-token" };
    mockAuthState.user = { id: "provisional-uid-1" };
    mockAuthState.authStatus = "authenticated_ready";
    mockAuthState.profile = { account_type: "provisional_customer", claim_required: true, phone: "07701234567" };
    mockAuthState.refetch = vi.fn().mockRejectedValueOnce(new Error("Network context error"));

    renderPage();
    fireEvent.submit(screen.getByRole("button", { name: /إرسال رمز التوثيق/i }));

    await waitFor(() => expect(screen.getByTestId("otp-digit-0")).toBeTruthy());
    fireEvent.paste(screen.getByTestId("otp-digit-0"), { clipboardData: { getData: () => "123456" } });
    fireEvent.submit(screen.getByRole("button", { name: /تأكيد الرمز والمتابعة/i }));

    const newPasswordInput = await screen.findByLabelText(/كلمة المرور الجديدة/i);
    const confirmPasswordInput = screen.getByLabelText(/تأكيد كلمة المرور/i);

    completeAccountClaim.mockResolvedValueOnce({
      success: true,
      merged: false,
      user_id: "provisional-uid-1",
      message: "تم استلام حسابك وتعيين كلمة المرور بنجاح",
    });

    fireEvent.change(newPasswordInput, { target: { value: "ValidPass123" } });
    fireEvent.change(confirmPasswordInput, { target: { value: "ValidPass123" } });
    fireEvent.submit(screen.getByRole("button", { name: /حفظ الحساب وتأكيده/i }));

    await waitFor(() => {
      expect(completeAccountClaim).toHaveBeenCalledTimes(1);
    });

    // Error notice shown
    const errorNotices = await screen.findAllByText("تم استلام الحساب، لكن تعذر تحديث بيانات الجلسة.");
    expect(errorNotices.length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /الانتقال إلى حسابي/i })).toBeNull();

    // Retry button is present
    const retryBtn = screen.getByRole("button", { name: /إعادة تحديث الحساب/i });
    expect(retryBtn).toBeTruthy();

    // Clicking retry calls refetch only
    mockAuthState.refetch.mockResolvedValueOnce({});
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockAuthState.refetch).toHaveBeenCalledTimes(2);
      expect(completeAccountClaim).toHaveBeenCalledTimes(1);
    });

    // Profile button now appears
    const profileBtn = await screen.findByRole("button", { name: /الانتقال إلى حسابي/i });
    expect(profileBtn).toBeTruthy();
    fireEvent.click(profileBtn);
    expect(navigate).toHaveBeenCalledWith("/profile", { replace: true });
  });
});
