/**
 * Barber/Owner web session cookie. Same isolation properties as the Customer federated refresh
 * cookie (__Host- prefix ⇒ Secure + Path=/ + no Domain, HttpOnly) but its own, distinct cookie
 * name — never shares storage with, or can be confused with, a Customer session.
 *
 * SameSite=None (review P1): in the deployed topology the page runs on store.DilMart.org while
 * API calls go to the backend host, so this cookie accompanies CROSS-SITE credentialed fetches —
 * SameSite=Lax would silently never be sent on those, leaving the session unusable. None
 * requires Secure (already mandatory via __Host-). CSRF consequence, binding on every future
 * consumer: ANY endpoint that reads this cookie MUST enforce the strict Origin-allowlist check
 * (the same resolveFederatedTokenSource pattern in ../../auth/federated/federated-cookie.ts) —
 * see `resolveBarberWebSessionToken` below, the consumer-side counterpart. Consumed by
 * GET/POST /integrations/DilMart/barber/web-session(/logout) in the DEDICATED
 * barber-web-session.controller.ts — not barber-handoff.controller.ts (see that controller's own
 * doc comment for why the split is deliberate: a shared class prefix previously caused these
 * routes to register one path segment off from what the frontend actually calls).
 */
import { isAllowedOrigin } from "../../../common/http/allowed-origins";

export const BARBER_WEB_SESSION_COOKIE = "__Host-DilMart_store_bwt";

function headerValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

export function readBarberWebSessionCookie(cookieHeader: string | string[] | undefined): string | null {
  const raw = headerValue(cookieHeader);
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name === BARBER_WEB_SESSION_COOKIE) {
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

/** Max-Age MUST be the actual committed session TTL — never a hardcoded value. A non-positive
 *  TTL is a configuration defect: fail loudly instead of silently emitting Max-Age=0 (which the
 *  browser drops immediately, leaving an "authenticated" response with no usable session). */
export function buildBarberWebSessionCookie(token: string, maxAgeSeconds: number): string {
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Error("Barber web session TTL must be a positive number of seconds.");
  }
  const maxAge = Math.floor(maxAgeSeconds);
  return [
    `${BARBER_WEB_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Path=/",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

export function clearBarberWebSessionCookie(): string {
  return `${BARBER_WEB_SESSION_COOKIE}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`;
}

/**
 * Consumer-side counterpart of `resolveFederatedTokenSource` (federated-cookie.ts), specialised
 * for this cookie-only (no body-token variant) B2B session: a cookie without an approved Origin
 * is indistinguishable, on the wire, from no cookie at all — both collapse to a safe
 * "unauthenticated" outcome upstream. `forbidden_origin` is kept as its own variant only so the
 * caller CAN log the distinction server-side; it must never change the response shape sent to
 * the browser (no oracle for probing the allowlist).
 */
export type BarberWebSessionTokenSource =
  | { kind: "present"; token: string }
  | { kind: "none" }
  | { kind: "forbidden_origin" };

export function resolveBarberWebSessionToken(
  headers: Record<string, string | string[] | undefined> | undefined,
  originAllowed: (origin: string | undefined) => boolean = (o) => isAllowedOrigin(o),
): BarberWebSessionTokenSource {
  const cookieToken = readBarberWebSessionCookie(headers?.cookie);
  if (!cookieToken) return { kind: "none" };
  const origin = headerValue(headers?.origin);
  if (!originAllowed(origin)) return { kind: "forbidden_origin" };
  return { kind: "present", token: cookieToken };
}
