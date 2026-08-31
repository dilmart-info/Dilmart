-- ==============================================================================
-- DILMART — STAGE B PASS 3
-- MIGRATION A: PLACE_ORDER AUTHORITY & SIGNATURE REFACTOR (HARDENED)
-- ==============================================================================
-- 1. Refactors public.place_order to remove 6 obsolete StylAi / Barber / B2B arguments:
--    - p_source_app
--    - p_store_linked_profile_id
--    - p_dilmart_user_id
--    - p_dilmart_barbershop_id
--    - p_segment
--    - p_business_type
--    Retains modern p_channel (Total parameters: 55 -> 49).
-- 2. Removes writes to orders legacy columns from function body.
-- 3. Updates public.place_order_idempotent wrapper.
-- 4. Enforces strict atomic rename-first sequence to prevent ambiguous overloads.
-- 5. Exact identity verification in preflight and postconditions.
-- ==============================================================================

BEGIN;

-- ─── 1. PREFLIGHT EXACT IDENTITY ASSERTIONS ──────────────────────────────────
DO $$
DECLARE
  v_old_count INT;
  v_old_identity TEXT;
  v_expected_old_identity TEXT := 'p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric, p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid, p_latitude double precision, p_longitude double precision, p_map_url text, p_points_spent integer, p_points_discount numeric, p_points_earned integer, p_merchant_id uuid, p_payment_method text, p_merchant_notes text, p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric, p_platform_commission_type text, p_platform_commission_rate numeric, p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric, p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric, p_merchant_gross_amount numeric, p_merchant_net_amount numeric, p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric, p_currency_code text, p_financial_snapshot_version integer, p_payment_status text, p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric, p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid, p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text, p_commercial_snapshot_version integer, p_source_app text, p_channel text, p_store_linked_profile_id uuid, p_dilmart_user_id uuid, p_dilmart_barbershop_id uuid, p_segment text, p_business_type text';
  v_idempotent_identity TEXT;
  v_expected_idempotent_identity TEXT := 'p_checkout_attempt_id uuid, p_checkout_request_hash text, p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric, p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid, p_latitude double precision, p_longitude double precision, p_map_url text, p_points_spent integer, p_points_discount numeric, p_points_earned integer, p_merchant_id uuid, p_payment_method text, p_merchant_notes text, p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric, p_platform_commission_type text, p_platform_commission_rate numeric, p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric, p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric, p_merchant_gross_amount numeric, p_merchant_net_amount numeric, p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric, p_currency_code text, p_financial_snapshot_version integer, p_payment_status text, p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric, p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid, p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text, p_commercial_snapshot_version integer, p_channel text';
BEGIN
  -- Assert exactly 1 place_order function exists
  SELECT count(*) INTO v_old_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_old_count <> 1 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: Expected exactly 1 public.place_order function, found %', v_old_count;
  END IF;

  -- Assert exact identity arguments of old place_order
  SELECT pg_get_function_identity_arguments(p.oid) INTO v_old_identity
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_old_identity <> v_expected_old_identity THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: Current public.place_order identity arguments [%] do not match reviewed live authority [%]', v_old_identity, v_expected_old_identity;
  END IF;

  -- Assert exact identity arguments of place_order_idempotent
  SELECT pg_get_function_identity_arguments(p.oid) INTO v_idempotent_identity
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_idempotent';

  IF v_idempotent_identity IS NULL OR v_idempotent_identity <> v_expected_idempotent_identity THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: public.place_order_idempotent identity arguments [%] do not match expected [%]', v_idempotent_identity, v_expected_idempotent_identity;
  END IF;
END $$;

-- ─── 2. RENAME OLD FUNCTION TO TEMPORARY LEGACY IDENTITY ──────────────────────
ALTER FUNCTION public.place_order(
  text, text, uuid, text, text, text, numeric, numeric, numeric, numeric,
  uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid,
  text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text,
  numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text,
  uuid, uuid, uuid, text, text
)
RENAME TO place_order_legacy_stageb;

