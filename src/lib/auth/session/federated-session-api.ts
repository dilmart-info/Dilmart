/**
 * STORE-PR5 §Phase H — typed federated auth client.
 *
 *   POST /auth/federated/refresh | /logout | /logout-all
 *   GET  /auth/context
 *
 * Native: the refresh token travels in the JSON body. Web: the body carries NO refresh token and the
 * request uses `credentials: "include"` so the HttpOnly cookie is sent. Request bodies for these endpoints
 * are NEVER logged. HTTP outcomes are classified so the adapter can obey the refresh lifecycle:
 *   401 → definitive (clear); 5xx / network / timeout → transient (preserve).
 */

import type { AppAuthContext } from "./app-session.types";

export type FederatedRefreshResponse = {
  session: { accessToken: string; expiresIn: number; refreshToken?: string; refreshExpiresIn: number };
};

export type FederatedApiResult<T> =
  | { ok: true; data: T }
  // definitive = 401 (invalid/expired/reuse → clear); forbidden = 403 (authenticated but not allowed →
  // NEVER clears/refreshes); transient = 5xx / network / timeout (preserve session).
  | { ok: false; kind: "definitive" | "forbidden" | "transient"; status: number };

export type FederatedApiDeps = {
  baseUrl?: string;
  isNative?: () => boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 20_000;

export class FederatedSessionApi {
  private readonly baseUrl: string;
  private readonly isNative: () => boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(deps: FederatedApiDeps = {}) {
    this.baseUrl = deps.baseUrl ?? (import.meta.env.VITE_STORE_API_BASE_URL ?? "http://localhost:4000/api");
    this.isNative = deps.isNative ?? (() => false);
    this.fetchImpl = deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Native passes the raw refresh token; web passes undefined and relies on the cookie.
   *
   * BOTH must send `device`. The redeem binds the session family to the app-scoped device id, and
   * `rotate_federated_refresh_token` rejects a rotation whose device hash does not match that binding
   * ("a bound family requires the same device hash at refresh"). Omitting it on web made every web
   * refresh fail closed as FEDERATED_SESSION_EXPIRED (401), which cleared the cookie and silently
   * ended the federated session on the first reload. The web token still travels ONLY in the
   * HttpOnly cookie — sending `refreshToken` in the body here would trip the channel-confusion
   * guard (FEDERATED_AUTH_AMBIGUOUS, 400).
   */
  async refresh(refreshToken: string | undefined, deviceId?: string): Promise<FederatedApiResult<FederatedRefreshResponse>> {
    const native = this.isNative();
    const device = deviceId ? { platform: native ? "native" : "web", deviceId } : undefined;
    const body = native ? { refreshToken, device } : device ? { device } : {};
    return this.post<FederatedRefreshResponse>("/auth/federated/refresh", body);
  }

  async logout(refreshToken: string | undefined): Promise<FederatedApiResult<{ status: string }>> {
    const body = this.isNative() ? { refreshToken } : {};
    return this.post<{ status: string }>("/auth/federated/logout", body);
  }

  async logoutAll(refreshToken: string | undefined): Promise<FederatedApiResult<{ status: string }>> {
    const body = this.isNative() ? { refreshToken } : {};
    return this.post<{ status: string }>("/auth/federated/logout-all", body);
  }

  /** Fetch the source-aware auth context with the current federated access token. */
  async getContext(accessToken: string): Promise<FederatedApiResult<AppAuthContext>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/auth/context`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
        signal: controller.signal,
      });
      if (res.ok) return { ok: true, data: (await res.json()) as AppAuthContext };
      // 401 → session invalid (definitive). 403 → authenticated-but-forbidden (must NOT clear the session).
      const kind = res.status === 401 ? "definitive" : res.status === 403 ? "forbidden" : "transient";
      return { ok: false, kind, status: res.status };
    } catch {
      return { ok: false, kind: "transient", status: 0 };
    } finally {
      clearTimeout(timer);
    }
  }

  private async post<T>(path: string, body: unknown): Promise<FederatedApiResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });
      if (res.ok) {
        const text = await res.text();
        return { ok: true, data: (text ? JSON.parse(text) : {}) as T };
      }
      // 401 = definitive refresh rejection (invalid/expired/reuse). 403 = forbidden (never clears). 5xx/0 =
      // transient (preserve session). Any other 4xx is a definitive client/auth rejection.
      const kind =
        res.status === 401 ? "definitive" : res.status === 403 ? "forbidden" : res.status >= 500 || res.status === 0 ? "transient" : "definitive";
      return { ok: false, kind, status: res.status };
    } catch {
      return { ok: false, kind: "transient", status: 0 };
    } finally {
      clearTimeout(timer);
    }
  }
}
