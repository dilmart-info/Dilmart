/**
 * STORE-PR6 — Store deep-link (Universal / App Link) transport contract.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §8, §12, §13.
 *
 * The ONLY thing an /open link may carry is an opaque one-time `code` and an opaque `state`. No token, no
 * PII, no target in the URL. The verified target comes back from the backend redeem result and is
 * re-validated client-side against the canonical allowlist before navigation.
 */

/** Approved Store hosts for Universal/App Links (production + staging). No other host is honored. */
export const APPROVED_STORE_HOSTS = ["store.DilMart.org", "staging-store.DilMart.org"] as const;
export const HANDOFF_OPEN_PATH = "/open";

/** Mirror the backend one-time-code / state bounds (customer-handoff.types BOUNDS). */
export const CODE_MAX_LEN = 512;
export const STATE_MAX_LEN = 512;

export type HandoffParams = { code: string; state: string };

export type ParseResult =
  | { ok: true; params: HandoffParams }
  | { ok: false; reason: string };

export type HandoffPlatform = "android" | "ios" | "web";
export type RedeemDevice = { platform: HandoffPlatform; appVersion?: string; deviceId?: string };

/** Customer-safe UX states for the /open handoff screen (§13). */
export type HandoffUxState =
  | "processing"
  | "success"
  | "retryable_error"
  | "expired"
  | "already_used"
  | "identity_verification_required"
  | "blocked"
  | "unavailable"
  | "invalid";
