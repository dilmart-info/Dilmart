# Phase 1 Analysis Report

## Marketplace Stabilization & API Authority

**Date:** 2026-05-04
**Analyst:** Claude Code (Execution Agent)
**Phase:** Phase 1 — Marketplace Stabilization & API Authority
**Status:** Analysis Only — No Code Modified

---

## Executive Summary

The DilMart-Store codebase is at approximately 78% readiness per MASTER_SPEC. The backend API layer is substantially built (NestJS with ~25 registered modules) and the checkout flow is properly backend-authoritative for pricing and order creation. However, there are **multiple dangerous frontend direct Supabase fallbacks** that bypass the backend API for business-critical data — including finance, orders, and customer PII. Additionally, two backend modules are completely empty stubs (CartModule, UsersModule), and there are unresolved data integrity issues with delivery cost and loyalty points in the checkout flow.

---

## 1. Direct Supabase Usage Map

The following frontend files import and call `supabase` directly (from `@/integrations/supabase/client`):

| File                                                   | Type of Use                            | Tables / Endpoints                                                                            |
| ------------------------------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/lib/api-core.ts:19`                               | Auth — get JWT token                   | `supabase.auth.getSession()`                                                                  |
| `src/hooks/use-auth.tsx:27,42`                         | Auth — session management              | `supabase.auth.getSession()`, `supabase.auth.onAuthStateChange()`                             |
| `src/hooks/use-auth.tsx:96`                            | Role fallback read                     | `profiles` (role)                                                                             |
| `src/hooks/use-auth.tsx:115-126`                       | Merchant membership fallback read      | `merchant_users`                                                                              |
| `src/hooks/use-current-merchant.ts:52-58`              | Merchant membership fallback read      | `merchant_users`                                                                              |
| `src/pages/Auth.tsx:50,52`                             | Auth — sign in + session               | `supabase.auth.signInWithPassword()`, `supabase.auth.getSession()`                            |
| `src/pages/merchant/Login.tsx:24,27,50-56`             | Auth + role fallback read              | `supabase.auth.signInWithPassword()`, `profiles`, `merchant_users`                            |
| `src/pages/admin/Login.tsx:24,31,72`                   | Auth                                   | `supabase.auth.signInWithPassword()`, `supabase.auth.getSession()`, `supabase.auth.signOut()` |
| `src/components/AdminLayout.tsx:30,34,212`             | Auth — sign out                        | `supabase.auth.signOut()`                                                                     |
| `src/components/MerchantLayout.tsx`                    | Auth — sign out                        | `supabase.auth.signOut()`                                                                     |
| `src/pages/Profile.tsx`                                | Auth — sign out (via layout)           | `supabase.auth.signOut()`                                                                     |
| `src/lib/realtime/notification-subscriptions.ts:15-55` | Realtime — push invalidation           | `supabase.channel()` on `admin_notifications`, `user_notifications`                           |
| `src/lib/scoped-queries.ts:47-67`                      | Products fallback on 403               | `products`                                                                                    |
| `src/lib/scoped-queries.ts:89-106`                     | Orders fallback on 403                 | `orders`                                                                                      |
| `src/lib/scoped-queries.ts:126-135`                    | Coupons fallback on 403                | `coupons`                                                                                     |
| `src/lib/scoped-queries.ts:185-209`                    | Merchant customer fallback on 403      | `orders` (customer data)                                                                      |
| `src/lib/scoped-queries.ts:213-229`                    | Platform customer fallback on 403      | `profiles` (PII: email, phone)                                                                |
| `src/lib/api/merchant.ts:101-102`                      | Merchant dashboard fallback on 403/404 | `products`, `orders`                                                                          |
| `src/lib/api/merchant.ts:179`                          | Auth — file upload JWT                 | `supabase.auth.getSession()`                                                                  |
| `src/lib/api/merchant.ts:257-259`                      | Merchant readiness fallback on 403     | `merchant_settings`, `products`                                                               |
| `src/lib/api/merchant.ts:324`                          | Merchant finance fallback on 403       | `orders` (total, status)                                                                      |
| `src/pages/admin/Dashboard.tsx:85-87`                  | Admin analytics fallback on 403        | `orders`, `order_items`, `governorates`                                                       |
| `src/pages/admin/Executive.tsx:46-48`                  | Executive analytics fallback on 403    | `merchants`, `orders`, `governorates`                                                         |
| `src/pages/admin/DesktopQuickLinks.tsx:27-31,45,61,71` | Direct CRUD — no backend               | `desktop_quick_links` (read, insert, update, delete)                                          |

---

## 2. Dangerous Bypasses

These usages bypass the backend API for business-critical data and violate the API authority principle from MASTER_SPEC §5.

### DANGER-1 — Admin Analytics Direct Supabase Fallback

**File:** `src/pages/admin/Dashboard.tsx:83-204`
**Trigger:** When `apiClient.getAdminAnalyticsOverview()` returns 403 (which happens if the admin API endpoint is forbidden or misconfigured), the function `buildAdminOverviewFallback()` reads **all orders**, **all order_items**, and **all governorates** directly from Supabase.
**Risk:** Platform-wide revenue, order counts, and financial metrics are read without backend authorization. The backend's role-based access control is completely bypassed. A user whose token grants RLS read on the `orders` table would see all financial data regardless of the API authorization layer.
**Severity:** P0

### DANGER-2 — Executive Dashboard Direct Supabase Fallback

**File:** `src/pages/admin/Executive.tsx:39-79`
**Trigger:** Always (no conditional guard). The `buildExecutiveFallback()` function is called unconditionally when the API returns a forbidden error. It reads merchants, 8 weeks of orders, and governorates directly.
**Risk:** Same as DANGER-1. 8 weeks of all order data exposed without API mediation.
**Severity:** P0

### DANGER-3 — Platform Customer List Direct Supabase Fallback

**File:** `src/lib/scoped-queries.ts:212-229`
**Trigger:** When `apiClient.listScopedCustomers()` returns 403 on platform scope.
**Risk:** All user `profiles` rows are fetched including `email`, `phone`, `role`, `full_name`. This is a PII data leak from the platform's identity table, circumventing backend authorization.
**Severity:** P0

### DANGER-4 — Merchant Finance Direct Supabase Fallback

**File:** `src/lib/api/merchant.ts:322-338`
**Trigger:** When `apiClient.getMerchantFinanceSummary()` returns 403.
**Risk:** Merchant finance totals (`total`, `status`) are computed directly from the `orders` table, bypassing the backend finance module. The backend finance model (commission, net amount, settlement status) is completely ignored. The fallback returns a simplified `total_accrued` = sum of delivered order totals, which may diverge from the backend's authoritative finance snapshot.
**Severity:** P0

### DANGER-5 — Merchant Orders Direct Supabase Fallback

**File:** `src/lib/scoped-queries.ts:89-106`
**Trigger:** When `apiClient.listScopedOrders()` returns 403 for a merchant scope.
**Risk:** The fallback reads `orders` directly including `total`, `customer_name`, `customer_phone`. Customer contact data is visible to merchants via direct Supabase when the API rejects the request. The backend's merchant-scoped order view intentionally strips customer contact fields for privacy (see `OrdersService.listOrdersForMerchant`).
**Severity:** P0

### DANGER-6 — Frontend Auth Role Resolution via Direct Supabase

**File:** `src/hooks/use-auth.tsx:86-127`
**Trigger:** Always — two parallel queries fire after session is established.
**Risk:** `directRoleQuery` reads `profiles.role` and `directMerchantMembershipQuery` reads `merchant_users.merchant_id` directly. The computed `isAdmin` flag uses these direct Supabase reads as fallback/tie-breaker. This means UI-level access control decisions (rendering admin buttons, unlocking admin routes) may be derived from Supabase directly rather than from the backend's verified context. If `profiles.role` is tampered or RLS misconfigured, a user could elevate their visible role.
**Severity:** P0

### DANGER-7 — Merchant Login Direct Supabase Role Fallback

**File:** `src/pages/merchant/Login.tsx:47-70`
**Trigger:** When `/auth/context` call fails post-login.
**Risk:** After Supabase sign-in, if the backend `/auth/context` call fails, the login page falls back to reading `profiles.role` and `merchant_users` directly to determine if the user is a merchant. A user denied by the backend's auth context API could still pass through the merchant login if Supabase RLS grants access.
**Severity:** P0

---

## 3. Safe Read-Only Usages

These usages are acceptable per MASTER_SPEC §5 ("Direct Supabase access from frontend is allowed only for non-critical read-only cases if explicitly approved") or are inherent to the Supabase Auth identity model:

| File                                             | Usage                                             | Justification                                                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/api-core.ts:19`                         | `supabase.auth.getSession()`                      | Gets JWT to attach to backend API requests — necessary bridge                                                                                                      |
| `src/pages/Auth.tsx:50,52`                       | `supabase.auth.signInWithPassword()`              | Identity provider is Supabase Auth by design                                                                                                                       |
| `src/pages/merchant/Login.tsx:24,27`             | Supabase Auth sign-in                             | Same — identity provider                                                                                                                                           |
| `src/pages/admin/Login.tsx:24,31`                | Supabase Auth sign-in + session check             | Same — identity provider                                                                                                                                           |
| `src/components/AdminLayout.tsx`                 | `supabase.auth.signOut()`                         | Correct sign-out via Supabase Auth                                                                                                                                 |
| `src/components/MerchantLayout.tsx`              | `supabase.auth.signOut()`                         | Correct sign-out via Supabase Auth                                                                                                                                 |
| `src/hooks/use-auth.tsx:27,42`                   | `supabase.auth.getSession()`, `onAuthStateChange` | Session bootstrap and real-time state — by design                                                                                                                  |
| `src/lib/api/merchant.ts:179`                    | `supabase.auth.getSession()`                      | File upload needs JWT in Authorization header                                                                                                                      |
| `src/lib/realtime/notification-subscriptions.ts` | `supabase.channel()` Realtime                     | Push notification invalidation only — no business data extracted                                                                                                   |
| `src/pages/admin/DesktopQuickLinks.tsx`          | `desktop_quick_links` CRUD                        | Low-risk admin config table (navigation links only, no finance/PII) — UNKNOWN whether an approved exception exists. **Mark as UNKNOWN** — needs explicit approval. |

