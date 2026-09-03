# Phase 3E: Merchant Coupons Multi-Store Authority & Policy Isolation

## Task Identity

`DILMART-PHASE-3E-MERCHANT-COUPONS-MULTI-STORE-AUTHORITY-001`

## Base, Branch & PR

- **Repository:** `dilmart-info/Dilmart`
- **Base Branch:** `main` (`50062823f07a77e4480bddedf22db79f35598cd6`)
- **Feature Branch:** `frontend/dilmart-merchant-coupons-authority` (Merged & Deleted)
- **Source HEAD:** `11c5158ed8ac3e8701e96d0749547b631a8126ce`
- **Merge SHA:** `7a4b8667dce4f90004efb018df6ac0aee492ac94`
- **Pull Request:** [#20](https://github.com/dilmart-info/Dilmart/pull/20) (Merged & Closed)

## Status

```text
PHASE_3E_MERGED
PR_20_CLOSED
PR_20_SOURCE_HEAD_11C5158
PR_20_MERGE_SHA_7A4B866
MAIN_CI_PASS
NATIVE_CI_PASS
NETLIFY_GATE_PASS
NETLIFY_PUBLISH_SKIPPED
RENDER_DEPLOYMENT_STATE_UNVERIFIED
NO_DB_MIGRATION
READY_FOR_NEXT_DEVELOPMENT_PHASE
```

## Post-Merge Verification Evidence

- **Critical CI (`DilMart Store Launch Critical PR Quality & Security CI`):** run `33761749597` — success
- **Native CI (`Native Foundation CI`):** run `33761749579` — success
- **Netlify Gate Runs:** `33762231769` and `33762263873`
- **Final Comprehensive Netlify Gate:** run `33762263873`
- **Netlify Publish Status:** Both publish jobs skipped (gate only, no publish; `NETLIFY_PRODUCTION_DEPLOY_ENABLED` false/unset)
- **Render Deployment State:** unverified (no provider telemetry proving deployed commit)
- **Database Status:** 0 migrations applied, 0 live mutations.

## Objective & Invariants

Hardened Merchant Coupons across backend services, controllers, DTOs, frontend workspace, and aligned commercial policy authority. Delivered truthful loading and error states, strict multi-store isolation, validated HTTP boundaries, role-based gating, edit IDOR closure, and authoritative deletion proof.

### Key Architectural & Safety Invariants:

1. **Synchronous Store Reset (Keyed Workspace Pattern):**
   - Outer `MerchantCoupons` component resolves `useCurrentMerchant()` and `canMerchantManageCoupons(membership?.role)`.
   - Renders inner `<MerchantCouponsWorkspace key={merchantId} merchantId={merchantId} canManage={canManage} />`.
   - The React `key={merchantId}` synchronously unmounts and remounts component-local state and active observers upon store switch without calling state setters during render. It does not delete React Query cache entries; cache isolation is provided by merchant-scoped query keys.
   - Tested and verified: switching from Store A to Store B completely clears draft inputs and prevents Cross-Store leakage.

2. **Response Contract Validation:**
   - Reusable `assertCouponsContractMerchantId` assertion inside each `queryFn` requires `merchant_id === expectedMerchantId` before data enters the React Query cache.
   - Fails closed if foreign or unassigned coupons are returned.
   - Platform mode does not apply the merchant-only row assertion, permitting global listings.

3. **Multi-Store Isolation & Deferred Race Handling:**
   - Late list results are isolated by merchant-scoped query keys and keyed workspace remounting.
   - `isMountedRef` and `liveMerchantIdRef` in `CouponsPage` protect late mutation callbacks, toasts, form resets, and query invalidations.
   - Proved with real tests that late-resolving or late-rejecting requests from Store A after switching to Store B do not mutate, alter, or produce toasts in Store B UI, nor invalidate Store B query cache.

4. **Centralized Backend Coupon Scope Helper:**
   - Private helper `resolveMerchantCouponScope(merchantId, actor, isWrite)` in `CouponsService`:
     - Missing actor identity/role => HTTP 403 `ForbiddenException`.
     - Merchant roles (`owner`, `manager`, `staff`):
       - Exact membership in `merchant_users`.
       - Exact status `active` in `merchants`.
       - Explicit merchant ID required (no first-store fallback).
       - Staff write attempts (POST/DELETE) => HTTP 403 `ForbiddenException`.
     - Admin/super_admin: explicit merchant ID inspects specific store; omitted merchant ID inspects platform-wide.
     - Unknown roles => HTTP 403 `ForbiddenException`.

5. **Edit IDOR Closure:**
   - In `upsertCoupon`: when `payload.id` is provided, the service first queries `coupons` scoped by `id` and `merchant_id`.
   - If the coupon does not belong to the calling merchant, throws HTTP 404 `NotFoundException` without leaking existence or allowing cross-tenant edits.

6. **Authoritative Deletion Proof:**
   - In `deleteCoupon`: deletion queries rows strictly scoped to `merchant_id`.
   - Inspects returned deleted IDs: if zero rows deleted, throws HTTP 404 `NotFoundException` (never returning a deceptive `{ ok: true }`).

7. **Server-Side Commercial Policy Authority:**
   - Backend and frontend use aligned canonical profile definitions in separate backend/frontend modules (`backend/src/common/commercial-policy.ts` and `src/lib/commercial-policy-profiles.ts`).
   - Resolves merchant assignment from `merchant_policy_assignments` (defaults to `balanced`).
   - Validates `maxDiscountPercent`, `minCouponOrderAmount`, and `maxCouponUsage`.
   - Database read failures on policy table fail closed with `ServiceUnavailableException` (HTTP 503), never a silent bypass.

8. **Controller & DTO Validation:**
   - Global validation pipe configured as `ValidationPipe({ whitelist: true, transform: true })` stripping unknown properties (without `forbidNonWhitelisted: true`).
   - DTOs validated in `backend/src/modules/coupons/coupons.dto.ts`.
   - `@Param('id', ParseUUIDPipe)` applied on coupon deletion route.
   - Percentage coupons restricted to positive values `<= 100`.
   - Date formats validated and past expiration dates rejected.

9. **Regression Safety:**
   - Preserved `validate_coupon` database RPC compatibility.
   - Preserved platform admin coupons management with general/store filtering.
   - Zero database migrations required.
