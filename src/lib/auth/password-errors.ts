/**
 * Weak-password error and warning contract.
 *
 * Supabase Auth can reject a password it considers weak — too short, wrong character mix, or
 * present in a known breach corpus (HaveIBeenPwned). When leaked-password protection is enabled
 * that rejection becomes routine, and the raw SDK error is English prose that must never reach an
 * Arabic UI.
 *
 * CLASSIFICATION IS BY `error.code === 'weak_password'` AND NOTHING ELSE.
 *
 * Not the error name, not the message text, not the HTTP status, no regex, no substring. This is
 * the same strict rule the backend password-reset saga uses: the code is the only stable
 * machine-readable contract Supabase publishes, and a rejection drives real state decisions, so an
 * unproven guess must fail closed rather than be treated as a confirmed rejection.
 *
 * This module changes no password policy. It maps errors to copy; the minimum length and the
 * character rules are exactly whatever Supabase and the existing validators already enforce.
 */

/** The stable machine-readable code `@supabase/auth-js` sets on a weak-password rejection. */
export const WEAK_PASSWORD_ERROR_CODE = "weak_password";

/**
 * The reasons `@supabase/auth-js` publishes (`WeakPasswordReasons` in the installed 2.110.8).
 * Treated as an allowlist: anything else the server sends is ignored rather than shown.
 */
export const WEAK_PASSWORD_REASONS = ["length", "characters", "pwned"] as const;
export type WeakPasswordReason = (typeof WEAK_PASSWORD_REASONS)[number];

/** Normalized, non-sensitive warning about a password that was ACCEPTED but is weak. */
export type PasswordSecurityWarning = {
  reasons: WeakPasswordReason[];
};

export const WEAK_PASSWORD_MESSAGE_AR =
  "كلمة المرور هذه غير آمنة أو ظهرت في تسريبات معروفة. اختر كلمة مرور مختلفة.";
export const WEAK_PASSWORD_PWNED_MESSAGE_AR =
  "كلمة المرور هذه ظهرت في تسريبات بيانات معروفة. اختر كلمة مرور مختلفة لم تستخدمها من قبل.";
export const WEAK_PASSWORD_LENGTH_MESSAGE_AR =
  "كلمة المرور هذه أقصر من الحد المطلوب. اختر كلمة مرور أطول.";
export const WEAK_PASSWORD_CHARACTERS_MESSAGE_AR =
  "كلمة المرور هذه لا تحقق متطلبات الأحرف. اختر كلمة مرور تجمع أنواعًا مختلفة من الأحرف.";

/** Shown after a SUCCESSFUL sign-in with a weak password. Advisory only — never blocking. */
export const WEAK_PASSWORD_SIGN_IN_WARNING_AR =
  "كلمة مرورك الحالية ضعيفة أو ظهرت في تسريبات معروفة. ننصح بتغييرها من إعدادات الحساب.";

/**
 * True only when Supabase confirmed the password was rejected as weak.
 *
 * Deliberately narrow: an error carrying `name === 'AuthWeakPasswordError'` or a message that
 * merely mentions `weak_password`, but no `code`, is NOT a confirmed rejection and is left to the
 * caller's ordinary error handling.
 */
export function isWeakPasswordRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: unknown }).code === WEAK_PASSWORD_ERROR_CODE;
}

/**
 * Extracts the reasons from a value, keeping only values in the published allowlist.
 *
 * Server-supplied data is never passed through verbatim — only these three literals can survive,
 * so no arbitrary text, and certainly no password content, can reach the UI through this path.
 */
export function readWeakPasswordReasons(value: unknown): WeakPasswordReason[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(WEAK_PASSWORD_REASONS);
  const seen = new Set<WeakPasswordReason>();
  for (const entry of value) {
    if (typeof entry === "string" && allowed.has(entry)) {
      seen.add(entry as WeakPasswordReason);
    }
  }
  return [...seen];
}

/**
 * Picks the most actionable Arabic message for the given reasons.
 *
 * `pwned` wins when present: "this exact password is in a breach corpus" tells the user something
 * a length or character hint does not, and no longer password of the same string will fix it.
 */
export function weakPasswordMessage(reasons: readonly WeakPasswordReason[] = []): string {
  if (reasons.includes("pwned")) return WEAK_PASSWORD_PWNED_MESSAGE_AR;
  if (reasons.includes("length")) return WEAK_PASSWORD_LENGTH_MESSAGE_AR;
  if (reasons.includes("characters")) return WEAK_PASSWORD_CHARACTERS_MESSAGE_AR;
  return WEAK_PASSWORD_MESSAGE_AR;
}

/** Localized error thrown in place of the raw SDK error when a password is rejected as weak. */
export class WeakPasswordError extends Error {
  readonly code = WEAK_PASSWORD_ERROR_CODE;
  readonly reasons: WeakPasswordReason[];

  constructor(reasons: WeakPasswordReason[] = []) {
    super(weakPasswordMessage(reasons));
    this.name = "WeakPasswordError";
    this.reasons = reasons;
  }
}

/**
 * Converts a confirmed weak-password rejection into the localized error, or returns null so the
 * caller keeps its existing behaviour for every other failure.
 */
export function toWeakPasswordError(error: unknown): WeakPasswordError | null {
  if (!isWeakPasswordRejection(error)) return null;
  return new WeakPasswordError(readWeakPasswordReasons((error as { reasons?: unknown }).reasons));
}

/**
 * Normalizes `data.weakPassword` from a SUCCESSFUL `signInWithPassword`.
 *
 * The installed `@supabase/auth-js` 2.110.8 types this as `weakPassword?: { reasons, message }` on
 * `AuthTokenResponsePassword`. Only the reasons are kept — the server's English `message` is
 * dropped, so nothing unlocalized and nothing unexpected can reach the UI.
 *
 * Returns null when the field is absent or carries no recognised reason, which is the signal to
 * leave the successful sign-in completely untouched.
 */
export function normalizePasswordSecurityWarning(value: unknown): PasswordSecurityWarning | null {
  if (!value || typeof value !== "object") return null;
  const reasons = readWeakPasswordReasons((value as { reasons?: unknown }).reasons);
  if (reasons.length === 0) return null;
  return { reasons };
}
