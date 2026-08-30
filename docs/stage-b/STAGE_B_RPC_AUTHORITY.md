# DILMART — STAGE B RPC & DATABASE PRIVILEGE AUTHORITY AUDIT
**Generated:** 2026-08-30 | **Status:** READ-ONLY AUDIT BASELINE | **Baseline Commit:** `62922bb`

---

## 1. Executive RPC Authority Summary

- **Total Functions in Exposed / Application Schemas:** **83 functions** `[CONFIRMED BY LIVE DB QUERY]`.
  - `public` schema: **80 functions** (67 SECURITY DEFINER, 13 SECURITY INVOKER).
  - `app_private` schema: **3 functions** (3 SECURITY DEFINER, 0 SECURITY INVOKER).
  - `auth` schema: **4 functions**.
  - Total across Database: **87 functions**.
- **Public Schema RLS Helper Verification:**
  - `to_regprocedure('public.is_admin()')` ➔ `NULL` (0 public copies) `[CONFIRMED BY LIVE DB QUERY]`.
  - `to_regprocedure('public.is_platform_admin()')` ➔ `NULL` (0 public copies) `[CONFIRMED BY LIVE DB QUERY]`.
  - `to_regprocedure('public.is_merchant_member(uuid)')` ➔ `NULL` (0 public copies) `[CONFIRMED BY LIVE DB QUERY]`.
  - Helpers reside exclusively in `app_private` (`app_private.is_admin()`, `app_private.is_platform_admin()`, `app_private.is_merchant_member(uuid)`).
- **Place Order Live Identity & Authority Verification:**
  - Database contains **exactly ONE live `public.place_order`** and **ONE live `public.place_order_idempotent`** (historical overloads are not live).
  - Both are **SECURITY DEFINER** with search_path `public, pg_temp`.
  - `EXECUTE` is **REVOKED from PUBLIC, anon, and authenticated** `[CONFIRMED BY LIVE DB QUERY]`.
  - PostgREST direct invocation by browser roles is rejected at the database level.
- **Legacy Parameters in `place_order` Body:**
  - Live `place_order` function body still references legacy parameters (`p_store_linked_profile_id`, `p_dilmart_user_id`, `p_dilmart_barbershop_id`, `p_segment`, `p_business_type`).
  - Columns `orders.dilmart_user_id` and `orders.dilmart_barbershop_id` **cannot be dropped** until `place_order` is refactored/retired.

---

## 2. Authoritative Live Function & RPC Catalog

