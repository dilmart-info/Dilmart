/**
 * STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Customer Handoff types & constants.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §8, §10, §11, §16.2, §16.5, §8.10.
 */

/** Verified Main→Store customer assertion (spec §8.3). Fields the Store trusts after verify. */
export interface CustomerHandoffAssertion {
  iss: string;
  aud: string;
  sub: string; // DilMart user uuid
  jti: string;
  iat: number;
  nbf: number;
  exp: number;
  role: "CUSTOMER";
  sourceApp: "customer_app";
  displayName?: string;
  phone?: string;
  phoneVerified: boolean;
  phoneVerifiedAt?: string | null;
  email?: string;
  emailVerified: boolean;
  emailVerifiedAt?: string | null;
  locale?: string;
  city?: string;
  target: string;
  sourceSurface: string;
  campaign?: string;
  clientStateHash: string;
  /** kid from the verified protected header (bookkeeping/audit only). */
  kid: string;
}

export type IdentityOutcome = "LINKED" | "LINK_REQUIRED" | "BLOCKED";
export type LinkMethod =
  | "EXISTING_LINK"
  | "VERIFIED_PHONE"
  | "VERIFIED_EMAIL"
  | "NEW_FEDERATED"
  | "MANUAL_REVIEW";
export type LinkStatus = "LINKED" | "LINK_REQUIRED" | "BLOCKED" | "REVOKED";
export type IdentityAssurance = "DilMart_SESSION" | "OTP_PHONE" | "OTP_EMAIL" | "MANUAL";

/** Result of the deterministic identity resolver. The resolver DECIDES and provisions the external
 *  shadow auth user; it performs NO store_linked_profiles write — the atomic finalize RPC persists the
 *  link + handoff + audit together, so the caller receives the full metadata to persist. */
export interface IdentityResolution {
  outcome: IdentityOutcome;
  storeCustomerId: string | null;
  linkMethod: LinkMethod | null;
  linkStatus: LinkStatus | null;
  identityAssurance: IdentityAssurance | null;
  /** true only for EXISTING_LINK reuse (finalize just refreshes last_handoff_at). */
  reuseExisting: boolean;
  existingLinkedProfileId: string | null;
  /** Safe, non-PII reason for a LINK_REQUIRED / BLOCKED outcome (audit + conflict_reason). */
  conflictReason?: string;
}

export interface PrepareResult {
  handoffId: string;
  handoffUrl: string;
  expiresIn: number;
  target: string;
}

export interface RedeemDevice {
  platform?: string;
  appVersion?: string;
  deviceId?: string;
}

// ── Spec-approved durations (§8.10) ────────────────────────────────────────────
export const HANDOFF_DEFAULTS = {
  /** Handoff code TTL (spec §8.10 / §16.2). */
  CODE_TTL_SECONDS: 120,
  /** Maximum Main internal assertion lifetime (spec §8.10). */
  ASSERTION_MAX_TTL_SECONDS: 60,
  /** Bounded clock tolerance for assertion time claims. */
  CLOCK_TOLERANCE_SECONDS: 5,
} as const;

// ── Rate limits (spec §16.5) ────────────────────────────────────────────────────
export const RATE_LIMITS = {
  PREPARE_PER_USER_PER_MIN: 20,
  REDEEM_PER_DEVICE_PER_MIN: 10,
} as const;

// ── Bounds ──────────────────────────────────────────────────────────────────────
export const BOUNDS = {
  /** Opaque client state: 256-bit → 43 base64url chars; allow a small band. */
  STATE_MIN_LEN: 32,
  STATE_MAX_LEN: 512,
  CODE_MAX_LEN: 512,
  JTI_MIN_LEN: 8,
  JTI_MAX_LEN: 200,
  SOURCE_SURFACE_MAX_LEN: 64,
  CAMPAIGN_MAX_LEN: 64,
  DEVICE_FIELD_MAX_LEN: 128,
} as const;

/** Reserved, non-routable domain for shadow federated customers (cannot receive real email). */
export const FEDERATED_CUSTOMER_EMAIL_DOMAIN = "federated.DilMart.internal";
export const FEDERATED_ACCOUNT_MARKER = "DilMart_federated_customer";
