# DILMART — STAGE B PASS 2
# REPOSITORY RUNTIME REFERENCE MATRIX

**Generated:** 2026-08-30 | **Status:** READ-ONLY AUDIT BASELINE
**Raw Data Artifact:** [`docs/stage-b/pass2/evidence/LIVE_RUNTIME_REFERENCES.json`](file:///d:/DilMart/docs/stage-b/pass2/evidence/LIVE_RUNTIME_REFERENCES.json)

---

## 1. Master Reference Matrix

| Object Name | Object Type | Active Callers (Backend / Frontend / Native) | Test / CI Callers | Historical Migration References | Risk if Removed | Planned Wave |
|---|---|:---:|:---:|:---:|---|:---:|
| `public.store_cart_items` | Table | **0** | 0 | 9 | **ZERO** (Dead leaf table) | Wave 2 |
| `public.store_carts` | Table | **0** | 2 (`phase5a-checkout-*`) | 12 | **ZERO** (Tests to be updated) | Wave 3 |
| `public.store_federated_session_audit_events` | Table | **0** | 0 | 12 | **ZERO** (Dead audit table) | Wave 2 |
| `public.store_federated_refresh_tokens` | Table | **0** | 0 | 15 | **ZERO** (Dead token table) | Wave 2 |
| `public.store_federated_session_families` | Table | **0** | 0 | 16 | **ZERO** (Dead session family) | Wave 3 |
| `public.dilmart_customer_handoff_audit_events` | Table | **0** | 0 | 11 | **ZERO** (Dead audit table) | Wave 2 |
| `public.dilmart_customer_handoffs` | Table | **0** | 0 | 13 | **ZERO** (Dead handoff table) | Wave 3 |
| `public.dilmart_barber_handoff_audit_events` | Table | **0** | 0 | 9 | **ZERO** (Dead audit table) | Wave 2 |
| `public.dilmart_barber_handoffs` | Table | **0** | 0 | 10 | **ZERO** (Dead handoff table) | Wave 3 |
| `public.dilmart_barber_web_sessions` | Table | **0** | 0 | 8 | **ZERO** (Dead session table) | Wave 2 |
| `public.store_linked_profiles` | Table | **0** | 1 (`phase5a-checkout-smoke`) | 32 | **ZERO** (Child FKs dropped first) | Wave 4 |
| `orders.dilmart_barbershop_id` | Column | **0** | 2 (`phase5a-checkout-*`) | 19 | **MEDIUM** if dropped before `place_order` refactor | Wave 5 |
| `orders.dilmart_user_id` | Column | **0** | 2 (`phase5a-checkout-*`) | 36 | **MEDIUM** if dropped before `place_order` refactor | Wave 5 |
| `orders.store_cart_id` | Column | **0** | 0 | 8 | **ZERO** (FK dropped first) | Wave 5 |
| `orders.store_linked_profile_id` | Column | **0** | 2 (`phase5a-checkout-*`) | 18 | **ZERO** (FK dropped first) | Wave 5 |
| `checkout_attempts.store_cart_id` | Column | **0** | 0 | 8 | **ZERO** (FK dropped first) | Wave 5 |
| `checkout_attempts.store_linked_profile_id` | Column | **0** | 0 | 8 | **ZERO** (FK dropped first) | Wave 5 |
| `products.requires_verified_salon` | Column | **0** | 3 (`customer-entry`, `banners`, `filters`) | 14 | **LOW** (Test fixtures to be updated) | Wave 5 |
| `marketplace_banners.requires_verified_salon` | Column | **0** | 1 (`marketplace-banners.test`) | 8 | **LOW** (Test fixtures to be updated) | Wave 5 |
| `public.place_b2b_cart_order_idempotent` | Function | **0** | 0 | 4 | **ZERO** (Dead B2B RPC) | Wave 1 |
| `public.finalize_barber_handoff` | Function | **0** | 0 | 4 | **ZERO** (Dead RPC) | Wave 1 |
| `public.verify_barber_web_session` | Function | **0** | 0 | 4 | **ZERO** (Dead RPC) | Wave 1 |
| `public.redeem_barber_handoff_and_create_session` | Function | **0** | 0 | 5 | **ZERO** (Dead RPC) | Wave 1 |
| `public.revoke_barber_web_sessions_for_user` | Function | **0** | 0 | 4 | **ZERO** (Dead RPC) | Wave 1 |
| `public.reject_barber_handoff_audit_mutation` | Function | **0** | 0 | 4 | **ZERO** (Dead Trigger) | Wave 1 |
| `public.finalize_customer_handoff` | Function | **0** | 0 | 6 | **ZERO** (Dead RPC) | Wave 1 |
| `public.redeem_customer_handoff` | Function | **0** | 0 | 7 | **ZERO** (Dead RPC) | Wave 1 |
| `public.logout_all_federated_sessions` | Function | **0** | 0 | 10 | **ZERO** (Dead RPC) | Wave 1 |
| `public.logout_federated_session` | Function | **0** | 0 | 8 | **ZERO** (Dead RPC) | Wave 1 |
| `public.provision_dilmart_federated_customer` | Function | **0** | 0 | 5 | **ZERO** (Dead RPC) | Wave 1 |
| `public.redeem_and_create_federated_session` | Function | **0** | 0 | 10 | **ZERO** (Dead RPC) | Wave 1 |
| `public.reject_reserved_federated_email` | Function | **0** | 0 | 4 | **ZERO** (Dead Trigger) | Wave 1 |
| `public.reject_federated_session_audit_mutation` | Function | **0** | 0 | 4 | **ZERO** (Dead Trigger) | Wave 1 |
| `public.reject_handoff_audit_mutation` | Function | **0** | 0 | 3 | **ZERO** (Dead Trigger) | Wave 1 |
| `public.resolve_dilmart_federated_customer` | Function | **0** | 0 | 5 | **ZERO** (Dead RPC) | Wave 1 |
| `public.revoke_federated_sessions_for_identity` | Function | **0** | 0 | 10 | **ZERO** (Dead RPC) | Wave 1 |
| `public.rotate_federated_refresh_token` | Function | **0** | 1 (`federated-session.test`) | 8 | **ZERO** (Frontend client adapter mock) | Wave 1 |
| `public.validate_federated_session_family` | Function | **0** | 0 | 8 | **ZERO** (Dead RPC) | Wave 1 |
| `public.place_order` | Function | **ACTIVE** (`checkout.service.ts`, `orders.service.ts`) | 1 (`p0-checkout-identity-geo`) | 50 | **CRITICAL** (Core checkout execution engine) | **REFACTOR (Wave 0)** |
| `public.place_order_idempotent` | Function | **ACTIVE** (`checkout.service.ts`) | 1 (`checkout-concurrency`) | 7 | **CRITICAL** (Authoritative checkout idempotency wrapper) | **RETAIN** |
