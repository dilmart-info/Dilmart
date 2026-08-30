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
| **`public.store_cart_items`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** None<br>**Outbound:** `store_carts.id`, `products.id`, `merchants.id` | None | 0 policies | None (Decoupled in Stage A; client uses localStorage) | **DROP TABLE ... RESTRICT** | **LOW** |
| **`public.store_carts`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** `store_cart_items.cart_id`<br>**Outbound:** `store_linked_profiles.id`, `merchants.id` | `place_b2b_cart_order_idempotent` | 0 policies | None | **DROP TABLE ... RESTRICT** (after child items) | **LOW** |
| **`public.store_federated_refresh_tokens`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** Self (`replaced_by_token_id`)<br>**Outbound:** `store_federated_session_families.id` | None | 0 policies | None (Federated auth replaced by direct Supabase Auth) | **DROP TABLE ... RESTRICT** | **LOW** |
| **`public.store_federated_session_families`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** `store_federated_refresh_tokens`<br>**Outbound:** `profiles.id`, `store_linked_profiles.id` | None | 0 policies | None | **DROP TABLE ... RESTRICT** (after tokens) | **LOW** |
| **`public.store_federated_session_audit_events`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** None<br>**Outbound:** None | None | 0 policies | None | **DROP TABLE ... RESTRICT** | **LOW** |
| **`public.DilMart_customer_handoff_audit_events`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** None<br>**Outbound:** `DilMart_customer_handoffs.id` | None | 0 policies | None | **DROP TABLE ... RESTRICT** | **LOW** |
| **`public.DilMart_customer_handoffs`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** `DilMart_customer_handoff_audit_events`<br>**Outbound:** `store_linked_profiles.id` | None | 0 policies | None | **DROP TABLE ... RESTRICT** (after audit events) | **LOW** |
| **`public.DilMart_barber_handoff_audit_events`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** None<br>**Outbound:** `DilMart_barber_handoffs.id` | `reject_barber_handoff_audit_mutation` | 0 policies | None | **DROP TABLE ... RESTRICT** | **LOW** |
| **`public.DilMart_barber_handoffs`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** `DilMart_barber_handoff_audit_events`<br>**Outbound:** `store_linked_profiles.id` | `finalize_barber_handoff`, `redeem_barber_handoff_and_create_session` | 0 policies | None | **DROP TABLE ... RESTRICT** (after audit events) | **LOW** |
| **`public.DilMart_barber_web_sessions`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** None<br>**Outbound:** `store_linked_profiles.id` | `verify_barber_web_session`, `revoke_barber_web_sessions_for_user` | 0 policies | None | **DROP TABLE ... RESTRICT** | **LOW** |
| **`public.store_linked_profiles`** | Table | **0 rows** `[CONFIRMED BY LIVE DB QUERY]` | 0 runtime callers `[CONFIRMED BY CODE]` | **Inbound:** `store_carts`, `DilMart_customer_handoffs`, `store_federated_session_families`, `DilMart_barber_handoffs`, `DilMart_barber_web_sessions`<br>**Outbound:** `profiles.id` | None | 0 policies | None | **DROP TABLE ... RESTRICT** (after all inbound dependents) | **LOW** |

---

## 3. Legacy Column Non-Null & Active Value Counts

| Table Name | Column Name | Type | Active / Non-Null Count | Audit Source & Query Pattern | Proposed Action |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **`public.products`** | `requires_verified_salon` | `boolean` | **0 rows** (`true`) | `[CONFIRMED BY LIVE DB QUERY]`<br>`SELECT count(*) FILTER (WHERE requires_verified_salon = true) FROM public.products;` | **ALTER TABLE ... DROP COLUMN ... RESTRICT** |
| **`public.orders`** | `DilMart_barbershop_id` | `uuid` | **0 rows** (non-null) | `[CONFIRMED BY LIVE DB QUERY]`<br>`SELECT count(*) FILTER (WHERE "DilMart_barbershop_id" IS NOT NULL) FROM public.orders;` | **ALTER TABLE ... DROP COLUMN ... RESTRICT** |
| **`public.orders`** | `DilMart_user_id` | `uuid` | **0 rows** (non-null) | `[CONFIRMED BY LIVE DB QUERY]`<br>`SELECT count(*) FILTER (WHERE "DilMart_user_id" IS NOT NULL) FROM public.orders;` | **ALTER TABLE ... DROP COLUMN ... RESTRICT** |

