-- M11.3 + M11.4
-- Payment/collection/settlement states + COD collection tracking.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS collection_status TEXT NOT NULL DEFAULT 'not_collected',
  ADD COLUMN IF NOT EXISTS settlement_status TEXT NOT NULL DEFAULT 'not_accrued',
  ADD COLUMN IF NOT EXISTS cash_collected_by_type TEXT,
  ADD COLUMN IF NOT EXISTS cash_collected_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cash_collected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cash_expected_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cash_received_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS remitted_to_platform_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS remitted_to_merchant_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS collection_notes TEXT,
  ADD COLUMN IF NOT EXISTS collection_reference TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_payment_status_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_status_check
      CHECK (payment_status IN ('unpaid', 'authorized', 'paid', 'failed', 'refunded', 'partial_refund'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_collection_status_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_collection_status_check
      CHECK (collection_status IN ('not_collected', 'collected_from_customer', 'remitted_to_platform', 'remitted_to_merchant'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_settlement_status_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_settlement_status_check
      CHECK (settlement_status IN ('not_accrued', 'accrued', 'payable', 'in_payout', 'settled', 'partially_settled', 'reversed', 'disputed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_cash_collected_by_type_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_cash_collected_by_type_check
      CHECK (cash_collected_by_type IS NULL OR cash_collected_by_type IN ('courier', 'delivery_company', 'platform', 'merchant', 'unknown'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_collection_status ON public.orders(collection_status);
CREATE INDEX IF NOT EXISTS idx_orders_settlement_status ON public.orders(settlement_status);

CREATE TABLE IF NOT EXISTS public.collection_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  amount NUMERIC(12,2),
  actor_type TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  reference TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'collection_event_log_event_type_check'
      AND conrelid = 'public.collection_event_log'::regclass
  ) THEN
    ALTER TABLE public.collection_event_log
      ADD CONSTRAINT collection_event_log_event_type_check
      CHECK (event_type IN ('collected_from_customer', 'remitted_to_platform', 'remitted_to_merchant', 'adjustment', 'reversal'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'collection_event_log_actor_type_check'
      AND conrelid = 'public.collection_event_log'::regclass
  ) THEN
    ALTER TABLE public.collection_event_log
      ADD CONSTRAINT collection_event_log_actor_type_check
      CHECK (actor_type IN ('courier', 'delivery_company', 'platform', 'merchant', 'admin', 'system'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_collection_event_log_order_created
  ON public.collection_event_log(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_event_log_event_type
  ON public.collection_event_log(event_type);

-- Extend place_order to initialize payment/collection state snapshot.
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
  p_cash_expected_amount NUMERIC DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_merchant_id UUID;
  v_distinct_merchant_count INT;
  v_item_product_merchant UUID;
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
    payment_status, collection_status, settlement_status, cash_expected_amount
  ) VALUES (
    p_customer_name, p_customer_phone, p_governorate_id, p_area,
    p_nearest_landmark, p_notes, p_subtotal, p_delivery_cost,
    p_discount, p_total, p_coupon_id, 'TEMP', p_user_id,
    p_latitude, p_longitude, p_map_url,
    p_points_spent, p_points_discount, p_points_earned,
    v_merchant_id, p_payment_method, p_merchant_notes,
    COALESCE(p_merchandise_subtotal, p_subtotal),
    COALESCE(p_discount_total, p_discount),
    COALESCE(p_delivery_fee_charged, p_delivery_cost),
    p_platform_commission_type,
    COALESCE(p_platform_commission_rate, 0),
    COALESCE(p_platform_commission_amount, 0),
    COALESCE(p_platform_assisted_fee_amount, 0),
    COALESCE(p_platform_extra_fee_amount, 0),
    COALESCE(p_courier_fee_payable, 0),
    COALESCE(p_merchant_gross_amount, GREATEST(0, p_subtotal - p_discount)),
    COALESCE(p_merchant_net_amount, GREATEST(0, p_subtotal - p_discount)),
    COALESCE(p_gross_collected_amount, p_total),
    COALESCE(p_platform_net_revenue_amount, 0),
    COALESCE(p_currency_code, 'IQD'),
    COALESCE(p_financial_snapshot_version, 0),
    COALESCE(p_payment_status, 'unpaid'),
    COALESCE(p_collection_status, 'not_collected'),
    COALESCE(p_settlement_status, 'not_accrued'),
    COALESCE(p_cash_expected_amount, COALESCE(p_gross_collected_amount, p_total))
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
