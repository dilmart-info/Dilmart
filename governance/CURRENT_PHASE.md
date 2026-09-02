# CURRENT PHASE

## Task

`DILMART-PHASE-3C-MERCHANT-CATALOG-MULTI-STORE-AUTHORITY-001`

## Branch

`frontend/dilmart-merchant-catalog-operations`

## Target Base

`main` (`c4851b8477dfffe8884ec85e9b04d5c16447e066`)

## Status

```text
PR_16_DRAFT_AWAITING_REVIEW
PHASE_3C_SUPERVISOR_GAPS_RESOLVED
MERCHANT_CATALOG_MULTI_STORE_AUTHORITY_VERIFIED
SYNCHRONOUS_RENDER_REF_ASSIGNMENT_VERIFIED
CAPTURED_MERCHANT_RACE_GUARDS_VERIFIED
DEFERRED_RACE_AND_REJECTION_TESTS_PASS
BACKEND_STRICT_MERCHANT_SIGNATURES_ENFORCED
ACTOR_MERCHANT_FALLBACKS_REMOVED
DTO_VALIDATION_PIPE_HTTP_400_VERIFIED
CONTROLLER_BOUNDARY_HTTP_400_AND_403_VERIFIED
SERVICE_LAYER_AUTHORITY_AND_ISOLATION_VERIFIED
UPDATE_PRODUCT_STATUS_DTO_ADMIN_COMPAT_AND_RUNTIME_MERCHANT_REQUIREMENT_VERIFIED
SCOPED_QUERIES_FAIL_CLOSED_VERIFIED
ROLE_AUTHORITY_GATING_VERIFIED
CROSS_STORE_MUTATION_PREVENTION_VERIFIED
TARGETED_TESTS_PASS
FRONTEND_BUILD_PASS
BACKEND_BUILD_PASS
CI_GUARDS_PASS
MOBILE_BOUNDARY_PASS
NO_DB_MIGRATION
NO_DEPLOYMENT_PERFORMED
```

## Scope & Supervisor Remediation Summary

1. **Frontend Synchronous Ref Assignment & Race Condition Isolation (`ProductsPage.tsx` & `ProductImport.tsx`):**
   - In `ProductsPage.tsx`, updated `currentMerchantIdRef.current = context.merchantId` synchronously during render body, completely eliminating the render-to-effect race window.
   - In `ProductsPage.tsx`, guarded all mutation callbacks (`onSuccess` and `onError`) for Quick Add, Bulk Actions, Status Updates, and Product Duplication with `currentMerchantIdRef.current === data.targetMerchantId`.
   - In `ProductImport.tsx`, captured `targetMerchantId` in `previewMutation` and `confirmMutation` error handlers, suppressing `onError` error toasts when `activeMerchantIdRef.current !== err.targetMerchantId`.
   - Proved with deferred async race tests (resolution and rejection) in `ProductsPage.test.tsx` and `ProductImport.test.tsx` that responses from Store A resolving/rejecting after switching to Store B cannot mutate, close, toast for, or clear Store B UI state or selections.

2. **DTO ValidationPipe & Controller Boundary Rejections (`backend/tests/merchant-catalog-multi-store-authority.test.mjs`):**
   - Added real `ValidationPipe` DTO validation tests asserting HTTP 400 (`BadRequestException`) on missing `merchant_id` across `MerchantQuickAddProductDto`, `MerchantBulkActionDto`, `MerchantProductDuplicateDto`, `MerchantProductImportPreviewDto`, and `MerchantProductImportConfirmDto`.
   - Asserted HTTP 400 on malformed UUID strings (`merchant_id: "not-a-valid-uuid"`), nested product IDs (`product_ids: ["not-a-uuid"]`), category IDs (`category_id: "not-a-uuid"`), and import IDs (`import_id: "not-a-uuid"`).
   - Tested controller boundaries on `MerchantProductsController` and `ProductsController` rejecting missing `merchant_id` / missing payload with HTTP 400, and rejecting unauthorized/inactive merchants with HTTP 403 (`ForbiddenException`).
   - Maintained clear architectural distinction between DTO `ValidationPipe` checks, Controller boundary checks, and Service layer authority execution.

3. **`UpdateProductStatusDto` Admin Compatibility & Runtime Requirement:**
   - Kept `UpdateProductStatusDto.merchant_id` as `@IsOptional() @IsUUID("4")` on the DTO class for platform admin compatibility.
   - Documented and strictly enforced that merchant roles require `merchant_id` at runtime in `ProductsService.resolveMerchantForActor` where omission throws HTTP 400 (`BadRequestException`).

4. **Accurate Test Count & Verification:**
   - Frontend Vitest: 97 test files (898 tests) PASS (100% green).
   - Frontend Catalog Scoped Tests: 39 tests PASS (`ProductsPage.test.tsx` [33] + `ProductImport.test.tsx` [6]).
   - Backend Authority Suite: 12 test suites (32 sub-assertions) PASS (`backend/tests/merchant-catalog-multi-store-authority.test.mjs`).
   - Backend Product Import & Readiness Suite: 292 tests PASS (`npm run test` in backend).
   - CI Guards: 99 tests PASS across 3 test files (`npm run test:ci-guards`).
   - Architecture Guard: 0 direct supabase violations (`npm run arch:guard`).
   - Auth Lifecycle Guard: PASS (`npm run auth:guard`).
   - Native Brand Assets: PASS (`npm run native:assets:check`).
   - Mobile Build & Boundary: PASS with 0 forbidden modules (`npm run build:mobile; npm run mobile:boundary`).
   - Frontend & Backend Builds: Clean exit code 0.

5. **Invariants Maintained:**
   - No database migrations created or executed.
   - No deployments performed.
   - Draft PR #16 remains open and untouched in Draft state.

## Immediately Completed Governance / Preceding Phases

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