---

## 4. Missing Backend API Contracts

The following are identified gaps where the frontend either has no backend endpoint or uses a direct Supabase fallback as the primary path:

| Gap                                  | Frontend Location                                                          | Backend Status                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `desktop_quick_links` CRUD           | `src/pages/admin/DesktopQuickLinks.tsx`                                    | No backend endpoint exists                                                                                                                     |
| Backend CartModule                   | `src/lib/cart-store.ts` (client-only Zustand+localStorage)                 | `backend/src/modules/cart/cart.module.ts` is an empty stub — `@Module({})` with no controllers or services                                     |
| UsersModule routes                   | No frontend API calls to `/users/*`                                        | `backend/src/modules/users/users.module.ts` is an empty stub — `@Module({})` with no controllers or services                                   |
| Delivery cost at checkout            | `src/pages/Checkout.tsx:100` (computes from `governorates.delivery_price`) | `checkout.service.ts:225` hardcodes `p_delivery_cost: 0` — frontend-shown delivery cost is not passed to `place_order` RPC                     |
| Loyalty points discount at checkout  | `src/pages/Checkout.tsx:172-175` (deducts up to `redeemable_amount`)       | `checkout.service.ts:232-233` hardcodes `p_points_discount: 0` and `p_points_earned: 0` — points shown in UI are not persisted in order record |
| Regions/sub-areas within governorate | `src/pages/Checkout.tsx:92-96` (returns empty array, disabled)             | No backend endpoint; comment says "not yet migrated"                                                                                           |
| Admin analytics API (when 403)       | `src/pages/admin/Dashboard.tsx:213-223`                                    | API endpoint exists (`/admin/analytics/overview`) but returns 403 in some conditions, triggering dangerous fallback                            |
| Executive analytics API (when 403)   | `src/pages/admin/Executive.tsx:39-49`                                      | API endpoint exists but returns 403 in some conditions, triggering dangerous fallback                                                          |

