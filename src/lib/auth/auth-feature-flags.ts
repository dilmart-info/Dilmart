/**
 * Auth surface feature flags.
 *
 * All three default to **off**. A flag has to be set to an explicit truthy string to
 * enable anything, so a missing or misspelled variable can never switch a flow on.
 *
 * These are UI gates, not security boundaries. The real control lives in the Supabase
 * request itself: login always sends `shouldCreateUser: false` and registration always
 * sends `true`, regardless of what any flag says. Turning a flag on cannot create an
 * account from a login screen, and turning one off cannot be relied on to stop a crafted
 * client.
 */

function readFlag(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

const env = import.meta.env as Record<string, string | undefined>;

/** Email OTP login and registration. */
export const emailOtpEnabled = readFlag(env.VITE_AUTH_EMAIL_OTP_ENABLED);

/** Phone (WhatsApp) OTP login. */
export const phoneOtpEnabled = readFlag(env.VITE_AUTH_PHONE_OTP_ENABLED);

/**
 * Phone OTP **registration**, separate from login on purpose. It stays off until the
 * phone-identity audit confirms existing users are reachable by phone without creating
 * duplicate accounts.
 */
export const phoneRegistrationEnabled = readFlag(env.VITE_AUTH_PHONE_REGISTRATION_ENABLED);

/**
 * Verified phone linking for users who are already signed in.
 *
 * Separate from both OTP flags. It creates no accounts and changes no login path — it only
 * lets an existing user prove a number they already have — but it does send a real message,
 * so it stays off until the dark-launch check confirms delivery works.
 */
export const phoneLinkingEnabled = readFlag(env.VITE_AUTH_PHONE_LINKING_ENABLED);

/** Password login is never behind a flag. Existing users must always be able to sign in. */
export const passwordLoginEnabled = true;

/** True when at least one OTP channel is available to the user. */
export const anyOtpEnabled = emailOtpEnabled || phoneOtpEnabled;
