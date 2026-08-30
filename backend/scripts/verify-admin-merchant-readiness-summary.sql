-- SQL parity + security verification for admin_merchant_readiness_summary()
-- (DilMart-STORE-ADMIN-GOVERNANCE-READINESS-N1-001).
--
-- Seeds a controlled merchant population covering every readiness check, compares the RPC output
-- against the expected TypeScript semantics case by case, and checks the privilege contract.
-- Everything runs inside a transaction that ALWAYS ends in a RAISE, so nothing is persisted.
--
-- Run against a LOCAL / ephemeral database only — never Production:
--   docker cp backend/scripts/verify-admin-merchant-readiness-summary.sql <db_container>:/tmp/v.sql
--   docker exec -i <db_container> psql -U postgres -d postgres -f /tmp/v.sql
DO $verify$
DECLARE
  v_sfx      TEXT := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_cat      UUID := gen_random_uuid();
  v_short    TEXT := 'Deterministic short description used only by the readiness summary verification.';
  v_image    TEXT := 'https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/rs.jpg';
  v_results  JSONB := '[]'::jsonb;
  v_pass     INT := 0;
  v_fail     INT := 0;
  v_summary  JSONB;
  v_case     RECORD;
  v_id       UUID;
  v_actual   INT;
  v_ready    BOOLEAN;
  v_ids      JSONB := '{}'::jsonb;

