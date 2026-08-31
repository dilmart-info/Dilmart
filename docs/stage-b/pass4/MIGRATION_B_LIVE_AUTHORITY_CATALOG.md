# DILMART — STAGE B PASS 4: LIVE PRODUCTION MIGRATION B AUTHORITY CATALOG

## 1. Target Identity & Operating Parameters

- **Repository:** `dilmart-info/Dilmart`
- **Branch:** `stage-b/pass4-legacy-destructive-cleanup`
- **Production Supabase Ref:** `ztplxqlthuqkuktbznbo` (DilMart-Store Live)
- **Authority Mode:** **STRICTLY READ-ONLY** (Zero live mutations executed in Pass 4)
- **Snapshot Date:** 2026-08-31

---

## 2. Modern place_order Authority Verification (Migration A Post-State)

Direct read-only catalog query on live production `ztplxqlthuqkuktbznbo` confirmed:

| Function | Argument Count | Owner | Security Definer | Volatility | Search Path | Execution Privileges |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `public.place_order` | **49** | `postgres` | `true` | `VOLATILE` | `public, pg_temp` | `service_role` ONLY (`anon=false`, `authenticated=false`, `public=false`) |
| `public.place_order_idempotent` | **51** | `postgres` | `true` | `VOLATILE` | `public, pg_temp` | `service_role` ONLY (`anon=false`, `authenticated=false`, `public=false`) |
| `public.place_order_legacy_stageb` | **0 (Absent)** | — | — | — | — | — |

---

## 3. The 16 Legacy Candidate Functions on Live Production

| # | Function Name | Pronargs | Exact Live Regprocedure / Argument Signature | Security Definer | Owner |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `finalize_barber_handoff` | 15 | `finalize_barber_handoff(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid)` | `true` | `postgres` |
| 2 | `finalize_customer_handoff` | 20 | `finalize_customer_handoff(uuid, uuid, text, text, text, text, boolean, text, text, text, text, text, text, text, integer, text, text, timestamp with time zone, timestamp with time zone, uuid)` | `true` | `postgres` |
| 3 | `logout_all_federated_sessions` | 2 | `logout_all_federated_sessions(text, uuid)` | `true` | `postgres` |
| 4 | `place_b2b_cart_order_idempotent` | 53 | `place_b2b_cart_order_idempotent(uuid, text, uuid, uuid, timestamp with time zone, text, text, uuid, text, numeric, numeric, numeric, jsonb, text, text, numeric, uuid, double precision, double precision, text, uuid, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, text, text)` | `true` | `postgres` |
| 5 | `provision_dilmart_federated_customer` | 13 | `provision_dilmart_federated_customer(uuid, text, text, text, text, text, text, text, text, timestamp with time zone, timestamp with time zone, timestamp with time zone, uuid)` | `true` | `postgres` |
| 6 | `redeem_and_create_federated_session` | 16 | `redeem_and_create_federated_session(text, text, text, text, text, text, uuid, text, integer, integer, text, text, text, text, text, uuid)` | `true` | `postgres` |
| 7 | `redeem_barber_handoff_and_create_session` | 16 | `redeem_barber_handoff_and_create_session(text, text, text, text, text, text, uuid, text, integer, integer, text, text, text, text, text, uuid)` | `true` | `postgres` |
| 8 | `redeem_customer_handoff` | 17 | `redeem_customer_handoff(text, text, text, text, text, text, uuid, text, text, integer, integer, text, text, text, text, text, uuid)` | `true` | `postgres` |
| 9 | `reject_barber_handoff_audit_mutation` | 0 | `reject_barber_handoff_audit_mutation()` | `false` | `postgres` |
| 10 | `reject_reserved_federated_email` | 0 | `reject_reserved_federated_email()` | `true` | `postgres` |
| 11 | `resolve_dilmart_federated_customer` | 11 | `resolve_dilmart_federated_customer(uuid, text, text, text, text, text, text, text, timestamp with time zone, timestamp with time zone, uuid)` | `true` | `postgres` |
| 12 | `revoke_barber_web_sessions_for_user` | 3 | `revoke_barber_web_sessions_for_user(uuid, text, uuid)` | `true` | `postgres` |
| 13 | `revoke_federated_sessions_for_identity` | 5 | `revoke_federated_sessions_for_identity(uuid, uuid, uuid, text, uuid)` | `true` | `postgres` |
| 14 | `rotate_federated_refresh_token` | 15 | `rotate_federated_refresh_token(text, text, text, text, text, text, text, text, text, integer, integer, text, text, text, uuid)` | `true` | `postgres` |
| 15 | `validate_federated_session_family` | 4 | `validate_federated_session_family(uuid, text, integer, integer)` | `true` | `postgres` |
| 16 | `verify_barber_web_session` | 4 | `verify_barber_web_session(text, text, integer, integer)` | `true` | `postgres` |

*(Note: Trigger functions `reject_handoff_audit_mutation()` and `reject_federated_session_audit_mutation()` are also captured and scheduled for exact drop).*

---

## 4. Live Table Row Counts (All 11 Candidate Tables)

| # | Table Name | Live Row Count | Data Status |
| :--- | :--- | :--- | :--- |
| 1 | `dilmart_barber_handoff_audit_events` | **0** | Empty (Safe to drop) |
| 2 | `dilmart_barber_handoffs` | **0** | Empty (Safe to drop) |
| 3 | `dilmart_barber_web_sessions` | **0** | Empty (Safe to drop) |
| 4 | `dilmart_customer_handoff_audit_events` | **0** | Empty (Safe to drop) |
| 5 | `dilmart_customer_handoffs` | **0** | Empty (Safe to drop) |
| 6 | `store_cart_items` | **0** | Empty (Safe to drop) |
| 7 | `store_carts` | **0** | Empty (Safe to drop) |
| 8 | `store_federated_refresh_tokens` | **0** | Empty (Safe to drop) |
| 9 | `store_federated_session_audit_events` | **0** | Empty (Safe to drop) |
| 10 | `store_federated_session_families` | **0** | Empty (Safe to drop) |
| 11 | `store_linked_profiles` | **0** | Empty (Safe to drop) |

---

## 5. Live Column Non-Null Counts (All 7 Candidate Columns)

| Target Column | Total Rows | Non-Null Count | Non-Default Values | Data Status |
| :--- | :--- | :--- | :--- | :--- |
| `orders.dilmart_barbershop_id` | 6 | **0** | 0 | Empty (Safe to drop) |
| `orders.dilmart_user_id` | 6 | **0** | 0 | Empty (Safe to drop) |
| `orders.store_cart_id` | 6 | **0** | 0 | Empty (Safe to drop) |
| `orders.store_linked_profile_id` | 6 | **0** | 0 | Empty (Safe to drop) |
| `checkout_attempts.store_cart_id` | 0 | **0** | 0 | Empty (Safe to drop) |
| `checkout_attempts.store_linked_profile_id` | 0 | **0** | 0 | Empty (Safe to drop) |
| `products.requires_verified_salon` | 28 | **28** | **0 true (100% false)** | Zero salon usage (Safe to drop) |
