# CURRENT PHASE

## Status

```text
PHASE_3E_IMPLEMENTATION_COMPLETE
LOCAL_GATES_PASS
REMOTE_CI_PASS
PR_20_DRAFT_AWAITING_REVIEW
NO_DB_MIGRATION
NO_DEPLOYMENT
```

## Active Phase 3E Details

- **Task:** `DILMART-PHASE-3E-MERCHANT-COUPONS-MULTI-STORE-AUTHORITY-001`
- **Branch:** `frontend/dilmart-merchant-coupons-authority`
- **Pull Request:** Draft PR [#20](https://github.com/dilmart-info/Dilmart/pull/20) (`https://github.com/dilmart-info/Dilmart/pull/20`)
- **Scope:**
  - Hardening Merchant Coupons across backend controller/service, frontend workspace, and aligned commercial policy authority.
  - Multi-store isolation with Keyed Workspace (`key={merchantId}`) resetting component-local state and active observers on store switch (cache isolation provided by merchant-scoped query keys).
  - Fail-closed response assertion (`assertCouponsContractMerchantId`) preventing cross-store query data leakage.
  - Edit IDOR closure preventing cross-store coupon mutations via `id` spoofing.
  - Authoritative deletion proving row removal and returning 404 for foreign or non-existent coupons.
  - Role authority gating: `merchant_staff` can view (GET) coupons in read-only mode, but is strictly blocked from upsert and delete operations.
  - Truthful states: dedicated loading skeleton, truthful error banner with retry action, distinct empty state.
  - Server-side and client-side commercial policy enforcement (balanced / strict profiles), failing closed on table read failures with `ServiceUnavailableException` (HTTP 503). Backend and frontend use aligned canonical profile definitions in separate backend/frontend modules.
  - Race condition immunity: late list results are isolated by merchant-scoped query keys and keyed workspace remounting; `isMountedRef` and `liveMerchantIdRef` protect late mutation callbacks, toasts, form resets, and query invalidations.
- **Database Status:** 0 migrations applied, 0 live mutations.

---

## Preceding Governance / Merged Phases

### Phase 3D: Merchant Finance Multi-Store Authority & Truthful States
- **Task:** `DILMART-PHASE-3D-MERCHANT-FINANCE-MULTI-STORE-AUTHORITY-001`
- **PR:** [#18](https://github.com/dilmart-info/Dilmart/pull/18) (Merged & Closed)
- **Source HEAD:** `51c798af428d2f68c9cab82ac5671f6509b36c43`
- **Merge SHA:** `5e2293b7b0b5c1f0bd4b362dd030d0923cd7bfa8`
- **Closure PR:** [#19](https://github.com/dilmart-info/Dilmart/pull/19) (`50062823f07a77e4480bddedf22db79f35598cd6`)

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
