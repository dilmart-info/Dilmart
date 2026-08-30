/**
 * STORE-PR4 — Opaque rotating refresh tokens (spec §9.3, §16). The RAW token exists only in backend
 * memory + the HTTPS response; PostgreSQL stores ONLY a keyed HMAC-SHA256 hash. The device id is stored
 * only as a keyed hash. No raw token/device value is ever logged or persisted.
 */
import { Injectable } from "@nestjs/common";
import { createHmac, randomBytes } from "crypto";
import { FederatedAuthConfig } from "./federated-auth.config";

@Injectable()
export class FederatedRefreshTokenService {
  constructor(private readonly config: FederatedAuthConfig) {}

  private key(): Buffer {
    return Buffer.from(this.config.getRefreshHashSecret(), "base64url");
  }

  /** 256-bit CSPRNG raw token (base64url). */
  generateRawToken(): string {
    return randomBytes(32).toString("base64url");
  }

  /** Keyed HMAC-SHA256(rawToken) — the only value stored in the DB. */
  hashToken(rawToken: string): string {
    return createHmac("sha256", this.key()).update(rawToken, "utf8").digest("base64url");
  }

  /** Keyed, domain-separated device-id hash (non-reversible). Null when no device id is supplied. */
  hashDevice(deviceId: string | undefined | null): string | null {
    const d = (deviceId ?? "").trim();
    if (!d) return null;
    return createHmac("sha256", this.key()).update(`device:${d}`, "utf8").digest("base64url");
  }
}
