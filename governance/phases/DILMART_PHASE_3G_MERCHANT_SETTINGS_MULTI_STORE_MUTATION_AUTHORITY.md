# DILMART PHASE 3G: Merchant Settings Multi-Store Mutation Authority & Push Device Isolation

## 1. Executive Summary

- **Task Identifier:** `DILMART-PHASE-3G-MERCHANT-SETTINGS-MULTI-STORE-MUTATION-AUTHORITY-001`
- **Feature Branch:** `frontend/dilmart-merchant-settings-authority`
- **Base Commit:** `ae81a2a1dc8fd3da21636627493979cb50b1bbdc`
- **Pull Request:** [Draft PR #24](https://github.com/dilmart-info/Dilmart/pull/24)
- **Source HEAD SHA:** `cd7e38b554af5b9dc544177fd783e1b6bb410cbf`
- **Status:** `IMPLEMENTED_AND_VERIFIED_PR_OPEN`
- **Predecessor Phase:** Phase 3F (`PR #22` & `PR #23` merged, `PHASE_3F_OFFICIALLY_SEALED`)
- **State Flags:**
```text
PHASE_3G_IMPLEMENTED
PR_24_DRAFT_OPEN
PR_24_SOURCE_HEAD_CD7E38B
CRITICAL_CI_RUN_33796724844_PASS (5m 37s)
NATIVE_CI_RUN_33796724924_PASS (Android 4m 49s, iOS 4m 39s)
ALL_BACKEND_TESTS_PASS (292/292)
ALL_FRONTEND_TESTS_PASS (993/993)
CI_GUARDS_PASS (99/99)
NO_DB_MIGRATION
NO_LIVE_DB_MUTATION
NO_PROD_DEPLOYMENT
DRAFT_PR_ONLY
```

---

## 2. Architectural Invariants & Scope Delivered

### A. Explicit Settings Routes & Canonical Contract
- **Explicit Routes:**
  - `GET /merchants/:id/settings` — Accessible by `super_admin`, `admin`, `merchant_owner`, `merchant_manager`, `merchant_staff`.
  - `PATCH /merchants/:id/settings` — Mutation authority strictly restricted to `super_admin`, `admin`, `merchant_owner`, `merchant_manager`. Staff is rejected with HTTP 403.
  - Parameter `:id` validated via `ParseUUIDPipe({ version: "4" })`.
  - Payload validated via `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`.
- **Canonical Response Contract:**
  ```ts
  {
    merchant_id: string,
    settings_exists: boolean,
    settings: {
      contact_phone: string | null,
      whatsapp_phone: string | null,
      support_email: string | null,
      city: string | null,
      address: string | null,
      delivery_notes: string | null,
      logo_url: string | null,
      push_enabled: boolean,
      sound_enabled: boolean,
      sound_repeat_interval_seconds: number,
      sound_max_duration_seconds: number
    } | null
  }
  ```
  - `merchant_id` and `settings_exists` are always present.
  - `settings: null` is valid when `settings_exists: false` (non-existent row is a valid state, never treated as an error).
  - Every mutation returns this canonical contract with `settings_exists: true`.

### B. Legacy Route Lockdown
- `GET /merchants/settings` and `POST /merchants/settings`:
  - Restricted strictly to `@Roles("super_admin", "admin")`.
  - Merchant roles (`merchant_owner`, `merchant_manager`, `merchant_staff`) are rejected with HTTP 403 Forbidden.
  - Omission of `merchant_id` or passing non-whitelisted params is rejected by validation pipes.

### C. Explicit Push Subscription Routes & Safe Projections
- **Explicit Routes:**
  - `GET /merchants/:id/push-subscriptions`
  - `POST /merchants/:id/push-subscriptions`
  - `POST /merchants/:id/push-subscriptions/test`
  - `DELETE /merchants/:id/push-subscriptions/:subscriptionId`
  - Validated with `ParseUUIDPipe({ version: "4" })` on `:id` and `:subscriptionId`.
- **Safe Device Projection (No PII / Secret Leaks):**
  - Device listings and registration responses return ONLY:
    `{ id, device_label, user_agent, status, created_at, updated_at, is_own }`.
  - Sensitive WebPush keys (`endpoint`, `p256dh_key`, `auth_key`) and internal `user_id` are never returned in public projections.
- **Legacy Push Lockdown:**
  - `/merchant/push-subscriptions` routes are restricted strictly to platform admins.

### D. Staff Device Authority & Non-Disclosing Security
- **Staff Permissions:**
  - Staff can view, register, test, and delete only their own device/subscription (`user_id = actor.actorId`).
  - Staff listing returns `{ merchant_id, scope: "own", devices: [...] }`.
  - Staff cannot broadcast tests to the whole store.
  - Staff cannot modify store-wide `push_enabled` or `sound_enabled` policies.
- **Non-Disclosing 404:**
  - Accessing, testing, or deleting a device belonging to another store or another user returns a generic `404 Not Found`.
  - Existence of foreign subscriptions is never disclosed via 403.

### E. Product Image Upload & Logo Safety
- `POST /uploads/products/image` remains intact as a shared endpoint for product catalog operations.
- In Merchant Settings UI, the Logo upload control is completely hidden from Staff.
- Clear explanatory copy is presented to Owners/Managers stating that uploading a logo stages the image file, and it is only persisted to the store upon clicking "حفظ الإعدادات".

### F. Frontend Keyed Workspace & Dirty Form Protection
- Rendered via `<MerchantSettingsWorkspace key={merchantId} merchantId={merchantId} role={membership.role} ... />`.
- Switching stores immediately and synchronously clears state and unmounts the previous workspace.
- `isMountedRef`, `liveMerchantIdRef`, and `generationRef` prevent race conditions and out-of-order responses from affecting the active store.
- Explicit dirty tracking (`isDirty`): background refetches do not overwrite unsaved user edits.
- Truthful independent UI states:
  - Settings loading skeleton and retryable error banner.
  - Readiness loading skeleton and retryable error state (never showing a false 0% score).
  - Push devices loading skeleton and empty state (never showing false 0 devices on load/error).

---

## 3. Verification Evidence

| Test Suite | Scope | Result | Details |
|---|---|---|---|
| `backend/tests/merchant-settings-multi-store-authority.test.mjs` | DTO validation, service scope, non-disclosing 404, real NestJS HTTP boundary (`app.listen(0)`) | **PASS** | 33 discrete test cases (0 failures) |
| `src/pages/merchant/Settings.merchant-switch.test.tsx` | Fail-closed contract parsers, 8 discrete deferred races, store switch, dirty form protection, staff isolation | **PASS** | 34 tests passed (0 failures) |
| `src/lib/merchant-role-authority.test.ts` | Role authority matrix for settings and push policy | **PASS** | 6 tests passed (0 failures) |
| Root Vitest Suite (`npm test`) | Full frontend test regression | **PASS** | 102 test files, 1020 tests passed |
| Backend Test Suite (`npm --prefix backend test`) | Full backend test regression | **PASS** | 292 tests passed |
| CI Guards Suite (`npm run test:ci-guards`) | Canonical repository, Netlify workflow, production env guards | **PASS** | 3 test files, 99 tests passed |
| Architecture Guard (`npm run arch:guard`) | Direct Supabase usage boundary | **PASS** | 0 violations |
| Auth Boundary Guard (`npm run auth:guard`) | Auth lifecycle boundary | **PASS** | Passed |
| Native Asset Guard (`npm run native:assets:check`) | Icon and splash resources check | **PASS** | Passed |
| Mobile Boundary Guard (`npm run mobile:boundary`) | Mobile bundle boundaries and forbidden imports | **PASS** | 0 violations |
| Root Build (`npm run build`) | Vite production bundle | **PASS** | Built in ~11s |
| Backend Build (`npm --prefix backend run build`) | NestJS compilation | **PASS** | Code 0 |

---

## 4. Live Operation & Database Guard Status

```text
Repository: dilmart-info/Dilmart
Branch: frontend/dilmart-merchant-settings-authority
Render service: NOT TRIGGERED / UNVERIFIED
Backend hostname: NOT MODIFIED
Supabase project ref: ztplxqlthuqkuktbznbo
Environment role: store current/live
DB migrations executed: 0
Live DB writes executed: 0
Netlify publishing: DISABLED / SKIPPED
```

This phase is submitted as a Draft PR for code review. No live deployments, database migrations, or production mutations are authorized.
