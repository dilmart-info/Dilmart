import type { ReactNode } from "react";
import { useBarberWebSession } from "@/lib/barber-handoff/BarberWebSessionContext";
import BarberAccount from "@/pages/BarberAccount";

/**
 * Dispatches /profile between the B2B Barber account view and the ordinary Customer flow
 * (children — RequireAuthenticatedUser><Profile/>, unchanged). Precedence (Phase 8, deliberate):
 * a valid Barber B2B session means the current browsing actor is Barber for this account surface,
 * regardless of any Customer session that may also exist in the same browser — the Customer
 * session itself is never read, mutated, or logged out here; it stays fully isolated in
 * CustomerAuthContext. Always waits for the (fast, single) B2B session check before deciding, for
 * EVERY visitor — this is the one deliberate extra loading frame that guarantees a Barber
 * refreshing /profile directly never sees a flash of the Customer login screen.
 */
export function ProfileRouteGate({ children }: { children: ReactNode }) {
  const { state } = useBarberWebSession();

  if (state.status === "loading") {
    return <div className="flex min-h-screen items-center justify-center">جاري التحقق من الجلسة...</div>;
  }

  if (state.status === "authenticated") {
    return <BarberAccount />;
  }

  return <>{children}</>;
}