---

## 5. Auth / User Context Gaps

### GAP-A — Triple Role Source in Frontend

`use-auth.tsx` computes `isAdmin` and `merchantUser` from three simultaneous data sources:

1. `/auth/context` → `activeRole`, `roles`
2. Direct Supabase `profiles.role` → `directRole`
3. Direct Supabase `merchant_users.merchant_id` → `hasDirectMerchantMembership`

The `isAdmin` flag is true if ANY of these conditions is true. This creates a risk surface where if any single source is compromised or stale, the UI grants elevated access.

**Relevant code:** `src/hooks/use-auth.tsx:140-156`

### GAP-B — No Role Hierarchy or Multi-Role Support

The backend `AuthService.getContext()` returns `roles` as an array containing at most **one role** derived from `profiles.role`. There is no multi-role assignment mechanism in the backend. The frontend contract (`auth-context-contract.ts`) accepts a `roles` array, creating an appearance of multi-role support that does not exist backend-side.

### GAP-C — Customer Profile Dual Lookup / Table Split

`CustomerService.getProfile()` reads `customer_profiles` first and falls back to `profiles`. The `profiles` table remains the primary identity store (used by `AuthService.getContext()`, `LoyaltyService`, checkout identity). The `customer_profiles` table (created in migration `20260425203000_m16_customer_profile_address_book.sql`) may have zero rows in production while `profiles` has the real data. The boundary is unclear.

