/**
 * Identifier normalization shared by every auth surface.
 *
 * The contract deliberately mirrors backend/src/modules/auth/otp-phone.util.ts. Both
 * sides accept the same three Iraqi mobile shapes and produce the same E.164 string, and
 * identifier.contract.test.ts asserts they agree on a shared case table so the two cannot
 * drift apart silently.
 *
 * Supabase phone auth only speaks E.164, so `+964…` is what leaves the client. The
 * database keeps storing the local `07…` form; nothing here changes that.
 */

/** Iraqi mobile numbers are 07 followed by 9 digits, i.e. 7XXXXXXXXX after the country code. */
const LOCAL_MOBILE = /^07\d{9}$/;
const E164_MOBILE = /^\+9647\d{9}$/;
const INTL_00_MOBILE = /^009647\d{9}$/;
const BARE_COUNTRY_MOBILE = /^9647\d{9}$/;
const BARE_MOBILE = /^7\d{9}$/;

export class InvalidIraqiMobileError extends Error {
  constructor() {
    super("رقم الهاتف غير صالح. استخدم صيغة 07XXXXXXXXX");
    this.name = "InvalidIraqiMobileError";
  }
}

/** Never log a full number. Mirrors maskPhoneForLogs on the backend. */
export function maskIdentifierForLogs(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 5) return "***";
  return trimmed.slice(0, -4).replace(/[^\s]/g, "*") + trimmed.slice(-4);
}

/**
 * Anything with an `@` is treated as an email and is never run through phone
 * normalization — a stray digit-only local part must not be silently turned into a phone
 * number.
 */
export function looksLikeEmail(value: string): boolean {
  return value.includes("@");
}

/** Basic shape check only. Supabase remains the authority on deliverability. */
export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

/**
 * Accepts 07XXXXXXXXX, 9647XXXXXXXXX and +9647XXXXXXXXX (plus the 00964 and bare
 * 7XXXXXXXXX variants the backend already tolerates) and returns +9647XXXXXXXXX.
 *
 * Throws InvalidIraqiMobileError for anything else, including text, short numbers, and
 * landline prefixes.
 */
export function toIraqiE164(phone: string): string {
  if (typeof phone !== "string") throw new InvalidIraqiMobileError();

  if (looksLikeEmail(phone)) throw new InvalidIraqiMobileError();

  // Formatting characters are stripped first, so "0750 123 4567" becomes a shape the
  // backend also accepts. This is input sanitisation, not a looser contract: every value
  // that survives normalises to exactly what backend/otp-phone.util.ts produces for the
  // same number, which identifier.contract asserts on a shared case table.
  const trimmed = phone.replace(/[\s()‎‏-]/g, "").trim();
  if (!trimmed) throw new InvalidIraqiMobileError();

  if (E164_MOBILE.test(trimmed)) return trimmed;
  if (INTL_00_MOBILE.test(trimmed)) return `+${trimmed.slice(2)}`;
  if (LOCAL_MOBILE.test(trimmed)) return `+964${trimmed.slice(1)}`;

  const digits = trimmed.replace(/\D/g, "");
  if (BARE_COUNTRY_MOBILE.test(digits)) return `+${digits}`;
  if (BARE_MOBILE.test(digits)) return `+964${digits}`;

  throw new InvalidIraqiMobileError();
}

/** True when the input is a recognisable Iraqi mobile in any accepted shape. */
export function isValidIraqiMobile(phone: string): boolean {
  try {
    toIraqiE164(phone);
    return true;
  } catch {
    return false;
  }
}

/**
 * Display form for a normalized number: keeps the user's own local notation so the screen
 * does not appear to change what they typed.
 */
export function toIraqiLocalDisplay(phone: string): string {
  const e164 = toIraqiE164(phone);
  return `0${e164.slice(4)}`;
}

/**
 * Returns a customer-facing email string, or null if the email is an internal provisional identity
 * (e.g. @provisional.dilmart.com, @provisional.dilmart.org, @provisional.local).
 */
export function getCustomerFacingEmail(email?: string | null): string | null {
  if (!email || typeof email !== "string") return null;
  const trimmed = email.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (
    lower.includes("@provisional.") ||
    lower.endsWith(".provisional.local") ||
    lower.endsWith("@provisional.local") ||
    lower.includes("provisional.dilmart.")
  ) {
    return null;
  }
  return trimmed;
}
