-- PR-P2: Analytics aggregation RPC + performance indexes
-- Replaces in-memory analytics computation with server-side SQL aggregation.
-- Response contract is identical to the previous JavaScript-computed shape.

-- ── Indexes for analytics queries ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_id ON public.orders (merchant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);

-- ── Analytics overview RPC ─────────────────────────────────────────────────
-- Returns JSON matching the exact shape consumed by the admin dashboard.
CREATE OR REPLACE FUNCTION public.analytics_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_now timestamptz := now();
  v_start_of_today timestamptz := date_trunc('day', v_now);
  v_start_of_month timestamptz := date_trunc('month', v_now);
  v_start_of_year timestamptz := date_trunc('year', v_now);
  v_90_days_ago timestamptz := v_now - interval '90 days';

  v_total_revenue numeric := 0;
  v_total_orders int := 0;
  v_today_revenue numeric := 0;
  v_today_orders int := 0;
  v_month_revenue numeric := 0;
  v_cancelled int := 0;
  v_total_profit numeric := 0;
BEGIN
  -- Aggregate core metrics in a single pass
  SELECT
    COALESCE(SUM(total), 0),
    COUNT(*),
    COALESCE(SUM(CASE WHEN created_at >= v_start_of_today THEN total ELSE 0 END), 0),
    COUNT(CASE WHEN created_at >= v_start_of_today THEN 1 END),
    COALESCE(SUM(CASE WHEN created_at >= v_start_of_month THEN total ELSE 0 END), 0),
    COUNT(CASE WHEN status = 'cancelled' THEN 1 END)
  INTO v_total_revenue, v_total_orders, v_today_revenue, v_today_orders, v_month_revenue, v_cancelled
  FROM public.orders;

  -- Profit from order items
  SELECT COALESCE(SUM((oi.price - COALESCE(p.purchase_price, 0)) * oi.quantity), 0)
  INTO v_total_profit
  FROM public.order_items oi
  LEFT JOIN public.products p ON p.id = oi.product_id;

  -- Build metrics
  v_result := jsonb_build_object(
    'metrics', jsonb_build_object(
      'totalRevenue', v_total_revenue,
      'todayRevenue', v_today_revenue,
      'monthRevenue', v_month_revenue,
      'totalOrders', v_total_orders,
      'todayOrdersCount', v_today_orders,
      'avgOrderValue', CASE WHEN v_total_orders > 0 THEN ROUND(v_total_revenue / v_total_orders, 2) ELSE 0 END,
      'cancellationRate', CASE WHEN v_total_orders > 0 THEN ROUND((v_cancelled::numeric / v_total_orders) * 100, 1) ELSE 0 END,
      'totalProfit', v_total_profit
    )
  );

  -- Top 5 products by quantity sold
  v_result := v_result || jsonb_build_object('topProducts', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT product_name AS name, SUM(quantity)::int AS quantity, SUM(quantity * price)::numeric AS revenue
      FROM public.order_items
      GROUP BY product_name
      ORDER BY SUM(quantity) DESC
      LIMIT 5
    ) t
  ));

  -- Top 6 governorates by revenue
  v_result := v_result || jsonb_build_object('govData', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT COALESCE(g.name, 'غير معروف') AS name, SUM(o.total)::numeric AS revenue
      FROM public.orders o
      LEFT JOIN public.governorates g ON g.id = o.governorate_id
      GROUP BY g.name
      ORDER BY SUM(o.total) DESC
      LIMIT 6
    ) t
  ));

  -- Sales trend (last 7 days)
  v_result := v_result || jsonb_build_object('salesTrend', (
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day_date), '[]'::jsonb)
    FROM (
      SELECT
        d.day_date,
        to_char(d.day_date, 'DD/MM') AS date,
        COALESCE(SUM(o.total), 0)::numeric AS revenue,
        COUNT(o.id)::int AS orders
      FROM generate_series(
        (v_now - interval '6 days')::date,
        v_now::date,
        '1 day'
      ) AS d(day_date)
      LEFT JOIN public.orders o ON o.created_at::date = d.day_date
      GROUP BY d.day_date
      ORDER BY d.day_date
    ) t
  ));

  -- Status distribution
  v_result := v_result || jsonb_build_object('statusData', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        CASE status
          WHEN 'new' THEN 'جديد'
          WHEN 'confirmed' THEN 'مؤكد'
          WHEN 'contacted' THEN 'تم التواصل'
          WHEN 'preparing' THEN 'قيد التجهيز'
          WHEN 'shipping' THEN 'قيد الشحن'
          WHEN 'shipped' THEN 'تم الشحن'
          WHEN 'delivered' THEN 'تم التوصيل'
          WHEN 'cancelled' THEN 'ملغي'
          WHEN 'returned' THEN 'مسترجع'
          ELSE status
        END AS name,
        COUNT(*)::int AS value
      FROM public.orders
      GROUP BY status
    ) t
  ));

  -- Monthly data (current year)
  v_result := v_result || jsonb_build_object('monthlyData', (
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.m), '[]'::jsonb)
    FROM (
      SELECT
        m.m,
        (ARRAY['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'])[m.m] AS name,
        COALESCE(SUM(o.total), 0)::numeric AS revenue,
        COALESCE(SUM((oi.price - COALESCE(p.purchase_price, 0)) * oi.quantity), 0)::numeric AS profit
      FROM generate_series(1, 12) AS m(m)
      LEFT JOIN public.orders o ON EXTRACT(MONTH FROM o.created_at) = m.m
        AND EXTRACT(YEAR FROM o.created_at) = EXTRACT(YEAR FROM v_now)
      LEFT JOIN public.order_items oi ON oi.order_id = o.id
      LEFT JOIN public.products p ON p.id = oi.product_id
      GROUP BY m.m
    ) t
  ));

  RETURN v_result;
END;
$$;
