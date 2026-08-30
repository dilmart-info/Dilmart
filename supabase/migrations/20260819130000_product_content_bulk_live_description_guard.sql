-- DilMart-STORE-PRODUCT-READINESS-INVARIANT-001
-- Make the live-product description guard authoritative inside
-- product_content_bulk_update_atomic (was a non-atomic service-side pre-read).
--
-- Same signature/body as 20260802140200_product_content_bulk_update_atomic.sql, plus:
--   * Phase 1 now selects the matched product row FOR UPDATE, so a concurrent activation of
--     that product blocks until this transaction commits or rolls back. The previous NestJS
--     pre-read could observe a draft product that was activated before the RPC ran.
--   * clearing `description` (item description null/empty) is rejected with
--     CONTENT_BULK_PRODUCT_NOT_READY when the locked row is is_active / is_published /
--     visibility_status = 'public'. `description_present` is an activation readiness check,
--     so blanking it would leave a live product below the invariant every activation path
--     enforces.
--   * SKU matching is unchanged (upper(btrim(merchant_sku))), so the DB gate cannot be
--     side-stepped by casing/whitespace differences the service-side check might miss.
--
-- Rollback: re-run 20260802140200_product_content_bulk_update_atomic.sql (identical
-- signature, argument types, COMMENT and grants; CREATE OR REPLACE restores the prior body).

BEGIN;

