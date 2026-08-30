# DILMART — STAGE B COMPLETE LEGACY DATABASE CLEANUP INVENTORY & DEPENDENCY REMOVAL PLAN
**Generated:** 2026-08-30 | **Status:** READ-ONLY AUDIT BASELINE | **Baseline Commit:** `62922bb`

---

## 1. Executive Cleanup Governance & Policy

In strict accordance with core architecture governance:
- **No historical migrations will be rewritten.**
- **NO BLIND CASCADE:** The cleanup strategy explicitly rejects `CASCADE` drops. All objects must be dropped in an explicit, dependency-safe topological order using `RESTRICT` semantics `[CONFIRMED BY CODE]`.
- All cleanups will be authored as a **FORWARD-ONLY migration** in Stage B Pass 2 after supervisor authorization.
- No database mutations, drops, or table alterations are performed during Pass 1.

---

## 2. Exhaustive Legacy Object & Dependency Matrix (Lowercase Identifiers)

| Object | Type | Current Row Count | Runtime References | FK Dependencies (Inbound / Outbound) | Function / RPC Dependencies | Policy Dependencies | Proposed Action | Risk Level |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`public.store_cart_items`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** None<br>**Outbound:** `store_carts.id`, `products.id`, `merchants.id` | None | 0 policies | **DROP TABLE ... RESTRICT** | **LOW** |
| **`public.store_carts`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** `store_cart_items.cart_id` | `place_b2b_cart_order_idempotent` | 0 policies | **DROP TABLE ... RESTRICT** | **LOW** |
| **`public.store_federated_refresh_tokens`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** Self<br>**Outbound:** `store_federated_session_families.id` | `rotate_federated_refresh_token`, `revoke_federated_sessions_for_identity` | 0 policies | **DROP TABLE ... RESTRICT** | **LOW** |
| **`public.store_federated_session_families`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** `store_federated_refresh_tokens` | `validate_federated_session_family`, `logout_all_federated_sessions` | 0 policies | **DROP TABLE ... RESTRICT** | **LOW** |
| **`public.store_federated_session_audit_events`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** None | None | 0 policies | **DROP TABLE ... RESTRICT** | **LOW** |
| **`public.dilmart_customer_handoff_audit_events`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** None<br>**Outbound:** `dilmart_customer_handoffs.id` | None | 0 policies | **DROP TABLE ... RESTRICT** | **LOW** |
| **`public.dilmart_customer_handoffs`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** `dilmart_customer_handoff_audit_events` | `finalize_customer_handoff`, `redeem_customer_handoff` | 0 policies | **DROP TABLE ... RESTRICT** | **LOW** |
| **`public.dilmart_barber_handoff_audit_events`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** None<br>**Outbound:** `dilmart_barber_handoffs.id` | `reject_barber_handoff_audit_mutation` | 0 policies | **DROP TABLE ... RESTRICT** | **LOW** |
| **`public.dilmart_barber_handoffs`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** `dilmart_barber_handoff_audit_events` | `finalize_barber_handoff`, `redeem_barber_handoff_and_create_session` | 0 policies | **DROP TABLE ... RESTRICT** | **LOW** |
| **`public.dilmart_barber_web_sessions`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** None | `verify_barber_web_session`, `revoke_barber_web_sessions_for_user` | 0 policies | **DROP TABLE ... RESTRICT** | **LOW** |
| **`public.store_linked_profiles`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** `store_carts`, `dilmart_customer_handoffs`, `store_federated_session_families`, `dilmart_barber_handoffs`, `dilmart_barber_web_sessions` | None | 0 policies | **DROP TABLE ... RESTRICT** | **LOW** |

---

## 3. Complete Legacy Function Inventory (`pg_proc`)

| Function Name | Canonical Identity Arguments | Classification | Runtime Callers | Proposed Action |
| :--- | :--- | :---: | :---: | :---: |
| `public.place_b2b_cart_order_idempotent` | `(uuid, text, uuid, uuid, timestamp with time zone, text, text, uuid, text, numeric, numeric, numeric, jsonb, text, text, numeric, uuid, double precision, double precision, text, uuid, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, text, text)` | Obsolete B2B Checkout | 0 | **REMOVE** |
| `public.finalize_barber_handoff` | `(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid)` | Obsolete Barber Handoff | 0 | **REMOVE** |
| `public.verify_barber_web_session` | `(text)` | Obsolete Barber Session | 0 | **REMOVE** |
| `public.redeem_barber_handoff_and_create_session` | `(text, text, text, integer)` | Obsolete Barber Handoff | 0 | **REMOVE** |
| `public.revoke_barber_web_sessions_for_user` | `(uuid)` | Obsolete Barber Session | 0 | **REMOVE** |
| `public.reject_barber_handoff_audit_mutation` | `()` | Obsolete Trigger Function | 0 | **REMOVE** |
| `public.finalize_customer_handoff` | `(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid)` | Obsolete Customer Handoff | 0 | **REMOVE** |
| `public.redeem_customer_handoff` | `(text, text, text, integer)` | Obsolete Customer Handoff | 0 | **REMOVE** |
| `public.logout_all_federated_sessions` | `(uuid)` | Obsolete Federated Auth | 0 | **REMOVE** |
| `public.provision_dilmart_federated_customer` | `(text, text, text, text, text, text)` | Obsolete Federated Auth | 0 | **REMOVE** |
| `public.redeem_and_create_federated_session` | `(text, text, text, integer)` | Obsolete Federated Auth | 0 | **REMOVE** |
| `public.reject_reserved_federated_email` | `()` | Obsolete Trigger Function | 0 | **REMOVE** |
| `public.resolve_dilmart_federated_customer` | `(text, text)` | Obsolete Federated Auth | 0 | **REMOVE** |
| `public.revoke_federated_sessions_for_identity` | `(uuid)` | Obsolete Federated Auth | 0 | **REMOVE** |
| `public.rotate_federated_refresh_token` | `(uuid, text, timestamp with time zone)` | Obsolete Federated Auth | 0 | **REMOVE** |
| `public.validate_federated_session_family` | `(uuid)` | Obsolete Federated Auth | 0 | **REMOVE** |
| `public.place_order` | *(Legacy Signature with StylAi parameters)* | Legacy Checkout Function | Backend NestJS (via `place_order_idempotent`) | **MODIFY / REFACTOR** |

