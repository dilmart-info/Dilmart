# DILMART PHASE 3F: Merchant Customers Privacy & Multi-Store Authority

## 1. Executive Summary

- **Task Identifier:** `DILMART-PHASE-3F-MERCHANT-CUSTOMERS-PRIVACY-MULTI-STORE-AUTHORITY-001`
- **Feature Branch:** `frontend/dilmart-merchant-customers-authority` (deleted post-merge)
- **Base Commit:** `1335c534230e97922da945062f778a98b1c7ed07` (Phase 3E post-merge closure)
- **Pull Request:** [PR #22](https://github.com/dilmart-info/Dilmart/pull/22) (Merged & Closed)
- **Approved Source HEAD:** `d90594389d7d94658b9ca6ed0fb21c0871a7b3e3`
- **Merge SHA:** `a8ba5e052658b7bcce04c75e4fdf9314f25cdb4f`
- **Status:** `PHASE_3F_MERGED`
- **State Flags:**
```text
PHASE_3F_MERGED
PR_22_CLOSED
PR_22_SOURCE_HEAD_D905943
PR_22_MERGE_SHA_A8BA5E0
MAIN_CI_PASS
NATIVE_CI_PASS
NETLIFY_GATE_PASS
NETLIFY_PUBLISH_SKIPPED
RENDER_DEPLOYMENT_STATE_UNVERIFIED
NO_DB_MIGRATION
NO_LIVE_DB_MUTATION
READY_FOR_NEXT_DEVELOPMENT_PHASE
```

---

## 2. Scope of Implementation

### A. Endpoint Separation & Route Authority
- **Dedicated Merchant Endpoint:** `GET /merchants/:id/customers`
  - Protected with `ParseUUIDPipe` and route-level `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`.
  - Roles allowed: `super_admin`, `admin`, `merchant_owner`, `merchant_manager`, `merchant_staff`.
- **Admin Endpoint Lockdown:** `GET /admin/customers`
  - Restricted strictly to `@Roles("super_admin", "admin")`.
  - Merchant roles (`merchant_owner`, `merchant_manager`, `merchant_staff`) are strictly rejected with HTTP 403 Forbidden.

### B. Multi-Store Authority & Membership Validation
- Strict exact-membership check in `merchant_users` for the requested `merchantId` (`user_id = actor.actor_id` AND `merchant_id = merchantId`).
- Zero first-store fallback: omitting `merchant_id` or passing non-matching IDs fails closed with HTTP 403 Forbidden.
- Rejection of invalid actor contexts: requires both valid `actor_id` and `actor_role`.
- Active merchant validation: verifies target merchant `status === 'active'`. Suspended or inactive merchants return HTTP 403 Forbidden.
- Role authority: supports case-insensitive aliases (`owner`/`merchant_owner`, `manager`/`merchant_manager`, `staff`/`merchant_staff`).

### C. Structural RPC Validation & Privacy Contract
- RPC call to existing stored function `merchant_customer_summary(p_merchant_id, p_search, p_limit, p_offset)` without creating new database migrations.
- Structural validation of payload:
  - Verifies `data` is a non-null, non-array object.
  - Verifies `items` is an array.
  - Verifies `total`, `limit`, `offset` are non-negative integers.
  - Verifies `has_more` is a boolean.
  - Validates every item with strict regex and privacy contracts:
    - `phone_masked` must strictly match `/^\*{4}\d{4}$/` (exactly 4 asterisks followed by 4 digits).
    - `customer_ref` must strictly match `/^عميل #[A-F0-9]{4}$/` (Arabic prefix `عميل #` followed by 4 hex characters).
    - Any raw PII (full telephone numbers, personal names, emails) placed inside masked fields triggers HTTP 503 `ServiceUnavailableException`.
    - Extraneous fields (e.g. `full_name`, `email`, `phone`) are dropped from the response; only the 5 allowlisted fields (`customer_ref`, `phone_masked`, `orders`, `spent`, `last_order_at`) are returned.
    - Non-negative integer `orders`, finite non-negative number `spent`, valid date string `last_order_at`.
  - Malformed payloads throw HTTP 503 `ServiceUnavailableException` and never silently degrade into an empty list.
- Unified pagination and limit cap:
  - `ListMerchantCustomersQueryDto` enforces `@Max(100)` with `@Min(1)`.
  - Service layer defaults `limit` to 50 and clamps to a maximum of 100.
  - HTTP boundary returns HTTP 400 when `limit > 100` and halts execution before invoking RPC.
- Single camelCase pagination contract at HTTP layer:
  - `{ merchant_id, items, page, limit, total, hasMore }`.
  - `has_more` from RPC is converted explicitly to `hasMore`.
- Privacy guarantee: raw customer PII (full name, email, raw phone) is never exposed in output.

### D. Frontend Workspace & Truthful States
- **Keyed Workspace Pattern:** `src/pages/merchant/Customers.tsx` renders `<MerchantCustomersWorkspace key={merchantId} merchantId={merchantId} />`. Switching active stores causes clean unmounting of the previous store's state, preventing stale search queries or pagination states from persisting.
- **Client Contract Parser:** `parseMerchantCustomersResponse` validates the raw HTTP response before caching in React Query:
  - `raw` is a non-null object and not an array.
  - `merchant_id` is a non-empty string matching the expected `merchantId`.
  - `items` is an array.
  - `page` is an integer >= 1.
  - `limit` is an integer >= 1.
  - `total` is an integer >= 0.
  - `hasMore` is a boolean.
  - Every customer item contains:
    - `phone_masked` matching `/^\*{4}\d{4}$/`.
    - `customer_ref` matching `/^عميل #[A-F0-9]{4}$/`.
    - Non-negative integer `orders`, finite non-negative number `spent`, valid date string `last_order_at`.
  - Extraneous fields (`full_name`, `email`, `phone`) if present are dropped from the canonical object and never rendered in the UI.
  - Returns canonical typed `CanonicalMerchantCustomersResponse`; throws descriptive Error on violation, failing closed into truthful error state.
- **Removed Dead Refs:** Removed unused `liveMerchantIdRef` completely from `Customers.tsx` and `CustomersPage.tsx`.
- **Separated Data Adapters:**
  - Merchant path strictly enforces the canonical typed contract without fallback operators (`?? 1`, `?? 0`, etc.) masking malformed data.
  - Admin path maintains backward-compatible support for legacy array and paginated objects.
- **Role Authority & Navigation:**
  - `canMerchantViewCustomers` added to `src/lib/merchant-role-authority.ts`.
  - Navigation item `/merchant/customers` in `src/components/MerchantLayout.tsx` is filtered out if unauthorized.
  - Unauthorized visits render a dedicated unauthorized banner (`merchant-customers-unauthorized`).
- **Truthful UI States:**
  - Dedicated loading skeleton (`merchant-customers-loading`).
  - Unattached merchant banner (`merchant-customers-unattached`).
  - Error state with retry button.
  - Honest empty state ("لا توجد بيانات عملاء.") with pagination controls omitted.

---

## 3. Verification & Quality Gates

- **Backend Unit & HTTP Suite:**
  - `backend/tests/merchant-customers-multi-store-authority.test.mjs`: 8 passed / 0 failed (including DTO `@MaxLength(100)` and `@Max(100)` enforcement, raw PII rejection, extraneous key dropping, and real Nest HTTP server with `app.listen(0)` and `fetch`).
  - Full backend test suite: 292 passed / 0 failed.
- **Frontend Unit & Integration Suite:**
  - `src/lib/merchant-role-authority.test.ts`: 5 passed / 0 failed.
  - `src/pages/merchant/Customers.test.tsx`: 39 passed / 0 failed (including late rejection safety across store switch, pagination reset, network error retry, raw PII rejection, extraneous key dropping, and 28 contract failure matrix tests).
  - Full frontend test suite: 102 test files passed, 989 passed / 0 failed.
- **Architecture & Security Guards:**
  - `npm run arch:guard`: PASSED (0 new direct Supabase violations).
  - `npm run auth:guard`: PASSED (Session lifecycle owned by `src/lib/auth` only).
  - `npm run test:ci-guards`: PASSED (3 files, 99 passed / 0 failed).
- **Static Analysis & Builds:**
  - ESLint on all modified files: 0 errors, 0 warnings.
  - `npm --prefix backend run build`: SUCCESS (`nest build` clean).
  - `npm run build`: SUCCESS (Vite production build clean in ~17.0s).
- **Database & Environment Invariants:**
  - 0 migrations created or applied.
  - 0 live mutations executed.

---

## 4. Post-Merge Verification Evidence

- **Commit Merged to Main:** `a8ba5e052658b7bcce04c75e4fdf9314f25cdb4f`
- **PR #22 State:** MERGED & CLOSED (`mergedAt: 2026-09-03T17:11:52Z`).
- **Feature Branch Deletion:** `origin/frontend/dilmart-merchant-customers-authority` deleted from remote repository.
- **Main Branch Workflows:**
  - **Critical CI (`DilMart Store Launch Critical PR Quality & Security CI`):** run `33783122855` — SUCCESS (5m 20s).
  - **Native CI (`Native Foundation CI`):** run `33783122819` — SUCCESS (4m 46s).
- **Netlify Production Deploy Gate:**
  - Gate Run 1: `33783611208`
  - Gate Run 2 (Post-All-CI): `33783667116`
  - Target SHA: `a8ba5e052658b7bcce04c75e4fdf9314f25cdb4f`
  - Checks: `FRESH=true`, `CI_OK=true`, `ALREADY=false`, `ENABLED=false`, `decision=false`
  - Job Decision: `Build and publish to Netlify` SKIPPED (`NETLIFY_PUBLISH_SKIPPED`).
- **Render Deployment State:** `RENDER_DEPLOYMENT_STATE_UNVERIFIED` (no provider telemetry proving deployed commit).
- **Database Status:** 0 migrations applied, 0 live mutations.
