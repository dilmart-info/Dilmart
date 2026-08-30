/**
 * STORE-PR6 §6/§8 — a thin, source-neutral readiness bridge over the EXISTING AuthProvider. After the PR5
 * `establishFederatedSessionFromRedeem()` runs, the AuthProvider observes the federated source, clears the
 * user-scoped identity cache, resolves `/auth/context`, applies the Store customer identity, and moves
 * `authStatus` to `authenticated_ready`. Both StoreDeepLinkCoordinator and OpenHandoff await this BEFORE
 * navigating to the exact target. There is only ONE auth owner (AuthProvider).
 *
 * §2 — readiness is IDENTITY-BOUND. A stale `authenticated_ready` left over from a PREVIOUS Store identity
 * (or a direct Supabase login) must NOT satisfy a fresh handoff. Only when ALL of these agree on the newly
 * redeemed customer do we report `ready`:
 *   authStatus            === "authenticated_ready"
 *   authSource            === "DilMart_federated"
 *   appSession.authSource === "DilMart_federated"
 *   appSession.user.id    === expectedCustomerId
 *   context.user.id       === expectedCustomerId
 *
 * §1/§3 — ONLY `ready` may navigate. `authenticated_offline` is NOT treated as ready for a fresh handoff
 * (the agreed sequence requires `/auth/context` → verified identity → authenticated_ready → navigate); it
 * yields a bounded `offline` transient outcome. `storage_error` is definitive. A timeout is bounded. None of
 * these navigate — the caller shows a safe retryable/unavailable state instead.
 */
import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { AuthContextValue } from "@/lib/auth/AuthContext";

export type AuthReadyOutcome = "ready" | "storage_error" | "offline" | "timeout";

const DEFAULT_TIMEOUT_MS = 12_000;
const POLL_MS = 40;

type ReadinessSnapshot = Pick<
  AuthContextValue,
  "authStatus" | "authSource" | "appSession" | "context" | "verifiedContextEpoch"
>;

/**
 * §9.3 — readiness must be bound to the identity EPOCH, not only the customer id.
 *
 * Matching on the customer alone let a stale ready-state satisfy a fresh handoff whenever the SAME
 * customer redeemed a NEW session family: every id predicate still agreed, so the first poll tick —
 * which runs synchronously, before React has committed the new provider state — reported ready and
 * navigation happened before the new context was authoritative. That silently violated
 "new family = new revalidation".
 *
 * `verifiedContextEpoch` is the epoch for which /auth/context was actually ACCEPTED, so requiring it
 * to equal the epoch this handoff established makes readiness structurally fresh rather than
 * timing-dependent. No timeout, no extra tick, no assumption about React commit ordering.
 */
export function matchesFederatedIdentity(
  snap: ReadinessSnapshot,
  expectedCustomerId: string,
  expectedIdentityEpoch: number,
): boolean {
  return (
    snap.authStatus === "authenticated_ready" &&
    snap.authSource === "DilMart_federated" &&
    snap.appSession?.authSource === "DilMart_federated" &&
    snap.appSession?.user?.id === expectedCustomerId &&
    snap.context?.user?.id === expectedCustomerId &&
    snap.verifiedContextEpoch === expectedIdentityEpoch
  );
}

export function useAwaitAuthReady() {
  const { authStatus, authSource, appSession, context, verifiedContextEpoch } = useAuth();
  // A single live snapshot ref so the poll always reads the CURRENT provider state (not a closed-over stale
  // value). The returned callback stays stable (empty deps).
  //
  // Written AFTER commit, never during render. Writing it in the render body made readiness observable
  // from a render React may discard — under StrictMode or a concurrent re-render that never commits, the
  // poll could see an identity that the tree never actually adopted and navigate to a protected target on
  // the strength of it. An effect only runs for renders that committed, so readiness can never lead the
  // provider state it claims to reflect.
  const snapRef = useRef<ReadinessSnapshot>({ authStatus, authSource, appSession, context, verifiedContextEpoch });
  useEffect(() => {
    snapRef.current = { authStatus, authSource, appSession, context, verifiedContextEpoch };
  }, [authStatus, authSource, appSession, context, verifiedContextEpoch]);

  return useCallback(
    (
      expectedCustomerId: string,
      expectedIdentityEpoch: number,
      timeoutMs = DEFAULT_TIMEOUT_MS,
    ): Promise<AuthReadyOutcome> => {
    return new Promise<AuthReadyOutcome>((resolve) => {
      const start = Date.now();
      let sawOffline = false;
      const tick = () => {
        const snap = snapRef.current;
        // A secure-storage failure is definitive — do NOT navigate to a protected target.
        if (snap.authStatus === "storage_error") return resolve("storage_error");
        // Fully verified NEW federated identity → the only outcome that may navigate.
        if (matchesFederatedIdentity(snap, expectedCustomerId, expectedIdentityEpoch)) return resolve("ready");
        // Connectivity gone after redeem: bounded transient outcome (never treated as ready).
        if (snap.authStatus === "authenticated_offline") sawOffline = true;
        if (Date.now() - start >= timeoutMs) return resolve(sawOffline ? "offline" : "timeout");
        setTimeout(tick, POLL_MS);
      };
      tick();
    });
    },
    [],
  );
}
