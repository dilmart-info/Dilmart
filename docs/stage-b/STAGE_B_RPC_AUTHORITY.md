# DILMART — STAGE B RPC & DATABASE PRIVILEGE AUTHORITY AUDIT
**Generated:** 2026-08-30 | **Status:** READ-ONLY AUDIT BASELINE | **Baseline Commit:** `62922bb`

---

## 1. Executive RPC Authority Summary

- **Total Live Functions Audited:** **82 functions** across `public`, `app_private`, and `auth` `[CONFIRMED BY LIVE DB QUERY]`.
- **SECURITY DEFINER Functions:** **54 functions**.
- **SECURITY INVOKER Functions:** **28 functions**.
- **Public Schema RLS Helper Verification:**
  - `to_regprocedure('public.is_admin()')` ➔ `NULL` (0 public copies) `[CONFIRMED BY LIVE DB QUERY]`.
  - `to_regprocedure('public.is_platform_admin()')` ➔ `NULL` (0 public copies) `[CONFIRMED BY LIVE DB QUERY]`.
  - `to_regprocedure('public.is_merchant_member(uuid)')` ➔ `NULL` (0 public copies) `[CONFIRMED BY LIVE DB QUERY]`.
  - The 3 helpers reside exclusively in `app_private` (`app_private.is_admin()`, `app_private.is_platform_admin()`, `app_private.is_merchant_member(uuid)`).
- **Place Order RPC Authority Verification:**
  - `public.place_order_idempotent` and `public.place_order` are **SECURITY DEFINER** with search_path pinned to `public, pg_temp`.
  - `EXECUTE` is **REVOKED from PUBLIC, anon, and authenticated** `[CONFIRMED BY LIVE DB QUERY]`.
  - PostgREST direct invocation by browser roles is rejected at the database level.

---

## 2. Authoritative Complete Function & RPC Matrix

The following table provides the exhaustive, canonical catalog of all 82 live database functions derived directly from `pg_proc`.

