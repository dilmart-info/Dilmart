# DILMART — STAGE B LIVE DATABASE CATALOG EVIDENCE APPENDIX
**Generated:** 2026-08-30 | **Status:** READ-ONLY RAW CATALOG SNAPSHOT | **Target DB:** `ztplxqlthuqkuktbznbo`

---

## 1. Executive Catalog Traceability

This appendix contains the sanitized raw catalog outputs extracted from PostgreSQL system catalogs (`pg_proc`, `pg_namespace`, `pg_class`, `pg_policies`, `information_schema.role_table_grants`).

---

## 2. Live Function Catalog & Security Definier Evidence (`pg_proc`)

### Query Source
```sql
SELECT
  n.nspname AS schema,
  p.proname AS name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_result(p.oid) AS result_type,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security_mode,
  pg_get_userbyid(p.proowner) AS owner,
  p.provolatile AS volatility,
  p.proconfig AS proconfig,
  COALESCE((
    SELECT string_agg(grantee || '=' || privilege_type, ', ')
    FROM information_schema.routine_privileges rp
    WHERE rp.routine_schema = n.nspname AND rp.routine_name = p.proname
  ), 'RESTRICTED_TO_OWNER') AS execute_grants
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'app_private')
ORDER BY n.nspname, p.proname;
```

### Summary Counts `[CONFIRMED BY LIVE DB QUERY]`
- **Total Functions in Exposed / App Schemas:** **82 functions**
- **SECURITY DEFINER Functions:** **54 functions**
- **SECURITY INVOKER Functions:** **28 functions**
- **Public Schema Helpers Status:**
  - `to_regprocedure('public.is_admin()')` ➔ `NULL` (0 public copies)
  - `to_regprocedure('public.is_platform_admin()')` ➔ `NULL` (0 public copies)
  - `to_regprocedure('public.is_merchant_member(uuid)')` ➔ `NULL` (0 public copies)
- **App_Private Schema Helpers Status:**
  - `to_regprocedure('app_private.is_admin()')` ➔ `app_private.is_admin()` (PRESENT)
  - `to_regprocedure('app_private.is_platform_admin()')` ➔ `app_private.is_platform_admin()` (PRESENT)
  - `to_regprocedure('app_private.is_merchant_member(uuid)')` ➔ `app_private.is_merchant_member(uuid)` (PRESENT)

---

## 3. Live Place Order & Checkout RPC Authority Verification

| Function OID Identity | Security Mode | Owner | EXECUTE Authority | PostgREST Anon / Auth Status |
|---|:---:|:---:|---|:---:|
| `public.place_order_idempotent(uuid, text, text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text)` | **SECURITY DEFINER** | `postgres` | `service_role` only (REVOKED from PUBLIC, anon, authenticated) | **BLOCKED (401/403)** |
| `public.place_order(text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text)` | **SECURITY DEFINER** | `postgres` | `service_role` only (REVOKED from PUBLIC, anon, authenticated) | **BLOCKED (401/403)** |

---

## 4. Live Table RLS Status & Schema Drift Evidence (`pg_class` & `pg_policies`)

### Query Source
```sql
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  count(p.policyname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
ORDER BY c.relname;
```

### Comparative RLS Counts
- **Live Production Database (`ztplxqlthuqkuktbznbo`):** **71 / 71 active tables have RLS ENABLED** `[CONFIRMED BY LIVE DB QUERY]`.
- **Repository Migration Replay State:** **70 / 71 active tables have RLS ENABLED** `[CONFIRMED BY REPOSITORY CODE]`.
- **Schema Drift Item (F-B-01):** `public.product_import_sessions` has RLS enabled with 4 active policies in live production, but was created without RLS in migration `20260426090000_m20_merchant_productivity_layer.sql`.

### Live Policies on `public.product_import_sessions`
```text
1. Policy: "Admins can manage product_import_sessions"
   Command: ALL | Roles: {public}
   USING: (app_private.is_platform_admin())
   WITH CHECK: (app_private.is_platform_admin())

2. Policy: "Merchants can view own product_import_sessions"
   Command: SELECT | Roles: {authenticated}
   USING: (app_private.is_merchant_member(merchant_id))

3. Policy: "Merchants can insert own product_import_sessions"
   Command: INSERT | Roles: {authenticated}
   WITH CHECK: (app_private.is_merchant_member(merchant_id))

4. Policy: "Merchants can update own product_import_sessions"
   Command: UPDATE | Roles: {authenticated}
   USING: (app_private.is_merchant_member(merchant_id))
   WITH CHECK: (app_private.is_merchant_member(merchant_id))
```

---

## 5. Live Legacy Table & Column Count Evidence

### Query Source
```sql
-- Legacy table row counts
SELECT count(*) FROM public.store_carts; -- Result: 0
SELECT count(*) FROM public.store_cart_items; -- Result: 0
SELECT count(*) FROM public.store_linked_profiles; -- Result: 0
SELECT count(*) FROM public.store_federated_session_families; -- Result: 0
SELECT count(*) FROM public.store_federated_refresh_tokens; -- Result: 0
SELECT count(*) FROM public.store_federated_session_audit_events; -- Result: 0
SELECT count(*) FROM public."DilMart_customer_handoffs"; -- Result: 0
SELECT count(*) FROM public."DilMart_customer_handoff_audit_events"; -- Result: 0
SELECT count(*) FROM public."DilMart_barber_handoffs"; -- Result: 0
SELECT count(*) FROM public."DilMart_barber_handoff_audit_events"; -- Result: 0
SELECT count(*) FROM public."DilMart_barber_web_sessions"; -- Result: 0

-- Legacy column non-null / active counts
SELECT count(*) FILTER (WHERE requires_verified_salon = true) AS salon_count FROM public.products; -- Result: 0
SELECT count(*) FILTER (WHERE "DilMart_barbershop_id" IS NOT NULL) AS barbershop_count FROM public.orders; -- Result: 0
SELECT count(*) FILTER (WHERE "DilMart_user_id" IS NOT NULL) AS user_count FROM public.orders; -- Result: 0
```

### Verification Results `[CONFIRMED BY LIVE DB QUERY]`
- All 11 legacy tables: **0 rows**.
- `products.requires_verified_salon = true`: **0 rows**.
- `orders.DilMart_barbershop_id` (non-null): **0 rows**.
- `orders.DilMart_user_id` (non-null): **0 rows**.
