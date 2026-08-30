/**
 * Typed vocabulary for session-lifecycle events.
 *
 * Reasons are used for diagnostics and to keep refresh triggers auditable —
 * they must never carry token material.
 */

export const AUTH_REFRESH_REASONS = {
  bootstrap: "bootstrap",
  tokenExpiring: "token_expiring",
  appResume: "app_resume",
  networkOnline: "network_online",
  tabFocus: "tab_focus",
  apiUnauthorized: "api_unauthorized",
  authContextUnauthorized: "auth_context_unauthorized",
  manual: "manual",
} as const;

export type AuthRefreshReason = (typeof AUTH_REFRESH_REASONS)[keyof typeof AUTH_REFRESH_REASONS];

export const AUTH_REFRESH_OUTCOMES = {
  refreshed: "refreshed",
  noSession: "no_session",
  transientFailure: "transient_failure",
  definitiveFailure: "definitive_failure",
  storageError: "storage_error",
} as const;

export type AuthRefreshOutcomeStatus = (typeof AUTH_REFRESH_OUTCOMES)[keyof typeof AUTH_REFRESH_OUTCOMES];

/**
 * Query cache keys scoped to the signed-in user. Removed on sign-out.
 * Marketplace/public caches are intentionally absent so browsing stays warm.
 */
export const USER_SCOPED_QUERY_KEYS: readonly string[] = [
  "auth-context",
  "notifications",
  "admin-notifications",
  "user-notifications",
  "customer-profile",
  "customer-addresses",
  "customer-orders",
  "customer-orders-last",
  "customer-order-last-detail",
  // §9.3 — the order-tracking queries are private customer data. They are ALSO principal-scoped
  // in their own keys; listing them here is defence in depth so an identity transition drops
  // them even if a future caller forgets the scoping.
  "customer-orders-track",
  "customer-order-detail-track",
  // Already principal-scoped in its own key; listed for defence in depth so an identity replacement
  // actively drops the previous customer's order details too.
  "customer-order-detail",
  "loyalty-preview",
];
