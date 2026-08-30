/**
 * STORE-PR5 §Phase E — web HttpOnly refresh cookie (spec §9.3: "Web يستخدم Secure HttpOnly SameSite
 * cookie متى أمكن، لا localStorage").
 *
 * The raw federated refresh token, on the web, lives ONLY in this cookie — never in JS-reachable
 * storage or a JSON body the browser can read. The `__Host-` prefix is a browser-enforced contract:
 * it REQUIRES Secure + Path=/ + no Domain, which is exactly the isolation we want (no subdomain can
 * set/read it). Because `__Host-` mandates Secure, the cookie is always Secure — on plain-http local
 * dev the browser will refuse it, which is intended (dev uses body/native mode or https).
 */
import { isAllowedOrigin } from "../../../common/http/allowed-origins";

/** Cookie name. `__Host-` prefix ⇒ Secure + Path=/ + no Domain (host-locked). */
export const FEDERATED_REFRESH_COOKIE = "__Host-DilMart_store_frt";

function headerValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

/** Extract the federated refresh cookie value from a raw Cookie header. Returns null if absent/empty. */
export function readRefreshCookie(cookieHeader: string | string[] | undefined): string | null {
  const raw = headerValue(cookieHeader);
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name === FEDERATED_REFRESH_COOKIE) {
      const val = part.slice(idx + 1).trim();
      if (!val) return null;
      try {
        return decodeURIComponent(val);
      } catch {
        return val;
      }
    }
  }
  return null;
}

/**
 * Build the Set-Cookie header value. Max-Age MUST be the actual committed refresh lifetime returned by
 * the issuance/rotation path — never a hardcoded 30 days (§Phase E). A non-finite/negative value clamps to 0.
 */
export function buildRefreshCookie(token: string, maxAgeSeconds: number): string {
  const maxAge = Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0 ? Math.floor(maxAgeSeconds) : 0;
  return [
    `${FEDERATED_REFRESH_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

/** Set-Cookie value that clears the cookie (logout / definitive expiry / reuse detection). */
export function clearRefreshCookie(): string {
  return `${FEDERATED_REFRESH_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/**
 * Where a federated refresh token came from on this request:
 *  - `native`   : JSON body token, no cookie (mobile);
 *  - `web`      : HttpOnly cookie token, no body token, AND an allowed Origin (cookie-CSRF pass);
 *  - `none`     : neither (safe unauthenticated/expired handling);
 *  - `ambiguous`: BOTH a body token and a cookie were supplied → reject (no channel confusion);
 *  - `forbidden_origin`: a cookie was supplied but the Origin is not on the allowlist → CSRF reject.
 */
export type FederatedTokenSource =
  | { kind: "native"; token: string }
  | { kind: "web"; token: string }
  | { kind: "none" }
  | { kind: "ambiguous" }
  | { kind: "forbidden_origin" };

export function resolveFederatedTokenSource(
  headers: Record<string, string | string[] | undefined> | undefined,
  body: { refreshToken?: unknown } | undefined,
  originAllowed: (origin: string | undefined) => boolean = (o) => isAllowedOrigin(o),
): FederatedTokenSource {
  const rawBody = body?.refreshToken;
  const bodyToken = typeof rawBody === "string" && rawBody.trim() ? rawBody.trim() : null;
  const cookieToken = readRefreshCookie(headers?.cookie);

  if (bodyToken && cookieToken) return { kind: "ambiguous" };
  if (cookieToken) {
    const origin = headerValue(headers?.origin);
    if (!originAllowed(origin)) return { kind: "forbidden_origin" };
    return { kind: "web", token: cookieToken };
  }
  if (bodyToken) return { kind: "native", token: bodyToken };
  return { kind: "none" };
}