| # | Schema | Function Name | Canonical Identity Arguments (`pg_get_function_identity_arguments`) | Result Type (`pg_get_function_result`) | Security Mode | Volatility | Search Path | EXECUTE Authority (`p.proacl`) | Runtime Caller | Classification |
|---|---|---|---|---|:---:|:---:|:---:|---|---|---|
| 1 | `public` | `DilMart_store_fix_unsplash_url` | `text` | `text` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 2 | `public` | `place_order` | `text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid` | `text` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 3 | `app_private` | `is_platform_admin` | `void` | `boolean` | **DEFINER** | VOLATILE | `public` | `anon, authenticated, service_role` | PostgreSQL RLS Engine | **RLS HELPER (app_private)** |
| 4 | `app_private` | `is_merchant_member` | `uuid` | `boolean` | **DEFINER** | VOLATILE | `public` | `anon, authenticated, service_role` | PostgreSQL RLS Engine | **RLS HELPER (app_private)** |
| 5 | `public` | `validate_coupon` | `text, numeric, uuid` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 6 | `public` | `set_orders_updated_at` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger)` | PostgreSQL Triggers | **TRIGGER FUNCTION** |
| 7 | `public` | `set_outbound_dead_letters_updated_at` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger)` | PostgreSQL Triggers | **TRIGGER FUNCTION** |
| 8 | `public` | `set_governance_tasks_updated_at` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger)` | PostgreSQL Triggers | **TRIGGER FUNCTION** |
| 9 | `public` | `set_merchant_commercial_terms_updated_at` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger)` | PostgreSQL Triggers | **TRIGGER FUNCTION** |
| 10 | `public` | `transition_delivery_status` | `uuid, text, text, uuid, text, jsonb, text, text, text, uuid, uuid, text` | `void` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 11 | `public` | `process_cod_remittance_to_platform` | `uuid, uuid, numeric, numeric, numeric, text, boolean, text, text, numeric, text` | `void` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 12 | `public` | `admin_override_delivery_status` | `uuid, text, uuid, text` | `void` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 13 | `public` | `clear_order_agent_atomic` | `uuid, uuid, text, text` | `void` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 14 | `public` | `set_desktop_quick_links_updated_at` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger)` | PostgreSQL Triggers | **TRIGGER FUNCTION** |
| 15 | `public` | `notify_new_order` | `void` | `trigger` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (trigger)` | PostgreSQL Triggers | **TRIGGER FUNCTION** |
| 16 | `public` | `notify_low_stock` | `void` | `trigger` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (trigger)` | PostgreSQL Triggers | **TRIGGER FUNCTION** |
| 17 | `public` | `notify_agent_assignment` | `void` | `trigger` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (trigger)` | PostgreSQL Triggers | **TRIGGER FUNCTION** |
| 18 | `public` | `notify_user_order_status` | `void` | `trigger` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (trigger)` | PostgreSQL Triggers | **TRIGGER FUNCTION** |
| 19 | `public` | `create_payout_batch_atomic` | `uuid, uuid, timestamp with time zone, timestamp with time zone, text` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 20 | `public` | `analytics_overview` | `void` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 21 | `public` | `operational_alert_counts` | `void` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 22 | `public` | `merchant_customer_summary` | `uuid, text, int, int` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 23 | `public` | `executive_governance_metrics` | `void` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 24 | `public` | `jenni_provisioning_advisory_lock` | `bigint` | `void` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 25 | `public` | `notify_merchant_new_order` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger)` | PostgreSQL Triggers | **TRIGGER FUNCTION** |
| 26 | `public` | `merge_provisional_customer_account` | `uuid, uuid` | `jsonb` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 27 | `public` | `reserve_auth_action_token` | `text, text` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 28 | `public` | `consume_auth_action_token` | `uuid, uuid` | `boolean` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 29 | `public` | `claim_notification_outbox_batch` | `text, integer` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 30 | `public` | `place_order_idempotent` | `uuid, text, text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 31 | `public` | `review_cancellation_request_atomic` | `uuid, text, uuid, text` | `jsonb` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 32 | `public` | `mark_return_item_received_atomic` | `uuid, uuid, text` | `jsonb` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 33 | `public` | `complete_return_refund_atomic` | `uuid, numeric, text, text` | `jsonb` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 34 | `public` | `review_return_request_atomic` | `uuid, text, uuid, text, text` | `jsonb` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 35 | `public` | `begin_password_reset_finalization` | `uuid, uuid, text` | `boolean` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 36 | `public` | `release_auth_action_token_reservation` | `uuid, uuid` | `boolean` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 37 | `public` | `handle_new_user` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger)` | PostgreSQL Triggers | **TRIGGER FUNCTION** |
| 38 | `public` | `acknowledge_merchant_notification_atomic` | `uuid, uuid, uuid, uuid, boolean` | `public.merchant_notifications` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 39 | `public` | `claim_auth_hook_delivery` | `text, text, text, integer, integer, integer` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 40 | `public` | `complete_auth_hook_delivery` | `text, text, text` | `boolean` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 41 | `public` | `fail_auth_hook_delivery` | `text, text, text` | `boolean` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 42 | `public` | `mark_auth_hook_delivery_uncertain` | `text, text, text` | `boolean` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 43 | `public` | `cleanup_expired_auth_hook_deliveries` | `integer` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 44 | `public` | `product_import_confirm_atomic` | `uuid, uuid, uuid, text, boolean` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 45 | `public` | `product_content_bulk_update_atomic` | `uuid, uuid, text, jsonb` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 46 | `public` | `redeem_customer_handoff` | `text, text` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 47 | `public` | `find_confirmed_auth_users_by_phone` | `text` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 48 | `public` | `find_confirmed_auth_users_by_email` | `text` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 49 | `public` | `resolve_DilMart_federated_customer` | `uuid, text` | `uuid` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | None (Dead Legacy Residue) | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 50 | `public` | `finalize_customer_handoff` | `uuid, uuid, text, text, text, text, boolean, text, text, text, text, text, text, text, integer, text, text, timestamp with time zone, timestamp with time zone, uuid` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 51 | `public` | `reject_handoff_audit_mutation` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger)` | PostgreSQL Triggers | **TRIGGER FUNCTION** |
| 52 | `public` | `reject_reserved_federated_email` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger)` | PostgreSQL Triggers | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 53 | `public` | `provision_DilMart_federated_customer` | `uuid, text` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | None (Dead Legacy Residue) | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 54 | `public` | `reject_federated_session_audit_mutation` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger)` | PostgreSQL Triggers | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 55 | `public` | `redeem_and_create_federated_session` | `text, text, uuid, uuid, text, uuid, text, integer, integer, uuid` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | None (Dead Legacy Residue) | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 56 | `public` | `rotate_federated_refresh_token` | `text, uuid, text, text, integer, integer, integer, integer, uuid` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | None (Dead Legacy Residue) | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 57 | `public` | `logout_federated_session` | `text, uuid` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | None (Dead Legacy Residue) | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 58 | `public` | `logout_all_federated_sessions` | `text, uuid` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | None (Dead Legacy Residue) | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 59 | `public` | `revoke_federated_sessions_for_identity` | `uuid, uuid, text, uuid` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | None (Dead Legacy Residue) | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 60 | `public` | `validate_federated_session_family` | `uuid, integer, integer` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | None (Dead Legacy Residue) | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 61 | `public` | `set_marketplace_banners_updated_at` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger)` | PostgreSQL Triggers | **TRIGGER FUNCTION** |
| 62 | `public` | `admin_schedule_merchant_commercial_term` | `uuid, text, text, numeric, timestamp with time zone, jsonb, uuid, boolean` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 63 | `public` | `admin_schedule_merchant_commercial_agreement` | `uuid, timestamp with time zone, jsonb, uuid, text, boolean` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 64 | `public` | `place_b2b_cart_order_idempotent` | `text, uuid, uuid, timestamp with time zone, text, uuid, text, numeric, numeric, jsonb, text, numeric, uuid, double precision, text, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, numeric, uuid, uuid, uuid, uuid, text, integer, text, uuid, uuid, text, text` | `jsonb` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | None (Dead Legacy Residue) | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 65 | `public` | `reject_barber_handoff_audit_mutation` | `void` | `trigger` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (trigger)` | PostgreSQL Triggers | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 66 | `public` | `finalize_barber_handoff` | `uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | None (Dead Legacy Residue) | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 67 | `public` | `verify_barber_web_session` | `text` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | None (Dead Legacy Residue) | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 68 | `public` | `redeem_barber_handoff_and_create_session` | `text, text, text, integer` | `record` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | None (Dead Legacy Residue) | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 69 | `public` | `revoke_barber_web_sessions_for_user` | `uuid` | `integer` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | None (Dead Legacy Residue) | **OBSOLETE / CANDIDATE FOR REMOVAL** |
| 70 | `public` | `admin_merchant_readiness_summary` | `void` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 71 | `public` | `upsert_merchant_settings_atomic` | `uuid, jsonb` | `jsonb` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 72 | `public` | `abort_password_reset_finalization` | `uuid, uuid, text` | `boolean` | **DEFINER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |
| 73 | `public` | `cancel_order_atomic` | `uuid, text, uuid, text, text, uuid, boolean, text` | `jsonb` | **INVOKER** | VOLATILE | `public, pg_temp` | `service_role (browser restricted)` | Backend NestJS Service | **CORE RPC** |

