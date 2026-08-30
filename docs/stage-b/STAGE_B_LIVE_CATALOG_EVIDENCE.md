# DILMART — STAGE B LIVE DATABASE CATALOG EVIDENCE APPENDIX
**Generated:** 2026-08-30 | **Status:** READ-ONLY RAW CATALOG SNAPSHOT | **Target DB:** `ztplxqlthuqkuktbznbo`

---

## 1. Executive Catalog Traceability

This appendix contains the sanitized raw catalog outputs extracted directly from PostgreSQL system catalogs (`pg_proc`, `pg_namespace`, `pg_class`, `pg_policies`, `pg_roles`, `aclexplode()`).

---

## 2. Live Function Catalog & Security Definier Evidence (`pg_proc`)

### Verified Counts by Schema `[CONFIRMED BY LIVE DB QUERY]`
- **`public` schema:** **80 functions** (67 SECURITY DEFINER, 13 SECURITY INVOKER)
- **`app_private` schema:** **3 functions** (3 SECURITY DEFINER, 0 SECURITY INVOKER)
- **`public + app_private` Total:** **83 functions** (70 SECURITY DEFINER, 13 SECURITY INVOKER)
- **`auth` schema:** **4 functions**
- **Total across Database:** **87 functions**

### Public Schema Helpers Verification
```text
to_regprocedure('public.is_admin()')               -> NULL (0 public copies) [CONFIRMED BY LIVE DB QUERY]
to_regprocedure('public.is_platform_admin()')      -> NULL (0 public copies) [CONFIRMED BY LIVE DB QUERY]
to_regprocedure('public.is_merchant_member(uuid)') -> NULL (0 public copies) [CONFIRMED BY LIVE DB QUERY]

to_regprocedure('app_private.is_admin()')               -> app_private.is_admin() [PRESENT] [CONFIRMED BY LIVE DB QUERY]
to_regprocedure('app_private.is_platform_admin()')      -> app_private.is_platform_admin() [PRESENT] [CONFIRMED BY LIVE DB QUERY]
to_regprocedure('app_private.is_merchant_member(uuid)') -> app_private.is_merchant_member(uuid) [PRESENT] [CONFIRMED BY LIVE DB QUERY]
```

---

## 3. Live Place Order & Checkout Authority Verification

In the live database (`ztplxqlthuqkuktbznbo`), there is **exactly ONE live `public.place_order`** and **ONE live `public.place_order_idempotent`**:

| Function OID Identity | Security Mode | Owner | search_path | EXECUTE Authority (`p.proacl`) | PostgREST Anon / Auth Status |
|---|:---:|:---:|:---:|---|:---:|
| `public.place_order_idempotent(uuid, text, text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text)` | **SECURITY DEFINER** | `postgres` | `public, pg_temp` | `service_role` only (REVOKED from PUBLIC, anon, authenticated) | **BLOCKED (401/403)** |
| `public.place_order(text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text)` | **SECURITY DEFINER** | `postgres` | `public, pg_temp` | `service_role` only (REVOKED from PUBLIC, anon, authenticated) | **BLOCKED (401/403)** |

> [!WARNING]
> **Live `place_order` Body Dependency:** The current live `place_order` function body still accepts and references legacy parameters (`p_store_linked_profile_id`, `p_dilmart_user_id`, `p_dilmart_barbershop_id`, `p_segment`, `p_business_type`). Dropping `orders.dilmart_user_id` or `orders.dilmart_barbershop_id` before refactoring or retiring `place_order` will break this function.

---

## 4. Live Table RLS Status & P0 Vulnerability Evidence (`public.product_import_sessions`)

### Live RLS Counts
- **Total Public Tables:** **71 tables**
- **RLS ENABLED:** **70 tables** `[CONFIRMED BY LIVE DB QUERY]`
- **RLS DISABLED:** **1 table** (`public.product_import_sessions`) `[CONFIRMED BY LIVE DB QUERY]`

### Live State of `public.product_import_sessions`
```text
Table Name:          public.product_import_sessions
relrowsecurity:      false
relforcerowsecurity: false
Active Policies:     0
Current Row Count:   0

Effective Table Privileges:
  anon:          SELECT=YES, INSERT=YES, UPDATE=YES, DELETE=YES
  authenticated: SELECT=YES, INSERT=YES, UPDATE=YES, DELETE=YES
  service_role:  SELECT=YES, INSERT=YES, UPDATE=YES, DELETE=YES

Supabase Security Advisor Classification:
  ERROR — RLS Disabled in Public
  "Table public.product_import_sessions is public, but RLS has not been enabled."
```

