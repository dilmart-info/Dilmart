import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  ACTIVE_MERCHANT_STORAGE_KEY,
  MerchantMembership,
  getMerchantPreferenceServerSnapshot,
  getMerchantPreferenceSnapshot,
  isSelectableMembership,
  resolveActiveMerchantSelection,
  setMerchantPreference,
  subscribeToMerchantPreference,
} from "@/lib/merchant-selection";

export type { MerchantMembership };
export { ACTIVE_MERCHANT_STORAGE_KEY };

/** `loading` = memberships not resolved yet; `none` = resolved and no ACTIVE store exists. */
export type MerchantSelectionStatus = "loading" | "ready" | "none";

export function useCurrentMerchant() {
  const { context, loading } = useAuth();

  const resolvedMemberships = useMemo<MerchantMembership[]>(() => {
    // Merchant memberships are resolved exclusively from /auth/context (backend-authoritative).
    // Direct Supabase merchant_users fallback removed in Phase 1B.
    const list: MerchantMembership[] = (context?.merchant_memberships ?? [])
      .map((item) => ({
        merchant_id: item.id,
        role: item.role,
        merchants: {
          id: item.id,
          display_name: item.display_name ?? "",
          status: item.status ?? "draft",
          slug: item.slug ?? "",
        },
      }))
      .filter((item) => !!item.merchant_id);

    if (list.length === 0 && context?.merchant) {
      list.push({
        merchant_id: context.merchant.id,
        role: context.merchant.role,
        merchants: {
          id: context.merchant.id,
          display_name: context.merchant.display_name ?? "",
          status: context.merchant.status ?? "draft",
          slug: context.merchant.slug ?? "",
        },
      });
    }
    return list;
  }, [context?.merchant_memberships, context?.merchant]);

  // ONE shared same-tab preference for every mounted consumer (MerchantLayout, usePendingOrders,
  // each merchant page). A switch made anywhere is observed everywhere on the next render —
  // per-instance state would let those consumers drift onto different merchants.
  // Still a preference hint only: it is validated against the authoritative memberships below.
  const preferredMerchantId = useSyncExternalStore(
    subscribeToMerchantPreference,
    getMerchantPreferenceSnapshot,
    getMerchantPreferenceServerSnapshot,
  );

  const selection = useMemo(
    () => resolveActiveMerchantSelection(resolvedMemberships, preferredMerchantId),
    [resolvedMemberships, preferredMerchantId],
  );

  // Repair the shared preference AFTER render: a stale/suspended/crafted/cross-tab preference is
  // replaced by the resolved active merchant, and a preference with no active store left is
  // cleared. Writing the already-resolved value is a no-op in the store, so consumers cannot
  // ping-pong repairs against each other.
  useEffect(() => {
    if (loading) return;
    if (selection.merchantId !== preferredMerchantId) {
      setMerchantPreference(selection.merchantId);
    }
  }, [loading, selection.merchantId, preferredMerchantId]);

  /**
   * Switch the active store. Only a merchant present in the authoritative memberships AND
   * currently active can be selected — anything else is ignored (returns false) and the current
   * selection stays untouched. On success every mounted consumer in this tab re-renders with the
   * new merchant; persistence follows the selection and never gates it.
   */
  const setActiveMerchantId = useCallback(
    (merchantId: string): boolean => {
      const target = resolvedMemberships.find((item) => item.merchant_id === merchantId) ?? null;
      if (!isSelectableMembership(target)) return false;
      setMerchantPreference(merchantId);
      return true;
    },
    [resolvedMemberships],
  );

  const status: MerchantSelectionStatus = loading ? "loading" : selection.merchantId ? "ready" : "none";

  return {
    data: selection.membership,
    /** Every authoritative membership, whatever its status (used for pending/registration UX). */
    memberships: resolvedMemberships,
    /** Only the memberships that may currently be selected — what the store switcher lists. */
    activeMemberships: selection.selectable,
    selectionStatus: status,
    /** True once memberships are resolved and the account has no active store at all. */
    hasNoActiveMerchant: !loading && selection.merchantId === null,
    setActiveMerchantId,
    isLoading: loading,
    isError: false,
    error: null,
  };
}
