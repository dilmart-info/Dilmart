-- M21.0 — Delivery Intelligence (Read-only + Recommendations)
-- Scope: analytics/recommendations only, no automatic lifecycle mutations.

-- ============================================================
-- Performance views (no customer PII)
-- ============================================================

CREATE OR REPLACE VIEW public.delivery_agent_performance_view AS
WITH base AS (
  SELECT
    o.id,
    o.agent_id,
    o.delivery_company_id,
    COALESCE(o.delivery_status, o.status, 'pending_assignment') AS delivery_status,
    o.created_at,
    o.picked_up_at,
    o.delivered_at
  FROM public.orders o
  WHERE o.agent_id IS NOT NULL
),
agg AS (
  SELECT
    b.agent_id,
    b.delivery_company_id,
    COUNT(*) AS total_assigned,
    COUNT(*) FILTER (WHERE b.delivery_status = 'delivered') AS delivered_count,
    COUNT(*) FILTER (WHERE b.delivery_status = 'failed') AS failed_count,
    COUNT(*) FILTER (WHERE b.delivery_status = 'returned') AS returned_count,
    AVG(EXTRACT(EPOCH FROM (b.picked_up_at - b.created_at)) / 60.0)
      FILTER (WHERE b.picked_up_at IS NOT NULL) AS avg_pickup_minutes,
    AVG(EXTRACT(EPOCH FROM (b.delivered_at - b.created_at)) / 60.0)
      FILTER (WHERE b.delivered_at IS NOT NULL) AS avg_cycle_minutes
  FROM base b
  GROUP BY b.agent_id, b.delivery_company_id
)
SELECT
  a.agent_id,
  p.full_name AS agent_name,
  a.delivery_company_id,
  a.total_assigned,
  a.delivered_count,
  a.failed_count,
  a.returned_count,
  CASE WHEN a.total_assigned > 0 THEN ROUND((a.delivered_count::numeric / a.total_assigned::numeric) * 100.0, 2) ELSE 0 END AS on_time_rate,
  CASE WHEN a.total_assigned > 0 THEN ROUND((a.failed_count::numeric / a.total_assigned::numeric) * 100.0, 2) ELSE 0 END AS fail_rate,
  COALESCE(a.avg_pickup_minutes, 0) AS avg_pickup_minutes,
  COALESCE(a.avg_cycle_minutes, 0) AS avg_cycle_minutes
FROM agg a
LEFT JOIN public.profiles p ON p.id = a.agent_id;

CREATE OR REPLACE VIEW public.delivery_company_performance_view AS
WITH base AS (
  SELECT
    o.id,
    o.delivery_company_id,
    COALESCE(o.delivery_status, o.status, 'pending_assignment') AS delivery_status,
    o.created_at,
    o.delivered_at
  FROM public.orders o
  WHERE o.delivery_company_id IS NOT NULL
),
agg AS (
  SELECT
    b.delivery_company_id,
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE b.delivery_status = 'delivered') AS delivered_count,
    COUNT(*) FILTER (WHERE b.delivery_status = 'failed') AS failed_count,
    COUNT(*) FILTER (WHERE b.delivery_status = 'returned') AS returned_count,
    AVG(EXTRACT(EPOCH FROM (b.delivered_at - b.created_at)) / 60.0)
      FILTER (WHERE b.delivered_at IS NOT NULL) AS avg_cycle_minutes
  FROM base b
  GROUP BY b.delivery_company_id
)
SELECT
  a.delivery_company_id,
  dc.name AS delivery_company_name,
  a.total_orders,
  a.delivered_count,
  a.failed_count,
  a.returned_count,
  CASE WHEN a.total_orders > 0 THEN ROUND((a.failed_count::numeric / a.total_orders::numeric) * 100.0, 2) ELSE 0 END AS fail_rate,
  CASE WHEN a.total_orders > 0 THEN ROUND((a.returned_count::numeric / a.total_orders::numeric) * 100.0, 2) ELSE 0 END AS return_rate,
  COALESCE(a.avg_cycle_minutes, 0) AS avg_cycle_minutes
FROM agg a
LEFT JOIN public.delivery_companies dc ON dc.id = a.delivery_company_id;

