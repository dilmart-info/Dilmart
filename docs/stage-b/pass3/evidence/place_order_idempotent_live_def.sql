CREATE OR REPLACE FUNCTION public.place_order_idempotent(p_checkout_attempt_id uuid, p_checkout_request_hash text, p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_subtotal numeric DEFAULT 0, p_delivery_cost numeric DEFAULT 0, p_discount numeric DEFAULT 0, p_total numeric DEFAULT 0, p_coupon_id uuid DEFAULT NULL::uuid, p_items jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_map_url text DEFAULT NULL::text, p_points_spent integer DEFAULT 0, p_points_discount numeric DEFAULT 0, p_points_earned integer DEFAULT 0, p_merchant_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cod'::text, p_merchant_notes text DEFAULT NULL::text, p_merchandise_subtotal numeric DEFAULT 0, p_discount_total numeric DEFAULT 0, p_delivery_fee_charged numeric DEFAULT 0, p_platform_commission_type text DEFAULT 'fixed'::text, p_platform_commission_rate numeric DEFAULT 0, p_platform_commission_amount numeric DEFAULT 0, p_platform_assisted_fee_amount numeric DEFAULT 0, p_platform_extra_fee_amount numeric DEFAULT 0, p_courier_fee_payable numeric DEFAULT 0, p_merchant_gross_amount numeric DEFAULT 0, p_merchant_net_amount numeric DEFAULT 0, p_gross_collected_amount numeric DEFAULT 0, p_platform_net_revenue_amount numeric DEFAULT 0, p_currency_code text DEFAULT 'IQD'::text, p_financial_snapshot_version integer DEFAULT 1, p_payment_status text DEFAULT 'unpaid'::text, p_collection_status text DEFAULT 'not_collected'::text, p_settlement_status text DEFAULT 'not_accrued'::text, p_cash_expected_amount numeric DEFAULT 0, p_commission_rule_id uuid DEFAULT NULL::uuid, p_assisted_fee_rule_id uuid DEFAULT NULL::uuid, p_platform_fee_rule_id uuid DEFAULT NULL::uuid, p_delivery_billing_rule_id uuid DEFAULT NULL::uuid, p_resolved_plan_id uuid DEFAULT NULL::uuid, p_resolved_plan_code text DEFAULT NULL::text, p_commercial_snapshot_version integer DEFAULT 1, p_channel text DEFAULT 'web_checkout'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    INSERT INTO public.checkout_attempts (
      id, user_id, request_hash, status, created_at, updated_at
    ) VALUES (
      p_checkout_attempt_id, p_user_id, p_checkout_request_hash, 'processing', now(), now()
    ) ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_inserted_attempt_id;

    v_attempt_created := v_inserted_attempt_id IS NOT NULL;

    SELECT * INTO v_attempt
    FROM public.checkout_attempts
    WHERE id = p_checkout_attempt_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CHECKOUT_ATTEMPT_NOT_FOUND: Attempt ID does not exist';
    END IF;

    IF p_user_id IS NOT NULL AND v_attempt.user_id <> p_user_id THEN
      RAISE EXCEPTION 'CHECKOUT_ATTEMPT_OWNERSHIP_MISMATCH: Attempt belongs to a different user';
    END IF;

    IF v_attempt.request_hash <> p_checkout_request_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD: Attempt key used with different payload';
    END IF;

    IF NOT v_attempt_created THEN
      IF v_attempt.status = 'completed' AND v_attempt.order_number IS NOT NULL THEN
        RETURN jsonb_build_object(
          'order_number', v_attempt.order_number,
          'order_id', v_attempt.order_id,
          'reused', true
        );
      END IF;

      IF v_attempt.status = 'processing' AND (now() - v_attempt.updated_at) < v_stale_threshold THEN
        RAISE EXCEPTION 'CHECKOUT_IN_PROGRESS: Attempt is actively being processed';
      END IF;

      UPDATE public.checkout_attempts
      SET status = 'processing',
          error_code = NULL,
          updated_at = now()
      WHERE id = p_checkout_attempt_id;
    END IF;
  END IF;

  -- 2. Execute canonical place_order logic via Clean Named Parameters (49 parameters)
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
$function$
