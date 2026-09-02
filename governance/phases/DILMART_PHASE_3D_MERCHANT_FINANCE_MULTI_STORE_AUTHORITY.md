# Phase 3D: Merchant Finance Multi-Store Authority & Truthful States

## Task Identity

`DILMART-PHASE-3D-MERCHANT-FINANCE-MULTI-STORE-AUTHORITY-001`

## Base, Branch & PR

- **Repository:** `dilmart-info/Dilmart`
- **Base Branch:** `main` (`6d1f1ea89de97c6025cc106996cffcda03fefe55`)
- **Feature Branch:** `frontend/dilmart-merchant-finance-authority`
- **Pull Request:** [#18](https://github.com/dilmart-info/Dilmart/pull/18)
- **Source HEAD:** `51c798af428d2f68c9cab82ac5671f6509b36c43`
- **Main Merge SHA:** `5e2293b7b0b5c1f0bd4b362dd030d0923cd7bfa8`
- **Merge Status:** Merged & Closed

## Status

```text
PHASE_3D_MERGED
PR_18_CLOSED
PR_18_SOURCE_HEAD_51C798A
PR_18_MERGE_SHA_5E2293B
MAIN_CI_PASS
NATIVE_CI_PASS
NETLIFY_GATE_PASS
NETLIFY_PUBLISH_SKIPPED
RENDER_DEPLOYMENT_STATE_UNVERIFIED
NO_DB_MIGRATION
READY_FOR_NEXT_DEVELOPMENT_PHASE
```

## Objective & Invariants

Hardened the merchant finance experience without altering the M11 finance ledger or settlement engine. Delivered truthful loading and error states, strict multi-store isolation, validated HTTP boundaries, and explicit finance read authority.

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

## Verification Records

- **Main Critical CI:** SUCCESS — Run [33651638275](https://github.com/dilmart-info/Dilmart/actions/runs/33651638275) (5m28s)
- **Native Foundation CI:** SUCCESS — Run [33651638262](https://github.com/dilmart-info/Dilmart/actions/runs/33651638262) (6m12s)
- **Netlify Deploy Gate:** SUCCESS (Gate-only / Publish skipped) — Run [33652307560](https://github.com/dilmart-info/Dilmart/actions/runs/33652307560) (8s)
  - `FRESH`: `true`
  - `CI_OK`: `true`
  - `ALREADY`: `false`
  - `ENABLED`: `false`
  - `DECISION`: `false`
  - Build and publish job: `SKIPPED`
- **Render Backend Deployment:** `UNVERIFIED` (No automated provider deployment metadata or deployed-commit marker)
- **Database Status:** 0 migrations applied, 0 live mutations
