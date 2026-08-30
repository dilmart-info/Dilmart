# DilMart Store — B2B Foundation Implementation Report

**Date:** 2026-06-01  
**Status:** ✅ PASS — Store Foundation Operational  
**Prepared by:** Development Team  
**Reviewed by:** Supervisor

---

## 1. Executive Summary

This report documents the complete implementation of **DilMart Store B2B Foundation** — the first phase of the native B2B Barber App integration.

The goal of this phase was **not** to build the Barber App UI, but to prepare the Store Backend, database, and product management system to support a native dynamic store experience inside DilMart Barber App.

### What this phase accomplishes:

- **Database schema** extended with full product segmentation metadata (M26, M27, M28)
- **Store Backend** enhanced with a dedicated `store-integration` module handling DilMart session exchange
- **Marketplace APIs** updated to support trusted viewer context via `X-Store-Session` header
- **Admin Product Form** updated with B2B segmentation fields (visible only to admins)
- **Security model** established with HMAC-HS256 signed tokens
- **Backward compatibility** 100% preserved — existing public Store behavior is unchanged

### What this phase does NOT do:

- Does not build Barber App native store screens
- Does not implement Cart/Checkout for B2B yet
- Does not integrate Customer App

---

## 2. Branches / PRs / Commits

### Git History on `main`

| Commit    | Description                                                              | Type       |
| --------- | ------------------------------------------------------------------------ | ---------- |
| `0dbf9b7` | feat(store-integration): B2B Barber App integration foundation (M26-M28) | Foundation |
| `5fa04b4` | fix(store-integration): address supervisor blocking notes (7 fixes)      | Fixes      |
| `0a1f6f0` | security: add `iss` claim check in X-Store-Session verification          | Security   |

### Pull Requests

**PR #1 — B2B Integration Foundation**

- Branch: `feat/DilMart-store-b2b-integration-foundation`
- Status: ✅ Merged to `main`
- Supervisor verdict: PASS_WITH_BLOCKING_NOTES → resolved in PR #2

**PR #2 — Supervisor Blocking Fixes**

- Branch: `feat/store-b2b-integration-fixes`
- Status: ✅ Merged to `main`
- Supervisor verdict: PASS — all 7 blocking notes addressed

**Security commit (direct to main)**

- `iss` claim verification added to `verifyStoreSessionHeader()`
- Supervisor security recommendation implemented

---

## 3. Database Migrations

All three migrations applied successfully to Store Supabase DB.

### M26 — Product Segmentation Metadata

**File:** `supabase/migrations/20260601100000_m26_product_segmentation_metadata.sql`

Extends `public.products` with B2B visibility and segmentation fields.

| Column                    | Type               | Default       | Purpose                               |
| ------------------------- | ------------------ | ------------- | ------------------------------------- |
| `target_audience`         | `TEXT[] NOT NULL`  | `{all}`       | Who can see this product              |
| `business_type_tags`      | `TEXT[] NOT NULL`  | `{all}`       | Business types this product targets   |
| `product_use_cases`       | `TEXT[] NOT NULL`  | `{}`          | What the product is used for          |
| `visible_in`              | `TEXT[] NOT NULL`  | `{web_store}` | Which surfaces/apps show this product |
| `purchase_mode`           | `TEXT[] NOT NULL`  | `{retail}`    | How the product can be purchased      |
| `is_b2b_offer`            | `BOOLEAN NOT NULL` | `false`       | B2B-specific offer flag               |
| `requires_verified_salon` | `BOOLEAN NOT NULL` | `false`       | Requires verified salon to view/buy   |
| `min_order_qty`           | `INT NULL`         | NULL          | Minimum order quantity                |
| `max_order_qty`           | `INT NULL`         | NULL          | Maximum order quantity                |

**GIN Indexes created (5):**

- `idx_products_target_audience_gin`
- `idx_products_business_type_tags_gin`
- `idx_products_product_use_cases_gin`
- `idx_products_visible_in_gin`
- `idx_products_purchase_mode_gin`

---

### M27 — Store Linked Profiles

**File:** `supabase/migrations/20260601110000_m27_store_linked_profiles.sql`

