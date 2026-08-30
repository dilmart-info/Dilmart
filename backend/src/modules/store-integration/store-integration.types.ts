/**
 * Types for DilMart Store Integration module.
 *
 * Security model:
 *  - DilMart Main signs a short-lived JWT (HS256) using DilMart_INTEGRATION_SECRET
 *  - Store Backend verifies signature, iss, aud, exp → issues StoreSessionToken
 *  - Barber App passes StoreSessionToken as `X-Store-Session` header
 *  - Marketplace APIs verify this header and derive trusted context from it
 */

export interface DilMartIntegrationTokenPayload {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  DilMartUserId: string;
  role: DilMartRole;
  salonVerified?: boolean;
  barbershopId?: string;
  shopName?: string;
  businessType?: string;
  displayName?: string;
  phone?: string;
  city?: string;
  sourceApp: SourceApp;
}

export type DilMartRole = "OWNER" | "BARBER" | "STAFF" | "CUSTOMER" | "ADMIN";

export type SourceApp = "barber_app" | "customer_app" | "store_web" | "admin";

export type StoreSegment =
  | "DilMart_APP_BARBER_OWNER"
  | "DilMart_APP_BARBER_STAFF"
  | "VERIFIED_SALON_OWNER"
  | "PROFESSIONAL_BARBER_UNVERIFIED"
  | "SALON_OWNER_LEAD"
  | "RETAIL_CUSTOMER"
  | "DilMart_APP_CUSTOMER";

export type StoreSurface = "web_store" | "barber_app" | "customer_app" | "all";

/**
 * Claims embedded in the X-Store-Session JWT.
 * These are TRUSTED — verified via HMAC before use.
 * Marketplace APIs must derive segment/businessType from these claims,
 * NOT from raw query params when this header is present.
 */
export interface StoreSessionClaims {
  linkedProfileId: string;
  segment: StoreSegment;
  DilMartUserId: string;
  DilMartBarbershopId?: string;
  businessType?: string;
  salonVerified?: boolean;
  sourceApp: SourceApp;
}

/** Viewer context used for product segmentation decisions */
export interface ViewerContext {
  surface: StoreSurface;
  segment?: StoreSegment;
  role?: DilMartRole;
  businessType?: string;
  salonVerified?: boolean;
  sourceApp?: SourceApp;
  /** True if context came from a verified X-Store-Session (trusted). False = from query params (untrusted). */
  isTrusted?: boolean;
  /** True if the session context requires verified_salon enforcement */
  requiresVerifiedSalonCheck?: boolean;
}

export type ResolvedAudience =
  | "customer"
  | "barber_staff"
  | "salon_owner"
  | "professional_buyer"
  | "all";

export interface DilMartSessionExchangeResponse {
  storeSessionToken: string;
  expiresIn: number;
  profile: {
    id: string;
    segment: StoreSegment;
    DilMartUserId: string;
    DilMartBarbershopId?: string;
    businessType?: string;
    displayName?: string;
    phone?: string;
    city?: string;
  };
}
