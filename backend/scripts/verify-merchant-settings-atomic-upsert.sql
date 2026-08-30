-- Contract + atomicity verification for upsert_merchant_settings_atomic()
-- (DilMart-STORE-MERCHANT-SETTINGS-ATOMICITY-001).
--
-- Proves the sparse-patch semantics, the logo rules, the first-creation defaults, the fail-closed
-- validation, the privilege contract and — the point of the task — that a failure in the SECOND
-- stage (the merchants.logo_url write) rolls the FIRST stage (the settings write) back with it.
--
-- The rollback proof installs a TEMPORARY trigger that raises when merchants.logo_url is updated.
-- That trigger exists only inside this script's transaction and is never part of the migration.
--
-- Everything runs inside an explicit transaction that always ROLLBACKs, so nothing is persisted
-- whether the run passes or fails.
--
-- The result is machine-detectable: a passing run emits a NOTICE and exits 0, a failing run RAISEs
-- and, with ON_ERROR_STOP=1, exits non-zero.
--
-- Run against a LOCAL / ephemeral database only — never Production:
--   docker cp backend/scripts/verify-merchant-settings-atomic-upsert.sql <db_container>:/tmp/v.sql
--   docker exec -i <db_container> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/v.sql
BEGIN;

DO $verify$
DECLARE
  v_sfx        TEXT := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_results    JSONB := '[]'::jsonb;
  v_pass       INT := 0;
  v_fail       INT := 0;
  v_id         UUID;
  v_other      UUID;
  v_snapshot   JSONB;
  v_row        public.merchant_settings%ROWTYPE;
  v_logo       TEXT;
  v_before     public.merchant_settings%ROWTYPE;
  v_before_logo TEXT;
  v_updated_1  TIMESTAMPTZ;
  v_updated_2  TIMESTAMPTZ;
  v_errm       TEXT;
  v_count      INT;

