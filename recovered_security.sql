-- Create profiles table to handle roles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin', 'customer')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Profiles are readable by owners" ON public.profiles 
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Profiles are readable by admins" ON public.profiles 
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Function to handle new user signup and create a profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, 'customer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Security Fixes for Orders
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
DROP POLICY IF EXISTS "Orders readable by order number" ON public.orders;

-- Anyone can insert orders (public checkout)
CREATE POLICY "Anyone can create orders" ON public.orders 
  FOR INSERT WITH CHECK (true);

-- Only admins can select/view all orders
CREATE POLICY "Admins can view all orders" ON public.orders 
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can update/delete orders
CREATE POLICY "Admins can update orders" ON public.orders 
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete orders" ON public.orders 
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Security Fixes for Order Items
DROP POLICY IF EXISTS "Anyone can create order items" ON public.order_items;
DROP POLICY IF EXISTS "Order items publicly readable" ON public.order_items;

CREATE POLICY "Anyone can create order items" ON public.order_items 
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view all order items" ON public.order_items 
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Coupon Protection
-- Allow admins to manage coupons
CREATE POLICY "Admins can manage coupons" ON public.coupons 
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Function to increment coupon usage securely
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(coupon_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.coupons
  SET used_count = used_count + 1
  WHERE id = coupon_id AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC to create order and items in one transaction and return order number
-- This avoids the need for a public SELECT policy on orders
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
  p_items JSONB
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
    discount, total, coupon_id, order_number
  ) VALUES (
    p_customer_name, p_customer_phone, p_governorate_id, p_area, 
    p_nearest_landmark, p_notes, p_subtotal, p_delivery_cost, 
    p_discount, p_total, p_coupon_id, 'TEMP'
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

-- Add admin_notes to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS admin_notes TEXT;


