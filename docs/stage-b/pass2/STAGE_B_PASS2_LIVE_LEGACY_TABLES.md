# DILMART — STAGE B PASS 2
# LIVE LEGACY TABLES INVENTORY & DISPOSITION

**Generated:** 2026-08-30 | **Status:** READ-ONLY AUDIT BASELINE
**Catalog Source:** `pg_class`, `pg_namespace`, `pg_constraint`, `pg_policies` on `ztplxqlthuqkuktbznbo`
**Raw Data Artifact:** [`docs/stage-b/pass2/evidence/LIVE_LEGACY_TABLES.json`](file:///d:/DilMart/docs/stage-b/pass2/evidence/LIVE_LEGACY_TABLES.json)

---

## 1. Authoritative Live Legacy Tables Summary (11 Tables)

| # | Exact Lowercase Table Name | OID | Live Row Count | RLS Enabled | Owner | Inbound FK Count | Outbound FK Count | Policies | Classification |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | `public.store_cart_items` | `pg_class.oid` | **0** `[CONFIRMED]` | `true` | `postgres` | **0** | **3** (`store_carts`, `products`, `merchants`) | 0 | **SAFE TO REMOVE** |
| 2 | `public.store_carts` | `pg_class.oid` | **0** `[CONFIRMED]` | `true` | `postgres` | **3** (`store_cart_items`, `orders`, `checkout_attempts`) | **2** (`store_linked_profiles`, `merchants`) | 0 | **SAFE TO REMOVE** |
| 3 | `public.store_federated_session_audit_events` | `pg_class.oid` | **0** `[CONFIRMED]` | `true` | `postgres` | **0** | **0** | 0 | **SAFE TO REMOVE** |
| 4 | `public.store_federated_refresh_tokens` | `pg_class.oid` | **0** `[CONFIRMED]` | `true` | `postgres` | **2** (Self `parent_token`, `replaced_by`) | **3** (`store_federated_session_families`, Self) | 0 | **SAFE TO REMOVE** |
| 5 | `public.store_federated_session_families` | `pg_class.oid` | **0** `[CONFIRMED]` | `true` | `postgres` | **1** (`store_federated_refresh_tokens`) | **2** (`profiles`, `store_linked_profiles`) | 0 | **SAFE TO REMOVE** |
| 6 | `public.dilmart_customer_handoff_audit_events` | `pg_class.oid` | **0** `[CONFIRMED]` | `true` | `postgres` | **0** | **0** | 0 | **SAFE TO REMOVE** |
| 7 | `public.dilmart_customer_handoffs` | `pg_class.oid` | **0** `[CONFIRMED]` | `true` | `postgres` | **0** | **2** (`store_linked_profiles`, `profiles`) | 0 | **SAFE TO REMOVE** |
| 8 | `public.dilmart_barber_handoff_audit_events` | `pg_class.oid` | **0** `[CONFIRMED]` | `true` | `postgres` | **0** | **0** | 0 | **SAFE TO REMOVE** |
| 9 | `public.dilmart_barber_handoffs` | `pg_class.oid` | **0** `[CONFIRMED]` | `true` | `postgres` | **0** | **1** (`store_linked_profiles`) | 0 | **SAFE TO REMOVE** |
| 10 | `public.dilmart_barber_web_sessions` | `pg_class.oid` | **0** `[CONFIRMED]` | `true` | `postgres` | **0** | **1** (`store_linked_profiles`) | 0 | **SAFE TO REMOVE** |
| 11 | `public.store_linked_profiles` | `pg_class.oid` | **0** `[CONFIRMED]` | `true` | `postgres` | **7** (`orders`, `checkout_attempts`, `store_carts`, `dilmart_customer_handoffs`, `dilmart_barber_handoffs`, `dilmart_barber_web_sessions`, `store_federated_session_families`) | **1** (`profiles`) | 0 | **SAFE TO REMOVE** |

---

## 2. Table-by-Table Architectural Analysis

### 1. `public.store_cart_items`
- **Purpose:** Item lines for obsolete Barber B2B cart.
- **Runtime Callers:** 0 callers in backend or frontend.
- **Dependencies:** Child of `store_carts`. Has outbound FKs to `products.id` and `merchants.id`. No inbound FKs.
- **Removal Order:** Can be dropped immediately in Wave 2 (Leaf table).

### 2. `public.store_carts`
- **Purpose:** Server-side carts for Barber B2B order flow.
- **Runtime Callers:** 0 callers.
- **Dependencies:** Parent of `store_cart_items`. Targeted by FK from `orders.store_cart_id` and `checkout_attempts.store_cart_id`. Outbound FK to `store_linked_profiles.id` and `merchants.id`.
- **Removal Order:** Can be dropped in Wave 3 after `store_cart_items` and inbound FKs are dropped.

### 3. `public.store_federated_session_audit_events`
- **Purpose:** Audit log for federated session creation, rotation, and revocation.
- **Runtime Callers:** 0 callers.
- **Dependencies:** Standalone audit table. Zero inbound or outbound FKs.
- **Removal Order:** Can be dropped immediately in Wave 2 (Leaf table).

### 4. `public.store_federated_refresh_tokens`
- **Purpose:** Refresh token storage for federated session family.
- **Runtime Callers:** 0 callers.
- **Dependencies:** Child of `store_federated_session_families`. Has self-referencing FKs (`parent_token_id`, `replaced_by_token_id`).
- **Removal Order:** Can be dropped in Wave 2.

### 5. `public.store_federated_session_families`
- **Purpose:** Session family root for multi-device federated token rotation.
- **Runtime Callers:** 0 callers.
- **Dependencies:** Parent of `store_federated_refresh_tokens`. Outbound FKs to `profiles.id` and `store_linked_profiles.id`.
- **Removal Order:** Can be dropped in Wave 3 after `store_federated_refresh_tokens` is dropped.

### 6. `public.dilmart_customer_handoff_audit_events`
- **Purpose:** Audit logging for customer app handoffs.
- **Runtime Callers:** 0 callers.
- **Dependencies:** Standalone audit table. Zero inbound or outbound FKs.
- **Removal Order:** Can be dropped in Wave 2.

### 7. `public.dilmart_customer_handoffs`
- **Purpose:** Handoff token storage for customer accounts.
- **Runtime Callers:** 0 callers.
- **Dependencies:** Outbound FK to `store_linked_profiles.id` and `profiles.id`.
- **Removal Order:** Can be dropped in Wave 3.

### 8. `public.dilmart_barber_handoff_audit_events`
- **Purpose:** Audit logging for barber app handoffs.
- **Runtime Callers:** 0 callers.
- **Dependencies:** Standalone audit table. Zero inbound or outbound FKs.
- **Removal Order:** Can be dropped in Wave 2.

### 9. `public.dilmart_barber_handoffs`
- **Purpose:** Handoff token storage for barber web integration.
- **Runtime Callers:** 0 callers.
- **Dependencies:** Outbound FK to `store_linked_profiles.id`.
- **Removal Order:** Can be dropped in Wave 3.

### 10. `public.dilmart_barber_web_sessions`
- **Purpose:** Web session tokens for barber portal.
- **Runtime Callers:** 0 callers.
- **Dependencies:** Outbound FK to `store_linked_profiles.id`.
- **Removal Order:** Can be dropped in Wave 2.

### 11. `public.store_linked_profiles`
- **Purpose:** Unified mapping table between external StylAi identities and DilMart `profiles`.
- **Runtime Callers:** 0 callers in backend or frontend.
- **Dependencies:** Targeted by 7 inbound FKs. Outbound FK to `profiles.id`.
- **Removal Order:** Must be the **FINAL table dropped** (Wave 4), after all 10 child tables and all inbound column FKs are cleanly removed.
