# DILMART — STAGE B PASS 2
# LIVE LEGACY COLUMNS INVENTORY & DISPOSITION

**Generated:** 2026-08-30 | **Updated:** 2026-08-31 (Micro-Closure Patch) | **Status:** READ-ONLY AUDIT BASELINE
**Catalog Source:** `pg_attribute`, `pg_class`, `pg_constraint`, `pg_index` on `ztplxqlthuqkuktbznbo`
**Authoritative Raw Data:** [`docs/stage-b/pass2/evidence/LIVE_LEGACY_COLUMNS.json`](file:///d:/DilMart/docs/stage-b/pass2/evidence/LIVE_LEGACY_COLUMNS.json)

---

## 1. Authoritative Legacy Columns in Active / Non-Legacy Tables (11 Columns)

| # | Table Name | Column Name | Data Type | Nullable (`is_nullable`) | Default | Live Non-Null Count | Indexed | FK / Constraint Target | Classification & Dependency Gate |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `public.orders` | `dilmart_barbershop_id` | `uuid` | **YES** | `NULL` | **0 rows** `[CONFIRMED]` | YES (`idx_orders_dilmart_barbershop_id`) | None | **BLOCKED:** Refactor `place_order` in Migration A first. |
| 2 | `public.orders` | `dilmart_user_id` | `uuid` | **YES** | `NULL` | **0 rows** `[CONFIRMED]` | YES (`idx_orders_dilmart_user_id`) | None | **BLOCKED:** Refactor `place_order` in Migration A first. |
| 3 | `public.orders` | `segment` | `text` | **YES** | `NULL` | **0 rows** `[CONFIRMED]` | YES (`idx_orders_segment`) | None | **BLOCKED:** Refactor `place_order` in Migration A first. |
| 4 | `public.orders` | `business_type` | `text` | **YES** | `NULL` | **0 rows** `[CONFIRMED]` | NO | None | **BLOCKED:** Refactor `place_order` in Migration A first. |
| 5 | `public.orders` | `source_app` | `text` | **YES** | `NULL` | **0 rows** `[CONFIRMED]` | YES (`idx_orders_source_app`) | None | **BLOCKED:** Refactor `place_order` in Migration A first. |
| 6 | `public.orders` | `store_cart_id` | `uuid` | **YES** | `NULL` | **0 rows** `[CONFIRMED]` | YES (`idx_orders_store_cart_id`) | `store_carts.id` | **BLOCKED:** Drop FK in Migration D first. |
| 7 | `public.orders` | `store_linked_profile_id` | `uuid` | **YES** | `NULL` | **0 rows** `[CONFIRMED]` | YES (`idx_orders_store_linked_profile_id`) | `store_linked_profiles.id` | **BLOCKED:** Drop FK in Migration D first. |
| 8 | `public.checkout_attempts` | `store_cart_id` | `uuid` | **YES** | `NULL` | **0 rows** `[CONFIRMED]` | YES (`idx_checkout_attempts_store_cart`) | `store_carts.id` + `chk_checkout_attempts_owner_xor` | **BLOCKED:** Drop/replace `chk_checkout_attempts_owner_xor` and FK first. |
| 9 | `public.checkout_attempts` | `store_linked_profile_id` | `uuid` | **YES** | `NULL` | **0 rows** `[CONFIRMED]` | YES (`idx_checkout_attempts_linked_profile`) | `store_linked_profiles.id` + `chk_checkout_attempts_owner_xor` | **BLOCKED:** Drop/replace `chk_checkout_attempts_owner_xor` and FK first. |
| 10 | `public.products` | `requires_verified_salon` | `boolean` | **NO (`false`)** | `false` | **0 true rows** `[CONFIRMED]` | NO | None | **SAFE TO REMOVE (Migration E)** |
| 11 | `public.marketplace_banners` | `requires_verified_salon` | `boolean` | **NO (`false`)** | `false` | **0 true rows** `[CONFIRMED]` | NO | None | **SAFE TO REMOVE (Migration E)** |

---

## 2. Detailed Constraint & Column Dispositions

### A. `chk_checkout_attempts_owner_xor` Replacement Plan
- **Current Live Definition:**
  ```sql
  CHECK ((((user_id IS NOT NULL) AND (store_linked_profile_id IS NULL)) OR ((user_id IS NULL) AND (store_linked_profile_id IS NOT NULL) AND (store_cart_id IS NOT NULL))))
  ```
- **Action in Migration E:**
  1. `ALTER TABLE public.checkout_attempts DROP CONSTRAINT chk_checkout_attempts_owner_xor;`
  2. `ALTER TABLE public.checkout_attempts ADD CONSTRAINT chk_checkout_attempts_user_id_not_null CHECK (user_id IS NOT NULL);`
  3. `ALTER TABLE public.checkout_attempts DROP COLUMN store_cart_id RESTRICT;`
  4. `ALTER TABLE public.checkout_attempts DROP COLUMN store_linked_profile_id RESTRICT;`

### B. M28 Columns Disposition (`orders.source_app`, `orders.segment`, `orders.business_type`)
- **`orders.segment`:** Created for Barber App B2B salon segmentation. 0 non-null values. **REMOVE** in Migration E.
- **`orders.business_type`:** Created for Barber App salon business classification. 0 non-null values. **REMOVE** in Migration E.
- **`orders.source_app`:** Created for Barber App source tracking. 0 non-null values. Modern DILMART uses `orders.channel` (`web_checkout`, `whatsapp_assisted`, `manual_assisted`) for canonical channel and client attribution. **REMOVE** in Migration E.

### C. `products.is_b2b_offer` (DEFERRED)
- `products.is_b2b_offer`: `is_nullable = false`, default `false`, **0 true rows** in production.
- Currently active in TypeScript interfaces and DTOs: `backend/src/modules/marketplace/marketplace-product-detail.contract.ts`, `backend/src/modules/products/products.dto.ts`, and `src/pages/admin/ProductForm.tsx`.
- **Verdict:** **DEFER (Commercial Review)**. Clean up application DTO contracts in Stage C before removing from database.
