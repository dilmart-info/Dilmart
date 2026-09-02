# Phase 3E: Merchant Coupons Multi-Store Authority & Policy Isolation

## Task Identity

`DILMART-PHASE-3E-MERCHANT-COUPONS-MULTI-STORE-AUTHORITY-001`

## Base, Branch & PR

- **Repository:** `dilmart-info/Dilmart`
- **Base Branch:** `main` (`50062823f07a77e4480bddedf22db79f35598cd6`)
- **Feature Branch:** `feature/phase3e-merchant-coupons-multi-store-authority`
- **Pull Request:** TBD (Draft PR creation pending)

## Status

```text
PHASE_3E_IN_PROGRESS
NO_DB_MIGRATION
BRANCH_COMMERCIAL_RULES_PRESERVED
SHARED_QUERY_CLIENT_PROTECTED
MULTI_STORE_KEYED_WORKSPACE_ENFORCED
TRUTHFUL_MERCHANT_STATES_ENFORCED
ROLE_GATING_ENFORCED
EDIT_IDOR_CLOSED
COMMERCIAL_POLICY_AUTHORITY_ENFORCED
```

## Objective & Invariants

Hardened Merchant Coupons across backend services, controllers, DTOs, frontend workspace, and shared commercial policy authority. Delivered truthful loading and error states, strict multi-store isolation, validated HTTP boundaries, role-based gating, edit IDOR closure, and authoritative deletion proof.

### Key Architectural & Safety Invariants:

1. **Synchronous Store Reset (Keyed Workspace Pattern):**
   - Outer `MerchantCoupons` component resolves `useCurrentMerchant()` and `canMerchantManageCoupons(membership?.role)`.
   - Renders inner `<MerchantCouponsWorkspace key={merchantId} merchantId={merchantId} canManage={canManage} />`.
   - The React `key={merchantId}` synchronously unmounts and remounts all local state (form inputs, filters, query cache mappings) upon store switch without calling state setters during render.
   - Tested and verified: switching from Store A to Store B completely clears draft inputs and prevents Cross-Store leakage.

2. **Response Contract Validation:**
   - Reusable `assertCouponsContractMerchantId` assertion inside each `queryFn` requires `merchant_id === expectedMerchantId` before data enters the React Query cache.
   - Fails closed if foreign or unassigned coupons are returned.

3. **Multi-Store Isolation & Deferred Race Handling:**
   - Implemented `isMountedRef` and `liveMerchantIdRef` protection in `CouponsPage`.
   - Proved with real tests that late-resolving or late-rejecting requests from Store A after switching to Store B do not mutate, alter, or produce toasts in Store B UI.

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
   - Backend imports policy logic from `backend/src/common/commercial-policy.ts` (sharing rules with frontend `commercial-policy-profiles.ts`).
   - Resolves merchant assignment from `merchant_policy_assignments` (defaults to `balanced`).
   - Validates `maxDiscountPercent`, `minCouponOrderAmount`, and `maxCouponUsage`.
   - Database read failures on policy table fail closed (`BadRequestException`), never a silent bypass.

8. **Controller & DTO Validation:**
   - `ListCouponsQueryDto` validated with `whitelist: true, forbidNonWhitelisted: true`.
   - `@Param('id', ParseUUIDPipe)` applied on coupon deletion route.
   - Percentage coupons restricted to positive values `<= 100`.
   - Date formats validated and past expiration dates rejected.

9. **Regression Safety:**
   - Preserved `validate_coupon` database RPC compatibility.
   - Preserved platform admin coupons management with general/store filtering.
   - Zero database migrations required.
