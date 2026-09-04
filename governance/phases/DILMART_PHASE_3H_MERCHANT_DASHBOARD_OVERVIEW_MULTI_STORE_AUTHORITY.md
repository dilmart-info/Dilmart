# Phase 3H: Merchant Dashboard Overview & Analytics Multi-Store Authority

## Phase Identity
- **Task Code:** `DILMART-PHASE-3H-MERCHANT-DASHBOARD-OVERVIEW-MULTI-STORE-AUTHORITY-001`
- **Branch:** `frontend/dilmart-merchant-dashboard-authority`
- **Base Commit:** `9e78a3879d3d17a5df909240cb9360d1cbc5b78c` (origin/main)
- **Status:** `IMPLEMENTATION_COMPLETE_READY_FOR_DRAFT_PR`

---

## Objective
Establish complete multi-store authority, strict UUID validation, and fail-closed data isolation for the merchant backoffice Overview page and Dashboard endpoints:
1. **Frontend Runtime Fix:** Correct `src/pages/merchant/Overview.tsx` to stop invoking non-existent `apiClient.getMerchantDashboard`, and provide official `merchantApi.getMerchantDashboard(merchantId)` client method.
2. **Explicit Backend Endpoint:** Implement and harden `GET /merchants/:id/dashboard` with `ParseUUIDPipe({ version: "4" })` and role-based access control (`super_admin`, `admin`, `merchant_owner`, `merchant_manager`, `merchant_staff`).
3. **Legacy Route Lockdown:** Restrict legacy `GET /merchant/dashboard` strictly to platform admins (`super_admin`, `admin`); merchant roles are rejected with HTTP 403 Forbidden. The legacy route strictly requires `?merchant_id=` query param (UUID v4) and eliminates first-store fallback.
4. **Canonical Contract:** Ensure dashboard responses always contain `merchant_id` matching the requested merchant, and validate all numeric metrics (products, orders, financial totals, top products, low stock, recent orders).
5. **Keyed Workspace & State Isolation:** Convert `Overview.tsx` to `<MerchantOverviewWorkspace key={merchantId} merchantId={merchantId} />`, ensuring synchronous component reset on store switch and full immunity against deferred cross-store race conditions.
6. **Truthful UI States:** Deliver distinct, truthful Loading, Error, and Empty states with zero fake zero metrics displayed during loading or errors.

---

## Changes Made

### 1. Backend
- **`backend/src/modules/merchants/merchants.dto.ts`:**
  - Added `LegacyMerchantDashboardQueryDto` requiring `@IsUUID("4") merchant_id!: string;`.
- **`backend/src/modules/merchants/merchant-dashboard.controller.ts`:**
  - Restricted `@Get("dashboard")` to `@Roles("super_admin", "admin")`.
  - Added `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`.
  - Bound `query` to `LegacyMerchantDashboardQueryDto` (requests without `merchant_id` fail with HTTP 400 Bad Request; no first-store fallback).
- **`backend/src/modules/merchants/merchants.controller.ts`:**
  - Added explicit `@Get(":id/dashboard")` with `new ParseUUIDPipe({ version: "4" })` and roles `super_admin`, `admin`, `merchant_owner`, `merchant_manager`, `merchant_staff`.
  - Hardened `@Get(":id/dashboard-stats")`, `@Get(":id/readiness")`, `@Get(":id/performance-scorecard")` by applying `new ParseUUIDPipe({ version: "4" })` to `:id`.
- **`backend/src/modules/merchants/merchants.service.ts`:**
  - In `getMyMerchantDashboard`: enforced `if (!requestedMerchantId) throw new ForbiddenException("Merchant id is required.");` eliminating any silent fallback.
  - Injected canonical `merchant_id: merchantId` into the returned response payload.

### 2. Frontend
- **`src/lib/api/merchant.ts`:**
  - Added `CanonicalMerchantDashboardResponse` interface.
  - Added `getMerchantDashboard(merchantId: string)` calling `GET /merchants/${encodeURIComponent(merchantId)}/dashboard`.
- **`src/pages/merchant/Overview.tsx`:**
  - Exported `parseCanonicalDashboardResponse(raw, expectedMerchantId)` failing closed on missing/mismatched `merchant_id`, non-objects, negative numbers, or invalid timestamps.
  - Exported `MerchantOverviewSkeleton` for truthful loading feedback.
  - Implemented `MerchantOverviewWorkspace` keyed by `merchantId`.
  - Handled retryable error state with distinct banner without zero-data falsification.
- **`src/pages/merchant/Overview.test.tsx`:**
  - Added runtime contract test proving `merchantApi.getMerchantDashboard` and `apiClient.getMerchantDashboard` exist and function.
  - Added contract assertion unit tests verifying fail-closed parsing on invalid types, negative counts, corrupted dates, and mismatched `merchant_id`.
  - Added deferred race condition test proving late responses from Store A cannot contaminate Store B.
  - Added multi-store isolation test verifying instant unmount and remount on store switch.

### 3. Verification Suites Added
- **`backend/tests/merchant-dashboard-multi-store-authority.test.mjs`:**
  - 13 comprehensive tests covering UUID v4 validation, service-layer scope authority, inactive store rejection, legacy route admin lockdown, and real NestJS HTTP server dispatch (`RolesGuard` + `ValidationPipe`).

---

## Verification Summary
- **Backend Targeted Test:** `node backend/tests/merchant-dashboard-multi-store-authority.test.mjs` — 13 passed, 0 failed.
- **Frontend Targeted Test:** `npx vitest run src/pages/merchant/Overview.test.tsx` — 13 passed, 0 failed.
- **Database Migrations:** 0.
- **Live Database Writes:** 0.
- **Deployment Status:** Not deployed.
