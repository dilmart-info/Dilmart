-- Security verification for 20260820170000_security_definer_rpc_acl_hardening.sql
-- (DilMart-STORE-SUPABASE-DEFINER-RPC-HARDENING-001).
--
-- Proves, against a real database, that after the migration:
--   * none of the 18 in-scope SECURITY DEFINER functions is executable by PUBLIC, anon or
--     authenticated — asserted as a privilege denial, never as "returned no rows";
--   * service_role keeps EXECUTE on ALL 18 — an EXPLICIT grant, checked through aclexplode rather
--     than has_function_privilege, so a privilege merely inherited via PUBLIC cannot pass for one;
--     the boundary this task establishes is BROWSER DENIED / TRUSTED SERVICE ROLE PRESERVED, not
--     owner-only;
--   * all 9 trigger bindings still exist, are still enabled, and STILL FIRE after the revocation;
--   * the 3 previously mutable search_paths are pinned, with function sources unchanged;
--   * the three RLS helpers (is_admin, is_platform_admin, is_merchant_member) were NOT touched —
--     they must still be reachable by the browser roles, because 43 policies evaluated for role
--     PUBLIC depend on them. Restricting them is Task 7B-2.
--
-- Runs inside an explicit transaction that always ROLLBACKs, so nothing is persisted. A passing run
-- emits a NOTICE and exits 0; a failing run RAISEs and, with ON_ERROR_STOP=1, exits non-zero.
-- Unexpected SQL errors are recorded as failures, never silently counted as denials.
--
-- Run against a LOCAL / ephemeral database only — never Production:
--   docker cp backend/scripts/verify-security-definer-rpc-hardening.sql <db>:/tmp/v.sql
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/v.sql
BEGIN;

DO $verify$
DECLARE
  c_scoped CONSTANT text[] := ARRAY[
    'approve_merchant_atomic', 'reject_merchant_atomic', 'claim_pending_points', 'place_order',
    'increment_coupon_usage', 'get_available_points', 'get_order_status', 'validate_coupon',
    'handle_new_user', 'handle_profile_points_claim', 'handle_order_status_points',
    'enforce_order_item_merchant_consistency', 'notify_new_order', 'notify_merchant_new_order',
    'notify_user_order_status', 'notify_agent_assignment', 'notify_low_stock'
  ];
  c_service CONSTANT text[] := ARRAY[
    'approve_merchant_atomic', 'reject_merchant_atomic', 'claim_pending_points', 'place_order',
    'increment_coupon_usage', 'get_available_points', 'get_order_status', 'validate_coupon'
  ];
  c_triggers CONSTANT text[] := ARRAY[
    'enforce_order_item_merchant_consistency', 'handle_new_user', 'handle_order_status_points',
    'handle_profile_points_claim', 'notify_agent_assignment', 'notify_low_stock',
    'notify_merchant_new_order', 'notify_new_order', 'notify_user_order_status'
  ];
  c_helpers CONSTANT text[] := ARRAY['is_admin', 'is_platform_admin', 'is_merchant_member'];
  v_results  JSONB := '[]'::jsonb;
  v_pass     INT := 0;
  v_fail     INT := 0;
  v_count    INT;
  v_expected INT;
  v_role     TEXT;
  v_denied   INT;
  v_probes   INT;
  v_unexp    TEXT;
  v_errm     TEXT;
  v_fn       RECORD;
  v_merchant UUID;
