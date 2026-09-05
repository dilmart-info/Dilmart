# DILMART — PHASE 3M: MERCHANT AUTH & ONBOARDING FLOW AUTHORITY

## Metadata

- **Phase:** Phase 3M
- **Task ID:** `DILMART-PHASE-3M-MERCHANT-AUTH-ONBOARDING-AUTHORITY-001`
- **Branch:** `frontend/dilmart-merchant-auth-onboarding-authority`
- **Related Issues / Work:** Merchant Auth & Onboarding Flow Authority
- **Target Environments:**
  - `DilMart Main staging Supabase`: `zlmdwhuphuxppxznsgso`
  - `DilMart Main production`: `yssjhxeybitiycdviyrc`
  - `DilMart-Store live/target`: `ztplxqlthuqkuktbznbo`
- **Authoritative Invariant:** Sole live active merchant is `DilMart Store` (`46371607-ba4c-4fd2-bab4-8a6bd9371477`) owned by `roichain7@gmail.com` (`2a72d375-9bab-44d5-83ca-a35a274171c2`).

---

## Executive Summary

Phase 3M delivers complete structural, logical, and authority hardening for merchant registration, onboarding, authentication, and status lifecycle transitions.

Prior to Phase 3M, four core vulnerabilities existed:
1. **Activation Redirect Loop & Role Desynchronization**: When an admin updated a merchant to `active`, the store status changed in `merchants`, but the owner's `profiles.role` remained `merchant_applicant`. This caused an infinite bounce between `/merchant/pending` (which saw `status === 'active'` and pushed to `/merchant`) and `RequireMerchantUser` (which saw `isMerchantApplicant: true` and pushed back to `/merchant/pending`).
2. **Missing Atomic RPCs**: `MerchantApplicationsService.approveMerchant` and `rejectMerchant` called PostgreSQL routines `approve_merchant_atomic` and `reject_merchant_atomic`, neither of which existed in the database, resulting in HTTP 500 runtime errors on administrative review.
3. **Duplicate Account & Unclear Registration Conflicts**: Registering with an existing email or slug threw unhandled or ambiguous conflict exceptions without actionable guidance.
4. **Suspended Merchant Conflation**: Suspended stores were redirected to the pending review screen, misleading merchants into believing their store was awaiting review rather than suspended by platform administration.

---

## Scope Delivered

### 1. Backend Role Synchronization & Lifecycle Authority
- **`MerchantsService.updateMerchantStatus`**:
  - When transitioning status to `"active"`, queries `merchant_users` for the owner(s) and automatically promotes their profile role from `merchant_applicant` (or `customer`) to `merchant_owner`.
  - Preserves existing commercial agreement and readiness gates.
- **`MerchantApplicationsService.approveMerchant` & `rejectMerchant`**:
  - Removed dependencies on non-existent `approve_merchant_atomic` and `reject_merchant_atomic` RPCs.
  - Implemented direct, transactionally safe administrative approval and rejection logic using `supabaseAdmin.client`.
  - On approval, sets `approved_at`, `approved_by`, clears `rejection_reason`, and upgrades owner profiles to `merchant_owner`.
  - On rejection, sets `rejected_at`, `rejected_by`, records `rejection_reason`, and updates status to `rejected`.
- **`MerchantApplicationsService.registerApplication`**:
  - Validates `slug` uniqueness and throws `ConflictException` with code `SLUG_EXISTS` and clear Arabic error copy.
  - Checks if the email is already registered in `profiles` or `merchant_users`:
    - If associated with an active store: returns `ConflictException` (`EXISTING_MERCHANT`).
    - If associated with a pending store: returns `ConflictException` (`EXISTING_APPLICATION`).
    - If associated with a general platform account: returns `ConflictException` (`ACCOUNT_EXISTS`).
  - Catches `createUserError` cleanly for existing auth users and returns structured conflict exceptions.
- **`MerchantApplicationsService.getMyApplicationStatus`**:
  - Prioritizes active store memberships over pending or rejected ones so that existing active merchants are never obscured.
- **`AuthService.getContext` Defensive Authority**:
  - If a user's candidate merchant is `status === 'active'` and role is `owner`, but their profile role lingered as `merchant_applicant`, `/auth/context` elevates `activeRole` to `merchant_owner` in-memory to prevent redirect loops.
  - Strictly read-only: zero database mutation side effects on `profiles` or any table from within `/auth/context`.
  - Profile role promotion to `merchant_owner` in the database is strictly confined to administrative decision routes (`updateMerchantStatus` to active, and `approveMerchant`).

### 2. Frontend Route Guard & Workspace Protection
- **`RequireMerchantUser` (`BackofficeRouteGuards.tsx`)**:
  - Directly grants access to `/merchant` when the user has an active store membership (`merchantStatus === 'active'` or any membership is `active`), breaking the infinite bounce loop.
  - Detects suspended stores and routes cleanly to `/merchant/pending?status=suspended`.
  - Routes unauthenticated users to `/merchant/login` and non-merchants to `/merchant/register`.
