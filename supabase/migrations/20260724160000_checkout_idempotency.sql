-- Migration: Checkout Idempotency & Post-Checkout Reliability (PR-3)
-- Timestamp: 20260724160000

-- 1. Create checkout_attempts table
CREATE TABLE IF NOT EXISTS public.checkout_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  order_id UUID NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  order_number TEXT NULL,
  error_code TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_checkout_attempts_user ON public.checkout_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_checkout_attempts_hash ON public.checkout_attempts(user_id, request_hash);

ALTER TABLE public.checkout_attempts ENABLE ROW LEVEL SECURITY;

-- 2. Expand orders table with checkout_attempt_id
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_attempt_id UUID NULL REFERENCES public.checkout_attempts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checkout_request_hash TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_attempt_id
  ON public.orders(checkout_attempt_id)
  WHERE checkout_attempt_id IS NOT NULL;

-- 3. Atomic Place Order Idempotent RPC
CREATE OR REPLACE FUNCTION public.place_order_idempotent(
  p_checkout_attempt_id UUID,
  p_checkout_request_hash TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_governorate_id UUID,
  p_area TEXT,
  p_nearest_landmark TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_subtotal NUMERIC DEFAULT 0,
  p_delivery_cost NUMERIC DEFAULT 0,
  p_discount NUMERIC DEFAULT 0,
  p_total NUMERIC DEFAULT 0,
  p_coupon_id UUID DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_user_id UUID DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_map_url TEXT DEFAULT NULL,
  p_points_spent INTEGER DEFAULT 0,
  p_points_discount NUMERIC DEFAULT 0,
  p_points_earned INTEGER DEFAULT 0,
  p_merchant_id UUID DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'cod',
  p_merchant_notes TEXT DEFAULT NULL,
  p_merchandise_subtotal NUMERIC DEFAULT 0,
  p_discount_total NUMERIC DEFAULT 0,
  p_delivery_fee_charged NUMERIC DEFAULT 0,
  p_platform_commission_type TEXT DEFAULT 'fixed',
  p_platform_commission_rate NUMERIC DEFAULT 0,
  p_platform_commission_amount NUMERIC DEFAULT 0,
  p_platform_assisted_fee_amount NUMERIC DEFAULT 0,
  p_platform_extra_fee_amount NUMERIC DEFAULT 0,
  p_courier_fee_payable NUMERIC DEFAULT 0,
  p_merchant_gross_amount NUMERIC DEFAULT 0,
  p_merchant_net_amount NUMERIC DEFAULT 0,
  p_gross_collected_amount NUMERIC DEFAULT 0,
  p_platform_net_revenue_amount NUMERIC DEFAULT 0,
  p_currency_code TEXT DEFAULT 'IQD',
  p_financial_snapshot_version INTEGER DEFAULT 1,
  p_payment_status TEXT DEFAULT 'unpaid',
  p_collection_status TEXT DEFAULT 'not_collected',
  p_settlement_status TEXT DEFAULT 'not_accrued',
  p_cash_expected_amount NUMERIC DEFAULT 0,
  p_commission_rule_id UUID DEFAULT NULL,
  p_assisted_fee_rule_id UUID DEFAULT NULL,
  p_platform_fee_rule_id UUID DEFAULT NULL,
  p_delivery_billing_rule_id UUID DEFAULT NULL,
  p_resolved_plan_id UUID DEFAULT NULL,
  p_resolved_plan_code TEXT DEFAULT NULL,
  p_commercial_snapshot_version INTEGER DEFAULT 1,
  p_channel TEXT DEFAULT 'web_checkout'
)
RETURNS JSONB AS $$
DECLARE
  v_attempt RECORD;
  v_order_number TEXT;
  v_order_id UUID;
  v_stale_threshold INTERVAL := INTERVAL '5 minutes';
  v_inserted_attempt_id UUID;
  v_attempt_created BOOLEAN := false;
