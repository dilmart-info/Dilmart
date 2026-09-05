# CURRENT PHASE

## Status

```text
PHASE_3M_IMPLEMENTATION_COMPLETE
MERCHANT_AUTH_ONBOARDING_AUTHORITY_VERIFIED
REDIRECT_LOOP_PREVENTED
MISSING_RPCS_ELIMINATED
ROLE_SYNCHRONIZATION_ENFORCED
DUPLICATE_REGISTRATION_PREVENTED
ALL_UNIT_TESTS_PASS
READY_FOR_DRAFT_PR_REVIEW
```

---

## Active Implementation Phase

### Phase 3M: Merchant Auth & Onboarding Flow Authority
- **Task:** `DILMART-PHASE-3M-MERCHANT-AUTH-ONBOARDING-AUTHORITY-001`
- **Branch:** `frontend/dilmart-merchant-auth-onboarding-authority`
- **Reference Doc:** [`DILMART_PHASE_3M_MERCHANT_AUTH_ONBOARDING_FLOW_AUTHORITY.md`](file:///d:/DilMart/governance/phases/DILMART_PHASE_3M_MERCHANT_AUTH_ONBOARDING_FLOW_AUTHORITY.md)
- **Target Environments:**
  - `DilMart Main staging Supabase`: `zlmdwhuphuxppxznsgso`
  - `DilMart Main production`: `yssjhxeybitiycdviyrc`
  - `DilMart-Store live/target`: `ztplxqlthuqkuktbznbo`
- **Target Merchant (Preserved Invariant):** `46371607-ba4c-4fd2-bab4-8a6bd9371477` (`DilMart Store`) owned by `roichain7@gmail.com` (`2a72d375-9bab-44d5-83ca-a35a274171c2`).
- **Scope Delivered:**
  - `MerchantsService.updateMerchantStatus`: Promotes owner profile from `merchant_applicant` to `merchant_owner` upon status update to `active`.
  - `MerchantApplicationsService`: Replaced calls to non-existent `approve_merchant_atomic` and `reject_merchant_atomic` RPCs with safe direct queries; added duplicate email and slug conflict validation (`SLUG_EXISTS`, `EXISTING_MERCHANT`, `EXISTING_APPLICATION`, `ACCOUNT_EXISTS`).
  - `AuthService.getContext`: Defensive self-healing elevating lingering `merchant_applicant` to `merchant_owner` when candidate store is `active`.
  - `RequireMerchantUser`: Granted access to active merchants directly, eliminating the `/merchant/pending` infinite bounce loop.
  - `MerchantLogin`, `MerchantPending`, `MerchantRegister`: Improved distinct status routing and UI handling for `pending_review`, `active`, `suspended`, and `rejected`.
- **Database Status:** 0 migrations created or applied, 0 live mutations.
- **Verification:**
  - `backend/tests/merchant-auth-onboarding-authority.test.mjs` (7 tests, all pass)
  - `backend/tests/admin-merchant-registration-data.test.mjs` (14 tests, all pass)
  - `src/components/guards/RequireMerchantUser.authority.test.tsx` (5 tests, all pass)
  - `src/pages/merchant/Pending.authority.test.tsx` (4 tests, all pass)
  - Frontend production build: SUCCESS (0 errors).

---

## Preceding Governance / Merged Phases

### Phase 3L: Customer Storefront Purchase Journey Smoke Test
- **Task:** `DILMART-PHASE-3L-STOREFRONT-PURCHASE-JOURNEY-SMOKE-TEST-001`
- **Reference Doc:** [`DILMART_PHASE_3L_STOREFRONT_PURCHASE_JOURNEY_SMOKE_TEST.md`](file:///d:/DilMart/governance/phases/DILMART_PHASE_3L_STOREFRONT_PURCHASE_JOURNEY_SMOKE_TEST.md)
- **Target Environment:** `DilMart-Store` (`ztplxqlthuqkuktbznbo`)
- **Target Merchant:** `46371607-ba4c-4fd2-bab4-8a6bd9371477` (`DilMart Store`)
- **Test Order:** `DUK-260904-0144` (`id: b205c5fc-b07c-4479-b5d1-fbeedcdeba98`)
- **Product Tested:** أداة جيب متعددة الوظائف قابلة للطي (11 في 1) (`SKU: DIL-LIFE-006`, Quantity: 2, Total: 35,000 IQD)
- **Scope Verified:**
  - Category discovery and image rendering across all 7 main categories.
  - Catalog listing, product detail page, and stock availability.
  - Dynamic cart quantity adjustment and price recalculation.
  - Checkout form submission via Cash on Delivery with governorate delivery fee calculation.
  - Automatic inventory decrement (50 -> 48).
  - Merchant notification generation (`[new_order]` for merchant `46371607-ba4c-4fd2-bab4-8a6bd9371477`).
  - Scoped visibility in Merchant Portal (`/merchant/orders`) and Admin Portal (`/admin/orders`).
- **Patch Required:** None (`NO_PATCH_REQUIRED`).
- **Database Status:** 0 migrations, order persisted for audit.


### Phase 3J: Merchant Product Create/Edit Form Multi-Store Mutation Authority
- **Task:** `DILMART-PHASE-3J-MERCHANT-PRODUCT-FORM-MULTI-STORE-AUTHORITY-001`
- **PR:** [#30](https://github.com/dilmart-info/Dilmart/pull/30) (Merged & Closed)
- **Source HEAD:** `520af33385567a8a388163732730e195528312f2`
- **Merge SHA:** `0a55b36aad10477d116cf5cb1e3ddde0c4894b39`
- **Post-Merge Governance Branch:** `governance/pr30-post-merge-phase3j-closure`
- **Post-Merge Verification Evidence:**
  - Critical CI (`DilMart Store Launch Critical PR Quality & Security CI`): run `33873413565` — SUCCESS (5m 37s)
  - Native CI (`Native Foundation CI`): run `33873413586` — SUCCESS (Android 4m 18s, iOS 4m 54s)
  - Netlify Production Deploy Gate run: `33873899428` — SUCCESS
  - Netlify publish: SKIPPED (`NETLIFY_PUBLISH_SKIPPED` — `NETLIFY_PRODUCTION_DEPLOY_ENABLED` not enabled, `should_deploy=false`)
  - Render deployment state: UNVERIFIED (`RENDER_DEPLOYMENT_STATE_UNVERIFIED` — no provider telemetry proving deployed commit)
  - Database status: 0 migrations applied, 0 live mutations.
- **Scope Delivered:**
  - Explicit backend route validation with `ParseUUIDPipe({ version: "4" })` on all product ID parameters.
  - Multi-store fail-closed authority in `products.service.ts`: `getProductById` requires explicit `merchant_id` for merchant roles, validates store membership and active status, scopes product lookup to `merchant_id`, and returns HTTP 403 Forbidden on mismatch.
  - Role separation: `createProduct`, `updateProduct`, and `updateProductStatus` strictly reject `merchant_staff` with HTTP 403 Forbidden.
  - Cross-store IDOR rejection: `updateProduct` verifies that the target product belongs to the caller's store before applying modifications, returning HTTP 403 Forbidden on cross-store attempts.
  - Canonical response contract: `updateProduct` and `updateProductStatus` return canonical `{ ok: true, merchant_id, product_id }` for merchant actors while preserving backward-compatible `{ ok: true }` for admin callers.
  - Frontend Keyed Workspace `<MerchantProductForm key={`${merchantId}-${id || "new"}`} />` guaranteeing instantaneous remount and state wipe when switching stores.
  - Frontend fail-closed verification in `AdminProductForm`: asserts returned `merchant_id` matches active merchant, and in edit mode asserts returned `product_id` matches current product ID. Rejects with error toast and aborts navigation/invalidation on mismatch.
  - Catalog management permissions: disabled inputs, selects, switches, and uploaders via `<fieldset disabled={!canManageCatalog}>` for `merchant_staff`.
- **Verification Suites:**
  - `backend/tests/merchant-product-form-multi-store-authority.test.mjs` (20 tests, all pass)
  - `src/pages/merchant/ProductForm.test.tsx` (8 tests, all pass)
  - `npm --prefix backend test` (292 tests, all pass)
  - CI guards: 3 files, 99 tests passed, 0 violations.
- **Database Status:** 0 migrations applied, 0 live mutations.


---

## Preceding Governance / Merged Phases

### Phase 3I: Merchant Orders List & Operational Multi-Store Authority
- **Task:** `DILMART-PHASE-3I-MERCHANT-ORDERS-MULTI-STORE-AUTHORITY-001`
- **PR:** [#28](https://github.com/dilmart-info/Dilmart/pull/28) (Merged & Closed)
- **Source HEAD:** `9d561b04eb1f32b8b1cd187b18090fa27fc922cb`
- **Merge SHA:** `df7789eb899c23f636ddbcfd94edf53b11aa8e60`
- **Post-Merge Governance Branch:** `governance/pr28-post-merge-phase3i-closure`
- **Post-Merge Verification Evidence:**
  - Critical CI (`DilMart Store Launch Critical PR Quality & Security CI`): run `33864534387` — SUCCESS (14m 4s)
  - Native CI (`Native Foundation CI`): run `33864534384` — SUCCESS (10m 4s; Android 4m 19s, iOS 10m 0s)
  - Netlify Production Deploy Gate runs: `33865323259` and `33865631431` — SUCCESS (7s-12s)
  - Netlify publish: SKIPPED (`NETLIFY_PUBLISH_SKIPPED` — `NETLIFY_PRODUCTION_DEPLOY_ENABLED` not enabled, `should_deploy=false`)
  - Render deployment state: UNVERIFIED (`RENDER_DEPLOYMENT_STATE_UNVERIFIED` — no provider telemetry proving deployed commit)
  - Database status: 0 migrations applied, 0 live mutations.
- **Scope Delivered:**
  - Explicit backend endpoint (`GET /merchants/:id/orders`) with `ParseUUIDPipe({ version: "4" })` and whitelisted query validation (`ListMerchantOrdersQueryDto`).
  - Canonical envelope contract strictly returning `{ merchant_id, orders, total, limit, offset }`.
  - Multi-store fail-closed authority: exact merchant membership check for caller (`merchant_owner`, `merchant_manager`, `merchant_staff`); cross-store IDOR or customer role rejected with HTTP 403 Forbidden.
  - Legacy route lockdown: `OrdersService.listOrdersForMerchant` requires explicit `merchant_id`; silent fallback to first store completely eliminated.
  - Customer PII safe projection: customer phone number, full street address, and `merchant_notes` completely excluded from merchant orders list projection.
  - Frontend Keyed Workspace `<MerchantOrdersWorkspace key={merchantId} merchantId={merchantId} />` with instantaneous filter/pagination reset and zero cross-store data leakage.
  - Strict fail-closed parser `parseCanonicalOrdersResponse`: validates store ID, non-negative totals and amounts, and actively throws security violations if any customer phone, street address, or `merchant_notes` are leaked.
  - Truthful UI states: dedicated `MerchantOrdersSkeleton`, retryable error banner, and empty state.
- **Verification Suites:**
  - `backend/tests/merchant-orders-multi-store-authority.test.mjs` (17 tests, all pass)
  - `src/pages/merchant/Orders.test.tsx` (17 tests, all pass)
  - CI guards: 3 files, 99 tests passed, 0 violations.
- **Database Status:** 0 migrations applied, 0 live mutations.

### Phase 3H: Merchant Dashboard Overview & Analytics Multi-Store Authority
- **Task:** `DILMART-PHASE-3H-MERCHANT-DASHBOARD-OVERVIEW-MULTI-STORE-AUTHORITY-001`
- **PR:** [#26](https://github.com/dilmart-info/Dilmart/pull/26) (Merged & Closed)
- **Source HEAD:** `83a02b907e2712c1c544cd965e448ce7a85823bd`
- **Merge SHA:** `5cf80a80d9d20aa50e78f5f1a5ee057792e0bfbb`
- **Post-Merge Governance Branch:** `governance/pr26-post-merge-phase3h-closure`
- **Post-Merge Verification Evidence:**
  - Critical CI (`DilMart Store Launch Critical PR Quality & Security CI`): run `33851843099` — SUCCESS (14m 17s)
  - Native CI (`Native Foundation CI`): run `33851843164` — SUCCESS (8m 52s)
  - Netlify Production Deploy Gate run: `33853000693` — SUCCESS (8s)
  - Netlify publish: SKIPPED (`NETLIFY_PUBLISH_SKIPPED` — `NETLIFY_PRODUCTION_DEPLOY_ENABLED` not enabled, `should_deploy=false`)
  - Render deployment state: UNVERIFIED (`RENDER_DEPLOYMENT_STATE_UNVERIFIED` — no provider telemetry proving deployed commit)
  - Database status: 0 migrations applied, 0 live mutations.
- **Scope Delivered:**
  - Explicit merchant dashboard endpoint (`GET /merchants/:id/dashboard`) with `ParseUUIDPipe({ version: "4" })` and role-based access control (`super_admin`, `admin`, `merchant_owner`, `merchant_manager`, `merchant_staff`).
  - Hardened related merchant endpoints (`:id/dashboard-stats`, `:id/readiness`, `:id/performance-scorecard`) with `ParseUUIDPipe({ version: "4" })`.
  - Legacy route lockdown: `GET /merchant/dashboard` restricted strictly to platform admins (`super_admin`, `admin`); merchant roles rejected with HTTP 403 Forbidden. The legacy route strictly requires `?merchant_id=` (UUID v4) via `ValidationPipe` and eliminates silent first-store fallback.
  - Canonical response contract: `merchant_id` always injected into response and asserted on frontend to strictly match active store.
  - Fail-closed canonical parser (`parseCanonicalDashboardResponse`): validates `merchant_id`, integer counts, non-negative numbers, ISO timestamps, and strictly rejects negative or NaN `top_products[].revenue` while allowing optional omitted revenue.
  - Frontend runtime crash fix: replaced missing `apiClient.getMerchantDashboard` with official `merchantApi.getMerchantDashboard(merchantId)`.
  - Frontend Keyed Workspace `<MerchantOverviewWorkspace key={merchantId} merchantId={merchantId} />` providing synchronous reset on store switch and eliminating deferred cross-store race conditions.
  - Truthful UI states: dedicated `MerchantOverviewSkeleton` loading state and retryable error banner without displaying misleading zero metrics.
- **Verification Suites:**
  - `backend/tests/merchant-dashboard-multi-store-authority.test.mjs` (13 tests, all pass)
  - `src/pages/merchant/Overview.test.tsx` (14 tests, all pass)
- **Database Status:** 0 migrations applied, 0 live mutations.

### Phase 3G: Merchant Settings Multi-Store Mutation Authority & Push Device Isolation
- **Task:** `DILMART-PHASE-3G-MERCHANT-SETTINGS-MULTI-STORE-MUTATION-AUTHORITY-001`
- **PR:** [#24](https://github.com/dilmart-info/Dilmart/pull/24) (Merged & Closed)
- **Source HEAD:** `f8524b071e856a5b710a5fa03829e11d1d5b2c3f`
- **Merge SHA:** `3bad5f94295c75e1837071f0935c49b83e50385e`
- **Post-Merge Governance Branch:** `governance/pr24-post-merge-phase3g-closure`
- **Post-Merge Verification Evidence:**
  - Critical CI (`DilMart Store Launch Critical PR Quality & Security CI`): run `33810907067` — SUCCESS (6m 13s)
  - Native CI (`Native Foundation CI`): run `33810907084` — SUCCESS (5m 39s)
  - Netlify Production Deploy Gate runs: `33811394027` and `33811444347` — SUCCESS
  - Netlify publish: SKIPPED (`NETLIFY_PUBLISH_SKIPPED` — `NETLIFY_PRODUCTION_DEPLOY_ENABLED` not enabled, `should_deploy=false`)
  - Render deployment state: UNVERIFIED (`RENDER_DEPLOYMENT_STATE_UNVERIFIED` — no provider telemetry proving deployed commit)
  - Database status: 0 migrations applied, 0 live mutations.
- **Scope Delivered:**
  - Explicit settings endpoints (`GET /merchants/:id/settings` and `PATCH /merchants/:id/settings`) with strict UUID and DTO bounds.
  - Canonical settings contract `{ merchant_id, settings_exists, settings }` on read and mutation. When `settings_exists: false`, strictly requires `hasOwnProperty` and explicit literal `null` settings.
  - Legacy settings lockdown: `GET /merchants/settings` and `POST /merchants/settings` restricted to admin/super_admin only; merchant roles rejected with HTTP 403.
  - Explicit push endpoints (`GET`, `POST`, `POST /test`, `DELETE` on `/merchants/:id/push-subscriptions`) with safe projections (no secrets or user_id leaks).
  - Strict ISO-8601 timestamps: `created_at` and `updated_at` must adhere to ISO-8601 format; general parsable non-ISO strings are rejected.
  - Typed push error assertion: when `error` property is present in test push response, strictly asserts non-null, non-undefined string type.
  - Staff device authority: Staff can only register, view, test, and delete their own device; foreign device access returns non-disclosing 404.
  - Decoupled push registration: device registration never mutates global store settings.
  - Fail-closed canonical parsers: strict validation on settings, push devices, registration, delete, test, and readiness payloads.
  - Unified race guards (`isCurrentOperation`): protects all async await boundaries against cross-store data/toast leakage.
  - Preserved shared product image upload; logo upload UI hidden from Staff in Settings.
  - Frontend Keyed Workspace `<MerchantSettingsWorkspace key={merchantId} ... />` with synchronous reset and dirty form protection.
  - Truthful independent loading/error/empty UI states.
- **Verification Suites:**
  - `backend/tests/merchant-settings-multi-store-authority.test.mjs` (33 discrete tests, all pass)
  - `src/pages/merchant/Settings.merchant-switch.test.tsx` (37 tests, all pass)
  - `src/lib/merchant-role-authority.test.ts` (6 tests, all pass)
  - Full frontend suite: 102 files, 1023 tests passed.
  - Full backend suite: 292 tests passed.
  - CI guards: 3 files, 99 tests passed, 0 violations.
- **Database Status:** 0 migrations applied, 0 live mutations.

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
