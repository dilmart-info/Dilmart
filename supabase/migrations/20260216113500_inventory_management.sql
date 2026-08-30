-- Add low_stock_threshold and sold_count to products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS sold_count INTEGER DEFAULT 0;

-- Create stock_movements table for tracking
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  change_amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sale', 'restock', 'adjustment')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for stock_movements
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- Allow admins full access to stock_movements
CREATE POLICY "Admins have full access to stock_movements" 
ON public.stock_movements 
FOR ALL 
TO authenticated 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Update place_order to handle inventory
CREATE OR REPLACE FUNCTION public.place_order(
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_governorate_id UUID,
  p_area TEXT,
  p_nearest_landmark TEXT,
  p_notes TEXT,
  p_subtotal NUMERIC,
  p_delivery_cost NUMERIC,
  p_discount NUMERIC,
  p_total NUMERIC,
  p_coupon_id UUID,
  p_items JSONB,
  p_user_id UUID DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INTEGER;
BEGIN
  -- Insert Order
  INSERT INTO public.orders (
    customer_name, customer_phone, governorate_id, area, 
    nearest_landmark, notes, subtotal, delivery_cost, 
    discount, total, coupon_id, order_number, user_id
  ) VALUES (
    p_customer_name, p_customer_phone, p_governorate_id, p_area, 
    p_nearest_landmark, p_notes, p_subtotal, p_delivery_cost, 
    p_discount, p_total, p_coupon_id, 'ORD-' || upper(substring(gen_random_uuid()::text from 1 for 8)), p_user_id
  ) RETURNING id, order_number INTO v_order_id, v_order_number;

  -- Insert Items and Update Stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;

    -- Insert order item
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, price)
    VALUES (
      v_order_id, 
      v_product_id, 
      (v_item->>'product_name'), 
      v_quantity, 
      (v_item->>'price')::NUMERIC
    );

    -- Decrement stock and increment sold_count
    UPDATE public.products 
    SET 
      stock = stock - v_quantity,
      sold_count = sold_count + v_quantity
    WHERE id = v_product_id;

    -- Record stock movement
    INSERT INTO public.stock_movements (product_id, change_amount, type, reason)
    VALUES (v_product_id, -v_quantity, 'sale', 'Order #' || v_order_number);
  END LOOP;

  -- Update coupon if exists
  IF p_coupon_id IS NOT NULL THEN
    PERFORM public.increment_coupon_usage(p_coupon_id);
  END IF;

  RETURN v_order_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
