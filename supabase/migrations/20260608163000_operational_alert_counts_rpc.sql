-- PR-OS1.1: Operational alert counts RPC
-- Computes exact alert counts in SQL without loading rows to memory.
-- Preserves original readiness logic for non-ready products and per-product low_stock_threshold.

CREATE OR REPLACE FUNCTION public.operational_alert_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delayed_orders int;
  v_non_ready_products int;
  v_draft_merchants int;
  v_low_stock_products int;
BEGIN
  -- 1. Delayed orders: pending statuses older than 24 hours
  SELECT COUNT(*)
  INTO v_delayed_orders
  FROM public.orders
  WHERE status IN ('new', 'contacted', 'preparing')
    AND created_at < (now() - interval '24 hours');

  -- 2. Non-ready products: replicates the original 8-condition JS readiness check.
  --    A product is "not ready" if ANY of these conditions fail:
  --      name is non-empty, description is non-empty, category_id is set,
  --      price > 0, has at least 1 image, stock >= 0,
  --      discount is valid (null OR (discount_price > 0 AND discount_price < price)),
  --      is_active = true
  SELECT COUNT(*)
  INTO v_non_ready_products
  FROM public.products
  WHERE NOT (
    COALESCE(TRIM(name), '') <> ''
    AND COALESCE(TRIM(description), '') <> ''
    AND category_id IS NOT NULL
    AND COALESCE(price, 0) > 0
    AND images IS NOT NULL AND array_length(images, 1) > 0
    AND COALESCE(stock, 0) >= 0
    AND (
      discount_price IS NULL
      OR (COALESCE(discount_price, 0) > 0 AND COALESCE(discount_price, 0) < COALESCE(price, 0))
    )
    AND is_active = true
  );

  -- 3. Draft/inactive merchants
  SELECT COUNT(*)
  INTO v_draft_merchants
  FROM public.merchants
  WHERE status <> 'active';

  -- 4. Low stock products: respects per-product low_stock_threshold (default 5)
  SELECT COUNT(*)
  INTO v_low_stock_products
  FROM public.products
  WHERE COALESCE(stock, 0) > 0
    AND COALESCE(stock, 0) <= COALESCE(low_stock_threshold, 5);

  RETURN jsonb_build_object(
    'delayed_orders_count', v_delayed_orders,
    'non_ready_products_count', v_non_ready_products,
    'draft_merchants_count', v_draft_merchants,
    'low_stock_products_count', v_low_stock_products
  );
END;
$$;

-- Restrict to service_role only (backend calls via service key)
REVOKE EXECUTE ON FUNCTION public.operational_alert_counts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.operational_alert_counts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.operational_alert_counts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.operational_alert_counts() TO service_role;
