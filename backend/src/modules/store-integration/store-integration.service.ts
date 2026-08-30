import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import {
  DilMartIntegrationTokenPayload,
  DilMartSessionExchangeResponse,
  StoreSessionClaims,
  StoreSegment,
} from "./store-integration.types";
import { ProductVisibilityService } from "./product-visibility.service";

@Injectable()
export class StoreIntegrationService {
  private readonly logger = new Logger(StoreIntegrationService.name);
  private readonly visibilityService = new ProductVisibilityService();

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly config: ConfigService,
  ) {}

  private get integrationSecret(): string {
    const secret = this.config.get<string>("DilMart_INTEGRATION_SECRET");
    if (!secret) throw new Error("DilMart_INTEGRATION_SECRET is not configured.");
    return secret;
  }

  private get expectedIssuer(): string {
    return this.config.get<string>("DilMart_SESSION_ISSUER") ?? "DilMart-main";
  }

  private get expectedAudience(): string {
    return this.config.get<string>("DilMart_SESSION_AUDIENCE") ?? "DilMart-store";
  }

  private get sessionTtlSeconds(): number {
    return Number(this.config.get<string>("DilMart_SESSION_TTL_SECONDS") ?? "900");
  }

  // ─── Integration Token Verification (incoming from DilMart Main) ───────────

  private verifyIntegrationToken(rawToken: string): DilMartIntegrationTokenPayload {
    const parts = rawToken.split(".");
    if (parts.length !== 3) throw new UnauthorizedException("Invalid token format.");

    const [headerB64, payloadB64, sigB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    const expectedSig = createHmac("sha256", this.integrationSecret)
      .update(signingInput)
      .digest("base64url");

    const sigBuffer = Buffer.from(sigB64, "base64url");
    const expectedBuffer = Buffer.from(expectedSig, "base64url");

    if (sigBuffer.length !== expectedBuffer.length) {
      this.logger.warn("[store-integration] Token signature length mismatch.");
      throw new UnauthorizedException("Token signature is invalid.");
    }
    if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
      this.logger.warn("[store-integration] Token HMAC failed.");
      throw new UnauthorizedException("Token signature is invalid.");
    }

    let payload: DilMartIntegrationTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    } catch {
      throw new UnauthorizedException("Token payload is malformed.");
    }

    if (payload.iss !== this.expectedIssuer) {
      this.logger.warn(`[store-integration] Invalid iss: ${payload.iss}`);
      throw new UnauthorizedException("Token issuer is invalid.");
    }
    if (payload.aud !== this.expectedAudience) {
      this.logger.warn(`[store-integration] Invalid aud: ${payload.aud}`);
      throw new UnauthorizedException("Token audience is invalid.");
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= nowSeconds) {
      this.logger.warn("[store-integration] Token expired.");
      throw new UnauthorizedException("Token has expired.");
    }

    if (!payload.DilMartUserId || !payload.role || !payload.sourceApp) {
      throw new BadRequestException("Token payload is missing required fields.");
    }

    return payload;
  }

  // ─── Store Session Token (issued to Barber App for subsequent requests) ───

  /**
   * Issues a short-lived store session token embedding profile context.
   * The Barber App passes this as `X-Store-Session` header on subsequent requests.
   */
  issueStoreSessionToken(claims: StoreSessionClaims): { token: string; expiresAt: number } {
    const expiresAt = Math.floor(Date.now() / 1000) + this.sessionTtlSeconds;
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payloadData: StoreSessionClaims & { iss: string; exp: number; iat: number } = {
      ...claims,
      iss: "DilMart-store",
      exp: expiresAt,
      iat: Math.floor(Date.now() / 1000),
    };
    const payloadB64 = Buffer.from(JSON.stringify(payloadData)).toString("base64url");
    const sig = createHmac("sha256", this.integrationSecret)
      .update(`${header}.${payloadB64}`)
      .digest("base64url");
    return { token: `${header}.${payloadB64}.${sig}`, expiresAt };
  }

  /**
   * Verifies an X-Store-Session header and returns the embedded claims.
   * Returns null if no header is present (anonymous/public request).
   * Throws 401 if the header is present but invalid/expired.
   */
  verifyStoreSessionHeader(rawHeader: string | undefined): StoreSessionClaims | null {
    if (!rawHeader) return null;

    const parts = rawHeader.split(".");
    if (parts.length !== 3) throw new UnauthorizedException("Invalid X-Store-Session format.");

    const [headerB64, payloadB64, sigB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    const expectedSig = createHmac("sha256", this.integrationSecret)
      .update(signingInput)
      .digest("base64url");

    const sigBuffer = Buffer.from(sigB64, "base64url");
    const expectedBuffer = Buffer.from(expectedSig, "base64url");

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      this.logger.warn("[store-session] X-Store-Session signature invalid.");
      throw new UnauthorizedException("Store session token is invalid.");
    }

    let claims: StoreSessionClaims & { iss?: string; exp?: number };
    try {
      claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    } catch {
      throw new UnauthorizedException("Store session token payload is malformed.");
    }

    // Verify issuer (must be 'DilMart-store' — tokens issued by this service)
    if (claims.iss && claims.iss !== "DilMart-store") {
      this.logger.warn(`[store-session] Invalid iss claim: ${claims.iss}`);
      throw new UnauthorizedException("Store session token issuer is invalid.");
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!claims.exp || claims.exp <= nowSeconds) {
      throw new UnauthorizedException("Store session has expired. Please re-exchange.");
    }

    if (!claims.linkedProfileId || !claims.segment) {
      throw new UnauthorizedException("Store session token is missing required claims.");
    }

    return claims;
  }

  // ─── Session Exchange ──────────────────────────────────────────────────────

  async exchangeSession(rawToken: string): Promise<DilMartSessionExchangeResponse> {
    // 1) Verify DilMart Main integration token
    const payload = this.verifyIntegrationToken(rawToken);

    // 2) Compute segment
    const segment: StoreSegment = this.visibilityService.computeSegmentFromToken({
      role: payload.role,
      sourceApp: payload.sourceApp,
      barbershopId: payload.barbershopId,
    });

    // 3) Upsert store_linked_profiles
    const profileData = {
      DilMart_user_id: payload.DilMartUserId,
      DilMart_role: payload.role,
      DilMart_barbershop_id: payload.barbershopId ?? null,
      segment,
      display_name: payload.displayName ?? null,
      phone: payload.phone ?? null,
      city: payload.city ?? null,
      business_type: payload.businessType ?? null,
      source_app: payload.sourceApp,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: linkedProfile, error: upsertError } = await this.supabaseAdmin.client
      .from("store_linked_profiles")
      .upsert(profileData, { onConflict: "DilMart_user_id", ignoreDuplicates: false })
      .select("id, segment, DilMart_user_id, DilMart_barbershop_id, business_type, display_name, phone, city")
      .single();

    if (upsertError) {
      this.logger.error(`[store-integration] Upsert failed: ${upsertError.message}`);
      throw upsertError;
    }

    const profile = linkedProfile as any;

    // 4) store_customer_id resolution:
    //    Deferred — Cart/Checkout phase will resolve/create a Store customer profile.
    //    The linked_profile.store_customer_id will be populated when the user
    //    first completes a checkout flow in the Store with their session.
    //    This is documented as a known limitation for this phase.

    this.logger.log(
      `[store-integration] Session exchanged: DilMartUserId=${payload.DilMartUserId} segment=${segment} app=${payload.sourceApp}`,
    );

    // 5) Issue store session token (X-Store-Session) with embedded context
    const sessionClaims: StoreSessionClaims = {
      linkedProfileId: profile.id,
      segment: profile.segment,
      DilMartUserId: profile.DilMart_user_id,
      DilMartBarbershopId: profile.DilMart_barbershop_id ?? undefined,
      businessType: profile.business_type ?? undefined,
      salonVerified: payload.salonVerified === true,
      sourceApp: payload.sourceApp,
    };

    const { token: storeSessionToken } = this.issueStoreSessionToken(sessionClaims);

    return {
      storeSessionToken,
      expiresIn: this.sessionTtlSeconds,
      profile: {
        id: profile.id,
        segment: profile.segment,
        DilMartUserId: profile.DilMart_user_id,
        DilMartBarbershopId: profile.DilMart_barbershop_id ?? undefined,
        businessType: profile.business_type ?? undefined,
        displayName: profile.display_name ?? undefined,
        phone: profile.phone ?? undefined,
        city: profile.city ?? undefined,
      },
    };
  }
}
