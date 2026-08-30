/**
 * Barber/Owner web handoff — types & constants.
 *
 * Sibling of ../customer-handoff (same hash-only, single-use, DB-time-expiry pattern), deliberately
 * simpler: a Barber/Owner assertion identifies an EXISTING, already-verified DilMart user 1:1 via
 * store_linked_profiles.DilMart_user_id — there is no phone/email-based identity resolution, no
 * shadow account provisioning, and no LINK_REQUIRED/BLOCKED ambiguity to record.
 *
 * The web session this handoff establishes is intentionally a single opaque, hash-only, revocable
 * bearer token (see barber-web-session.service.ts) rather than a duplicate of the Customer
 * federated system's asymmetric-JWT + rotating-refresh-token-family architecture — that machinery
 * exists to serve a high-frequency consumer shopping session; a lower-frequency B2B "check the
 * store" session is correctly served by a simpler, still-secure, instantly-revocable model.
 */

/** Verified Main→Store Barber/Owner assertion. Fields the Store trusts after verify(). */
export interface BarberHandoffAssertion {
  iss: string;
  aud: string;
  sub: string; // DilMart user uuid
  jti: string;
  iat: number;
  nbf: number;
  exp: number;
  role: "OWNER" | "BARBER";
  sourceApp: "barber_app";
  barbershopId: string;
  salonVerified: boolean;
  shopName?: string;
  businessType?: string;
  displayName?: string;
  phone?: string;
  city?: string;
  target: string;
  sourceSurface: string;
  clientStateHash: string;
  /** kid from the verified protected header (bookkeeping/audit only). */
  kid: string;
}

export interface PrepareResult {
  handoffId: string;
  handoffUrl: string;
  expiresIn: number;
  target: string;
}

export interface AuthenticatedRedeemResult {
  status: "authenticated";
  barber: {
    linkedProfileId: string;
    DilMartUserId: string;
    DilMartBarbershopId: string;
    role: "OWNER" | "BARBER";
    displayName: string | null;
    shopName: string | null;
  };
  target: string;
}

/** Safe B2B identity fields — exactly the store_linked_profiles columns the Barber handoff owns.
 *  shopName mirrors AuthenticatedRedeemResult (always null today — no shop_name column exists;
 *  not invented here, kept for shape parity with the redeem response). */
export interface BarberWebSessionIdentity {
  linkedProfileId: string;
  DilMartUserId: string;
  DilMartBarbershopId: string;
  role: "OWNER" | "BARBER";
  displayName: string | null;
  shopName: string | null;
  phone: string | null;
  city: string | null;
  businessType: string | null;
}

export type BarberWebSessionResult =
  | { status: "authenticated"; barber: BarberWebSessionIdentity }
  | { status: "unauthenticated" };

// ── Spec-mirrored durations ───────────────────────────────────────────────────
export const BARBER_HANDOFF_DEFAULTS = {
  /** Handoff code TTL — matches the Customer handoff contract exactly (same class of secret). */
  CODE_TTL_SECONDS: 120,
  /** Maximum Main internal assertion lifetime. */
  ASSERTION_MAX_TTL_SECONDS: 60,
  CLOCK_TOLERANCE_SECONDS: 5,
  /** Web session absolute TTL: a work-shift-length window, not a rolling multi-day session. Renewed
   *  by tapping the CTA again (a fresh handoff), never silently extended. */
  SESSION_TTL_SECONDS: 12 * 60 * 60,
} as const;

// ── Rate limits ─────────────────────────────────────────────────────────────────
export const BARBER_RATE_LIMITS = {
  PREPARE_PER_USER_PER_MIN: 20,
  REDEEM_PER_IP_PER_MIN: 10,
} as const;

// ── Bounds ──────────────────────────────────────────────────────────────────────
export const BARBER_BOUNDS = {
  STATE_MIN_LEN: 32,
  STATE_MAX_LEN: 512,
  CODE_MAX_LEN: 512,
  JTI_MIN_LEN: 8,
  JTI_MAX_LEN: 200,
  SOURCE_SURFACE_MAX_LEN: 64,
} as const;
