/**
 * The WEB /open-barber landing for the Barber/Owner handoff. The browser arrives at
 * https://store.DilMart.org/open-barber?code=…&state=… ; this page captures the params,
 * IMMEDIATELY scrubs them from the visible URL, redeems with credentials:"include" (the backend
 * sets the `__Host-DilMart_store_bwt` HttpOnly cookie on success — this page never sees or holds
 * a raw session token), and navigates to the validated target with replace semantics.
 *
 * The Barber web session is a single opaque cookie (see barber-web-cookie.ts), not the PR5
 * federated access-token/session-family system — there is no client-side token to hold. There IS,
 * however, a client-side SESSION-CONTEXT step to await: the destination page reads
 * `useBarberWebSession()`, and if we navigate before that context has re-checked the backend, the
 * destination briefly sees "no B2B session yet" and can render its anonymous/Customer-login state
 * (see BarberWebSessionContext.tsx / ProfileRouteGate.tsx). Awaiting `refresh()` here — AFTER the
 * cookie is already set by the 200 redeem response — closes that gap before navigating.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HandoffScreen } from "@/lib/deep-link/HandoffScreen";
import type { HandoffUxState } from "@/lib/deep-link/store-deep-link.types";
import { parseHandoffQuery, redeemBarberHandoff } from "@/lib/barber-handoff/barber-handoff-redeem-api";
import { validateBarberTarget } from "@/lib/barber-handoff/barber-target";
import { useBarberWebSession } from "@/lib/barber-handoff/BarberWebSessionContext";

const ERROR_TO_UX: Record<string, HandoffUxState> = {
  HANDOFF_EXPIRED: "expired",
  HANDOFF_ALREADY_REDEEMED: "already_used",
  HANDOFF_INVALID: "invalid",
  HANDOFF_STATE_MISMATCH: "invalid",
  HANDOFF_RATE_LIMITED: "retryable_error",
  STORE_UNAVAILABLE: "retryable_error",
  STORE_INTEGRATION_DISABLED: "unavailable",
  UNKNOWN: "unavailable",
};

export default function OpenBarberHandoff() {
  const navigate = useNavigate();
  const { refresh: refreshBarberWebSession } = useBarberWebSession();
  const [state, setState] = useState<HandoffUxState>("processing");
  const ranRef = useRef(false);
  // Review fix (StrictMode): the cancellation flag must share the SAME lifetime as the run-once
  // guard. With an effect-local `let cancelled`, StrictMode's mount→cleanup→mount cycle leaves
  // ranRef=true (second effect returns early) while the first run's `cancelled` stays true — the
  // in-flight redemption would then resolve into a no-op and the page hangs on "processing"
  // forever with the one-time code already consumed. A ref reset at every effect start keeps the
  // last mount authoritative.
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (ranRef.current) return; // handle exactly once per mount
    ranRef.current = true;

    const search = typeof window !== "undefined" ? window.location.search : "";
    try {
      window.history.replaceState(null, "", "/open-barber");
    } catch {
      /* ignore */
    }

    const parsed = parseHandoffQuery(search);
    if (!parsed.ok) {
      setState("invalid");
      return;
    }

    void redeemBarberHandoff(parsed.params.code, parsed.params.state)
      .then(async (outcome) => {
        if (cancelledRef.current) return;
        if (outcome.kind === "error") {
          setState(ERROR_TO_UX[outcome.code] ?? "unavailable");
          return;
        }
        const target = validateBarberTarget(outcome.result.target);
        if (!target) {
          // The backend's own allowlist should make this unreachable — fail closed rather than
          // navigate anywhere unvalidated.
          setState("invalid");
          return;
        }
        // The redeem response already means the cookie is set (200 + Set-Cookie). Re-check it
        // through the shared B2B context BEFORE navigating so the destination page's
        // useBarberWebSession() already reads "authenticated" on first render — never a transient
        // anonymous/Customer-login flash while a second, redundant fetch races the navigation.
        // Review fix: gate on the RESOLVED state, not merely on refresh() having settled — a
        // transient network blip on this re-check must not still navigate as if authenticated
        // (the one-time code is already consumed at this point, so retrying redeem is not an
        // option; surface it as a recoverable failure instead).
        // Review fix (force): the provider's mount-time bootstrap check may still be in flight —
        // it was necessarily sent BEFORE this redeem set the cookie, so reusing it via ordinary
        // coalescing could report stale unauthenticated state despite the fresh cookie. `force`
        // guarantees a request sent after the cookie exists, and the provider's generation
        // counter guarantees that stale request can't overwrite this one even if it resolves later.
        const sessionState = await refreshBarberWebSession({ force: true });
        if (cancelledRef.current) return;
        if (sessionState.status !== "authenticated") {
          setState("unavailable");
          return;
        }
        setState("success");
        navigate(target, { replace: true });
      })
      .catch(() => {
        if (!cancelledRef.current) setState("unavailable");
      });
    return () => {
      cancelledRef.current = true;
    };
  }, [navigate, refreshBarberWebSession]);

  return <HandoffScreen state={state} onContinue={() => navigate("/", { replace: true })} />;
}