CREATE OR REPLACE VIEW public.delivery_open_orders_risk_view AS
WITH open_orders AS (
  SELECT
    o.id AS order_id,
    o.order_number,
    o.merchant_id,
    o.delivery_company_id,
    o.agent_id,
    o.status,
    COALESCE(o.delivery_status, o.status, 'pending_assignment') AS delivery_status,
    o.created_at,
    o.picked_up_at,
    o.in_transit_at,
    o.delivery_sla_due_at,
    COALESCE(o.delivery_sla_breached, false) AS delivery_sla_breached
  FROM public.orders o
  WHERE COALESCE(o.delivery_status, o.status, 'pending_assignment') IN (
    'pending_assignment', 'assigned_to_company', 'assigned_to_agent', 'picked_up', 'in_transit', 'failed'
  )
),
joined AS (
  SELECT
    oo.*,
    m.display_name AS merchant_name,
    dc.name AS delivery_company_name,
    p.full_name AS agent_name,
    COALESCE(ap.fail_rate, 0) AS agent_fail_rate,
    COALESCE(cp.return_rate, 0) AS company_return_rate,
    COALESCE(ap.avg_pickup_minutes, 0) AS agent_avg_pickup_minutes,
    COALESCE(cp.avg_cycle_minutes, 0) AS company_avg_cycle_minutes
  FROM open_orders oo
  LEFT JOIN public.merchants m ON m.id = oo.merchant_id
  LEFT JOIN public.delivery_companies dc ON dc.id = oo.delivery_company_id
  LEFT JOIN public.profiles p ON p.id = oo.agent_id
  LEFT JOIN public.delivery_agent_performance_view ap ON ap.agent_id = oo.agent_id
  LEFT JOIN public.delivery_company_performance_view cp ON cp.delivery_company_id = oo.delivery_company_id
),
scored AS (
  SELECT
    j.*,
    GREATEST(0, EXTRACT(EPOCH FROM (now() - j.created_at)) / 60.0) AS minutes_in_current_status,
    (
      CASE WHEN j.delivery_sla_breached THEN 30 ELSE 0 END +
      CASE WHEN EXTRACT(EPOCH FROM (now() - j.created_at)) / 60.0 >= 360 THEN 20 ELSE 0 END +
      CASE WHEN j.agent_fail_rate >= 20 THEN 15 ELSE 0 END +
      CASE WHEN j.company_return_rate >= 15 THEN 15 ELSE 0 END +
      CASE WHEN j.delivery_status IN ('assigned_to_agent', 'picked_up') AND j.picked_up_at IS NULL
                AND EXTRACT(EPOCH FROM (now() - j.created_at)) / 60.0 >= 180 THEN 10 ELSE 0 END +
      CASE WHEN j.delivery_status = 'in_transit' AND j.in_transit_at IS NOT NULL
                AND EXTRACT(EPOCH FROM (now() - j.in_transit_at)) / 60.0 >= 1440 THEN 10 ELSE 0 END
    ) AS raw_score,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN j.delivery_sla_breached THEN 'sla_breached' END,
      CASE WHEN EXTRACT(EPOCH FROM (now() - j.created_at)) / 60.0 >= 360 THEN 'stuck_in_status' END,
      CASE WHEN j.agent_fail_rate >= 20 THEN 'agent_high_fail_rate' END,
      CASE WHEN j.company_return_rate >= 15 THEN 'company_high_return_rate' END,
      CASE WHEN j.delivery_status IN ('assigned_to_agent', 'picked_up') AND j.picked_up_at IS NULL
                AND EXTRACT(EPOCH FROM (now() - j.created_at)) / 60.0 >= 180 THEN 'late_pickup' END,
      CASE WHEN j.delivery_status = 'in_transit' AND j.in_transit_at IS NOT NULL
                AND EXTRACT(EPOCH FROM (now() - j.in_transit_at)) / 60.0 >= 1440 THEN 'long_cycle_time' END
    ], NULL::text) AS reason_codes
  FROM joined j
)
SELECT
  s.order_id,
  s.order_number,
  s.merchant_id,
  s.merchant_name,
  s.delivery_company_id,
  s.delivery_company_name,
  s.agent_id,
  s.agent_name,
  s.status,
  s.delivery_status,
  s.created_at,
  s.delivery_sla_due_at,
  s.delivery_sla_breached,
  ROUND(s.minutes_in_current_status, 2) AS minutes_in_current_status,
  LEAST(100, GREATEST(0, s.raw_score))::int AS risk_score,
  s.reason_codes
FROM scored s;

-- ============================================================
-- Recommendations snapshot table (audit trail)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.delivery_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  recommendation_type text NOT NULL,
  risk_score int NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  reason_codes text[] NOT NULL DEFAULT '{}'::text[],
  recommendation_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'applied', 'dismissed')),
  applied_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  applied_at timestamptz NULL,
  apply_notes text NULL,
  idempotency_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_recommendations_idempotency_key
  ON public.delivery_recommendations(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_recommendations_order_created
  ON public.delivery_recommendations(order_id, created_at DESC);

ALTER TABLE public.delivery_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage delivery_recommendations" ON public.delivery_recommendations;
CREATE POLICY "Admins manage delivery_recommendations"
  ON public.delivery_recommendations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