---

## 4. Authoritative Exact Drop Identities for the 6 Legacy Functions

The exact identities derived from \`pg_get_function_identity_arguments()\` for the 6 legacy functions are:

1. **\`public.place_b2b_cart_order_idempotent(uuid, text, uuid, uuid, timestamp with time zone, text, text, uuid, text, numeric, numeric, numeric, jsonb, text, text, numeric, uuid, double precision, double precision, text, uuid, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, text, text)\`**
2. **\`public.finalize_barber_handoff(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid)\`**
3. **\`public.verify_barber_web_session(text)\`**
4. **\`public.redeem_barber_handoff_and_create_session(text, text, text, integer)\`**
5. **\`public.revoke_barber_web_sessions_for_user(uuid)\`**
6. **\`public.reject_barber_handoff_audit_mutation()\`**

---

## 5. Proposed Dependency-Safe Removal Sequence (Analysis Only)

To guarantee that no \`CASCADE\` operations are used, the removal must follow strict topological sorting based on foreign keys and procedural dependencies using \`RESTRICT\` semantics:

```text
Step 1: Drop Obsolete Stored Functions & Triggers
  ├── DROP FUNCTION public.reject_barber_handoff_audit_mutation() RESTRICT;
  ├── DROP FUNCTION public.finalize_barber_handoff(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid) RESTRICT;
  ├── DROP FUNCTION public.verify_barber_web_session(text) RESTRICT;
  ├── DROP FUNCTION public.redeem_barber_handoff_and_create_session(text, text, text, integer) RESTRICT;
  ├── DROP FUNCTION public.revoke_barber_web_sessions_for_user(uuid) RESTRICT;
  └── DROP FUNCTION public.place_b2b_cart_order_idempotent(uuid, text, uuid, uuid, timestamp with time zone, text, text, uuid, text, numeric, numeric, numeric, jsonb, text, text, numeric, uuid, double precision, double precision, text, uuid, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, text, text) RESTRICT;

Step 2: Drop Audit & Event Leaf Tables (No inbound foreign keys)
  ├── DROP TABLE public.store_federated_session_audit_events RESTRICT;
  ├── DROP TABLE public."DilMart_customer_handoff_audit_events" RESTRICT;
  └── DROP TABLE public."DilMart_barber_handoff_audit_events" RESTRICT;

Step 3: Drop Child / Leaf Token & Session Tables
  ├── DROP TABLE public.store_federated_refresh_tokens RESTRICT;
  ├── DROP TABLE public.store_federated_session_families RESTRICT;
  └── DROP TABLE public."DilMart_barber_web_sessions" RESTRICT;

Step 4: Drop Handoff Core Tables
  ├── DROP TABLE public."DilMart_customer_handoffs" RESTRICT;
  └── DROP TABLE public."DilMart_barber_handoffs" RESTRICT;

Step 5: Drop Cart Child & Parent Tables
  ├── DROP TABLE public.store_cart_items RESTRICT;
  └── DROP TABLE public.store_carts RESTRICT;

Step 6: Drop Legacy Profile Link Table
  └── DROP TABLE public.store_linked_profiles RESTRICT;

Step 7: Drop Obsolete Table Columns
  ├── ALTER TABLE public.products DROP COLUMN requires_verified_salon RESTRICT;
  ├── ALTER TABLE public.orders DROP COLUMN "DilMart_barbershop_id" RESTRICT;
  └── ALTER TABLE public.orders DROP COLUMN "DilMart_user_id" RESTRICT;
```

> [!CAUTION]
> **This plan is for analysis and audit verification only.** No SQL statements will be executed until Pass 2 is explicitly authorized by the supervisor.
