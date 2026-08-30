import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type CachedToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAtMs: number;
};

@Injectable()
export class JenniAuthService {
  private readonly logger = new Logger(JenniAuthService.name);
  private cache: CachedToken | null = null;

  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string {
    return String(this.config.get("JENNI_API_BASE_URL") ?? "https://jenni.alzaeemexp.com/api").replace(/\/$/, "");
  }

  private username(): string {
    return String(this.config.get("JENNI_USERNAME") ?? "").trim();
  }

  private password(): string {
    return String(this.config.get("JENNI_PASSWORD") ?? "").trim();
  }

  private normalizeBearerToken(value: string): {
    token: string;
    hadBearerPrefix: boolean;
  } {
    const raw = String(value ?? "").trim();
    const hadBearerPrefix = /^Bearer\s+/i.test(raw);
    const token = raw.replace(/^Bearer\s+/i, "").trim();
    return { token, hadBearerPrefix };
  }

  isConfigured(): boolean {
    return !!(this.username() && this.password() && this.config.get("JENNI_SYSTEM_CODE"));
  }

  async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("Jenni API credentials are not configured.");
    }

    const now = Date.now();
    if (this.cache && this.cache.expiresAtMs > now + 30_000) {
      return this.cache.accessToken;
    }

    if (this.cache?.refreshToken) {
      try {
        const refreshed = await this.refresh(this.cache.refreshToken);
        if (refreshed) return refreshed;
      } catch {
        this.logger.warn("Jenni token refresh failed; performing login.");
      }
    }

    return this.login();
  }

  private async login(): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl()}/v2/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.username(),
          password: this.password(),
        }),
      });

      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        this.logger.error(`Jenni login success=false status=${response.status}`);
        throw new ServiceUnavailableException("Jenni authentication failed.");
      }

      let selectedTokenSource = "none";
      let rawToken = "";
      if (body.token !== undefined && body.token !== null) {
        selectedTokenSource = "token";
        rawToken = String(body.token);
      } else if (body.accessToken !== undefined && body.accessToken !== null) {
        selectedTokenSource = "accessToken";
        rawToken = String(body.accessToken);
      } else if (body.access_token !== undefined && body.access_token !== null) {
        selectedTokenSource = "access_token";
        rawToken = String(body.access_token);
      }
      rawToken = rawToken.trim();

      if (!rawToken) {
        this.logger.error(`Jenni login success=true | token exists=false`);
        throw new ServiceUnavailableException("Jenni authentication returned no token.");
      }

      const { token, hadBearerPrefix } = this.normalizeBearerToken(rawToken);
      const tokenLen = token.length;
      const dotCount = (token.match(/\./g) || []).length;

      const diagnosticsEnabled = String(this.config.get("JENNI_DIAGNOSTICS_ENABLED") ?? "").trim().toLowerCase() === "true";

      const rawRefreshToken = String(body.refreshToken ?? body.refresh_token ?? "").trim();
      const refreshToken = rawRefreshToken ? this.normalizeBearerToken(rawRefreshToken).token : undefined;
      const expiresInSec = Number(body.expiresIn ?? body.expires_in ?? 3600);

      if (diagnosticsEnabled) {
        const responseKeys = Object.keys(body).join(",");
        const startsWithBearer = token.toLowerCase().startsWith("bearer ");
        const refreshTokenExists = !!refreshToken;
        this.logger.log(
          `Jenni login success=true | selected_token_source=${selectedTokenSource} | selected_token_length=${tokenLen} | selected_token_dot_count=${dotCount} | login_response_keys=${responseKeys} | selected_token_had_bearer_prefix=${hadBearerPrefix} | selected_token_starts_with_bearer_after_normalization=${startsWithBearer} | refresh_token_exists=${refreshTokenExists} | expires_in=${expiresInSec}`
        );
      } else {
        this.logger.log(
          `Jenni login success=true | selected_token_source=${selectedTokenSource} | selected_token_length=${tokenLen} | selected_token_dot_count=${dotCount}`
        );
      }

      this.cache = {
        accessToken: token,
        refreshToken,
        expiresAtMs: Date.now() + Math.max(300, expiresInSec) * 1000,
      };
      return token;
    } catch (err: unknown) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      this.logger.error(
        `Jenni login success=false | error=${err instanceof Error ? err.message : String(err)}`
      );
      throw new ServiceUnavailableException("Jenni authentication failed due to network or parser error.");
    }
  }

  private async refresh(refreshToken: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl()}/v2/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${refreshToken}`,
        },
      });
      if (!response.ok) {
        this.logger.warn(`Jenni token refresh success=false status=${response.status}`);
        return null;
      }

      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const rawToken = String(body.token ?? body.accessToken ?? body.access_token ?? "").trim();
      if (!rawToken) {
        this.logger.warn(`Jenni token refresh success=false | no token in body`);
        return null;
      }

      const { token } = this.normalizeBearerToken(rawToken);

      const rawRefreshToken = String(body.refreshToken ?? body.refresh_token ?? refreshToken).trim();
      const nextRefresh = this.normalizeBearerToken(rawRefreshToken).token;

      const expiresInSec = Number(body.expiresIn ?? body.expires_in ?? 3600);
      this.cache = {
        accessToken: token,
        refreshToken: nextRefresh || undefined,
        expiresAtMs: Date.now() + Math.max(300, expiresInSec) * 1000,
      };

      this.logger.log(
        `Jenni token refresh success=true | token exists=true | token length=${token.length} | expires_in=${expiresInSec}`
      );
      return token;
    } catch (err: unknown) {
      this.logger.error(
        `Jenni token refresh success=false | error=${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  }

  // ── Safe Diagnostic (read-only, no credentials/tokens printed) ────────────

  /**
   * Test Jenni auth without printing credentials or tokens.
   * Returns a safe diagnostic result string.
   */
  async diagnoseAuth(): Promise<{
    result: "AUTH_OK" | "AUTH_FAILED" | "NON_JSON_RESPONSE" | "ENDPOINT_ERROR" | "NOT_CONFIGURED";
    httpStatus?: number;
    contentType?: string;
    bodyPreview?: string;
    safeMetadata?: {
      login_response_keys: string;
      selected_token_source: string;
      selected_token_length: number;
      selected_token_dot_count: number;
      selected_token_had_bearer_prefix: boolean;
      selected_token_starts_with_bearer_after_normalization: boolean;
      refresh_token_exists: boolean;
      expires_in: number;
    };
  }> {
    if (!this.isConfigured()) {
      return { result: "NOT_CONFIGURED" };
    }

    try {
      const response = await fetch(`${this.baseUrl()}/v2/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.username(),
          password: this.password(),
        }),
      });

      const contentType = response.headers.get("content-type") ?? "unknown";
      const rawText = await response.text();
      // Safe preview: first 120 chars, non-printable replaced, no tokens
      const bodyPreview = rawText
        .replace(/[^\x20-\x7E\u0600-\u06FF]/g, "?")
        .replace(/"(?:token|access_token|accessToken|refreshToken|refresh_token)"\s*:\s*"[^"]*"/g, '"***":"[REDACTED]"')
        .slice(0, 120);

      if (!response.ok) {
        return { result: "AUTH_FAILED", httpStatus: response.status, contentType, bodyPreview };
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = rawText ? JSON.parse(rawText) : {};
      } catch {
        return { result: "NON_JSON_RESPONSE", httpStatus: response.status, contentType, bodyPreview };
      }

      let selectedTokenSource = "none";
      let rawToken = "";
      if (parsed.token !== undefined && parsed.token !== null) {
        selectedTokenSource = "token";
        rawToken = String(parsed.token);
      } else if (parsed.accessToken !== undefined && parsed.accessToken !== null) {
        selectedTokenSource = "accessToken";
        rawToken = String(parsed.accessToken);
      } else if (parsed.access_token !== undefined && parsed.access_token !== null) {
        selectedTokenSource = "access_token";
        rawToken = String(parsed.access_token);
      }
      rawToken = rawToken.trim();

      if (!rawToken) {
        return { result: "AUTH_FAILED", httpStatus: response.status, contentType, bodyPreview: "no token field" };
      }

      const { token, hadBearerPrefix } = this.normalizeBearerToken(rawToken);
      const responseKeys = Object.keys(parsed).join(",");
      const dotCount = (token.match(/\./g) || []).length;
      const startsWithBearer = token.toLowerCase().startsWith("bearer ");
      const rawRefreshToken = String(parsed.refreshToken ?? parsed.refresh_token ?? "").trim();
      const refreshToken = rawRefreshToken ? this.normalizeBearerToken(rawRefreshToken).token : undefined;
      const refreshTokenExists = !!refreshToken;
      const expiresInSec = Number(parsed.expiresIn ?? parsed.expires_in ?? 3600);

      const diagnosticsEnabled = String(this.config.get("JENNI_DIAGNOSTICS_ENABLED") ?? "").trim().toLowerCase() === "true";
      if (diagnosticsEnabled) {
        this.logger.log(
          `Jenni diagnoseAuth success=true | login_response_keys=${responseKeys} | selected_token_source=${selectedTokenSource} | selected_token_length=${token.length} | selected_token_dot_count=${dotCount} | selected_token_had_bearer_prefix=${hadBearerPrefix} | selected_token_starts_with_bearer_after_normalization=${startsWithBearer} | refresh_token_exists=${refreshTokenExists} | expires_in=${expiresInSec}`
        );
      }

      return {
        result: "AUTH_OK",
        httpStatus: response.status,
        contentType,
        safeMetadata: diagnosticsEnabled
          ? {
              login_response_keys: responseKeys,
              selected_token_source: selectedTokenSource,
              selected_token_length: token.length,
              selected_token_dot_count: dotCount,
              selected_token_had_bearer_prefix: hadBearerPrefix,
              selected_token_starts_with_bearer_after_normalization: startsWithBearer,
              refresh_token_exists: refreshTokenExists,
              expires_in: expiresInSec,
            }
          : undefined,
      };
    } catch (err: unknown) {
      return {
        result: "ENDPOINT_ERROR",
        bodyPreview: err instanceof Error ? err.message.slice(0, 120) : "unknown error",
      };
    }
  }
}
