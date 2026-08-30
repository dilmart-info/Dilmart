# DILMART — STAGE B LEGACY DATABASE CLEANUP CANDIDATES & DEPENDENCY REMOVAL PLAN
**Generated:** 2026-08-30 | **Status:** READ-ONLY AUDIT BASELINE | **Baseline Commit:** `62922bb`

---

## 1. Executive Cleanup Governance & Policy

In strict accordance with core architecture governance:
- **No historical migrations will be rewritten.**
- **NO BLIND CASCADE:** The cleanup strategy explicitly rejects `CASCADE` drops. All objects must be dropped in an explicit, dependency-safe topological order using `RESTRICT` semantics `[CONFIRMED BY CODE]`.
- All cleanups will be authored as a **FORWARD-ONLY migration** in Stage B Pass 2 after supervisor authorization.
- No database mutations, drops, or table alterations are performed during Pass 1.

---

## 2. Exhaustive Legacy Object & Dependency Evidence Matrix

| Object | Type | Current Row Count | Runtime References | FK Dependencies (Inbound / Outbound) | Function / RPC Dependencies | Policy Dependencies | Historical Value | Proposed Action | Risk Level |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`public.store_cart_items`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** None<br>**Outbound:** `store_carts.id`, `products.id`, `merchants.id` | None | 0 policies | None (Decoupled in Stage A; client uses localStorage) | **DROP TABLE (RESTRICT)** | **LOW** |
| **`public.store_carts`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** `store_cart_items.cart_id`<br>**Outbound:** `store_linked_profiles.id`, `merchants.id` | `place_b2b_cart_order_idempotent` | 0 policies | None | **DROP TABLE (RESTRICT)** (after child items) | **LOW** |
| **`public.store_federated_refresh_tokens`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** Self (`replaced_by_token_id`)<br>**Outbound:** `store_federated_session_families.id` | None | 0 policies | None (Federated auth replaced by direct Supabase Auth) | **DROP TABLE (RESTRICT)** | **LOW** |
| **`public.store_federated_session_families`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** `store_federated_refresh_tokens`<br>**Outbound:** `profiles.id`, `store_linked_profiles.id` | None | 0 policies | None | **DROP TABLE (RESTRICT)** (after tokens) | **LOW** |
| **`public.store_federated_session_audit_events`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** None<br>**Outbound:** None | None | 0 policies | None | **DROP TABLE (RESTRICT)** | **LOW** |
| **`public.DilMart_customer_handoff_audit_events`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** None<br>**Outbound:** `DilMart_customer_handoffs.id` | None | 0 policies | None | **DROP TABLE (RESTRICT)** | **LOW** |
| **`public.DilMart_customer_handoffs`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** `DilMart_customer_handoff_audit_events`<br>**Outbound:** `store_linked_profiles.id` | None | 0 policies | None | **DROP TABLE (RESTRICT)** (after audit events) | **LOW** |
| **`public.DilMart_barber_handoff_audit_events`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** None<br>**Outbound:** `DilMart_barber_handoffs.id` | `reject_barber_handoff_audit_mutation` | 0 policies | None | **DROP TABLE (RESTRICT)** | **LOW** |
| **`public.DilMart_barber_handoffs`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** `DilMart_barber_handoff_audit_events`<br>**Outbound:** `store_linked_profiles.id` | `finalize_barber_handoff`, `redeem_barber_handoff_and_create_session` | 0 policies | None | **DROP TABLE (RESTRICT)** (after audit events) | **LOW** |
| **`public.DilMart_barber_web_sessions`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** None<br>**Outbound:** `store_linked_profiles.id` | `verify_barber_web_session`, `revoke_barber_web_sessions_for_user` | 0 policies | None | **DROP TABLE (RESTRICT)** | **LOW** |
| **`public.store_linked_profiles`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** `store_carts`, `DilMart_customer_handoffs`, `store_federated_session_families`, `DilMart_barber_handoffs`, `DilMart_barber_web_sessions`<br>**Outbound:** `profiles.id` | None | 0 policies | None | **DROP TABLE (RESTRICT)** (after all inbound dependents) | **LOW** |

---

## 3. Legacy Column Non-Null & Active Value Counts

| Table Name | Column Name | Type | Active / Non-Null Count | Audit Source & Query Pattern | Proposed Action |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **`public.products`** | `requires_verified_salon` | `boolean` | **0 rows** (`true`) | `[CONFIRMED BY LIVE DB QUERY]`<br>`SELECT count(*) FROM products WHERE requires_verified_salon = true` | **DROP COLUMN (RESTRICT)** |
| **`public.orders`** | `DilMart_barbershop_id` | `uuid` | **0 rows** (non-null) | `[CONFIRMED BY REPOSITORY CODE]`<br>`SELECT count(*) FROM orders WHERE DilMart_barbershop_id IS NOT NULL` | **DROP COLUMN (RESTRICT)** |
| **`public.orders`** | `DilMart_user_id` | `uuid` | **0 rows** (non-null) | `[CONFIRMED BY REPOSITORY CODE]`<br>`SELECT count(*) FROM orders WHERE DilMart_user_id IS NOT NULL` | **DROP COLUMN (RESTRICT)** |

---

## 4. Proposed Dependency-Safe Removal Sequence (Analysis Only)

To guarantee that no `CASCADE` operations are used, the removal must follow strict topological sorting based on foreign keys and procedural dependencies:

```text
Step 1: Drop Obsolete Stored Functions & Triggers
  ├── public.reject_barber_handoff_audit_mutation() [Trigger function]
  ├── public.finalize_barber_handoff(...)
  ├── public.verify_barber_web_session(...)
  ├── public.redeem_barber_handoff_and_create_session(...)
  ├── public.revoke_barber_web_sessions_for_user(...)
  └── public.place_b2b_cart_order_idempotent(...)

Step 2: Drop Audit & Event Leaf Tables (No inbound foreign keys)
  ├── public.store_federated_session_audit_events
  ├── public.DilMart_customer_handoff_audit_events
  └── public.DilMart_barber_handoff_audit_events

Step 3: Drop Child / Leaf Token & Session Tables
  ├── public.store_federated_refresh_tokens (References session families)
  ├── public.store_federated_session_families (References linked profiles)
  └── public.DilMart_barber_web_sessions (References linked profiles)

Step 4: Drop Handoff Core Tables
  ├── public.DilMart_customer_handoffs (References linked profiles)
  └── public.DilMart_barber_handoffs (References linked profiles)

Step 5: Drop Cart Child & Parent Tables
  ├── public.store_cart_items (References store_carts)
  └── public.store_carts (References store_linked_profiles)

Step 6: Drop Legacy Profile Link Table
  └── public.store_linked_profiles (References profiles.id)

Step 7: Drop Obsolete Table Columns
  ├── public.products.requires_verified_salon
  ├── public.orders.DilMart_barbershop_id
  └── public.orders.DilMart_user_id
```

> [!CAUTION]
> **This plan is for analysis and audit verification only.** No SQL statements will be executed until Pass 2 is explicitly authorized by the supervisor.
