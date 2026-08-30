-- M20.5 — Marketplace Critical Hardening Pass
-- Phases: 6 (delivery_events RLS), 7 (collection_event_log audit), 2 (atomic RPC)

-- ============================================================
-- PHASE 6: Enable RLS on delivery_events + safe policies
-- ============================================================

ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;

-- Admins can manage all delivery events.
DROP POLICY IF EXISTS "Admins manage delivery_events" ON public.delivery_events;
CREATE POLICY "Admins manage delivery_events"
  ON public.delivery_events
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'admin')
    )
  );

-- Agents can SELECT only events for orders assigned to them.
DROP POLICY IF EXISTS "Agents read own assigned delivery_events" ON public.delivery_events;
CREATE POLICY "Agents read own assigned delivery_events"
  ON public.delivery_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'agent'
    )
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = delivery_events.order_id
        AND orders.agent_id = auth.uid()
    )
  );

-- Merchants have NO access to delivery_events (prevents PII leakage).
-- No INSERT/UPDATE/DELETE from any client-side role (service role bypasses RLS).

-- ============================================================
-- PHASE 7: Fix collection_event_log — append-only audit trail
-- Drop the unique constraint that allowed upsert/overwrite.
-- ============================================================

-- Add idempotency_key for optional safe deduplication.
ALTER TABLE public.collection_event_log
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Unique partial index: same idempotency_key can only appear once (if provided).
CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_event_log_idempotency_key
  ON public.collection_event_log(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Drop the old unique index that forced single-row-per-(order, event_type).
-- This makes collection_event_log truly append-only.
DROP INDEX IF EXISTS public.uq_collection_event_log_order_event;

-- Non-unique covering index for performance (replaces the dropped unique index).
CREATE INDEX IF NOT EXISTS idx_collection_event_log_order_event_lookup
  ON public.collection_event_log(order_id, event_type, created_at DESC);

-- ============================================================
-- PHASE 2: Atomic delivery transition Supabase RPC
-- Combines order update + delivery_event insert in one PG transaction.
-- Finance transitions are idempotent and run in JS after this.
-- ============================================================

CREATE OR REPLACE FUNCTION public.transition_delivery_status(
  p_order_id         uuid,
  p_next_status      text,
  p_from_status      text,
  p_actor_id         uuid,
  p_actor_type       text,
  p_patch            jsonb    DEFAULT '{}'::jsonb,
  p_event_type       text     DEFAULT NULL,
  p_reason_code      text     DEFAULT NULL,
  p_notes            text     DEFAULT NULL,
  p_delivery_company_id uuid  DEFAULT NULL,
  p_agent_id         uuid     DEFAULT NULL,
  p_legacy_status    text     DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  -- ── 1. Update the order row ──────────────────────────────────────────────
  UPDATE public.orders SET
    delivery_status           = p_next_status,
    delivery_assigned_at      = COALESCE(delivery_assigned_at, v_now),
    picked_up_at              = CASE WHEN p_next_status = 'picked_up'  THEN v_now ELSE picked_up_at END,
    in_transit_at             = CASE WHEN p_next_status = 'in_transit' THEN v_now ELSE in_transit_at END,
    delivered_at              = CASE WHEN p_next_status = 'delivered'  THEN v_now ELSE delivered_at END,
    delivery_failed_at        = CASE WHEN p_next_status = 'failed'     THEN v_now ELSE delivery_failed_at END,
    returned_at               = CASE WHEN p_next_status = 'returned'   THEN v_now ELSE returned_at END,
    -- Sync legacy order.status for terminal delivery states.
    status = CASE
      WHEN p_legacy_status IS NOT NULL THEN p_legacy_status
      ELSE status
    END,
    -- Apply optional patch fields.
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- ── 2. Insert delivery_event (atomic with order update) ─────────────────
  IF p_event_type IS NOT NULL AND p_event_type <> 'pending_assignment' THEN
    INSERT INTO public.delivery_events (
      order_id, event_type, from_status, to_status,
      delivery_company_id, agent_id,
      actor_id, actor_type,
      reason_code, notes, metadata
    ) VALUES (
      p_order_id,
      p_event_type,
      p_from_status,
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
END;
$$;

-- Grant execute to authenticated users so the backend (using anon/service-role) can call it.
GRANT EXECUTE ON FUNCTION public.transition_delivery_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_delivery_status TO service_role;
