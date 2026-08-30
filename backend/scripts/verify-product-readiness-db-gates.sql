-- Product readiness DATABASE gate verification (DilMart-STORE-PRODUCT-READINESS-INVARIANT-001).
--
-- Repeatable, self-contained proof that both readiness gates behave correctly on a real
-- Postgres, for environments where the Node db-integration suite cannot run (for example when
-- no local PostgREST endpoint is available for this project). Every assertion RAISEs NOTICE on
-- pass and WARNING on failure, and the block raises an exception if anything failed.
--
-- Run against a LOCAL / ephemeral database only — never Production:
--   psql "$LOCAL_DB_URL" -f backend/scripts/verify-product-readiness-db-gates.sql
-- or, with the local supabase stack:
--   docker cp backend/scripts/verify-product-readiness-db-gates.sql <db_container>:/tmp/v.sql
--   docker exec -i <db_container> psql -U postgres -d postgres -f /tmp/v.sql
--
-- It seeds its own merchant / category / product / import-session rows (unique per run) and
-- leaves them behind; it never updates or deletes pre-existing data.
\set ON_ERROR_STOP on
-- Local ephemeral verification of the two readiness DB gates added by PR #116.
-- Runs entirely inside one throwaway transaction-free session on the LOCAL supabase postgres
-- container; nothing here touches any remote database.

DO $verify$
DECLARE
  v_merchant  UUID := gen_random_uuid();
  v_category  UUID := gen_random_uuid();
  v_import    UUID := gen_random_uuid();
  v_product   UUID := gen_random_uuid();
  v_suffix    TEXT := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_sku       TEXT := 'GATE-1-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_short     TEXT := 'Deterministic valid short description used by the readiness database gate verification script.';
  v_image     TEXT := 'https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/gate.jpg';
  v_msg       TEXT;
  v_count     INT;
  v_desc      TEXT;
  v_active    BOOLEAN;
  v_published BOOLEAN;
  v_vis       TEXT;
  v_failures  INT := 0;
