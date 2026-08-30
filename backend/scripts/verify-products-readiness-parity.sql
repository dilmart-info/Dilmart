-- TS/SQL parity verification for products.is_ready (DilMart-STORE-TRUE-PRODUCT-READINESS-FILTERING).
--
-- Proves the STORED GENERATED column matches buildProductReadiness(...) case by case, that the
-- column cannot be written by application code, and that it is recomputed automatically when an
-- input column changes. Every fixture is created inside a transaction that ALWAYS ends in a
-- RAISE, so nothing is persisted.
--
-- Run against a LOCAL / ephemeral database only — never Production:
--   docker cp backend/scripts/verify-products-readiness-parity.sql <db_container>:/tmp/p.sql
--   docker exec -i <db_container> psql -U postgres -d postgres -f /tmp/p.sql
-- TS/SQL parity probe for products.is_ready, run on a LOCAL ephemeral database only.
-- Seeds one row per matrix case, reads back the generated value, then rolls everything back.
DO $parity$
DECLARE
  v_sfx      TEXT := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_merchant UUID := gen_random_uuid();
  v_category UUID := gen_random_uuid();
  v_short    TEXT := 'Deterministic short description used only by the local readiness parity probe.';
  v_image    TEXT := 'https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/parity.jpg';
  v_results  JSONB := '[]'::jsonb;
  v_case     RECORD;
  v_ready    BOOLEAN;
  v_pass     INT := 0;
  v_fail     INT := 0;
BEGIN
  INSERT INTO public.merchants (id, slug, name_ar, name_en, display_name, status)
  VALUES (v_merchant, 'parity-' || v_sfx, 'تحقق', 'Parity', 'Parity', 'active');
  INSERT INTO public.categories (id, name, slug, is_active)
  VALUES (v_category, 'Parity ' || v_sfx, 'parity-' || v_sfx, true);

  FOR v_case IN
    SELECT * FROM (VALUES
      ('01 complete active',            'ok',        NULL::NUMERIC, TRUE,  TRUE,  0,  TRUE,  TRUE),
      ('02 missing images',             'ok',        NULL,          FALSE, TRUE,  0,  TRUE,  FALSE),
      ('03 empty description',          'nodesc',    NULL,          TRUE,  TRUE,  0,  TRUE,  FALSE),
      ('04 whitespace description',     'wsdesc',    NULL,          TRUE,  TRUE,  0,  TRUE,  FALSE),
      ('05 whitespace name',            'wsname',    NULL,          TRUE,  TRUE,  0,  TRUE,  FALSE),
      ('06 whitespace slug',            'wsslug',    NULL,          TRUE,  TRUE,  0,  TRUE,  FALSE),
      ('07 zero price',                 'zeroprice', NULL,          TRUE,  TRUE,  0,  TRUE,  FALSE),
      ('08 missing category',           'ok',        NULL,          TRUE,  FALSE, 0,  TRUE,  FALSE),
      ('09 zero stock still ready',     'ok',        NULL,          TRUE,  TRUE,  0,  TRUE,  TRUE),
      ('10 discount zero',              'ok',        0,             TRUE,  TRUE,  0,  TRUE,  FALSE),
      ('11 discount equals price',      'ok',        25,            TRUE,  TRUE,  0,  TRUE,  FALSE),
      ('12 discount valid',             'ok',        10,            TRUE,  TRUE,  0,  TRUE,  TRUE),
      ('13 inactive but complete',      'ok',        NULL,          TRUE,  TRUE,  0,  FALSE, FALSE),
      ('14 nbsp-only description',      'nbspdesc',  NULL,          TRUE,  TRUE,  0,  TRUE,  FALSE)
    ) AS t(label, variant, discount, with_image, with_category, stock, active, expected)
  LOOP
    INSERT INTO public.products (
      merchant_id, category_id, name, slug, description, short_description,
      price, discount_price, stock, images, is_active, is_published, visibility_status
    ) VALUES (
      v_merchant,
      CASE WHEN v_case.with_category THEN v_category ELSE NULL END,
      CASE v_case.variant WHEN 'wsname' THEN '   ' ELSE 'Parity ' || v_case.label END,
      CASE v_case.variant WHEN 'wsslug' THEN E' \t ' ELSE 'parity-' || v_sfx || '-' || left(md5(v_case.label), 8) END,
      CASE v_case.variant
        WHEN 'nodesc'   THEN ''
        WHEN 'wsdesc'   THEN E'  \t\n '
        WHEN 'nbspdesc' THEN U&'\00a0\00a0'
        ELSE 'Detailed description.'
      END,
      v_short,
      CASE v_case.variant WHEN 'zeroprice' THEN 0 ELSE 25 END,
      v_case.discount,
      v_case.stock,
      CASE WHEN v_case.with_image THEN ARRAY[v_image] ELSE '{}'::text[] END,
      v_case.active, false, 'private'
    )
    RETURNING is_ready INTO v_ready;

    IF v_ready IS DISTINCT FROM v_case.expected THEN
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(v_case.label || ': FAIL (got ' || coalesce(v_ready::text, 'null') || ', expected ' || v_case.expected::text || ')');
    ELSE
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array(v_case.label || ': PASS (' || v_ready::text || ')');
    END IF;
  END LOOP;

  -- generated columns must reject an explicit write
  BEGIN
    EXECUTE format('INSERT INTO public.products (merchant_id, category_id, name, slug, description, short_description, price, stock, images, is_active, is_published, visibility_status, is_ready) VALUES (%L, %L, %L, %L, %L, %L, 25, 1, ARRAY[%L], true, false, %L, true)',
      v_merchant, v_category, 'Forced', 'parity-forced-' || v_sfx, 'd', v_short, v_image, 'private');
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('15 explicit is_ready write: FAIL (accepted)');
  EXCEPTION WHEN others THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('15 explicit is_ready write: PASS (rejected: ' || left(SQLERRM, 60) || ')');
  END;

  -- the column must track an UPDATE of its inputs without any application involvement
  UPDATE public.products SET images = '{}'::text[]
  WHERE merchant_id = v_merchant AND name = 'Parity 01 complete active';
  SELECT is_ready INTO v_ready FROM public.products
  WHERE merchant_id = v_merchant AND name = 'Parity 01 complete active';
  IF v_ready = false THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('16 recomputed on update (images cleared): PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('16 recomputed on update: FAIL');
  END IF;

  UPDATE public.products SET images = ARRAY[v_image]
  WHERE merchant_id = v_merchant AND name = 'Parity 01 complete active';
  SELECT is_ready INTO v_ready FROM public.products
  WHERE merchant_id = v_merchant AND name = 'Parity 01 complete active';
  IF v_ready = true THEN
    v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('17 recomputed on update (image restored): PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('17 recomputed on update (restore): FAIL');
  END IF;

  RAISE EXCEPTION 'READINESS_PARITY pass=% fail=% details=%', v_pass, v_fail, v_results::text;
END
$parity$;
