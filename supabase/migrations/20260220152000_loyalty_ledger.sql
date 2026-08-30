-- 1. Create loyalty transactions table for detailed tracking
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL, -- positive for earn, negative for spend
    transaction_type TEXT NOT NULL, -- 'earn', 'spend', 'expire', 'admin_adjustment'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ -- NULL for spend transactions
);

-- 2. Index for performance
CREATE INDEX IF NOT EXISTS idx_loyalty_user_expiry ON public.loyalty_transactions(user_id, expires_at) WHERE expires_at IS NOT NULL;

-- 3. Function to calculate available points (sum of all transactions that haven't expired)
CREATE OR REPLACE FUNCTION public.get_available_points(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(
        (SELECT SUM(amount) 
         FROM public.loyalty_transactions 
         WHERE user_id = p_user_id 
         AND (expires_at IS NULL OR expires_at > now())),
        0
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update order status points logic to use the ledger
CREATE OR REPLACE FUNCTION public.handle_order_status_points()
RETURNS TRIGGER AS $$
BEGIN
  -- If order is marked as delivered: Record EARN transaction
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' AND NEW.user_id IS NOT NULL AND NEW.points_earned > 0 THEN
    INSERT INTO public.loyalty_transactions (user_id, order_id, amount, transaction_type, description, expires_at)
    VALUES (
        NEW.user_id, 
        NEW.id, 
        NEW.points_earned, 
        'earn', 
        'نقاط مكتسبة من الطلب #' || NEW.order_number,
        now() + interval '1 year' -- POINTS EXPIRE IN 1 YEAR
    );
    
    -- Sync cache in profiles
    UPDATE public.profiles SET points = public.get_available_points(NEW.user_id) WHERE id = NEW.user_id;
  END IF;

  -- If order was delivered but now is cancelled/returned: REVERSE EARN
  IF NEW.status IN ('cancelled', 'returned') AND OLD.status = 'delivered' AND NEW.user_id IS NOT NULL AND NEW.points_earned > 0 THEN
    INSERT INTO public.loyalty_transactions (user_id, order_id, amount, transaction_type, description)
    VALUES (
        NEW.user_id, 
        NEW.id, 
        -NEW.points_earned, 
        'admin_adjustment', 
        'إلغاء نقاط الطلب الملغي #' || NEW.order_number
    );
    
    -- Sync cache in profiles
    UPDATE public.profiles SET points = public.get_available_points(NEW.user_id) WHERE id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Modify place_order to record SPEND transaction
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

  -- Record spend transaction if points were used
  IF p_user_id IS NOT NULL AND p_points_spent > 0 THEN
    INSERT INTO public.loyalty_transactions (user_id, order_id, amount, transaction_type, description)
    VALUES (p_user_id, v_order_id, -p_points_spent, 'spend', 'استخدام نقاط في الطلب #' || v_order_number);
    
    -- Sync cache in profiles
    UPDATE public.profiles SET points = public.get_available_points(p_user_id) WHERE id = p_user_id;
  END IF;

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
