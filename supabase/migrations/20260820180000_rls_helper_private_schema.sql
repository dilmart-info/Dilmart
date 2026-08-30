-- DilMart-STORE-RLS-HELPER-PRIVATE-SCHEMA-001
-- Moves the three RLS SECURITY DEFINER helpers out of the PostgREST-exposed `public` schema.
--
-- WHY
-- Task 7B-1 closed 39 of the 46 Security Advisor warnings. The remaining six DB findings are
-- `anon`/`authenticated_security_definer_function_executable` for exactly three functions:
--   public.is_admin(), public.is_platform_admin(), public.is_merchant_member(uuid)
-- They exist solely so RLS policies can ask "is the caller an admin / a member of this merchant?".
-- A repository-wide audit found ZERO direct callers — no frontend `.rpc()`, no backend `.rpc()`, and
-- no function-to-function dependency (0 proc→proc pg_depend rows). Their only dependents are 45 RLS
-- policies, 44 of which are evaluated for role PUBLIC.
--
-- They could not be revoked in Task 7B-1: a policy expression is evaluated with the CALLER's
-- privileges, so removing anon EXECUTE breaks anonymous storefront reads. Proven on a disposable
-- database — `permission denied for function is_platform_admin` on the anonymous
-- `public.merchants` read. Revocation is therefore the wrong tool; the functions must simply stop
-- being reachable as an API route while remaining callable inside policy evaluation.
--
-- WHAT
-- PostgREST exposes only `public` and `graphql_public` on this project (verified live:
-- `PGRST106 — Only the following schemas are exposed: public, graphql_public`). Moving the helpers
-- into a dedicated, non-exposed schema removes the `/rest/v1/rpc/…` entry point entirely, while
-- leaving the database EXECUTE privilege that RLS evaluation genuinely needs.
--
-- WHY THE OBJECTS ARE MOVED RATHER THAN COPIED
-- Policies depend on function OIDs, not on names. `ALTER FUNCTION … SET SCHEMA` relocates the SAME
-- object, so every dependent policy follows automatically. Proven on a disposable database: helper
-- OIDs, policy OIDs, policy count and the pg_depend rows are all identical before and after, and
-- PostgreSQL simply deparses the policies with the new qualifier. That is why this migration
-- contains ZERO policy DDL — no ALTER POLICY, no CREATE POLICY, no DROP POLICY — and why the four
-- Production `product_import_sessions` policies that are missing from this repository's history are
-- irrelevant here: nothing enumerates policies at all.
--
-- No function body is rewritten. There is no CREATE OR REPLACE, so prosrc, language, volatility,
-- SECURITY DEFINER and the pinned search_path are all carried over untouched. SECURITY DEFINER is
-- retained deliberately: converting these helpers to SECURITY INVOKER causes infinite RLS recursion
-- on `profiles` (proven: `stack depth limit exceeded`).
--
-- NO PUBLIC WRAPPERS
-- No `public.is_*` compatibility shims are created. There is nothing to be compatible with, and a
-- wrapper would recreate the exact API entry point this migration removes.
--
-- ACL CONTRACT — browser roles keep DATABASE EXECUTE, and lose API reachability:
--   schema app_private : PUBLIC no USAGE/CREATE; anon/authenticated/service_role USAGE only
--   helpers            : PUBLIC no EXECUTE; anon/authenticated/service_role EXECUTE; owner postgres
-- Schema USAGE is not itself access: with USAGE granted, a browser role still cannot read a table or
-- call an un-granted function in the schema, and cannot CREATE in it (all asserted in
-- backend/scripts/verify-rls-helper-private-schema.sql).
--
-- FAIL CLOSED
-- All three exact identities must exist and `app_private` must not already exist. Partial hardening
-- is not acceptable, and an unexpected pre-existing `app_private` is not silently reused.
--
-- ROLLBACK: supabase/migrations/rollback/20260820180000_rls_helper_private_schema.ROLLBACK.sql
-- SECURITY-REDUCING and emergency-only — it restores the public RPC entry points.

BEGIN;

DO $preflight$
DECLARE
  c_helpers CONSTANT text[] := ARRAY[
    'public.is_admin()',
    'public.is_platform_admin()',
    'public.is_merchant_member(uuid)'
  ];
  v_sig     text;
  v_missing text := '';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_private') THEN
    RAISE EXCEPTION 'PRECHECK FAILED: schema app_private already exists — refusing to reuse an unexpected schema';
  END IF;

  FOREACH v_sig IN ARRAY c_helpers
  LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      v_missing := v_missing || ' ' || v_sig;
    END IF;
  END LOOP;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'PRECHECK FAILED: required helper(s) not found, refusing partial hardening:%', v_missing;
  END IF;

  RAISE NOTICE 'PRECHECK OK: all three helpers present, app_private absent';
END
$preflight$;

-- 1. Dedicated schema holding nothing but these security helpers.
CREATE SCHEMA app_private AUTHORIZATION postgres;

