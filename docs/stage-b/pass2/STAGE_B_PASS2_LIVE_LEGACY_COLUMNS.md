# DILMART — STAGE B PASS 2
# LIVE LEGACY COLUMNS INVENTORY & DISPOSITION

**Generated:** 2026-08-30 | **Status:** READ-ONLY AUDIT BASELINE
**Catalog Source:** `pg_attribute`, `pg_class`, `pg_constraint`, `pg_index` on `ztplxqlthuqkuktbznbo`
**Raw Data Artifact:** [`docs/stage-b/pass2/evidence/LIVE_LEGACY_COLUMNS.json`](file:///d:/DilMart/docs/stage-b/pass2/evidence/LIVE_LEGACY_COLUMNS.json)

---

## 1. Authoritative Legacy Columns in Active / Non-Legacy Tables (8 Columns)

| # | Table Name | Column Name | Data Type | Nullable | Live Non-Null Count | Constrained | Indexed | FK Target | Classification / Blocking Condition |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `public.orders` | `dilmart_barbershop_id` | `uuid` | YES | **0 rows** `[CONFIRMED]` | NO | YES | None | **BLOCKED:** Must refactor `place_order` first. |
| 2 | `public.orders` | `dilmart_user_id` | `uuid` | YES | **0 rows** `[CONFIRMED]` | NO | YES | None | **BLOCKED:** Must refactor `place_order` first. |
| 3 | `public.orders` | `store_cart_id` | `uuid` | YES | **0 rows** `[CONFIRMED]` | YES | YES | `store_carts.id` | **BLOCKED:** Drop FK `orders_store_cart_id_fkey` first. |
| 4 | `public.orders` | `store_linked_profile_id` | `uuid` | YES | **0 rows** `[CONFIRMED]` | YES | YES | `store_linked_profiles.id` | **BLOCKED:** Drop FK `orders_store_linked_profile_id_fkey` first. |
| 5 | `public.checkout_attempts` | `store_cart_id` | `uuid` | YES | **0 rows** `[CONFIRMED]` | YES | YES | `store_carts.id` | **SAFE TO REMOVE** (Drop FK first) |
| 6 | `public.checkout_attempts` | `store_linked_profile_id` | `uuid` | YES | **0 rows** `[CONFIRMED]` | YES | YES | `store_linked_profiles.id` | **SAFE TO REMOVE** (Drop FK first) |
| 7 | `public.products` | `requires_verified_salon` | `boolean` | YES | **0 rows** (true) `[CONFIRMED]` | NO | NO | None | **SAFE TO REMOVE** (Drop in Wave 5) |
| 8 | `public.marketplace_banners` | `requires_verified_salon` | `boolean` | YES | **0 rows** (true) `[CONFIRMED]` | NO | NO | None | **SAFE TO REMOVE** (Drop in Wave 5) |

---

## 2. Legacy Columns inside Candidate Legacy Tables (20 Columns)

These columns reside in tables scheduled for complete deletion and do not require individual `ALTER TABLE ... DROP COLUMN` statements; they will be dropped atomically when their parent tables are dropped.

- `dilmart_barber_handoff_audit_events`: `handoff_id`, `linked_profile_id`
- `dilmart_barber_handoffs`: `dilmart_user_id`, `linked_profile_id`
- `dilmart_barber_web_sessions`: `dilmart_barbershop_id`, `dilmart_user_id`, `linked_profile_id`
- `dilmart_customer_handoff_audit_events`: `handoff_id`, `linked_profile_id`
- `dilmart_customer_handoffs`: `dilmart_user_id`, `linked_profile_id`
- `store_carts`: `store_linked_profile_id`
- `store_federated_session_audit_events`: `handoff_id`, `linked_profile_id`
- `store_federated_session_families`: `dilmart_user_id`, `linked_profile_id`
- `store_linked_profiles`: `dilmart_barbershop_id`, `dilmart_user_id`, `last_handoff_at`

---

## 3. Special Column Disposition: `products.is_b2b_offer`

- `products.is_b2b_offer` currently has **0 true rows** in production.
- However, it has active type definitions and DTO mappings in `backend/src/modules/marketplace/marketplace-product-detail.contract.ts`, `backend/src/modules/products/products.dto.ts`, and `src/pages/admin/ProductForm.tsx`.
- **Verdict:** **DEFER**. Clean up frontend/backend DTO mappings in Stage C commercial pass before proposing database column drop.
