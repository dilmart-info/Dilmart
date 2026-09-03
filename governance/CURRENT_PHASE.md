# CURRENT PHASE

## Status

```text
PHASE_3G_FINAL_CORRECTION
TASK_ID_DILMART_PHASE_3G_MERCHANT_SETTINGS_MULTI_STORE_MUTATION_AUTHORITY_001
PR_24_DRAFT_OPEN
ALL_BACKEND_TESTS_PASS (292/292)
ALL_FRONTEND_TESTS_PASS (1020/1020)
CI_GUARDS_PASS (99/99)
GRANULAR_BACKEND_SUITE_PASS (33/33)
EXTENDED_FRONTEND_SWITCH_PASS (34/34)
REAL_HTTP_BOUNDARY_TEST_PASS
NETLIFY_PUBLISH_SKIPPED
RENDER_DEPLOYMENT_STATE_UNVERIFIED
NO_DB_MIGRATION
NO_LIVE_DB_MUTATION
DRAFT_PR_ONLY
```

---

## Active Implementation Phase

### Phase 3G: Merchant Settings Multi-Store Mutation Authority & Push Device Isolation
- **Task:** `DILMART-PHASE-3G-MERCHANT-SETTINGS-MULTI-STORE-MUTATION-AUTHORITY-001`
- **Feature Branch:** `frontend/dilmart-merchant-settings-authority`
- **Base SHA:** `ae81a2a1dc8fd3da21636627493979cb50b1bbdc`
- **Final Targeted Correction Scope Delivered:**
  - Hardened `parseCanonicalSettingsResponse`: enforces presence of all canonical keys, rejects undefined as null, validates integer sound bounds and logo_url protocol.
  - Hardened `parseCanonicalRegisterPushResponse`: enforces explicit device_label and user_agent types, validates ISO timestamp strings, rejects sensitive field leakage.
  - Hardened `parseCanonicalTestPushResponse`: strictly asserts id, ok, and string error type.
  - Added strict `parseCanonicalReadinessResponse`: validates merchant_id, is_ready boolean, non-negative integer scores, passed_checks <= total_checks, and integrated into Settings queryFn.
  - Added discrete deferred race tests covering late readiness success, late readiness rejection, late registration success, late registration rejection, late delete success, late delete rejection, late test success, and late test rejection.
  - Decoupled push device registration from store global settings patch (device registration NEVER mutates global store settings).
  - Unified `isCurrentOperation(targetMerchantId, generation)` race guards across all async await boundaries (settings, save, logo upload, push registration, test, delete).
  - Explicit settings endpoints (`GET /merchants/:id/settings` and `PATCH /merchants/:id/settings`).
  - Strict UUID and DTO validation with bounds.
  - Non-existent row treated as valid state (`settings_exists: false, settings: null`).
  - Canonical contract `{ merchant_id, settings_exists, settings }` on read and mutation.
  - Legacy routes locked to platform admins only; merchant roles rejected with HTTP 403.
  - Explicit push endpoints (`GET`, `POST`, `POST /test`, `DELETE` on `/merchants/:id/push-subscriptions`).
  - Safe push device projections omitting secret keys and internal user IDs.
  - Staff device isolation and non-disclosing 404 for foreign device access.
  - Product image upload shared endpoint preserved; logo upload hidden from staff in Settings UI.
  - Frontend Keyed Workspace `<MerchantSettingsWorkspace key={merchantId} ... />` with synchronous reset and dirty form protection.
  - Truthful independent loading/error/empty UI states.
- **Verification Suites:**
  - `backend/tests/merchant-settings-multi-store-authority.test.mjs` (33 discrete tests, all pass)
  - `src/pages/merchant/Settings.merchant-switch.test.tsx` (34 tests, all pass)
  - `src/lib/merchant-role-authority.test.ts` (6 tests, all pass)
  - Full frontend suite: 102 files, 1020 tests passed.
  - Full backend suite: 292 tests passed.
  - CI guards: 3 files, 99 tests passed, 0 violations.
- **Database Status:** 0 migrations applied, 0 live mutations.

---

## Preceding Governance / Merged Phases