Creates `public.store_linked_profiles` — the bridge table between DilMart Main identity and Store identity.

| Column                  | Type            | Purpose                                     |
| ----------------------- | --------------- | ------------------------------------------- |
| `id`                    | `UUID PK`       | Store-side identity                         |
| `DilMart_user_id`       | `UUID NULL`     | DilMart Main auth UID                       |
| `DilMart_role`          | `TEXT NULL`     | Role at exchange time (OWNER/BARBER/STAFF)  |
| `DilMart_barbershop_id` | `UUID NULL`     | Associated barbershop                       |
| `store_customer_id`     | `UUID NULL`     | Link to Store profiles (deferred — see §11) |
| `segment`               | `TEXT NOT NULL` | Computed segment at exchange                |
| `display_name`          | `TEXT NULL`     | Synced from DilMart                         |
| `phone`                 | `TEXT NULL`     | Synced from DilMart                         |
| `city`                  | `TEXT NULL`     | Synced from DilMart                         |
| `business_type`         | `TEXT NULL`     | Synced from DilMart                         |
| `source_app`            | `TEXT NOT NULL` | Origin app                                  |
| `last_synced_at`        | `TIMESTAMPTZ`   | Last session exchange                       |

**RLS: ENABLED** — no public policies. Access via `service_role` only.

**Indexes (5):**

- Unique partial index on `DilMart_user_id` (one profile per DilMart user)
- Index on `DilMart_barbershop_id`
- Index on `segment`
- Index on `source_app`
- Index on `store_customer_id`

---

### M28 — Orders Source Tracking

**File:** `supabase/migrations/20260601120000_m28_orders_source_tracking.sql`

Extends `public.orders` with DilMart context fields for B2B analytics.

| Column                    | Type           | Purpose                       |
| ------------------------- | -------------- | ----------------------------- |
| `source_app`              | `TEXT NULL`    | Which app placed the order    |
| `segment`                 | `TEXT NULL`    | Buyer segment at order time   |
| `business_type`           | `TEXT NULL`    | Buyer's business type         |
| `DilMart_user_id`         | `UUID NULL`    | DilMart identity reference    |
| `DilMart_barbershop_id`   | `UUID NULL`    | Barbershop reference          |
| `store_linked_profile_id` | `UUID NULL FK` | Link to store_linked_profiles |

All fields are **nullable** — existing order flow is completely unaffected.

---

## 4. Product Segmentation Fields — Usage Guide

### Allowed Values

| Field                | Allowed Values                                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target_audience`    | `all`, `customer`, `barber_staff`, `salon_owner`, `professional_buyer`                                                                                                                                           |
| `business_type_tags` | `all`, `men_barbershop`, `women_salon`, `nail_studio`, `beauty_center`, `spa`                                                                                                                                    |
| `product_use_cases`  | `barber_tool`, `salon_equipment`, `consumable`, `furniture`, `personal_tool`, `professional_cosmetic`, `setup_package`, `wholesale`, `nail_tool`, `beauty_equipment`, `hair_care`, `beard_care`, `sterilization` |
| `visible_in`         | `web_store`, `barber_app`, `customer_app`, `all`                                                                                                                                                                 |
| `purchase_mode`      | `retail`, `b2b`, `wholesale`, `quote_request`                                                                                                                                                                    |

### Examples by Buyer Persona

**Men's Barbershop Owner (OWNER role, men_barbershop)**

```sql
visible_in = '{barber_app, web_store}'
target_audience = '{salon_owner, professional_buyer}'
business_type_tags = '{men_barbershop, all}'
requires_verified_salon = false
purchase_mode = '{b2b, retail}'
```

**Barber Staff Member (BARBER role)**

```sql
visible_in = '{barber_app}'
target_audience = '{barber_staff}'
business_type_tags = '{all}'
purchase_mode = '{retail}'
```

**Nail Studio Owner — Restricted Products**

```sql
visible_in = '{barber_app, web_store}'
target_audience = '{salon_owner}'
business_type_tags = '{nail_studio}'
requires_verified_salon = true
min_order_qty = 5
```

**Women's Salon Owner — Professional Equipment**

```sql
visible_in = '{barber_app}'
target_audience = '{salon_owner, professional_buyer}'
business_type_tags = '{women_salon}'
product_use_cases = '{salon_equipment, furniture}'
purchase_mode = '{b2b, wholesale}'
```

**Public Retail Customer — General Products**

```sql
visible_in = '{web_store}'
target_audience = '{all}'
business_type_tags = '{all}'
purchase_mode = '{retail}'
```

---

## 5. Store Integration Module

**Location:** `backend/src/modules/store-integration/`

### Files

| File                              | Purpose                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `store-integration.module.ts`     | NestJS module definition, exported for other modules               |
| `store-integration.service.ts`    | Core logic: token verification, session exchange, session issuance |
| `store-integration.controller.ts` | HTTP endpoints                                                     |
| `store-integration.types.ts`      | TypeScript types and interfaces                                    |
| `product-visibility.service.ts`   | Product visibility and segmentation logic                          |

### Session Exchange Endpoint

```
POST /integrations/DilMart/session/exchange
Content-Type: application/json

