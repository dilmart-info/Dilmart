# DILMART — STAGE B PASS 2
# REPOSITORY RUNTIME REFERENCE MATRIX & TEST DISPOSITION

**Generated:** 2026-08-30 | **Updated:** 2026-08-31 (Micro-Closure Patch) | **Status:** READ-ONLY AUDIT BASELINE
**Authoritative Raw Data:** [`docs/stage-b/pass2/evidence/LIVE_RUNTIME_REFERENCES.json`](file:///d:/DilMart/docs/stage-b/pass2/evidence/LIVE_RUNTIME_REFERENCES.json)

---

## 1. Master Runtime Reference Matrix

| Object Name | Object Type | Active Callers (Backend / Frontend / Native) | Test / CI Callers | Historical Migration References | Risk if Removed | Target Phase |
|---|---|:---:|:---:|:---:|---|:---:|
| `public.store_cart_items` | Table | **0** | 0 | 9 | **ZERO** (Dead leaf table) | Migration C |
| `public.store_carts` | Table | **0** | 2 (`phase5a-checkout-*`) | 12 | **ZERO** (Test fixtures to be updated) | Migration D |
| `public.store_federated_session_audit_events` | Table | **0** | 0 | 12 | **ZERO** (Dead audit table) | Migration C |
| `public.store_federated_refresh_tokens` | Table | **0** | 0 | 15 | **ZERO** (Dead token table) | Migration C |
| `public.store_federated_session_families` | Table | **0** | 0 | 16 | **ZERO** (Dead session family) | Migration D |
| `public.dilmart_customer_handoff_audit_events` | Table | **0** | 0 | 11 | **ZERO** (Dead audit table) | Migration C |
| `public.dilmart_customer_handoffs` | Table | **0** | 0 | 13 | **ZERO** (Dead handoff table) | Migration D |
| `public.dilmart_barber_handoff_audit_events` | Table | **0** | 0 | 9 | **ZERO** (Dead audit table) | Migration C |
| `public.dilmart_barber_handoffs` | Table | **0** | 0 | 10 | **ZERO** (Dead handoff table) | Migration D |
| `public.dilmart_barber_web_sessions` | Table | **0** | 0 | 8 | **ZERO** (Dead session table) | Migration C |
| `public.store_linked_profiles` | Table | **0** | 1 (`phase5a-checkout-smoke`) | 32 | **ZERO** (Child FKs dropped first) | Migration D |
| `orders.dilmart_barbershop_id` | Column | **0** | 2 (`phase5a-checkout-*`) | 19 | **MEDIUM** if dropped before `place_order` refactor | Migration E |
| `orders.dilmart_user_id` | Column | **0** | 2 (`phase5a-checkout-*`) | 36 | **MEDIUM** if dropped before `place_order` refactor | Migration E |
| `orders.segment` | Column | **0** | 0 | 6 | **MEDIUM** if dropped before `place_order` refactor | Migration E |
| `orders.business_type` | Column | **0** | 0 | 6 | **MEDIUM** if dropped before `place_order` refactor | Migration E |
| `orders.source_app` | Column | **0** | 0 | 6 | **MEDIUM** if dropped before `place_order` refactor | Migration E |
| `orders.store_cart_id` | Column | **0** | 0 | 8 | **ZERO** (FK dropped first) | Migration E |
| `orders.store_linked_profile_id` | Column | **0** | 2 (`phase5a-checkout-*`) | 18 | **ZERO** (FK dropped first) | Migration E |
| `checkout_attempts.store_cart_id` | Column | **0** | 0 | 8 | **ZERO** (Constraint/FK dropped first) | Migration E |
| `checkout_attempts.store_linked_profile_id` | Column | **0** | 0 | 8 | **ZERO** (Constraint/FK dropped first) | Migration E |
| `chk_checkout_attempts_owner_xor` | Constraint | **0** | 0 | 4 | **ZERO** (Replaced by `user_id IS NOT NULL`) | Migration E |
| `products.requires_verified_salon` | Column | **0** | 3 (`customer-entry`, `banners`, `filters`) | 14 | **LOW** (Test fixtures to be updated) | Migration E |
| `marketplace_banners.requires_verified_salon` | Column | **0** | 1 (`marketplace-banners.test`) | 8 | **LOW** (Test fixtures to be updated) | Migration E |
| `public.place_b2b_cart_order_idempotent` | Function | **0** | 0 | 4 | **ZERO** (Dead B2B RPC) | Migration B |
| `public.finalize_barber_handoff` | Function | **0** | 0 | 4 | **ZERO** (Dead RPC) | Migration B |
| `public.verify_barber_web_session` | Function | **0** | 0 | 4 | **ZERO** (Dead RPC) | Migration B |
| `public.redeem_barber_handoff_and_create_session` | Function | **0** | 0 | 5 | **ZERO** (Dead RPC) | Migration B |
| `public.revoke_barber_web_sessions_for_user` | Function | **0** | 0 | 4 | **ZERO** (Dead RPC) | Migration B |
| `public.reject_barber_handoff_audit_mutation` | Function | **0** | 0 | 4 | **ZERO** (Trigger on audit table) | Migration C |
| `public.finalize_customer_handoff` | Function | **0** | 0 | 6 | **ZERO** (Dead RPC) | Migration B |
| `public.redeem_customer_handoff` | Function | **0** | 0 | 7 | **ZERO** (Dead RPC) | Migration B |
| `public.logout_all_federated_sessions` | Function | **0** | 0 | 10 | **ZERO** (Dead RPC) | Migration B |
| `public.logout_federated_session` | Function | **0** | 0 | 8 | **ZERO** (Dead RPC) | Migration B |
| `public.provision_dilmart_federated_customer` | Function | **0** | 0 | 5 | **ZERO** (Dead RPC) | Migration B |
| `public.redeem_and_create_federated_session` | Function | **0** | 0 | 10 | **ZERO** (Dead RPC) | Migration B |
| `public.reject_reserved_federated_email` | Function | **0** | 0 | 4 | **LOW** (Trigger on `auth.users`) | Optional Migration F |
| `public.reject_federated_session_audit_mutation` | Function | **0** | 0 | 4 | **ZERO** (Trigger on audit table) | Migration C |
| `public.reject_handoff_audit_mutation` | Function | **0** | 0 | 3 | **ZERO** (Trigger on audit table) | Migration C |
| `public.resolve_dilmart_federated_customer` | Function | **0** | 0 | 5 | **ZERO** (Dead RPC) | Migration B |
| `public.revoke_federated_sessions_for_identity` | Function | **0** | 0 | 10 | **ZERO** (Dead RPC) | Migration B |
| `public.rotate_federated_refresh_token` | Function | **0** | 1 (`federated-session.test`) | 8 | **ZERO** (Client test mock) | Migration B |
| `public.validate_federated_session_family` | Function | **0** | 0 | 8 | **ZERO** (Dead RPC) | Migration B |
| `public.place_order` | Function | **ACTIVE** (`checkout.service.ts`, `orders.service.ts:createManualOrder`) | 1 (`p0-checkout-identity-geo`) | 50 | **CRITICAL** (Core checkout & manual order execution engine) | **Migration A (Refactor)** |
| `public.place_order_idempotent` | Function | **ACTIVE** (`checkout.service.ts`) | 1 (`checkout-concurrency`) | 7 | **CRITICAL** (Authoritative checkout idempotency wrapper) | **RETAIN** |

---

## 2. Affected-Test Precondition & Disposition Matrix

| Test File | Referenced Legacy Objects | Nature of Reference | Required Disposition | Action Plan |
|---|---|---|:---:|---|
| `backend/tests/phase5a-checkout-live.test.mjs` | `store_carts`, `orders.dilmart_*`, `orders.store_linked_profile_id` | Historical fixture seed data | **REWRITE** | Update fixture seeds to use pure modern customer order payloads without legacy keys. |
| `backend/tests/phase5a-checkout-smoke.test.mjs` | `store_carts`, `store_linked_profiles`, `orders.dilmart_*` | Historical smoke assertions | **REWRITE** | Update assertions to verify modern order attributes (`channel`, `financial_snapshot`, `merchant_id`). |
| `backend/tests/marketplace-banners.test.mjs` | `requires_verified_salon` | Banner targeting test case | **REWRITE** | Replace `requires_verified_salon` test assertions with modern banner targeting criteria. |
| `backend/tests/db-integration/customer-entry-eligibility.test.mjs` | `requires_verified_salon` | Entry criteria test | **REWRITE** | Update test fixture to test modern customer eligibility rules. |
| `backend/tests/phase6d-search-filters-brands.test.mjs` | `requires_verified_salon` | Search filter test fixture | **REWRITE** | Remove salon flag from test product fixture. |
| `src/lib/auth/session/federated-session.test.ts` | `rotate_federated_refresh_token` | Unit test of legacy client mock | **RETIRE** | Retire legacy client adapter unit test when federated client code is cleaned up. |
