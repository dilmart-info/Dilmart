-- M19 — Delivery Operating System (Dispatch & Tracking)

ALTER TABLE public.delivery_companies
  ADD COLUMN IF NOT EXISTS default_sla_minutes integer;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS delivery_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_company_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_agent_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS picked_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS in_transit_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_failure_reason text,
  ADD COLUMN IF NOT EXISTS delivery_failure_notes text,
  ADD COLUMN IF NOT EXISTS delivery_sla_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_sla_breached boolean NOT NULL DEFAULT false;

UPDATE public.orders
SET delivery_status = CASE
  WHEN status = 'delivered' THEN 'delivered'
  WHEN status = 'cancelled' THEN 'cancelled'
  WHEN status = 'returned' THEN 'returned'
  WHEN delivery_company_id IS NOT NULL AND agent_id IS NOT NULL THEN 'assigned_to_agent'
  WHEN delivery_company_id IS NOT NULL THEN 'assigned_to_company'
  ELSE 'pending_assignment'
END
WHERE delivery_status IS NULL;

UPDATE public.orders
SET delivered_at = COALESCE(delivered_at, updated_at, created_at)
WHERE delivery_status = 'delivered' AND delivered_at IS NULL;

UPDATE public.orders
SET returned_at = COALESCE(returned_at, updated_at, created_at)
WHERE delivery_status = 'returned' AND returned_at IS NULL;

UPDATE public.orders
SET delivery_assigned_at = COALESCE(delivery_assigned_at, created_at)
WHERE delivery_status IN ('assigned_to_company', 'assigned_to_agent', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned')
  AND delivery_assigned_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_delivery_status_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_delivery_status_check
      CHECK (
        delivery_status IN (
          'pending_assignment',
          'assigned_to_company',
          'assigned_to_agent',
          'picked_up',
          'in_transit',
          'delivered',
          'failed',
          'returned',
          'cancelled'
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  delivery_company_id uuid REFERENCES public.delivery_companies(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL,
  reason_code text,
  notes text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'delivery_events_event_type_check'
  ) THEN
    ALTER TABLE public.delivery_events
      ADD CONSTRAINT delivery_events_event_type_check
      CHECK (
        event_type IN (
          'assigned_to_company',
          'assigned_to_agent',
          'picked_up',
          'in_transit',
          'delivered',
          'failed',
          'returned',
          'cancelled',
          'note_added'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'delivery_events_actor_type_check'
  ) THEN
    ALTER TABLE public.delivery_events
      ADD CONSTRAINT delivery_events_actor_type_check
      CHECK (actor_type IN ('admin', 'delivery_company', 'agent', 'system'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_events_order_id ON public.delivery_events(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_events_event_type ON public.delivery_events(event_type);
CREATE INDEX IF NOT EXISTS idx_delivery_events_created_at ON public.delivery_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_events_delivery_company_id ON public.delivery_events(delivery_company_id);
CREATE INDEX IF NOT EXISTS idx_delivery_events_agent_id ON public.delivery_events(agent_id);

