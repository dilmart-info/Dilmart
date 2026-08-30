/**
 * Barber B2B web-session context — the frontend counterpart of the backend consumer for
 * __Host-DilMart_store_bwt. Deliberately a SEPARATE context/provider from CustomerAuthContext
 * (@/lib/auth/AuthContext): a Barber is never converted into, merged with, or mistaken for a
 * Customer identity. Never reads the HttpOnly cookie itself — only ever asks the backend "is this
 * cookie a valid session" via credentials:"include".
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isNative } from "@/lib/capacitor";
import {
  fetchBarberWebSession,
  logoutBarberWebSession,
  type BarberWebSessionIdentity,
} from "./barber-web-session-api";

export type BarberWebSessionState =
  | { status: "loading" }
  | { status: "authenticated"; barber: BarberWebSessionIdentity }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

export interface BarberWebSessionRefreshOptions {
  /** Bypasses in-flight coalescing and issues a brand-new request. Required after any
   *  authentication-changing event (a handoff redeem) — a bootstrap check that was already
   *  in flight when the cookie was set was necessarily sent WITHOUT that cookie, so reusing it
   *  would silently report the pre-redemption (unauthenticated) state. See `refresh` below for
   *  the staleness guarantee this also provides. */
  force?: boolean;
}

export interface BarberWebSessionContextValue {
  state: BarberWebSessionState;
  /** Re-checks the session with the backend and resolves to the settled state. Awaiting this
   *  (e.g. right after a handoff redeem) guarantees the context reflects the new cookie before
   *  any consumer decides what to render — no login-page flash. Plain calls coalesce with any
   *  in-flight request (e.g. the mount bootstrap); pass `{ force: true }` to guarantee a request
   *  issued AFTER this call started — a request-generation counter ensures that even if an older,
   *  stale (pre-cookie) request resolves afterward, it can never overwrite the fresher result. */
  refresh: (options?: BarberWebSessionRefreshOptions) => Promise<BarberWebSessionState>;
  /** Resolves `true` only when the backend confirmed the session was revoked (2xx). On failure
   *  (network error, non-2xx) resolves `false` and re-checks the session instead of blindly
   *  clearing local state — the session may still be ACTIVE server-side, and the UI must not
   *  claim a logout that did not actually happen. */
  logout: () => Promise<boolean>;
}

const NOOP_STATE: BarberWebSessionState = { status: "unauthenticated" };

const BarberWebSessionContext = createContext<BarberWebSessionContextValue>({
  state: NOOP_STATE,
  refresh: async () => NOOP_STATE,
  logout: async () => true,
});
BarberWebSessionContext.displayName = "BarberWebSessionContext";

export function BarberWebSessionProvider({ children }: { children: ReactNode }) {
  // Native customer bundle never receives this cookie (the Barber handoff is a Store-web-only
  // flow) — skip the network round trip entirely rather than resolving "unauthenticated" async.
  const native = isNative();
  const [state, setState] = useState<BarberWebSessionState>(native ? { status: "unauthenticated" } : { status: "loading" });
  const inFlight = useRef<Promise<BarberWebSessionState> | null>(null);
  // Monotonic request generation: only the result of the LATEST-started request may ever commit
  // to state. A forced refresh bumps this before its fetch is even sent, so an older request that
  // happens to resolve afterward (e.g. a bootstrap check sent before the handoff cookie existed)
  // is detected as stale and its result is discarded rather than clobbering the fresh one.
  const generation = useRef(0);

  const refresh = useCallback(
    async (options?: BarberWebSessionRefreshOptions): Promise<BarberWebSessionState> => {
      if (native) {
        setState({ status: "unauthenticated" });
        return { status: "unauthenticated" };
      }
      // Coalesce concurrent callers (e.g. mount-effect + an immediate post-redeem refresh) into
      // one in-flight request — UNLESS the caller requires a guaranteed-fresh request (force),
      // which always issues a brand-new fetch regardless of what's already in flight.
      if (!options?.force && inFlight.current) return inFlight.current;

      const myGeneration = ++generation.current;
      const promise = (async (): Promise<BarberWebSessionState> => {
        const outcome = await fetchBarberWebSession();
        const next: BarberWebSessionState =
          outcome.kind === "authenticated"
            ? { status: "authenticated", barber: outcome.barber }
            : outcome.kind === "unauthenticated"
              ? { status: "unauthenticated" }
              : { status: "unavailable" };
        // Discard a stale result: if a newer (forced) refresh started after this one, that request
        // — not this one — owns the current generation and gets to decide the committed state.
        if (myGeneration === generation.current) setState(next);
        return next;
      })();
      inFlight.current = promise;
      try {
        return await promise;
      } finally {
        if (inFlight.current === promise) inFlight.current = null;
      }
    },
    [native],
  );

  useEffect(() => {
    void refresh();
    // Bootstrap once per app mount — same lifecycle as the Customer AuthProvider's own bootstrap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback(async (): Promise<boolean> => {
    if (native) return true;
    const outcome = await logoutBarberWebSession();
    if (outcome.kind === "confirmed") {
      setState({ status: "unauthenticated" });
      return true;
    }
    // Do not silently claim success — re-check so the UI reflects what actually happened
    // server-side rather than a false "logged out" while the session may still be ACTIVE.
    await refresh();
    return false;
  }, [native, refresh]);

  const value = useMemo<BarberWebSessionContextValue>(() => ({ state, refresh, logout }), [state, refresh, logout]);

  return <BarberWebSessionContext.Provider value={value}>{children}</BarberWebSessionContext.Provider>;
}

export function useBarberWebSession(): BarberWebSessionContextValue {
  return useContext(BarberWebSessionContext);
}
