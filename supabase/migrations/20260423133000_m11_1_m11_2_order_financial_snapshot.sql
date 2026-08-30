-- M11.1 + M11.2
-- Order financial snapshot fields + merchant commercial terms + place_order snapshot write.

-- 1) Merchant commercial terms (effective policy source for snapshotting).
CREATE TABLE IF NOT EXISTS public.merchant_commercial_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  commission_type TEXT NOT NULL DEFAULT 'percentage',
  commission_rate NUMERIC(10,4) NOT NULL DEFAULT 0,
  assisted_fee_rate NUMERIC(10,4) NOT NULL DEFAULT 0,
  cod_fee_mode TEXT NOT NULL DEFAULT 'none',
  delivery_billing_mode TEXT NOT NULL DEFAULT 'customer_pays',
  active_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  active_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_commercial_terms_commission_type_check'
      AND conrelid = 'public.merchant_commercial_terms'::regclass
  ) THEN
    ALTER TABLE public.merchant_commercial_terms
      ADD CONSTRAINT merchant_commercial_terms_commission_type_check
      CHECK (commission_type IN ('percentage', 'fixed', 'hybrid'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_commercial_terms_delivery_billing_mode_check'
      AND conrelid = 'public.merchant_commercial_terms'::regclass
  ) THEN
    ALTER TABLE public.merchant_commercial_terms
      ADD CONSTRAINT merchant_commercial_terms_delivery_billing_mode_check
      CHECK (delivery_billing_mode IN ('customer_pays', 'merchant_pays', 'mixed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_merchant_commercial_terms_merchant_active
  ON public.merchant_commercial_terms(merchant_id, is_active, active_from DESC);

CREATE OR REPLACE FUNCTION public.set_merchant_commercial_terms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_merchant_commercial_terms_set_updated_at ON public.merchant_commercial_terms;
CREATE TRIGGER trg_merchant_commercial_terms_set_updated_at
BEFORE UPDATE ON public.merchant_commercial_terms
FOR EACH ROW
EXECUTE FUNCTION public.set_merchant_commercial_terms_updated_at();

-- 2) Order financial snapshot fields.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS merchandise_subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee_charged NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_commission_type TEXT,
  ADD COLUMN IF NOT EXISTS platform_commission_rate NUMERIC(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_assisted_fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_extra_fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS courier_fee_payable NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchant_gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchant_net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_collected_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_net_revenue_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'IQD';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_platform_commission_type_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_platform_commission_type_check
      CHECK (platform_commission_type IS NULL OR platform_commission_type IN ('percentage', 'fixed', 'hybrid'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_finance_snapshot_version ON public.orders(financial_snapshot_version, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_finance_created ON public.orders(merchant_id, created_at DESC);

-- 3) Replace place_order to write snapshot in same transaction (single DB function call).
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
  p_financial_snapshot_version INTEGER DEFAULT 0
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
    currency_code, financial_snapshot_version
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
    COALESCE(p_financial_snapshot_version, 0)
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