### GAP-D — Auth Context Points Discrepancy

`use-auth.tsx` returns `profile.points` from the `/auth/context` response (which reads from `profiles.points`). The `Checkout.tsx:161` falls back to `(profile as any)?.points ?? 0` if `loyaltyPreview` is unavailable. But `loyaltyPreview` is fetched from the backend loyalty API which also reads `profiles.points`. These are consistent, but the system holds points in the `profiles` table (a general-purpose identity table), not a dedicated loyalty ledger — no transaction history or audit trail.

### GAP-E — Empty UsersModule

`backend/src/modules/users/users.module.ts` is `@Module({})` with no controllers, no services, no routes. User management (list users, update user role, suspend user, etc.) has no backend API. The `ProfilesModule` exists separately but its scope is UNKNOWN without reading it.

### GAP-F — Merchant Membership Fallback Hook

`use-current-merchant.ts:46-59` fires a direct Supabase fallback query to `merchant_users` whenever the auth context returns no merchant memberships. This means the merchant panel's active merchant ID can be derived from Supabase directly without backend mediation.

---

## 6. Cart Strategy Recommendation

### Current State

- Cart is 100% client-side: Zustand store with `localStorage` persistence (key: `DilMart-store-cart-storage`, version 3)
- Single-merchant constraint is enforced client-side in `cart-store.ts:82-91` (correct)
- Cart prices are computed client-side from product data that was fetched from the backend marketplace API
- Backend `CheckoutService` re-validates ALL prices from DB server-side (good — no price trust from client)
- No backend CartModule implementation

### Risk Assessment

The client-only cart is **acceptable for launch** because:

1. Checkout submit sends only `product_id` + `quantity` — no prices
2. `CheckoutService.resolveCheckoutLines()` re-reads all prices from `products` table (server-side)
3. Stock validation is server-side in `resolveCheckoutLines()`
4. Merchant validation is server-side

The client-only cart is **a risk** because:

1. Abandoned cart recovery is impossible
2. Cart is lost if localStorage is cleared
3. Cross-device cart sync is impossible
4. Product data in cart may become stale (price/stock changed after add to cart but before checkout submit)

### Recommendation

**For Phase 1:** Keep client-side cart. The backend already re-validates at checkout. The empty `CartModule` stub can remain.
**Decision required:** Explicitly document the "client cart only" decision in DECISION_LOG so the empty CartModule is not treated as a bug.
**Phase 2 or later:** If cross-device persistence is needed, add a server-side cart endpoint. This is not a P0 blocker for launch.

---

## 7. UsersModule Minimum Required Scope

### Current State

`backend/src/modules/users/users.module.ts` is completely empty. Imported in `AppModule` but contributes nothing.

### What Is Already Covered Elsewhere

