import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import PhoneSecurity from "./PhoneSecurity";

const {
  navigate,
  checkPhoneAvailability,
  syncVerifiedPhoneIdentity,
  startPhoneChange,
  verifyPhoneChange,
  getVerifiedAuthPhone,
  toastSuccess,
  toastError,
  toastInfo,
  mockFeatureFlags,
  mockAuthState,
} = vi.hoisted(() => ({
  navigate: vi.fn(),
  checkPhoneAvailability: vi.fn(),
  syncVerifiedPhoneIdentity: vi.fn(),
  startPhoneChange: vi.fn(),
  verifyPhoneChange: vi.fn(),
  getVerifiedAuthPhone: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  mockFeatureFlags: {
    phoneLinkingEnabled: true,
  },
  mockAuthState: {
    user: { id: "user-123" } as { id: string } | null,
    authStatus: "authenticated_ready",
    retryStorageBootstrap: vi.fn(),
    startPhoneChange: vi.fn(),
    verifyPhoneChange: vi.fn(),
    getVerifiedAuthPhone: vi.fn(),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock("@/components/Header", () => ({ default: () => <div data-testid="header" /> }));
vi.mock("@/components/Footer", () => ({ default: () => <div data-testid="footer" /> }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => <div data-testid="whatsapp-btn" /> }));

vi.mock("@/lib/auth/auth-feature-flags", () => mockFeatureFlags);

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    checkPhoneAvailability: (...args: unknown[]) => checkPhoneAvailability(...args),
    syncVerifiedPhoneIdentity: (...args: unknown[]) => syncVerifiedPhoneIdentity(...args),
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: mockAuthState.user,
    authStatus: mockAuthState.authStatus,
    retryStorageBootstrap: mockAuthState.retryStorageBootstrap,
    startPhoneChange,
    verifyPhoneChange,
    getVerifiedAuthPhone,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError, info: toastInfo },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/profile/security/phone"]}>
        <PhoneSecurity />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PhoneSecurity — Strict Authority Chain & Offline/Storage Invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureFlags.phoneLinkingEnabled = true;
    mockAuthState.user = { id: "user-123" };
    mockAuthState.authStatus = "authenticated_ready";
    mockAuthState.retryStorageBootstrap = vi.fn();

    checkPhoneAvailability.mockResolvedValue({ available: true, alreadyMine: false });
    startPhoneChange.mockResolvedValue(undefined);
    verifyPhoneChange.mockResolvedValue(undefined);
    getVerifiedAuthPhone.mockResolvedValue("+9647701234567");
    syncVerifiedPhoneIdentity.mockResolvedValue({ linked: true, phoneMasked: "0770***4567" });
  });

  it("STORAGE ERROR: renders AuthStorageErrorScreen", () => {
    mockAuthState.authStatus = "storage_error";
    renderPage();

    expect(screen.getByText(/تعذّر الوصول إلى التخزين الآمن/i)).toBeTruthy();
    expect(screen.queryByLabelText(/رقم الهاتف/i)).toBeNull();
  });

  it("AUTHENTICATED OFFLINE: blocks network actions and displays offline guidance", () => {
    mockAuthState.authStatus = "authenticated_offline";
    renderPage();

    expect(screen.getByText("يلزم اتصال بالإنترنت لتوثيق رقم الهاتف.")).toBeTruthy();
    expect(screen.queryByLabelText(/رقم الهاتف/i)).toBeNull();
    expect(checkPhoneAvailability).not.toHaveBeenCalled();
    expect(startPhoneChange).not.toHaveBeenCalled();
  });

  it("FEATURE DISABLED: shows unavailable message when phoneLinkingEnabled is false", () => {
    mockFeatureFlags.phoneLinkingEnabled = false;
    renderPage();

    expect(screen.getByText("توثيق رقم الهاتف غير متاح حالياً.")).toBeTruthy();
  });

  it("UNAUTHENTICATED: prompts user to log in when user is null", () => {
    mockAuthState.user = null;
    mockAuthState.authStatus = "unauthenticated";
    renderPage();

    expect(screen.getByText("يجب تسجيل الدخول أولاً لتوثيق رقم هاتفك.")).toBeTruthy();
  });

  it("VALIDATION: rejects empty and invalid Iraqi phone format client-side", async () => {
    renderPage();

    const phoneInput = screen.getByLabelText(/رقم الهاتف/i);
    const submitBtn = screen.getByRole("button", { name: /إرسال رمز التحقق/i });

    // Empty phone
    fireEvent.change(phoneInput, { target: { value: "" } });
    fireEvent.submit(submitBtn);
    expect(checkPhoneAvailability).not.toHaveBeenCalled();

    // Invalid phone
    fireEvent.change(phoneInput, { target: { value: "050123" } });
    fireEvent.submit(submitBtn);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("يرجى إدخال رقم هاتف عراقي صحيح");
    });
    expect(checkPhoneAvailability).not.toHaveBeenCalled();
    expect(startPhoneChange).not.toHaveBeenCalled();
  });

  it("AVAILABILITY CHECK: rejects phone linked to another account", async () => {
    checkPhoneAvailability.mockResolvedValueOnce({ available: false, alreadyMine: false });
    renderPage();

    const phoneInput = screen.getByLabelText(/رقم الهاتف/i);
    fireEvent.change(phoneInput, { target: { value: "07701234567" } });
    fireEvent.submit(screen.getByRole("button", { name: /إرسال رمز التحقق/i }));

    await waitFor(() => {
      expect(checkPhoneAvailability).toHaveBeenCalledWith({ phone: "+9647701234567" });
      expect(toastError).toHaveBeenCalledWith("رقم الهاتف مرتبط بحساب آخر");
    });
    expect(startPhoneChange).not.toHaveBeenCalled();
  });

  it("AVAILABILITY CHECK: notifies if phone is already linked to the current user", async () => {
    checkPhoneAvailability.mockResolvedValueOnce({ available: false, alreadyMine: true });
    renderPage();

    const phoneInput = screen.getByLabelText(/رقم الهاتف/i);
    fireEvent.change(phoneInput, { target: { value: "07701234567" } });
    fireEvent.submit(screen.getByRole("button", { name: /إرسال رمز التحقق/i }));

    await waitFor(() => {
      expect(toastInfo).toHaveBeenCalledWith("هذا الرقم مرتبط بحسابك بالفعل");
    });
    expect(startPhoneChange).not.toHaveBeenCalled();
  });

  it("READ-BACK MISMATCH GUARD: fails safely if Supabase auth does not prove the confirmed phone", async () => {
    getVerifiedAuthPhone.mockResolvedValueOnce(null);

    renderPage();
    const phoneInput = screen.getByLabelText(/رقم الهاتف/i);
    fireEvent.change(phoneInput, { target: { value: "07701234567" } });
    fireEvent.submit(screen.getByRole("button", { name: /إرسال رمز التحقق/i }));

    await waitFor(() => expect(screen.getByTestId("otp-digit-0")).toBeTruthy());

    fireEvent.paste(screen.getByTestId("otp-digit-0"), {
      clipboardData: { getData: () => "123456" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /تأكيد الرمز وتوثيق الرقم/i }));

    await waitFor(() => {
      expect(verifyPhoneChange).toHaveBeenCalledWith("+9647701234567", "123456");
      expect(getVerifiedAuthPhone).toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledWith("لم يتم تأكيد رقم الهاتف. حاول مرة أخرى");
    });

    expect(syncVerifiedPhoneIdentity).not.toHaveBeenCalled();
  });

  it("AUTHORITY CHAIN SUCCESS: checkAvailability -> startPhoneChange -> verifyPhoneChange -> getVerifiedAuthPhone -> syncVerifiedPhoneIdentity", async () => {
    renderPage();

    const phoneInput = screen.getByLabelText(/رقم الهاتف/i);
    fireEvent.change(phoneInput, { target: { value: "07701234567" } });
    fireEvent.submit(screen.getByRole("button", { name: /إرسال رمز التحقق/i }));

    await waitFor(() => {
      expect(checkPhoneAvailability).toHaveBeenCalledWith({ phone: "+9647701234567" });
      expect(startPhoneChange).toHaveBeenCalledWith("+9647701234567");
      expect(toastSuccess).toHaveBeenCalledWith("تم إرسال رمز التحقق عبر واتساب");
    });

    await waitFor(() => expect(screen.getByTestId("otp-digit-0")).toBeTruthy());
    fireEvent.paste(screen.getByTestId("otp-digit-0"), {
      clipboardData: { getData: () => "654321" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /تأكيد الرمز وتوثيق الرقم/i }));

    await waitFor(() => {
      expect(verifyPhoneChange).toHaveBeenCalledWith("+9647701234567", "654321");
      expect(getVerifiedAuthPhone).toHaveBeenCalled();
      expect(syncVerifiedPhoneIdentity).toHaveBeenCalled();
      expect(toastSuccess).toHaveBeenCalledWith("تم ربط رقم الهاتف بحسابك بنجاح");
    });

    expect(screen.getByText(/تم توثيق رقم هاتفك \(0770\*\*\*4567\) وربطه بحسابك بنجاح\./i)).toBeTruthy();
  });
});
