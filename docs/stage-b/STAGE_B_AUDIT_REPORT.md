# DILMART — STAGE B DATABASE, SECURITY & MARKETPLACE AUTHORITY AUDIT REPORT
**Generated:** 2026-08-30 | **Status:** READ-ONLY MASTER AUDIT | **Baseline Commit:** `62922bb`

---

## 1. Executive Summary & Target Environment Identity

In accordance with the **DILMART Stage B Master Prompt**, a comprehensive, strictly **READ-ONLY** authority audit was conducted across the entire DILMART repository and database architecture.

### Target Environment Baseline
```text
Repository:           https://github.com/dilmart-info/Dilmart
Git Branch:           main
Baseline Commit:      62922bb56212c62a15a857eb36a46c9802c8c94e
Audit Branch:         audit/stage-b-pass1
Render Service:       dilmart-backend (srv-d1m8s0k9c5sc73flttr0)
Backend Hostname:     dilmart-backend.onrender.com
Supabase Project Ref: ztplxqlthuqkuktbznbo
Environment Role:     DilMart-Store live / production
Frontend Domains:     store.dilmart.org / dilmart.store
Native Mobile App ID: com.DilMart.store
Audit Status:         COMPLETED (Pass 1 — Strictly Read-Only)
```

---

## 2. CI & Automated Pipeline Audit Reality

| Workflow Name | Status for Commit `62922bb` | Audit Evidence & Analysis |
| :--- | :---: | :--- |
| **DilMart Store Launch Critical PR Quality & Security CI** | **GREEN (PASSED)** | `[CONFIRMED BY CI]` All 27 steps passed (Lint, Build, NestJS Unit/Integration Tests, Schema Checks, Security Audits). |
| **Native Foundation CI** | **GREEN (PASSED)** | `[CONFIRMED BY CI]` Android Foundation (AGP 8.2.1 / API 35 / Temurin JDK 21) and iOS Foundation builds succeeded. |
| **Netlify Production Deploy** | **FAILING (REFUSED AT GATE)** | `[CONFIRMED BY CI]` The gated production deployment workflow fails at step `Verify deployment gate -> Enforce trust boundary` due to legacy repository identity hardcoding (see finding `F-B-DEPLOY-01`). |

---

## 3. Authoritative Finding Index

### P0 Findings (Critical Security / Functional Blockers)
* **ZERO P0 Vulnerabilities Active:** `[CONFIRMED BY CODE] [CONFIRMED BY LIVE DB QUERY]`
  - `profiles.role` self-escalation via PostgREST was **CLOSED** in `20260827170552_lock_profiles_browser_update_privileges.sql`.
  - `orders` direct browser modification of financial state was **CLOSED** in `20260828155204_lock_orders_browser_update_privileges.sql`.
  - All mutating `SECURITY DEFINER` functions were restricted to `service_role` in `20260820170000_security_definer_rpc_acl_hardening.sql`.
  - RLS helpers were isolated into `app_private` schema in `20260820180000_rls_helper_private_schema.sql`.

---

### P1 Findings (High Priority / Deployment & Schema Consistency)