COMMENT ON SCHEMA app_private IS
  'Internal security helpers for RLS policy evaluation. NOT a PostgREST-exposed schema: adding it to the exposed schemas would re-create the /rest/v1/rpc entry points this schema exists to remove. Browser roles hold USAGE only, and EXECUTE on individual helpers, because policy expressions are evaluated with the caller''s privileges.';

-- 2. Schema ACL: no USAGE for PUBLIC, no CREATE for anyone but the owner.
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO anon, authenticated, service_role;

-- 3. Move the SAME function objects. OIDs are preserved, so the 45 dependent policies follow
--    automatically and no policy DDL is required.
ALTER FUNCTION public.is_admin()                    SET SCHEMA app_private;
ALTER FUNCTION public.is_platform_admin()           SET SCHEMA app_private;
ALTER FUNCTION public.is_merchant_member(uuid)      SET SCHEMA app_private;

-- 4. Deterministic function ACL — set explicitly rather than inherited, so a replayed database
--    reaches the same target state as Production regardless of its starting grants.
REVOKE EXECUTE ON FUNCTION app_private.is_admin(), app_private.is_platform_admin(),
                            app_private.is_merchant_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.is_admin(), app_private.is_platform_admin(),
                          app_private.is_merchant_member(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION app_private.is_admin() IS
  'RLS helper: is the current user an admin? SECURITY DEFINER to avoid recursive evaluation of the profiles policies. Not callable through the Data API — app_private is not an exposed schema.';
COMMENT ON FUNCTION app_private.is_platform_admin() IS
  'RLS helper: is the current user a platform admin (super_admin or admin)? SECURITY DEFINER to avoid recursive evaluation of the profiles policies. Not callable through the Data API.';
COMMENT ON FUNCTION app_private.is_merchant_member(uuid) IS
  'RLS helper: is the current user a member of the given merchant? SECURITY DEFINER to avoid recursive evaluation of the merchant_users policies. Not callable through the Data API.';

-- 5. Fail closed on the resulting state.
DO $verify$
DECLARE
  v_moved int;
  v_left  int;
  v_public_exec int;
  v_browser_exec int;
BEGIN
  SELECT count(*) INTO v_moved
    FROM pg_proc p WHERE p.pronamespace = 'app_private'::regnamespace
     AND p.proname IN ('is_admin', 'is_platform_admin', 'is_merchant_member');
  IF v_moved <> 3 THEN
    RAISE EXCEPTION 'ASSERT FAILED: %/3 helpers present in app_private', v_moved;
  END IF;

  SELECT count(*) INTO v_left
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('is_admin', 'is_platform_admin', 'is_merchant_member');
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'ASSERT FAILED: % helper(s) still in the exposed public schema', v_left;
  END IF;

  IF has_schema_privilege('public', 'app_private', 'USAGE')
     OR has_schema_privilege('anon', 'app_private', 'CREATE')
     OR has_schema_privilege('authenticated', 'app_private', 'CREATE')
     OR has_schema_privilege('service_role', 'app_private', 'CREATE') THEN
    RAISE EXCEPTION 'ASSERT FAILED: app_private schema privileges are wider than intended';
  END IF;

  -- Positive check too: has_function_privilege() inspects only the function ACL and ignores schema
  -- USAGE, so without this a database missing the schema grant would pass every other assertion and
  -- then fail at runtime with "permission denied for schema app_private" — precisely the anonymous
  -- storefront breakage this migration exists to avoid.
  IF NOT has_schema_privilege('anon', 'app_private', 'USAGE')
     OR NOT has_schema_privilege('authenticated', 'app_private', 'USAGE')
     OR NOT has_schema_privilege('service_role', 'app_private', 'USAGE') THEN
    RAISE EXCEPTION 'ASSERT FAILED: anon/authenticated/service_role lack USAGE on app_private — RLS evaluation would fail at runtime';
  END IF;

  SELECT count(*) INTO v_public_exec
    FROM pg_proc p WHERE p.pronamespace = 'app_private'::regnamespace
     AND EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                  WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE');
  IF v_public_exec <> 0 THEN
    RAISE EXCEPTION 'ASSERT FAILED: % helper(s) still grant EXECUTE to PUBLIC', v_public_exec;
  END IF;

  SELECT count(*) INTO v_browser_exec
    FROM pg_proc p WHERE p.pronamespace = 'app_private'::regnamespace
     AND p.proname IN ('is_admin', 'is_platform_admin', 'is_merchant_member')
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF v_browser_exec <> 3 THEN
    RAISE EXCEPTION 'ASSERT FAILED: only %/3 helpers are executable by anon/authenticated/service_role — RLS evaluation would break', v_browser_exec;
  END IF;

  RAISE NOTICE 'ASSERT OK: 3 helpers relocated to app_private, none left in public, PUBLIC has no USAGE or EXECUTE, browser roles retain EXECUTE for RLS';
END
$verify$;

COMMIT;
