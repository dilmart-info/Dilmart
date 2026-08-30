-- PR-OS2: Merchant customer summary RPC (privacy + aggregation)
-- Aggregates orders per customer in SQL — no rows loaded to TypeScript memory.
-- Returns masked customer references (no full phone/name for merchant scope).

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
  -- Count total unique customers (by phone) for this merchant
  SELECT COUNT(DISTINCT customer_phone)
  INTO v_total
  FROM public.orders
  WHERE merchant_id = p_merchant_id
    AND customer_phone IS NOT NULL
    AND customer_phone <> ''
    AND (
      p_search IS NULL
      OR p_search = ''
      OR customer_phone ILIKE '%' || p_search || '%'
      OR customer_name ILIKE '%' || p_search || '%'
    );

  -- Aggregate orders per customer, masked output
  SELECT COALESCE(jsonb_agg(row_data ORDER BY last_order_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'customer_ref', 'عميل #' || UPPER(SUBSTR(MD5(customer_phone), 1, 4)),
      'phone_masked', '****' || RIGHT(customer_phone, 4),
      'orders', COUNT(*),
      'spent', COALESCE(SUM(total), 0),
      'last_order_at', MAX(created_at)
    ) AS row_data,
    MAX(created_at) AS last_order_at
    FROM public.orders
    WHERE merchant_id = p_merchant_id
      AND customer_phone IS NOT NULL
      AND customer_phone <> ''
      AND (
        p_search IS NULL
        OR p_search = ''
        OR customer_phone ILIKE '%' || p_search || '%'
        OR customer_name ILIKE '%' || p_search || '%'
      )
    GROUP BY customer_phone
    ORDER BY MAX(created_at) DESC
    LIMIT p_limit
    OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', (p_offset + p_limit) < v_total
  );
END;
$$;

-- Restrict to service_role only
REVOKE EXECUTE ON FUNCTION public.merchant_customer_summary(UUID, TEXT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.merchant_customer_summary(UUID, TEXT, INT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.merchant_customer_summary(UUID, TEXT, INT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_customer_summary(UUID, TEXT, INT, INT) TO service_role;
