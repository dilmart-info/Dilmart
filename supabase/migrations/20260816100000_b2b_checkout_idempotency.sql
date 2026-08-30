-- Migration: B2B Checkout Idempotency (Task 062 / Task 063 / Task 064)
-- Timestamp: 20260816100000
--
-- Purpose:
--   1. Extend checkout_attempts for B2B Store sessions (store_linked_profile_id)
--   2. Add orders.store_cart_id for durable order→cart lineage
--   3. Enforce ONE order per Store cart via unique partial index
--   4. Create atomic RPC place_b2b_cart_order_idempotent that unifies:
--      attempt + cart lock + order + cart conversion in ONE transaction
--
-- Backward Compatibility:
--   - Existing Web checkout_attempts rows have user_id NOT NULL — XOR constraint safe
--   - Existing Web checkout flow (place_order / place_order_idempotent) unchanged
--   - No existing orders have store_cart_id — unique partial index safe
--
-- FK Delete Semantics:
--   - checkout_attempts.store_linked_profile_id: ON DELETE RESTRICT (financial attempt history is protected)
--   - checkout_attempts.store_cart_id: ON DELETE RESTRICT (cart with financial attempt history cannot be silently deleted)
--   - orders.store_cart_id: ON DELETE SET NULL (cart deletion preserves financial order audit trail)

-- ─── 1. Extend checkout_attempts for B2B ────────────────────────────────────

ALTER TABLE public.checkout_attempts
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.checkout_attempts
  ADD COLUMN IF NOT EXISTS store_linked_profile_id UUID NULL
    REFERENCES public.store_linked_profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.checkout_attempts
  ADD COLUMN IF NOT EXISTS store_cart_id UUID NULL
    REFERENCES public.store_carts(id) ON DELETE RESTRICT;

