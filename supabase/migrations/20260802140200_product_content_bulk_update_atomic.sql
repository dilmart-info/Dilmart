-- DilMart-PRODUCT-SHORT-DESCRIPTION-001-CORRECTIONS
-- Atomic content-only bulk update (short_description + description).
-- No other product columns. All-or-nothing with audit in the same transaction.

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

    SELECT p.id, p.short_description, p.description
      INTO v_product_id, v_before_short, v_before_desc
    FROM public.products p
    WHERE p.merchant_id = p_merchant_id
      AND upper(btrim(COALESCE(p.merchant_sku, ''))) = v_sku;

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
  'Admin content-only bulk update: short_description + description only; all-or-nothing; rejects HOLD SKU ARD-1191.';

REVOKE ALL ON FUNCTION public.product_content_bulk_update_atomic(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_content_bulk_update_atomic(UUID, UUID, TEXT, JSONB) TO service_role;

COMMIT;
