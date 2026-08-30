# DILMART — STAGE B PASS 2
# PROPOSED REMOVAL WAVES & MIGRATION ARCHITECTURE

**Generated:** 2026-08-30 | **Status:** PLANNING & PROPOSAL ONLY (NO MIGRATION AUTHORING YET)

---

## 1. Migration Wave Structure

To minimize execution blast radius and ensure zero downtime or checkout disruption, future Stage B cleanup should be divided into **4 bounded forward migrations**:

```text
Migration 1 (Wave 0 & 1): Active RPC Refactor & Dead Functions Drop
Migration 2 (Wave 2 & 3): Leaf & Intermediate Legacy Tables Drop
Migration 3 (Wave 4):     Root Legacy Table Drop (store_linked_profiles)
Migration 4 (Wave 5):     Active Table Legacy Column Drops & Schema Gates
```

---

## 2. Detailed Wave Breakdown

### WAVE 0: Active Function Refactor (`public.place_order`)
- **Action:** Re-declare `public.place_order` with pure modern arguments (removing `p_store_linked_profile_id`, `p_dilmart_user_id`, `p_dilmart_barbershop_id`, `p_segment`, `p_business_type`) and eliminating writes to `orders.dilmart_user_id` / `orders.dilmart_barbershop_id`.
- **Preconditions:** Updated NestJS checkout service caller contract.
- **Rollback Feasibility:** HIGH (Can re-apply original function definition without data loss).
- **Required Verification:** `npm run test:launch-critical`, `checkout-concurrency.test.mjs`, `p0-checkout-identity-geo.test.mjs`.

### WAVE 1: Dead Leaf Functions Drop (19 Functions)
- **Action:** `DROP FUNCTION` for all 19 obsolete Barber, Salon, Federated, and Handoff functions.
- **Preconditions:** Verified 0 runtime callers in backend and frontend.
- **Rollback Feasibility:** HIGH (Can re-create functions from migration history).
- **Required Verification:** `npm run test:policy`, `npm run test:hardening`.

### WAVE 2: Leaf Tables & Audit Logs Drop (6 Tables)
- **Action:**
  - `DROP TABLE public.store_cart_items RESTRICT;`
  - `DROP TABLE public.store_federated_refresh_tokens RESTRICT;`
  - `DROP TABLE public.store_federated_session_audit_events RESTRICT;`
  - `DROP TABLE public.dilmart_customer_handoff_audit_events RESTRICT;`
  - `DROP TABLE public.dilmart_barber_handoff_audit_events RESTRICT;`
  - `DROP TABLE public.dilmart_barber_web_sessions RESTRICT;`
- **Preconditions:** Confirmed row count = 0 on all 6 tables.
- **Rollback Feasibility:** MEDIUM (Tables are empty; DDL schema rollback script required).
- **Required Verification:** Database schema gates.

### WAVE 3: Intermediate Parent Tables & Inbound FKs (4 Tables)
- **Action:**
  - Drop inbound FK constraints from `orders` and `checkout_attempts`.
  - `DROP TABLE public.store_carts RESTRICT;`
  - `DROP TABLE public.store_federated_session_families RESTRICT;`
  - `DROP TABLE public.dilmart_customer_handoffs RESTRICT;`
  - `DROP TABLE public.dilmart_barber_handoffs RESTRICT;`
- **Preconditions:** Wave 2 complete; row count = 0.
- **Rollback Feasibility:** MEDIUM.
- **Required Verification:** `final-schema-gate.sql`.

### WAVE 4: Root Parent Table Drop (1 Table)
- **Action:** `DROP TABLE public.store_linked_profiles RESTRICT;`
- **Preconditions:** All 7 inbound FKs and child tables cleanly removed.
- **Rollback Feasibility:** MEDIUM.
- **Required Verification:** Universal RLS gate, final schema gate.

### WAVE 5: Legacy Column Drops in Active Tables (8 Columns)
- **Action:**
  - Drop columns `dilmart_barbershop_id`, `dilmart_user_id`, `store_cart_id`, `store_linked_profile_id` from `public.orders`.
  - Drop columns `store_cart_id`, `store_linked_profile_id` from `public.checkout_attempts`.
  - Drop column `requires_verified_salon` from `public.products` and `public.marketplace_banners`.
- **Preconditions:** Wave 0 (`place_order` refactor) and Waves 1–4 complete. All non-null counts = 0.
- **Rollback Feasibility:** MEDIUM (Requires DDL rollback script; zero production data loss since all values are null/false).
- **Required Verification:** Full CI test matrix (`npm run test:launch-critical`, `npm run test:policy`, `npm run test:hardening`, `npm run test:product-import`).
