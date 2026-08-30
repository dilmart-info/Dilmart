/**
 * Password sign-in / sign-up / update behaviour under weak-password conditions.
 *
 * DilMart-STORE-WEAK-PASSWORD-UX-001
 *
 * Two invariants are pinned here, and they pull in opposite directions:
 *
 *   SETTING a password that Supabase rejects must surface localized, actionable Arabic copy;
 *   USING an existing password Supabase accepts must sign the user in, weak or not.
 *
 * A warning must never be able to turn a valid session into a failed login.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPasswordMock = vi.fn();
const signUpMock = vi.fn();
const updateUserMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signUp: signUpMock,
      updateUser: updateUserMock,
    },
  },
}));

const exchangeProvisionalCredentials = vi.fn();
vi.mock("./provisional-credential-exchange", () => ({
  exchangeProvisionalCredentials: (...args: unknown[]) => exchangeProvisionalCredentials(...args),
}));

const getSession = vi.fn();
vi.mock("./auth-session-manager", () => ({
  // Pure helper, mirrored from the real module: mocks must not invent a second owner derivation.
  principalOwnerOf: (session: { authSource?: string; user?: { id?: string } } | null) =>
    session && session.user?.id ? `${session.authSource}:${session.user.id}` : null,
  authSessionManager: {
    getSession: () => getSession(),
    logoutCurrentDevice: vi.fn(),
  },
}));

const { signInWithPassword, signUpWithPassword, updatePasswordInSession, establishProvisionalSession } =
  await import("./auth-actions");
const {
  WEAK_PASSWORD_ERROR_CODE,
  WEAK_PASSWORD_MESSAGE_AR,
  WEAK_PASSWORD_PWNED_MESSAGE_AR,
  WeakPasswordError,
} = await import("./password-errors");

const SESSION = { access_token: "token", user: { id: "user-1" } };
const CREDENTIALS = { email: "name@example.com", password: "correct horse" } as const;

/** What @supabase/auth-js returns when it rejects the password before changing anything. */
function weakPasswordError(reasons: string[] = ["pwned"]) {
  return Object.assign(new Error("Password is known to be weak and easy to guess, please choose a different one."), {
    name: "AuthWeakPasswordError",
    code: WEAK_PASSWORD_ERROR_CODE,
    status: 422,
    reasons,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  signInWithPasswordMock.mockResolvedValue({ data: { session: SESSION, user: SESSION.user }, error: null });
  signUpMock.mockResolvedValue({ data: { session: SESSION, user: SESSION.user }, error: null });
  updateUserMock.mockResolvedValue({ data: {}, error: null });
  getSession.mockResolvedValue(SESSION);
});

describe("signUpWithPassword", () => {
  it("rejects a weak password with the actionable Arabic message", async () => {
    signUpMock.mockResolvedValue({ data: null, error: weakPasswordError(["pwned"]) });

    await expect(signUpWithPassword(CREDENTIALS)).rejects.toMatchObject({
      code: WEAK_PASSWORD_ERROR_CODE,
      message: WEAK_PASSWORD_PWNED_MESSAGE_AR,
    });
  });

  it("uses the generic approved message when the rejection carries no reasons", async () => {
    signUpMock.mockResolvedValue({ data: null, error: { code: WEAK_PASSWORD_ERROR_CODE, message: "Weak password." } });

    await expect(signUpWithPassword(CREDENTIALS)).rejects.toThrow(WEAK_PASSWORD_MESSAGE_AR);
  });

  it("passes every other error through untouched", async () => {
    const original = Object.assign(new Error("User already registered"), { code: "user_already_exists" });
    signUpMock.mockResolvedValue({ data: null, error: original });

    await expect(signUpWithPassword(CREDENTIALS)).rejects.toBe(original);
  });

  it("does not reclassify an error that only carries the SDK class name", async () => {
    const nameOnly = Object.assign(new Error("Password is known to be weak."), {
      name: "AuthWeakPasswordError",
      status: 422,
      reasons: ["pwned"],
    });
    signUpMock.mockResolvedValue({ data: null, error: nameOnly });

    await expect(signUpWithPassword(CREDENTIALS)).rejects.toBe(nameOnly);
  });

  it("returns the session on success", async () => {
    await expect(signUpWithPassword(CREDENTIALS)).resolves.toMatchObject({
      session: SESSION,
      requiresEmailConfirmation: false,
    });
  });
});

describe("updatePasswordInSession", () => {
  it("rejects a weak password with the actionable Arabic message", async () => {
    updateUserMock.mockResolvedValue({ data: null, error: weakPasswordError(["pwned"]) });

    const rejection = await updatePasswordInSession("a new password").catch((error: unknown) => error);
    expect(rejection).toBeInstanceOf(WeakPasswordError);
    expect((rejection as Error).message).toBe(WEAK_PASSWORD_PWNED_MESSAGE_AR);
  });

  it("passes every other error through untouched", async () => {
    const original = Object.assign(new Error("Auth session missing"), { code: "session_not_found" });
    updateUserMock.mockResolvedValue({ data: null, error: original });

    await expect(updatePasswordInSession("a new password")).rejects.toBe(original);
  });

  it("resolves on success", async () => {
    await expect(updatePasswordInSession("a new password")).resolves.toBeUndefined();
    expect(updateUserMock).toHaveBeenCalledWith({ password: "a new password" });
  });

  it("keeps the existing local minimum length of 6 unchanged", async () => {
    await expect(updatePasswordInSession("12345")).rejects.toThrow("كلمة المرور يجب أن لا تقل عن 6 خانات");
    expect(updateUserMock).not.toHaveBeenCalled();
    await expect(updatePasswordInSession("123456")).resolves.toBeUndefined();
  });
});

describe("signInWithPassword", () => {
  it("returns the session with no warning for a normal login", async () => {
    const result = await signInWithPassword(CREDENTIALS);

    expect(result.session).toBe(SESSION);
    expect(result.passwordSecurityWarning).toBeUndefined();
  });

  it("preserves the session AND surfaces the normalized warning when the password is weak", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: {
        session: SESSION,
        user: SESSION.user,
        weakPassword: { reasons: ["pwned"], message: "This password is known to be weak." },
      },
      error: null,
    });

    const result = await signInWithPassword(CREDENTIALS);

    // The session is the point: an existing weak password must never block sign-in.
    expect(result.session).toBe(SESSION);
    expect(result.user).toBe(SESSION.user);
    expect(result.passwordSecurityWarning).toEqual({ reasons: ["pwned"] });
    // The server's English text is dropped on the way through.
    expect(JSON.stringify(result.passwordSecurityWarning)).not.toContain("known to be weak");
  });

  it("does not throw or clear anything because of a warning", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { session: SESSION, user: SESSION.user, weakPassword: { reasons: ["length", "pwned"], message: "x" } },
      error: null,
    });

    await expect(signInWithPassword(CREDENTIALS)).resolves.toMatchObject({ session: SESSION });
  });

  it("ignores an unrecognised warning payload and behaves exactly like a normal login", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { session: SESSION, user: SESSION.user, weakPassword: { reasons: ["something-new"], message: "x" } },
      error: null,
    });

    const result = await signInWithPassword(CREDENTIALS);
    expect(result.session).toBe(SESSION);
    expect(result.passwordSecurityWarning).toBeUndefined();
  });

  it("still throws on a real sign-in failure", async () => {
    const original = Object.assign(new Error("Invalid login credentials"), { code: "invalid_credentials" });
    signInWithPasswordMock.mockResolvedValue({ data: null, error: original });

    await expect(signInWithPassword(CREDENTIALS)).rejects.toBe(original);
  });

  it("routes the provisional checkout path through the ISOLATED exchange, never the app client", async () => {
    // §9.3 — a guest checkout can be in flight while the customer using the tab changes, so obtaining
    // provisional credentials must not touch the application's session. It returns a candidate; only
    // AuthSessionManager.commitProvisionalAuthentication may install it.
    signInWithPasswordMock.mockClear();
    exchangeProvisionalCredentials.mockResolvedValue(SESSION);

    const result = await establishProvisionalSession("guest@example.com", "generated-password");

    expect(result.session).toBe(SESSION);
    expect(exchangeProvisionalCredentials).toHaveBeenCalledWith("guest@example.com", "generated-password");
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });
});
