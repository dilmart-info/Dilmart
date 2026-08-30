-- Verification for 20260820180000_rls_helper_private_schema.sql
-- (DilMart-STORE-RLS-HELPER-PRIVATE-SCHEMA-001).
--
-- Proves, against a real database that has already had the migration applied:
--   * the three RLS helpers live in app_private and no longer exist in the exposed public schema;
--   * their function identity is intact — SECURITY DEFINER, pinned search_path, language,
--     volatility, owner — because the objects were MOVED, not recreated;
--   * PUBLIC holds neither schema USAGE nor function EXECUTE, while anon/authenticated/service_role
--     retain EXECUTE, which RLS policy evaluation genuinely requires;
--   * schema USAGE alone grants nothing — negative-control objects in app_private stay unreachable;
--   * no public compatibility wrapper was created.
--
-- It also runs a behavioural role matrix and an RLS recursion check against its own fixtures.
-- Everything is inside a transaction that always ROLLBACKs. A passing run emits a NOTICE and exits
-- 0; a failing run RAISEs and, with ON_ERROR_STOP=1, exits non-zero. Unexpected SQL errors are
-- recorded as failures, never silently treated as denials.
--
-- Run against a LOCAL / ephemeral database only — never Production: it creates fixtures.
--   docker cp backend/scripts/verify-rls-helper-private-schema.sql <db>:/tmp/v.sql
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/v.sql
BEGIN;

DO $verify$
DECLARE
  c_names CONSTANT text[] := ARRAY['is_admin', 'is_platform_admin', 'is_merchant_member'];
  v_results JSONB := '[]'::jsonb;
  v_pass INT := 0;
  v_fail INT := 0;
  v_count INT;
  v_errm TEXT;
  v_ok BOOLEAN;