### Phase 3F: Merchant Customers Privacy & Multi-Store Authority
- **Task:** `DILMART-PHASE-3F-MERCHANT-CUSTOMERS-PRIVACY-MULTI-STORE-AUTHORITY-001`
- **PR:** [#22](https://github.com/dilmart-info/Dilmart/pull/22) (Merged & Closed)
- **Source HEAD:** `d90594389d7d94658b9ca6ed0fb21c0871a7b3e3`
- **Merge SHA:** `a8ba5e052658b7bcce04c75e4fdf9314f25cdb4f`
- **Post-Merge Governance Branch:** `governance/pr22-post-merge-phase3f-closure`
- **Post-Merge Verification Evidence:**
  - Critical CI (`DilMart Store Launch Critical PR Quality & Security CI`): run `33783122855` — success (5m 20s)
  - Native CI (`Native Foundation CI`): run `33783122819` — success (4m 46s)
  - Netlify gate runs: `33783611208` and `33783667116`
  - Final comprehensive Netlify gate: `33783667116` (FRESH=true, CI_OK=true, ALREADY=false, ENABLED=false, decision=false)
  - Both Netlify publish jobs: skipped (`NETLIFY_PUBLISH_SKIPPED` — `NETLIFY_PRODUCTION_DEPLOY_ENABLED` not enabled)
  - Render deployment state: unverified (`RENDER_DEPLOYMENT_STATE_UNVERIFIED` — no provider telemetry proving deployed commit)
  - Database status: 0 migrations applied, 0 live mutations.
- **Scope Delivered:**
  - Dedicated explicit merchant customers endpoint (`GET /merchants/:id/customers`) with strict UUID and query DTO validation (`@MaxLength(100)` on search, `@Max(100)` / `@Min(1)` on limit).
  - Exact merchant membership in `merchant_users` without first-store fallback.
  - Active-store enforcement (`status === 'active'`).
  - Admin/merchant HTTP route separation (`GET /admin/customers` restricted strictly to super_admin/admin; merchant roles rejected with HTTP 403).
  - Canonical merchant_id response contract (`{ merchant_id, items, page, limit, total, hasMore }`).
  - Fail-closed Backend and Frontend payload validation.
  - Masked-only customer identity and phone contract (`phone_masked`: `/^\*{4}\d{4}$/`, `customer_ref`: `/^عميل #[A-F0-9]{4}$/`).
  - No raw customer name/email/phone exposure; extraneous fields dropped from JSON payload and UI.
  - Keyed Workspace (`key={merchantId}`) and merchant-scoped QueryClient isolation.
  - Late resolve/rejection race isolation across store switch.
  - Search and pagination reset on store switch.
  - Truthful loading/error/empty/retry states (loading skeleton, unauthorized banner, unattached banner, retryable error banner, pagination-free empty state).
  - Role authority for owner/manager/staff (`canMerchantViewCustomers`).
  - No migrations and no live operations.
- **Database Status:** 0 migrations applied, 0 live mutations.

---

### Phase 3E: Merchant Coupons Multi-Store Authority & Policy Isolation
- **Task:** `DILMART-PHASE-3E-MERCHANT-COUPONS-MULTI-STORE-AUTHORITY-001`
- **PR:** [#20](https://github.com/dilmart-info/Dilmart/pull/20) (Merged & Closed)
- **Source HEAD:** `11c5158ed8ac3e8701e96d0749547b631a8126ce`
- **Merge SHA:** `7a4b8667dce4f90004efb018df6ac0aee492ac94`
- **Closure PR:** [#21](https://github.com/dilmart-info/Dilmart/pull/21) (`1335c534230e97922da945062f778a98b1c7ed07`)
- **Post-Merge Governance Branch:** `governance/pr20-post-merge-phase3e-closure`
- **Post-Merge Verification Evidence:**
  - Critical CI (`DilMart Store Launch Critical PR Quality & Security CI`): run `33761749597` — success
  - Native CI (`Native Foundation CI`): run `33761749579` — success
  - Netlify gate runs: `33762231769` and `33762263873`
  - Final comprehensive Netlify gate: `33762263873`
  - Both Netlify publish jobs: skipped (`NETLIFY_PRODUCTION_DEPLOY_ENABLED` not enabled)
  - Render deployment state: unverified (no provider telemetry proving deployed commit)
  - Database status: 0 migrations applied, 0 live mutations.
  - Scope delivered:
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