- Profile read: Covered by `AuthService.getContext()` → `/auth/context`
- Customer profile read/update: Covered by `CustomerModule` → `/customer/profile`
- Customer addresses: Covered by `CustomerModule` → `/customer/addresses`
- Merchant user management: Covered by `MerchantUsersModule`

### What Is Missing

1. **Admin: List all users** — No endpoint. Admin currently relies on the Supabase fallback in `scoped-queries.ts:213-229` (DANGER-3)
2. **Admin: Get user by ID** — No endpoint
3. **Admin: Update user role** — No endpoint
4. **Admin: Suspend/ban user** — No endpoint

### Minimum Required for Phase 1

For Phase 1, the `UsersModule` minimum scope to eliminate the DANGER-3 fallback:

- `GET /users` — Admin-only, paginated list of user profiles (replaces `scoped-queries.ts:213-229` fallback)
- Route guard: must require `admin` or `super_admin` role

This is a **Phase 1B coding task** (not analysis — requires explicit approval before implementation).

---

## 8. P0 Fix List

These are issues that must be resolved before the platform is considered safe for real operations.

| ID   | Issue                                                                                        | Location                                                   | Action Required                                                                               |
| ---- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| P0-1 | Admin analytics falls back to direct Supabase on 403 — platform-wide orders/finance exposed  | `src/pages/admin/Dashboard.tsx:83-224`                     | Fix the API 403 root cause OR remove the Supabase fallback and show an error state            |
| P0-2 | Executive dashboard always falls back to direct Supabase — 8 weeks of all orders exposed     | `src/pages/admin/Executive.tsx:39-79`                      | Same — fix API or remove fallback                                                             |
| P0-3 | Platform customer list falls back to `profiles` direct read — PII (email, phone) bypass      | `src/lib/scoped-queries.ts:212-229`                        | Remove Supabase fallback; fix backend `/users` endpoint instead                               |
| P0-4 | Merchant finance falls back to direct `orders` read — finance integrity bypassed             | `src/lib/api/merchant.ts:322-338`                          | Remove fallback; fix backend finance endpoint                                                 |
| P0-5 | Merchant orders list falls back to direct Supabase — customer phone/name exposed to merchant | `src/lib/scoped-queries.ts:89-106`                         | Remove fallback; fix backend orders endpoint                                                  |
| P0-6 | Frontend role resolution uses direct Supabase as co-equal source — auth bypass risk          | `src/hooks/use-auth.tsx:86-127`                            | Remove direct Supabase role/membership queries; rely solely on `/auth/context`                |
| P0-7 | Merchant login falls back to direct Supabase for role check — auth bypass risk               | `src/pages/merchant/Login.tsx:47-70`                       | Remove direct Supabase fallback post-login                                                    |
| P0-8 | Delivery cost hardcoded to 0 at checkout — UI shows delivery fee, DB records 0               | `backend/src/modules/checkout/checkout.service.ts:225`     | Pass `governorate_id`-derived delivery cost to `place_order` RPC                              |
| P0-9 | Points discount hardcoded to 0 — UI deducts points, DB records 0                             | `backend/src/modules/checkout/checkout.service.ts:232-233` | Backend must compute actual `p_points_discount` and `p_points_earned` based on `points_spent` |

---

## 9. P1 Fix List

These are important quality/consistency issues that should be resolved before launch but are not immediate data-integrity threats.

