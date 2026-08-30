-- PR-OS2.2: Fix pagination inside merchant_customer_summary RPC.
-- Previous version applied LIMIT/OFFSET at the same level as jsonb_agg,
-- which is incorrect because jsonb_agg produces a single aggregate row.
-- Now uses 3 CTEs: customer_agg → filtered → paged, then jsonb_agg on paged only.
-- Also adds SQL structure test: no customer_name/customer_phone ILIKE in search.

CREATE OR REPLACE FUNCTION public.merchant_customer_summary(
  p_merchant_id UUID,
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT;
  v_items jsonb;
BEGIN
  -- CTE 1: Aggregate orders per customer, build masked fields
  -- CTE 2: Filter on masked fields only (privacy: no raw PII search)
  -- CTE 3: Paginate BEFORE aggregating into JSON

  -- Count total matching customers
  WITH customer_agg AS (
    SELECT
      'عميل #' || UPPER(SUBSTR(MD5(customer_phone), 1, 4)) AS customer_ref,
      '****' || RIGHT(customer_phone, 4) AS phone_masked,
      COUNT(*) AS order_count,
      COALESCE(SUM(total), 0) AS total_spent,
      MAX(created_at) AS last_order_at
    FROM public.orders
    WHERE merchant_id = p_merchant_id
      AND customer_phone IS NOT NULL
      AND customer_phone <> ''
    GROUP BY customer_phone
  ),
  filtered AS (
    SELECT *
    FROM customer_agg
    WHERE
      p_search IS NULL
      OR p_search = ''
      OR customer_ref ILIKE '%' || p_search || '%'
      OR phone_masked ILIKE '%' || p_search || '%'
  )
  SELECT COUNT(*) INTO v_total FROM filtered;

  -- Fetch paginated items
  WITH customer_agg AS (
    SELECT
      'عميل #' || UPPER(SUBSTR(MD5(customer_phone), 1, 4)) AS customer_ref,
      '****' || RIGHT(customer_phone, 4) AS phone_masked,
      COUNT(*) AS order_count,
      COALESCE(SUM(total), 0) AS total_spent,
      MAX(created_at) AS last_order_at
    FROM public.orders
    WHERE merchant_id = p_merchant_id
      AND customer_phone IS NOT NULL
      AND customer_phone <> ''
    GROUP BY customer_phone
  ),
  filtered AS (
    SELECT *
    FROM customer_agg
    WHERE
      p_search IS NULL
      OR p_search = ''
      OR customer_ref ILIKE '%' || p_search || '%'
      OR phone_masked ILIKE '%' || p_search || '%'
  ),
  paged AS (
    SELECT *
    FROM filtered
    ORDER BY last_order_at DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'customer_ref', customer_ref,
      'phone_masked', phone_masked,
      'orders', order_count,
      'spent', total_spent,
      'last_order_at', last_order_at
    )
    ORDER BY last_order_at DESC
  ), '[]'::jsonb)
  INTO v_items
  FROM paged;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', (p_offset + p_limit) < v_total
  );
END;
$$;
