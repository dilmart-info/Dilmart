# DILMART PHASE 3H: Merchant Dashboard Overview & Analytics Multi-Store Authority

## 1. Executive Summary

- **Task Identifier:** `DILMART-PHASE-3H-MERCHANT-DASHBOARD-OVERVIEW-MULTI-STORE-AUTHORITY-001`
- **Feature Branch:** `frontend/dilmart-merchant-dashboard-authority` (merged & deleted)
- **Base Commit:** `9e78a3879d3d17a5df909240cb9360d1cbc5b78c`
- **Pull Request:** [PR #26](https://github.com/dilmart-info/Dilmart/pull/26) (Merged & Closed)
- **Approved Source HEAD SHA:** `83a02b907e2712c1c544cd965e448ce7a85823bd`
- **Resulting Merge SHA:** `5cf80a80d9d20aa50e78f5f1a5ee057792e0bfbb`
- **Status:** `MERGED_AND_SEALED`
- **Predecessor Phase:** Phase 3G (`PR #24` & `PR #25` merged, `PHASE_3G_MERGED`)
- **State Flags:**
```text
PHASE_3H_MERGED
PR_26_CLOSED
PR_26_SOURCE_HEAD_83A02B9
PR_26_MERGE_SHA_5CF80A8
MAIN_CI_PASS
NATIVE_CI_PASS
NETLIFY_GATE_PASS
NETLIFY_PUBLISH_SKIPPED
RENDER_DEPLOYMENT_STATE_UNVERIFIED
NO_DB_MIGRATION
NO_LIVE_DB_MUTATION
READY_FOR_NEXT_DEVELOPMENT_PHASE
```

---

## 2. Architectural Invariants & Scope Delivered

### A. Explicit Backend Dashboard Route & Hardened UUIDs
- **Explicit Route:**
  - `GET /merchants/:id/dashboard` — Accessible by `super_admin`, `admin`, `merchant_owner`, `merchant_manager`, `merchant_staff`.
  - `:id` strictly validated via `ParseUUIDPipe({ version: "4" })`.
- **Hardened Sibling Endpoints:**
  - `GET /merchants/:id/dashboard-stats`
  - `GET /merchants/:id/readiness`
  - `GET /merchants/:id/performance-scorecard`
  - All bound to `new ParseUUIDPipe({ version: "4" })`.

### B. Legacy Dashboard Route Lockdown
- `GET /merchant/dashboard`:
  - Restricted strictly to `@Roles("super_admin", "admin")`.
  - Merchant roles (`merchant_owner`, `merchant_manager`, `merchant_staff`) are rejected with HTTP 403 Forbidden.
  - Requires `?merchant_id=` (UUID v4) via `LegacyMerchantDashboardQueryDto` and `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`.
  - Omission of `merchant_id` rejected with HTTP 400 Bad Request.
  - Fallback to first merchant store completely eliminated in `merchants.service.ts` (`throw new ForbiddenException("Merchant id is required.")`).

### C. Canonical Response Contract & Fail-Closed Parsers
- Canonical response object strictly includes `merchant_id: merchantId`.
- **Fail-Closed Parser (`parseCanonicalDashboardResponse`):**
  - Asserts response is a non-null object with matching `merchant_id`.
  - Validates numeric metric fields (`products_count`, `active_products`, `total_orders`, `pending_orders`, `total_revenue`, `month_revenue`, `unread_notifications`, `low_stock_count`) as finite, non-negative numbers.
  - Validates array structures (`top_products`, `low_stock_items`, `recent_orders`).
  - Strictly asserts `top_products[].revenue` when present is a finite number `>= 0` (rejects negative numbers and NaN; permits optional omission).
  - Validates ISO-8601 timestamps on order items.

### D. Frontend Keyed Workspace & Race Condition Immunity
- **Keyed Workspace:**
  - `<MerchantOverviewWorkspace key={merchantId} merchantId={merchantId} />`.
  - Synchronous reset and unmount of previous store workspace when active store changes.
  - Guarantees complete immunity against out-of-order responses or deferred cross-store contamination.
- **Runtime Fix:**
  - Added official `merchantApi.getMerchantDashboard(merchantId)` in `src/lib/api/merchant.ts` (and exposed via `apiClient`).
  - Resolved runtime TypeError crashing the Overview page.
- **Truthful UI States:**
  - Dedicated `MerchantOverviewSkeleton` for truthful loading state.
  - Dedicated retryable error banner on fetch failures.
  - Zero misleading zero metrics displayed during loading or error conditions.

---

## 3. Verification Evidence

| Test Suite | Scope | Result | Details |
|---|---|---|---|
| `backend/tests/merchant-dashboard-multi-store-authority.test.mjs` | UUID v4 validation, service scope, inactive store rejection, legacy route admin lockdown, real NestJS HTTP boundary | **PASS** | 13 discrete test cases (0 failures) |
| `src/pages/merchant/Overview.test.tsx` | Runtime contract, canonical parser, negative/NaN revenue rejection, race condition immunity, keyed workspace store switch | **PASS** | 14 tests passed (0 failures) |
| CI Critical PR Quality & Security (`DilMart Store Launch Critical PR Quality & Security CI`) | Lint, builds, full unit and integration tests, architecture guards | **PASS** | Run `33851843099` (14m 17s) |
| Native Foundation CI (`Native Foundation CI`) | Android & iOS build and asset integrity | **PASS** | Run `33851843164` (8m 52s) |
| Netlify Production Deploy Gate | Pre-deployment verification gate | **PASS** | Run `33853000693` (8s) |

---

## 4. Live Operation & Database Guard Status

```text
Repository: dilmart-info/Dilmart
Merged Pull Request: #26
Approved Source HEAD: 83a02b907e2712c1c544cd965e448ce7a85823bd
Resulting Merge SHA: 5cf80a80d9d20aa50e78f5f1a5ee057792e0bfbb
Critical CI on main: SUCCESS (Run 33851843099, 14m 17s)
Native Foundation CI on main: SUCCESS (Run 33851843164, 8m 52s)
Netlify Production Deploy Gate: SUCCESS (Run 33853000693, 8s)
Netlify publish: SKIPPED (NETLIFY_PRODUCTION_DEPLOY_ENABLED is false, should_deploy=false)
Render service: UNVERIFIED (no provider telemetry proving deployed commit)
Backend hostname: NOT MODIFIED
Supabase project ref: ztplxqlthuqkuktbznbo
Environment role: store current/live
DB migrations executed: 0
Live DB writes executed: 0
```

Phase 3H implementation PR #26 is successfully merged into `main`. The repository is ready for the next development phase under full governance integrity.
