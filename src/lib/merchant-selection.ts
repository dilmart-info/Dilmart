/**
 * Authoritative active-merchant selection (DilMart-STORE-MERCHANT-ACTIVE-STORE-SELECTION).
 *
 * ONE place decides which merchant the merchant portal is currently acting for. Every caller
 * (hook, layout selector, persistence) goes through these helpers instead of re-implementing
 * "is it active?" / "is the persisted id still valid?" rules.
 *
 * Security note: the persisted merchant id is a PREFERENCE HINT ONLY. It is never authorization.
 * A membership is selectable only because the authoritative membership list (from `/auth/context`)
 * says so, and the backend re-derives merchant scope from `merchant_users` on every request
 * regardless of what this module resolves.
 */

export const ACTIVE_MERCHANT_STORAGE_KEY = "DilMart.active_merchant_id";

export type MerchantMembershipRole = "owner" | "manager" | "staff";

export type MerchantMembershipStatus =
  | "draft"
  | "pending_review"
  | "active"
  | "suspended"
  | "rejected"
  | "archived";

export type MerchantMembership = {
  merchant_id: string;
  role: MerchantMembershipRole;
  merchants: {
    id: string;
    display_name: string;
    status: MerchantMembershipStatus;
    slug: string;
  } | null;
};

/**
 * A membership is selectable only while its merchant is `active`. Every other status
 * (draft / pending_review / suspended / rejected / archived) is a non-operational store: the
 * portal routes it to the pending screen instead of letting it act as the current merchant.
 */
export function isSelectableMembership(membership: MerchantMembership | null | undefined): boolean {
  return Boolean(membership?.merchant_id) && membership?.merchants?.status === "active";
}

export function listSelectableMemberships(memberships: MerchantMembership[]): MerchantMembership[] {
  return (memberships ?? []).filter(isSelectableMembership);
}

export type MerchantSelectionReason =
  | "persisted" // the persisted preference was still a valid active membership
  | "fallback" // persisted was missing/invalid — a deterministic active membership was chosen
  | "none"; // there is no active membership to select

export type MerchantSelectionResult = {
  membership: MerchantMembership | null;
  merchantId: string | null;
  reason: MerchantSelectionReason;
  selectable: MerchantMembership[];
};

/**
 * Deterministic selection:
 *   A. the persisted id, but only when it is present in the authoritative memberships AND active;
 *   B/C/D. otherwise the FIRST active membership in the authoritative order the API already
 *      returned (stable, no re-sorting, no randomness) — which naturally covers the
 *      "exactly one active membership" case;
 *   E. otherwise nothing: no active store.
 *
 * A suspended/inactive/unknown/crafted id can never win, and no id outside `memberships` can be
 * produced by this function.
 */
export function resolveActiveMerchantSelection(
  memberships: MerchantMembership[],
  persistedMerchantId: string | null | undefined,
): MerchantSelectionResult {
  const selectable = listSelectableMemberships(memberships);

  const persisted = persistedMerchantId
    ? selectable.find((item) => item.merchant_id === persistedMerchantId) ?? null
    : null;
  if (persisted) {
    return { membership: persisted, merchantId: persisted.merchant_id, reason: "persisted", selectable };
  }

  const fallback = selectable[0] ?? null;
  if (fallback) {
    return { membership: fallback, merchantId: fallback.merchant_id, reason: "fallback", selectable };
  }

  return { membership: null, merchantId: null, reason: "none", selectable };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Shared same-tab preference store
 *
 * The app mounts MANY independent `useCurrentMerchant()` consumers at once
 * (MerchantLayout, the `usePendingOrders` hook inside it, and every merchant page builds its own
 * `merchantScope(...)`). Per-instance React state would let them drift apart — switching the
 * store in the layout while a page kept querying the previous merchant. `localStorage` alone
 * cannot fix that either: a write does NOT fire a `storage` event in the tab that performed it.
 *
 * So the preference lives in one module-level snapshot with an explicit subscription, consumed
 * through `useSyncExternalStore`. Writes update the snapshot, persist (best effort), and notify
 * every subscriber synchronously. A `storage` event from ANOTHER tab updates the same snapshot.
 *
 * This store holds a PREFERENCE ONLY. Whether that preference may be used is decided by
 * `resolveActiveMerchantSelection` against the authoritative memberships, on every render.
 * ──────────────────────────────────────────────────────────────────────────── */

type PreferenceListener = () => void;

const preferenceListeners = new Set<PreferenceListener>();
let preferenceSnapshot: string | null | undefined; // undefined = not hydrated from storage yet

function notifyPreferenceListeners(): void {
  for (const listener of [...preferenceListeners]) listener();
}

function hydratePreferenceSnapshot(): string | null {
  if (preferenceSnapshot === undefined) {
    preferenceSnapshot = readPersistedMerchantId();
  }
  return preferenceSnapshot;
}

/** Current shared preference (hydrated from storage on first access). */
export function getMerchantPreferenceSnapshot(): string | null {
  return hydratePreferenceSnapshot();
}

/** SSR/prerender snapshot — no storage access, no preference. */
export function getMerchantPreferenceServerSnapshot(): string | null {
  return null;
}

export function subscribeToMerchantPreference(listener: PreferenceListener): () => void {
  preferenceListeners.add(listener);
  if (preferenceListeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", handleExternalStorageChange);
  }
  return () => {
    preferenceListeners.delete(listener);
    if (preferenceListeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", handleExternalStorageChange);
    }
  };
}

/** Cross-tab: another tab changed the preference. Validation still happens per consumer. */
function handleExternalStorageChange(event: StorageEvent): void {
  if (event.key !== null && event.key !== ACTIVE_MERCHANT_STORAGE_KEY) return;
  const next = event.key === null ? readPersistedMerchantId() : event.newValue && event.newValue.trim() ? event.newValue : null;
  if (next === preferenceSnapshot) return;
  preferenceSnapshot = next;
  notifyPreferenceListeners();
}

/**
 * Set the shared preference and persist it. Callers must have validated `merchantId` against the
 * authoritative memberships first — this function deliberately knows nothing about authorization.
 * Persistence is best effort: if storage throws, the in-memory snapshot still updates so every
 * same-tab consumer stays reactive.
 */
export function setMerchantPreference(merchantId: string | null): void {
  writePersistedMerchantId(merchantId);
  if (preferenceSnapshot === merchantId) return;
  preferenceSnapshot = merchantId;
  notifyPreferenceListeners();
}

/** Test seam: drops the shared snapshot and any subscriptions between test cases. */
export function resetMerchantSelectionPreferenceForTests(): void {
  preferenceSnapshot = undefined;
  preferenceListeners.clear();
  if (typeof window !== "undefined") {
    window.removeEventListener("storage", handleExternalStorageChange);
  }
}

/** Safe read — never throws when storage is unavailable (SSR, privacy mode, quota errors). */
export function readPersistedMerchantId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(ACTIVE_MERCHANT_STORAGE_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

/**
 * Safe write, only ever called from an effect or an explicit user action — never during render.
 * Passing `null` clears the stale preference (used when the account has no active store left).
 */
export function writePersistedMerchantId(merchantId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (merchantId) {
      window.localStorage.setItem(ACTIVE_MERCHANT_STORAGE_KEY, merchantId);
    } else {
      window.localStorage.removeItem(ACTIVE_MERCHANT_STORAGE_KEY);
    }
  } catch {
    // Persistence is a convenience; selection stays correct without it.
  }
}
