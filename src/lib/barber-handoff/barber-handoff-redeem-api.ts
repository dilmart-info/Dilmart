/**
 * Typed client for the Barber Handoff one-time redeem:
 *   POST /integrations/DilMart/barber/handoff/redeem
 *
 * `credentials: "include"` so the browser receives and later sends the `__Host-DilMart_store_bwt`
 * HttpOnly session cookie the backend sets on success (see backend/src/modules/store-integration/
 * barber-handoff/barber-web-cookie.ts) — this client never sees or handles the session token
 * itself, only the safe `{ barber, target }` success body. The raw request body (code/state) is
 * NEVER logged.
 */
import { parseHandoffQuery } from "../deep-link/store-open-url";

export type BarberRedeemErrorCode =
  | "HANDOFF_EXPIRED"
  | "HANDOFF_ALREADY_REDEEMED"
  | "HANDOFF_INVALID"
  | "HANDOFF_STATE_MISMATCH"
  | "HANDOFF_RATE_LIMITED"
  | "STORE_UNAVAILABLE"
  | "STORE_INTEGRATION_DISABLED"
  | "UNKNOWN";

export interface BarberHandoffSuccess {
  status: "authenticated";
  barber: {
    linkedProfileId: string;
    DilMartUserId: string;
    DilMartBarbershopId: string;
    role: "OWNER" | "BARBER";
    displayName: string | null;
    shopName: string | null;
  };
  target: string;
}

export type BarberRedeemOutcome =
  | { kind: "authenticated"; result: BarberHandoffSuccess }
  | { kind: "error"; code: BarberRedeemErrorCode; retryable: boolean };

export interface BarberRedeemApiDeps {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// Only these can legitimately succeed on a retry of the SAME code.
const RETRYABLE: ReadonlySet<string> = new Set(["HANDOFF_RATE_LIMITED", "STORE_UNAVAILABLE"]);

function isBarberSuccessBody(body: Record<string, unknown>): body is BarberHandoffSuccess {
  if (body.status !== "authenticated") return false;
  const barber = body.barber as Record<string, unknown> | undefined;
  return (
    !!barber &&
    typeof barber.linkedProfileId === "string" &&
    typeof barber.DilMartUserId === "string" &&
    typeof barber.DilMartBarbershopId === "string" &&
    (barber.role === "OWNER" || barber.role === "BARBER") &&
    typeof body.target === "string"
  );
}

export async function redeemBarberHandoff(
  code: string,
  state: string,
  deps: BarberRedeemApiDeps = {},
): Promise<BarberRedeemOutcome> {
  const baseUrl = deps.baseUrl ?? (import.meta.env.VITE_STORE_API_BASE_URL ?? "http://localhost:4000/api");
  const fetchImpl = deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 20_000);
  try {
    const res = await fetchImpl(`${baseUrl}/integrations/DilMart/barber/handoff/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code, state }),
      signal: controller.signal,
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      body = {};
    }

    if (res.ok) {
      if (isBarberSuccessBody(body)) return { kind: "authenticated", result: body };
      return { kind: "error", code: "UNKNOWN", retryable: false };
    }

    const code_ = (typeof body?.code === "string" ? body.code : "UNKNOWN") as BarberRedeemErrorCode;
    return { kind: "error", code: code_, retryable: RETRYABLE.has(code_) };
  } catch {
    return { kind: "error", code: "STORE_UNAVAILABLE", retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

export { parseHandoffQuery };
