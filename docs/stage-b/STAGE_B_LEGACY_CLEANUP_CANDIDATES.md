# DILMART — STAGE B LEGACY DATABASE CLEANUP CANDIDATES
**Generated:** 2026-08-30 | **Status:** READ-ONLY AUDIT BASELINE | **Baseline Commit:** `62922bb`

---

## 1. Executive Cleanup Strategy

In accordance with core architecture governance:
- **No historical migrations will be rewritten.**
- Any cleanup must be executed as **FORWARD-ONLY migrations** in Stage B after supervisor authorization.
- Objects are classified into:
  - `DROP LATER`: Obsolete residue with zero active runtime dependencies.
  - `REMOVE COLUMN LATER`: Table columns from legacy B2B/Barber domains that have no business purpose in DILMART.
  - `ARCHIVE / DEFER`: Objects that may hold historical audit value.

---

## 2. Table-Level Cleanup Candidates

| Table Name | Type | Runtime Callers | Inbound FKs | Outbound FKs | Proposed Forward Action | Risk Level |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`public.store_carts`** | Table | 0 (Decoupled in Stage A) | `store_cart_items` | `store_linked_profiles`, `merchants` | **DROP LATER** (Cascade with items) | **LOW** |
| **`public.store_cart_items`** | Table | 0 (Decoupled in Stage A) | None | `store_carts`, `products`, `merchants` | **DROP LATER** | **LOW** |
| **`public.store_linked_profiles`** | Table | 0 (Decoupled in Stage A) | `store_carts`, `DilMart_customer_handoffs`, `store_federated_session_families`, `DilMart_barber_handoffs`, `DilMart_barber_web_sessions` | `profiles` | **DROP LATER** (After dropping dependent handoffs) | **LOW** |
| **`public.store_federated_session_families`** | Table | 0 (Decoupled in Stage A) | `store_federated_refresh_tokens` | `profiles`, `store_linked_profiles` | **DROP LATER** | **LOW** |
| **`public.store_federated_refresh_tokens`** | Table | 0 (Decoupled in Stage A) | None | `store_federated_session_families` | **DROP LATER** | **LOW** |
| **`public.store_federated_session_audit_events`** | Table | 0 (Decoupled in Stage A) | None | None | **ARCHIVE / DROP LATER** | **LOW** |
| **`public.DilMart_customer_handoffs`** | Table | 0 (Decoupled in Stage A) | `DilMart_customer_handoff_audit_events` | `store_linked_profiles` | **DROP LATER** | **LOW** |
| **`public.DilMart_customer_handoff_audit_events`** | Table | 0 (Decoupled in Stage A) | None | `DilMart_customer_handoffs` | **ARCHIVE / DROP LATER** | **LOW** |
| **`public.DilMart_barber_handoffs`** | Table | 0 (Decoupled in Stage A) | `DilMart_barber_handoff_audit_events` | `store_linked_profiles` | **DROP LATER** | **LOW** |
| **`public.DilMart_barber_handoff_audit_events`** | Table | 0 (Decoupled in Stage A) | None | `DilMart_barber_handoffs` | **ARCHIVE / DROP LATER** | **LOW** |
| **`public.DilMart_barber_web_sessions`** | Table | 0 (Decoupled in Stage A) | None | `store_linked_profiles` | **DROP LATER** | **LOW** |

---

## 3. Column-Level Cleanup Candidates

| Table Name | Column Name | Type | Original Context | Proposed Action | Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`public.products`** | `requires_verified_salon` | `boolean` | Salon professional gating | **REMOVE COLUMN LATER** | DILMART marketplace uses generic audience / visibility filters (`target_audience`). |
| **`public.orders`** | `DilMart_barbershop_id` | `uuid` | B2B source tracking | **REMOVE COLUMN LATER** | Legacy barber app metadata is obsolete in DILMART. |
| **`public.orders`** | `DilMart_user_id` | `uuid` | B2B user linking | **REMOVE COLUMN LATER** | Orders are natively associated with `orders.customer_id` (`profiles.id`). |

---

## 4. Function-Level Cleanup Candidates

1. `public.place_b2b_cart_order_idempotent(...)` -> **DROP FUNCTION LATER**
2. `public.finalize_barber_handoff(...)` -> **DROP FUNCTION LATER**
3. `public.verify_barber_web_session(...)` -> **DROP FUNCTION LATER**
4. `public.redeem_barber_handoff_and_create_session(...)` -> **DROP FUNCTION LATER**
5. `public.revoke_barber_web_sessions_for_user(...)` -> **DROP FUNCTION LATER**
6. `public.reject_barber_handoff_audit_mutation()` -> **DROP FUNCTION LATER**