BEGIN
  -- 01 first creation keeps every database default -------------------------------------------
  v_id := gen_random_uuid();
  INSERT INTO public.merchants (id, slug, name_ar, name_en, display_name, status, logo_url)
  VALUES (v_id, 'ms-' || v_sfx || '-01', 'تاجر', 'MS 01', 'MS 01', 'active', 'https://logo/01.png');

  v_snapshot := public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('city', 'Baghdad'));
  SELECT * INTO v_row FROM public.merchant_settings WHERE merchant_id = v_id;

  IF v_row.city = 'Baghdad'
     AND v_row.order_auto_accept = false
     AND v_row.default_low_stock_threshold = 5
     AND v_row.push_enabled = true
     AND v_row.sound_enabled = true
     AND v_row.sound_repeat_interval_seconds = 15
     AND v_row.sound_max_duration_seconds = 300
     AND v_row.contact_phone IS NULL
  THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('01 first creation keeps DB defaults: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('01 first creation keeps DB defaults: FAIL ' || to_jsonb(v_row)::text);
  END IF;

  -- 02 the returned snapshot matches the committed row + logo ----------------------------------
  IF v_snapshot->>'city' = v_row.city
     AND v_snapshot->>'merchant_id' = v_id::text
     AND v_snapshot->>'logo_url' = 'https://logo/01.png'
     AND (v_snapshot->>'push_enabled')::boolean = v_row.push_enabled
     AND (v_snapshot->>'sound_repeat_interval_seconds')::int = v_row.sound_repeat_interval_seconds
     AND (v_snapshot->>'updated_at')::timestamptz = v_row.updated_at
     AND v_snapshot ? 'created_at'
     AND v_snapshot ? 'order_auto_accept'
     AND v_snapshot ? 'default_low_stock_threshold'
  THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('02 snapshot matches committed state: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('02 snapshot matches committed state: FAIL ' || v_snapshot::text);
  END IF;

  -- 03 sparse update: one field changes, everything else is preserved --------------------------
  PERFORM public.upsert_merchant_settings_atomic(
    v_id,
    jsonb_build_object('contact_phone', '0770', 'address', 'Street 1', 'push_enabled', false)
  );
  v_snapshot := public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('contact_phone', '0771'));
  SELECT * INTO v_row FROM public.merchant_settings WHERE merchant_id = v_id;

  IF v_row.contact_phone = '0771'
     AND v_row.address = 'Street 1'
     AND v_row.city = 'Baghdad'
     AND v_row.push_enabled = false
     AND v_row.sound_enabled = true
  THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('03 sparse update preserves omitted fields: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('03 sparse update preserves omitted fields: FAIL ' || to_jsonb(v_row)::text);
  END IF;

  -- 04 settings-only update leaves the logo alone ----------------------------------------------
  SELECT logo_url INTO v_logo FROM public.merchants WHERE id = v_id;
  IF v_logo = 'https://logo/01.png' THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('04 settings-only update leaves logo unchanged: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('04 settings-only update leaves logo unchanged: FAIL ' || COALESCE(v_logo, 'NULL'));
  END IF;

  -- 05 partial push update touches only the push fields ----------------------------------------
  PERFORM pg_sleep(0.01);
  SELECT * INTO v_before FROM public.merchant_settings WHERE merchant_id = v_id;
  PERFORM public.upsert_merchant_settings_atomic(
    v_id,
    jsonb_build_object('push_enabled', true, 'sound_enabled', true)
  );
  SELECT * INTO v_row FROM public.merchant_settings WHERE merchant_id = v_id;

  IF v_row.push_enabled = true
     AND v_row.sound_enabled = true
     AND v_row.contact_phone = v_before.contact_phone
     AND v_row.address = v_before.address
     AND v_row.city = v_before.city
     AND v_row.sound_repeat_interval_seconds = v_before.sound_repeat_interval_seconds
     AND v_row.updated_at > v_before.updated_at
  THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('05 partial push update leaves contact/address intact: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('05 partial push update leaves contact/address intact: FAIL ' || to_jsonb(v_row)::text);
  END IF;

  -- 06 logo-only update: settings row still exists, updated_at advances, logo changes -----------
  PERFORM pg_sleep(0.01);
  SELECT updated_at INTO v_updated_1 FROM public.merchant_settings WHERE merchant_id = v_id;
  v_snapshot := public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('logo_url', 'https://logo/new.png'));
  SELECT updated_at INTO v_updated_2 FROM public.merchant_settings WHERE merchant_id = v_id;
  SELECT logo_url INTO v_logo FROM public.merchants WHERE id = v_id;

  IF v_logo = 'https://logo/new.png'
     AND v_updated_2 > v_updated_1
     AND v_snapshot->>'logo_url' = 'https://logo/new.png'
  THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('06 logo-only update advances updated_at and changes logo: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('06 logo-only update advances updated_at and changes logo: FAIL ' || COALESCE(v_logo, 'NULL'));
  END IF;

  -- 07 empty-string logo clears the logo --------------------------------------------------------
  PERFORM public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('logo_url', ''));
  SELECT logo_url INTO v_logo FROM public.merchants WHERE id = v_id;
  IF v_logo = '' THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('07 empty-string logo clears the logo: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('07 empty-string logo clears the logo: FAIL ' || COALESCE(v_logo, 'NULL'));
  END IF;

  -- 08 omitted logo leaves the (now empty) logo untouched ---------------------------------------
  PERFORM public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('city', 'Basra'));
  SELECT logo_url INTO v_logo FROM public.merchants WHERE id = v_id;
  IF v_logo = '' THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('08 omitted logo leaves logo untouched: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('08 omitted logo leaves logo untouched: FAIL ' || COALESCE(v_logo, 'NULL'));
  END IF;

  -- 09 a JSON null logo is refused, and nothing changes ------------------------------------------
  -- The backend never sends this (null means "leave the logo alone", so the key is simply absent);
  -- at the database level it fails closed rather than silently clearing the logo.
  PERFORM public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('logo_url', 'https://logo/keep.png'));
  SELECT * INTO v_before FROM public.merchant_settings WHERE merchant_id = v_id;
  BEGIN
    PERFORM public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('city', 'Mosul', 'logo_url', NULL));
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('09 null logo refused: FAIL (no exception)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    SELECT * INTO v_row FROM public.merchant_settings WHERE merchant_id = v_id;
    SELECT logo_url INTO v_logo FROM public.merchants WHERE id = v_id;
    IF v_errm LIKE 'INVALID_SETTINGS_VALUE: logo_url%'
       AND v_logo = 'https://logo/keep.png'
       AND v_row.city = v_before.city
       AND v_row.updated_at = v_before.updated_at
    THEN
      v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('09 null logo refused, nothing changed: PASS');
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('09 null logo refused, nothing changed: FAIL ' || v_errm);
    END IF;
  END;

  -- 10 nullable text fields can be cleared with JSON null ----------------------------------------
  PERFORM public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('delivery_notes', NULL));
  SELECT * INTO v_row FROM public.merchant_settings WHERE merchant_id = v_id;
  IF v_row.delivery_notes IS NULL AND v_row.city = 'Basra' THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('10 nullable text cleared by JSON null: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('10 nullable text cleared by JSON null: FAIL ' || to_jsonb(v_row)::text);
  END IF;

  -- 11 unknown keys are refused ------------------------------------------------------------------
  SELECT * INTO v_before FROM public.merchant_settings WHERE merchant_id = v_id;
  BEGIN
    PERFORM public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('order_auto_accept', true));
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('11 unknown key refused: FAIL (no exception)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    SELECT * INTO v_row FROM public.merchant_settings WHERE merchant_id = v_id;
    IF v_errm LIKE 'UNSUPPORTED_SETTINGS_FIELD%' AND v_row.updated_at = v_before.updated_at AND v_row.order_auto_accept = false THEN
      v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('11 unknown key refused, nothing changed: PASS');
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('11 unknown key refused, nothing changed: FAIL ' || v_errm);
    END IF;
  END;

  -- 12 NOT NULL booleans/integers reject null and wrong types -------------------------------------
  v_count := 0;
  BEGIN PERFORM public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('push_enabled', NULL));
  EXCEPTION WHEN OTHERS THEN v_count := v_count + 1; END;
  BEGIN PERFORM public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('push_enabled', 'true'));
  EXCEPTION WHEN OTHERS THEN v_count := v_count + 1; END;
  BEGIN PERFORM public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('sound_repeat_interval_seconds', NULL));
  EXCEPTION WHEN OTHERS THEN v_count := v_count + 1; END;
  BEGIN PERFORM public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('sound_repeat_interval_seconds', '15'));
  EXCEPTION WHEN OTHERS THEN v_count := v_count + 1; END;
  BEGIN PERFORM public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('sound_max_duration_seconds', 12.5));
  EXCEPTION WHEN OTHERS THEN v_count := v_count + 1; END;
  BEGIN PERFORM public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('city', 5));
  EXCEPTION WHEN OTHERS THEN v_count := v_count + 1; END;
  BEGIN PERFORM public.upsert_merchant_settings_atomic(v_id, '"not an object"'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_count := v_count + 1; END;

  IF v_count = 7 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('12 type validation fails closed (7/7): PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('12 type validation fails closed: FAIL ' || v_count::text || '/7');
  END IF;

  -- 13 a nonexistent merchant fails and leaves no orphan settings row ------------------------------
  v_other := gen_random_uuid();
  BEGIN
    PERFORM public.upsert_merchant_settings_atomic(v_other, jsonb_build_object('city', 'Nowhere'));
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('13 nonexistent merchant refused: FAIL (no exception)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    SELECT count(*) INTO v_count FROM public.merchant_settings WHERE merchant_id = v_other;
    IF v_errm LIKE 'MERCHANT_NOT_FOUND%' AND v_count = 0 THEN
      v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('13 nonexistent merchant refused, no orphan row: PASS');
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('13 nonexistent merchant refused, no orphan row: FAIL ' || v_errm);
    END IF;
  END;

  -- 14 ATOMICITY: a second-stage failure rolls the first stage back --------------------------------
  -- A test-only trigger makes the merchants.logo_url write fail. The settings write happens BEFORE
  -- it inside the same function call, so if the function were not atomic the settings change would
  -- survive — which is exactly the torn write this task removes.
  PERFORM public.upsert_merchant_settings_atomic(
    v_id,
    jsonb_build_object('city', 'Karbala', 'contact_phone', '0999', 'logo_url', 'https://logo/before.png')
  );
  SELECT * INTO v_before FROM public.merchant_settings WHERE merchant_id = v_id;
  SELECT logo_url INTO v_before_logo FROM public.merchants WHERE id = v_id;

  CREATE OR REPLACE FUNCTION pg_temp.fail_on_logo_update() RETURNS trigger
  LANGUAGE plpgsql AS $trg$
  BEGIN
    RAISE EXCEPTION 'INJECTED_LOGO_WRITE_FAILURE';
  END
  $trg$;

  CREATE TRIGGER zz_test_fail_on_logo_update
    BEFORE UPDATE OF logo_url ON public.merchants
    FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_on_logo_update();

  BEGIN
    PERFORM public.upsert_merchant_settings_atomic(
      v_id,
      jsonb_build_object('city', 'TORN', 'contact_phone', '0000', 'logo_url', 'https://logo/after.png')
    );
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('14 atomic rollback: FAIL (the write did not fail at all)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    SELECT * INTO v_row FROM public.merchant_settings WHERE merchant_id = v_id;
    SELECT logo_url INTO v_logo FROM public.merchants WHERE id = v_id;

    IF v_errm = 'INJECTED_LOGO_WRITE_FAILURE'
       AND v_row.city = v_before.city
       AND v_row.contact_phone = v_before.contact_phone
       AND v_row.updated_at = v_before.updated_at      -- not even a partial updated_at advance
       AND v_logo IS NOT DISTINCT FROM v_before_logo
    THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array(
        '14 atomic rollback (settings + logo both reverted): PASS'
      );
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(
        '14 atomic rollback: FAIL err=' || v_errm ||
        ' city=' || COALESCE(v_row.city, 'NULL') ||
        ' phone=' || COALESCE(v_row.contact_phone, 'NULL') ||
        ' updated_at_moved=' || (v_row.updated_at <> v_before.updated_at)::text ||
        ' logo=' || COALESCE(v_logo, 'NULL')
      );
    END IF;
  END;

  DROP TRIGGER zz_test_fail_on_logo_update ON public.merchants;

  -- 15 after the failed call the RPC still works normally -------------------------------------------
  v_snapshot := public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('city', 'Najaf'));
  SELECT * INTO v_row FROM public.merchant_settings WHERE merchant_id = v_id;
  IF v_row.city = 'Najaf' AND v_snapshot->>'city' = 'Najaf' THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('15 RPC still usable after a rolled-back failure: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('15 RPC still usable after a rolled-back failure: FAIL');
  END IF;

  -- 16 one settings row per merchant, never duplicated ------------------------------------------------
  SELECT count(*) INTO v_count FROM public.merchant_settings WHERE merchant_id = v_id;
  IF v_count = 1 THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('16 exactly one settings row per merchant: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('16 exactly one settings row per merchant: FAIL ' || v_count::text);
  END IF;

  -- 17 a second merchant is untouched by the first merchant's writes ------------------------------------
  v_other := gen_random_uuid();
  INSERT INTO public.merchants (id, slug, name_ar, name_en, display_name, status, logo_url)
  VALUES (v_other, 'ms-' || v_sfx || '-02', 'تاجر', 'MS 02', 'MS 02', 'active', 'https://logo/02.png');
  PERFORM public.upsert_merchant_settings_atomic(v_other, jsonb_build_object('city', 'Erbil'));
  PERFORM public.upsert_merchant_settings_atomic(v_id, jsonb_build_object('city', 'Samarra', 'logo_url', 'https://logo/01b.png'));

  SELECT * INTO v_row FROM public.merchant_settings WHERE merchant_id = v_other;
  SELECT logo_url INTO v_logo FROM public.merchants WHERE id = v_other;
  IF v_row.city = 'Erbil' AND v_logo = 'https://logo/02.png' THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('17 writes are scoped to one merchant: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('17 writes are scoped to one merchant: FAIL');
  END IF;

  -- 18 privileges: service_role only ---------------------------------------------------------------------
  IF has_function_privilege('service_role', 'public.upsert_merchant_settings_atomic(uuid, jsonb)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.upsert_merchant_settings_atomic(uuid, jsonb)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.upsert_merchant_settings_atomic(uuid, jsonb)', 'EXECUTE')
     AND (SELECT count(*) FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = 'public.upsert_merchant_settings_atomic(uuid, jsonb)'::regprocedure)) a
          WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') = 0
  THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('18 privileges service_role-only: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('18 privileges service_role-only: FAIL');
  END IF;

  -- 19 function properties ------------------------------------------------------------------------------
  IF (SELECT p.prosecdef AND p.provolatile = 'v' AND 'search_path=public' = ANY(p.proconfig)
                AND pg_catalog.format_type(p.prorettype, NULL) = 'jsonb' AND p.pronargs = 2
        FROM pg_proc p WHERE p.oid = 'public.upsert_merchant_settings_atomic(uuid, jsonb)'::regprocedure)
  THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('19 SECURITY DEFINER / search_path / jsonb / 2 args: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('19 SECURITY DEFINER / search_path / jsonb / 2 args: FAIL');
  END IF;

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'MERCHANT_SETTINGS_ATOMICITY FAILED pass=% fail=% details=%', v_pass, v_fail, v_results::text;
  END IF;

  RAISE NOTICE 'MERCHANT_SETTINGS_ATOMICITY PASSED pass=% fail=% details=%', v_pass, v_fail, v_results::text;
END
$verify$;

-- Seeds and the test-only trigger exist only for this run.
ROLLBACK;
