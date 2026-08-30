-- PR-OS2.1: Fix merchant_customer_summary search privacy leak.
-- Search now operates ONLY on masked fields (customer_ref, phone_masked),
-- NOT on raw customer_name or customer_phone.
-- This prevents inference attacks where a merchant enters a full phone/name
-- to discover if a customer bought from them.

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
  -- CTE: aggregate first, then search on masked fields only.
  -- This ensures no search can probe raw customer_name or customer_phone.

  -- Count matching customers (search on masked fields only)
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
  )
  SELECT COUNT(*)
  INTO v_total
  FROM customer_agg
  WHERE
    p_search IS NULL
    OR p_search = ''
    OR customer_ref ILIKE '%' || p_search || '%'
    OR phone_masked ILIKE '%' || p_search || '%';

  -- Fetch paginated items (search on masked fields only)
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
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'customer_ref', customer_ref,
      'phone_masked', phone_masked,
      'orders', order_count,
      'spent', total_spent,
      'last_order_at', last_order_at
    ) ORDER BY last_order_at DESC
  ), '[]'::jsonb)
  INTO v_items
  FROM customer_agg
  WHERE
    p_search IS NULL
    OR p_search = ''
    OR customer_ref ILIKE '%' || p_search || '%'
    OR phone_masked ILIKE '%' || p_search || '%'
  ORDER BY last_order_at DESC
  LIMIT p_limit
  OFFSET p_offset;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', (p_offset + p_limit) < v_total
  );
END;
$$;