BEGIN
  INSERT INTO public.merchants (id, slug, name_ar, name_en, display_name, status)
  VALUES (v_merchant, 'gate-merchant-' || lower(v_suffix), 'تاجر', 'Gate Merchant', 'Gate Merchant', 'active');

  INSERT INTO public.categories (id, name, slug, is_active)
  VALUES (v_category, 'Gate Category ' || v_suffix, 'gate-category-' || lower(v_suffix), true);

  -- ── 1. import confirm: publish row with no image/description must be refused ──
  INSERT INTO public.product_import_sessions
    (id, merchant_id, status, original_filename, total_rows, valid_rows, invalid_rows, preview_payload, expires_at)
  VALUES (
    v_import, v_merchant, 'previewed', 'gate.csv', 1, 1, 0,
    jsonb_build_object(
      'summary', jsonb_build_object('total_rows', 1, 'valid_rows', 1, 'invalid_rows', 0, 'warnings_count', 0),
      'rows', jsonb_build_array(jsonb_build_object(
        'row_number', 2,
        'status', 'valid',
        'errors', '[]'::jsonb,
        'warnings', '[]'::jsonb,
        'normalized', jsonb_build_object(
          'name', 'Gate Product', 'description', '', 'short_description', v_short,
          'category_id', v_category::text, 'category_name', 'Gate Category',
          'price', 25, 'discount_price', NULL, 'stock', 3, 'sku', v_sku,
          'brand', NULL, 'sizes', '[]'::jsonb,
          'is_active', true, 'is_published', true, 'visibility_status', 'public',
          'image_url', NULL, 'slug', 'gate-product-gate-1-' || lower(v_suffix)
        )
      ))
    ),
    now() + interval '1 hour'
  );

  BEGIN
    PERFORM public.product_import_confirm_atomic(v_import, v_merchant, NULL, NULL, false);
    RAISE WARNING 'FAIL: import confirm accepted an unready publish row';
    v_failures := v_failures + 1;
  EXCEPTION WHEN others THEN
    v_msg := SQLERRM;
    IF position('IMPORT_ROW_NOT_READY' in v_msg) > 0 THEN
      RAISE NOTICE 'PASS: import confirm refused the unready publish row (%)', left(v_msg, 80);
    ELSE
      RAISE WARNING 'FAIL: unexpected import error: %', v_msg;
      v_failures := v_failures + 1;
    END IF;
  END;

  SELECT count(*) INTO v_count FROM public.products WHERE merchant_id = v_merchant;
  IF v_count = 0 THEN
    RAISE NOTICE 'PASS: zero product writes after the refused confirm';
  ELSE
    RAISE WARNING 'FAIL: % product row(s) were written', v_count;
    v_failures := v_failures + 1;
  END IF;

  SELECT status INTO v_msg FROM public.product_import_sessions WHERE id = v_import;
  IF v_msg = 'previewed' THEN
    RAISE NOTICE 'PASS: the session rolled back to previewed';
  ELSE
    RAISE WARNING 'FAIL: session status is %', v_msg;
    v_failures := v_failures + 1;
  END IF;

  -- ── 2. import confirm: active + archived must be refused ─────────────────────
  v_import := gen_random_uuid();
  INSERT INTO public.product_import_sessions
    (id, merchant_id, status, original_filename, total_rows, valid_rows, invalid_rows, preview_payload, expires_at)
  VALUES (
    v_import, v_merchant, 'previewed', 'gate.csv', 1, 1, 0,
    jsonb_build_object(
      'summary', jsonb_build_object('total_rows', 1, 'valid_rows', 1, 'invalid_rows', 0, 'warnings_count', 0),
      'rows', jsonb_build_array(jsonb_build_object(
        'row_number', 2, 'status', 'valid', 'errors', '[]'::jsonb, 'warnings', '[]'::jsonb,
        'normalized', jsonb_build_object(
          'name', 'Gate Product 2', 'description', 'Detailed description.', 'short_description', v_short,
          'category_id', v_category::text, 'category_name', 'Gate Category',
          'price', 25, 'discount_price', NULL, 'stock', 3, 'sku', 'GATE-2-' || v_suffix,
          'brand', NULL, 'sizes', '[]'::jsonb,
          'is_active', true, 'is_published', false, 'visibility_status', 'archived',
          'image_url', v_image, 'slug', 'gate-product-gate-2-' || lower(v_suffix)
        )
      ))
    ),
    now() + interval '1 hour'
  );

  BEGIN
    PERFORM public.product_import_confirm_atomic(v_import, v_merchant, NULL, NULL, false);
    RAISE WARNING 'FAIL: import confirm accepted an active+archived row';
    v_failures := v_failures + 1;
  EXCEPTION WHEN others THEN
    v_msg := SQLERRM;
    IF position('IMPORT_ROW_NOT_READY' in v_msg) > 0 THEN
      RAISE NOTICE 'PASS: import confirm refused the active+archived row';
    ELSE
      RAISE WARNING 'FAIL: unexpected import error: %', v_msg;
      v_failures := v_failures + 1;
    END IF;
  END;

  -- ── 3. import confirm: a fully ready publish row still imports ───────────────
  v_import := gen_random_uuid();
  INSERT INTO public.product_import_sessions
    (id, merchant_id, status, original_filename, total_rows, valid_rows, invalid_rows, preview_payload, expires_at)
  VALUES (
    v_import, v_merchant, 'previewed', 'gate.csv', 1, 1, 0,
    jsonb_build_object(
      'summary', jsonb_build_object('total_rows', 1, 'valid_rows', 1, 'invalid_rows', 0, 'warnings_count', 0),
      'rows', jsonb_build_array(jsonb_build_object(
        'row_number', 2, 'status', 'valid', 'errors', '[]'::jsonb, 'warnings', '[]'::jsonb,
        'normalized', jsonb_build_object(
          'name', 'Gate Product 3', 'description', 'Detailed description.', 'short_description', v_short,
          'category_id', v_category::text, 'category_name', 'Gate Category',
          'price', 25, 'discount_price', NULL, 'stock', 3, 'sku', 'GATE-3-' || v_suffix,
          'brand', NULL, 'sizes', '[]'::jsonb,
          'is_active', true, 'is_published', true, 'visibility_status', 'public',
          'image_url', v_image, 'slug', 'gate-product-gate-3-' || lower(v_suffix)
        )
      ))
    ),
    now() + interval '1 hour'
  );

  BEGIN
    PERFORM public.product_import_confirm_atomic(v_import, v_merchant, NULL, NULL, false);
    SELECT is_active, is_published, visibility_status
      INTO v_active, v_published, v_vis
    FROM public.products WHERE merchant_id = v_merchant AND merchant_sku = 'GATE-3-' || v_suffix;
    IF v_active AND v_published AND v_vis = 'public' THEN
      RAISE NOTICE 'PASS: a fully ready row imported as active/published/public';
    ELSE
      RAISE WARNING 'FAIL: ready row landed as %/%/%', v_active, v_published, v_vis;
      v_failures := v_failures + 1;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'FAIL: ready row was rejected: %', SQLERRM;
    v_failures := v_failures + 1;
  END;

  -- ── 4. content bulk: cannot clear the description of a live product ─────────
  INSERT INTO public.products
    (id, merchant_id, category_id, name, slug, merchant_sku, description, short_description,
     price, stock, images, is_active, is_published, visibility_status)
  VALUES
    (v_product, v_merchant, v_category, 'Live Product', 'gate-live-product-' || lower(v_suffix), 'live-sku-' || lower(v_suffix),
     'Existing detailed description.', v_short, 25, 3, ARRAY[v_image], true, true, 'public');

  BEGIN
    -- lower-case stored SKU vs the normalized upper-case payload SKU on purpose.
    PERFORM public.product_content_bulk_update_atomic(
      v_merchant, NULL, NULL,
      jsonb_build_array(jsonb_build_object('merchant_sku', 'LIVE-SKU-' || v_suffix, 'short_description', v_short, 'description', NULL))
    );
    RAISE WARNING 'FAIL: content bulk cleared the description of a live product';
    v_failures := v_failures + 1;
  EXCEPTION WHEN others THEN
    v_msg := SQLERRM;
    IF position('CONTENT_BULK_PRODUCT_NOT_READY' in v_msg) > 0 THEN
      RAISE NOTICE 'PASS: content bulk refused to clear a live description (normalized SKU match)';
    ELSE
      RAISE WARNING 'FAIL: unexpected content bulk error: %', v_msg;
      v_failures := v_failures + 1;
    END IF;
  END;

  SELECT description INTO v_desc FROM public.products WHERE id = v_product;
  IF v_desc = 'Existing detailed description.' THEN
    RAISE NOTICE 'PASS: the live description is unchanged';
  ELSE
    RAISE WARNING 'FAIL: description is now %', coalesce(v_desc, '<null>');
    v_failures := v_failures + 1;
  END IF;

  -- ── 5. content bulk: a draft product can still be cleared ───────────────────
  UPDATE public.products
  SET is_active = false, is_published = false, visibility_status = 'private'
  WHERE id = v_product;

  BEGIN
    PERFORM public.product_content_bulk_update_atomic(
      v_merchant, NULL, NULL,
      jsonb_build_array(jsonb_build_object('merchant_sku', 'LIVE-SKU-' || v_suffix, 'short_description', v_short, 'description', NULL))
    );
    SELECT description INTO v_desc FROM public.products WHERE id = v_product;
    IF v_desc IS NULL THEN
      RAISE NOTICE 'PASS: a draft product description can still be cleared';
    ELSE
      RAISE WARNING 'FAIL: draft description was not cleared';
      v_failures := v_failures + 1;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'FAIL: draft clear was rejected: %', SQLERRM;
    v_failures := v_failures + 1;
  END;

  -- ── 6. privileges ──────────────────────────────────────────────────────────
  IF has_function_privilege('service_role', 'public.product_import_confirm_atomic(uuid,uuid,uuid,text,boolean)', 'EXECUTE')
     AND has_function_privilege('service_role', 'public.product_content_bulk_update_atomic(uuid,uuid,text,jsonb)', 'EXECUTE')
  THEN
    RAISE NOTICE 'PASS: service_role can execute both readiness RPCs';
  ELSE
    RAISE WARNING 'FAIL: service_role lost EXECUTE on a readiness RPC';
    v_failures := v_failures + 1;
  END IF;

  IF has_function_privilege('anon', 'public.product_import_confirm_atomic(uuid,uuid,uuid,text,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.product_import_confirm_atomic(uuid,uuid,uuid,text,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.product_content_bulk_update_atomic(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.product_content_bulk_update_atomic(uuid,uuid,text,jsonb)', 'EXECUTE')
  THEN
    RAISE WARNING 'FAIL: anon/authenticated can execute a readiness RPC';
    v_failures := v_failures + 1;
  ELSE
    RAISE NOTICE 'PASS: anon/authenticated cannot execute either readiness RPC';
  END IF;

  IF v_failures > 0 THEN
    RAISE EXCEPTION 'DB GATE VERIFICATION FAILED: % failing assertion(s)', v_failures;
  END IF;
  RAISE NOTICE 'ALL DB GATE ASSERTIONS PASSED';
END
$verify$;