{
  "token": "<DilMart Main signed JWT>"
}
```

**Response:**

```json
{
  "storeSessionToken": "<Store session JWT>",
  "expiresIn": 900,
  "profile": {
    "id": "uuid",
    "segment": "DilMart_APP_BARBER_OWNER",
    "DilMartUserId": "uuid",
    "DilMartBarbershopId": "uuid",
    "businessType": "men_barbershop",
    "displayName": "Ahmed Ali"
  }
}
```

### X-Store-Session Flow

After session exchange, the Barber App stores the `storeSessionToken` and passes it on every subsequent request as a header:

```
X-Store-Session: <storeSessionToken>
```

The Marketplace Controller reads this header, verifies it, and derives the trusted viewer context. All segmentation decisions (product filtering, visibility, audience matching) are derived from this verified token — **not** from query parameters.

### store_linked_profiles Upsert

On every session exchange:

1. DilMart JWT is verified (signature, iss, aud, exp)
2. Segment is computed from role + sourceApp
3. `store_linked_profiles` is upserted (one row per `DilMart_user_id`)
4. A short-lived Store session token is issued with embedded claims

---

## 6. Security Model

### Token Flow

```
DilMart Main Backend
  │  Signs JWT with STORE_INTEGRATION_SECRET (HS256)
  │  Payload: { iss, aud, exp, DilMartUserId, role, barbershopId, businessType, sourceApp }
  ▼
Store Backend (/integrations/DilMart/session/exchange)
  │  Verifies: signature + iss='DilMart-main' + aud='DilMart-store' + exp
  │  Upserts store_linked_profiles
  │  Issues Store Session Token with DilMart_INTEGRATION_SECRET (HS256)
  │  Payload: { iss='DilMart-store', exp, linkedProfileId, segment, businessType, ... }
  ▼
Barber App
  │  Stores storeSessionToken
  │  Sends as X-Store-Session header on marketplace requests
  ▼
Store Marketplace APIs
  │  Verifies: signature + iss='DilMart-store' + exp
  │  Derives trusted ViewerContext from claims
  └  Applies product segmentation filters