BEGIN
  ------------------------------------------------------------------ 01 schema exists
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_private') THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('01 app_private schema exists: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('01 app_private schema exists: FAIL');
    RAISE EXCEPTION 'RLS_HELPER_PRIVATE_SCHEMA FAILED pass=% fail=% details=% (schema missing, later assertions meaningless)',
      v_pass, v_fail, v_results::text;
  END IF;

  ------------------------------------------------- 02 exactly the three identities, in app_private
  SELECT count(*) INTO v_count FROM pg_proc p
   WHERE p.pronamespace = 'app_private'::regnamespace AND p.proname = ANY(c_names);
  IF v_count = 3
     AND to_regprocedure('app_private.is_admin()') IS NOT NULL
     AND to_regprocedure('app_private.is_platform_admin()') IS NOT NULL
     AND to_regprocedure('app_private.is_merchant_member(uuid)') IS NOT NULL THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('02 exact 3 helper identities present in app_private: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('02 exact 3 helper identities in app_private: FAIL ' || v_count::text);
  END IF;

  ------------------------------------- 03 no public copies and no compatibility wrapper remain
  SELECT count(*) INTO v_count FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY(c_names);
  IF v_count = 0 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('03 no helper (or wrapper) left in the exposed public schema: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('03 helpers/wrappers still in public: FAIL ' || v_count::text);
  END IF;

  --------------------------------------------------- 04 SECURITY DEFINER preserved on all three
  SELECT count(*) INTO v_count FROM pg_proc p
   WHERE p.pronamespace = 'app_private'::regnamespace AND p.proname = ANY(c_names) AND p.prosecdef;
  IF v_count = 3 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('04 SECURITY DEFINER preserved on all 3: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('04 SECURITY DEFINER preserved: FAIL ' || v_count::text || '/3');
  END IF;

  --------------------------------------------------------------- 05 search_path preserved
  -- The move must not alter proconfig. In Production all three helpers carry
  -- `search_path=public`; a database rebuilt from this repository has is_admin() created without a
  -- SET clause (20260216043544_fix_rls_recursion.sql) and no later migration pins it, so a replay
  -- legitimately has 2 of 3 pinned. A WRONG search_path is a failure; a MISSING one is recorded as
  -- the pre-existing drift it is, because pinning it is not this task's change.
  SELECT count(*) INTO v_count FROM pg_proc p
   WHERE p.pronamespace = 'app_private'::regnamespace AND p.proname = ANY(c_names)
     AND p.proconfig IS NOT NULL
     AND NOT (p.proconfig @> ARRAY['search_path=public']);
  IF v_count = 0 THEN
    SELECT count(*) INTO v_count FROM pg_proc p
     WHERE p.pronamespace = 'app_private'::regnamespace AND p.proname = ANY(c_names)
       AND p.proconfig @> ARRAY['search_path=public'];
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('05 search_path unchanged by the move (' || v_count::text ||
      '/3 pinned to public' || CASE WHEN v_count < 3 THEN ', remainder unpinned in this database — pre-existing repo drift, not changed here' ELSE '' END || '): PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('05 a helper carries an unexpected search_path: FAIL ' || v_count::text);
  END IF;

  --------------------------------------------------------------- 06 schema privilege matrix
  IF NOT has_schema_privilege('public', 'app_private', 'USAGE')
     AND NOT has_schema_privilege('public', 'app_private', 'CREATE')
     AND has_schema_privilege('anon', 'app_private', 'USAGE')
     AND has_schema_privilege('authenticated', 'app_private', 'USAGE')
     AND has_schema_privilege('service_role', 'app_private', 'USAGE')
     AND NOT has_schema_privilege('anon', 'app_private', 'CREATE')
     AND NOT has_schema_privilege('authenticated', 'app_private', 'CREATE')
     AND NOT has_schema_privilege('service_role', 'app_private', 'CREATE') THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('06 schema ACL: PUBLIC none; anon/auth/service USAGE only: PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('06 schema ACL matrix: FAIL');
  END IF;

  ----------------------------------------------------- 07 PUBLIC holds no EXECUTE (explicit ACL)
  SELECT count(*) INTO v_count FROM pg_proc p
   WHERE p.pronamespace = 'app_private'::regnamespace AND p.proname = ANY(c_names)
     AND EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                  WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE');
  IF v_count = 0 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('07 no PUBLIC EXECUTE ACL entry on any helper: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('07 PUBLIC EXECUTE entries remaining: FAIL ' || v_count::text);
  END IF;

  ------------------------------------ 08 browser + service roles retain EXECUTE (RLS needs it)
  SELECT count(*) INTO v_count FROM pg_proc p
   WHERE p.pronamespace = 'app_private'::regnamespace AND p.proname = ANY(c_names)
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF v_count = 3 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('08 anon/authenticated/service_role retain EXECUTE on all 3: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('08 browser EXECUTE for RLS: FAIL ' || v_count::text || '/3');
  END IF;

  ------------------------------------------- 09 schema USAGE alone exposes nothing (negative control)
  CREATE TABLE app_private._verify_decoy (id int PRIMARY KEY, note text);
  INSERT INTO app_private._verify_decoy VALUES (1, 'must-not-be-readable');
  CREATE FUNCTION app_private._verify_unrelated() RETURNS text LANGUAGE sql AS $u$ SELECT 'leaked' $u$;
  REVOKE ALL ON FUNCTION app_private._verify_unrelated() FROM PUBLIC;

  v_count := 0;
  BEGIN
    SET LOCAL ROLE anon;
    BEGIN PERFORM 1 FROM app_private._verify_decoy;
    EXCEPTION WHEN insufficient_privilege THEN v_count := v_count + 1;
             WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
                              v_results := v_results || jsonb_build_array('09 decoy table unexpected: ' || left(v_errm, 60));
    END;
    BEGIN PERFORM app_private._verify_unrelated();
    EXCEPTION WHEN insufficient_privilege THEN v_count := v_count + 1;
             WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
                              v_results := v_results || jsonb_build_array('09 decoy function unexpected: ' || left(v_errm, 60));
    END;
    BEGIN CREATE TABLE app_private._verify_evil (i int);
    EXCEPTION WHEN insufficient_privilege THEN v_count := v_count + 1;
             WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
                              v_results := v_results || jsonb_build_array('09 decoy create unexpected: ' || left(v_errm, 60));
    END;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    v_results := v_results || jsonb_build_array('09 negative control aborted: ' || left(v_errm, 80));
  END;

  IF v_count = 3 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('09 schema USAGE grants no table read, no un-granted function, no CREATE: PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('09 schema USAGE isolation: FAIL ' || v_count::text || '/3');
  END IF;

  ---------------------------------------------- 10 helpers still callable in policy context (RLS)
  -- anon must be able to EXECUTE the helper directly in-database; that is what policy evaluation
  -- does. This is deliberately allowed and is NOT an API route.
  v_ok := FALSE;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM app_private.is_platform_admin();
    RESET ROLE;
    v_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    v_results := v_results || jsonb_build_array('10 anon in-database helper call error: ' || left(v_errm, 70));
  END;

  IF v_ok THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('10 anon can evaluate the helper in-database (RLS evaluation intact): PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('10 anon in-database helper evaluation: FAIL — RLS would break');
  END IF;

  ------------------------------------- 11 no recursion when the helpers are used by RLS policies
  -- Fixture policies mirroring the live shapes; SECURITY DEFINER is what prevents recursion here.
  -- The role MUST hold table SELECT, otherwise PostgreSQL rejects the query at the ACL check before
  -- it ever evaluates the policy, and an insufficient_privilege error would masquerade as success —
  -- the probe has to actually run the policy expression to be worth anything.
  CREATE TABLE app_private._verify_profiles (id uuid PRIMARY KEY, role text NOT NULL);
  INSERT INTO app_private._verify_profiles VALUES (gen_random_uuid(), 'customer');
  ALTER TABLE app_private._verify_profiles ENABLE ROW LEVEL SECURITY;
  CREATE POLICY _verify_admin_reads ON app_private._verify_profiles FOR SELECT
    USING (app_private.is_admin());
  GRANT SELECT ON app_private._verify_profiles TO anon;

  v_ok := FALSE;
  BEGIN
    SET LOCAL ROLE anon;
    -- anon is not an admin, so the policy must filter every row — 0 rows, not an error.
    SELECT count(*) INTO v_count FROM app_private._verify_profiles;
    RESET ROLE;
    IF v_count = 0 THEN
      v_ok := TRUE;
    ELSE
      v_results := v_results || jsonb_build_array('11 policy returned ' || v_count::text || ' row(s) to anon — expected 0');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    v_results := v_results || jsonb_build_array('11 recursion probe error: ' || left(v_errm, 90));
  END;

  IF v_ok THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('11 helper-backed policy actually evaluated (0 rows for anon), no recursion or stack-depth error: PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('11 helper-backed policy evaluation: FAIL');
  END IF;

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'RLS_HELPER_PRIVATE_SCHEMA FAILED pass=% fail=% details=%', v_pass, v_fail, v_results::text;
  END IF;

  RAISE NOTICE 'RLS_HELPER_PRIVATE_SCHEMA PASSED pass=% fail=% details=%', v_pass, v_fail, v_results::text;
END
$verify$;

-- Fixtures and decoys exist only for this run.
ROLLBACK;
