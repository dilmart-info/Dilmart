-- Create regions table
CREATE TABLE IF NOT EXISTS public.regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  governorate_id UUID REFERENCES public.governorates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for regions
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Regions are publicly readable" ON public.regions FOR SELECT USING (true);
CREATE POLICY "Admins can manage regions" ON public.regions FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Add location fields to orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS map_url TEXT;

-- Add location fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS map_url TEXT;

-- Seed Governorates (UPSERT based on name)
INSERT INTO public.governorates (name, delivery_price, sort_order) VALUES
('بغداد', 5000, 1),
('البصرة', 8000, 2),
('نينوى (الموصل)', 8000, 3),
('أربيل', 8000, 4),
('النجف', 6000, 5),
('كربلاء', 6000, 6),
('بابل (الحلة)', 6000, 7),
('الأنبار', 8000, 8),
('ديالى', 6000, 9),
('كركوك', 8000, 10),
('صلاح الدين', 8000, 11),
('واسط (الكوت)', 6000, 12),
('القادسية (الديوانية)', 6000, 13),
('ذي قار (الناصرية)', 7000, 14),
('ميسان (العمارة)', 7000, 15),
('المثنى (السماوة)', 7000, 16),
('السليمانية', 8000, 17),
('دهوك', 8000, 18),
('حلبجة', 8000, 19)
ON CONFLICT (name) DO UPDATE SET 
delivery_price = EXCLUDED.delivery_price,
sort_order = EXCLUDED.sort_order;

-- Update place_order function to include location
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
  p_map_url TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
BEGIN
  -- Generate Order Number
  -- Note: We rely on the trigger for order_number, but we can pass 'TEMP'
  
  INSERT INTO public.orders (
    customer_name, customer_phone, governorate_id, area, 
    nearest_landmark, notes, subtotal, delivery_cost, 
    discount, total, coupon_id, order_number, user_id,
    latitude, longitude, map_url
  ) VALUES (
    p_customer_name, p_customer_phone, p_governorate_id, p_area, 
    p_nearest_landmark, p_notes, p_subtotal, p_delivery_cost, 
    p_discount, p_total, p_coupon_id, 'TEMP', p_user_id,
    p_latitude, p_longitude, p_map_url
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