| ID    | Issue                                                                                 | Location                                                 | Action Required                                                                          |
| ----- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| P1-1  | Merchant dashboard fallback reads `products`+`orders` directly on 403/404             | `src/lib/api/merchant.ts:100-144`                        | Remove Supabase fallback; fix backend merchant dashboard endpoint                        |
| P1-2  | Merchant readiness fallback reads `merchant_settings`+`products` directly on 403      | `src/lib/api/merchant.ts:254-286`                        | Remove Supabase fallback; fix backend readiness endpoint                                 |
| P1-3  | `use-current-merchant.ts` falls back to direct `merchant_users` read                  | `src/hooks/use-current-merchant.ts:46-59`                | Remove fallback; rely on `merchant_memberships` from `/auth/context`                     |
| P1-4  | `scoped-queries.ts` merchant customer list reads `orders` directly for contact data   | `src/lib/scoped-queries.ts:185-209`                      | Remove fallback; fix backend customer endpoint                                           |
| P1-5  | `scoped-queries.ts` merchant coupon list reads `coupons` directly on 403              | `src/lib/scoped-queries.ts:126-135`                      | Remove fallback; fix backend coupon endpoint                                             |
| P1-6  | `scoped-queries.ts` merchant product list reads `products` directly on 403            | `src/lib/scoped-queries.ts:47-67`                        | Remove fallback; fix backend product endpoint                                            |
| P1-7  | `desktop_quick_links` has no backend endpoint — direct Supabase CRUD                  | `src/pages/admin/DesktopQuickLinks.tsx`                  | Either create backend endpoint or explicitly approve as exception                        |
| P1-8  | `CartModule` is an empty stub registered in `AppModule`                               | `backend/src/modules/cart/cart.module.ts`                | Document explicit decision: client-only cart or add server sync                          |
| P1-9  | `UsersModule` is an empty stub registered in `AppModule`                              | `backend/src/modules/users/users.module.ts`              | Implement minimum scope: `GET /users` for admin                                          |
| P1-10 | Customer profile lives in both `profiles` and `customer_profiles` — boundary unclear  | `backend/src/modules/customer/customer.service.ts:13-33` | Document authoritative table; remove dual-lookup once migrated                           |
| P1-11 | No cart data staleness protection — product prices/stock may change after add to cart | `src/lib/cart-store.ts`                                  | Add validation step at checkout start (or rely on CheckoutService rejection as the gate) |
| P1-12 | `AuthContextResponse.roles` array always has max one element — misleading contract    | `backend/src/modules/auth/auth.service.ts:112-113`       | Align contract or add documentation                                                      |

---

## 10. Recommended Phase 1B Coding Tasks

These are the coding tasks recommended to execute in Phase 1B (after this analysis is reviewed and approved). They are ordered by severity.

### 1B-TASK-01: Remove Admin Dashboard Supabase Fallback (P0-1, P0-2)

**Files:** `src/pages/admin/Dashboard.tsx`, `src/pages/admin/Executive.tsx`
**Action:** Investigate why the admin API returns 403. If the API is properly authorized, remove `buildAdminOverviewFallback()` and `buildExecutiveFallback()` entirely. Replace with a visible error state or a restricted-data placeholder. Do NOT keep Supabase fallbacks for analytics.
**Risk if left:** Financial data visible to anyone with Supabase anon key read access.

### 1B-TASK-02: Remove Frontend Role Resolution via Supabase (P0-6)

**Files:** `src/hooks/use-auth.tsx:86-127`
**Action:** Remove `directRoleQuery` and `directMerchantMembershipQuery`. Compute `isAdmin` and `merchantUser` only from the `/auth/context` response. If `/auth/context` fails, set auth status to error/unauthenticated.
**Risk if left:** UI role-based routing can diverge from backend authorization.

### 1B-TASK-03: Remove Merchant Login Supabase Fallback (P0-7)

**Files:** `src/pages/merchant/Login.tsx:47-70`
**Action:** Remove the direct Supabase fallback for role resolution after login. If `/auth/context` fails, show a retry or error. Do not infer merchant access from direct Supabase.
**Risk if left:** Auth bypass surface during API downtime.

### 1B-TASK-04: Fix Delivery Cost in Checkout Service (P0-8)

**Files:** `backend/src/modules/checkout/checkout.service.ts`
**Action:** The `CheckoutSubmitDto` already receives `governorate_id`. The CheckoutService must look up `governorates.delivery_price` for that `governorate_id` and use it as `p_delivery_cost` instead of hardcoding 0.
**Risk if left:** Database records incorrect order totals; delivery fee not collected; finance reconciliation wrong.

### 1B-TASK-05: Fix Points Discount in Checkout Service (P0-9)

**Files:** `backend/src/modules/checkout/checkout.service.ts`, `backend/src/modules/loyalty/loyalty.service.ts`
**Action:** When `payload.points_spent > 0`, the CheckoutService must: (1) compute `points_discount = points_spent * 10` IQD, (2) pass actual `p_points_discount` to `place_order`, (3) call `LoyaltyService.redeem()` atomically, (4) pass actual `p_points_earned` (compute from merchandise subtotal).
**Risk if left:** Customers see a discount in UI that is not reflected in the order record. Finance reconciliation incorrect.

