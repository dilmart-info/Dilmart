# CURRENT PHASE

## Task

`DILMART-PHASE-3C-MERCHANT-CATALOG-MULTI-STORE-AUTHORITY-001`

## Branch

`frontend/dilmart-merchant-catalog-operations`

## Target Base

`main` (`c4851b8477dfffe8884ec85e9b04d5c16447e066`)

## Status

```text
PHASE_3C_IMPLEMENTATION_COMPLETE
MERCHANT_CATALOG_MULTI_STORE_AUTHORITY_VERIFIED
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
READY_FOR_PULL_REQUEST
```

## Scope

- Enforce explicit `merchant_id` on all merchant catalog mutations (Quick Add, Bulk Actions, Duplicate, CSV Preview, CSV Confirm).
- Backend service layer requires and resolves exact requested `merchant_id` via `ScopeResolverService`, failing closed (400 for missing/invalid, 403 for unauthorized/inactive).
- CSV import sessions strictly enforce preview-to-confirm merchant identity match and prevent cross-store confirmation.
- Scoped product queries in `src/lib/scoped-queries.ts` fail closed on auth/network failure without dropping `merchant_id`.
- Store switching in frontend UI immediately resets selection checkboxes, bulk actions, quick add modals, and CSV import state.
- Role authority helper `canMerchantManageCatalog` gates merchant mutation UI controls for staff members (read-only), while backend guards enforce server-side authority.
- No database migrations, no deployment.

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