BEGIN
  INSERT INTO public.categories (id, name, slug, is_active)
  VALUES (v_cat, 'RS ' || v_sfx, 'rs-' || v_sfx, true);

  -- label | status | settings | contact | city | address | products | active | categorized | expected_checks
  FOR v_case IN
    SELECT * FROM (VALUES
      ('01 active all complete',        'active', true,  'phone', 'Baghdad', 'Street 1', true,  true,  true,  7),
      ('02 inactive otherwise complete','draft',  true,  'phone', 'Baghdad', 'Street 1', true,  true,  true,  6),
      ('03 missing settings row',       'active', false, NULL,     NULL,      NULL,      true,  true,  true,  5),
      ('04 contact fields empty',       'active', true,  'none',  'Baghdad', 'Street 1', true,  true,  true,  6),
      ('05 whitespace-only contact',    'active', true,  'blank', 'Baghdad', 'Street 1', true,  true,  true,  6),
      ('06 city missing',               'active', true,  'phone', NULL,      'Street 1', true,  true,  true,  6),
      ('07 address missing',            'active', true,  'phone', 'Baghdad', NULL,       true,  true,  true,  6),
      ('08 whitespace-only address',    'active', true,  'phone', 'Baghdad', '   ',      true,  true,  true,  6),
      ('09 no products',                'active', true,  'phone', 'Baghdad', 'Street 1', false, false, false, 4),
      ('10 only inactive products',     'active', true,  'phone', 'Baghdad', 'Street 1', true,  false, true,  6),
      ('11 all uncategorized',          'active', true,  'phone', 'Baghdad', 'Street 1', true,  true,  false, 6),
      ('12 email-only contact',         'active', true,  'email', 'Baghdad', 'Street 1', true,  true,  true,  7),
      ('13 whatsapp-only contact',      'active', true,  'wa',    'Baghdad', 'Street 1', true,  true,  true,  7),
      ('14 empty display name',         'active', true,  'phone', 'Baghdad', 'Street 1', true,  true,  true,  6),
      ('15 nothing at all',             'draft',  false, NULL,     NULL,      NULL,      false, false, false, 1),
      ('16 null display name',          'active', true,  'phone', 'Baghdad', 'Street 1', true,  true,  true,  6)
    ) AS t(label, status, with_settings, contact_kind, city, address, has_products, has_active, has_categorized, expected_checks)
  LOOP
    v_id := gen_random_uuid();
    INSERT INTO public.merchants (id, slug, name_ar, name_en, display_name, status)
    VALUES (
      v_id,
      'rs-' || v_sfx || '-' || left(md5(v_case.label), 8),
      'تاجر', 'RS Merchant',
      CASE
        WHEN v_case.label = '14 empty display name' THEN '   '
        WHEN v_case.label = '16 null display name' THEN NULL
        ELSE 'RS ' || v_case.label
      END,
      v_case.status
    );
    v_ids := v_ids || jsonb_build_object(v_case.label, v_id::text);

    IF v_case.with_settings THEN
      INSERT INTO public.merchant_settings (merchant_id, contact_phone, whatsapp_phone, support_email, city, address)
      VALUES (
        v_id,
        CASE v_case.contact_kind WHEN 'phone' THEN '07700000000' WHEN 'blank' THEN '   ' ELSE NULL END,
        CASE v_case.contact_kind WHEN 'wa' THEN '07700000001' WHEN 'blank' THEN E'\t' ELSE NULL END,
        CASE v_case.contact_kind WHEN 'email' THEN 'rs@example.test' WHEN 'blank' THEN '  ' ELSE NULL END,
        v_case.city,
        v_case.address
      );
    END IF;

    IF v_case.has_products THEN
      -- two products per merchant: the join must not duplicate merchant rows
      INSERT INTO public.products (merchant_id, category_id, name, slug, description, short_description,
                                   price, stock, images, is_active, is_published, visibility_status)
      VALUES (v_id,
              CASE WHEN v_case.has_categorized THEN v_cat ELSE NULL END,
              'RS product A', 'rs-' || v_sfx || '-' || left(md5(v_case.label), 6) || '-a',
              'd', v_short, 10, 1, ARRAY[v_image], v_case.has_active, false, 'private'),
             (v_id,
              NULL,
              'RS product B', 'rs-' || v_sfx || '-' || left(md5(v_case.label), 6) || '-b',
              'd', v_short, 10, 1, ARRAY[v_image], false, false, 'private');
    END IF;
  END LOOP;

  v_summary := public.admin_merchant_readiness_summary();

  -- per-merchant score parity
  FOR v_case IN
    SELECT * FROM (VALUES
      ('01 active all complete',        7),
      ('02 inactive otherwise complete',6),
      ('03 missing settings row',       5),
      ('04 contact fields empty',       6),
      ('05 whitespace-only contact',    6),
      ('06 city missing',               6),
      ('07 address missing',            6),
      ('08 whitespace-only address',    6),
      ('09 no products',                4),
      ('10 only inactive products',     6),
      ('11 all uncategorized',          6),
      ('12 email-only contact',         7),
      ('13 whatsapp-only contact',      7),
      ('14 empty display name',         6),
      ('15 nothing at all',             1),
      ('16 null display name',          6)
    ) AS t(label, expected_checks)
  LOOP
    SELECT (m->>'score')::int, (m->>'is_ready')::boolean
      INTO v_actual, v_ready
    FROM jsonb_array_elements(v_summary->'merchants') m
    WHERE m->>'merchant_id' = (v_ids->>v_case.label);

    IF v_actual = round((v_case.expected_checks::numeric / 7) * 100)::int
       AND v_ready = (v_case.expected_checks = 7) THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array(v_case.label || ': PASS (score ' || v_actual || ')');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(
        v_case.label || ': FAIL (score ' || coalesce(v_actual::text,'null') ||
        ', expected ' || round((v_case.expected_checks::numeric / 7) * 100)::int || ')');
    END IF;
  END LOOP;

  -- one row per merchant despite two products each
  IF (SELECT count(*) FROM jsonb_array_elements(v_summary->'merchants')) =
     (SELECT count(DISTINCT m->>'merchant_id') FROM jsonb_array_elements(v_summary->'merchants') m) THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('16 no duplicate merchant rows: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('16 no duplicate merchant rows: FAIL');
  END IF;

  -- aggregate parity: distribution / average / ready / total recomputed independently
  DECLARE
    v_low INT; v_mid INT; v_high INT; v_avg INT; v_ready_n INT; v_total INT;
    v_exp_low INT; v_exp_mid INT; v_exp_high INT; v_exp_avg INT; v_exp_ready INT; v_exp_total INT;
  BEGIN
    SELECT (v_summary->'distribution'->0->>'count')::int,
           (v_summary->'distribution'->1->>'count')::int,
           (v_summary->'distribution'->2->>'count')::int,
           (v_summary->>'avg_readiness_score')::int,
           (v_summary->>'ready_merchants')::int,
           (v_summary->>'total_merchants')::int
      INTO v_low, v_mid, v_high, v_avg, v_ready_n, v_total;

    SELECT count(*) FILTER (WHERE (m->>'score')::int < 50),
           count(*) FILTER (WHERE (m->>'score')::int >= 50 AND (m->>'score')::int < 80),
           count(*) FILTER (WHERE (m->>'score')::int >= 80),
           round(avg((m->>'score')::int))::int,
           count(*) FILTER (WHERE (m->>'is_ready')::boolean),
           count(*)
      INTO v_exp_low, v_exp_mid, v_exp_high, v_exp_avg, v_exp_ready, v_exp_total
    FROM jsonb_array_elements(v_summary->'merchants') m;

    IF v_low = v_exp_low AND v_mid = v_exp_mid AND v_high = v_exp_high THEN
      v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('17 distribution parity: PASS (' || v_low || '/' || v_mid || '/' || v_high || ')');
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('17 distribution parity: FAIL');
    END IF;

    IF v_avg = v_exp_avg THEN
      v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('18 avg of rounded scores parity: PASS (' || v_avg || ')');
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('18 avg parity: FAIL (' || v_avg || ' vs ' || v_exp_avg || ')');
    END IF;

    IF v_ready_n = v_exp_ready AND v_total = v_exp_total THEN
      v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('19 ready/total parity: PASS (' || v_ready_n || '/' || v_total || ')');
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('19 ready/total parity: FAIL');
    END IF;
  END;

  -- Ordering: display_name ascending with NULLs last, id as tiebreaker.
  -- The RPC orders by the RAW display_name but emits COALESCE(display_name, ''), so a NULL-named
  -- merchant surfaces as an empty string in LAST position. A naive ascending comparison on the
  -- emitted value would call that a regression, and the payload is platform-wide (it also
  -- contains rows this script did not seed). The check therefore sorts the emitted empty-string
  -- sentinel highest, mirroring the RPC's NULLS LAST semantics.
  IF (
    SELECT bool_and(ok) FROM (
      SELECT
        prev_key IS NULL OR key >= prev_key AS ok
      FROM (
        SELECT
          -- '' (a NULL display_name) sorts after every real name, like NULLS LAST
          CASE WHEN (m->>'display_name') = '' THEN chr(1114111) ELSE (m->>'display_name') END AS key,
          lag(CASE WHEN (m->>'display_name') = '' THEN chr(1114111) ELSE (m->>'display_name') END)
            OVER (ORDER BY ord) AS prev_key
        FROM jsonb_array_elements(v_summary->'merchants') WITH ORDINALITY AS t(m, ord)
      ) ordered
    ) s
  ) THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('20 display_name ascending order: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('20 display_name ascending order: FAIL');
  END IF;

  -- privileges
  IF has_function_privilege('service_role', 'public.admin_merchant_readiness_summary()', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.admin_merchant_readiness_summary()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.admin_merchant_readiness_summary()', 'EXECUTE')
     AND (SELECT count(*) FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = 'public.admin_merchant_readiness_summary()'::regprocedure)) a
          WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') = 0
  THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('21 privileges service_role-only: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('21 privileges service_role-only: FAIL');
  END IF;

  RAISE EXCEPTION 'READINESS_SUMMARY_PARITY pass=% fail=% details=%', v_pass, v_fail, v_results::text;
END
$verify$;