### 1B-TASK-06: Remove Platform Customer List Supabase Fallback (P0-3)

**Files:** `src/lib/scoped-queries.ts:212-229`
**Action:** Implement `GET /users` backend endpoint in `UsersModule` (admin-only). Replace the fallback with a proper API call.
**Risk if left:** All customer PII readable via frontend Supabase client.

### 1B-TASK-07: Remove Merchant Finance Supabase Fallback (P0-4)

**Files:** `src/lib/api/merchant.ts:322-338`
**Action:** Fix the backend `GET /merchants/:id/finance/summary` endpoint root cause. Remove Supabase fallback.
**Risk if left:** Finance data bypasses the backend financial model.

### 1B-TASK-08: Remove Merchant Orders Supabase Fallback (P0-5)

**Files:** `src/lib/scoped-queries.ts:89-106`
**Action:** Fix the backend orders endpoint. Remove the Supabase fallback that exposes `customer_name`, `customer_phone` to merchant scope.
**Risk if left:** Customer PII (phone, name) visible to merchants via direct Supabase.

### 1B-TASK-09: Document CartModule Decision

**Files:** `backend/src/modules/cart/cart.module.ts`, `governance/DECISION_LOG.md`
**Action:** Write a decision entry: "Cart is client-only for launch. CartModule is intentionally empty." Or specify if server-side cart sync is desired.
**Risk if left:** Confusion about what CartModule is for; developers may add conflicting implementations.

### 1B-TASK-10: Implement Minimum UsersModule

**Files:** `backend/src/modules/users/users.module.ts`
**Action:** Add `GET /users` endpoint with admin role guard. Returns paginated list of profiles. This unblocks removal of DANGER-3 (P0-3 / 1B-TASK-06).
**Risk if left:** Admin user list relies on dangerous Supabase fallback.

---

## Appendix: Scope Boundary Compliance

Per CURRENT_PHASE.md "Not included":

- No new features implemented ✓
- No electronic payment integration ✓
- No multi-merchant checkout ✓
- No redesign ✓
- No production deployment ✓
- No destructive DB operations ✓

Per CURRENT_PHASE.md "Definition of Done":

- No code changes ✓
- Full analysis report created ✓
- All findings tied to files/paths ✓
- No guessing ✓
- Unknowns marked ✓ (see DANGER-7 row in §3 for `desktop_quick_links` approval status)

---

## UNKNOWNS

- **UNKNOWN-1:** Whether the admin analytics API (`/admin/analytics/overview`) returns 403 by design or as a bug. The 403-fallback-to-Supabase pattern suggests the API was returning 403 at some point during development. Root cause not determinable from static analysis alone.
- **UNKNOWN-2:** Whether `desktop_quick_links` direct Supabase CRUD has been explicitly approved as an exception per MASTER_SPEC §5.
- **UNKNOWN-3:** Whether the `profiles` → `customer_profiles` migration is expected to be complete (i.e., all users have a `customer_profiles` row) or whether `profiles` is still the primary customer data source. Migration file exists (`20260425203000_m16_customer_profile_address_book.sql`) but migration state cannot be verified from static analysis.
- **UNKNOWN-4:** The `ProfilesModule` contents were not inspected. Its relationship to `UsersModule` and whether it partially covers the "user management" gap is UNKNOWN.
- **UNKNOWN-5:** Whether the `place_order` RPC correctly handles `p_points_discount = 0` without applying a discount (expected behavior) or whether a separate redemption step is supposed to follow. The `LoyaltyService.redeem()` is not called from `CheckoutService` — whether this is intentional (redeem separately) or a bug is UNKNOWN.
- **UNKNOWN-6:** RLS policies on `orders`, `profiles`, `merchant_users`, `products` tables. The fallbacks would only function if RLS grants read access via the frontend anon/user key. Without inspecting the DB policies, the actual data exposure surface cannot be fully quantified.
