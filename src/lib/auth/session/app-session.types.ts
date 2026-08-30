/**
 * STORE-PR5 §Phase F — source-neutral application session contract.
 *
 * A `StoreAppSession` is what every consumer (API layer, providers, pages) sees, regardless of whether the
 * identity came from a direct Supabase login or a DilMart federated handoff. The RAW federated refresh token
 * is intentionally ABSENT here — it lives only inside the federated adapter/native secure storage, or (web)
 * the HttpOnly cookie. It must never reach React Context / Query / Zustand / analytics / logs / errors.
 */

export type AppAuthSource = "supabase" | "DilMart_federated";

export type StoreAppUser = {
  id: string;
  email: string | null;
  phone: string | null;
};

export type StoreAppSession = {
  authSource: AppAuthSource;
  accessToken: string;
  /** epoch ms at which the access token expires. */
  accessExpiresAt: number;
  user: StoreAppUser;
  /** Present only for federated sessions. NON-secret metadata only (no tokens). */
  federated?: {
    linkedProfileId: string;
    /** epoch ms at which the refresh credential expires. */
    refreshExpiresAt: number;
  };
};

/** Capability flags mirrored from the backend `/auth/context` (§Phase A). */
export type AuthCapabilities = {
  customerCommerce: boolean;
  phoneIdentity: boolean;
  accountClaim: boolean;
  passwordManagement: boolean;
  federatedLogoutAll: boolean;
};

/** The subset of `/auth/context` the unified layer needs to publish authenticated-ready. */
export type AppAuthContext = {
  authSource: AppAuthSource | null;
  user: StoreAppUser;
  activeRole: string | null;
  roles: string[];
  capabilities: AuthCapabilities;
  claim_required?: boolean;
};

/**
 * The redeem result STORE-PR6 will hand to `establishFederatedSessionFromRedeem`. Matches master §8.8.
 * `session.refreshToken` is present for native; on web the server also sets the HttpOnly cookie and the
 * client discards this field immediately.
 */
export type FederatedRedeemResult = {
  status: "authenticated";
  session: {
    accessToken: string;
    expiresIn: number;
    refreshToken?: string;
    refreshExpiresIn: number;
  };
  customer: {
    id: string;
    displayName?: string | null;
    linkedProfileId: string;
    origin?: string;
  };
  target?: string;
};

/** Normalized single-flight refresh outcome (source-neutral). */
export type RefreshStatus =
  | "refreshed"
  | "no_session"
  | "transient_failure"
  | "definitive_failure"
  | "storage_error";

export type NormalizedRefresh = {
  status: RefreshStatus;
  accessToken: string | null;
  error?: unknown;
  /**
   * Set when a `refreshed` outcome could NOT be PROVEN to continue the identity held in memory (web only:
   * the __Host- refresh cookie is shared by every tab of the browser profile, so another tab's handoff
   * redeem can replace it). Note this is not the same claim as "a different human" — a replaced session
   * family is an untrusted identity-context transition even when `sub` is unchanged. The adapter has
   * already dropped the stale identity; the token MUST NOT be consumed by generic API traffic until
   * /auth/context re-resolves who it belongs to.
   */
  requiresIdentityRevalidation?: boolean;
};

/**
 * Result of asking for a usable access token. `getValidAccessToken()` collapses this to a string and
 * therefore cannot express an identity transition — callers that may act on the token must use the
 * outcome form and honour `requiresIdentityRevalidation`.
 */
export type AccessTokenOutcome = {
  /** Null when there is no usable token, or when the only available token is pending revalidation. */
  token: string | null;
  requiresIdentityRevalidation: boolean;
};

/** Raised when OS-encrypted secure storage cannot be read/written/removed. Never a silent success. */
export class FederatedStorageError extends Error {
  readonly code = "storage_error";
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "FederatedStorageError";
  }
}
