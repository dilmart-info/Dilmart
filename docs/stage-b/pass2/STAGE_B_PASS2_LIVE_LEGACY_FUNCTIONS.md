# DILMART — STAGE B PASS 2
# LIVE LEGACY FUNCTIONS & RPC AUTHORITY INVENTORY

**Generated:** 2026-08-30 | **Updated:** 2026-08-31 | **Status:** READ-ONLY AUDIT BASELINE
**Catalog Source:** `pg_proc`, `pg_namespace`, `pg_get_function_identity_arguments()` on `ztplxqlthuqkuktbznbo`
**Authoritative Raw Data:** [`docs/stage-b/pass2/evidence/LIVE_LEGACY_FUNCTIONS.json`](file:///d:/DilMart/docs/stage-b/pass2/evidence/LIVE_LEGACY_FUNCTIONS.json)

---

## 1. Authoritative Live Legacy Functions Catalog (21 Functions)

All identities, arguments, OIDs, and search paths below are derived directly from the live PostgreSQL system catalog.

| # | Live OID | Function Identity (`p.oid::regprocedure`) | Mode | Live Search Path | Target Phase / Lifecycle | Classification |
|---|:---:|---|:---:|:---:|:---:|:---:|
| 1 | **19793** | `public.finalize_barber_handoff(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid)` | **DEFINER** | `pg_catalog, public` | Migration B | **SAFE TO REMOVE (Dead RPC)** |
| 2 | **19546** | `public.finalize_customer_handoff(uuid, uuid, text, text, text, text, boolean, text, text, text, text, text, text, text, integer, text, text, timestamp with time zone, timestamp with time zone, uuid)` | **DEFINER** | `pg_catalog, public` | Migration B | **SAFE TO REMOVE (Dead RPC)** |
| 3 | **19642** | `public.logout_all_federated_sessions(text, uuid)` | **DEFINER** | `pg_catalog, public` | Migration B | **SAFE TO REMOVE (Dead RPC)** |
| 4 | **19641** | `public.logout_federated_session(text, uuid)` | **DEFINER** | `pg_catalog, public` | Migration B | **SAFE TO REMOVE (Dead RPC)** |
| 5 | **19008** | `public.place_b2b_cart_order_idempotent(...)` *(53 params)* | **DEFINER** | `pg_catalog, public` | Migration B | **SAFE TO REMOVE (Dead RPC)** |
| 6 | **19893** | `public.place_order(...)` *(55 params)* | **DEFINER** | `public, pg_temp` | **Migration A** | **REFACTOR / MODIFY (Active Blocker)** |
| 7 | **19894** | `public.place_order_idempotent(...)` *(51 params)* | **DEFINER** | `public, pg_temp` | Active | **RETAIN / ACTIVE AUTHORITY** |
| 8 | **19545** | `public.provision_dilmart_federated_customer(uuid, text)` | **DEFINER** | `pg_catalog, public` | Migration B | **SAFE TO REMOVE (Dead RPC)** |
| 9 | **19638** | `public.redeem_and_create_federated_session(text, text, uuid, uuid, text, uuid, text, uuid, uuid, uuid, uuid, text, uuid)` | **DEFINER** | `pg_catalog, public` | Migration B | **SAFE TO REMOVE (Dead RPC)** |
| 10 | **19805** | `public.redeem_barber_handoff_and_create_session(text, text, text, integer)` | **DEFINER** | `pg_catalog, public` | Migration B | **SAFE TO REMOVE (Dead RPC)** |
| 11 | **19548** | `public.redeem_customer_handoff(text, text)` | **DEFINER** | `pg_catalog, public` | Migration B | **SAFE TO REMOVE (Dead RPC)** |
| 12 | **19792** | `public.reject_barber_handoff_audit_mutation()` | **INVOKER** | `DEFAULT` | Migration C (with Table) | **REMOVE (Trigger Function)** |
| 13 | **19637** | `public.reject_federated_session_audit_mutation()` | **INVOKER** | `DEFAULT` | Migration C (with Table) | **REMOVE (Trigger Function)** |
| 14 | **19543** | `public.reject_handoff_audit_mutation()` | **INVOKER** | `DEFAULT` | Migration C (with Table) | **REMOVE (Trigger Function)** |
| 15 | **19643** | `public.reject_reserved_federated_email()` | **INVOKER** | `DEFAULT` | Optional Migration F | **REVIEW — AUTH SECURITY GUARD** |
| 16 | **19544** | `public.resolve_dilmart_federated_customer(uuid, text)` | **DEFINER** | `pg_catalog, public` | Migration B | **SAFE TO REMOVE (Dead RPC)** |
| 17 | **19808** | `public.revoke_barber_web_sessions_for_user(uuid)` | **DEFINER** | `pg_catalog, public` | Migration B | **SAFE TO REMOVE (Dead RPC)** |
| 18 | **19640** | `public.revoke_federated_sessions_for_identity(uuid, uuid, text, uuid)` | **DEFINER** | `pg_catalog, public` | Migration B | **SAFE TO REMOVE (Dead RPC)** |
| 19 | **19639** | `public.rotate_federated_refresh_token(text, uuid, text, text, uuid, uuid, uuid, uuid, integer, uuid)` | **DEFINER** | `pg_catalog, public` | Migration B | **SAFE TO REMOVE (Dead RPC)** |
| 20 | **19636** | `public.validate_federated_session_family(uuid, integer)` | **DEFINER** | `pg_catalog, public` | Migration B | **SAFE TO REMOVE (Dead RPC)** |
| 21 | **19807** | `public.verify_barber_web_session(text)` | **DEFINER** | `pg_catalog, public` | Migration B | **SAFE TO REMOVE (Dead RPC)** |

---

## 2. Summary Breakdown by Removal Boundary

- **Total Inspected Live Functions:** 21
- **Dead Non-Trigger RPCs (Migration B):** 15 functions (`finalize_barber_handoff`, `finalize_customer_handoff`, `logout_all_federated_sessions`, `logout_federated_session`, `place_b2b_cart_order_idempotent`, `provision_dilmart_federated_customer`, `redeem_and_create_federated_session`, `redeem_barber_handoff_and_create_session`, `redeem_customer_handoff`, `resolve_dilmart_federated_customer`, `revoke_barber_web_sessions_for_user`, `revoke_federated_sessions_for_identity`, `rotate_federated_refresh_token`, `validate_federated_session_family`, `verify_barber_web_session`).
- **Audit Trigger Functions (Migration C - dropped after audit tables):** 3 functions (`reject_barber_handoff_audit_mutation`, `reject_handoff_audit_mutation`, `reject_federated_session_audit_mutation`).
- **Cross-Schema Auth Guard (Optional Migration F / Separate Approval):** 1 function (`reject_reserved_federated_email`).
- **Active Checkout & Manual Order Engine (Migration A):** 1 function (`public.place_order` — refactor only).
- **Retained Transactional Wrapper:** 1 function (`public.place_order_idempotent`).
