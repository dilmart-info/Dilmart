# CURRENT PHASE

## Task

`DILMART-CANONICAL-REPOSITORY-GOVERNANCE-SYNC-001`

## Branch

`governance/canonical-repository-authority-sync`

## PR

PR `#14` — https://github.com/dilmart-info/Dilmart/pull/14 (Draft)

## Status

```text
PHASE_3B_MERGED
PR_13_CLOSED
MAIN_SHA_57C8F6B
CANONICAL_REPOSITORY_GOVERNANCE_SYNC_IN_PROGRESS
NO_RUNTIME_CHANGE
NOT_DEPLOYED_BY_THIS_TASK
```

## Active Scope

- Synchronize active repository and deployment governance documents to canonical `dilmart-info/Dilmart`.
- Add fail-closed static governance guard in CI test suite for active authority files.
- Align `docs/CANONICAL_WORKSPACE.md` with real operator-agnostic and `scripts/build-production.ps1` rules.
- Maintain strict preservation of historical evidence, audit records, and PR artifacts.
- No runtime changes, no DB migrations, no deployment.

## Immediately Completed Development Phase

### Phase 3B: Merchant Order Detail, Decision Queue, and New Order Operations
- **PR:** [#13](https://github.com/dilmart-info/Dilmart/pull/13) — `https://github.com/dilmart-info/Dilmart/pull/13`
- **Merge SHA:** `57c8f6b21f95a11403d3928918bbc6c0c78b2e2c`
- **Merge Status:** Merged & Closed
- **Summary:** Backend canonical 404 contract, decision eligibility gating, multi-store event isolation with generation/cancellation-safe refetch race guards, and Jenni delivery integration / sticker authority alignment.

---

## Historical Phase Records

The following items are retained for archival reference only; they do not represent active work.

### Product Readiness Invariant (Historical)
- **Task:** `DilMart-STORE-PRODUCT-READINESS-INVARIANT-001`
- **Phase entry:** `governance/phases/DilMart_STORE_PRODUCT_READINESS_INVARIANT_001.md`
- **Scope:** Server-side product readiness definition, activation invariants, draft creation on Quick Add.

### Other Historical Phases
- Admin Merchant Registration Data — `governance/phases/DilMart_ADMIN_MERCHANT_REGISTRATION_DATA_001.md`
- Unified Email & WhatsApp OTP Authentication (Batch 2B) — halted at staging gate
- Ard Al Khaleej Private Catalog QA — merged as PR #73
- Short-description DB fixture repair — merged as PR #72
- Emergency Web Production Bundle Runtime Fix — `governance/phases/DilMart_STORE_WEB_PRODUCTION_VENDOR_CHUNK_CLOSURE.md`
- Mobile Safe Area & RTL Hero Carousel — `governance/phases/DilMart_STORE_MOBILE_SAFE_AREA_HERO_CAROUSEL_CLOSURE.md`
- Native App Icon & Splash Branding — `governance/phases/DilMart_STORE_NATIVE_APP_ICON_SPLASH_CLOSURE.md`
- Native Auth Storage & Session Lifecycle (Phase 3) — merged as PR #64

### Unified OTP (Batch 2B) Historical Snapshot
The OTP initiative remains **not production-enabled** (staging gate / in-memory idempotency P0).
- Batch 2B halted at staging gate; in-memory idempotency — not multi-instance safe; real OTP smoke blocked.
