/**
 * The only sanctioned way for UI code to mutate auth state.
 *
 * Passwords are never logged, stored, or echoed back in errors.
 */

import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { authSessionManager } from "./auth-session-manager";
import { exchangeProvisionalCredentials } from "./provisional-credential-exchange";
import {
  normalizePasswordSecurityWarning,
  toWeakPasswordError,
  type PasswordSecurityWarning,
} from "./password-errors";

export type PasswordCredentials =
  | { email: string; password: string; phone?: never }
  | { phone: string; password: string; email?: never };

export type SignInResult = {
  session: Session;
  user: User;
  /**
   * Present only when Supabase ACCEPTED the password but flagged it as weak. Purely advisory:
   * the sign-in succeeded and the session is valid. Callers must treat this as a hint to show,
   * never as a reason to reject, log out, or force a reset.
   */
  passwordSecurityWarning?: PasswordSecurityWarning;
};

export type SignUpResult = {
  session: Session | null;
  user: User | null;
  requiresEmailConfirmation: boolean;
};

function assertSession(session: Session | null | undefined): Session {
  if (!session?.access_token || !session.user?.id) {
    throw new Error("تعذر تهيئة الجلسة. حاول مرة أخرى.");
  }
  return session;
}

export async function signInWithPassword(credentials: PasswordCredentials): Promise<SignInResult> {
  const { data, error } = await supabase.auth.signInWithPassword(
    credentials as Parameters<typeof supabase.auth.signInWithPassword>[0],
  );
  if (error) throw error;

  const session = assertSession(data.session ?? (await authSessionManager.getSession()));

  // `data.weakPassword` is set when the CURRENT password is weak but the sign-in still succeeded.
  // It is attached as an optional hint and nothing more: an existing user with a weak password
  // must never be locked out by our own warning.
  const passwordSecurityWarning = normalizePasswordSecurityWarning(data.weakPassword);

  return passwordSecurityWarning
    ? { session, user: session.user, passwordSecurityWarning }
    : { session, user: session.user };
}

export async function signUpWithPassword(credentials: PasswordCredentials): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp(
    credentials as Parameters<typeof supabase.auth.signUp>[0],
  );
  if (error) throw toWeakPasswordError(error) ?? error;

  const session = data.session ?? null;
  return {
    session,
    user: data.user ?? session?.user ?? null,
    requiresEmailConfirmation: !session,
  };
}

export async function resendSignupEmail(email: string): Promise<void> {
  const target = email.trim();
  if (!target) throw new Error("البريد الإلكتروني مطلوب لإعادة إرسال رابط التفعيل.");

  const { error } = await supabase.auth.resend({ type: "signup", email: target });
  if (error) throw error;
}

/**
 * Exchange the credentials for the provisional customer account the backend created during guest
 * checkout, and return the session as a CANDIDATE.
 *
 * Deliberately NOT the normal login path. A guest checkout can be in flight for seconds while the customer
 * using the tab changes, and running this on the application's Supabase client would persist and publish
 * the provisional session before anything could check whether it was still wanted — overwriting whoever
 * arrived in the meantime. The isolated exchange leaves the active session untouched, so
 * `AuthSessionManager.commitProvisionalAuthentication` remains the first and only thing that can make this
 * candidate authoritative.
 */
export async function establishProvisionalSession(email: string, password: string): Promise<SignInResult> {
  const session = await exchangeProvisionalCredentials(email, password);
  return { session, user: session.user };
}

/** Local-scope sign-out: this device only. */
export async function logoutCurrentDevice(): Promise<void> {
  await authSessionManager.logoutCurrentDevice();
}

// ── Supabase OTP ─────────────────────────────────────────────────────────────
//
// Supabase owns the whole OTP lifecycle: generation, delivery, verification and session
// issuance. Nothing here mints a session by hand, and the custom auth_otp_challenges
// machinery is not involved — that stays exclusively for the Account Claim business flow.
//
// `channel` is deliberately never passed on the phone request. `channel: "whatsapp"` is
// Supabase's Twilio WhatsApp integration; this project routes phone codes through a Send
// SMS Hook into the existing Meta WhatsApp provider instead, and passing the channel would
// send Supabase down the wrong path.

export type OtpRegistrationMetadata = {
  full_name?: string;
};

export type OtpRequestOptions = {
  /** false for login, true for registration. Enforced in the Supabase request itself. */
  createUser: boolean;
  metadata?: OtpRegistrationMetadata;
};

/** Only attach metadata when registering; Supabase ignores it on an existing user anyway. */
function metadataFor(options: OtpRequestOptions): Record<string, unknown> | undefined {
  if (!options.createUser) return undefined;
  const fullName = options.metadata?.full_name?.trim();
  return fullName ? { full_name: fullName } : undefined;
}

