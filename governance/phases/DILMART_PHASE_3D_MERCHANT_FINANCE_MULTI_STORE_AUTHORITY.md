# Phase 3D: Merchant Finance Multi-Store Authority & Truthful States

## Task Identity

`DILMART-PHASE-3D-MERCHANT-FINANCE-MULTI-STORE-AUTHORITY-001`

## Base, Branch & PR

- **Repository:** `dilmart-info/Dilmart`
- **Base Branch:** `main` (`6d1f1ea89de97c6025cc106996cffcda03fefe55`)
- **Feature Branch:** `frontend/dilmart-merchant-finance-authority`
- **Draft PR:** [#18](https://github.com/dilmart-info/Dilmart/pull/18)
- **Reviewed Initial Source HEAD:** `42948cf3548918d8e967363a0efd3d9662ba4c52`

## Status

```text
IMPLEMENTATION_COMPLETE
MICRO_CLOSURE_VERIFIED
ALL_VERIFICATIONS_PASS
FRONTEND_TESTS_PASS (15/15 Finance.test.tsx, 11/11 MerchantLayout.foundation.test.tsx, 4/4 merchant-role-authority.test.ts; 98 files, 913 tests total)
BACKEND_TESTS_PASS (9/9 merchant-finance-multi-store-authority.test.mjs, 292/292 full backend suite)
CI_GUARDS_PASS (99/99)
ARCHITECTURE_GUARD_PASS
AUTH_LIFECYCLE_GUARD_PASS
NATIVE_BRAND_ASSETS_PASS
MOBILE_BOUNDARY_PASS
NO_DB_MIGRATIONS_REQUIRED_OR_APPLIED
DRAFT_PR_UPDATED
NOT_MERGED
NOT_DEPLOYED
```

## Objective & Invariants

Harden the merchant finance experience without altering the M11 finance ledger or settlement engine. Deliver truthful loading and error states, strict multi-store isolation, validated HTTP boundaries, and explicit finance read authority.

### Key Architectural & Safety Invariants:
1. **Synchronous Store Reset (Keyed Workspace Pattern):**
   - Outer `MerchantFinance` component resolves `useCurrentMerchant()` and `canMerchantViewFinance(membership?.role)`.
   - Renders inner `<MerchantFinanceWorkspace key={merchantId} merchantId={merchantId} />`.
   - The React `key={merchantId}` synchronously unmounts and remounts all local state (filters, pagination, query states) on store switch without calling state setters during render.
   - Verified by test proving Store A date inputs, status filters, and pagination offsets reset completely upon switching to Store B.
2. **Response Contract Validation:**
   - Reusable `assertFinanceContractMerchantId` assertion inside each `queryFn` requires non-empty `merchant_id === expectedMerchantId` before entering the React Query cache.
3. **Multi-Store Isolation & Deferred Race Handling:**
   - Proved with real shared `QueryClient` tests that late-resolving or late-rejecting requests from Store A after switching to Store B do not mutate, alter, or produce errors/toasts in Store B UI.
4. **Centralized Backend Finance Scope Helper:**
   - Private helper `resolveMerchantFinanceReadScope(merchantId, actor)` in `MerchantsService`:
     - Missing actor identity/role => HTTP 403 `ForbiddenException`.
     - Merchant roles (`owner`, `manager`, `staff`) => exact membership in `merchant_users` and exact status `active` in `merchants`.
     - Admin/super_admin => explicit merchant ID required and existence checked in `merchants` (non-active merchants inspectable for platform oversight).
     - Unknown roles => HTTP 403 `ForbiddenException`.
     - No membership fallback; no first-store fallback.
5. **Real Controller HTTP Boundary Validation:**
   - Tested real NestJS HTTP routes on ephemeral ports via `@nestjs/testing`:
     - `GET /merchants/:id/finance/summary`
     - `GET /merchants/:id/finance/statement`
     - `GET /merchants/:id/finance/payout-history`
   - Verified that malformed UUIDs, invalid statuses, negative/excessive pagination, invalid ISO timestamps, `from > to` violations, and non-whitelisted parameters return HTTP 400 (`BadRequestException`) and do not invoke service methods.
   - Verified that valid parameters are properly transformed into numeric types (`limit`, `offset`) before reaching the service.
6. **Finance Navigation Authority:**
   - `MerchantLayout.tsx` derives `/merchant/finance` visibility from `canMerchantViewFinance(membership?.role)`.
7. **Truthful Independent States & Retry Isolation:**
   - Independent loading skeleton cards and error cards with retry for summary (never 0 IQD).
   - Independent error state with retry for statement and payout history (never empty healthy lists).
   - Retrying one failed section (e.g. summary) refetches only that section for the current merchant and does not trigger refetches on the other sections.
8. **Truthful CSV Export Contract:**
   - Button labeled `"تصدير الصفحة CSV"`.
   - Disabled during loading, error, contract mismatch, or empty statement.
   - Filename contains exact current `merchantId` and ends in `.csv`.
   - Generates exact CSV containing only currently displayed page rows with correct headers.
   - Generated object URL is immediately revoked via `URL.revokeObjectURL`.
