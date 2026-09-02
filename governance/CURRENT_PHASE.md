# CURRENT PHASE

## Task

`DILMART-PHASE-3D-MERCHANT-FINANCE-MULTI-STORE-AUTHORITY-001`

## Branch

`frontend/dilmart-merchant-finance-authority`

## Target Base

`main` (`6d1f1ea89de97c6025cc106996cffcda03fefe55`)

## Pull Request

- **Draft PR:** [#18](https://github.com/dilmart-info/Dilmart/pull/18)
- **Reviewed Initial Source HEAD:** `42948cf3548918d8e967363a0efd3d9662ba4c52`

## Status

```text
PHASE_3D_MICRO_CLOSURE_COMPLETE
ALL_VERIFICATIONS_PASS
FRONTEND_TESTS_PASS (15/15 Finance.test.tsx, 11/11 MerchantLayout.foundation.test.tsx, 4/4 merchant-role-authority.test.ts; 98 files, 913 tests total)
BACKEND_TESTS_PASS (9/9 merchant-finance-multi-store-authority.test.mjs, 292/292 full backend suite)
CI_GUARDS_PASS (99/99)
ARCHITECTURE_GUARD_PASS
AUTH_LIFECYCLE_GUARD_PASS
NATIVE_BRAND_ASSETS_PASS
MOBILE_BOUNDARY_PASS
NO_DB_MIGRATION
DRAFT_PR_UPDATED
NOT_MERGED
NOT_DEPLOYED
```

## Implementation & Verification Summary

1. **Synchronous Store Reset (Keyed Workspace Pattern):**
   - In `MerchantFinance`, resolved `useCurrentMerchant()` and rendered `<MerchantFinanceWorkspace key={merchantId} merchantId={merchantId} />`.
   - The React `key={merchantId}` synchronously unmounts and remounts local filters, pagination, and query state upon switching the active store without performing `setState` during render.
   - Verified by test proving Store A date inputs, status filters, and pagination offsets reset completely upon switching to Store B.
2. **Response Contract Validation:**
   - Implemented `assertFinanceContractMerchantId` inside each `queryFn` (summary, statement, payout history) before responses enter React Query cache.
3. **Multi-Store Isolation & Shared QueryClient Deferred Race Tests:**
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
   - Button labeled "تصدير الصفحة CSV".
   - Disabled during loading, error, contract mismatch, or empty statement.
   - Filename contains exact current `merchantId` and ends in `.csv`.
   - Generates exact CSV containing only currently displayed page rows with correct headers.
   - Revokes object URL immediately upon download.

---

## Completed Governance / Preceding Phases

### Phase 3C: Merchant Catalog Multi-Store Authority & Operations
- **Task:** `DILMART-PHASE-3C-MERCHANT-CATALOG-MULTI-STORE-AUTHORITY-001`
- **PR:** [#16](https://github.com/dilmart-info/Dilmart/pull/16)
- **Source HEAD:** `dbde3cfcd8d3358ce8103dc8e56bffb91b81b6eb`
- **Main Merge SHA:** `2d147230d73632ca5f12d4106640f61a4bb941d3`
- **Merge Status:** Merged & Closed

### Canonical Repository Governance Sync
- **Task:** `DILMART-CANONICAL-REPOSITORY-GOVERNANCE-SYNC-001`
- **PR:** [#14](https://github.com/dilmart-info/Dilmart/pull/14)
- **Merge SHA:** `9a37e19`
- **Merge Status:** Merged & Closed

### Phase 3B: Merchant Order Detail, Decision Queue, and New Order Operations
- **PR:** [#13](https://github.com/dilmart-info/Dilmart/pull/13)
- **Merge SHA:** `57c8f6b21f95a11403d3928918bbc6c0c78b2e2c`
- **Merge Status:** Merged & Closed

---

## Historical Phase Records

The following items are retained for archival reference only; they do not represent active work.

### Product Readiness Invariant (Historical Safety Snapshot)
- **Task:** `DilMart-STORE-PRODUCT-READINESS-INVARIANT-001`
- **Branch:** `fix/product-readiness-invariant`
- **Legacy PR:** PR `#116` in the predecessor repository
- **Phase entry:** `governance/phases/DilMart_STORE_PRODUCT_READINESS_INVARIANT_001.md`
- **Historical status:**
```text
IMPLEMENTATION_COMPLETE
TARGETED_TESTS_PASS
FRONTEND_BUILD_PASS
BACKEND_BUILD_PASS
MIGRATIONS_CREATED_NOT_APPLIED
DB_GATES_VERIFIED_LOCAL_EPHEMERAL_ONLY
READY_FOR_PULL_REQUEST
NOT_DEPLOYED
```
- **Historical scope:**
  - One authoritative, reusable server-side product readiness definition;
  - Every activation path (create, update, status, quick add, bulk activate, duplicate, CSV import, admin content bulk) enforces it;
  - Quick Add creates a draft instead of publishing an incomplete product;
  - Keep `is_active` / `is_published` / `visibility_status` internally consistent;
  - Do not make existing archived products public;
  - Regression tests proving the old Quick Add bypass is closed.
- **Historical out-of-scope facts:**
  - Migrations were created but not applied;
  - Existing active-but-unready rows were not retro-corrected;
  - No deployment occurred.

### Other Historical Phases
- Admin Merchant Registration Data — `governance/phases/DilMart_ADMIN_MERCHANT_REGISTRATION_DATA_001.md`
- Ard Al Khaleej Private Catalog QA — merged as PR #73
- Short-description DB fixture repair — merged as PR #72
- Emergency Web Production Bundle Runtime Fix — `governance/phases/DilMart_STORE_WEB_PRODUCTION_VENDOR_CHUNK_CLOSURE.md`
- Mobile Safe Area & RTL Hero Carousel — `governance/phases/DilMart_STORE_MOBILE_SAFE_AREA_HERO_CAROUSEL_CLOSURE.md`
- Native App Icon & Splash Branding — `governance/phases/DilMart_STORE_NATIVE_APP_ICON_SPLASH_CLOSURE.md`
- Native Auth Storage & Session Lifecycle (Phase 3) — merged as PR #64

### Unified Email & WhatsApp OTP Authentication (Batch 2B Historical Snapshot)
The OTP initiative remains **not production-enabled** (staging gate / in-memory idempotency P0).

#### Historical Status
```text
BATCH 2B HALTED AT STAGING GATE
IN-MEMORY IDEMPOTENCY — NOT MULTI-INSTANCE SAFE
REAL_OTP_SMOKE=BLOCKED
NOT_PRODUCTION_ENABLED
```

#### Unresolved Supervisor Items
1. `OTP_PROVIDER` in Render production remains unverified.
2. Meta template name, language, type and approval remain unverified.
3. Real-send testing requires an approved `OTP_TEST_PHONE_E164` and explicit send authorization.
4. Durable multi-instance idempotency is required before production OTP enablement.
5. If OTP work resumes, deployment order must be backend first and frontend second.
