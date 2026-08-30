-- M20.5-R — Residual Hardening Closure

-- ============================================================
-- PHASE 1A: Add is_active + delivery_company_id to profiles
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_company_id uuid REFERENCES public.delivery_companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_delivery_company_id
  ON public.profiles(delivery_company_id)
  WHERE delivery_company_id IS NOT NULL;

-- ============================================================
-- PHASE 1B: Add idempotency_key to delivery_events
-- ============================================================

ALTER TABLE public.delivery_events
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_events_idempotency_key
  ON public.delivery_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ============================================================
-- PHASE 5: Atomic remittance RPC
-- All remittance fields updated atomically with collection_event_log insert.
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_cod_remittance_to_platform(
  p_order_id            uuid,
  p_actor_id            uuid,
  p_remitted_amount     numeric,
  p_expected_amount     numeric,
  p_difference          numeric,
  p_mode                text,
  p_offset_applied      boolean,
  p_notes               text    DEFAULT NULL,
  p_reference           text    DEFAULT NULL,
  p_courier_retained    numeric DEFAULT 0,
  p_idempotency_key     text    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now         timestamptz := now();
  v_col_status  text;
BEGIN
  -- Guard: only run if order exists and is delivered.
  SELECT collection_status INTO v_col_status
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Idempotency: if already remitted_to_platform, return success silently.
  IF v_col_status = 'remitted_to_platform' THEN
    RETURN;
  END IF;

  -- Block regression past remitted_to_platform.
  IF v_col_status IN ('remitted_to_merchant') THEN
    RAISE EXCEPTION 'Collection status regression not allowed: current=%', v_col_status;
  END IF;

  -- ── 1. Update order financial fields ──────────────────────────────────────
  UPDATE public.orders SET
    collection_status              = 'remitted_to_platform',
    remitted_to_platform_at        = v_now,
    cash_actual_remitted_amount    = p_remitted_amount,
    cash_remittance_difference     = p_difference,
    courier_fee_offset_applied     = p_offset_applied,
    courier_fee_offset_settled_at  = CASE WHEN p_offset_applied THEN v_now ELSE NULL END,
    courier_settlement_status      = CASE WHEN p_offset_applied THEN 'settled' ELSE courier_settlement_status END,
    collection_notes               = p_notes,
    collection_reference           = p_reference
  WHERE id = p_order_id;

  -- ── 2. Settle offset ledger entries if applicable ─────────────────────────
  IF p_offset_applied THEN
    UPDATE public.courier_ledger_entries SET
      status             = 'settled',
      settlement_method  = 'offset',
      settled_at         = v_now,
      description        = 'Courier fee offset against COD remittance'
    WHERE order_id  = p_order_id
      AND entry_type = 'delivery_fee_accrual'
      AND status IN ('accrued', 'payable', 'in_payout');
  END IF;

  -- ── 3. Append collection_event_log row (append-only) ─────────────────────
  INSERT INTO public.collection_event_log (
    order_id, event_type, amount, actor_type, actor_id,
    notes, reference,
    cash_remitted_to_platform_amount,
    courier_retained_amount,
    remittance_mode,
    idempotency_key,
    payload
  ) VALUES (
    p_order_id,
    'remitted_to_platform',
    p_remitted_amount,
    'admin',
    p_actor_id,
    p_notes,
    p_reference,
    p_remitted_amount,
    p_courier_retained,
    p_mode,
    p_idempotency_key,
    jsonb_build_object(
      'expected_amount', p_expected_amount,
      'difference', p_difference,
      'source', 'process_cod_remittance_to_platform'
    )
  );

  -- ── 4. Insert finance event ───────────────────────────────────────────────
  INSERT INTO public.order_finance_events (order_id, event_type, created_by, payload)
  SELECT
    p_order_id,
    'courier_net_remittance_recorded',
    p_actor_id,
    jsonb_build_object(
      'mode', p_mode,
      'expected_amount', p_expected_amount,
      'actual_amount', p_remitted_amount,
      'difference', p_difference
    )
  FROM public.orders WHERE id = p_order_id;

END;
$$;

GRANT EXECUTE ON FUNCTION public.process_cod_remittance_to_platform TO service_role;
GRANT EXECUTE ON FUNCTION public.process_cod_remittance_to_platform TO authenticated;

-- ============================================================
-- PHASE 7: Admin override delivery status RPC (audited)
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_override_delivery_status(
  p_order_id    uuid,
  p_next_status text,
  p_actor_id    uuid,
  p_reason      text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_status text;
  v_now         timestamptz := now();
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason is required for admin delivery override';
  END IF;

  SELECT COALESCE(delivery_status, 'pending_assignment') INTO v_from_status
  FROM public.orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Update order delivery_status + sync legacy status.
  UPDATE public.orders SET
    delivery_status  = p_next_status,
    delivered_at     = CASE WHEN p_next_status = 'delivered' THEN COALESCE(delivered_at, v_now) ELSE delivered_at END,
    returned_at      = CASE WHEN p_next_status = 'returned'  THEN COALESCE(returned_at,  v_now) ELSE returned_at  END,
    status           = CASE
      WHEN p_next_status IN ('delivered', 'cancelled', 'returned') THEN p_next_status
      ELSE status
    END
  WHERE id = p_order_id;

  -- Insert audited delivery_event.
  INSERT INTO public.delivery_events (
    order_id, event_type, from_status, to_status,
    actor_id, actor_type, notes, metadata
  ) VALUES (
    p_order_id,
    p_next_status,
    v_from_status,
    p_next_status,
    p_actor_id,
    'admin',
    p_reason,
    jsonb_build_object('override', true, 'reason', p_reason)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_override_delivery_status TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_override_delivery_status TO authenticated;
