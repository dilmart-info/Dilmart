# DILMART — STAGE B PASS 2
# LIVE LEGACY COLUMNS INVENTORY & DISPOSITION

**Generated:** 2026-08-30 | **Updated:** 2026-08-31 | **Status:** READ-ONLY AUDIT BASELINE
**Catalog Source:** `pg_attribute`, `pg_class`, `pg_constraint`, `pg_index` on `ztplxqlthuqkuktbznbo`
**Authoritative Raw Data:** [`docs/stage-b/pass2/evidence/LIVE_LEGACY_COLUMNS.json`](file:///d:/DilMart/docs/stage-b/pass2/evidence/LIVE_LEGACY_COLUMNS.json)

---

## 1. Authoritative Legacy Columns in Active / Non-Legacy Tables (8 Columns)

| # | Table Name | Column Name | Data Type | Nullable (`is_nullable`) | Default | Live Non-Null Count | Indexed | FK Target | Classification / Blocking Condition |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `public.orders` | `dilmart_barbershop_id` | `uuid` | **YES** | `NULL` | **0 rows** `[CONFIRMED]` | YES | None | **BLOCKED:** Must refactor `place_order` in Migration A first. |
| 2 | `public.orders` | `dilmart_user_id` | `uuid` | **YES** | `NULL` | **0 rows** `[CONFIRMED]` | YES | None | **BLOCKED:** Must refactor `place_order` in Migration A first. |
| 3 | `public.orders` | `store_cart_id` | `uuid` | **YES** | `NULL` | **0 rows** `[CONFIRMED]` | YES | `store_carts.id` | **BLOCKED:** Drop FK in Migration D first. |
| 4 | `public.orders` | `store_linked_profile_id` | `uuid` | **YES** | `NULL` | **0 rows** `[CONFIRMED]` | YES | `store_linked_profiles.id` | **BLOCKED:** Drop FK in Migration D first. |
| 5 | `public.checkout_attempts` | `store_cart_id` | `uuid` | **YES** | `NULL` | **0 rows** `[CONFIRMED]` | YES | `store_carts.id` | **SAFE TO REMOVE (Migration E)** (Drop FK first) |
| 6 | `public.checkout_attempts` | `store_linked_profile_id` | `uuid` | **YES** | `NULL` | **0 rows** `[CONFIRMED]` | YES | `store_linked_profiles.id` | **SAFE TO REMOVE (Migration E)** (Drop FK first) |
| 7 | `public.products` | `requires_verified_salon` | `boolean` | **NO (`false`)** | `false` | **0 true rows** `[CONFIRMED]` | NO | None | **SAFE TO REMOVE (Migration E)** |
| 8 | `public.marketplace_banners` | `requires_verified_salon` | `boolean` | **NO (`false`)** | `false` | **0 true rows** `[CONFIRMED]` | NO | None | **SAFE TO REMOVE (Migration E)** |

---

## 2. Special Column Disposition: `products.is_b2b_offer`

- `products.is_b2b_offer`: `is_nullable = false`, default `false`, **0 true rows** in production.
- Currently active in TypeScript interfaces and DTOs: `backend/src/modules/marketplace/marketplace-product-detail.contract.ts`, `backend/src/modules/products/products.dto.ts`, and `src/pages/admin/ProductForm.tsx`.
- **Verdict:** **DEFER (Commercial Review)**. Clean up application DTO contracts in Stage C before removing from database.
