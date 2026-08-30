-- M21-R — Delivery Intelligence Read-Only Accuracy Patch
-- 1) Remove legacy recommendation workflow table from earlier M21 iteration.
-- 2) Rebuild operational views for stricter status-event timing and accurate metrics.

DROP TABLE IF EXISTS public.delivery_recommendations;

DROP VIEW IF EXISTS public.delivery_open_orders_risk_view;
DROP VIEW IF EXISTS public.delivery_open_orders_view;
DROP VIEW IF EXISTS public.delivery_agent_performance_view;
DROP VIEW IF EXISTS public.delivery_company_performance_view;

CREATE OR REPLACE VIEW public.delivery_open_orders_view AS
WITH status_events AS (
  SELECT
    de.order_id,
    MAX(de.created_at) AS last_event_time
  FROM public.delivery_events de
  WHERE de.event_type IN (
    'assigned_to_company',
    'assigned_to_agent',
    'picked_up',
    'in_transit',
    'delivered',
    'failed',
    'returned',
    'agent_unassigned'
  )
  GROUP BY de.order_id
)
SELECT
  o.id AS order_id,
  COALESCE(o.delivery_status, o.status, 'pending_assignment') AS delivery_status,
  o.created_at,
  o.delivery_company_id AS assigned_company_id,
  o.agent_id AS assigned_agent_id,
  se.last_event_time,
  ROUND((EXTRACT(EPOCH FROM (now() - COALESCE(se.last_event_time, o.created_at))) / 60.0)::numeric, 2) AS time_in_current_status,
  360::int AS sla_threshold
FROM public.orders o
LEFT JOIN status_events se ON se.order_id = o.id
WHERE COALESCE(o.delivery_status, o.status, 'pending_assignment') IN (
  'pending_assignment',
  'assigned_to_company',
  'assigned_to_agent',
  'picked_up',
  'in_transit',
  'failed'
);

CREATE OR REPLACE VIEW public.delivery_agent_performance_view AS
WITH base AS (
  SELECT
    o.id AS order_id,
    o.agent_id,
    COALESCE(o.delivery_status, o.status, 'pending_assignment') AS delivery_status,
    o.created_at,
    o.delivered_at,
    o.delivery_sla_due_at
  FROM public.orders o
  WHERE o.agent_id IS NOT NULL
)
SELECT
  b.agent_id,
  COUNT(*)::int AS total_orders,
  COUNT(*) FILTER (WHERE b.delivery_status = 'delivered')::int AS delivered_orders,
  COUNT(*) FILTER (WHERE b.delivery_status = 'failed')::int AS failed_orders,
  COUNT(*) FILTER (WHERE b.delivery_status = 'returned')::int AS returned_orders,
  ROUND(
    (
      COALESCE(
        COUNT(*) FILTER (
          WHERE b.delivery_status = 'delivered'
            AND b.delivered_at IS NOT NULL
            AND (
              b.delivery_sla_due_at IS NULL
              OR b.delivered_at <= b.delivery_sla_due_at
            )
        )::numeric,
        0
      ) / NULLIF((COUNT(*) FILTER (WHERE b.delivery_status = 'delivered'))::numeric, 0)
    ) * 100.0,
    2
  ) AS on_time_rate,
  ROUND(
    (
      COALESCE(COUNT(*) FILTER (WHERE b.delivery_status = 'failed')::numeric, 0)
      / NULLIF(COUNT(*)::numeric, 0)
    ) * 100.0,
    2
  ) AS fail_rate,
  ROUND(AVG(EXTRACT(EPOCH FROM (b.delivered_at - b.created_at)) / 60.0) FILTER (WHERE b.delivered_at IS NOT NULL)::numeric, 2) AS avg_delivery_time
FROM base b
GROUP BY b.agent_id;

CREATE OR REPLACE VIEW public.delivery_company_performance_view AS
WITH base AS (
  SELECT
    o.id AS order_id,
    o.delivery_company_id AS company_id,
    COALESCE(o.delivery_status, o.status, 'pending_assignment') AS delivery_status,
    o.created_at,
    o.delivered_at,
    o.delivery_sla_due_at
  FROM public.orders o
  WHERE o.delivery_company_id IS NOT NULL
)
SELECT
  b.company_id,
  COUNT(*)::int AS total_orders,
  COUNT(*) FILTER (WHERE b.delivery_status = 'delivered')::int AS delivered_orders,
  COUNT(*) FILTER (WHERE b.delivery_status = 'failed')::int AS failed_orders,
  COUNT(*) FILTER (WHERE b.delivery_status = 'returned')::int AS returned_orders,
  ROUND(
    (
      COALESCE(
        COUNT(*) FILTER (
          WHERE b.delivery_status = 'delivered'
            AND b.delivered_at IS NOT NULL
            AND (
              b.delivery_sla_due_at IS NULL
              OR b.delivered_at <= b.delivery_sla_due_at
            )
        )::numeric,
        0
      ) / NULLIF((COUNT(*) FILTER (WHERE b.delivery_status = 'delivered'))::numeric, 0)
    ) * 100.0,
    2
  ) AS on_time_rate,
  ROUND(
    (
      COALESCE(COUNT(*) FILTER (WHERE b.delivery_status = 'failed')::numeric, 0)
      / NULLIF(COUNT(*)::numeric, 0)
    ) * 100.0,
    2
  ) AS fail_rate,
  ROUND(
    (
      COALESCE(COUNT(*) FILTER (WHERE b.delivery_status = 'returned')::numeric, 0)
      / NULLIF(COUNT(*)::numeric, 0)
    ) * 100.0,
    2
  ) AS return_rate,
  ROUND(AVG(EXTRACT(EPOCH FROM (b.delivered_at - b.created_at)) / 60.0) FILTER (WHERE b.delivered_at IS NOT NULL)::numeric, 2) AS avg_delivery_time
FROM base b
GROUP BY b.company_id;