-- ─── 3. CREATE CLEAN 49-PARAMETER PUBLIC.PLACE_ORDER ──────────────────────────
CREATE FUNCTION public.place_order(
  -- ── Customer / Delivery ────────────────────────────────────────────────────
  p_customer_name           TEXT,
  p_customer_phone          TEXT,
  p_governorate_id          UUID,
  p_area                    TEXT,
  p_nearest_landmark        TEXT    DEFAULT NULL,
  p_notes                   TEXT    DEFAULT NULL,
  -- ── Financials ─────────────────────────────────────────────────────────────
  p_subtotal                NUMERIC DEFAULT 0,
  p_delivery_cost           NUMERIC DEFAULT 0,
  p_discount                NUMERIC DEFAULT 0,
  p_total                   NUMERIC DEFAULT 0,
  p_coupon_id               UUID    DEFAULT NULL,
  p_items                   JSONB   DEFAULT '[]'::jsonb,
  -- ── Identity ───────────────────────────────────────────────────────────────
  p_user_id                 UUID    DEFAULT NULL,
  -- ── GPS ────────────────────────────────────────────────────────────────────
  p_latitude                DOUBLE PRECISION DEFAULT NULL,
  p_longitude               DOUBLE PRECISION DEFAULT NULL,
  p_map_url                 TEXT    DEFAULT NULL,
  -- ── Loyalty ────────────────────────────────────────────────────────────────
  p_points_spent            INTEGER DEFAULT 0,
  p_points_discount         NUMERIC DEFAULT 0,
  p_points_earned           INTEGER DEFAULT 0,
  -- ── Merchant / Payment ─────────────────────────────────────────────────────
  p_merchant_id             UUID    DEFAULT NULL,
  p_payment_method          TEXT    DEFAULT 'cod',
  p_merchant_notes          TEXT    DEFAULT NULL,
  -- ── Financial Snapshot ─────────────────────────────────────────────────────
  p_merchandise_subtotal    NUMERIC DEFAULT NULL,
  p_discount_total          NUMERIC DEFAULT NULL,
  p_delivery_fee_charged    NUMERIC DEFAULT NULL,
  p_platform_commission_type    TEXT    DEFAULT 'fixed',
  p_platform_commission_rate    NUMERIC DEFAULT 0,
  p_platform_commission_amount  NUMERIC DEFAULT 0,
  p_platform_assisted_fee_amount NUMERIC DEFAULT 0,
  p_platform_extra_fee_amount   NUMERIC DEFAULT 0,
  p_courier_fee_payable         NUMERIC DEFAULT 0,
  p_merchant_gross_amount       NUMERIC DEFAULT NULL,
  p_merchant_net_amount         NUMERIC DEFAULT NULL,
  p_gross_collected_amount      NUMERIC DEFAULT NULL,
  p_platform_net_revenue_amount NUMERIC DEFAULT 0,
  p_currency_code               TEXT    DEFAULT 'IQD',
  p_financial_snapshot_version  INTEGER DEFAULT 1,
  -- ── Status ──────────────────────────────────────────────────────────────────
  p_payment_status          TEXT    DEFAULT 'unpaid',
  p_collection_status       TEXT    DEFAULT 'not_collected',
  p_settlement_status       TEXT    DEFAULT 'not_accrued',
  p_cash_expected_amount    NUMERIC DEFAULT NULL,
  -- ── Commercial Rules ───────────────────────────────────────────────────────
  p_commission_rule_id      UUID    DEFAULT NULL,
  p_assisted_fee_rule_id    UUID    DEFAULT NULL,
  p_platform_fee_rule_id    UUID    DEFAULT NULL,
  p_delivery_billing_rule_id UUID   DEFAULT NULL,
  p_resolved_plan_id        UUID    DEFAULT NULL,
  p_resolved_plan_code      TEXT    DEFAULT NULL,
  p_commercial_snapshot_version INTEGER DEFAULT 1,
  -- ── Channel Attribution ────────────────────────────────────────────────────
  p_channel                 TEXT    DEFAULT 'web_checkout'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id                UUID;
  v_order_number            TEXT;
  v_item                    JSONB;
  v_merchant_id             UUID;
  v_distinct_merchant_count INT;
  v_product                 RECORD;
  v_qty                     INT;
  v_unit                    NUMERIC;
  v_line_total              NUMERIC;
  v_db_merchandise          NUMERIC := 0;
  v_lines                   JSONB   := '[]'::JSONB;
  v_expected_merch          NUMERIC;
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
      RAISE EXCEPTION 'Product not found: %', (v_item->>'product_id');
    END IF;

    IF NOT v_product.is_active THEN
      RAISE EXCEPTION 'Product is not available: %', v_product.id;
    END IF;

    IF (v_product.visibility_status IS NOT NULL AND v_product.visibility_status = 'archived') THEN
      RAISE EXCEPTION 'Product is not available for sale: %', v_product.id;
    END IF;

    IF v_product.merchant_status <> 'active' THEN
      RAISE EXCEPTION 'Merchant is not available for orders';
    END IF;

    DECLARE
      v_price      NUMERIC := COALESCE(v_product.price, 0);
      v_disc       NUMERIC;
      v_offer_ok   BOOLEAN;
    BEGIN
      IF v_product.discount_price IS NOT NULL AND v_product.discount_price::text <> '' THEN
        v_disc := v_product.discount_price::NUMERIC;
      ELSE
        v_disc := NULL;
      END IF;

      v_offer_ok := (v_product.offer_ends_at IS NULL OR v_product.offer_ends_at::TIMESTAMPTZ > NOW());

      IF v_disc IS NOT NULL AND v_disc >= 0 AND v_disc < v_price AND v_offer_ok THEN
        v_unit := v_disc;
      ELSE
        v_unit := v_price;
      END IF;
    END;

    IF v_unit <= 0 OR v_unit IS NULL THEN
      RAISE EXCEPTION 'Invalid catalog price for product: %', v_product.id;
    END IF;

    IF COALESCE(v_product.stock, 0) < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for product: %', v_product.id;
    END IF;

    v_line_total      := v_unit * v_qty;
    v_db_merchandise  := v_db_merchandise + v_line_total;

    UPDATE public.products
    SET
      stock      = stock - v_qty,
      sold_count = COALESCE(sold_count, 0) + v_qty,
      updated_at = NOW()
    WHERE id = v_product.id;

    v_lines := v_lines || jsonb_build_object(
      'product_id',   v_product.id,
      'product_name', COALESCE(TRIM(v_product.name), 'Product'),
      'quantity',     v_qty,
      'price',        v_unit
    );
  END LOOP;

  v_expected_merch := COALESCE(p_merchandise_subtotal, p_subtotal);
  IF v_expected_merch IS NOT NULL AND ABS(v_db_merchandise - v_expected_merch) > 1 THEN
    RAISE EXCEPTION 'Order merchandise total does not match catalog pricing';
  END IF;

  INSERT INTO public.orders (
    -- ── Customer / Delivery ──────────────────────────────────────────────────
    customer_name, customer_phone, governorate_id, area,
    nearest_landmark, notes, subtotal, delivery_cost,
    discount, total, coupon_id, order_number, user_id,
    latitude, longitude, map_url,
    -- ── Loyalty ─────────────────────────────────────────────────────────────
    points_spent, points_discount, points_earned,
    -- ── Merchant / Payment ──────────────────────────────────────────────────
    merchant_id, payment_method, merchant_notes,
    -- ── Financial Snapshot ──────────────────────────────────────────────────
    merchandise_subtotal, discount_total, delivery_fee_charged,
    platform_commission_type, platform_commission_rate, platform_commission_amount,
    platform_assisted_fee_amount, platform_extra_fee_amount, courier_fee_payable,
    merchant_gross_amount, merchant_net_amount, gross_collected_amount, platform_net_revenue_amount,
    currency_code, financial_snapshot_version,
    -- ── Status ──────────────────────────────────────────────────────────────
    payment_status, collection_status, settlement_status, cash_expected_amount,
    -- ── Commercial Rules ────────────────────────────────────────────────────
    commission_rule_id, assisted_fee_rule_id, platform_fee_rule_id, delivery_billing_rule_id,
    resolved_plan_id, resolved_plan_code, commercial_snapshot_version,
    -- ── Active Modern Channel Attribution ───────────────────────────────────
    channel
  ) VALUES (
    -- ── Customer / Delivery ──────────────────────────────────────────────────
    p_customer_name, p_customer_phone, p_governorate_id, p_area,
    p_nearest_landmark, p_notes, v_db_merchandise, p_delivery_cost,
    p_discount, p_total, p_coupon_id, 'TEMP', p_user_id,
    p_latitude, p_longitude, p_map_url,
    -- ── Loyalty ─────────────────────────────────────────────────────────────
    p_points_spent, p_points_discount, p_points_earned,
    -- ── Merchant / Payment ──────────────────────────────────────────────────
    v_merchant_id, p_payment_method, p_merchant_notes,
    -- ── Financial Snapshot ──────────────────────────────────────────────────
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
    COALESCE(p_financial_snapshot_version, 1),
    -- ── Status ──────────────────────────────────────────────────────────────
    COALESCE(p_payment_status, 'unpaid'),
    COALESCE(p_collection_status, 'not_collected'),
    COALESCE(p_settlement_status, 'not_accrued'),
    COALESCE(p_cash_expected_amount, COALESCE(p_gross_collected_amount, p_total)),
    -- ── Commercial Rules ────────────────────────────────────────────────────
    p_commission_rule_id, p_assisted_fee_rule_id, p_platform_fee_rule_id, p_delivery_billing_rule_id,
    p_resolved_plan_id, p_resolved_plan_code, COALESCE(p_commercial_snapshot_version, 1),
    -- ── Active Modern Channel Attribution ───────────────────────────────────
    COALESCE(p_channel, 'web_checkout')
  ) RETURNING id, order_number INTO v_order_id, v_order_number;

  IF p_user_id IS NOT NULL AND p_points_spent > 0 THEN
    INSERT INTO public.loyalty_transactions (user_id, order_id, amount, transaction_type, description)
    VALUES (p_user_id, v_order_id, -p_points_spent, 'spend', 'نقاط مستخدمة في الطلب #' || v_order_number);
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
$$;

-- ─── 4. RE-CREATE PLACE_ORDER_IDEMPOTENT DELEGATING TO NEW PLACE_ORDER ────────
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
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

-- ─── 5. EXPLICIT OWNER PRESERVATION ───────────────────────────────────────────
ALTER FUNCTION public.place_order(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  UUID, JSONB, UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER, NUMERIC, INTEGER, UUID,
  TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, INTEGER, TEXT, TEXT, TEXT,
  NUMERIC, UUID, UUID, UUID, UUID, UUID, TEXT, INTEGER, TEXT
) OWNER TO postgres;

ALTER FUNCTION public.place_order_idempotent(
  UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  UUID, JSONB, UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER, NUMERIC, INTEGER, UUID,
  TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, INTEGER, TEXT, TEXT, TEXT,
  NUMERIC, UUID, UUID, UUID, UUID, UUID, TEXT, INTEGER, TEXT
) OWNER TO postgres;

-- ─── 6. APPLY STRICT SECURITY & PRIVILEGE ACLs ────────────────────────────────
REVOKE ALL ON FUNCTION public.place_order(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  UUID, JSONB, UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER, NUMERIC, INTEGER, UUID,
  TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, INTEGER, TEXT, TEXT, TEXT,
  NUMERIC, UUID, UUID, UUID, UUID, UUID, TEXT, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.place_order(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  UUID, JSONB, UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER, NUMERIC, INTEGER, UUID,
  TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, INTEGER, TEXT, TEXT, TEXT,
  NUMERIC, UUID, UUID, UUID, UUID, UUID, TEXT, INTEGER, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.place_order_idempotent(
  UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  UUID, JSONB, UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER, NUMERIC, INTEGER, UUID,
  TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, INTEGER, TEXT, TEXT, TEXT,
  NUMERIC, UUID, UUID, UUID, UUID, UUID, TEXT, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.place_order_idempotent(
  UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  UUID, JSONB, UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER, NUMERIC, INTEGER, UUID,
  TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, INTEGER, TEXT, TEXT, TEXT,
  NUMERIC, UUID, UUID, UUID, UUID, UUID, TEXT, INTEGER, TEXT
) TO service_role;

-- ─── 7. DROP TEMPORARY LEGACY FUNCTION UNDER RESTRICT ─────────────────────────
DROP FUNCTION public.place_order_legacy_stageb(
  text, text, uuid, text, text, text, numeric, numeric, numeric, numeric,
  uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid,
  text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text,
  numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text,
  uuid, uuid, uuid, text, text
) RESTRICT;

-- ─── 8. POST-TRANSITION HARDENED ASSERTIONS ───────────────────────────────────
DO $$
DECLARE
  v_po_rec RECORD;
  v_poi_rec RECORD;
  v_expected_po_identity TEXT := 'p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric, p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid, p_latitude double precision, p_longitude double precision, p_map_url text, p_points_spent integer, p_points_discount numeric, p_points_earned integer, p_merchant_id uuid, p_payment_method text, p_merchant_notes text, p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric, p_platform_commission_type text, p_platform_commission_rate numeric, p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric, p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric, p_merchant_gross_amount numeric, p_merchant_net_amount numeric, p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric, p_currency_code text, p_financial_snapshot_version integer, p_payment_status text, p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric, p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid, p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text, p_commercial_snapshot_version integer, p_channel text';
  v_expected_idempotent_identity TEXT := 'p_checkout_attempt_id uuid, p_checkout_request_hash text, p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric, p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid, p_latitude double precision, p_longitude double precision, p_map_url text, p_points_spent integer, p_points_discount numeric, p_points_earned integer, p_merchant_id uuid, p_payment_method text, p_merchant_notes text, p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric, p_platform_commission_type text, p_platform_commission_rate numeric, p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric, p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric, p_merchant_gross_amount numeric, p_merchant_net_amount numeric, p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric, p_currency_code text, p_financial_snapshot_version integer, p_payment_status text, p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric, p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid, p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text, p_commercial_snapshot_version integer, p_channel text';
BEGIN
  -- Assert exactly 1 place_order exists
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'place_order') <> 1 THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: Expected exactly 1 public.place_order function';
  END IF;

  -- Inspect place_order
  SELECT
    p.oid,
    p.pronargs,
    pg_get_function_identity_arguments(p.oid) AS identity_args,
    p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner_name,
    p.proconfig
  INTO v_po_rec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_po_rec.pronargs <> 49 THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: Expected 49 arguments on public.place_order, found %', v_po_rec.pronargs;
  END IF;

  IF v_po_rec.identity_args <> v_expected_po_identity THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: public.place_order identity arguments [%] do not match expected [%]', v_po_rec.identity_args, v_expected_po_identity;
  END IF;

  IF NOT v_po_rec.prosecdef THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: public.place_order is not SECURITY DEFINER';
  END IF;

  IF v_po_rec.owner_name <> 'postgres' THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: public.place_order owner [%] is not postgres', v_po_rec.owner_name;
  END IF;

  IF NOT ('search_path=public, pg_temp' = ANY(v_po_rec.proconfig)) THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: public.place_order search_path is not pinned to public, pg_temp';
  END IF;

  -- Assert temporary function is absent
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'place_order_legacy_stageb') THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: Temporary legacy function place_order_legacy_stageb still exists';
  END IF;

  -- Inspect place_order_idempotent
  SELECT
    p.oid,
    p.pronargs,
    pg_get_function_identity_arguments(p.oid) AS identity_args,
    p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner_name,
    p.proconfig
  INTO v_poi_rec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_idempotent';

  IF v_poi_rec.pronargs <> 51 THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: Expected 51 arguments on public.place_order_idempotent, found %', v_poi_rec.pronargs;
  END IF;

  IF v_poi_rec.identity_args <> v_expected_idempotent_identity THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: public.place_order_idempotent identity arguments [%] do not match expected [%]', v_poi_rec.identity_args, v_expected_idempotent_identity;
  END IF;

  IF NOT v_poi_rec.prosecdef THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: public.place_order_idempotent is not SECURITY DEFINER';
  END IF;

  IF v_poi_rec.owner_name <> 'postgres' THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: public.place_order_idempotent owner [%] is not postgres', v_poi_rec.owner_name;
  END IF;

  -- Assert ACL Privileges on both functions
  IF NOT has_function_privilege('service_role', v_po_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: service_role lacks EXECUTE on public.place_order';
  END IF;
  IF has_function_privilege('anon', v_po_rec.oid, 'EXECUTE') OR has_function_privilege('authenticated', v_po_rec.oid, 'EXECUTE') OR has_function_privilege('public', v_po_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: Non-service-role role has EXECUTE on public.place_order';
  END IF;

  IF NOT has_function_privilege('service_role', v_poi_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: service_role lacks EXECUTE on public.place_order_idempotent';
  END IF;
  IF has_function_privilege('anon', v_poi_rec.oid, 'EXECUTE') OR has_function_privilege('authenticated', v_poi_rec.oid, 'EXECUTE') OR has_function_privilege('public', v_poi_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: Non-service-role role has EXECUTE on public.place_order_idempotent';
  END IF;
END $$;

COMMIT;