---

## 3. Complete Legacy & Obsolete Function Inventory (Candidates for Removal)

The following 16 legacy functions are identified for removal or refactoring during Stage B Pass 2 cleanup:

1. `public.place_b2b_cart_order_idempotent` (Obsolete B2B checkout)
2. `public.finalize_barber_handoff` (Obsolete Barber handoff)
3. `public.verify_barber_web_session` (Obsolete Barber session)
4. `public.redeem_barber_handoff_and_create_session` (Obsolete Barber handoff)
5. `public.revoke_barber_web_sessions_for_user` (Obsolete Barber session)
6. `public.reject_barber_handoff_audit_mutation` (Obsolete Trigger function)
7. `public.finalize_customer_handoff` (Obsolete Customer handoff)
8. `public.redeem_customer_handoff` (Obsolete Customer handoff)
9. `public.logout_all_federated_sessions` (Obsolete Federated auth)
10. `public.provision_dilmart_federated_customer` (Obsolete Federated auth)
11. `public.redeem_and_create_federated_session` (Obsolete Federated auth)
12. `public.reject_reserved_federated_email` (Obsolete Trigger function)
13. `public.resolve_dilmart_federated_customer` (Obsolete Federated auth)
14. `public.revoke_federated_sessions_for_identity` (Obsolete Federated auth)
15. `public.rotate_federated_refresh_token` (Obsolete Federated auth)
16. `public.validate_federated_session_family` (Obsolete Federated auth)

> [!CAUTION]
> **No DROP statements are authorized during Pass 1.** The above identities establish the formal baseline for Stage B Pass 2 remediation after supervisor approval.
