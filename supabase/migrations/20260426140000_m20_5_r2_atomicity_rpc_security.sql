-- M20.5-R2 — Final Atomicity & RPC Security Closure
-- Phases: 1 (harden transition RPC), 2 (revoke public execute),
--         3 (harden remittance RPC), 4 (atomic agent clear), 5 (finance idempotency)

-- ============================================================
-- PHASE 5 (prerequisite): idempotency_key on order_finance_events
-- Must run before the RPCs that use it.
-- ============================================================

ALTER TABLE public.order_finance_events
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_finance_events_idempotency_key
  ON public.order_finance_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ============================================================
-- PHASE 1: Harden transition_delivery_status RPC
-- Adds row-locking (FOR UPDATE), DB-enforced lifecycle validation,
-- and race-condition protection.  The NestJS layer still validates
-- first (fast path), but the DB is now the authoritative guard.
-- ============================================================

CREATE OR REPLACE FUNCTION public.transition_delivery_status(
  p_order_id            uuid,
  p_next_status         text,
  p_from_status         text,    -- hint only; DB re-reads and validates
  p_actor_id            uuid,
  p_actor_type          text,
  p_patch               jsonb    DEFAULT '{}'::jsonb,
  p_event_type          text     DEFAULT NULL,
  p_reason_code         text     DEFAULT NULL,
  p_notes               text     DEFAULT NULL,
  p_delivery_company_id uuid     DEFAULT NULL,
  p_agent_id            uuid     DEFAULT NULL,
  p_legacy_status       text     DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now          timestamptz := now();
  v_current      text;
  v_order_status text;
  v_allowed      text[];
BEGIN
  -- ── 1. Lock row to prevent concurrent state changes ───────────────────────
  SELECT COALESCE(delivery_status, 'pending_assignment'), status
  INTO v_current, v_order_status
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;                 -- row-level lock; concurrent calls serialize here

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- ── 2. Enforce allowed transitions inside DB ──────────────────────────────
  -- Terminal states must not transition through this normal path.
  IF v_current IN ('delivered', 'returned', 'cancelled') THEN
    RAISE EXCEPTION
      'Cannot transition order from terminal state "%" via normal lifecycle. Use admin_override_delivery_status instead.',
      v_current;
  END IF;

  -- Build allowed next-states from current state.
  v_allowed := CASE v_current
    WHEN 'pending_assignment'  THEN ARRAY['assigned_to_company', 'cancelled']
    WHEN 'assigned_to_company' THEN ARRAY['assigned_to_agent', 'failed', 'cancelled']
    WHEN 'assigned_to_agent'   THEN ARRAY['picked_up', 'failed', 'cancelled']
    WHEN 'picked_up'           THEN ARRAY['in_transit', 'failed']
    WHEN 'in_transit'          THEN ARRAY['delivered', 'failed', 'returned']
    WHEN 'failed'              THEN ARRAY['returned']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (p_next_status = ANY(v_allowed)) THEN
    RAISE EXCEPTION
      'Invalid delivery status transition from "%" to "%". Allowed: %',
      v_current, p_next_status, array_to_string(v_allowed, ', ');
  END IF;

  -- ── 3. Apply update atomically ────────────────────────────────────────────
  UPDATE public.orders SET
    delivery_status           = p_next_status,
    delivery_assigned_at      = COALESCE(delivery_assigned_at, v_now),
    picked_up_at              = CASE WHEN p_next_status = 'picked_up'  THEN v_now ELSE picked_up_at END,
    in_transit_at             = CASE WHEN p_next_status = 'in_transit' THEN v_now ELSE in_transit_at END,
    delivered_at              = CASE WHEN p_next_status = 'delivered'  THEN v_now ELSE delivered_at END,
    delivery_failed_at        = CASE WHEN p_next_status = 'failed'     THEN v_now ELSE delivery_failed_at END,
    returned_at               = CASE WHEN p_next_status = 'returned'   THEN v_now ELSE returned_at END,
    status = CASE
      WHEN p_legacy_status IS NOT NULL THEN p_legacy_status
      ELSE status
    END,
    delivery_company_id = CASE
      WHEN p_patch ? 'delivery_company_id' THEN (p_patch->>'delivery_company_id')::uuid
      ELSE delivery_company_id
    END,
    agent_id = CASE
      WHEN p_patch ? 'agent_id' AND p_patch->>'agent_id' IS NULL THEN NULL
      WHEN p_patch ? 'agent_id' THEN (p_patch->>'agent_id')::uuid
      ELSE agent_id
    END,
    delivery_company_assigned_at = CASE
      WHEN p_patch ? 'delivery_company_assigned_at' THEN v_now
      ELSE delivery_company_assigned_at
    END,
    delivery_agent_assigned_at = CASE
      WHEN p_patch ? 'delivery_agent_assigned_at' THEN v_now
      ELSE delivery_agent_assigned_at
    END,
    delivery_sla_due_at = CASE
      WHEN p_patch ? 'delivery_sla_due_at' THEN (p_patch->>'delivery_sla_due_at')::timestamptz
      ELSE delivery_sla_due_at
    END,
    delivery_sla_breached = CASE
      WHEN p_next_status IN ('delivered', 'failed', 'returned', 'cancelled') THEN false
      WHEN delivery_sla_due_at IS NOT NULL AND delivery_sla_due_at < v_now THEN true
      ELSE delivery_sla_breached
    END,
    delivery_failure_reason = CASE
      WHEN p_reason_code IS NOT NULL THEN p_reason_code
      ELSE delivery_failure_reason
    END,
    delivery_failure_notes = CASE
      WHEN p_notes IS NOT NULL THEN p_notes
      ELSE delivery_failure_notes
    END
  WHERE id = p_order_id;

  -- ── 4. Insert delivery_event in same transaction ───────────────────────────
  IF p_event_type IS NOT NULL AND p_event_type <> 'pending_assignment' THEN
    INSERT INTO public.delivery_events (
      order_id, event_type, from_status, to_status,
      delivery_company_id, agent_id,
      actor_id, actor_type,
      reason_code, notes, metadata
    ) VALUES (
      p_order_id,
      p_event_type,
      v_current,             -- use the DB-read current status, not the caller hint
      p_next_status,
      p_delivery_company_id,
      p_agent_id,
      p_actor_id,
      p_actor_type,
      p_reason_code,
      p_notes,
      p_patch
    );
  END IF;

  -- ── 5. Finance idempotency guard for delivered transition ─────────────────
  -- Option B: finance runs outside this RPC in NestJS (idempotent).
  -- We write a sentinel order_finance_event here so that even if the JS call
  -- fails, a reconciliation run can detect the gap and retry.
  -- The unique idempotency_key prevents a duplicate sentinel on retry.
  IF p_next_status = 'delivered' THEN
    INSERT INTO public.order_finance_events (order_id, event_type, created_by, idempotency_key, payload)
    VALUES (
      p_order_id,
      'delivery_completed_pending_finance',
      p_actor_id,
      'finance-sentinel-' || p_order_id::text,
      jsonb_build_object('from_status', v_current, 'actor_type', p_actor_type)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
END;
$$;

-- ============================================================
-- PHASE 2: Restrict RPC permissions — service_role only
-- Regular authenticated users must not call these RPCs directly.
-- Backend always calls via the service-role Supabase client.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.transition_delivery_status(
  uuid, text, text, uuid, text, jsonb, text, text, text, uuid, uuid, text
) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.process_cod_remittance_to_platform(
  uuid, uuid, numeric, numeric, numeric, text, boolean, text, text, numeric, text
) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_override_delivery_status(
  uuid, text, uuid, text
) FROM authenticated;

-- Ensure service_role retains execute (idempotent).
GRANT EXECUTE ON FUNCTION public.transition_delivery_status TO service_role;
GRANT EXECUTE ON FUNCTION public.process_cod_remittance_to_platform TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_override_delivery_status TO service_role;

-- ============================================================
-- PHASE 3: Harden process_cod_remittance_to_platform RPC
-- Adds row-locking, delivery_status enforcement, idempotency
-- check in collection_event_log, and amount validation inside DB.
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
  v_now            timestamptz := now();
  v_col_status     text;
  v_delivery_status text;
  v_event_exists   boolean;
BEGIN
  -- ── 1. Lock row to prevent concurrent remittances ────────────────────────
  SELECT collection_status, COALESCE(delivery_status, status)
  INTO v_col_status, v_delivery_status
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- ── 2. Validate delivery_status inside DB ─────────────────────────────────
  IF v_delivery_status <> 'delivered' THEN
    RAISE EXCEPTION
      'Remittance to platform requires delivery_status=delivered. Current: %', v_delivery_status;
  END IF;

  -- ── 3. Validate amounts ───────────────────────────────────────────────────
  IF p_remitted_amount < 0 THEN
    RAISE EXCEPTION 'Remitted amount cannot be negative: %', p_remitted_amount;
  END IF;

  -- ── 4. Idempotency: check by idempotency_key first ───────────────────────
  IF p_idempotency_key IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.collection_event_log
      WHERE idempotency_key = p_idempotency_key
    ) INTO v_event_exists;

    IF v_event_exists THEN
      -- Exact same key already recorded → safe no-op (duplicate call).
      RETURN;
    END IF;
  END IF;

  -- ── 5. Block regression: already remitted is a safe no-op ────────────────
  IF v_col_status = 'remitted_to_platform' THEN
    -- Already recorded by a previous call (no key or different key path).
    RETURN;
  END IF;

  IF v_col_status = 'remitted_to_merchant' THEN
    RAISE EXCEPTION 'Collection status regression not allowed: current=%', v_col_status;
  END IF;

  -- ── 6. Update order financial fields ─────────────────────────────────────
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

  -- ── 7. Settle offset ledger entries if applicable ─────────────────────────
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

  -- ── 8. Append immutable collection_event_log row ─────────────────────────
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

  -- ── 9. Insert finance event ───────────────────────────────────────────────
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

-- ============================================================
-- PHASE 4: Atomic agent clear RPC
-- Locks row, verifies agent exists, clears agent_id, and inserts
-- agent_unassigned delivery_event — all in one PG transaction.
-- ============================================================

CREATE OR REPLACE FUNCTION public.clear_order_agent_atomic(
  p_order_id  uuid,
  p_actor_id  uuid,
  p_actor_type text  DEFAULT 'admin',
  p_reason    text   DEFAULT 'Agent removed from order.'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now           timestamptz := now();
  v_current       text;
  v_prev_agent_id uuid;
  v_company_id    uuid;
BEGIN
  -- ── 1. Lock row ───────────────────────────────────────────────────────────
  SELECT
    COALESCE(delivery_status, 'pending_assignment'),
    agent_id,
    delivery_company_id
  INTO v_current, v_prev_agent_id, v_company_id
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- ── 2. Guard: cannot clear agent from terminal orders ─────────────────────
  IF v_current IN ('delivered', 'returned', 'cancelled') THEN
    RAISE EXCEPTION
      'Cannot clear agent from order in terminal state: %', v_current;
  END IF;

  -- ── 3. Idempotency: if no agent assigned, nothing to do ──────────────────
  IF v_prev_agent_id IS NULL THEN
    RETURN;
  END IF;

  -- ── 4. Clear agent on order ───────────────────────────────────────────────
  UPDATE public.orders SET
    agent_id                   = NULL,
    delivery_agent_assigned_at = NULL
  WHERE id = p_order_id;

  -- ── 5. Insert immutable audit event ──────────────────────────────────────
  INSERT INTO public.delivery_events (
    order_id, event_type, from_status, to_status,
    delivery_company_id, agent_id,
    actor_id, actor_type,
    notes, metadata
  ) VALUES (
    p_order_id,
    'agent_unassigned',
    v_current,
    v_current,           -- status does not change, only agent is cleared
    v_company_id,
    v_prev_agent_id,     -- record who was removed
    p_actor_id,
    p_actor_type,
    p_reason,
    jsonb_build_object('previous_agent_id', v_prev_agent_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_order_agent_atomic TO service_role;
