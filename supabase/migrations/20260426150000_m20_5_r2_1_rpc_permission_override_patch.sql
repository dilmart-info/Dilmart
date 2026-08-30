-- M20.5-R2.1 — RPC Permission & Override Final Patch
-- Security closure for SECURITY DEFINER RPCs.

-- ============================================================
-- Phase 1: lock down EXECUTE permissions on critical RPCs
-- ============================================================

REVOKE ALL ON FUNCTION public.transition_delivery_status(
  uuid, text, text, uuid, text, jsonb, text, text, text, uuid, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_delivery_status(
  uuid, text, text, uuid, text, jsonb, text, text, text, uuid, uuid, text
) FROM anon;
REVOKE ALL ON FUNCTION public.transition_delivery_status(
  uuid, text, text, uuid, text, jsonb, text, text, text, uuid, uuid, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transition_delivery_status TO service_role;

REVOKE ALL ON FUNCTION public.process_cod_remittance_to_platform(
  uuid, uuid, numeric, numeric, numeric, text, boolean, text, text, numeric, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_cod_remittance_to_platform(
  uuid, uuid, numeric, numeric, numeric, text, boolean, text, text, numeric, text
) FROM anon;
REVOKE ALL ON FUNCTION public.process_cod_remittance_to_platform(
  uuid, uuid, numeric, numeric, numeric, text, boolean, text, text, numeric, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_cod_remittance_to_platform TO service_role;

REVOKE ALL ON FUNCTION public.admin_override_delivery_status(
  uuid, text, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_override_delivery_status(
  uuid, text, uuid, text
) FROM anon;
REVOKE ALL ON FUNCTION public.admin_override_delivery_status(
  uuid, text, uuid, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_override_delivery_status TO service_role;

-- Also lock this operational RPC (same SECURITY DEFINER risk class).
REVOKE ALL ON FUNCTION public.clear_order_agent_atomic(
  uuid, uuid, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_order_agent_atomic(
  uuid, uuid, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.clear_order_agent_atomic(
  uuid, uuid, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.clear_order_agent_atomic TO service_role;

-- ============================================================
-- Phase 2: tighten remittance idempotency behavior
-- - same idempotency key => safe no-op
-- - already remitted with different/no key => reject
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
  v_now              timestamptz := now();
  v_col_status       text;
  v_delivery_status  text;
  v_existing_key     text;
  v_key_seen         boolean;
BEGIN
  SELECT collection_status, COALESCE(delivery_status, status)
  INTO v_col_status, v_delivery_status
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_delivery_status <> 'delivered' THEN
    RAISE EXCEPTION
      'Remittance to platform requires delivery_status=delivered. Current: %', v_delivery_status;
  END IF;

  IF p_remitted_amount < 0 THEN
    RAISE EXCEPTION 'Remitted amount cannot be negative: %', p_remitted_amount;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.collection_event_log
      WHERE idempotency_key = p_idempotency_key
    ) INTO v_key_seen;

    IF v_key_seen THEN
      RETURN;
    END IF;
  END IF;

  IF v_col_status = 'remitted_to_platform' THEN
    SELECT cel.idempotency_key
    INTO v_existing_key
    FROM public.collection_event_log cel
    WHERE cel.order_id = p_order_id
      AND cel.event_type = 'remitted_to_platform'
    ORDER BY cel.created_at DESC
    LIMIT 1;

    IF p_idempotency_key IS NOT NULL AND v_existing_key = p_idempotency_key THEN
      RETURN;
    END IF;

    RAISE EXCEPTION
      'Order % is already remitted_to_platform with a different/no idempotency key.',
      p_order_id;
  END IF;

  IF v_col_status = 'remitted_to_merchant' THEN
    RAISE EXCEPTION 'Collection status regression not allowed: current=%', v_col_status;
  END IF;

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

  IF p_offset_applied THEN
    UPDATE public.courier_ledger_entries SET
      status             = 'settled',
      settlement_method  = 'offset',
      settled_at         = v_now,
      description        = 'Courier fee offset against COD remittance'
    WHERE order_id   = p_order_id
      AND entry_type = 'delivery_fee_accrual'
      AND status IN ('accrued', 'payable', 'in_payout');
  END IF;

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
      'difference',      p_difference,
      'source',          'process_cod_remittance_to_platform'
    )
  );

  INSERT INTO public.order_finance_events (order_id, event_type, created_by, payload)
  SELECT
    p_order_id,
    'courier_net_remittance_recorded',
    p_actor_id,
    jsonb_build_object(
      'mode',            p_mode,
      'expected_amount', p_expected_amount,
      'actual_amount',   p_remitted_amount,
      'difference',      p_difference
    )
  FROM public.orders WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_cod_remittance_to_platform TO service_role;

-- ============================================================
-- Phase 3: restrict admin_override_delivery_status values
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

  IF p_next_status NOT IN (
    'pending_assignment',
    'assigned_to_company',
    'assigned_to_agent',
    'picked_up',
    'in_transit',
    'delivered',
    'failed',
    'returned',
    'cancelled'
  ) THEN
    RAISE EXCEPTION 'Invalid next_status for admin override: %', p_next_status;
  END IF;

  SELECT COALESCE(delivery_status, 'pending_assignment') INTO v_from_status
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  UPDATE public.orders SET
    delivery_status  = p_next_status,
    delivered_at     = CASE WHEN p_next_status = 'delivered' THEN COALESCE(delivered_at, v_now) ELSE delivered_at END,
    returned_at      = CASE WHEN p_next_status = 'returned'  THEN COALESCE(returned_at,  v_now) ELSE returned_at  END,
    status           = CASE
      WHEN p_next_status IN ('delivered', 'cancelled', 'returned') THEN p_next_status
      ELSE status
    END
  WHERE id = p_order_id;

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
