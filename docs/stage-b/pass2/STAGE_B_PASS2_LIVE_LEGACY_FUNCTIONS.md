# DILMART — STAGE B PASS 2
# LIVE LEGACY FUNCTIONS & RPC AUTHORITY INVENTORY

**Generated:** 2026-08-30 | **Status:** READ-ONLY AUDIT BASELINE
**Catalog Source:** `pg_proc`, `pg_namespace`, `pg_get_function_identity_arguments()` on `ztplxqlthuqkuktbznbo`
**Raw Data Artifact:** [`docs/stage-b/pass2/evidence/LIVE_LEGACY_FUNCTIONS.json`](file:///d:/DilMart/docs/stage-b/pass2/evidence/LIVE_LEGACY_FUNCTIONS.json)

---

## 1. Authoritative Live Legacy Functions Catalog (21 Functions)

All identities below are exact literal outputs from PostgreSQL `pg_proc.oid::regprocedure` and `pg_get_function_identity_arguments(p.oid)`.

| # | Exact Function Identity (`pg_proc.oid::regprocedure`) | Exact Identity Arguments (`pg_get_function_identity_arguments`) | Mode (`prosecdef`) | Search Path | Live Grants (`proacl`) | Callers | Classification |
|---|---|---|:---:|:---:|---|:---:|:---:|
| 1 | `public.finalize_barber_handoff(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid)` | `uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 2 | `public.finalize_customer_handoff(uuid, uuid, text, text, text, text, boolean, text, text, text, text, text, text, text, integer, text, text, timestamp with time zone, timestamp with time zone, uuid)` | `uuid, uuid, text, text, text, text, boolean, text, text, text, text, text, text, text, integer, text, text, timestamp with time zone, timestamp with time zone, uuid` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 3 | `public.logout_all_federated_sessions(text, uuid)` | `text, uuid` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 4 | `public.logout_federated_session(text, uuid)` | `text, uuid` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 5 | `public.place_b2b_cart_order_idempotent(uuid, text, uuid, uuid, timestamp with time zone, text, text, uuid, text, numeric, numeric, numeric, jsonb, text, text, numeric, uuid, double precision, double precision, text, uuid, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, text, text)` | `uuid, text, uuid, uuid, timestamp with time zone, text, text, uuid, text, numeric, numeric, numeric, jsonb, text, text, numeric, uuid, double precision, double precision, text, uuid, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, text, text` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 6 | `public.place_order(text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, uuid, text, text)` | `text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, uuid, text, text` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | NestJS / `place_order_idempotent` | **REFACTOR / MODIFY** |
| 7 | `public.place_order_idempotent(uuid, text, text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text)` | `uuid, text, text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | NestJS Checkout | **RETAIN / ACTIVE AUTHORITY** |
| 8 | `public.provision_dilmart_federated_customer(uuid, text)` | `uuid, text` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 9 | `public.redeem_and_create_federated_session(text, text, uuid, uuid, text, uuid, text, uuid, uuid, uuid, uuid, text, uuid)` | `text, text, uuid, uuid, text, uuid, text, uuid, uuid, uuid, uuid, text, uuid` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 10 | `public.redeem_barber_handoff_and_create_session(text, text, text, integer)` | `text, text, text, integer` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 11 | `public.redeem_customer_handoff(text, text)` | `text, text` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 12 | `public.reject_barber_handoff_audit_mutation()` | `void` (trigger) | **INVOKER** (`false`) | `DEFAULT` | `PUBLIC, anon, authenticated, service_role` | 0 | **REMOVE** |
| 13 | `public.reject_federated_session_audit_mutation()` | `void` (trigger) | **INVOKER** (`false`) | `DEFAULT` | `PUBLIC, anon, authenticated, service_role` | 0 | **REMOVE** |
| 14 | `public.reject_handoff_audit_mutation()` | `void` (trigger) | **INVOKER** (`false`) | `DEFAULT` | `PUBLIC, anon, authenticated, service_role` | 0 | **REMOVE** |
| 15 | `public.reject_reserved_federated_email()` | `void` (trigger) | **INVOKER** (`false`) | `DEFAULT` | `PUBLIC, anon, authenticated, service_role` | 0 | **REMOVE** |
| 16 | `public.resolve_dilmart_federated_customer(uuid, text)` | `uuid, text` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 17 | `public.revoke_barber_web_sessions_for_user(uuid)` | `uuid` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 18 | `public.revoke_federated_sessions_for_identity(uuid, uuid, text, uuid)` | `uuid, uuid, text, uuid` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 19 | `public.rotate_federated_refresh_token(text, uuid, text, text, uuid, uuid, uuid, uuid, integer, uuid)` | `text, uuid, text, text, uuid, uuid, uuid, uuid, integer, uuid` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 20 | `public.validate_federated_session_family(uuid, integer)` | `uuid, integer` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 21 | `public.verify_barber_web_session(text)` | `text` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |

---

## 2. Summary Counts

- **Total Checked Functions:** 21
- **SAFE TO REMOVE (Dead Leaf Functions):** 19
- **REFACTOR / MODIFY (Active Blocker):** 1 (`public.place_order`)
- **RETAIN / ACTIVE AUTHORITY:** 1 (`public.place_order_idempotent`)
- **SECURITY INVOKER Trigger Functions:** 4 (`reject_barber_handoff_audit_mutation`, `reject_federated_session_audit_mutation`, `reject_handoff_audit_mutation`, `reject_reserved_federated_email`)
- **SECURITY DEFINER Functions:** 17
