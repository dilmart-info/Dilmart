-- M13: Advanced Commercial Engine foundation.

CREATE TABLE IF NOT EXISTS public.merchant_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  default_commission_type TEXT NOT NULL DEFAULT 'percentage',
  default_commission_rate NUMERIC(12,4) NOT NULL DEFAULT 0,
  default_assisted_fee_rate NUMERIC(12,4) NOT NULL DEFAULT 0,
  default_platform_fee_rate NUMERIC(12,4) NOT NULL DEFAULT 0,
  default_delivery_billing_mode TEXT NOT NULL DEFAULT 'customer_pays',
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_plans_default_commission_type_check'
      AND conrelid = 'public.merchant_plans'::regclass
  ) THEN
    ALTER TABLE public.merchant_plans
      ADD CONSTRAINT merchant_plans_default_commission_type_check
      CHECK (default_commission_type IN ('percentage', 'fixed', 'hybrid'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_plans_default_delivery_billing_mode_check'
      AND conrelid = 'public.merchant_plans'::regclass
  ) THEN
    ALTER TABLE public.merchant_plans
      ADD CONSTRAINT merchant_plans_default_delivery_billing_mode_check
      CHECK (default_delivery_billing_mode IN ('customer_pays', 'merchant_pays', 'mixed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_merchant_plans_is_active ON public.merchant_plans(is_active);

CREATE TABLE IF NOT EXISTS public.merchant_plan_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.merchant_plans(id) ON DELETE RESTRICT,
  start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_plan_assignments_merchant
  ON public.merchant_plan_assignments(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_plan_assignments_active
  ON public.merchant_plan_assignments(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_plan_assignments_one_active
  ON public.merchant_plan_assignments(merchant_id)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.commercial_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_reference_id UUID,
  priority INTEGER NOT NULL DEFAULT 0,
  value_type TEXT NOT NULL DEFAULT 'percentage',
  value NUMERIC(12,4) NOT NULL DEFAULT 0,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commercial_rules_rule_type_check'
      AND conrelid = 'public.commercial_rules'::regclass
  ) THEN
    ALTER TABLE public.commercial_rules
      ADD CONSTRAINT commercial_rules_rule_type_check
      CHECK (rule_type IN ('commission', 'assisted_fee', 'platform_fee', 'delivery_billing'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commercial_rules_scope_type_check'
      AND conrelid = 'public.commercial_rules'::regclass
  ) THEN
    ALTER TABLE public.commercial_rules
      ADD CONSTRAINT commercial_rules_scope_type_check
      CHECK (scope_type IN ('global', 'merchant', 'category', 'channel', 'merchant_category', 'merchant_channel'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commercial_rules_value_type_check'
      AND conrelid = 'public.commercial_rules'::regclass
  ) THEN
    ALTER TABLE public.commercial_rules
      ADD CONSTRAINT commercial_rules_value_type_check
      CHECK (value_type IN ('percentage', 'fixed', 'hybrid'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_commercial_rules_rule_type ON public.commercial_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_commercial_rules_scope_type ON public.commercial_rules(scope_type);
CREATE INDEX IF NOT EXISTS idx_commercial_rules_is_active ON public.commercial_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_commercial_rules_priority ON public.commercial_rules(priority DESC);
CREATE INDEX IF NOT EXISTS idx_commercial_rules_active_window ON public.commercial_rules(start_at, end_at);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS commission_rule_id UUID REFERENCES public.commercial_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assisted_fee_rule_id UUID REFERENCES public.commercial_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS platform_fee_rule_id UUID REFERENCES public.commercial_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_billing_rule_id UUID REFERENCES public.commercial_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_plan_id UUID REFERENCES public.merchant_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_plan_code TEXT,
  ADD COLUMN IF NOT EXISTS commercial_snapshot_version INTEGER NOT NULL DEFAULT 0;

-- Extend place_order to persist commercial rule/plan snapshot.
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
    payment_status, collection_status, settlement_status, cash_expected_amount,
    commission_rule_id, assisted_fee_rule_id, platform_fee_rule_id, delivery_billing_rule_id,
    resolved_plan_id, resolved_plan_code, commercial_snapshot_version
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
    COALESCE(p_cash_expected_amount, COALESCE(p_gross_collected_amount, p_total)),
    p_commission_rule_id, p_assisted_fee_rule_id, p_platform_fee_rule_id, p_delivery_billing_rule_id,
    p_resolved_plan_id, p_resolved_plan_code, COALESCE(p_commercial_snapshot_version, 0)
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