-- Owner XOR & B2B Cart requirement:
-- Web attempt: user_id IS NOT NULL AND store_linked_profile_id IS NULL
-- B2B attempt: user_id IS NULL AND store_linked_profile_id IS NOT NULL AND store_cart_id IS NOT NULL
ALTER TABLE public.checkout_attempts
  ADD CONSTRAINT chk_checkout_attempts_owner_xor
  CHECK (
    (user_id IS NOT NULL AND store_linked_profile_id IS NULL)
    OR
    (user_id IS NULL AND store_linked_profile_id IS NOT NULL AND store_cart_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_checkout_attempts_linked_profile
  ON public.checkout_attempts(store_linked_profile_id)
  WHERE store_linked_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checkout_attempts_store_cart
  ON public.checkout_attempts(store_cart_id)
  WHERE store_cart_id IS NOT NULL;

-- ─── 2. Extend orders for durable cart linkage ──────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS store_cart_id UUID NULL
    REFERENCES public.store_carts(id) ON DELETE SET NULL;

-- One order per Store cart — defense-in-depth against duplicate orders
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_store_cart_id
  ON public.orders(store_cart_id)
  WHERE store_cart_id IS NOT NULL;

-- ─── 3. Atomic B2B Cart Order RPC ───────────────────────────────────────────
--
-- Single PostgreSQL transaction owns:
--   1. Attempt insert / completed-replay check
--   2. Cart row lock + ownership + version verification
--   3. Order creation via canonical place_order()
--   4. Order ↔ attempt linkage
--   5. Order ↔ cart linkage
--   6. Attempt completion
--   7. Cart status → converted
--
-- On ANY failure: entire transaction rolls back.
-- No committed checkout_in_progress can survive a process crash.

CREATE OR REPLACE FUNCTION public.place_b2b_cart_order_idempotent(
  -- ── Idempotency & B2B Identity (Required) ──────────────────────────────────
  p_checkout_attempt_id       UUID,
  p_checkout_request_hash     TEXT,
  p_store_linked_profile_id   UUID,
  p_store_cart_id             UUID,
  p_expected_cart_updated_at  TIMESTAMPTZ,
  -- ── Customer / Delivery (Required) ─────────────────────────────────────────
  p_customer_name             TEXT,
  p_customer_phone            TEXT,
  p_governorate_id            UUID,
  p_area                      TEXT,
  -- ── Financials (Required) ──────────────────────────────────────────────────
  p_subtotal                  NUMERIC,
  p_delivery_cost             NUMERIC,
  p_total                     NUMERIC,
  p_items                     JSONB,
  -- ── Optional Customer / Delivery ───────────────────────────────────────────
  p_nearest_landmark          TEXT DEFAULT NULL,
  p_notes                     TEXT DEFAULT NULL,
  p_discount                  NUMERIC DEFAULT 0,
  p_coupon_id                 UUID DEFAULT NULL,
  -- ── Optional GPS ───────────────────────────────────────────────────────────
  p_latitude                  DOUBLE PRECISION DEFAULT NULL,
  p_longitude                 DOUBLE PRECISION DEFAULT NULL,
  p_map_url                   TEXT DEFAULT NULL,
  -- ── Optional Merchant / Payment ────────────────────────────────────────────
  p_merchant_id               UUID DEFAULT NULL,
  -- ── Optional Financial Snapshot ────────────────────────────────────────────
  p_merchandise_subtotal      NUMERIC DEFAULT 0,
  p_discount_total            NUMERIC DEFAULT 0,
  p_delivery_fee_charged      NUMERIC DEFAULT 0,
  p_platform_commission_type  TEXT DEFAULT 'fixed',
  p_platform_commission_rate  NUMERIC DEFAULT 0,
  p_platform_commission_amount NUMERIC DEFAULT 0,
  p_platform_assisted_fee_amount NUMERIC DEFAULT 0,
  p_platform_extra_fee_amount NUMERIC DEFAULT 0,
  p_courier_fee_payable       NUMERIC DEFAULT 0,
  p_merchant_gross_amount     NUMERIC DEFAULT 0,
  p_merchant_net_amount       NUMERIC DEFAULT 0,
  p_gross_collected_amount    NUMERIC DEFAULT 0,
  p_platform_net_revenue_amount NUMERIC DEFAULT 0,
  p_currency_code             TEXT DEFAULT 'IQD',
  p_financial_snapshot_version INTEGER DEFAULT 1,
  -- ── Optional Payment / Settlement Status ───────────────────────────────────
  p_payment_status            TEXT DEFAULT 'unpaid',
  p_collection_status         TEXT DEFAULT 'not_collected',
  p_settlement_status         TEXT DEFAULT 'not_accrued',
  p_cash_expected_amount      NUMERIC DEFAULT 0,
  -- ── Optional Commercial Rules ──────────────────────────────────────────────
  p_commission_rule_id        UUID DEFAULT NULL,
  p_assisted_fee_rule_id      UUID DEFAULT NULL,
  p_platform_fee_rule_id      UUID DEFAULT NULL,
  p_delivery_billing_rule_id  UUID DEFAULT NULL,
  p_resolved_plan_id          UUID DEFAULT NULL,
  p_resolved_plan_code        TEXT DEFAULT NULL,
  p_commercial_snapshot_version INTEGER DEFAULT 1,
  -- ── Optional B2B Source Tracking ───────────────────────────────────────────
  p_source_app                TEXT DEFAULT 'barber_app',
  p_channel                   TEXT DEFAULT 'barber_app_checkout',
  p_DilMart_user_id            UUID DEFAULT NULL,
  p_DilMart_barbershop_id      UUID DEFAULT NULL,
  p_segment                   TEXT DEFAULT NULL,
  p_business_type             TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_attempt             RECORD;
  v_cart                 RECORD;
  v_order_number        TEXT;
  v_order_id            UUID;
  v_inserted_attempt_id UUID;
  v_attempt_created     BOOLEAN := false;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════════
  -- PHASE 1: Attempt Resolution (Idempotency Gate)
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Race-safe insert: ON CONFLICT DO NOTHING handles concurrent first-attempts
  INSERT INTO public.checkout_attempts (
    id, user_id, store_linked_profile_id, store_cart_id,
    request_hash, status, created_at, updated_at
  ) VALUES (
    p_checkout_attempt_id, NULL, p_store_linked_profile_id, p_store_cart_id,
    p_checkout_request_hash, 'processing', now(), now()
  ) ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted_attempt_id;

  v_attempt_created := v_inserted_attempt_id IS NOT NULL;

  -- Lock the attempt row for authoritative read
  SELECT * INTO v_attempt
  FROM public.checkout_attempts
  WHERE id = p_checkout_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'B2B_CHECKOUT_ATTEMPT_NOT_FOUND: Attempt ID does not exist';
  END IF;

  -- Ownership verification: must match verified session claims
  IF v_attempt.store_linked_profile_id IS NULL
     OR v_attempt.store_linked_profile_id <> p_store_linked_profile_id THEN
    RAISE EXCEPTION 'B2B_CHECKOUT_ATTEMPT_OWNERSHIP_MISMATCH: Attempt belongs to a different profile';
  END IF;

  -- Request hash verification
  IF v_attempt.request_hash <> p_checkout_request_hash THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD: Attempt key used with different payload';
  END IF;

  -- If not freshly created, check for completed replay
  IF NOT v_attempt_created THEN
    -- COMPLETED replay: return existing order immediately (BEFORE touching cart state)
    IF v_attempt.status = 'completed' AND v_attempt.order_number IS NOT NULL THEN
      RETURN jsonb_build_object(
        'order_id', v_attempt.order_id,
        'order_number', v_attempt.order_number,
        'checkout_attempt_id', p_checkout_attempt_id,
        'reused', true
      );
    END IF;

    -- Still processing (concurrent request) — reject if fresh (<5 min)
    IF v_attempt.status = 'processing' AND (now() - v_attempt.updated_at) < INTERVAL '5 minutes' THEN
      RAISE EXCEPTION 'B2B_CHECKOUT_IN_PROGRESS: Attempt is actively being processed';
    END IF;

    -- Stale processing or failed: reset for retry
    UPDATE public.checkout_attempts
    SET status = 'processing',
        error_code = NULL,
        store_cart_id = p_store_cart_id,
        updated_at = now()
    WHERE id = p_checkout_attempt_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- PHASE 2: Cart Lock + Version Guard (Transactional)
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Lock cart row and verify ownership + active status + version
  SELECT * INTO v_cart
  FROM public.store_carts
  WHERE id = p_store_cart_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'B2B_CART_NOT_FOUND: Cart does not exist';
  END IF;

  IF v_cart.store_linked_profile_id <> p_store_linked_profile_id THEN
    RAISE EXCEPTION 'B2B_CART_OWNERSHIP_MISMATCH: Cart belongs to a different profile';
  END IF;

  -- If cart is already converted, check if this cart already has an order
  IF v_cart.status = 'converted' THEN
    -- Look up the order created from this cart
    SELECT id, order_number INTO v_order_id, v_order_number
    FROM public.orders
    WHERE store_cart_id = p_store_cart_id
    LIMIT 1;

    IF v_order_id IS NOT NULL THEN
      -- Link this attempt to the existing order and mark completed
      UPDATE public.checkout_attempts
      SET status = 'completed',
          order_id = v_order_id,
          order_number = v_order_number,
          completed_at = now(),
          updated_at = now()
      WHERE id = p_checkout_attempt_id;

      RETURN jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'checkout_attempt_id', p_checkout_attempt_id,
        'reused', true
      );
    END IF;

    RAISE EXCEPTION 'B2B_CART_ALREADY_CONVERTED: Cart was already converted but order not found';
  END IF;

  IF v_cart.status <> 'active' THEN
    RAISE EXCEPTION 'B2B_CART_NOT_ACTIVE: Cart status is %, expected active', v_cart.status;
  END IF;

  -- Version guard: reject if cart changed between JS resolution and atomic commit
  IF v_cart.updated_at <> p_expected_cart_updated_at THEN
    RAISE EXCEPTION 'B2B_CART_CHANGED_DURING_CHECKOUT: Cart was modified between preview and submit';
  END IF;

  -- Transition cart to checkout_in_progress within this transaction
  UPDATE public.store_carts
  SET status = 'checkout_in_progress',
      updated_at = now()
  WHERE id = p_store_cart_id;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- PHASE 3: Order Creation (via canonical place_order)
  -- ═══════════════════════════════════════════════════════════════════════════

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
    p_user_id                => NULL,
    p_latitude               => p_latitude,
    p_longitude              => p_longitude,
    p_map_url                => p_map_url,
    p_points_spent           => 0,
    p_points_discount        => 0,
    p_points_earned          => 0,
    p_merchant_id            => p_merchant_id,
    p_payment_method         => 'cod',
    p_merchant_notes         => NULL,
    p_merchandise_subtotal   => p_merchandise_subtotal,
    p_discount_total         => p_discount_total,
    p_delivery_fee_charged   => p_delivery_fee_charged,
    p_platform_commission_type    => p_platform_commission_type,
    p_platform_commission_rate    => p_platform_commission_rate,
    p_platform_commission_amount  => p_platform_commission_amount,
    p_platform_assisted_fee_amount => p_platform_assisted_fee_amount,
    p_platform_extra_fee_amount   => p_platform_extra_fee_amount,
    p_courier_fee_payable         => p_courier_fee_payable,
    p_merchant_gross_amount       => p_merchant_gross_amount,
    p_merchant_net_amount         => p_merchant_net_amount,
    p_gross_collected_amount      => p_gross_collected_amount,
    p_platform_net_revenue_amount => p_platform_net_revenue_amount,
    p_currency_code               => p_currency_code,
    p_financial_snapshot_version  => p_financial_snapshot_version,
    p_payment_status              => p_payment_status,
    p_collection_status           => p_collection_status,
    p_settlement_status           => p_settlement_status,
    p_cash_expected_amount        => p_cash_expected_amount,
    p_commission_rule_id          => p_commission_rule_id,
    p_assisted_fee_rule_id        => p_assisted_fee_rule_id,
    p_platform_fee_rule_id        => p_platform_fee_rule_id,
    p_delivery_billing_rule_id    => p_delivery_billing_rule_id,
    p_resolved_plan_id            => p_resolved_plan_id,
    p_resolved_plan_code          => p_resolved_plan_code,
    p_commercial_snapshot_version => p_commercial_snapshot_version,
    p_source_app                  => p_source_app,
    p_channel                     => p_channel,
    p_store_linked_profile_id     => p_store_linked_profile_id,
    p_DilMart_user_id              => p_DilMart_user_id,
    p_DilMart_barbershop_id        => p_DilMart_barbershop_id,
    p_segment                     => p_segment,
    p_business_type               => p_business_type
  );

  -- ═══════════════════════════════════════════════════════════════════════════
  -- PHASE 4: Post-Order Linkage (Same Transaction)
  -- ═══════════════════════════════════════════════════════════════════════════

  -- Retrieve generated order ID
  SELECT id INTO v_order_id
  FROM public.orders
  WHERE order_number = v_order_number;

  -- Link order → attempt + cart
  UPDATE public.orders
  SET checkout_attempt_id = p_checkout_attempt_id,
      checkout_request_hash = p_checkout_request_hash,
      store_cart_id = p_store_cart_id
  WHERE id = v_order_id;

  -- Complete attempt
  UPDATE public.checkout_attempts
  SET status = 'completed',
      order_id = v_order_id,
      order_number = v_order_number,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_checkout_attempt_id;

  -- Convert cart (same transaction — atomic with order)
  UPDATE public.store_carts
  SET status = 'converted',
      updated_at = now()
  WHERE id = p_store_cart_id;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- PHASE 5: Return Structured Result
  -- ═══════════════════════════════════════════════════════════════════════════

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'checkout_attempt_id', p_checkout_attempt_id,
    'reused', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── 4. Security: REVOKE / GRANT ────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.place_b2b_cart_order_idempotent FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_b2b_cart_order_idempotent FROM anon;
REVOKE ALL ON FUNCTION public.place_b2b_cart_order_idempotent FROM authenticated;
GRANT EXECUTE ON FUNCTION public.place_b2b_cart_order_idempotent TO service_role;
