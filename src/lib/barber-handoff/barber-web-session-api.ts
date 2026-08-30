/**
 * Typed client for the Barber B2B web-session consumer:
 *   GET  /integrations/DilMart/barber/web-session
 *   POST /integrations/DilMart/barber/web-session/logout
 *
 * Cookie-only (__Host-DilMart_store_bwt) — `credentials: "include"` so the browser sends the
 * HttpOnly cookie; this client never reads or holds the raw session token itself, only the safe
 * `{ status, barber? }` body the backend returns.
 */

export interface BarberWebSessionIdentity {
  linkedProfileId: string;
  DilMartUserId: string;
  DilMartBarbershopId: string;
  role: "OWNER" | "BARBER";
  displayName: string | null;
  shopName: string | null;
  phone: string | null;
  city: string | null;
  businessType: string | null;
}

export type BarberWebSessionCheckOutcome =
  | { kind: "authenticated"; barber: BarberWebSessionIdentity }
  | { kind: "unauthenticated" }
  | { kind: "unavailable" };

/** "confirmed" means the backend actually revoked the session (2xx). "unavailable" covers every
 *  failure mode (network error, non-2xx) — the caller must NOT treat this as a successful logout,
 *  since the session may still be ACTIVE server-side. */
export type BarberWebSessionLogoutOutcome = { kind: "confirmed" } | { kind: "unavailable" };

export interface BarberWebSessionApiDeps {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function isIdentity(v: unknown): v is BarberWebSessionIdentity {
  const b = v as Record<string, unknown> | null;
  return (
    !!b &&
    typeof b.linkedProfileId === "string" &&
    typeof b.DilMartUserId === "string" &&
    typeof b.DilMartBarbershopId === "string" &&
    (b.role === "OWNER" || b.role === "BARBER")
  );
}

function baseUrlOf(deps: BarberWebSessionApiDeps): string {
  return deps.baseUrl ?? (import.meta.env.VITE_STORE_API_BASE_URL ?? "http://localhost:4000/api");
}

export async function fetchBarberWebSession(deps: BarberWebSessionApiDeps = {}): Promise<BarberWebSessionCheckOutcome> {
  const fetchImpl = deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 8_000);
  try {
    const res = await fetchImpl(`${baseUrlOf(deps)}/integrations/DilMart/barber/web-session`, {
      method: "GET",
      credentials: "include",
      signal: controller.signal,
    });
    if (!res.ok) return { kind: "unavailable" };
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return { kind: "unavailable" };
    }
    if (body.status === "authenticated" && isIdentity(body.barber)) {
      return { kind: "authenticated", barber: body.barber };
    }
    return { kind: "unauthenticated" };
  } catch {
    return { kind: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

export async function logoutBarberWebSession(deps: BarberWebSessionApiDeps = {}): Promise<BarberWebSessionLogoutOutcome> {
  const fetchImpl = deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 8_000);
  try {
    const res = await fetchImpl(`${baseUrlOf(deps)}/integrations/DilMart/barber/web-session/logout`, {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
    });
    return res.ok ? { kind: "confirmed" } : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
