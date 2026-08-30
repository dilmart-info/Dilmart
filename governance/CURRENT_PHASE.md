# CURRENT PHASE

## Phase — Product Readiness Invariant (DilMart-STORE-PRODUCT-READINESS-INVARIANT-001)

## Task

`DilMart-STORE-PRODUCT-READINESS-INVARIANT-001`

## Branch

`fix/product-readiness-invariant`

## PR

PR `#116` — https://github.com/cylendralabs-blip/DilMart-Store/pull/116

## Phase entry

`governance/phases/DilMart_STORE_PRODUCT_READINESS_INVARIANT_001.md`

## Status

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

## Scope of this phase

- one authoritative, reusable server-side product readiness definition;
- every activation path (create, update, status, quick add, bulk activate,
  duplicate, CSV import, admin content bulk) enforces it;
- Quick Add creates a draft instead of publishing an incomplete product;
- keep is_active / is_published / visibility_status internally consistent;
- do not make existing archived products public;
- regression tests proving the old Quick Add bypass is closed.

## Out of scope

Products UI redesign, B2B segmentation semantics, applying the new migration,
retro-correcting existing active-but-unready rows, deployment.

## Previous phases

- Admin Merchant Registration Data — `governance/phases/DilMart_ADMIN_MERCHANT_REGISTRATION_DATA_001.md`
- Unified Email & WhatsApp OTP Authentication (Batch 2B) — halted at staging gate;
  see historical notes below and batch closures under `governance/phases/`
- Ard Al Khaleej Private Catalog QA — merged as PR #73
- Short-description DB fixture repair — merged as PR #72 → required before this merge
- Emergency Web Production Bundle Runtime Fix — `governance/phases/DilMart_STORE_WEB_PRODUCTION_VENDOR_CHUNK_CLOSURE.md`
- Mobile Safe Area & RTL Hero Carousel — `governance/phases/DilMart_STORE_MOBILE_SAFE_AREA_HERO_CAROUSEL_CLOSURE.md`
- Native App Icon & Splash Branding — `governance/phases/DilMart_STORE_NATIVE_APP_ICON_SPLASH_CLOSURE.md`
- Native Auth Storage & Session Lifecycle (Phase 3) — merged as PR #64

---

## Historical — Unified OTP (Batch 2B) snapshot retained

The OTP initiative remains **not production-enabled** (staging gate / in-memory
idempotency P0). The following is retained for continuity only; active work is STORE-PR1.

### OTP status at handoff

```text
BATCH 2B HALTED AT STAGING GATE
IN-MEMORY IDEMPOTENCY — NOT MULTI-INSTANCE SAFE
REAL_OTP_SMOKE=BLOCKED
```

### OTP open supervisor items (unchanged)

1. `OTP_PROVIDER` in Render production still unknown.
2. Meta template name/language/type/approval unverified.
3. Batch 2 needs approved `OTP_TEST_PHONE_E164` and explicit send permission.
4. Durable idempotency required before production OTP enablement.
5. Deploy order if OTP resumes: backend first, then frontend.
