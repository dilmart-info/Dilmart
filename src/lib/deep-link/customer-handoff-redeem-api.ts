/**
 * STORE-PR6 §6/§7 — typed client for the PR3/PR4 one-time redeem:
 *   POST /integrations/DilMart/customer/handoff/redeem
 *
 * `credentials: "include"` so a WEB redeem receives the PR5 `__Host-` HttpOnly refresh cookie. The raw
 * request body (code/state) is NEVER logged. The success body is handed, unmodified, to the PR5 session
 * establishment; this client never persists tokens.
 */
import type { FederatedRedeemResult } from "@/lib/auth/session/app-session.types";
import type { HandoffParams, RedeemDevice } from "./store-deep-link.types";

export type RedeemErrorCode =
  | "HANDOFF_EXPIRED"
  | "HANDOFF_ALREADY_REDEEMED"
  | "HANDOFF_INVALID"
  | "HANDOFF_STATE_MISMATCH"
  | "HANDOFF_RATE_LIMITED"
  | "STORE_UNAVAILABLE"
  | "STORE_INTEGRATION_DISABLED"
  | "IDENTITY_BLOCKED"
  | "UNKNOWN";

export type RedeemOutcome =
  | { kind: "authenticated"; result: FederatedRedeemResult }
  | { kind: "identity_link_required" }
  | { kind: "error"; code: RedeemErrorCode; retryable: boolean };

export type RedeemApiDeps = { baseUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number };

// Only these can legitimately succeed on retry of the SAME code (§14).
const RETRYABLE: ReadonlySet<string> = new Set(["HANDOFF_RATE_LIMITED", "STORE_UNAVAILABLE"]);

export async function redeemHandoff(
  params: HandoffParams,
  device: RedeemDevice,
  deps: RedeemApiDeps = {},
): Promise<RedeemOutcome> {
  const baseUrl = deps.baseUrl ?? (import.meta.env.VITE_STORE_API_BASE_URL ?? "http://localhost:4000/api");
  const fetchImpl = deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 20_000);
  try {
    const res = await fetchImpl(`${baseUrl}/integrations/DilMart/customer/handoff/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code: params.code, state: params.state, device }),
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
      const status = body?.status;
      const session = (body as { session?: { accessToken?: unknown } }).session;
      if (status === "authenticated" && typeof session?.accessToken === "string") {
        return { kind: "authenticated", result: body as unknown as FederatedRedeemResult };
      }
      if (status === "identity_link_required") return { kind: "identity_link_required" };
      return { kind: "error", code: "UNKNOWN", retryable: false };
    }

    const code = (typeof body?.code === "string" ? body.code : "UNKNOWN") as RedeemErrorCode;
    if ((code as string) === "IDENTITY_LINK_REQUIRED") return { kind: "identity_link_required" };
    return { kind: "error", code, retryable: RETRYABLE.has(code) };
  } catch {
    // Network abort / timeout — transient; the caller may retry the same code.
    return { kind: "error", code: "STORE_UNAVAILABLE", retryable: true };
  } finally {
    clearTimeout(timer);
  }
}