#### `F-B-DEPLOY-01` — Netlify Production Deployment Trust Boundary Pins Legacy Repository Identity
- **Exact File / Object:** [`.github/workflows/netlify-production-deploy.yml:L100,L118`](file:///d:/DilMart/.github/workflows/netlify-production-deploy.yml#L100-L118)
- **Evidence:** `[CONFIRMED BY CODE] [CONFIRMED BY CI]`
  ```yaml
  if [ "$THIS_REPO" != "cylendralabs-blip/DilMart-Store" ]; then
    echo "REFUSED: unexpected repository $THIS_REPO"
    exit 1
  fi
  ...
  if [ "$RUN_REPO" != "cylendralabs-blip/DilMart-Store" ]; then
    echo "REFUSED: triggering run head repository is '$RUN_REPO'."
    exit 1
  fi
  ```
- **Impact:** While Launch Critical PR Quality & Security CI and Native Foundation CI succeed, the gated Netlify production deploy workflow refuses execution from `dilmart-info/Dilmart` and exits with failure, preventing automated production release.
- **Recommended Direction:** In a future remediation phase, update the production deployment trust boundary to validate `dilmart-info/Dilmart` without weakening the gate or removing repository identity verification.
- **DB Change Required:** **NO**

#### `F-B-01` — Schema Migration Drift on `product_import_sessions`
- **Exact File / Object:** [`supabase/migrations/20260426090000_m20_merchant_productivity_layer.sql:L6`](file:///d:/DilMart/supabase/migrations/20260426090000_m20_merchant_productivity_layer.sql#L6) and live table `public.product_import_sessions`.
- **Evidence:** `[CONFIRMED BY CODE] [CONFIRMED BY LIVE DB QUERY]`
  The repository migration `20260426090000_m20_merchant_productivity_layer.sql` created the table without `ENABLE ROW LEVEL SECURITY` or policy DDL. In the live production database (`ztplxqlthuqkuktbznbo`), RLS is enabled and the following **4 exact policies** exist:
  1. `Admins can manage product_import_sessions` | Command: `ALL` | Roles: `{public}` | `USING (app_private.is_platform_admin())` | `WITH CHECK (app_private.is_platform_admin())`
  2. `Merchants can view own product_import_sessions` | Command: `SELECT` | Roles: `{authenticated}` | `USING (app_private.is_merchant_member(merchant_id))`
  3. `Merchants can insert own product_import_sessions` | Command: `INSERT` | Roles: `{authenticated}` | `WITH CHECK (app_private.is_merchant_member(merchant_id))`
  4. `Merchants can update own product_import_sessions` | Command: `UPDATE` | Roles: `{authenticated}` | `USING (app_private.is_merchant_member(merchant_id))` | `WITH CHECK (app_private.is_merchant_member(merchant_id))`
- **Impact:** Clean migration replay in fresh environments leaves `product_import_sessions` without RLS policies unless codified (70/71 in replay vs 71/71 in live).
- **Recommended Direction:** Author a forward-only idempotency migration reproducing the exact 4 live policies in repository history.
- **DB Change Required:** **YES** (Forward migration only; no historical rewrite).

---

### P2 Findings (Medium Priority / Legacy Database Residue)

#### `F-B-02` — 11 Legacy Tables from Decoupled Architectures
- **Exact Objects:**
  `public.store_carts`, `public.store_cart_items`, `public.store_linked_profiles`, `public.store_federated_session_families`, `public.store_federated_refresh_tokens`, `public.store_federated_session_audit_events`, `public.DilMart_customer_handoffs`, `public.DilMart_customer_handoff_audit_events`, `public.DilMart_barber_handoffs`, `public.DilMart_barber_handoff_audit_events`, `public.DilMart_barber_web_sessions`.
- **Evidence:** `[CONFIRMED BY CODE] [CONFIRMED BY LIVE DB QUERY]` Full repository audit mapped 0 active runtime callers across frontend, backend, and native mobile apps. Live database queries confirmed 0 active rows across all 11 tables.
- **Impact:** Database schema bloat and maintenance overhead.
- **Recommended Direction:** Execute forward-only drop migration following explicit topological ordering with `RESTRICT` semantics (NO blind `CASCADE`).
- **DB Change Required:** **YES** (Forward `DROP TABLE ... RESTRICT` migration).

#### `F-B-03` — Legacy Database Columns & Obsolete Stored Functions
- **Exact Objects:**
  - Columns: `products.requires_verified_salon` (0 active true rows `[CONFIRMED BY LIVE DB QUERY]`), `orders.DilMart_barbershop_id` (0 non-null rows `[CONFIRMED BY LIVE DB QUERY]`), `orders.DilMart_user_id` (0 non-null rows `[CONFIRMED BY LIVE DB QUERY]`).
  - Functions: `place_b2b_cart_order_idempotent`, `finalize_barber_handoff`, `verify_barber_web_session`, `redeem_barber_handoff_and_create_session`, `revoke_barber_web_sessions_for_user`, `reject_barber_handoff_audit_mutation`.
- **Evidence:** `[CONFIRMED BY CODE] [CONFIRMED BY LIVE DB QUERY]`
- **Impact:** Schema residue with no active business purpose in DILMART.
- **Recommended Direction:** Remove legacy columns and drop unused functions via forward migration using `RESTRICT`.
- **DB Change Required:** **YES**

---

### P3 Findings (Low Priority / Maintenance)

#### `F-B-04` — Test Suite Mock Data Name Residue
- **Exact Objects:** `backend/tests/phase5a-checkout-smoke.test.mjs`, `backend/tests/phase5a-checkout-live.test.mjs`.
- **Evidence:** `[CONFIRMED BY CODE]` Mock fixtures contain string references to legacy table names (`store_carts`, `store_linked_profiles`).
- **Impact:** Non-functional cosmetic residue in test fixtures.
- **Recommended Direction:** Clean up mock object keys during test suite maintenance.
- **DB Change Required:** **NO**

---

### Confirmed Safe Areas

1. **Pricing & Total Authority:** `[CONFIRMED BY CODE]` Server-authoritative checkout in NestJS `CheckoutService` resolves catalog prices directly from `products.price` / `products.discount_price`. Client-submitted unit prices and line totals are discarded.
2. **Atomic Inventory Concurrency:** `[CONFIRMED BY CODE]` Stock decrements occur inside the `place_order_idempotent` transaction. An attempt to order more than available stock raises an exception and rolls back the transaction. Atomic restoration is enforced in `cancel_order_atomic`.
3. **Tenant & Merchant Isolation:** `[CONFIRMED BY CODE]` No cross-merchant access path was identified in the audited backend services or database RLS policies.
4. **Secret Boundaries & Credential Hygiene:** `[CONFIRMED BY CODE]` Full repository scanner check of `src/`, `android/`, and `ios/` confirmed zero leaked service-role keys, database passwords, or payment secrets in client-facing bundles.

---

## 4. Synthesis of 24 Audit Passes

1. **Pass 1 — Schema Inventory:** 72 tables (71 active, 1 dropped), 82 functions, 21 triggers, 4 views `[CONFIRMED BY CODE]`.
2. **Pass 2 — Migration History:** 169 sequential migrations categorized by business domain `[CONFIRMED BY CODE]`.
3. **Pass 3 — Residue Objects:** 11 obsolete tables, 3 legacy columns, and 6 dead functions mapped `[CONFIRMED BY CODE]`.
4. **Pass 4 — Foreign Key Graph:** Inbound/outbound relational constraints verified intact `[CONFIRMED BY CODE]`.
5. **Pass 5 — Order & Checkout Integrity:** Full server-side pricing authority and idempotency locks confirmed `[CONFIRMED BY CODE]`.
6. **Pass 6 — Multi-Merchant Map:** Single-merchant cart verified; multi-merchant transition roadmap documented `[CONFIRMED BY CODE]`.
7. **Pass 7 — Merchant Isolation:** Scoped access via `ScopeResolverService` and `is_merchant_member` verified `[CONFIRMED BY CODE]`.
8. **Pass 8 — Admin Authority:** Protected routes and private schema helpers verified `[CONFIRMED BY CODE]`.
9. **Pass 9 — Customer Auth:** Phone OTP, password authentication, and provisional account protection verified `[CONFIRMED BY CODE]`.
10. **Pass 10 — Product Catalog:** Triple-state publication workflow confirmed `[CONFIRMED BY CODE]`.
11. **Pass 11 — Inventory Engine:** Atomic stock ledger and CAS updates verified `[CONFIRMED BY CODE]`.
12. **Pass 12 — Payment & Finance:** COD snapshots, courier fees, and commission calculations verified `[CONFIRMED BY CODE]`.
13. **Pass 13 — Delivery Integration:** Automated Jenni dispatch and webhook ingress verified `[CONFIRMED BY CODE]`.
14. **Pass 14 — Order Lifecycle:** State machine transitions and cancellation workflows verified `[CONFIRMED BY CODE]`.
15. **Pass 15 — Settlement Engine:** Merchant ledger and batch payout models verified `[CONFIRMED BY CODE]`.
16. **Pass 16 — Promotions Engine:** Coupon validation and usage tracking verified `[CONFIRMED BY CODE]`.
17. **Pass 17 — Storage Security:** Bucket path isolation and public/private policies verified `[CONFIRMED BY CODE]`.
18. **Pass 18 — API Contracts:** 259 backend endpoints audited and verified `[CONFIRMED BY CODE]`.
19. **Pass 19 — Database Privileges:** Definitive lockdown of browser-facing RPCs confirmed `[CONFIRMED BY CODE] [CONFIRMED BY LIVE DB QUERY]`.
20. **Pass 20 — RLS Matrix:** Comprehensive dual-state matrix generated (71/71 Live vs 70/71 Replay) `[CONFIRMED BY LIVE DB QUERY]`.
21. **Pass 21 — Secret Boundaries:** Zero leaks in client and mobile apps `[CONFIRMED BY CODE]`.
22. **Pass 22 — Test Suite:** 27 test suites in Main CI verified green `[CONFIRMED BY CI]`.
23. **Pass 23 — Completion Map:** Single-merchant baseline maturity estimated at ~86% `[ENGINEERING ESTIMATE]`.
24. **Pass 24 — Future Architecture Gaps:** Multi-Merchant and Hub Network roadmap completed `[INFERRED]`.
