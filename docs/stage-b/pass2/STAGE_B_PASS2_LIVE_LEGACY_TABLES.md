# DILMART — STAGE B PASS 2
# LIVE LEGACY TABLES INVENTORY & DISPOSITION

**Generated:** 2026-08-30 | **Updated:** 2026-08-31 | **Status:** READ-ONLY AUDIT BASELINE
**Catalog Source:** `pg_class`, `pg_namespace`, `pg_constraint`, `pg_trigger`, `pg_policies` on `ztplxqlthuqkuktbznbo`
**Authoritative Raw Data:** [`docs/stage-b/pass2/evidence/LIVE_LEGACY_TABLES.json`](file:///d:/DilMart/docs/stage-b/pass2/evidence/LIVE_LEGACY_TABLES.json)

---

## 1. Authoritative Live Legacy Tables Summary (11 Tables)

| # | Exact Lowercase Table Name | Live Table OID | Live Row Count | RLS Enabled | Owner | Inbound FKs | Outbound FKs | Triggers | Classification |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | `public.dilmart_barber_handoff_audit_events` | **19778** | **0** `[CONFIRMED]` | `true` | `postgres` | **0** | **0** | **1** (`trg_reject_barber_handoff_audit_mutation`) | **SAFE TO REMOVE (Migration C)** |
| 2 | `public.dilmart_barber_handoffs` | **19755** | **0** `[CONFIRMED]` | `true` | `postgres` | **0** | **1** (`store_linked_profiles`) | **0** | **SAFE TO REMOVE (Migration D)** |
| 3 | `public.dilmart_barber_web_sessions` | **19800** | **0** `[CONFIRMED]` | `true` | `postgres` | **0** | **1** (`store_linked_profiles`) | **0** | **SAFE TO REMOVE (Migration C)** |
| 4 | `public.dilmart_customer_handoff_audit_events` | **19541** | **0** `[CONFIRMED]` | `true` | `postgres` | **0** | **0** | **1** (`trg_reject_handoff_audit_mutation`) | **SAFE TO REMOVE (Migration C)** |
| 5 | `public.dilmart_customer_handoffs` | **19511** | **0** `[CONFIRMED]` | `true` | `postgres` | **0** | **2** (`store_linked_profiles`, `profiles`) | **0** | **SAFE TO REMOVE (Migration D)** |
| 6 | `public.store_cart_items` | **19002** | **0** `[CONFIRMED]` | `true` | `postgres` | **0** | **3** (`store_carts`, `products`, `merchants`) | **0** | **SAFE TO REMOVE (Migration C)** |
| 7 | `public.store_carts` | **18976** | **0** `[CONFIRMED]` | `true` | `postgres` | **3** (`store_cart_items`, `orders`, `checkout_attempts`) | **2** (`store_linked_profiles`, `merchants`) | **0** | **SAFE TO REMOVE (Migration D)** |
| 8 | `public.store_federated_refresh_tokens` | **19580** | **0** `[CONFIRMED]` | `true` | `postgres` | **2** (Self `parent_token`, `replaced_by`) | **3** (`store_federated_session_families`, Self) | **0** | **SAFE TO REMOVE (Migration C)** |
| 9 | `public.store_federated_session_audit_events` | **19635** | **0** `[CONFIRMED]` | `true` | `postgres` | **0** | **0** | **1** (`trg_reject_federated_session_audit_mutation`) | **SAFE TO REMOVE (Migration C)** |
| 10 | `public.store_federated_session_families` | **19554** | **0** `[CONFIRMED]` | `true` | `postgres` | **1** (`store_federated_refresh_tokens`) | **2** (`profiles`, `store_linked_profiles`) | **0** | **SAFE TO REMOVE (Migration D)** |
| 11 | `public.store_linked_profiles` | **18943** | **0** `[CONFIRMED]` | `true` | `postgres` | **7** (`orders`, `checkout_attempts`, `store_carts`, `dilmart_customer_handoffs`, `dilmart_barber_handoffs`, `dilmart_barber_web_sessions`, `store_federated_session_families`) | **1** (`profiles`) | **0** | **SAFE TO REMOVE (Migration D - Root)** |

---

## 2. Table-by-Table Architectural & Dependency Analysis

### 1. `public.dilmart_barber_handoff_audit_events` (OID: 19778)
- **Purpose:** Audit logging for barber app handoffs.
- **Triggers:** Has trigger `trg_reject_barber_handoff_audit_mutation` invoking `public.reject_barber_handoff_audit_mutation()`.
- **Removal Order:** Dropped in Migration C. The trigger is dropped with the table, allowing the trigger function to be dropped under `RESTRICT`.

### 2. `public.dilmart_barber_handoffs` (OID: 19755)
- **Purpose:** Handoff token storage for barber web integration.
- **Dependencies:** Outbound FK to `store_linked_profiles.id`.
- **Removal Order:** Dropped in Migration D.

### 3. `public.dilmart_barber_web_sessions` (OID: 19800)
- **Purpose:** Web session tokens for barber portal.
- **Dependencies:** Outbound FK to `store_linked_profiles.id`. No inbound FKs.
- **Removal Order:** Dropped in Migration C (Leaf table).

### 4. `public.dilmart_customer_handoff_audit_events` (OID: 19541)
- **Purpose:** Audit logging for customer app handoffs.
- **Triggers:** Has trigger `trg_reject_handoff_audit_mutation` invoking `public.reject_handoff_audit_mutation()`.
- **Removal Order:** Dropped in Migration C.

### 5. `public.dilmart_customer_handoffs` (OID: 19511)
- **Purpose:** Handoff token storage for customer accounts.
- **Dependencies:** Outbound FKs to `store_linked_profiles.id` and `profiles.id`.
- **Removal Order:** Dropped in Migration D.

### 6. `public.store_cart_items` (OID: 19002)
- **Purpose:** Item lines for obsolete Barber B2B cart.
- **Dependencies:** Child of `store_carts`. Outbound FKs to `products.id` and `merchants.id`. Zero inbound FKs.
- **Removal Order:** Dropped in Migration C (Leaf table).

### 7. `public.store_carts` (OID: 18976)
- **Purpose:** Server-side carts for Barber B2B order flow.
- **Dependencies:** Parent of `store_cart_items`. Targeted by FK from `orders.store_cart_id` and `checkout_attempts.store_cart_id`. Outbound FK to `store_linked_profiles.id` and `merchants.id`.
- **Removal Order:** Dropped in Migration D after `store_cart_items` and inbound FKs from `orders`/`checkout_attempts` are dropped.

### 8. `public.store_federated_refresh_tokens` (OID: 19580)
- **Purpose:** Refresh token storage for federated session family.
- **Dependencies:** Child of `store_federated_session_families`. Self-referencing FKs (`parent_token_id`, `replaced_by_token_id`).
- **Removal Order:** Dropped in Migration C.

### 9. `public.store_federated_session_audit_events` (OID: 19635)
- **Purpose:** Audit log for federated session creation, rotation, and revocation.
- **Triggers:** Has trigger `trg_reject_federated_session_audit_mutation` invoking `public.reject_federated_session_audit_mutation()`.
- **Removal Order:** Dropped in Migration C.

### 10. `public.store_federated_session_families` (OID: 19554)
- **Purpose:** Session family root for multi-device federated token rotation.
- **Dependencies:** Parent of `store_federated_refresh_tokens`. Outbound FKs to `profiles.id` and `store_linked_profiles.id`.
- **Removal Order:** Dropped in Migration D after `store_federated_refresh_tokens` is dropped.

### 11. `public.store_linked_profiles` (OID: 18943)
- **Purpose:** Unified mapping table between external StylAi identities and DilMart `profiles`.
- **Dependencies:** Targeted by 7 inbound FKs. Outbound FK to `profiles.id`.
- **Removal Order:** Root parent table. Must be dropped in Migration D as the **FINAL table**, after all child tables and column FKs are cleanly removed.
