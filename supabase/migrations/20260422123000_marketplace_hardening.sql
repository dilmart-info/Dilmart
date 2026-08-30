-- Marketplace hardening: enforce merchant integrity across checkout/order path

-- 1) Coupon validation becomes merchant-aware (backward-compatible via default arg)
CREATE OR REPLACE FUNCTION public.validate_coupon(
  p_code TEXT,
  p_total NUMERIC,
  p_merchant_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_coupon RECORD;
BEGIN
  SELECT *
  INTO v_coupon
  FROM public.coupons
  WHERE UPPER(code) = UPPER(p_code);

  IF v_coupon IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'message', 'الكوبون غير موجود');
  END IF;

  IF v_coupon.is_active = false THEN
    RETURN jsonb_build_object('valid', false, 'message', 'الكوبون غير نشط');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'message', 'الكوبون منتهي الصلاحية');
  END IF;

  IF v_coupon.starts_at IS NOT NULL AND v_coupon.starts_at > now() THEN
    RETURN jsonb_build_object('valid', false, 'message', 'الكوبون لم يبدأ بعد');
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'message', 'تم استنفاد عدد مرات استخدام الكوبون');
  END IF;

  IF p_total < COALESCE(v_coupon.min_order_amount, 0) THEN
    RETURN jsonb_build_object('valid', false, 'message', 'مبلغ الطلب أقل من الحد الأدنى للكوبون');
  END IF;

  IF p_merchant_id IS NOT NULL AND v_coupon.merchant_id IS NOT NULL AND v_coupon.merchant_id <> p_merchant_id THEN
    RETURN jsonb_build_object('valid', false, 'message', 'الكوبون لا يخص هذا المتجر');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'id', v_coupon.id,
    'code', v_coupon.code,
    'discount_type', v_coupon.discount_type,
    'value', v_coupon.value
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) Trigger-level guard: order_items must match both order.merchant_id and product.merchant_id
CREATE OR REPLACE FUNCTION public.enforce_order_item_merchant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_merchant UUID;
  v_product_merchant UUID;
BEGIN
  SELECT merchant_id INTO v_order_merchant
  FROM public.orders
  WHERE id = NEW.order_id;

  IF v_order_merchant IS NULL THEN
    RAISE EXCEPTION 'Order merchant context is missing';
  END IF;

  SELECT merchant_id INTO v_product_merchant
  FROM public.products
  WHERE id = NEW.product_id;

  IF v_product_merchant IS NULL THEN
    RAISE EXCEPTION 'Product merchant context is missing';
  END IF;

  IF NEW.merchant_id IS DISTINCT FROM v_order_merchant OR NEW.merchant_id IS DISTINCT FROM v_product_merchant THEN
    RAISE EXCEPTION 'Order item merchant mismatch';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_item_merchant_consistency ON public.order_items;
CREATE TRIGGER trg_enforce_order_item_merchant_consistency
BEFORE INSERT OR UPDATE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_order_item_merchant_consistency();

-- 3) Harden place_order with strict merchant and coupon checks
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
  p_merchant_id UUID DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_merchant_id UUID;
  v_distinct_merchant_count INT;
  v_item_product_merchant UUID;
  v_coupon_merchant UUID;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order items cannot be empty';
  END IF;

  IF p_merchant_id IS NOT NULL THEN
    v_merchant_id := p_merchant_id;
  ELSE
    SELECT COUNT(DISTINCT p.merchant_id), MIN(p.merchant_id)
    INTO v_distinct_merchant_count, v_merchant_id
    FROM jsonb_array_elements(p_items) item
    JOIN public.products p ON p.id = (item->>'product_id')::UUID;

    IF v_distinct_merchant_count <> 1 OR v_merchant_id IS NULL THEN
      RAISE EXCEPTION 'Cart must contain products from exactly one merchant';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.merchants m
    WHERE m.id = v_merchant_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Merchant is not active';
  END IF;

  IF p_coupon_id IS NOT NULL THEN
    SELECT merchant_id INTO v_coupon_merchant
    FROM public.coupons
    WHERE id = p_coupon_id;

    IF v_coupon_merchant IS NOT NULL AND v_coupon_merchant <> v_merchant_id THEN
      RAISE EXCEPTION 'Coupon merchant mismatch';
    END IF;
  END IF;

  INSERT INTO public.orders (
    customer_name, customer_phone, governorate_id, area,
    nearest_landmark, notes, subtotal, delivery_cost,
    discount, total, coupon_id, order_number, user_id,
    latitude, longitude, map_url,
    points_spent, points_discount, points_earned,
    merchant_id
  ) VALUES (
    p_customer_name, p_customer_phone, p_governorate_id, p_area,
    p_nearest_landmark, p_notes, p_subtotal, p_delivery_cost,
    p_discount, p_total, p_coupon_id, 'TEMP', p_user_id,
    p_latitude, p_longitude, p_map_url,
    p_points_spent, p_points_discount, p_points_earned,
    v_merchant_id
  ) RETURNING id, order_number INTO v_order_id, v_order_number;

  IF p_user_id IS NOT NULL AND p_points_spent > 0 THEN
    INSERT INTO public.loyalty_transactions (user_id, order_id, amount, transaction_type, description)
    VALUES (p_user_id, v_order_id, -p_points_spent, 'spend', 'استخدام نقاط في الطلب #' || v_order_number);
    UPDATE public.profiles SET points = public.get_available_points(p_user_id) WHERE id = p_user_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT merchant_id INTO v_item_product_merchant
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID;

    IF v_item_product_merchant IS NULL OR v_item_product_merchant <> v_merchant_id THEN
      RAISE EXCEPTION 'Item merchant mismatch in order';
    END IF;

    IF (v_item ? 'merchant_id') AND (v_item->>'merchant_id')::UUID <> v_merchant_id THEN
      RAISE EXCEPTION 'Payload merchant mismatch in order item';
    END IF;

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
