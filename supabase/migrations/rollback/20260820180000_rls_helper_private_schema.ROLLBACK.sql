-- Rollback for 20260820180000_rls_helper_private_schema.sql
--
-- ⚠ SECURITY-REDUCING — EMERGENCY USE ONLY. ⚠
--
-- This moves the three RLS helpers back into `public`, which is a PostgREST-exposed schema, and
-- restores their PUBLIC EXECUTE grant. That re-creates the `/rest/v1/rpc/is_admin`,
-- `/rest/v1/rpc/is_platform_admin` and `/rest/v1/rpc/is_merchant_member` entry points for anyone
-- holding the public anon key — exactly the surface the migration removed.
--
-- WHEN NOT TO RUN THIS
-- Do NOT run it because the Security Advisor still reports the helpers. Advisor persistence is not
-- evidence that the boundary failed; check instead that app_private is absent from the exposed
-- schemas, that the public RPC routes no longer resolve, and that RLS behaviour is correct, then
-- stop for owner review. Re-exposing an API route to satisfy a linter count would be a regression.
--
-- Run it only for a real regression: the helpers still reachable through exposed PostgREST, RLS
-- access broken, access broadened or narrowed, or dependency/OID corruption.
--
-- WHAT IT PRESERVES
-- Like the migration, this moves the SAME function objects. OIDs are preserved, so the 45 dependent
-- policies follow automatically and no policy DDL is needed here either. `DROP SCHEMA app_private`
-- is deliberately written WITHOUT CASCADE: if anything unexpected has been created in that schema,
-- this script must fail rather than delete it.

BEGIN;

DO $preflight$
DECLARE
  c_helpers CONSTANT text[] := ARRAY[
    'app_private.is_admin()',
    'app_private.is_platform_admin()',
    'app_private.is_merchant_member(uuid)'
  ];
  v_sig     text;
  v_missing text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_private') THEN
    RAISE EXCEPTION 'ROLLBACK PRECHECK FAILED: schema app_private does not exist — nothing to roll back';
  END IF;

  FOREACH v_sig IN ARRAY c_helpers
  LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      v_missing := v_missing || ' ' || v_sig;
    END IF;
  END LOOP;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'ROLLBACK PRECHECK FAILED: helper(s) missing from app_private, refusing a partial rollback:%', v_missing;
  END IF;
END
$preflight$;

-- 1. Move the same objects back into the exposed schema.
ALTER FUNCTION app_private.is_admin()               SET SCHEMA public;
ALTER FUNCTION app_private.is_platform_admin()      SET SCHEMA public;
ALTER FUNCTION app_private.is_merchant_member(uuid) SET SCHEMA public;

-- 2. Restore the exact pre-task ACL: PUBLIC plus the explicit browser/service grants.
GRANT EXECUTE ON FUNCTION public.is_admin(), public.is_platform_admin(),
                          public.is_merchant_member(uuid) TO PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.is_admin() IS NULL;
COMMENT ON FUNCTION public.is_platform_admin() IS NULL;
COMMENT ON FUNCTION public.is_merchant_member(uuid) IS NULL;

-- 3. Remove the schema only if it is empty. No CASCADE, ever.
DO $drop$
DECLARE
  v_left int;
BEGIN
  SELECT count(*) INTO v_left
    FROM pg_class c WHERE c.relnamespace = 'app_private'::regnamespace;
  SELECT v_left + count(*) INTO v_left
    FROM pg_proc p WHERE p.pronamespace = 'app_private'::regnamespace;

  IF v_left > 0 THEN
    RAISE EXCEPTION 'ROLLBACK FAILED: app_private still contains % object(s) — refusing to drop a schema that is not empty (never use CASCADE here)', v_left;
  END IF;

  EXECUTE 'DROP SCHEMA app_private';
  RAISE NOTICE 'rollback complete: helpers returned to public with PUBLIC EXECUTE restored, app_private dropped (SECURITY-REDUCING)';
END
$drop$;

COMMIT;
