/**
 * Phone helpers for WhatsApp OTP delivery.
 * Stored DB form remains local Iraqi `07XXXXXXXXX` via normalizeIraqiPhone.
 * Meta Cloud API expects international digits (optional leading +).
 */

/** Mask phone for logs — never log full number. */
export function maskPhoneForLogs(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 5) return "***";
  return trimmed.slice(0, -4).replace(/\d/g, "*") + trimmed.slice(-4);
}

/**
 * Convert stored/local Iraqi mobile to E.164 for WhatsApp Meta API.
 * Keeps DB storage unchanged — conversion is send-time only.
 *
 * @example
 *   toWhatsAppE164("07501234567") → "+9647501234567"
 *   toWhatsAppE164("+9647501234567") → "+9647501234567"
 *   toWhatsAppE164("009647501234567") → "+9647501234567"
 */
export function toWhatsAppE164(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+964") && /^\+9647\d{9}$/.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("00964") && /^009647\d{9}$/.test(trimmed)) {
    return `+${trimmed.slice(2)}`;
  }
  if (/^07\d{9}$/.test(trimmed)) {
    return `+964${trimmed.slice(1)}`;
  }
  // Fallback: if already digits with 964 country code
  const digits = trimmed.replace(/\D/g, "");
  if (/^9647\d{9}$/.test(digits)) {
    return `+${digits}`;
  }
  if (/^7\d{9}$/.test(digits)) {
    return `+964${digits}`;
  }
  throw new Error("INVALID_IRAQI_MOBILE_FOR_WHATSAPP");
}
