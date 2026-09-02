# Phase 3D: Merchant Finance Multi-Store Authority & Truthful States

## Task Identity

`DILMART-PHASE-3D-MERCHANT-FINANCE-MULTI-STORE-AUTHORITY-001`

## Base & Branch

- **Repository:** `dilmart-info/Dilmart`
- **Base Branch:** `main` (`6d1f1ea89de97c6025cc106996cffcda03fefe55`)
- **Feature Branch:** `frontend/dilmart-merchant-finance-authority`

## Status

```text
IMPLEMENTATION_COMPLETE
ALL_VERIFICATIONS_PASS
FRONTEND_TESTS_PASS (12/12 Finance.test.tsx, 11/11 MerchantLayout.foundation.test.tsx)
BACKEND_TESTS_PASS (8/8 merchant-finance-multi-store-authority.test.mjs, 292/292 full backend suite)
CI_GUARDS_PASS (99/99)
ARCHITECTURE_GUARD_PASS
AUTH_LIFECYCLE_GUARD_PASS
NATIVE_BRAND_ASSETS_PASS
MOBILE_BOUNDARY_PASS
NO_DB_MIGRATIONS_REQUIRED_OR_APPLIED
DRAFT_PR_READY
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
2. **Response Contract Validation:**
   - Reusable `assertFinanceContractMerchantId` assertion inside each `queryFn` requires non-empty `merchant_id === expectedMerchantId` before entering the React Query cache.
3. **Centralized Backend Finance Scope Helper:**
   - Private helper `resolveMerchantFinanceReadScope(merchantId, actor)` in `MerchantsService`:
     - Missing actor identity/role => HTTP 403 `ForbiddenException`.
     - Merchant roles (`owner`, `manager`, `staff`) => exact membership in `merchant_users` and exact status `active` in `merchants`.
     - Admin/super_admin => explicit merchant ID required and existence checked in `merchants` (non-active merchants inspectable for platform oversight).
     - Unknown roles => HTTP 403 `ForbiddenException`.
     - No membership fallback; no first-store fallback.
4. **Authoritative Ledger & Payout Status Enums:**
   - `merchant_ledger_entries.status`: `["pending", "accrued", "payable", "in_payout", "settled", "reversed", "disputed"]`.
   - `merchant_payout_batches.status`: `["draft", "approved", "processing", "settled", "cancelled"]`.
   - Added `"disputed"` to frontend `STATUS_OPTIONS` and labels.
5. **Date Range Validation:**
   - Class-validator constraint `@Validate(IsDateRangeValidConstraint)` ensuring `from <= to` across `ValidationPipe` returning HTTP 400 `BadRequestException`.
6. **Finance Navigation Authority:**
   - `MerchantLayout.tsx` derives `/merchant/finance` visibility from `canMerchantViewFinance(membership?.role)`.
7. **Truthful Independent States:**
   - Independent loading skeleton cards and error cards with retry for summary (never 0 IQD).
   - Independent error state with retry for statement and payout history (never empty healthy lists).
   - Successful sections remain visible if an independent section fails.
8. **Truthful CSV Export:**
   - Button labeled "تصدير الصفحة CSV".
   - Disabled during loading, error, contract mismatch, or empty statement.
   - Filename contains exact current `merchantId`.
   - Generated object URL is immediately revoked.
