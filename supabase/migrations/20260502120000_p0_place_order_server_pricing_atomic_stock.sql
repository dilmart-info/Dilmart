-- P0: place_order — server-side line pricing, single active merchant, atomic stock decrement.
-- Replaces function body from m13; signature unchanged for Nest RPC compatibility.

CREATE OR REPLACE FUNCTION public.place_order(
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_governorate_id UUID,
  p_area TEXT,
  p_nearest_landmark TEXT,
  p_notes TEXT,
  p_subtotal NUMERIC,
  p_delivery_cost NUMERIC,
  p_discount NUMERIC,
  p_total NUMERIC,
  p_coupon_id UUID,
  p_items JSONB,
  p_user_id UUID DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_map_url TEXT DEFAULT NULL,
  p_points_spent INTEGER DEFAULT 0,
  p_points_discount NUMERIC DEFAULT 0,
  p_points_earned INTEGER DEFAULT 0,
  p_merchant_id UUID DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_merchant_notes TEXT DEFAULT NULL,
  p_merchandise_subtotal NUMERIC DEFAULT NULL,
  p_discount_total NUMERIC DEFAULT NULL,
  p_delivery_fee_charged NUMERIC DEFAULT NULL,
  p_platform_commission_type TEXT DEFAULT NULL,
  p_platform_commission_rate NUMERIC DEFAULT NULL,
  p_platform_commission_amount NUMERIC DEFAULT NULL,
  p_platform_assisted_fee_amount NUMERIC DEFAULT NULL,
  p_platform_extra_fee_amount NUMERIC DEFAULT NULL,
  p_courier_fee_payable NUMERIC DEFAULT NULL,
  p_merchant_gross_amount NUMERIC DEFAULT NULL,
  p_merchant_net_amount NUMERIC DEFAULT NULL,
  p_gross_collected_amount NUMERIC DEFAULT NULL,
  p_platform_net_revenue_amount NUMERIC DEFAULT NULL,
  p_currency_code TEXT DEFAULT 'IQD',
  p_financial_snapshot_version INTEGER DEFAULT 0,
  p_payment_status TEXT DEFAULT 'unpaid',
  p_collection_status TEXT DEFAULT 'not_collected',
  p_settlement_status TEXT DEFAULT 'not_accrued',
  p_cash_expected_amount NUMERIC DEFAULT NULL,
  p_commission_rule_id UUID DEFAULT NULL,
  p_assisted_fee_rule_id UUID DEFAULT NULL,
  p_platform_fee_rule_id UUID DEFAULT NULL,
  p_delivery_billing_rule_id UUID DEFAULT NULL,
  p_resolved_plan_id UUID DEFAULT NULL,
  p_resolved_plan_code TEXT DEFAULT NULL,
  p_commercial_snapshot_version INTEGER DEFAULT 0
)
RETURNS TEXT AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_merchant_id UUID;
  v_distinct_merchant_count INT;
  v_product RECORD;
  v_qty INT;
  v_unit NUMERIC;
  v_line_total NUMERIC;
  v_db_merchandise NUMERIC := 0;
  v_lines JSONB := '[]'::JSONB;
  v_row_id UUID;
  v_expected_merch NUMERIC;
  v_display_name TEXT;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order items cannot be empty';
  END IF;

  SELECT COUNT(DISTINCT p.merchant_id), MIN(p.merchant_id::text)::uuid
  INTO v_distinct_merchant_count, v_merchant_id
  FROM jsonb_array_elements(p_items) AS arr(elem)
  INNER JOIN public.products p ON p.id = (arr.elem->>'product_id')::UUID;

  IF v_distinct_merchant_count <> 1 OR v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Cart must contain products from exactly one merchant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.merchants m WHERE m.id = v_merchant_id AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Merchant is not available for orders';
  END IF;

  IF p_merchant_id IS NOT NULL AND p_merchant_id <> v_merchant_id THEN
    RAISE EXCEPTION 'Merchant scope mismatch';
  END IF;

  FOR v_item IN
    SELECT arr.elem
    FROM jsonb_array_elements(p_items) AS arr(elem)
    ORDER BY (arr.elem->>'product_id')::text
  LOOP
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::INT, 1));

    SELECT
      p.id,
      p.merchant_id,
      p.name,
      p.price,
      p.discount_price,
      p.offer_ends_at,
      p.stock,
      p.is_active,
      p.visibility_status,
      p.sold_count,
      m.status AS merchant_status
    INTO v_product
    FROM public.products p
    INNER JOIN public.merchants m ON m.id = p.merchant_id
    WHERE p.id = (v_item->>'product_id')::UUID
    FOR UPDATE OF p;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found';
    END IF;

    IF v_product.merchant_id IS DISTINCT FROM v_merchant_id THEN
      RAISE EXCEPTION 'Item merchant mismatch in order';
    END IF;

    IF v_product.merchant_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'Merchant is not active';
    END IF;

    IF NOT COALESCE(v_product.is_active, false) THEN
      RAISE EXCEPTION 'Product is not available';
    END IF;

    IF COALESCE(v_product.visibility_status, 'public') = 'archived' THEN
      RAISE EXCEPTION 'Product is not available for sale';
    END IF;

    v_unit := COALESCE(v_product.price, 0)::NUMERIC;
    IF v_product.discount_price IS NOT NULL
      AND v_product.discount_price >= 0
      AND v_product.discount_price < COALESCE(v_product.price, 0)
      AND (v_product.offer_ends_at IS NULL OR v_product.offer_ends_at > NOW())
    THEN
      v_unit := v_product.discount_price::NUMERIC;
    END IF;

    IF v_unit <= 0 THEN
      RAISE EXCEPTION 'Invalid product price';
    END IF;

    v_line_total := v_unit * v_qty;

    UPDATE public.products AS prod
    SET
      stock = prod.stock - v_qty,
      sold_count = COALESCE(prod.sold_count, 0) + v_qty,
      updated_at = NOW()
    WHERE prod.id = v_product.id
      AND prod.stock >= v_qty
      AND COALESCE(prod.is_active, false) = true
    RETURNING prod.id INTO v_row_id;

    IF v_row_id IS NULL THEN
      RAISE EXCEPTION 'Insufficient stock or product unavailable';
    END IF;

    v_db_merchandise := v_db_merchandise + v_line_total;

    v_display_name := COALESCE(NULLIF(TRIM(v_product.name), ''), 'Product');

    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_product.id,
        'product_name', v_display_name,
        'quantity', v_qty,
        'price', v_unit,
        'line_total', v_line_total
      )
    );
  END LOOP;

  v_expected_merch := COALESCE(p_merchandise_subtotal, p_subtotal);
  IF v_expected_merch IS NOT NULL AND ABS(v_db_merchandise - v_expected_merch) > 1 THEN
    RAISE EXCEPTION 'Order merchandise total does not match catalog pricing';
  END IF;

  INSERT INTO public.orders (
    customer_name, customer_phone, governorate_id, area,
    nearest_landmark, notes, subtotal, delivery_cost,
    discount, total, coupon_id, order_number, user_id,
    latitude, longitude, map_url,
    points_spent, points_discount, points_earned,
    merchant_id, payment_method, merchant_notes,
    merchandise_subtotal, discount_total, delivery_fee_charged,
    platform_commission_type, platform_commission_rate, platform_commission_amount,
    platform_assisted_fee_amount, platform_extra_fee_amount, courier_fee_payable,
    merchant_gross_amount, merchant_net_amount, gross_collected_amount, platform_net_revenue_amount,
    currency_code, financial_snapshot_version,
    payment_status, collection_status, settlement_status, cash_expected_amount,
    commission_rule_id, assisted_fee_rule_id, platform_fee_rule_id, delivery_billing_rule_id,
    resolved_plan_id, resolved_plan_code, commercial_snapshot_version
  ) VALUES (
    p_customer_name, p_customer_phone, p_governorate_id, p_area,
    p_nearest_landmark, p_notes, v_db_merchandise, p_delivery_cost,
    p_discount, p_total, p_coupon_id, 'TEMP', p_user_id,
    p_latitude, p_longitude, p_map_url,
    p_points_spent, p_points_discount, p_points_earned,
    v_merchant_id, p_payment_method, p_merchant_notes,
    v_db_merchandise,
    COALESCE(p_discount_total, p_discount),
    COALESCE(p_delivery_fee_charged, p_delivery_cost),
    p_platform_commission_type,
    COALESCE(p_platform_commission_rate, 0),
    COALESCE(p_platform_commission_amount, 0),
    COALESCE(p_platform_assisted_fee_amount, 0),
    COALESCE(p_platform_extra_fee_amount, 0),
    COALESCE(p_courier_fee_payable, 0),
    COALESCE(p_merchant_gross_amount, GREATEST(0, v_db_merchandise - p_discount)),
    COALESCE(p_merchant_net_amount, GREATEST(0, v_db_merchandise - p_discount)),
    COALESCE(p_gross_collected_amount, p_total),
    COALESCE(p_platform_net_revenue_amount, 0),
    COALESCE(p_currency_code, 'IQD'),
    COALESCE(p_financial_snapshot_version, 0),
    COALESCE(p_payment_status, 'unpaid'),
    COALESCE(p_collection_status, 'not_collected'),
    COALESCE(p_settlement_status, 'not_accrued'),
    COALESCE(p_cash_expected_amount, COALESCE(p_gross_collected_amount, p_total)),
    p_commission_rule_id, p_assisted_fee_rule_id, p_platform_fee_rule_id, p_delivery_billing_rule_id,
    p_resolved_plan_id, p_resolved_plan_code, COALESCE(p_commercial_snapshot_version, 0)
  ) RETURNING id, order_number INTO v_order_id, v_order_number;

  IF p_user_id IS NOT NULL AND p_points_spent > 0 THEN
    INSERT INTO public.loyalty_transactions (user_id, order_id, amount, transaction_type, description)
    VALUES (p_user_id, v_order_id, -p_points_spent, 'spend', 'استخدام نقاط في الطلب #' || v_order_number);
    UPDATE public.profiles SET points = public.get_available_points(p_user_id) WHERE id = p_user_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, price, merchant_id)
    VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'product_name'),
      (v_item->>'quantity')::INT,
      (v_item->>'price')::NUMERIC,
      v_merchant_id
    );
  END LOOP;

  IF p_coupon_id IS NOT NULL THEN
    PERFORM public.increment_coupon_usage(p_coupon_id);
  END IF;

  RETURN v_order_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
