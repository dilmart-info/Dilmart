-- PR-OS3: Executive governance metrics RPC
-- Computes delayed_order_risk and weekly_commercial_throughput in SQL.
-- Replaces full orders.select("id,status,created_at,total,governorates(name)") load.

CREATE OR REPLACE FUNCTION public.executive_governance_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delayed jsonb;
  v_weekly jsonb;
BEGIN
  -- ── 1. Delayed order risk ──
  -- Total delayed + breakdown by governorate
  WITH delayed AS (
    SELECT
      o.id,
      o.total,
      COALESCE(g.name, 'غير معروف') AS governorate_name
    FROM public.orders o
    LEFT JOIN public.governorates g ON g.id = o.governorate_id
    WHERE o.status IN ('new', 'contacted', 'preparing')
      AND o.created_at < (now() - interval '24 hours')
  ),
  by_gov AS (
    SELECT
      governorate_name,
      COUNT(*) AS delayed_orders,
      COALESCE(SUM(total), 0) AS delayed_revenue
    FROM delayed
    GROUP BY governorate_name
    ORDER BY delayed_orders DESC
  )
  SELECT jsonb_build_object(
    'total_delayed', (SELECT COUNT(*) FROM delayed),
    'by_governorate', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'governorate_name', governorate_name,
          'delayed_orders', delayed_orders,
          'delayed_revenue', delayed_revenue
        )
        ORDER BY delayed_orders DESC
      ) FROM by_gov),
      '[]'::jsonb
    )
  )
  INTO v_delayed;

  -- ── 2. Weekly commercial throughput (last 8 weeks) ──
  WITH weeks AS (
    SELECT
      generate_series(0, 7) AS week_idx
  ),
  week_ranges AS (
    SELECT
      week_idx,
      (now() - ((8 - week_idx) * interval '7 days')) AS week_start,
      (now() - ((7 - week_idx) * interval '7 days')) AS week_end
    FROM weeks
  ),
  weekly_data AS (
    SELECT
      wr.week_idx,
      wr.week_start,
      COUNT(o.id) AS order_count,
      COALESCE(SUM(o.total), 0) AS revenue
    FROM week_ranges wr
    LEFT JOIN public.orders o
      ON o.created_at >= wr.week_start
      AND o.created_at < wr.week_end
    GROUP BY wr.week_idx, wr.week_start
    ORDER BY wr.week_idx
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'label', TO_CHAR(week_start, 'DD Mon'),
      'order_count', order_count,
      'revenue', revenue
    )
    ORDER BY week_idx
  ), '[]'::jsonb)
  INTO v_weekly
  FROM weekly_data;

  RETURN jsonb_build_object(
    'delayed_order_risk', v_delayed,
    'weekly_commercial_throughput', v_weekly
  );
END;
$$;

-- Restrict to service_role only
REVOKE EXECUTE ON FUNCTION public.executive_governance_metrics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.executive_governance_metrics() FROM anon;
REVOKE EXECUTE ON FUNCTION public.executive_governance_metrics() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.executive_governance_metrics() TO service_role;