export async function requestEmailOtp(email: string, options: OtpRequestOptions): Promise<void> {
  const target = email.trim();
  if (!target) throw new Error("البريد الإلكتروني مطلوب.");

  const { error } = await supabase.auth.signInWithOtp({
    email: target,
    options: {
      shouldCreateUser: options.createUser,
      data: metadataFor(options),
    },
  });
  if (error) throw error;
}

export async function verifyEmailOtp(email: string, token: string): Promise<SignInResult> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: "email",
  });
  if (error) throw error;

  const session = assertSession(data.session ?? (await authSessionManager.getSession()));
  return { session, user: session.user };
}

/**
 * `phoneE164` must already be normalized by toIraqiE164. Normalization lives in
 * identifier.ts so the UI and this module cannot disagree about what a valid number is.
 */
export async function requestPhoneOtp(phoneE164: string, options: OtpRequestOptions): Promise<void> {
  const target = phoneE164.trim();
  if (!target) throw new Error("رقم الهاتف مطلوب.");

  const { error } = await supabase.auth.signInWithOtp({
    phone: target,
    options: {
      shouldCreateUser: options.createUser,
      data: metadataFor(options),
    },
  });
  if (error) throw error;
}

export async function verifyPhoneOtp(phoneE164: string, token: string): Promise<SignInResult> {
  const { data, error } = await supabase.auth.verifyOtp({
    phone: phoneE164.trim(),
    token: token.trim(),
    type: "sms",
  });
  if (error) throw error;

  const session = assertSession(data.session ?? (await authSessionManager.getSession()));
  return { session, user: session.user };
}

// ── Password recovery (Supabase-owned) ───────────────────────────────────────

/** Sends the recovery email. The template must emit {{ .Token }}, not a magic link. */
export async function requestEmailPasswordRecovery(email: string): Promise<void> {
  const target = email.trim();
  if (!target) throw new Error("البريد الإلكتروني مطلوب.");

  const { error } = await supabase.auth.resetPasswordForEmail(target);
  if (error) throw error;
}

export async function verifyEmailRecoveryOtp(email: string, token: string): Promise<SignInResult> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: "recovery",
  });
  if (error) throw error;

  const session = assertSession(data.session ?? (await authSessionManager.getSession()));
  return { session, user: session.user };
}

/**
 * Sets a new password inside the verified session established by an OTP verification.
 *
 * The phone variant of "forgot password" is exactly this: a normal phone OTP login with
 * `shouldCreateUser: false`, followed by this call. It is a **phone OTP authenticated
 * password reset**, not a Supabase recovery token flow — only the email path uses a real
 * recovery token.
 */
export async function updatePasswordInSession(newPassword: string): Promise<void> {
  if (!newPassword || newPassword.length < 6) {
    throw new Error("كلمة المرور يجب أن لا تقل عن 6 خانات");
  }

  const session = await authSessionManager.getSession();
  if (!session?.access_token) {
    throw new Error("انتهت صلاحية الجلسة. أعد طلب رمز التحقق.");
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw toWeakPasswordError(error) ?? error;
}

// ── Verified phone linking (logged-in users) ─────────────────────────────────
//
// Distinct from phone OTP *login*. The user is already authenticated; what is being
// established is that they hold the SIM. Supabase owns both halves — it mints the code on
// updateUser and checks it on verifyOtp — so nothing here can mark a phone verified.

/**
 * Starts a phone change on the current session. Supabase sends the OTP to the new number
 * and records it as pending; the auth record is not updated until verification succeeds.
 *
 * `phoneE164` must already be normalized by toIraqiE164, for the same reason as
 * requestPhoneOtp: the UI and this module must not disagree about what a valid number is.
 */
export async function startPhoneChange(phoneE164: string): Promise<void> {
  const target = phoneE164.trim();
  if (!target) throw new Error("رقم الهاتف مطلوب.");

  const { error } = await supabase.auth.updateUser({ phone: target });
  if (error) throw error;
}

/**
 * Completes the phone change. Type is `phone_change`, not `sms` — an `sms` verification
 * would be a login attempt against a number the user has not yet proven, which is a
 * different operation with different consequences.
 */
export async function verifyPhoneChange(phoneE164: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    phone: phoneE164.trim(),
    token: token.trim(),
    type: "phone_change",
  });
  if (error) throw error;
}

/**
 * Reads the phone Supabase Auth currently holds for the session.
 *
 * Used to confirm the change actually landed before asking the backend to mirror it, so a
 * verification that silently failed cannot be reported to the user as success.
 */
export async function getVerifiedAuthPhone(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.phone?.trim() || null;
}
