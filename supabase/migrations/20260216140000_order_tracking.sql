-- Function to get order status safely for public tracking
CREATE OR REPLACE FUNCTION public.get_order_status(
  p_order_number TEXT,
  p_phone TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_order RECORD;
BEGIN
  -- Normalize inputs: remove # from order number
  -- Phone check: flexible match last 6 digits to handle +964 vs 07 diffs
  
  SELECT 
    o.id,
    o.order_number,
    o.status,
    o.created_at,
    o.total,
    o.customer_name,
    g.name as governorate_name,
    dc.name as delivery_company_name
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.governorates g ON o.governorate_id = g.id
  LEFT JOIN public.delivery_companies dc ON o.delivery_company_id = dc.id
  WHERE 
    CAST(o.order_number AS TEXT) = TRIM(BOTH '#' FROM p_order_number)
    AND 
    (
        p_phone IS NOT NULL AND LENGTH(p_phone) >= 6 AND
        RIGHT(REGEXP_REPLACE(o.customer_phone, '\D', '', 'g'), 6) = RIGHT(REGEXP_REPLACE(p_phone, '\D', '', 'g'), 6)
    );

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'message', 'لم يتم العثور على الطلب. يرجى التأكد من رقم الطلب ورقم الهاتف.');
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'created_at', v_order.created_at,
    'total', v_order.total,
    'customer_name', v_order.customer_name,
    'governorate', v_order.governorate_name,
    'delivery_company', v_order.delivery_company_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
