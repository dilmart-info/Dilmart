/**
 * §9.3 — the authenticated PRINCIPAL boundary for component-local state and async work.
 *
 * Clearing React Query on an identity transition is not the whole user-scoped surface. Customer data
 * also lives in component `useState`/`useRef`, and the customer-facing routes that hold the most of it
 * (`/checkout`, `/track-order`, `/wishlist`, `/thank-you`) are PUBLIC — no route guard unmounts them.
 *
 * TWO separate concerns live here, and conflating them was a real vulnerability:
 *
 *   1. LOCAL UI RESET POLICY — may deliberately preserve a guest's half-typed form across the
 *      provisional upgrade that same checkout created. That is a product decision about a form, so it
 *      reads the RENDERED owner: it can only act during a render anyway.
 *   2. ASYNC OPERATION CONTINUITY — must notice EVERY principal transition, `null → owner` included,
 *      and must not wait for a render to notice it. An identity is installed in the session lifecycle
 *      before React commits it, and a promise continuation can resume inside that gap. Continuity
 *      therefore reads the AUTHORITATIVE snapshot from the lifecycle owner, never a rendered copy.
 *
 * The UI exemption must never double as the async-security exemption.
 */
import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  isStalePrincipalOperationError,
  type AuthPrincipalSnapshot,
} from "@/lib/auth/auth-session-manager";

/**
 * Re-exported here so pages can recognise a stale-operation rejection without importing the session
 * manager: the lifecycle owner stays behind this auth boundary module.
 */
export { isStalePrincipalOperationError };

/** Who owns customer-scoped state right now, as `"<authSource>:<customerId>"`, or null. */
export function useCustomerPrincipalOwner(): string | null {
  const { principalOwner } = useAuth();
  return principalOwner ?? null;
}

/**
 * A claim ticket for async work. Created before the operation's FIRST await and re-checked before every
 * commit — success, error recovery and `finally` alike.
 */
export type PrincipalOperation = {
  /**
   * True only while the AUTHORITATIVE principal still matches the one this operation is entitled to act
   * for: the owner it started under, or the one it created and adopted. Exact match on owner AND version.
   */
  isCurrent: () => boolean;
  /**
   * The snapshot this operation is entitled to act for. Pass it to session-mutating APIs so the lifecycle
   * owner can verify it against its own state, instead of trusting a check this component did earlier.
   */
  expected: () => AuthPrincipalSnapshot;
  /**
   * Rebind this operation to a principal it just brought into existence (the guest → provisional
   * upgrade), using the snapshot the lifecycle owner returned for that establishment. Only legitimate
   * for an operation that CREATED that principal; everything else must abort.
   */
  adopt: (snapshot: AuthPrincipalSnapshot) => void;
};

export type PrincipalContinuity = {
  owner: string | null;
  transitionVersion: number;
  beginOperation: () => PrincipalOperation;
};

/**
 * The principal boundary. `onOwnerReplaced` synchronously drops owner-scoped local state.
 *
 * Reset policy transitions:
 *   null → A      PRESERVE — the guest-to-provisional checkout upgrade keeps what the guest typed.
 *   A → A         no-op — token rotation or a new session family for the same customer.
 *   A → B         reset.
 *   A → null      reset.
 *
 * The comparison runs during RENDER, not in an effect: an effect resets only after a frame has already
 * been committed with the previous owner's values on screen. Adjusting state during render is React's
 * documented pattern for this, so no stale-owner frame is committed. `onOwnerReplaced` must therefore
 * only set state belonging to the calling component.
 */
export function usePrincipalContinuity(onOwnerReplaced?: () => void): PrincipalContinuity {
  const { principalOwner, principalTransitionVersion, getPrincipalSnapshot } = useAuth();
  const owner = principalOwner ?? null;
  const version = principalTransitionVersion ?? 0;

  // Component-local view of the RESET policy only. Continuity itself is owned by the session lifecycle.
  const [resetTrackedOwner, setResetTrackedOwner] = useState<string | null>(owner);
  if (owner !== resetTrackedOwner) {
    const destructive = resetTrackedOwner !== null;
    setResetTrackedOwner(owner);
    if (destructive) onOwnerReplaced?.();
  }

  // `getPrincipalSnapshot` is stable, but hold it in a ref so a continuation created in an earlier render
  // still calls the live delegate rather than capturing one that could later be replaced.
  const snapshotRef = useRef(getPrincipalSnapshot);
  snapshotRef.current = getPrincipalSnapshot;

  const beginOperation = useCallback((): PrincipalOperation => {
    // Read the AUTHORITATIVE principal, not the rendered one. If the lifecycle has already moved on and
    // React has not caught up, this operation starts out already stale — which is the correct answer.
    let entitled: AuthPrincipalSnapshot = snapshotRef.current();

    return {
      expected: () => entitled,
      adopt: (snapshot: AuthPrincipalSnapshot) => {
        entitled = snapshot;
      },
      isCurrent: () => {
        const current = snapshotRef.current();
        // Exact match, with NO tolerance for `null`. Treating a null owner as "still fine" let an
        // adopted operation survive its own principal's logout and commit that customer's results
        // after sign-out. The brief pre-commit window is covered by the authoritative snapshot itself,
        // so nothing needs the exemption.
        return current.owner === entitled.owner && current.version === entitled.version;
      },
    };
  }, []);

  return { owner, transitionVersion: version, beginOperation };
}

/** Convenience wrapper for components that only need the reset, not async guarding. */
export function useResetOnPrincipalReplaced(reset: () => void): void {
  usePrincipalContinuity(reset);
}
