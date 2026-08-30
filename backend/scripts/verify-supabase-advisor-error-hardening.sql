-- Security verification for 20260820160000_supabase_security_advisor_error_hardening.sql
-- (DilMart-STORE-SUPABASE-ADVISOR-ERROR-CLOSURE-001).
--
-- Proves, against a real database, that after the migration:
--   * the three delivery views run in INVOKER context and are readable only by service_role;
--   * anon and authenticated cannot read them at all — privilege denied, not merely zero rows;
--   * service_role sees exactly the same rows as the view owner does, so security_invoker changed
--     nothing for the backend;
--   * the two Jenni lock tables have RLS enabled and are CRUD-able only by service_role;
--   * the full backend lock lifecycle (acquire → check → release) still works as service_role;
--   * anon and authenticated can neither read, forge nor delete a lock.
--
-- Runs inside an explicit transaction that always ROLLBACKs, so nothing is persisted. The result is
-- machine-detectable: a passing run emits a NOTICE and exits 0, a failing run RAISEs and, with
-- ON_ERROR_STOP=1, exits non-zero.
--
-- Run against a LOCAL / ephemeral database only — never Production:
--   docker cp backend/scripts/verify-supabase-advisor-error-hardening.sql <db_container>:/tmp/v.sql
--   docker exec -i <db_container> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/v.sql
BEGIN;

DO $verify$
DECLARE
  v_results   JSONB := '[]'::jsonb;
  v_pass      INT := 0;
  v_fail      INT := 0;
  v_view      TEXT;
  v_ok        BOOLEAN;
  v_count     INT;
  v_denied    INT;
  v_errm      TEXT;
  v_unexpected TEXT := '';
  v_merchant  UUID;
  v_seeded    BOOLEAN := FALSE;
  v_service   INT;
  v_owner     INT;
