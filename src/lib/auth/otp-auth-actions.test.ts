import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();
const resetPasswordForEmail = vi.fn();
const updateUser = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signInWithOtp, verifyOtp, resetPasswordForEmail, updateUser },
  },
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

const {
  requestEmailOtp,
  verifyEmailOtp,
  requestPhoneOtp,
  verifyPhoneOtp,
  requestEmailPasswordRecovery,
  verifyEmailRecoveryOtp,
  updatePasswordInSession,
} = await import("./auth-actions");

const SESSION = { access_token: "token", user: { id: "user-1" } };

beforeEach(() => {
  vi.clearAllMocks();
  signInWithOtp.mockResolvedValue({ data: {}, error: null });
  verifyOtp.mockResolvedValue({ data: { session: SESSION }, error: null });
  resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  updateUser.mockResolvedValue({ data: {}, error: null });
  getSession.mockResolvedValue(SESSION);
});

describe("shouldCreateUser is enforced in the Supabase request itself", () => {
  it("login never asks Supabase to create a user", async () => {
    await requestEmailOtp("name@example.com", { createUser: false });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "name@example.com",
      options: { shouldCreateUser: false, data: undefined },
    });

    await requestPhoneOtp("+9647501234567", { createUser: false });
    expect(signInWithOtp).toHaveBeenLastCalledWith({
      phone: "+9647501234567",
      options: { shouldCreateUser: false, data: undefined },
    });
  });

  it("registration asks Supabase to create a user and carries the name", async () => {
    await requestEmailOtp("new@example.com", { createUser: true, metadata: { full_name: "زينب" } });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "new@example.com",
      options: { shouldCreateUser: true, data: { full_name: "زينب" } },
    });
  });

  it("does not attach metadata on login even when a name is supplied", async () => {
    await requestEmailOtp("name@example.com", { createUser: false, metadata: { full_name: "زينب" } });
    expect(signInWithOtp.mock.calls[0][0].options.data).toBeUndefined();
  });

  it("omits metadata when the name is blank", async () => {
    await requestPhoneOtp("+9647501234567", { createUser: true, metadata: { full_name: "   " } });
    expect(signInWithOtp.mock.calls[0][0].options.data).toBeUndefined();
  });
});

describe("channel is never forced to whatsapp", () => {
  it("phone requests carry no channel, because the Send SMS Hook does the routing", async () => {
    await requestPhoneOtp("+9647501234567", { createUser: false });
    const payload = signInWithOtp.mock.calls[0][0];
    expect(payload.options).not.toHaveProperty("channel");
    expect(JSON.stringify(payload)).not.toContain("whatsapp");
  });
});

describe("verification types", () => {
  it("email verification uses type email", async () => {
    await verifyEmailOtp("name@example.com", "123456");
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "name@example.com",
      token: "123456",
      type: "email",
    });
  });

  it("phone verification uses type sms", async () => {
    await verifyPhoneOtp("+9647501234567", "123456");
    expect(verifyOtp).toHaveBeenCalledWith({
      phone: "+9647501234567",
      token: "123456",
      type: "sms",
    });
  });

  it("email recovery uses type recovery", async () => {
    await verifyEmailRecoveryOtp("name@example.com", "123456");
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "name@example.com",
      token: "123456",
      type: "recovery",
    });
  });

  it("returns the session Supabase issued, never a hand-built one", async () => {
    const result = await verifyEmailOtp("name@example.com", "123456");
    expect(result.session).toBe(SESSION);
    expect(result.user).toBe(SESSION.user);
  });
});

describe("failures surface rather than being swallowed", () => {
  it("a wrong or expired code rejects", async () => {
    verifyOtp.mockResolvedValue({ data: {}, error: new Error("Token has expired or is invalid") });
    await expect(verifyEmailOtp("name@example.com", "000000")).rejects.toThrow(/expired|invalid/i);
  });

  it("a failed request rejects, so the UI cannot claim a code was sent", async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: new Error("Signups not allowed for otp") });
    await expect(requestEmailOtp("name@example.com", { createUser: false })).rejects.toThrow();
  });

  it("a verification that yields no session rejects", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
    getSession.mockResolvedValue(null);
    await expect(verifyPhoneOtp("+9647501234567", "123456")).rejects.toThrow(/تعذر تهيئة الجلسة/);
  });

  it("empty identifiers are rejected before reaching Supabase", async () => {
    await expect(requestEmailOtp("  ", { createUser: false })).rejects.toThrow();
    await expect(requestPhoneOtp("  ", { createUser: false })).rejects.toThrow();
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("password recovery", () => {
  it("email recovery asks Supabase to send the recovery mail", async () => {
    await requestEmailPasswordRecovery("name@example.com");
    expect(resetPasswordForEmail).toHaveBeenCalledWith("name@example.com");
  });

  it("updates the password inside the verified session", async () => {
    await updatePasswordInSession("newsecret");
    expect(updateUser).toHaveBeenCalledWith({ password: "newsecret" });
  });

  it("refuses to update without a session", async () => {
    getSession.mockResolvedValue(null);
    await expect(updatePasswordInSession("newsecret")).rejects.toThrow(/انتهت صلاحية الجلسة/);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("enforces the minimum password length before calling Supabase", async () => {
    await expect(updatePasswordInSession("123")).rejects.toThrow(/6/);
    expect(updateUser).not.toHaveBeenCalled();
  });
});
