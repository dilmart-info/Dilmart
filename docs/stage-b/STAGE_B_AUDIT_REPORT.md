# DILMART — STAGE B DATABASE, SECURITY & MARKETPLACE AUTHORITY AUDIT REPORT
**Generated:** 2026-08-30 | **Status:** READ-ONLY MASTER AUDIT | **Baseline Commit:** `62922bb`

---

## 1. Executive Summary & Target Environment Identity

In accordance with the **DILMART Stage B Master Prompt**, a comprehensive, strictly **READ-ONLY** authority audit was conducted across the entire DILMART repository and live database architecture (`ztplxqlthuqkuktbznbo`).

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

### P0 Findings (Critical Security / Launch Blockers)

#### `F-B-01` (RECLASSIFIED TO P0) — `public.product_import_sessions` Table Exposed Without RLS
- **Exact Target Object:** `public.product_import_sessions` in live database `ztplxqlthuqkuktbznbo`.
- **Live Database Evidence:** `[CONFIRMED BY LIVE DB QUERY]`
  - `relrowsecurity = false`
  - `relforcerowsecurity = false`
  - `Active Policies = 0`
  - `Table Privileges:` `anon` and `authenticated` hold default `SELECT, INSERT, UPDATE, DELETE` privileges over PostgREST Data API.
  - `Row Count:` **0 rows** (no customer/merchant data compromised).
  - `Supabase Security Advisor:` Reports `ERROR — RLS Disabled in Public`.
- **Root Cause:** Table was created in migration `20260426090000_m20_merchant_productivity_layer.sql` without `ENABLE ROW LEVEL SECURITY` or `REVOKE` statements.
- **Remediation Status:** Authored forward-only migration `20260830210000_lock_product_import_sessions_rls.sql` and added Universal RLS gate in branch `fix/stage-b-p0-product-import-rls`.
- **Production Status:** **HOLD** (Awaiting supervisor authorization before applying to linked database).

---

### P1 Findings (High Priority / Deployment Gate)

#### `F-B-DEPLOY-01` — Netlify Production Deployment Trust Boundary Pins Legacy Repository Identity
- **Exact File / Object:** [`.github/workflows/netlify-production-deploy.yml:L100,L118`](file:///d:/DilMart/.github/workflows/netlify-production-deploy.yml#L100-L118)
- **Evidence:** `[CONFIRMED BY CODE] [CONFIRMED BY CI]` The workflow checks `THIS_REPO == "cylendralabs-blip/DilMart-Store"` and rejects runs from `dilmart-info/Dilmart`.
- **Impact:** Blocks automated release of frontend bundles to Netlify production.
- **Recommended Direction:** Update trust boundary repository identity on a dedicated PR branch.

---

### P2 Findings (Medium Priority / Legacy Residue & Hardening)

#### `F-B-02` — 11 Legacy Tables from Decoupled Architectures
- **Exact Objects (Lowercase PostgreSQL Identifiers):**
  `public.store_carts`, `public.store_cart_items`, `public.store_linked_profiles`, `public.store_federated_session_families`, `public.store_federated_refresh_tokens`, `public.store_federated_session_audit_events`, `public.dilmart_customer_handoffs`, `public.dilmart_customer_handoff_audit_events`, `public.dilmart_barber_handoffs`, `public.dilmart_barber_handoff_audit_events`, `public.dilmart_barber_web_sessions`.
- **Live Row Count:** **0 rows across all 11 tables** `[CONFIRMED BY LIVE DB QUERY]`.
- **Proposed Action:** Drop via forward migration using strict topological order and `RESTRICT` semantics.

#### `F-B-03` — Legacy Functions (16+ Candidates) & Column Dependencies
- **Exact Objects:**
  - Legacy Functions: `finalize_customer_handoff`, `logout_all_federated_sessions`, `provision_dilmart_federated_customer`, `redeem_and_create_federated_session`, `redeem_customer_handoff`, `reject_reserved_federated_email`, `resolve_dilmart_federated_customer`, `revoke_federated_sessions_for_identity`, `rotate_federated_refresh_token`, `validate_federated_session_family`, `finalize_barber_handoff`, `verify_barber_web_session`, `redeem_barber_handoff_and_create_session`, `revoke_barber_web_sessions_for_user`, `reject_barber_handoff_audit_mutation`, `place_b2b_cart_order_idempotent`.
  - Legacy Columns: `products.requires_verified_salon` (0 rows true), `orders.dilmart_barbershop_id` (0 non-null rows), `orders.dilmart_user_id` (0 non-null rows).
- **Critical Dependency:** Live `public.place_order` still references `p_store_linked_profile_id`, `p_dilmart_user_id`, and `p_dilmart_barbershop_id`. Orders columns must NOT be dropped until `place_order` is refactored/retired.

#### `F-B-05` — Supabase Advisor Mutable `search_path` Warnings
- **Exact Objects:** `increment_coupon_usage`, `get_order_status`, `get_available_points`, `claim_pending_points`, `handle_profile_points_claim`, `handle_order_status_points`, `set_desktop_quick_links_updated_at`, `app_private.is_admin`.
- **Remediation Direction:** Explicitly pin `search_path = public, pg_temp` in Stage B Pass 2.

---

### Safe Areas Confirmed

1. **Order & Checkout Authority:** Server-side pricing authority in NestJS `CheckoutService` and service-role execution of `place_order_idempotent`.
2. **RLS Helper Isolation:** `is_admin()`, `is_platform_admin()`, and `is_merchant_member(uuid)` reside exclusively in `app_private` (0 public copies).
3. **Tenant Isolation:** No cross-merchant access paths in backend controllers or database policies.
4. **Secret Boundaries:** Zero leaked service-role keys or payment secrets in client bundles.
