import { useEffect, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import type { AuthCapabilities } from "@/lib/auth-context-contract";

/**
 * STORE-PR5 §Phase K/§1 — capability-aware route guard that FAILS CLOSED for a known federated identity.
 *
 * The Store account-claim / phone-security / password surfaces are Supabase-owned and are ALWAYS off for a
 * DilMart federated customer. A known federated identity (appSession.authSource === "DilMart_federated") must
 * therefore never render these — even while the backend `capabilities` are still loading, or offline, or the
 * context is momentarily unavailable. Waiting for `authenticated_ready` (as the first version did) would flash
 * the forbidden child. We key the fail-closed decision on the identity source, not on authStatus.
 *
 * Semantics:
 *  - unauthenticated guest (appSession null): allowed — guest account-recovery / password reset must work;
 *  - direct Supabase: not blocked until `capabilities` resolve, then obey them exactly (existing behavior);
 *  - DilMart_federated: the three federated-off surfaces are blocked immediately, in EVERY authStatus.
 *
 * A blocked route redirects to a SAFE /profile route with an explanatory message — never /login, never
 * calling the identity temporary/provisional.
 */
const FEDERATED_OFF_CAPABILITIES: ReadonlySet<keyof AuthCapabilities> = new Set([
  "accountClaim",
  "phoneIdentity",
  "passwordManagement",
]);

export function CustomerCapabilityGuard({
  capability,
  children,
  redirectTo = "/profile",
}: {
  capability: keyof AuthCapabilities;
  children: ReactNode;
  redirectTo?: string;
}) {
  const { appSession, capabilities } = useAuth();
  const isKnownFederated = appSession?.authSource === "DilMart_federated";

  const blocked =
    // capabilities have resolved and this one is explicitly off (any source, any status)
    capabilities?.[capability] === false ||
    // OR a KNOWN federated identity on a federated-off surface — fail closed before capabilities load / offline
    (isKnownFederated && FEDERATED_OFF_CAPABILITIES.has(capability));

  useEffect(() => {
    if (blocked) toast.info("إدارة هذه البيانات تتم من خلال حساب DilMart.");
  }, [blocked]);

  if (blocked) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
