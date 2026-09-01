# CURRENT PHASE

## Task

`DILMART-CANONICAL-REPOSITORY-GOVERNANCE-SYNC-001`

## Branch

`governance/canonical-repository-authority-sync` (Merged & Deleted)

## PR

PR `#14` — https://github.com/dilmart-info/Dilmart/pull/14 (Merged & Closed)

## Status

```text
PHASE_3B_MERGED
PR_13_CLOSED
CANONICAL_REPOSITORY_GOVERNANCE_SYNC_MERGED
PR_14_CLOSED
PR_14_SOURCE_HEAD_EBDCADD
PR_14_MERGE_SHA_9A37E19
MAIN_CI_PASS
NETLIFY_GATE_PASS
NETLIFY_PUBLISH_SKIPPED
NO_RUNTIME_CHANGE
NO_DB_MIGRATION
READY_FOR_NEXT_DEVELOPMENT_PHASE
```

## Completed Scope

- Synchronize active repository and deployment governance documents to canonical `dilmart-info/Dilmart`.
- Add fail-closed static governance guard in CI test suite for active authority files.
- Align `docs/CANONICAL_WORKSPACE.md` with real operator-agnostic and `scripts/build-production.ps1` rules.
- Maintain strict preservation of historical evidence, audit records, and PR artifacts.
- No runtime changes, no DB migrations, no deployment.

## Immediately Completed Development Phase

### Phase 3B: Merchant Order Detail, Decision Queue, and New Order Operations
- **PR:** [#13](https://github.com/dilmart-info/Dilmart/pull/13)
- **Merge SHA:** `57c8f6b21f95a11403d3928918bbc6c0c78b2e2c`
- **Merge Status:** Merged & Closed
- **Summary:** Backend canonical 404 contract, decision eligibility gating, multi-store event isolation with generation/cancellation-safe refetch race guards, and Jenni delivery integration / sticker authority alignment.

## Next State

- The next development phase has not yet been selected in this document.
- OTP work has not resumed.
- Product Readiness migrations remain unapplied unless separately proven.
- No deployment was performed by this governance closure.

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
