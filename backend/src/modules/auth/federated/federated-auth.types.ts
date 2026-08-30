/**
 * STORE-PR4 (DilMart-CUSTOMER-STORE-STORE-PR4) — Federated Store Session core types.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §9.
 */

/** Store-owned federated access-token claims (spec §9.2). */
export interface FederatedAccessClaims {
  iss: string;
  aud: string;
  sub: string; // store customer uuid
  sessionType: "DilMart_federated_customer";
  sessionFamilyId: string;
  linkedProfileId: string;
  DilMartUserId: string;
  role: "customer";
  origin: "customer_app";
  sessionVersion: number;
  jti: string;
  iat: number;
  nbf: number;
  exp: number;
}

/** The verified-actor foundation consumed by STORE-PR5 (not installed into the global guard in PR4). */
export interface VerifiedFederatedActor {
  actorRole: "customer";
  actorId: string; // store customer id
  actorEmail?: string | null;
  actorPhone?: string | null;
  authSource: "DilMart_federated";
  linkedProfileId: string;
  DilMartUserId: string;
  sessionFamilyId: string;
  sessionVersion: number;
}

export interface RedeemDevice {
  platform?: string;
  appVersion?: string;
  deviceId?: string;
}

/** Approved fixed lifetimes (spec §8.10). */
export const FEDERATED_LIFETIMES = {
  ACCESS_TTL_SECONDS: 600,
  REFRESH_TTL_SECONDS: 2592000,
  INACTIVE_TTL_SECONDS: 2592000,
  ABSOLUTE_TTL_SECONDS: 7776000,
} as const;

/** Refresh rate limit (spec §16.5). */
export const REFRESH_RATE = {
  PER_FAMILY_PER_HOUR: 30,
  WINDOW_SECONDS: 3600,
} as const;

export const BOUNDS = {
  REFRESH_TOKEN_MAX_LEN: 512,
  DEVICE_FIELD_MAX_LEN: 128,
} as const;