- **`MerchantLogin` (`Login.tsx`)**:
  - Prioritizes active merchant access directly to `/merchant`.
  - Distinctly handles `suspended`, `rejected`, and `pending_review` states with clear notifications.
- **`MerchantPending` (`Pending.tsx`)**:
  - Uses `useEffect` for navigation to prevent React render-time state update warnings.
  - Added dedicated, professional Arabic UI for suspended store accounts with contact and sign-out actions.
- **`MerchantRegister` (`Register.tsx`)**:
  - Handles `EXISTING_MERCHANT`, `EXISTING_APPLICATION`, and `ACCOUNT_EXISTS` codes and guides users to login.

---

## Verification Evidence

### 1. Backend Test Suite
- Test script: `npm --prefix backend run test:merchant-auth-authority`
- Test file: `backend/tests/merchant-auth-onboarding-authority.test.mjs`
- Results: **8 passed out of 8 tests (100% pass)**:
  1. `registerApplication - rejects duplicate slug with SLUG_EXISTS conflict code` (PASS)
  2. `registerApplication - rejects existing email with active store with EXISTING_MERCHANT code` (PASS)
  3. `registerApplication - rejects existing email with pending application with EXISTING_APPLICATION code` (PASS)
  4. `approveMerchant - updates status to active and promotes owner profile to merchant_owner` (PASS)
  5. `rejectMerchant - updates status to rejected with reason without calling RPC` (PASS)
  6. `getMyApplicationStatus - prioritizes active merchant membership over pending or rejected` (PASS)
  7. `updateMerchantStatus - promotes owner profile from merchant_applicant to merchant_owner upon activation` (PASS)
  8. `AuthService.getContext - strictly read-only: elevates activeRole to merchant_owner without updating profiles in DB` (PASS)

### 2. Frontend Test Suite
- Test files:
  - `src/components/guards/RequireMerchantUser.authority.test.tsx` (5 passed out of 5 tests)
  - `src/pages/merchant/Pending.authority.test.tsx` (4 passed out of 4 tests)
- Total new frontend tests: **9 passed out of 9 tests (100% pass)**

### 3. Regression Test Suites
- `npm --prefix backend run test:merchant-registration-data`: 14 passed out of 14 tests.
- `npm --prefix backend run build`: Clean compilation, 0 TypeScript errors.
- `npm run build`: Production bundle builds successfully.

---

## Post-Merge Closure & Verification Evidence

- **Pull Request:** [#33](https://github.com/dilmart-info/Dilmart/pull/33) (Merged & Closed via Squash Merge)
- **Source HEAD:** `900c4d4a7e74dc4489ca61b3ad07d3b68fc09bed`
- **Merge SHA:** `182403715c61c5e20a7601e7156f24b6ba2faf9a`
- **Post-Merge Governance Branch:** `governance/pr33-post-merge-phase3m-closure`
- **Post-Merge Verification Evidence:**
  - Critical CI (`DilMart Store Launch Critical PR Quality & Security CI`): run `33955405956` — SUCCESS (5m 37s)
  - Native CI (`Native Foundation CI`): run `33955406045` — SUCCESS (4m 42s)
  - Netlify Production Deploy Gate runs: `33955670917` and `33955627344` — SUCCESS (10s)
  - Netlify publish: SKIPPED (`NETLIFY_PUBLISH_SKIPPED` — `NETLIFY_PRODUCTION_DEPLOY_ENABLED` not enabled, `should_deploy=false`)
  - Render deployment state: UNVERIFIED (`RENDER_DEPLOYMENT_STATE_UNVERIFIED` — no provider telemetry proving deployed commit)
  - Database status: 0 migrations applied, 0 live mutations (`NO_DB_MIGRATION`, `NO_LIVE_DB_MUTATION`).

---

## Non-Negotiable Operational Gates

```text
Repository: dilmart-info/Dilmart
Git branch: governance/pr33-post-merge-phase3m-closure
Merge commit: 182403715c61c5e20a7601e7156f24b6ba2faf9a
Render service: UNVERIFIED (no deployment performed)
Backend hostname: UNVERIFIED (no deployment performed)
Supabase project ref: ztplxqlthuqkuktbznbo
Environment role: live/target (no live mutation performed)

PHASE_3M_MERGED
PR_33_CLOSED
PR_33_SOURCE_HEAD_900C4D4
PR_33_MERGE_SHA_1824037
MAIN_CI_PASS
NATIVE_CI_PASS
NETLIFY_GATE_PASS
NETLIFY_PUBLISH_SKIPPED
RENDER_DEPLOYMENT_STATE_UNVERIFIED
NO_DB_MIGRATION
NO_LIVE_DB_MUTATION
READY_FOR_NEXT_DEVELOPMENT_PHASE
```

- **Runtime Code Changes:** None (governance documentation only).
- **Database Migrations:** 0 migrations created or applied (`NO_DB_MIGRATION`).
- **Live Database Mutations:** 0 rows modified or deleted (`NO_LIVE_DB_MUTATION`).
- **Deployment State:** No deployment (`NETLIFY_PUBLISH_SKIPPED`, `RENDER_DEPLOYMENT_STATE_UNVERIFIED`).