---

## 5. Live Legacy Table & Column Count Evidence (Lowercase PostgreSQL Identifiers)

### Query Source
```sql
-- Legacy table row counts
SELECT count(*) FROM public.store_carts; -- Result: 0 [CONFIRMED BY LIVE DB QUERY]
SELECT count(*) FROM public.store_cart_items; -- Result: 0 [CONFIRMED BY LIVE DB QUERY]
SELECT count(*) FROM public.store_linked_profiles; -- Result: 0 [CONFIRMED BY LIVE DB QUERY]
SELECT count(*) FROM public.store_federated_session_families; -- Result: 0 [CONFIRMED BY LIVE DB QUERY]
SELECT count(*) FROM public.store_federated_refresh_tokens; -- Result: 0 [CONFIRMED BY LIVE DB QUERY]
SELECT count(*) FROM public.store_federated_session_audit_events; -- Result: 0 [CONFIRMED BY LIVE DB QUERY]
SELECT count(*) FROM public.dilmart_customer_handoffs; -- Result: 0 [CONFIRMED BY LIVE DB QUERY]
SELECT count(*) FROM public.dilmart_customer_handoff_audit_events; -- Result: 0 [CONFIRMED BY LIVE DB QUERY]
SELECT count(*) FROM public.dilmart_barber_handoffs; -- Result: 0 [CONFIRMED BY LIVE DB QUERY]
SELECT count(*) FROM public.dilmart_barber_handoff_audit_events; -- Result: 0 [CONFIRMED BY LIVE DB QUERY]
SELECT count(*) FROM public.dilmart_barber_web_sessions; -- Result: 0 [CONFIRMED BY LIVE DB QUERY]

-- Legacy column non-null / active counts
SELECT count(*) FILTER (WHERE requires_verified_salon = true) AS salon_count FROM public.products; -- Result: 0 [CONFIRMED BY LIVE DB QUERY]
SELECT count(*) FILTER (WHERE dilmart_barbershop_id IS NOT NULL) AS barbershop_count FROM public.orders; -- Result: 0 [CONFIRMED BY LIVE DB QUERY]
SELECT count(*) FILTER (WHERE dilmart_user_id IS NOT NULL) AS user_count FROM public.orders; -- Result: 0 [CONFIRMED BY LIVE DB QUERY]
```

---

## 6. Supabase Security Advisor Findings Catalog

| Severity | Issue Type | Target Object | Impact & Risk Analysis | Recommended Remediation |
| :---: | :--- | :--- | :--- | :--- |
| **P0** | **RLS Disabled in Public** | `public.product_import_sessions` | Anonymous/authenticated users hold default CRUD privileges over Data API. (Currently 0 rows). | Apply forward-only migration `20260830210000_lock_product_import_sessions_rls.sql`. |
| **P2** | **Mutable `search_path`** | `public.increment_coupon_usage` | Function created without explicit `SET search_path`. Restricted to `service_role`. | Pin `search_path = public, pg_temp` in Stage B Pass 2. |
| **P2** | **Mutable `search_path`** | `public.get_order_status` | Function created without explicit `SET search_path`. Restricted to `service_role`. | Pin `search_path = public, pg_temp` in Stage B Pass 2. |
| **P2** | **Mutable `search_path`** | `public.get_available_points` | Function created without explicit `SET search_path`. Restricted to `service_role`. | Pin `search_path = public, pg_temp` in Stage B Pass 2. |
| **P2** | **Mutable `search_path`** | `public.claim_pending_points` | Function created without explicit `SET search_path`. Restricted to `service_role`. | Pin `search_path = public, pg_temp` in Stage B Pass 2. |
| **P2** | **Mutable `search_path`** | `public.handle_profile_points_claim` | Trigger function without explicit `SET search_path`. | Pin `search_path = public, pg_temp` in Stage B Pass 2. |
| **P2** | **Mutable `search_path`** | `public.handle_order_status_points` | Trigger function without explicit `SET search_path`. | Pin `search_path = public, pg_temp` in Stage B Pass 2. |
| **P2** | **Mutable `search_path`** | `public.set_desktop_quick_links_updated_at` | Trigger function without explicit `SET search_path`. | Pin `search_path = public, pg_temp` in Stage B Pass 2. |
| **P2** | **Mutable `search_path`** | `app_private.is_admin` | Helper function in `app_private` without explicit `SET search_path`. Uses fully qualified identifiers. | Pin `search_path = public, pg_temp` in Stage B Pass 2. |