CREATE OR REPLACE FUNCTION public.product_content_bulk_update_atomic(
  p_merchant_id UUID,
  p_actor_id    UUID,
  p_actor_role  TEXT,
  p_items       JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item            JSONB;
  v_sku             TEXT;
  v_short           TEXT;
  v_short_len       INT;
  v_description     TEXT;
  v_seen_skus       TEXT[] := '{}';
  v_match_count     INT;
  v_product_id      UUID;
  v_before_short    TEXT;
  v_before_desc     TEXT;
  v_results         JSONB := '[]'::jsonb;
  v_updates         JSONB := '[]'::jsonb;
  v_idx             INT := 0;
  v_keys            TEXT[];
  v_key             TEXT;
  v_allowed_keys    TEXT[] := ARRAY['merchant_sku', 'short_description', 'description'];
  -- Live-product description guard (this migration).
  v_is_active       BOOLEAN;
  v_is_published    BOOLEAN;
  v_visibility      TEXT;
BEGIN
  IF p_merchant_id IS NULL THEN
    RAISE EXCEPTION 'CONTENT_BULK_MERCHANT_REQUIRED';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'CONTENT_BULK_ITEMS_REQUIRED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.merchants WHERE id = p_merchant_id) THEN
    RAISE EXCEPTION 'CONTENT_BULK_MERCHANT_NOT_FOUND';
  END IF;

  -- Phase 1: validate every row; stage intended updates; zero product writes yet.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS value
  LOOP
    v_idx := v_idx + 1;

    SELECT array_agg(k) INTO v_keys
    FROM jsonb_object_keys(v_item) AS k;

    IF v_keys IS NOT NULL THEN
      FOREACH v_key IN ARRAY v_keys
      LOOP
        IF NOT (v_key = ANY (v_allowed_keys)) THEN
          RAISE EXCEPTION 'CONTENT_BULK_UNEXPECTED_FIELD: item % field %', v_idx, v_key;
        END IF;
      END LOOP;
    END IF;

    v_sku := upper(btrim(COALESCE(v_item->>'merchant_sku', '')));
    IF v_sku = '' THEN
      RAISE EXCEPTION 'CONTENT_BULK_SKU_REQUIRED: item %', v_idx;
    END IF;
    IF v_sku = 'ARD-1191' THEN
      RAISE EXCEPTION 'CONTENT_BULK_HOLD_SKU_REJECTED: %', v_sku;
    END IF;
    IF v_sku = ANY (v_seen_skus) THEN
      RAISE EXCEPTION 'CONTENT_BULK_DUPLICATE_SKU: %', v_sku;
    END IF;
    v_seen_skus := array_append(v_seen_skus, v_sku);

    v_short := btrim(COALESCE(v_item->>'short_description', ''));
    IF v_short = '' THEN
      RAISE EXCEPTION 'CONTENT_BULK_SHORT_DESCRIPTION_REQUIRED: sku %', v_sku;
    END IF;
    IF v_short ~* '</?[a-z][^<>]*>' THEN
      RAISE EXCEPTION 'CONTENT_BULK_SHORT_DESCRIPTION_INVALID: sku %', v_sku;
    END IF;
    v_short_len := char_length(v_short);
    IF v_short_len < 40 THEN
      RAISE EXCEPTION 'CONTENT_BULK_SHORT_DESCRIPTION_TOO_SHORT: sku % len %', v_sku, v_short_len;
    END IF;
    IF v_short_len > 280 THEN
      RAISE EXCEPTION 'CONTENT_BULK_SHORT_DESCRIPTION_TOO_LONG: sku % len %', v_sku, v_short_len;
    END IF;

    v_description := NULLIF(btrim(COALESCE(v_item->>'description', '')), '');

    SELECT count(*)::int INTO v_match_count
    FROM public.products p
    WHERE p.merchant_id = p_merchant_id
      AND upper(btrim(COALESCE(p.merchant_sku, ''))) = v_sku;

    IF v_match_count = 0 THEN
      RAISE EXCEPTION 'CONTENT_BULK_SKU_NOT_FOUND: %', v_sku;
    END IF;
    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'CONTENT_BULK_SKU_AMBIGUOUS: %', v_sku;
    END IF;

    -- FOR UPDATE: hold the row for the rest of this transaction so a concurrent activation
    -- cannot slip between this validation and the Phase 2 write.
    SELECT p.id, p.short_description, p.description, p.is_active, p.is_published, p.visibility_status
      INTO v_product_id, v_before_short, v_before_desc, v_is_active, v_is_published, v_visibility
    FROM public.products p
    WHERE p.merchant_id = p_merchant_id
      AND upper(btrim(COALESCE(p.merchant_sku, ''))) = v_sku
    FOR UPDATE;

    -- Readiness invariant: never clear the description of a live product.
    IF v_description IS NULL
       AND (v_is_active IS TRUE OR v_is_published IS TRUE OR v_visibility = 'public') THEN
      RAISE EXCEPTION 'CONTENT_BULK_PRODUCT_NOT_READY: sku % is active/published/public; description cannot be cleared', v_sku;
    END IF;

    v_updates := v_updates || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'merchant_sku', v_sku,
      'short_description', v_short,
      'description', to_jsonb(v_description),
      'before_short_description', to_jsonb(v_before_short),
      'before_description', to_jsonb(v_before_desc)
    ));
  END LOOP;

  -- Phase 2: apply updates (still one transaction with validation above).
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_updates) AS value
  LOOP
    UPDATE public.products
    SET
      short_description = v_item->>'short_description',
      description = CASE
        WHEN v_item->'description' = 'null'::jsonb THEN NULL
        ELSE v_item->>'description'
      END
    WHERE id = (v_item->>'product_id')::uuid
      AND merchant_id = p_merchant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CONTENT_BULK_UPDATE_FAILED: sku %', v_item->>'merchant_sku';
    END IF;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'merchant_sku', v_item->>'merchant_sku',
      'product_id', v_item->>'product_id',
      'short_description', v_item->>'short_description',
      'description', v_item->'description',
      'status', 'updated'
    ));
  END LOOP;

  -- Audit only on full success (same transaction).
  IF p_actor_id IS NOT NULL AND p_actor_role IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      event_type, actor_id, actor_role, merchant_id, resource_type, resource_id, payload
    ) VALUES (
      'ADMIN_ACTION',
      p_actor_id,
      p_actor_role,
      p_merchant_id,
      'product_content_bulk_update',
      p_merchant_id::text,
      jsonb_build_object(
        'merchant_id', p_merchant_id,
        'updated_count', jsonb_array_length(v_results),
        'skus', to_jsonb(v_seen_skus)
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'merchant_id', p_merchant_id,
    'updated_count', jsonb_array_length(v_results),
    'results', v_results
  );
END;
$$;

COMMENT ON FUNCTION public.product_content_bulk_update_atomic(UUID, UUID, TEXT, JSONB) IS
  'Admin content-only bulk update: short_description + description only; all-or-nothing; rejects HOLD SKU ARD-1191; locks each matched product FOR UPDATE and rejects clearing the description of an active/published/public product (CONTENT_BULK_PRODUCT_NOT_READY).';

REVOKE ALL ON FUNCTION public.product_content_bulk_update_atomic(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.product_content_bulk_update_atomic(UUID, UUID, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.product_content_bulk_update_atomic(UUID, UUID, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.product_content_bulk_update_atomic(UUID, UUID, TEXT, JSONB) TO service_role;

COMMIT;