```

### Checks Applied

| Check                              | Stage                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------- |
| HMAC-HS256 signature (timing-safe) | Both incoming and outgoing tokens                                          |
| `iss` claim verification           | `iss='DilMart-main'` on exchange; `iss='DilMart-store'` on X-Store-Session |
| `aud` claim verification           | `aud='DilMart-store'` on integration token                                 |
| `exp` claim (token expiry)         | Both tokens                                                                |
| Required claims presence           | `DilMartUserId`, `role`, `sourceApp`                                       |
| Session TTL                        | 900 seconds (configurable via env)                                         |

### Security Rules

> **IMPORTANT:** `DilMart_INTEGRATION_SECRET` must NEVER be placed in:
>
> - Git repository (any branch)
> - `.env.example`
> - Chat or documentation outside deployment systems
> - Any public file
>
> Store deployment uses: `DilMart_INTEGRATION_SECRET`  
> DilMart Main Backend deployment uses: `STORE_INTEGRATION_SECRET`  
> Same value, different environment variable names per project.

---

## 7. Marketplace API Changes

All marketplace APIs now support viewer context for B2B segmentation.

### Updated Endpoints

| Endpoint                               | X-Store-Session | Behavior                                                   |
| -------------------------------------- | --------------- | ---------------------------------------------------------- |
| `GET /marketplace/home`                | ✅ Supported    | Returns segmented layout for barber_app surface            |
| `GET /marketplace/products`            | ✅ Supported    | Filters by audience, businessType, requires_verified_salon |
| `GET /marketplace/products/slug/:slug` | ✅ Supported    | Returns 404 if product not visible in viewer context       |
| `GET /marketplace/suggested`           | ✅ Supported    | In-memory visibility filter applied                        |

### Context Resolution Priority

```
X-Store-Session header present?
  ├─ YES → Verified session → Trusted ViewerContext (isTrusted=true)
  │         → Full segmentation + requires_verified_salon enforcement
  └─ NO  → Query params fallback (isTrusted=false)
            → For testing/public only
            → requires_verified_salon NOT enforced