BEGIN
  ----------------------------------------------------------------- 01 security_invoker is set
  v_ok := TRUE;
  FOREACH v_view IN ARRAY ARRAY['delivery_open_orders_view','delivery_agent_performance_view','delivery_company_performance_view']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
       WHERE c.relnamespace = 'public'::regnamespace
         AND c.relname = v_view
         AND EXISTS (SELECT 1 FROM unnest(COALESCE(c.reloptions, '{}')) o WHERE o = 'security_invoker=true')
    ) THEN
      v_ok := FALSE;
    END IF;
  END LOOP;

  IF v_ok THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('01 all three views have security_invoker=true: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('01 all three views have security_invoker=true: FAIL');
  END IF;

  ------------------------------------------------------- 02 browser roles hold NO view privilege
  SELECT count(*) INTO v_count
    FROM (VALUES ('delivery_open_orders_view'), ('delivery_agent_performance_view'), ('delivery_company_performance_view')) AS v(name),
         (VALUES ('anon'), ('authenticated')) AS r(role),
         (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(priv)
   WHERE has_table_privilege(r.role, ('public.' || v.name)::regclass, p.priv);

  IF v_count = 0 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('02 anon/authenticated hold zero privileges on all three views: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('02 anon/authenticated hold zero privileges on all three views: FAIL ' || v_count::text || ' grants remain');
  END IF;

  ------------------------------------------------------------------ 03 PUBLIC holds nothing either
  SELECT count(*) INTO v_count
    FROM (VALUES ('delivery_open_orders_view'), ('delivery_agent_performance_view'), ('delivery_company_performance_view'),
                 ('jenni_merchant_provisioning_locks'), ('jenni_store_provisioning_locks')) AS v(name)
   WHERE has_table_privilege('public', ('public.' || v.name)::regclass, 'SELECT');

  IF v_count = 0 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('03 PUBLIC has no SELECT on any of the five entities: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('03 PUBLIC has no SELECT on any of the five entities: FAIL');
  END IF;

  ---------------------------------------------------------------- 04 service_role can still SELECT
  SELECT count(*) INTO v_count
    FROM (VALUES ('delivery_open_orders_view'), ('delivery_agent_performance_view'), ('delivery_company_performance_view')) AS v(name)
   WHERE has_table_privilege('service_role', ('public.' || v.name)::regclass, 'SELECT');

  IF v_count = 3 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('04 service_role retains SELECT on all three views: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('04 service_role retains SELECT on all three views: FAIL ' || v_count::text || '/3');
  END IF;

  ------------------------------------- 05 service_role still sees exactly what the view owner sees
  -- No hard-coded row counts: the check compares the invoker-context result (service_role, which
  -- holds BYPASSRLS) against the owner-context result (the script runs as the view owner), so it is
  -- correct on an empty database, on a fixture database and on a full copy alike. This is the
  -- property that matters — security_invoker must not change what the backend reads.
  v_ok := TRUE;
  FOREACH v_view IN ARRAY ARRAY['delivery_open_orders_view','delivery_agent_performance_view','delivery_company_performance_view']
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_view) INTO v_owner;
    SET LOCAL ROLE service_role;
    EXECUTE format('SELECT count(*) FROM public.%I', v_view) INTO v_service;
    RESET ROLE;
    IF v_owner <> v_service THEN
      v_ok := FALSE;
      v_results := v_results || jsonb_build_array(format('05 %s owner=%s service_role=%s', v_view, v_owner, v_service));
    END IF;
  END LOOP;

  IF v_ok THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('05 service_role reads the same rows as the view owner on all three views: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('05 service_role reads the same rows as the view owner: FAIL');
  END IF;

  ------------------------------------------------------- 06/07 anon + authenticated are refused
  -- Only insufficient_privilege counts as a denial. Any other error means the probe did not test
  -- what it claims to test, so it is recorded (with its message) and the run continues — an abort
  -- here would lose every remaining assertion, including the ones that would expose the problem.
  FOREACH v_view IN ARRAY ARRAY['anon','authenticated']
  LOOP
    v_denied := 0;
    v_unexpected := '';
    EXECUTE format('SET LOCAL ROLE %I', v_view);
    BEGIN PERFORM count(*) FROM public.delivery_open_orders_view;
    EXCEPTION
      WHEN insufficient_privilege THEN v_denied := v_denied + 1;
      WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT; v_unexpected := v_unexpected || ' open_orders:' || v_errm;
    END;
    BEGIN PERFORM count(*) FROM public.delivery_agent_performance_view;
    EXCEPTION
      WHEN insufficient_privilege THEN v_denied := v_denied + 1;
      WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT; v_unexpected := v_unexpected || ' agent_perf:' || v_errm;
    END;
    BEGIN PERFORM count(*) FROM public.delivery_company_performance_view;
    EXCEPTION
      WHEN insufficient_privilege THEN v_denied := v_denied + 1;
      WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT; v_unexpected := v_unexpected || ' company_perf:' || v_errm;
    END;
    RESET ROLE;

    IF v_unexpected <> '' THEN
      v_results := v_results || jsonb_build_array(format('06 %s unexpected error(s):%s', v_view, v_unexpected));
    END IF;

    IF v_denied = 3 THEN
      v_pass := v_pass + 1; v_results := v_results || jsonb_build_array(format('06 %s is denied on all three views: PASS', v_view));
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array(format('06 %s is denied on all three views: FAIL %s/3', v_view, v_denied));
    END IF;
  END LOOP;

  ------------------------------------------------------------------- 08 lock tables have RLS on
  SELECT count(*) INTO v_count
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('jenni_merchant_provisioning_locks','jenni_store_provisioning_locks')
     AND c.relrowsecurity;

  IF v_count = 2 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('08 RLS enabled on both Jenni lock tables: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('08 RLS enabled on both Jenni lock tables: FAIL ' || v_count::text || '/2');
  END IF;

  --------------------------------------------------- 09 restrictive deny-browser policies exist
  SELECT count(*) INTO v_count
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('jenni_merchant_provisioning_locks','jenni_store_provisioning_locks')
     AND p.polpermissive = false
     AND p.polcmd = '*';

  IF v_count = 2 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('09 restrictive deny-browser policy on both lock tables: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('09 restrictive deny-browser policy on both lock tables: FAIL ' || v_count::text || '/2');
  END IF;

  ------------------------------------------------- 10 browser roles hold no lock-table privilege
  SELECT count(*) INTO v_count
    FROM (VALUES ('jenni_merchant_provisioning_locks'), ('jenni_store_provisioning_locks')) AS v(name),
         (VALUES ('anon'), ('authenticated')) AS r(role),
         (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(priv)
   WHERE has_table_privilege(r.role, ('public.' || v.name)::regclass, p.priv);

  IF v_count = 0 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('10 anon/authenticated hold zero privileges on both lock tables: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('10 anon/authenticated hold zero privileges on both lock tables: FAIL ' || v_count::text);
  END IF;

  ------------------------------------ 11 service_role keeps the full lock lifecycle (both tables)
  -- Both lock tables declare merchant_id as a FOREIGN KEY to public.merchants(id), so the lifecycle
  -- needs a real merchant. Reuse one if the database has any; otherwise seed a throwaway merchant.
  -- Everything is inside the transaction this script always rolls back, so nothing is persisted.
  SELECT id INTO v_merchant FROM public.merchants LIMIT 1;
  IF v_merchant IS NULL THEN
    v_merchant := gen_random_uuid();
    INSERT INTO public.merchants (id, slug, name_ar, name_en, display_name, status)
    VALUES (v_merchant, 'advisor-verify-' || left(md5(v_merchant::text), 8), 'تحقق', 'Advisor Verify', 'Advisor Verify', 'draft');
    v_seeded := TRUE;
  END IF;

  SET LOCAL ROLE service_role;
  INSERT INTO public.jenni_store_provisioning_locks (merchant_id) VALUES (v_merchant);
  SELECT count(*) INTO v_count FROM public.jenni_store_provisioning_locks WHERE merchant_id = v_merchant;
  DELETE FROM public.jenni_store_provisioning_locks WHERE merchant_id = v_merchant;
  SELECT count(*) INTO v_service FROM public.jenni_store_provisioning_locks WHERE merchant_id = v_merchant;
  RESET ROLE;

  IF v_count = 1 AND v_service = 0 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array(
      '11 service_role store-lock acquire/read/release still works: PASS'
      || CASE WHEN v_seeded THEN ' (on a seeded throwaway merchant)' ELSE ' (on an existing merchant)' END);
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('11 service_role store-lock acquire/read/release still works: FAIL');
  END IF;

  SET LOCAL ROLE service_role;
  INSERT INTO public.jenni_merchant_provisioning_locks (merchant_id) VALUES (v_merchant);
  SELECT count(*) INTO v_count FROM public.jenni_merchant_provisioning_locks WHERE merchant_id = v_merchant;
  DELETE FROM public.jenni_merchant_provisioning_locks WHERE merchant_id = v_merchant;
  SELECT count(*) INTO v_service FROM public.jenni_merchant_provisioning_locks WHERE merchant_id = v_merchant;
  RESET ROLE;

  IF v_count = 1 AND v_service = 0 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('12 service_role merchant-lock acquire/read/release still works: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('12 service_role merchant-lock acquire/read/release still works: FAIL');
  END IF;

  ------------------------------------------- 13 a held lock still blocks a duplicate acquisition
  SET LOCAL ROLE service_role;
  INSERT INTO public.jenni_store_provisioning_locks (merchant_id) VALUES (v_merchant);
  v_ok := FALSE;
  BEGIN
    INSERT INTO public.jenni_store_provisioning_locks (merchant_id) VALUES (v_merchant);
  EXCEPTION WHEN unique_violation THEN
    v_ok := TRUE;
  END;
  DELETE FROM public.jenni_store_provisioning_locks WHERE merchant_id = v_merchant;
  RESET ROLE;

  IF v_ok THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('13 duplicate lock acquisition still conflicts (mutual exclusion intact): PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('13 duplicate lock acquisition still conflicts: FAIL');
  END IF;

  -------------------------------------------- 14/15 browser roles cannot read, forge or delete locks
  -- Seed one lock as service_role so a successful browser read would be visible.
  SET LOCAL ROLE service_role;
  INSERT INTO public.jenni_store_provisioning_locks (merchant_id) VALUES (v_merchant);
  RESET ROLE;

  FOREACH v_view IN ARRAY ARRAY['anon','authenticated']
  LOOP
    v_denied := 0;
    v_unexpected := '';
    EXECUTE format('SET LOCAL ROLE %I', v_view);
    BEGIN PERFORM count(*) FROM public.jenni_store_provisioning_locks;
    EXCEPTION
      WHEN insufficient_privilege THEN v_denied := v_denied + 1;
      WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT; v_unexpected := v_unexpected || ' store_select:' || v_errm;
    END;
    BEGIN INSERT INTO public.jenni_store_provisioning_locks (merchant_id) VALUES (v_merchant);
    EXCEPTION
      WHEN insufficient_privilege THEN v_denied := v_denied + 1;
      WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT; v_unexpected := v_unexpected || ' store_insert:' || v_errm;
    END;
    BEGIN UPDATE public.jenni_store_provisioning_locks SET locked_at = now();
    EXCEPTION
      WHEN insufficient_privilege THEN v_denied := v_denied + 1;
      WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT; v_unexpected := v_unexpected || ' store_update:' || v_errm;
    END;
    BEGIN DELETE FROM public.jenni_store_provisioning_locks;
    EXCEPTION
      WHEN insufficient_privilege THEN v_denied := v_denied + 1;
      WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT; v_unexpected := v_unexpected || ' store_delete:' || v_errm;
    END;
    BEGIN PERFORM count(*) FROM public.jenni_merchant_provisioning_locks;
    EXCEPTION
      WHEN insufficient_privilege THEN v_denied := v_denied + 1;
      WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT; v_unexpected := v_unexpected || ' merchant_select:' || v_errm;
    END;
    BEGIN INSERT INTO public.jenni_merchant_provisioning_locks (merchant_id) VALUES (v_merchant);
    EXCEPTION
      WHEN insufficient_privilege THEN v_denied := v_denied + 1;
      WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT; v_unexpected := v_unexpected || ' merchant_insert:' || v_errm;
    END;
    RESET ROLE;

    IF v_unexpected <> '' THEN
      v_results := v_results || jsonb_build_array(format('14 %s unexpected error(s):%s', v_view, v_unexpected));
    END IF;

    IF v_denied = 6 THEN
      v_pass := v_pass + 1; v_results := v_results || jsonb_build_array(format('14 %s denied read/insert/update/delete on lock tables: PASS', v_view));
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array(format('14 %s denied read/insert/update/delete on lock tables: FAIL %s/6', v_view, v_denied));
    END IF;
  END LOOP;

  -- The seeded lock must have survived every browser attempt.
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_count FROM public.jenni_store_provisioning_locks WHERE merchant_id = v_merchant;
  DELETE FROM public.jenni_store_provisioning_locks WHERE merchant_id = v_merchant;
  RESET ROLE;

  IF v_count = 1 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('16 a held lock survived every browser-role attempt: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('16 a held lock survived every browser-role attempt: FAIL');
  END IF;

  ------------------------------------------------------------- 17 Advisor-equivalent error check
  -- Same conditions the Supabase linter reports as ERROR: a view without security_invoker that is
  -- reachable by a browser role, or a public table without RLS.
  SELECT count(*) INTO v_count
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('delivery_open_orders_view','delivery_agent_performance_view','delivery_company_performance_view',
                       'jenni_merchant_provisioning_locks','jenni_store_provisioning_locks')
     AND (
       (c.relkind = 'v' AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(c.reloptions, '{}')) o WHERE o = 'security_invoker=true'))
       OR (c.relkind = 'r' AND NOT c.relrowsecurity)
       OR has_table_privilege('anon', c.oid, 'SELECT')
       OR has_table_privilege('authenticated', c.oid, 'SELECT')
     );

  IF v_count = 0 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('17 zero Advisor-equivalent ERROR conditions across the five entities: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('17 zero Advisor-equivalent ERROR conditions: FAIL ' || v_count::text || ' remain');
  END IF;

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'ADVISOR_ERROR_HARDENING FAILED pass=% fail=% details=%', v_pass, v_fail, v_results::text;
  END IF;

  RAISE NOTICE 'ADVISOR_ERROR_HARDENING PASSED pass=% fail=% details=%', v_pass, v_fail, v_results::text;
END
$verify$;

-- Fixture rows and lock rows exist only for this run.
ROLLBACK;
