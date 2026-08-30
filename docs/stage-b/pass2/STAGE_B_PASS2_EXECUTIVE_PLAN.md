# DILMART — STAGE B PASS 2
# EXECUTIVE LEGACY AUTHORITY & DEPENDENCY CLOSURE PLAN

**Generated:** 2026-08-30 | **Status:** PLANNING & AUDIT BASELINE (READ-ONLY)
**Authoritative Baseline Commit:** `355675694b7dc5899125a20b05920b11b95547ae` on `main`
**Target Supabase Project:** `ztplxqlthuqkuktbznbo` (DilMart-Store Live)
**Evidence Directory:** [`docs/stage-b/pass2/evidence/`](file:///d:/DilMart/docs/stage-b/pass2/evidence/)

---

## 1. Executive Summary & Core Verdicts

Stage B Pass 2 establishes the machine-verified, catalog-derived master plan for retiring the StylAi / Barber / Salon / Federated / Handoff / B2B legacy architecture from DILMART.
All findings in this plan are derived from direct inspection of the live PostgreSQL system catalogs (`pg_proc`, `pg_class`, `pg_attribute`, `pg_constraint`, `aclexplode()`) and full repository static/runtime tracing.

### Key Metrics Summary

| Category | Total Identified | Safe to Remove (Dead) | Remove After Refactor (Blocked) | Retain / Active Authority | Review / Defer |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Legacy Tables** | **11** | **11** (0 rows live) | 0 | 0 | 0 |
| **Legacy Columns** | **8** | **5** (0 non-null) | **3** (in `orders`) | 0 | 0 |
| **Legacy / Checked Functions** | **21** | **19** (0 runtime callers) | **1** (`place_order`) | **1** (`place_order_idempotent`) | 0 |
| **Non-Empty Tables** | **0** | — | — | — | 0 rows across all 11 tables |

---

## 2. Strategic Conclusions by Domain

### A. Active Checkout & `place_order` (CRITICAL BLOCKER)
- `public.place_order` is **ACTIVELY REACHABLE** at runtime. It is the core execution body called by `place_order_idempotent` and fallback checkout controllers.
- Its current PostgreSQL function body references legacy parameters (`p_store_linked_profile_id`, `p_dilmart_user_id`, `p_dilmart_barbershop_id`, `p_segment`, `p_business_type`) and assigns them to columns in `public.orders`.
- **Verdict:** `public.place_order` **MUST NOT BE DROPPED**. It must be **REFACTORED** in Migration 1 (Wave 0) to remove legacy parameter signatures and column writes before `orders` legacy columns can be dropped.

### B. `checkout_attempts` Domain
- `checkout_attempts.store_cart_id` and `checkout_attempts.store_linked_profile_id` have 0 non-null rows in production, 0 references in `place_order_idempotent`, 0 callers in backend NestJS, and 0 callers in frontend.
- **Verdict:** **SAFE TO REMOVE** after dropping their foreign key constraints.

### C. Store Cart Domain (`store_carts`, `store_cart_items`)
- Dedicated to the obsolete Barber B2B order model. Replaced entirely by client-side cart + atomic checkout lines in modern DILMART.
- Live row counts: `store_carts` = 0, `store_cart_items` = 0.
- **Verdict:** **SAFE TO REMOVE** in Wave 4.

### D. Linked Profile Domain (`store_linked_profiles`)
- Central hub of the former StylAi Barber bridge. Replaced by direct Supabase Auth `profiles` in modern DILMART.
- Live row count: `store_linked_profiles` = 0.
- **Verdict:** **SAFE TO REMOVE** in Wave 6 (after all child handoff, federated, and cart FKs are dropped).

### E. Federated Session Domain (`store_federated_*`)
- 3 tables (`store_federated_session_families`, `store_federated_refresh_tokens`, `store_federated_session_audit_events`) and 9 associated RPC functions.
- Modern DILMART native and web apps use Supabase Auth and JWT actor resolution directly (`isFederated = false`).
- Live row counts: 0 across all 3 tables.
- **Verdict:** **SAFE TO REMOVE** in Wave 2 and Wave 3.

### F. Handoff Domain (`dilmart_*_handoff*`, `dilmart_barber_web_sessions`)
- 5 tables and 7 functions designed for interoperability with historical Barber web apps.
- Live row counts: 0 across all 5 tables.
- **Verdict:** **SAFE TO REMOVE** in Wave 2 and Wave 3.

---

## 3. High-Level Future Migration Waves (Planned Sequence)

```mermaid
graph TD
    W0["Wave 0: Runtime & Function Refactor (place_order)"] --> W1["Wave 1: Dead Leaf Functions (19 Functions)"]
    W1 --> W2["Wave 2: Leaf Audit & Session Tables (6 Tables)"]
    W2 --> W3["Wave 3: Intermediate Parent Tables (4 Tables)"]
    W3 --> W4["Wave 4: Root Parent Table (store_linked_profiles)"]
    W4 --> W5["Wave 5: Legacy Column Drops (8 Columns)"]
    W5 --> W6["Wave 6: Security, Grants & Dead Code Cleanup"]
```

---

## 4. Absolute Safety & Governance Boundary

- **Pass 2 Status:** **READ-ONLY PLANNING**.
- **Production Status:** Zero DDL/DML executed. No migrations created or applied.
- **Next Step:** Await supervisor review and authorization before authoring Pass 3 execution migrations.