---

## 4. Legacy Column Counts & `place_order` Dependency Lock

| Table Name | Column Name | Type | Active / Non-Null Count | Dependency Analysis & Proposed Action |
| :--- | :--- | :---: | :---: | :--- |
| **`public.products`** | `requires_verified_salon` | `boolean` | **0 rows** (`true`) `[CONFIRMED BY LIVE DB QUERY]` | Safe to drop via `ALTER TABLE public.products DROP COLUMN requires_verified_salon RESTRICT;`. |
| **`public.orders`** | `dilmart_barbershop_id` | `uuid` | **0 rows** (non-null) `[CONFIRMED BY LIVE DB QUERY]` | **BLOCKED ON `place_order`:** Live `place_order` function body still accepts and references this column. **DO NOT DROP** until `place_order` is refactored. |
| **`public.orders`** | `dilmart_user_id` | `uuid` | **0 rows** (non-null) `[CONFIRMED BY LIVE DB QUERY]` | **BLOCKED ON `place_order`:** Live `place_order` function body still accepts and references this column. **DO NOT DROP** until `place_order` is refactored. |

---

## 5. Revised Dependency-Safe Removal Sequence (Analysis Only)

```text
Phase 1: Refactor / Clean up Stored Procedures
  ├── Refactor public.place_order to remove legacy p_dilmart_user_id / p_dilmart_barbershop_id parameters
  ├── DROP FUNCTION public.reject_barber_handoff_audit_mutation() RESTRICT;
  ├── DROP FUNCTION public.reject_reserved_federated_email() RESTRICT;
  ├── DROP FUNCTION public.finalize_barber_handoff(...) RESTRICT;
  ├── DROP FUNCTION public.finalize_customer_handoff(...) RESTRICT;
  ├── DROP FUNCTION public.verify_barber_web_session(...) RESTRICT;
  ├── DROP FUNCTION public.redeem_barber_handoff_and_create_session(...) RESTRICT;
  ├── DROP FUNCTION public.redeem_customer_handoff(...) RESTRICT;
  ├── DROP FUNCTION public.revoke_barber_web_sessions_for_user(...) RESTRICT;
  ├── DROP FUNCTION public.logout_all_federated_sessions(...) RESTRICT;
  ├── DROP FUNCTION public.provision_dilmart_federated_customer(...) RESTRICT;
  ├── DROP FUNCTION public.redeem_and_create_federated_session(...) RESTRICT;
  ├── DROP FUNCTION public.resolve_dilmart_federated_customer(...) RESTRICT;
  ├── DROP FUNCTION public.revoke_federated_sessions_for_identity(...) RESTRICT;
  ├── DROP FUNCTION public.rotate_federated_refresh_token(...) RESTRICT;
  ├── DROP FUNCTION public.validate_federated_session_family(...) RESTRICT;
  └── DROP FUNCTION public.place_b2b_cart_order_idempotent(...) RESTRICT;

Phase 2: Drop Audit & Event Leaf Tables
  ├── DROP TABLE public.store_federated_session_audit_events RESTRICT;
  ├── DROP TABLE public.dilmart_customer_handoff_audit_events RESTRICT;
  └── DROP TABLE public.dilmart_barber_handoff_audit_events RESTRICT;

Phase 3: Drop Session & Token Leaf Tables
  ├── DROP TABLE public.store_federated_refresh_tokens RESTRICT;
  ├── DROP TABLE public.store_federated_session_families RESTRICT;
  └── DROP TABLE public.dilmart_barber_web_sessions RESTRICT;

Phase 4: Drop Handoff Core Tables
  ├── DROP TABLE public.dilmart_customer_handoffs RESTRICT;
  └── DROP TABLE public.dilmart_barber_handoffs RESTRICT;

Phase 5: Drop Cart Child & Parent Tables
  ├── DROP TABLE public.store_cart_items RESTRICT;
  └── DROP TABLE public.store_carts RESTRICT;

Phase 6: Drop Legacy Profile Link Table
  └── DROP TABLE public.store_linked_profiles RESTRICT;

Phase 7: Drop Obsolete Columns (Only after Phase 1 refactoring is complete)
  ├── ALTER TABLE public.products DROP COLUMN requires_verified_salon RESTRICT;
  ├── ALTER TABLE public.orders DROP COLUMN dilmart_barbershop_id RESTRICT;
  └── ALTER TABLE public.orders DROP COLUMN dilmart_user_id RESTRICT;
```
