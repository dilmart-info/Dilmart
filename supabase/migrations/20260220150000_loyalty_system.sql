-- 1. Add points to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS points BIGINT DEFAULT 0;

-- 2. Add points columns to orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS points_earned INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS points_spent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS points_discount NUMERIC DEFAULT 0;

-- 3. Update place_order function to include points
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
  p_user_id UUID DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_map_url TEXT DEFAULT NULL,
  p_points_spent INTEGER DEFAULT 0,
  p_points_discount NUMERIC DEFAULT 0,
  p_points_earned INTEGER DEFAULT 0
)
RETURNS TEXT AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
BEGIN
  -- Deduct points from user if spent
  IF p_user_id IS NOT NULL AND p_points_spent > 0 THEN
    UPDATE public.profiles 
    SET points = points - p_points_spent 
    WHERE id = p_user_id;
  END IF;

  -- Insert Order
  INSERT INTO public.orders (
    customer_name, customer_phone, governorate_id, area, 
    nearest_landmark, notes, subtotal, delivery_cost, 
    discount, total, coupon_id, order_number, user_id,
    latitude, longitude, map_url,
    points_spent, points_discount, points_earned
  ) VALUES (
    p_customer_name, p_customer_phone, p_governorate_id, p_area, 
    p_nearest_landmark, p_notes, p_subtotal, p_delivery_cost, 
    p_discount, p_total, p_coupon_id, 'TEMP', p_user_id,
    p_latitude, p_longitude, p_map_url,
    p_points_spent, p_points_discount, p_points_earned
  ) RETURNING id, order_number INTO v_order_id, v_order_number;

  -- Insert Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, price)
    VALUES (
      v_order_id, 
      (v_item->>'product_id')::UUID, 
      (v_item->>'product_name'), 
      (v_item->>'quantity')::INT, 
      (v_item->>'price')::NUMERIC
    );
  END LOOP;

  -- Update coupon if exists
  IF p_coupon_id IS NOT NULL THEN
    PERFORM public.increment_coupon_usage(p_coupon_id);
  END IF;

  RETURN v_order_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger to credit points when delivered
CREATE OR REPLACE FUNCTION public.handle_order_status_points()
RETURNS TRIGGER AS $$
BEGIN
  -- If order is marked as delivered and has a user_id and points_earned > 0
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' AND NEW.user_id IS NOT NULL AND NEW.points_earned > 0 THEN
    UPDATE public.profiles 
    SET points = points + NEW.points_earned 
    WHERE id = NEW.user_id;
  END IF;

  -- If order was delivered but now is cancelled/returned, deduct points
  IF NEW.status IN ('cancelled', 'returned') AND OLD.status = 'delivered' AND NEW.user_id IS NOT NULL AND NEW.points_earned > 0 THEN
    UPDATE public.profiles 
    SET points = points - NEW.points_earned 
    WHERE id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_order_delivered_points ON public.orders;
CREATE TRIGGER on_order_delivered_points
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_status_points();
