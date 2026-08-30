# DILMART — STAGE B CANONICAL LIVE LEGACY INVENTORY & REMOVAL CATALOG
**Generated:** 2026-08-30 | **Status:** READ-ONLY AUDIT BASELINE | **Baseline Commit:** `62922bb`
**Extraction Source:** PostgreSQL System Catalogs (`pg_proc`, `pg_class`, `pg_attribute`, `aclexplode()`)
**Extraction Script:** [`backend/scripts/fetch-canonical-legacy-inventory.sql`](file:///d:/DilMart/backend/scripts/fetch-canonical-legacy-inventory.sql)

---

## 1. Executive Scope & Governance

This document establishes the **authoritative canonical list** of legacy database functions, tables, and columns identified for future removal or refactoring in Stage B Pass 2.
All identities, arguments, security modes, and privileges are extracted directly from PostgreSQL system catalogs.

> [!CAUTION]
> **NO DESTRUCTIVE SQL WILL BE EXECUTED IN PASS 1.** This inventory is strictly for dependency mapping and planning.

---

## 2. Canonical Live Legacy Functions Catalog (`pg_proc`)

| # | Exact Function Identity (`pg_proc.oid::regprocedure`) | Canonical Identity Arguments (`pg_get_function_identity_arguments`) | Security Mode (`prosecdef`) | Search Path (`proconfig`) | Live EXECUTE Authority (`proacl`) | Runtime Callers | Classification / Planned Action |
|---|---|---|:---:|:---:|---|:---:|:---:|
| 1 | `public.place_b2b_cart_order_idempotent(uuid, text, uuid, uuid, timestamp with time zone, text, text, uuid, text, numeric, numeric, numeric, jsonb, text, text, numeric, uuid, double precision, double precision, text, uuid, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, text, text)` | `uuid, text, uuid, uuid, timestamp with time zone, text, text, uuid, text, numeric, numeric, numeric, jsonb, text, text, numeric, uuid, double precision, double precision, text, uuid, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, text, text` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 2 | `public.finalize_barber_handoff(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid)` | `uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 3 | `public.verify_barber_web_session(text)` | `text` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 4 | `public.redeem_barber_handoff_and_create_session(text, text, text, integer)` | `text, text, text, integer` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 5 | `public.revoke_barber_web_sessions_for_user(uuid)` | `uuid` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 6 | `public.reject_barber_handoff_audit_mutation()` | `void` | **INVOKER** (`false`) | `NULL` | `PUBLIC, anon, authenticated, service_role` | 0 | **REMOVE** |
| 7 | `public.finalize_customer_handoff(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid, text, text, text, text, text)` | `uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid, text, text, text, text, text` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 8 | `public.redeem_customer_handoff(text, text)` | `text, text` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 9 | `public.logout_all_federated_sessions(text, uuid)` | `text, uuid` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 10 | `public.provision_dilmart_federated_customer(uuid, text)` | `uuid, text` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 11 | `public.redeem_and_create_federated_session(text, text, text, integer, text, text, text, text, text, text, text, text, text)` | `text, text, text, integer, text, text, text, text, text, text, text, text, text` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 12 | `public.reject_reserved_federated_email()` | `void` | **INVOKER** (`false`) | `NULL` | `PUBLIC, anon, authenticated, service_role` | 0 | **REMOVE** |
| 13 | `public.resolve_dilmart_federated_customer(uuid, text)` | `uuid, text` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 14 | `public.revoke_federated_sessions_for_identity(uuid, uuid, text, uuid)` | `uuid, uuid, text, uuid` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 15 | `public.rotate_federated_refresh_token(uuid, text, timestamp with time zone, text, text, text, text, text, text, text)` | `uuid, text, timestamp with time zone, text, text, text, text, text, text, text` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 16 | `public.validate_federated_session_family(uuid, integer)` | `uuid, integer` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | 0 | **REMOVE** |
| 17 | `public.place_order(text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, uuid, uuid, uuid, text, text)` | `text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, uuid, uuid, uuid, text, text` | **DEFINER** | `public, pg_temp` | `service_role` ONLY | Backend NestJS (via `place_order_idempotent`) | **MODIFY / REFACTOR** |

---

## 3. Active Checkout Function Dependency Lock (`place_order`)

```text
Target Function: public.place_order(...)
Full Argument Signature:
  (text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, uuid, uuid, uuid, text, text)

Legacy Tail Parameters in Current Body:
  - p_store_linked_profile_id uuid
  - p_dilmart_user_id uuid
  - p_dilmart_barbershop_id uuid
  - p_segment text
  - p_business_type text

CRITICAL DEPENDENCY RULE:
Columns `orders.dilmart_user_id`, `orders.dilmart_barbershop_id`, `orders.store_cart_id`,
and `orders.store_linked_profile_id` MUST NOT be dropped until `public.place_order`
is explicitly refactored or retired in Stage B Pass 2.
```

---

## 4. Complete Authoritative Legacy Columns Catalog (7 Columns)

| Table Name | Column Name | Data Type | Nullable | Current Live Non-Null Count | Foreign Key Dependencies | Planned Action |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| **`public.orders`** | `dilmart_barbershop_id` | `uuid` | YES | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | None | **BLOCKED:** Refactor `place_order` first. |
| **`public.orders`** | `dilmart_user_id` | `uuid` | YES | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | None | **BLOCKED:** Refactor `place_order` first. |
| **`public.orders`** | `store_cart_id` | `uuid` | YES | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | `store_carts.id` | **BLOCKED:** Refactor `place_order` first. |
| **`public.orders`** | `store_linked_profile_id` | `uuid` | YES | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | `store_linked_profiles.id` | **BLOCKED:** Refactor `place_order` first. |
| **`public.checkout_attempts`** | `store_cart_id` | `uuid` | YES | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | None | **DROP COLUMN ... RESTRICT** (in Pass 2) |
| **`public.checkout_attempts`** | `store_linked_profile_id` | `uuid` | YES | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | None | **DROP COLUMN ... RESTRICT** (in Pass 2) |
| **`public.products`** | `requires_verified_salon` | `boolean` | YES | **0 rows** (`true`) `[CONFIRMED BY LIVE DB QUERY]` | None | **DROP COLUMN ... RESTRICT** (in Pass 2) |

---

## 5. Authoritative Live Legacy Tables Catalog (Lowercase Identifiers)

| Table Name | Live Row Count | Inbound Foreign Keys | Outbound Foreign Keys | Proposed Drop Action |
| :--- | :---: | :--- | :--- | :--- |
| `public.store_cart_items` | **0** `[CONFIRMED BY LIVE DB QUERY]` | None | `store_carts.id`, `products.id`, `merchants.id` | `DROP TABLE public.store_cart_items RESTRICT;` |
| `public.store_carts` | **0** `[CONFIRMED BY LIVE DB QUERY]` | `store_cart_items.cart_id`, `orders.store_cart_id` | `store_linked_profiles.id`, `merchants.id` | `DROP TABLE public.store_carts RESTRICT;` |
| `public.store_federated_refresh_tokens` | **0** `[CONFIRMED BY LIVE DB QUERY]` | Self (`replaced_by_token_id`) | `store_federated_session_families.id` | `DROP TABLE public.store_federated_refresh_tokens RESTRICT;` |
| `public.store_federated_session_families` | **0** `[CONFIRMED BY LIVE DB QUERY]` | `store_federated_refresh_tokens` | `profiles.id`, `store_linked_profiles.id` | `DROP TABLE public.store_federated_session_families RESTRICT;` |
| `public.store_federated_session_audit_events` | **0** `[CONFIRMED BY LIVE DB QUERY]` | None | None | `DROP TABLE public.store_federated_session_audit_events RESTRICT;` |
| `public.dilmart_customer_handoff_audit_events` | **0** `[CONFIRMED BY LIVE DB QUERY]` | None | `dilmart_customer_handoffs.id` | `DROP TABLE public.dilmart_customer_handoff_audit_events RESTRICT;` |
| `public.dilmart_customer_handoffs` | **0** `[CONFIRMED BY LIVE DB QUERY]` | `dilmart_customer_handoff_audit_events` | `store_linked_profiles.id` | `DROP TABLE public.dilmart_customer_handoffs RESTRICT;` |
| `public.dilmart_barber_handoff_audit_events` | **0** `[CONFIRMED BY LIVE DB QUERY]` | None | `dilmart_barber_handoffs.id` | `DROP TABLE public.dilmart_barber_handoff_audit_events RESTRICT;` |
| `public.dilmart_barber_handoffs` | **0** `[CONFIRMED BY LIVE DB QUERY]` | `dilmart_barber_handoff_audit_events` | `store_linked_profiles.id` | `DROP TABLE public.dilmart_barber_handoffs RESTRICT;` |
| `public.dilmart_barber_web_sessions` | **0** `[CONFIRMED BY LIVE DB QUERY]` | None | `store_linked_profiles.id` | `DROP TABLE public.dilmart_barber_web_sessions RESTRICT;` |
| `public.store_linked_profiles` | **0** `[CONFIRMED BY LIVE DB QUERY]` | 5 tables above, `orders.store_linked_profile_id` | `profiles.id` | `DROP TABLE public.store_linked_profiles RESTRICT;` |