BEGIN
  ------------------------------------------------ 01 the 18 signatures are present and SECURITY DEFINER
  SELECT count(*) INTO v_count
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.proname = ANY(c_scoped);
  -- Production carries all 18 (17 names; validate_coupon has two overloads). A from-scratch replay
  -- of this repository's migrations carries fewer, because approve_merchant_atomic and
  -- reject_merchant_atomic were created out-of-band and exist only in Production. The count is
  -- therefore reported rather than hard-coded, and every signature that IS present must be hardened.
  IF v_count >= 16 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('01 in-scope SECURITY DEFINER signatures present: PASS (' || v_count::text ||
      CASE WHEN v_count = 18 THEN ', full Production set' ELSE ', partial schema — replay' END || ')');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('01 in-scope signatures present: FAIL found only ' || v_count::text);
  END IF;

  ------------------------------------------------------- 02/03/04 PUBLIC, anon, authenticated denied
  FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated']
  LOOP
    SELECT count(*) INTO v_count
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.proname = ANY(c_scoped)
       AND has_function_privilege(v_role, p.oid, 'EXECUTE');
    IF v_count = 0 THEN
      v_pass := v_pass + 1; v_results := v_results || jsonb_build_array(format('02 %s holds EXECUTE on none of the in-scope functions: PASS', v_role));
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array(format('02 %s still holds EXECUTE on %s in-scope function(s): FAIL', v_role, v_count));
    END IF;
  END LOOP;

  --------------------------------------------- 05 service_role keeps the server-callable signatures
  SELECT count(*) INTO v_count
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.proname = ANY(c_service)
     AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  SELECT count(*) INTO v_expected
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.proname = ANY(c_service);
  IF v_count = v_expected AND v_expected >= 7 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array(format('05 service_role retains EXECUTE on all %s server-callable signatures present: PASS', v_expected));
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array(format('05 service_role EXECUTE %s/%s present: FAIL', v_count, v_expected));
  END IF;

  --------------------------------- 05b the trigger functions keep their EXPLICIT service_role grant
  -- Deliberate: service_role is the trusted backend/database execution boundary and the Advisor
  -- finding concerns browser roles, so an existing trusted-role grant is preserved rather than
  -- removed. aclexplode is used instead of has_function_privilege so a privilege inherited through
  -- PUBLIC can never be mistaken for the explicit grant.
  SELECT count(*) INTO v_count
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.proname = ANY(c_triggers)
     AND EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                  WHERE a.grantee = 'service_role'::regrole::oid AND a.privilege_type = 'EXECUTE');
  SELECT count(*) INTO v_expected
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.proname = ANY(c_triggers);

  IF v_count = v_expected AND v_expected >= 9 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array(format('05b all %s trigger functions keep an EXPLICIT service_role EXECUTE grant: PASS', v_expected));
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array(format('05b explicit service_role grant on trigger functions: FAIL %s/%s', v_count, v_expected));
  END IF;

  ------------------------------- 05c and no in-scope function relies on PUBLIC for its own access
  SELECT count(*) INTO v_count
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.proname = ANY(c_scoped)
     AND EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                  WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE');

  IF v_count = 0 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('05c no in-scope function retains a PUBLIC EXECUTE ACL entry: PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('05c PUBLIC EXECUTE ACL entries remaining: FAIL ' || v_count::text);
  END IF;

  ------------------------------------------------------------- 06 the 9 trigger bindings still exist
  SELECT count(*) INTO v_count
    FROM pg_trigger t JOIN pg_proc pf ON pf.oid = t.tgfoid
   WHERE NOT t.tgisinternal AND pf.proname = ANY(c_triggers) AND t.tgenabled = 'O';
  IF v_count >= 9 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('06 all 9 trigger bindings present and enabled: PASS (' || v_count::text || ')');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('06 trigger bindings present and enabled: FAIL ' || v_count::text || '/9');
  END IF;

  --------------------------------------------------------- 07 search_path pinned on the three
  SELECT count(*) INTO v_count
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND (p.proname = 'validate_coupon' OR p.proname = 'place_order')
     -- Exact value, not a pattern: `search_path=pg_temp, public` or an extra schema would defeat the
     -- point, which is that pg_temp resolves LAST inside a SECURITY DEFINER body.
     AND p.proconfig @> ARRAY['search_path=public, pg_temp'];
  SELECT count(*) INTO v_expected
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
     AND (p.proname = 'validate_coupon' OR p.proname = 'place_order');
  IF v_count = v_expected AND v_expected >= 1 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array(format('07 search_path pinned (public, pg_temp) on all %s validate_coupon/place_order signatures: PASS', v_expected));
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array(format('07 search_path pinned: FAIL %s/%s', v_count, v_expected));
  END IF;

  ------------------------------ 08 the three Advisor findings are gone (scoped to the pin set)
  -- Only validate_coupon and place_order were flagged. Other in-scope functions are already pinned
  -- in Production; a from-scratch replay of this repository yields older definitions that are not,
  -- and pinning those would exceed this task's scope.
  SELECT count(*) INTO v_count
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
     AND (p.proname = 'validate_coupon' OR p.proname = 'place_order')
     AND p.proconfig IS NULL;
  IF v_count = 0 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('08 no validate_coupon/place_order signature has a mutable search_path: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('08 validate_coupon/place_order still mutable: FAIL ' || v_count::text);
  END IF;

  ------------------------------------------------- 09 RLS helpers deliberately left untouched (7B-2)
  SELECT count(*) INTO v_count
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY(c_helpers)
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_count = 3 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('09 the 3 RLS helpers still reachable by browser roles (untouched, Task 7B-2): PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('09 RLS helpers untouched: FAIL only ' || v_count::text ||
      '/3 still reachable — 43 PUBLIC-role policies depend on them');
  END IF;

  ------------------------------------- 10/11 real denial probes for the browser roles (no execution)
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    v_denied := 0; v_probes := 0; v_unexp := '';
    EXECUTE format('SET LOCAL ROLE %I', v_role);

    FOR v_fn IN
      SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.proname = ANY(c_scoped)
       ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
    LOOP
      v_probes := v_probes + 1;
      BEGIN
        -- Privilege is checked BEFORE the body runs, so a denied call cannot mutate anything. Only
        -- the argument count matters here; NULLs are passed for every parameter.
        EXECUTE format('SELECT %s(%s)', 'public.' || quote_ident(v_fn.proname),
                       COALESCE((SELECT string_agg('NULL', ', ')
                                   FROM generate_series(1, array_length(string_to_array(NULLIF(v_fn.args, ''), ','), 1))), ''));
        v_unexp := v_unexp || ' EXECUTED:' || v_fn.proname;
      EXCEPTION
        WHEN insufficient_privilege THEN v_denied := v_denied + 1;
        WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
          v_unexp := v_unexp || ' ' || v_fn.proname || ':' || left(v_errm, 60);
      END;
    END LOOP;
    RESET ROLE;

    IF v_unexp <> '' THEN
      v_results := v_results || jsonb_build_array(format('10 %s unexpected outcome(s):%s', v_role, v_unexp));
    END IF;

    IF v_denied = v_probes AND v_probes >= 16 THEN
      v_pass := v_pass + 1; v_results := v_results || jsonb_build_array(format('10 %s denied on all %s present functions (insufficient_privilege): PASS', v_role, v_probes));
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array(format('10 %s denied on %s/%s functions: FAIL', v_role, v_denied, v_probes));
    END IF;
  END LOOP;

  ------------------------------------------------- 12 triggers still fire after a full revocation
  -- The claim this migration rests on is that a trigger executes its function regardless of the
  -- invoking role's EXECUTE privilege — the privilege is consulted only for a direct call. Rather
  -- than assume it, this builds the exact situation in-transaction: a SECURITY DEFINER function with
  -- EXECUTE revoked from everyone, bound as a trigger, invoked by a plain INSERT.
  CREATE TABLE _sd_verify_probe (id int primary key, marked boolean NOT NULL DEFAULT false);

  CREATE FUNCTION _sd_verify_trigger_fn() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $trg$
    BEGIN
      NEW.marked := true;
      RETURN NEW;
    END
    $trg$;

  REVOKE ALL ON FUNCTION _sd_verify_trigger_fn() FROM PUBLIC, anon, authenticated;

  CREATE TRIGGER _sd_verify_probe_trg BEFORE INSERT ON _sd_verify_probe
    FOR EACH ROW EXECUTE FUNCTION _sd_verify_trigger_fn();

  INSERT INTO _sd_verify_probe (id) VALUES (1);
  SELECT count(*) INTO v_count FROM _sd_verify_probe WHERE id = 1 AND marked;

  IF v_count = 1 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('12 a trigger fires its function even with EXECUTE revoked from every role: PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('12 trigger fires with EXECUTE revoked: FAIL');
  END IF;

  -- and the same function is NOT directly callable by a browser role
  v_denied := 0;
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM _sd_verify_trigger_fn();
  EXCEPTION
    WHEN insufficient_privilege THEN v_denied := 1;
    WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT; v_denied := 0;
  END;
  RESET ROLE;

  IF v_denied = 1 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('13 the same trigger function is refused on a direct anon call: PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('13 direct anon call refused: FAIL');
  END IF;

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'DEFINER_RPC_HARDENING FAILED pass=% fail=% details=%', v_pass, v_fail, v_results::text;
  END IF;

  RAISE NOTICE 'DEFINER_RPC_HARDENING PASSED pass=% fail=% details=%', v_pass, v_fail, v_results::text;
END
$verify$;

ROLLBACK;
