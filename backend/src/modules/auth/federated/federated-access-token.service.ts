/**
 * STORE-PR4 — Store federated access-token signing (spec §9.2). jose asymmetric (EdDSA/RS256), mandatory
 * kid. Not a DilMart/Supabase/X-Store-Session token; never placed in a URL.
 */
import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import * as jose from "jose";
import { FederatedAuthConfig } from "./federated-auth.config";

export interface AccessTokenContext {
  storeCustomerId: string;
  sessionFamilyId: string;
  linkedProfileId: string;
  DilMartUserId: string;
  sessionVersion: number;
}

@Injectable()
export class FederatedAccessTokenService {
  constructor(private readonly config: FederatedAuthConfig) {}

  /** Signs a 600-second access token. jti is generated here and returned for audit correlation. */
  async sign(ctx: AccessTokenContext): Promise<{ accessToken: string; jti: string; expiresIn: number }> {
    const key = await this.config.getPrivateKey();
    const jti = randomUUID();
    const ttl = this.config.accessTtlSeconds; // exactly 600
    const now = Math.floor(Date.now() / 1000);
    const accessToken = await new jose.SignJWT({
      sessionType: "DilMart_federated_customer",
      sessionFamilyId: ctx.sessionFamilyId,
      linkedProfileId: ctx.linkedProfileId,
      DilMartUserId: ctx.DilMartUserId,
      role: "customer",
      origin: "customer_app",
      sessionVersion: ctx.sessionVersion,
    })
      .setProtectedHeader({ alg: this.config.signingAlg, kid: this.config.signingKid })
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setSubject(ctx.storeCustomerId)
      .setJti(jti)
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + ttl)
      .sign(key);
    return { accessToken, jti, expiresIn: ttl };
  }
}
