/**
 * Weak-password UX across the three password login surfaces.
 *
 * DilMart-STORE-WEAK-PASSWORD-UX-001
 *
 * The load-bearing property: a weak-password WARNING accompanies a successful sign-in and must
 * never behave like an error. It cannot fail the login, cannot log anyone out, and — on the
 * merchant and admin surfaces — cannot appear before the account has actually cleared
 * authorization, where it would imply access the account does not have.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate, useLocation: () => ({ pathname: "/auth", state: null }) };
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

const signInWithPassword = vi.fn();
const signUpWithPassword = vi.fn();
const logoutCurrentDevice = vi.fn();
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    signInWithPassword,
    signUpWithPassword,
    logoutCurrentDevice,
    requestEmailOtp: vi.fn(),
    requestPhoneOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    verifyPhoneOtp: vi.fn(),
  }),
}));

const getAuthContext = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: { getAuthContext: (...args: unknown[]) => getAuthContext(...args) },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();
const toastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError, warning: toastWarning, info: toastInfo },
}));

const Auth = (await import("./Auth")).default;
const MerchantLogin = (await import("./merchant/Login")).default;
const AdminLogin = (await import("./admin/Login")).default;
const {
  WEAK_PASSWORD_SIGN_IN_WARNING_AR,
  WEAK_PASSWORD_PWNED_MESSAGE_AR,
  WeakPasswordError,
} = await import("@/lib/auth/password-errors");

const SESSION = { access_token: "token", user: { id: "user-1" } };
const OK = { session: SESSION, user: SESSION.user };
const OK_WITH_WARNING = { ...OK, passwordSecurityWarning: { reasons: ["pwned"] as const } };

function renderPage(node: React.ReactElement, path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function fillAndSubmit(form: HTMLElement, fields: Array<[HTMLElement, string]>) {
  for (const [element, value] of fields) fireEvent.change(element, { target: { value } });
  fireEvent.submit(form);
}

function submitEmailPasswordForm(container: HTMLElement) {
  const inputs = container.querySelectorAll("input");
  const form = container.querySelector("form");
  if (!form) throw new Error("no form rendered");
  fillAndSubmit(form as HTMLElement, [
    [inputs[0] as HTMLElement, "user@example.com"],
    [inputs[1] as HTMLElement, "some password"],
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  signInWithPassword.mockResolvedValue(OK);
  signUpWithPassword.mockResolvedValue({ session: SESSION, user: SESSION.user, requiresEmailConfirmation: false });
  getAuthContext.mockResolvedValue({ activeRole: "customer", roles: ["customer"] });
});

describe("customer auth page", () => {
  async function openPasswordForm() {
    renderPage(<Auth />, "/auth");
    fireEvent.click(screen.getByTestId("toggle-method"));
    return screen.findByTestId("password-form");
  }

  async function submitPassword() {
    const form = await openPasswordForm();
    fillAndSubmit(form, [
      [screen.getByTestId("password-identifier"), "user@example.com"],
      [screen.getByTestId("password"), "password123"],
    ]);
  }

  it("shows the localized message when signup rejects the password", async () => {
    signUpWithPassword.mockRejectedValue(new WeakPasswordError(["pwned"]));
    renderPage(<Auth />, "/auth");
    const registerTab = screen.getByTestId("tab-register");
    // Radix Tabs activates on pointer-down, not a synthetic click alone.
    fireEvent.mouseDown(registerTab);
    fireEvent.click(registerTab);
    fireEvent.click(screen.getByTestId("toggle-method"));
    const form = await screen.findByTestId("password-form");
    // Radix drives the tab; confirm the register branch is actually active before submitting.
    await waitFor(() => expect(screen.getByRole("button", { name: "إنشاء الحساب" })).toBeTruthy());
    fillAndSubmit(form, [
      [screen.getByTestId("password-identifier"), "new@example.com"],
      [screen.getByTestId("password"), "password123"],
    ]);

    await waitFor(() => expect(signUpWithPassword).toHaveBeenCalled());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(WEAK_PASSWORD_PWNED_MESSAGE_AR));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("signs a weak existing password in and shows the warning without blocking", async () => {
    signInWithPassword.mockResolvedValue(OK_WITH_WARNING);
    await submitPassword();

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("تم تسجيل الدخول بنجاح"));
    expect(toastWarning).toHaveBeenCalledWith(WEAK_PASSWORD_SIGN_IN_WARNING_AR);
    expect(toastError).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalled();
  });

  it("does not warn when the sign-in carries no warning", async () => {
    await submitPassword();

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("تم تسجيل الدخول بنجاح"));
    expect(toastWarning).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalled();
  });
});

describe("merchant login", () => {
  it("warns only after merchant authorization passed", async () => {
    signInWithPassword.mockResolvedValue(OK_WITH_WARNING);
    getAuthContext.mockResolvedValue({ activeRole: "merchant_owner", merchant: { status: "active" } });
    const { container } = renderPage(<MerchantLogin />, "/merchant/login");
    submitEmailPasswordForm(container);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("تم تسجيل دخول التاجر بنجاح"));
    expect(toastWarning).toHaveBeenCalledWith(WEAK_PASSWORD_SIGN_IN_WARNING_AR);
    expect(navigate).toHaveBeenCalledWith("/merchant", { replace: true });
  });

  it("never lets the warning imply merchant access for a non-merchant account", async () => {
    signInWithPassword.mockResolvedValue(OK_WITH_WARNING);
    getAuthContext.mockResolvedValue({ activeRole: "customer", merchant: null });
    const { container } = renderPage(<MerchantLogin />, "/merchant/login");
    submitEmailPasswordForm(container);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/merchant/register", { replace: true }));
    expect(toastWarning).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("does not bypass the authorization failure path", async () => {
    signInWithPassword.mockResolvedValue(OK_WITH_WARNING);
    getAuthContext.mockRejectedValue(new Error("context unavailable"));
    const { container } = renderPage(<MerchantLogin />, "/merchant/login");
    submitEmailPasswordForm(container);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastWarning).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("admin login", () => {
  it("warns only after admin authorization passed", async () => {
    signInWithPassword.mockResolvedValue(OK_WITH_WARNING);
    getAuthContext.mockResolvedValue({ activeRole: "admin", roles: ["admin"] });
    const { container } = renderPage(<AdminLogin />, "/admin/login");
    submitEmailPasswordForm(container);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("تم تسجيل الدخول بنجاح"));
    expect(toastWarning).toHaveBeenCalledWith(WEAK_PASSWORD_SIGN_IN_WARNING_AR);
    expect(navigate).toHaveBeenCalledWith("/admin");
  });

  it("still logs out a non-admin account and never warns", async () => {
    signInWithPassword.mockResolvedValue(OK_WITH_WARNING);
    getAuthContext.mockResolvedValue({ activeRole: "customer", roles: ["customer"] });
    const { container } = renderPage(<AdminLogin />, "/admin/login");
    submitEmailPasswordForm(container);

    await waitFor(() => expect(logoutCurrentDevice).toHaveBeenCalled());
    expect(toastError).toHaveBeenCalledWith("عذراً، ليس لديك صلاحية الوصول للوحة التحكم");
    expect(toastWarning).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