```

### Key Visibility Rules (Applied to All B2B Requests)

1. **`visible_in`** must contain the request surface or `all`
2. **`business_type_tags`**: if `businessType` is present → match or `all`; if absent → only `all` products (prevents nail-studio products appearing in men's barbershop)
3. **`target_audience`** must overlap with resolved audience from segment/role
4. **`requires_verified_salon=true`** → only `DilMart_APP_BARBER_OWNER` / `VERIFIED_SALON_OWNER` can see (enforced on trusted sessions only)

### Role → Audience Mapping (Critical)

DilMart roles are **NOT** the same as Store `target_audience` values. The mapping:

| DilMart Segment                                     | Resolved Store Audiences             |
| --------------------------------------------------- | ------------------------------------ |
| `DilMart_APP_BARBER_OWNER` / `VERIFIED_SALON_OWNER` | `salon_owner`, `professional_buyer`  |
| `DilMart_APP_BARBER_STAFF`                          | `barber_staff`, `professional_buyer` |
| `DilMart_APP_CUSTOMER`                              | `customer`                           |
| `RETAIL_CUSTOMER`                                   | `customer`                           |
| `PROFESSIONAL_BARBER_UNVERIFIED`                    | `professional_buyer`                 |
| `SALON_OWNER_LEAD`                                  | `salon_owner`                        |

---

## 8. Admin Product Form — B2B Segmentation Card

**File:** `src/pages/admin/ProductForm.tsx`

A new **B2B Segmentation Card** (blue-bordered, admin-only) was added to the product form. It is conditionally rendered only for admin users (`isAdmin === true`).

### Fields Added

| Field                     | Input Type              | Description                        |
| ------------------------- | ----------------------- | ---------------------------------- |
| `visible_in`              | Text (comma-separated)  | Surfaces where product appears     |
| `target_audience`         | Text (comma-separated)  | Target buyer audience              |
| `business_type_tags`      | Text (comma-separated)  | Business types this product serves |
| `product_use_cases`       | Text (comma-separated)  | Use cases for the product          |
| `purchase_mode`           | Text (comma-separated)  | Purchase modes available           |
| `min_order_qty`           | Number                  | Minimum order quantity             |
| `max_order_qty`           | Number                  | Maximum order quantity             |
| `is_b2b_offer`            | Switch                  | B2B-specific offer flag            |
| `requires_verified_salon` | Switch (amber-bordered) | Verified salon requirement         |

All fields are loaded in `useEffect` when editing existing products and submitted as typed arrays in `handleSubmit`.

---

## 9. Backward Compatibility

> **All existing public Store behavior is fully preserved.**

| Behavior                                | Status                             |
| --------------------------------------- | ---------------------------------- |
| Public web_store home                   | ✅ Unchanged                       |
| Public product listing                  | ✅ Unchanged                       |
| Public product detail                   | ✅ Unchanged                       |
| Category pages                          | ✅ Unchanged                       |
| Merchant discovery                      | ✅ Unchanged                       |
| Existing products visible on web_store  | ✅ All 152 active products         |
| Existing products visible on barber_app | ✅ 0 — correct by design           |
| Order placement                         | ✅ Unchanged (new fields nullable) |
| Admin product management                | ✅ Enhanced with new fields        |

**No existing product is exposed to barber_app by default.**  
Products must be explicitly configured by Admin via the new B2B Segmentation fields.

---

## 10. Smoke Test Results

### Database Verification

| Check                                            | Result  |
| ------------------------------------------------ | ------- |
| M26 — 9 columns on `products`                    | ✅ PASS |
| M26 — 5 GIN indexes created                      | ✅ PASS |
| M27 — `store_linked_profiles` table (14 columns) | ✅ PASS |
| M27 — RLS enabled, no public policies            | ✅ PASS |
| M27 — Unique index on `DilMart_user_id`          | ✅ PASS |
| M28 — 6 columns on `orders`                      | ✅ PASS |
| M28 — 5 indexes created                          | ✅ PASS |

### Code Verification

| Check                                                      | Result  |
| ---------------------------------------------------------- | ------- |
| Backend build (NestJS `nest build`)                        | ✅ PASS |
| `store-integration` module exports                         | ✅ PASS |
| `StoreIntegrationModule` imported in `MarketplaceModule`   | ✅ PASS |
| `X-Store-Session` header read on all marketplace endpoints | ✅ PASS |
| `iss='DilMart-store'` check in session verification        | ✅ PASS |
| Admin Product Form shows B2B card (admin only)             | ✅ PASS |
| PR #1 merged to main                                       | ✅ PASS |
| PR #2 merged to main                                       | ✅ PASS |
| Security commit pushed to main                             | ✅ PASS |

### DB State (Live)

```
Total active products:     152
Products visible on web_store:    152  (100%)
Products visible on barber_app:     0  (correct — requires explicit admin config)
Products with target_audience=all: 152  (all default to open audience)
```

---

## 11. Known Limitations / Deferred Items

| Item                                      | Deferred To             | Notes                                                 |
| ----------------------------------------- | ----------------------- | ----------------------------------------------------- |
| `store_customer_id` resolution            | Phase 5 — Cart/Checkout | Will be populated on first B2B checkout               |
| Native Barber App store screens           | Phase 5                 | Not started. Requires Main Backend integration first. |
| Customer App integration                  | Future phase            | Architecture supports it, not planned yet             |
| AI-powered product recommendations        | Future phase            | —                                                     |
| Campaign/Banner CMS for barber_app home   | Phase 3                 | `banners: []` placeholder exists in home API          |
| Bulk product B2B pricing tiers            | Future                  | —                                                     |
| Quote request purchase mode flow          | Future                  | `purchase_mode='quote_request'` supported in DB       |
| Cart/Checkout source tracking (M28 usage) | Phase 5                 | Columns exist, not wired to checkout yet              |

---

## 12. Next Phase — DilMart Main Backend Integration

### Goal

Enable DilMart Main Backend (on Staging branch) to issue signed session tokens for Store integration.

### Tasks

```
1. Create store-integration module in DilMart Main Backend
2. Read current user from DilMart JWT (userId, role, barbershopId, businessType, city, phone)
3. Generate signed DilMart Store JWT using STORE_INTEGRATION_SECRET (HS256)
   Payload: { iss='DilMart-main', aud='DilMart-store', exp, DilMartUserId, role, barbershopId, businessType, sourceApp='barber_app' }
4. Call Store endpoint: POST /integrations/DilMart/session/exchange
5. Return storeSessionToken to Barber App
6. Expose new endpoint for Barber App: POST /store-integration/session
```

### Important Constraint

> Work on DilMart Main Backend must be done on **Staging branch only**.  
> Main/Production of DilMart Main has real live data and must not be touched.

### Environment Variable Requirement

```env
# In DilMart Main Backend (Staging) deployment:
STORE_INTEGRATION_SECRET=<same value as DilMart_INTEGRATION_SECRET in Store>

# In DilMart Store deployment:
DilMart_INTEGRATION_SECRET=<same shared secret>
```

---

_Document end. Store Foundation phase is considered complete and approved._  
_Next action: DilMart Main Backend store-integration module._