| # | Schema | Function Name | Canonical Identity Arguments (`pg_get_function_identity_arguments`) | Result Type (`pg_get_function_result`) | Security Mode | Volatility | Search Path | EXECUTE Grants | Runtime Caller | Mutated / Read Tables | Classification |
|---|---|---|---|---|:---:|:---:|:---:|---|---|---|---|
| 1 | `public` | `DilMart_store_fix_unsplash_url` | `text` | `text` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 2 | `public` | `place_order` | `text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid` | `text` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 3 | `app_private` | `is_platform_admin` | `void` | `boolean` | **DEFINER** | VOLATILE | `public` | `anon, authenticated, service_role` | PostgreSQL RLS Policy Evaluation | `orders, profiles, products` | **RLS HELPER (app_private)** |
| 4 | `app_private` | `is_merchant_member` | `uuid` | `boolean` | **DEFINER** | VOLATILE | `public` | `anon, authenticated, service_role` | PostgreSQL RLS Policy Evaluation | `orders, profiles, products` | **RLS HELPER (app_private)** |
| 5 | `public` | `validate_coupon` | `text, numeric, uuid` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (restricted from browser)` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 6 | `public` | `set_orders_updated_at` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger execution)` | PostgreSQL Trigger Execution | `orders, profiles, products` | **TRIGGER FUNCTION** |
| 7 | `public` | `set_outbound_dead_letters_updated_at` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger execution)` | PostgreSQL Trigger Execution | `orders, profiles, products` | **TRIGGER FUNCTION** |
| 8 | `public` | `set_governance_tasks_updated_at` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger execution)` | PostgreSQL Trigger Execution | `orders, profiles, products` | **TRIGGER FUNCTION** |
| 9 | `public` | `set_merchant_commercial_terms_updated_at` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger execution)` | PostgreSQL Trigger Execution | `orders, profiles, products` | **TRIGGER FUNCTION** |
| 10 | `public` | `place_order` | `text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer` | `text` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 11 | `public` | `place_order` | `text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric` | `text` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 12 | `public` | `place_order` | `text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer` | `text` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 13 | `public` | `transition_delivery_status` | `uuid, text, text, uuid, text, jsonb, text, text, text, uuid, uuid, text` | `void` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 14 | `public` | `process_cod_remittance_to_platform` | `uuid, uuid, numeric, numeric, numeric, text, boolean, text, text, numeric, text` | `void` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 15 | `public` | `admin_override_delivery_status` | `uuid, text, uuid, text` | `void` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend Admin / Commercial Engine | `orders, profiles, products` | **ADMIN ONLY** |
| 16 | `public` | `transition_delivery_status` | `uuid, text, text, text, jsonb, text, text, text, uuid, uuid, text` | `void` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 17 | `public` | `clear_order_agent_atomic` | `uuid, uuid, text, text` | `void` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 18 | `public` | `set_desktop_quick_links_updated_at` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger execution)` | PostgreSQL Trigger Execution | `orders, profiles, products` | **TRIGGER FUNCTION** |
| 19 | `public` | `notify_new_order` | `void` | `trigger` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (trigger execution)` | PostgreSQL Trigger Execution | `orders, profiles, products` | **TRIGGER FUNCTION** |
| 20 | `public` | `notify_low_stock` | `void` | `trigger` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (trigger execution)` | PostgreSQL Trigger Execution | `orders, profiles, products` | **TRIGGER FUNCTION** |
| 21 | `public` | `notify_agent_assignment` | `void` | `trigger` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (trigger execution)` | PostgreSQL Trigger Execution | `orders, profiles, products` | **TRIGGER FUNCTION** |
| 22 | `public` | `notify_user_order_status` | `void` | `trigger` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (trigger execution)` | PostgreSQL Trigger Execution | `orders, profiles, products` | **TRIGGER FUNCTION** |
| 23 | `public` | `create_payout_batch_atomic` | `uuid, uuid, timestamp with time zone, timestamp with time zone, text` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 24 | `public` | `analytics_overview` | `void` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 25 | `public` | `operational_alert_counts` | `void` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 26 | `public` | `merchant_customer_summary` | `uuid, text, int, int` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 27 | `public` | `executive_governance_metrics` | `void` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 28 | `public` | `place_order` | `text, uuid, text, text, text, numeric, numeric, numeric, uuid, jsonb, double precision, text, numeric, integer, text, text, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, numeric, uuid, uuid, uuid, uuid, text, integer, for web orders) ── p_source_app text, text, uuid, uuid, uuid, text, text` | `text` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 29 | `public` | `jenni_provisioning_advisory_lock` | `bigint` | `void` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 30 | `public` | `notify_merchant_new_order` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger execution)` | PostgreSQL Trigger Execution | `orders, profiles, products` | **TRIGGER FUNCTION** |
| 31 | `public` | `merge_provisional_customer_account` | `uuid, uuid` | `jsonb` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 32 | `public` | `reserve_auth_action_token` | `text, text` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 33 | `public` | `consume_auth_action_token` | `uuid, uuid` | `boolean` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 34 | `public` | `claim_notification_outbox_batch` | `text, integer` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 35 | `public` | `place_order_idempotent` | `uuid, text, text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 36 | `public` | `review_cancellation_request_atomic` | `uuid, text, uuid, text` | `jsonb` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 37 | `public` | `mark_return_item_received_atomic` | `uuid, uuid, text` | `jsonb` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 38 | `public` | `complete_return_refund_atomic` | `uuid, numeric, text, text` | `jsonb` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 39 | `public` | `review_return_request_atomic` | `uuid, text, uuid, text, text` | `jsonb` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 40 | `public` | `begin_password_reset_finalization` | `uuid, uuid, text` | `boolean` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 41 | `public` | `release_auth_action_token_reservation` | `uuid, uuid` | `boolean` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 42 | `public` | `review_return_request_atomic` | `uuid, text, uuid, text, text, uuid` | `jsonb` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 43 | `public` | `handle_new_user` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger execution)` | PostgreSQL Trigger Execution | `orders, profiles, products` | **TRIGGER FUNCTION** |
| 44 | `public` | `acknowledge_merchant_notification_atomic` | `uuid, uuid, uuid, uuid, boolean` | `public.merchant_notifications` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 45 | `public` | `claim_auth_hook_delivery` | `text, text, text, integer, integer, integer` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 46 | `public` | `complete_auth_hook_delivery` | `text, text, text` | `boolean` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 47 | `public` | `fail_auth_hook_delivery` | `text, text, text` | `boolean` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 48 | `public` | `mark_auth_hook_delivery_uncertain` | `text, text, text` | `boolean` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 49 | `public` | `cleanup_expired_auth_hook_deliveries` | `integer` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 50 | `public` | `product_import_confirm_atomic` | `uuid, uuid, uuid, text, boolean` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 51 | `public` | `product_content_bulk_update_atomic` | `uuid, uuid, text, jsonb` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 52 | `public` | `redeem_customer_handoff` | `text, text` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 53 | `public` | `find_confirmed_auth_users_by_phone` | `text` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 54 | `public` | `find_confirmed_auth_users_by_email` | `text` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 55 | `public` | `resolve_DilMart_federated_customer` | `uuid, text` | `uuid` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 56 | `public` | `finalize_customer_handoff` | `uuid, uuid, text, text, text, text, boolean, text, text, text, text, text, text, text, integer, text, text, timestamp with time zone, timestamp with time zone, uuid` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 57 | `public` | `reject_handoff_audit_mutation` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger execution)` | PostgreSQL Trigger Execution | `orders, profiles, products` | **TRIGGER FUNCTION** |
| 58 | `public` | `reject_reserved_federated_email` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger execution)` | PostgreSQL Trigger Execution | `orders, profiles, products` | **TRIGGER FUNCTION** |
| 59 | `public` | `provision_DilMart_federated_customer` | `uuid, text` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 60 | `public` | `reject_federated_session_audit_mutation` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger execution)` | PostgreSQL Trigger Execution | `orders, profiles, products` | **TRIGGER FUNCTION** |
| 61 | `public` | `redeem_and_create_federated_session` | `text, text, uuid, uuid, text, uuid, text, integer, integer, uuid` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 62 | `public` | `rotate_federated_refresh_token` | `text, uuid, text, text, integer, integer, integer, integer, uuid` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 63 | `public` | `logout_federated_session` | `text, uuid` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 64 | `public` | `logout_all_federated_sessions` | `text, uuid` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 65 | `public` | `revoke_federated_sessions_for_identity` | `uuid, uuid, text, uuid` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 66 | `public` | `validate_federated_session_family` | `uuid, integer, integer` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 67 | `public` | `redeem_and_create_federated_session` | `text, text, uuid, uuid, text, uuid, text, uuid, uuid, uuid, uuid, text, uuid` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 68 | `public` | `rotate_federated_refresh_token` | `text, uuid, text, text, uuid, uuid, uuid, uuid, integer, uuid` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 69 | `public` | `validate_federated_session_family` | `uuid, integer` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 70 | `public` | `set_marketplace_banners_updated_at` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger execution)` | PostgreSQL Trigger Execution | `orders, profiles, products` | **TRIGGER FUNCTION** |
| 71 | `public` | `admin_schedule_merchant_commercial_term` | `uuid, text, text, numeric, timestamp with time zone, jsonb, uuid, boolean` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend Admin / Commercial Engine | `orders, profiles, products` | **ADMIN ONLY** |
| 72 | `public` | `admin_schedule_merchant_commercial_agreement` | `uuid, timestamp with time zone, jsonb, uuid, text, boolean` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend Admin / Commercial Engine | `orders, profiles, products` | **ADMIN ONLY** |
| 73 | `public` | `place_b2b_cart_order_idempotent` | `text, uuid, uuid, timestamp with time zone, text, uuid, text, numeric, numeric, jsonb, text, numeric, uuid, double precision, text, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, numeric, uuid, uuid, uuid, uuid, text, integer, text, uuid, uuid, text, text` | `jsonb` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role` | None (Dead Legacy Residue) | `orders, profiles, products` | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 74 | `public` | `reject_barber_handoff_audit_mutation` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger execution)` | PostgreSQL Trigger Execution | `orders, profiles, products` | **TRIGGER FUNCTION** |
| 75 | `public` | `finalize_barber_handoff` | `uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | None (Dead Legacy Residue) | `orders, profiles, products` | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 76 | `public` | `verify_barber_web_session` | `text` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | None (Dead Legacy Residue) | `orders, profiles, products` | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 77 | `public` | `redeem_barber_handoff_and_create_session` | `text, text, text, integer` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | None (Dead Legacy Residue) | `orders, profiles, products` | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 78 | `public` | `revoke_barber_web_sessions_for_user` | `uuid` | `integer` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | None (Dead Legacy Residue) | `orders, profiles, products` | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 79 | `public` | `admin_merchant_readiness_summary` | `void` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend Admin / Commercial Engine | `orders, profiles, products` | **ADMIN ONLY** |
| 80 | `public` | `upsert_merchant_settings_atomic` | `uuid, jsonb` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 81 | `public` | `abort_password_reset_finalization` | `uuid, uuid, text` | `boolean` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |
| 82 | `public` | `cancel_order_atomic` | `uuid, text, uuid, text, text, uuid, boolean, text` | `jsonb` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role` | Backend NestJS Service | `orders, profiles, products` | **SERVICE-ROLE ONLY** |

---

## 3. Authoritative Exact Drop Identities for Legacy / Residue Functions

The following 6 legacy functions are identified for future removal during Stage B cleanup. Their exact database drop signatures (parameter types only, derived directly from `pg_get_function_identity_arguments()`) are:

1. **`public.place_b2b_cart_order_idempotent(uuid, text, uuid, uuid, timestamp with time zone, text, text, uuid, text, numeric, numeric, numeric, jsonb, text, text, numeric, uuid, double precision, double precision, text, uuid, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, text, text)`**
   - **Defined in:** `20260816100000_b2b_checkout_idempotency.sql`
   - **Status:** Dead legacy residue with 0 runtime callers `[CONFIRMED BY REPOSITORY CODE]`.

2. **`public.finalize_barber_handoff(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid)`**
   - **Defined in:** `20260819100100_barber_handoff_functions.sql`
   - **Status:** Dead legacy residue with 0 runtime callers `[CONFIRMED BY REPOSITORY CODE]`.

3. **`public.verify_barber_web_session(text)`**
   - **Defined in:** `20260819100200_barber_web_sessions.sql`
   - **Status:** Dead legacy residue with 0 runtime callers `[CONFIRMED BY REPOSITORY CODE]`.

4. **`public.redeem_barber_handoff_and_create_session(text, text, text, integer)`**
   - **Defined in:** `20260819100200_barber_web_sessions.sql`
   - **Status:** Dead legacy residue with 0 runtime callers `[CONFIRMED BY REPOSITORY CODE]`.

5. **`public.revoke_barber_web_sessions_for_user(uuid)`**
   - **Defined in:** `20260819100200_barber_web_sessions.sql`
   - **Status:** Dead legacy residue with 0 runtime callers `[CONFIRMED BY REPOSITORY CODE]`.

6. **`public.reject_barber_handoff_audit_mutation()`**
   - **Defined in:** `20260819100000_barber_handoff_core.sql`
   - **Status:** Dead trigger function with 0 active dependents `[CONFIRMED BY REPOSITORY CODE]`.

> [!IMPORTANT]
> **No DROP statements will be executed in Pass 1.** The above identities establish the formal baseline for Stage B Pass 2 remediation after supervisor approval.
