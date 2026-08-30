# DILMART — STAGE B PASS 2
# PROPOSED REMOVAL WAVES & MIGRATION ARCHITECTURE

**Generated:** 2026-08-30 | **Updated:** 2026-08-31 | **Status:** PLANNING & PROPOSAL ONLY

---

## 1. Migration Wave Structure (6 Bounded Forward Migrations)

To eliminate execution blast radius, prevent ambiguous PostgreSQL overloads, and ensure zero checkout/ordering downtime, future Stage B cleanup is structured into **6 bounded forward migrations**:

```text
Migration A: place_order Authority & Signature Refactor ONLY (Checkout & Manual Orders)
Migration B: Dead Non-Trigger Legacy RPC Removal (15 Functions)
Migration C: Legacy Leaf Tables & Audit Trigger Lifecycle (6 Tables + 3 Trigger Functions)
Migration D: Intermediate & Root Parent Tables + Inbound FKs (5 Tables)
Migration E: Active-Table Legacy Columns & Indexes (8 Columns)
Optional Migration F: auth.users Federated Domain Guard Retirement (Separate Authorization)
```

---

## 2. Detailed Migration Wave Specifications

### MIGRATION A: `place_order` Authority & Signature Refactor ONLY
- **Scope:** Single atomic transaction:
  1. Create new 50-parameter `public.place_order` (removing legacy arguments & column writes).
  2. Update `public.place_order_idempotent` named parameter delegation.
  3. Drop old 55-parameter `public.place_order` overload under `RESTRICT`.
  4. Revoke public/anon/authenticated and grant `service_role` EXECUTE.
  5. Assert exactly 1 `place_order` function exists in `pg_proc`.
- **Preconditions:** Updated backend TypeScript callers (`CheckoutService`, `OrdersService`).
- **Rollback Feasibility:** HIGH (Can re-apply original function definition without data loss).
- **Required Verification:** `npm run test:launch-critical`, `checkout-concurrency.test.mjs`, `p0-checkout-identity-geo.test.mjs`, manual assisted order tests.

### MIGRATION B: Dead Non-Trigger Legacy RPC Removal (15 Functions)
- **Scope:** `DROP FUNCTION ... RESTRICT` for the 15 standalone legacy RPCs (`finalize_barber_handoff`, `finalize_customer_handoff`, `logout_all_federated_sessions`, `logout_federated_session`, `place_b2b_cart_order_idempotent`, `provision_dilmart_federated_customer`, `redeem_and_create_federated_session`, `redeem_barber_handoff_and_create_session`, `redeem_customer_handoff`, `resolve_dilmart_federated_customer`, `revoke_barber_web_sessions_for_user`, `revoke_federated_sessions_for_identity`, `rotate_federated_refresh_token`, `validate_federated_session_family`, `verify_barber_web_session`).
- **Preconditions:** Verified 0 runtime callers in backend and frontend.
- **Rollback Feasibility:** HIGH (Functions can be re-created from historical migrations).
- **Required Verification:** `npm run test:policy`, `npm run test:hardening`.

### MIGRATION C: Legacy Leaf Tables & Audit Trigger Lifecycle (6 Tables + 3 Trigger Functions)
- **Scope:**
  1. `DROP TABLE public.store_cart_items RESTRICT;`
  2. `DROP TABLE public.store_federated_refresh_tokens RESTRICT;`
  3. `DROP TABLE public.dilmart_barber_web_sessions RESTRICT;`
  4. `DROP TABLE public.dilmart_barber_handoff_audit_events RESTRICT;`
  5. `DROP TABLE public.dilmart_customer_handoff_audit_events RESTRICT;`
  6. `DROP TABLE public.store_federated_session_audit_events RESTRICT;`
  7. `DROP FUNCTION public.reject_barber_handoff_audit_mutation() RESTRICT;`
  8. `DROP FUNCTION public.reject_handoff_audit_mutation() RESTRICT;`
  9. `DROP FUNCTION public.reject_federated_session_audit_mutation() RESTRICT;`
- **Preconditions:** Confirmed 0 live rows on all 6 tables immediately before drop.
- **Rollback Feasibility:** MEDIUM (DDL rollback script).
- **Required Verification:** Database schema gates.

### MIGRATION D: Intermediate & Root Parent Tables + Explicit FKs (5 Tables)
- **Scope:**
  1. Drop inbound FK constraints from `orders` and `checkout_attempts`.
  2. `DROP TABLE public.store_carts RESTRICT;`
  3. `DROP TABLE public.store_federated_session_families RESTRICT;`
  4. `DROP TABLE public.dilmart_customer_handoffs RESTRICT;`
  5. `DROP TABLE public.dilmart_barber_handoffs RESTRICT;`
  6. `DROP TABLE public.store_linked_profiles RESTRICT;`
- **Preconditions:** Migration C complete; row count = 0.
- **Rollback Feasibility:** MEDIUM (DDL rollback script).
- **Required Verification:** `final-schema-gate.sql`, Universal RLS check (71 - 11 = 60 public tables).

### MIGRATION E: Active Table Legacy Columns & Indexes (8 Columns)
- **Scope:**
  - Drop columns `dilmart_barbershop_id`, `dilmart_user_id`, `store_cart_id`, `store_linked_profile_id` from `public.orders`.
  - Drop columns `store_cart_id`, `store_linked_profile_id` from `public.checkout_attempts`.
  - Drop column `requires_verified_salon` from `public.products` and `public.marketplace_banners`.
- **Preconditions:** Migration A (`place_order` refactor) and Migration D complete. All non-null counts = 0.
- **Rollback Feasibility:** MEDIUM (Zero data loss; values are all null/false).
- **Required Verification:** Full CI test matrix (`npm run test:launch-critical`, `npm run test:policy`, `npm run test:hardening`, `npm run test:product-import`).

### OPTIONAL MIGRATION F: `auth.users` Federated Domain Guard Retirement
- **Scope:** Drop trigger `trg_reject_reserved_federated_email` on `auth.users` and drop function `public.reject_reserved_federated_email()`.
- **Preconditions:** Explicit separate supervisor approval; verified 0 users on reserved domains.