BEGIN
  -- 1. Lock Attempt if ID provided
  IF p_checkout_attempt_id IS NOT NULL THEN
    -- Race-safe insert: ignore duplicate (concurrent request already inserted)
    INSERT INTO public.checkout_attempts (
      id, user_id, request_hash, status, created_at, updated_at
    ) VALUES (
      p_checkout_attempt_id, p_user_id, p_checkout_request_hash, 'processing', now(), now()
    ) ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_inserted_attempt_id;

    v_attempt_created := v_inserted_attempt_id IS NOT NULL;

    -- Now lock the row to read authoritative state
    SELECT * INTO v_attempt
    FROM public.checkout_attempts
    WHERE id = p_checkout_attempt_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CHECKOUT_ATTEMPT_NOT_FOUND: Attempt ID does not exist';
    END IF;

    -- Verify Ownership
    IF p_user_id IS NOT NULL AND v_attempt.user_id <> p_user_id THEN
      RAISE EXCEPTION 'CHECKOUT_ATTEMPT_OWNERSHIP_MISMATCH: Attempt belongs to a different user';
    END IF;

    -- Verify Request Hash
    IF v_attempt.request_hash <> p_checkout_request_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD: Attempt key used with different payload';
    END IF;

    IF NOT v_attempt_created THEN
      -- If already completed, return existing order_number directly
      IF v_attempt.status = 'completed' AND v_attempt.order_number IS NOT NULL THEN
        RETURN jsonb_build_object(
          'order_number', v_attempt.order_number,
          'order_id', v_attempt.order_id,
          'reused', true
        );
      END IF;

      -- If status is 'processing', check if it is stale (> 5 mins). If not stale, raise CHECKOUT_IN_PROGRESS.
      IF v_attempt.status = 'processing' AND (now() - v_attempt.updated_at) < v_stale_threshold THEN
        RAISE EXCEPTION 'CHECKOUT_IN_PROGRESS: Attempt is actively being processed';
      END IF;

      -- Reset attempt back to processing and clear errors
      UPDATE public.checkout_attempts
      SET status = 'processing',
          error_code = NULL,
          updated_at = now()
      WHERE id = p_checkout_attempt_id;
    END IF;
  END IF;

  -- 2. Execute canonical place_order logic via Named Parameters (safe against signature changes)
  v_order_number := public.place_order(
    p_customer_name          => p_customer_name,
    p_customer_phone         => p_customer_phone,
    p_governorate_id         => p_governorate_id,
    p_area                   => p_area,
    p_nearest_landmark       => p_nearest_landmark,
    p_notes                  => p_notes,
    p_subtotal               => p_subtotal,
    p_delivery_cost          => p_delivery_cost,
    p_discount               => p_discount,
    p_total                  => p_total,
    p_coupon_id              => p_coupon_id,
    p_items                  => p_items,
    p_user_id                => p_user_id,
    p_latitude               => p_latitude,
    p_longitude              => p_longitude,
    p_map_url                => p_map_url,
    p_points_spent           => p_points_spent,
    p_points_discount        => p_points_discount,
    p_points_earned          => p_points_earned,
    p_merchant_id            => p_merchant_id,
    p_payment_method         => p_payment_method,
    p_merchant_notes         => p_merchant_notes,
    p_merchandise_subtotal   => p_merchandise_subtotal,
    p_discount_total         => p_discount_total,
    p_delivery_fee_charged   => p_delivery_fee_charged,
    p_platform_commission_type   => p_platform_commission_type,
    p_platform_commission_rate   => p_platform_commission_rate,
    p_platform_commission_amount => p_platform_commission_amount,
    p_platform_assisted_fee_amount => p_platform_assisted_fee_amount,
    p_platform_extra_fee_amount    => p_platform_extra_fee_amount,
    p_courier_fee_payable          => p_courier_fee_payable,
    p_merchant_gross_amount        => p_merchant_gross_amount,
    p_merchant_net_amount          => p_merchant_net_amount,
    p_gross_collected_amount       => p_gross_collected_amount,
    p_platform_net_revenue_amount  => p_platform_net_revenue_amount,
    p_currency_code                => p_currency_code,
    p_financial_snapshot_version   => p_financial_snapshot_version,
    p_payment_status               => p_payment_status,
    p_collection_status            => p_collection_status,
    p_settlement_status            => p_settlement_status,
    p_cash_expected_amount         => p_cash_expected_amount,
    p_commission_rule_id           => p_commission_rule_id,
    p_assisted_fee_rule_id         => p_assisted_fee_rule_id,
    p_platform_fee_rule_id         => p_platform_fee_rule_id,
    p_delivery_billing_rule_id     => p_delivery_billing_rule_id,
    p_resolved_plan_id             => p_resolved_plan_id,
    p_resolved_plan_code           => p_resolved_plan_code,
    p_commercial_snapshot_version  => p_commercial_snapshot_version,
    p_channel                      => p_channel
  );

  SELECT id INTO v_order_id FROM public.orders WHERE order_number = v_order_number;

  -- 3. Link Order to Attempt & Complete Attempt inside the SAME transaction
  IF p_checkout_attempt_id IS NOT NULL THEN
    UPDATE public.checkout_attempts
    SET status = 'completed',
        order_id = v_order_id,
        order_number = v_order_number,
        completed_at = now(),
        updated_at = now()
    WHERE id = p_checkout_attempt_id;

    UPDATE public.orders
    SET checkout_attempt_id = p_checkout_attempt_id,
        checkout_request_hash = p_checkout_request_hash
    WHERE id = v_order_id;
  END IF;

  RETURN jsonb_build_object(
    'order_number', v_order_number,
    'order_id', v_order_id,
    'reused', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.place_order_idempotent(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID, JSONB, UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER, NUMERIC, INTEGER, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, INTEGER, TEXT, TEXT, TEXT, NUMERIC, UUID, UUID, UUID, UUID, UUID, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_order_idempotent(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID, JSONB, UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER, NUMERIC, INTEGER, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, INTEGER, TEXT, TEXT, TEXT, NUMERIC, UUID, UUID, UUID, UUID, UUID, TEXT, INTEGER, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.place_order_idempotent(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID, JSONB, UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER, NUMERIC, INTEGER, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, INTEGER, TEXT, TEXT, TEXT, NUMERIC, UUID, UUID, UUID, UUID, UUID, TEXT, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.place_order_idempotent(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID, JSONB, UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER, NUMERIC, INTEGER, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, INTEGER, TEXT, TEXT, TEXT, NUMERIC, UUID, UUID, UUID, UUID, UUID, TEXT, INTEGER, TEXT) TO service_role;
