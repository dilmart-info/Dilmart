-- Create coupons table
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('fixed', 'percentage')),
  value NUMERIC NOT NULL,
  min_order_amount NUMERIC DEFAULT 0,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0,
  starts_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins have full access to coupons" 
ON public.coupons 
FOR ALL 
TO authenticated 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Public read access for active coupons (needed for validation)
-- Alternatively, we can use a secure function and keep the table private.
-- Let's stick to a secure function `validate_coupon` and NOT expose the table to public select.

-- Add coupon_id to orders if not exists (it was referenced in previous migration but ensure it exists)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.coupons(id);

-- Function to validate coupon
CREATE OR REPLACE FUNCTION public.validate_coupon(p_code TEXT, p_total NUMERIC)
RETURNS JSONB AS $$
DECLARE
  v_coupon record;
BEGIN
  SELECT * INTO v_coupon FROM public.coupons WHERE code = p_code;
  
  IF v_coupon IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'message', 'الكوبون غير موجود');
  END IF;

  IF v_coupon.is_active = false THEN
    RETURN jsonb_build_object('valid', false, 'message', 'الكوبون غير نشط');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'message', 'الكوبون منتهي الصلاحية');
  END IF;

  IF v_coupon.starts_at > now() THEN
    RETURN jsonb_build_object('valid', false, 'message', 'الكوبون لم يبدأ بعد');
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'message', 'تم استنفاد عدد مرات استخدام الكوبون');
  END IF;

  IF p_total < v_coupon.min_order_amount THEN
    RETURN jsonb_build_object('valid', false, 'message', 'مبلغ الطلب أقل من الحد الأدنى للكوبون');
  END IF;

  RETURN jsonb_build_object(
    'valid', true, 
    'id', v_coupon.id,
    'code', v_coupon.code,
    'discount_type', v_coupon.discount_type,
    'value', v_coupon.value
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment usage (called by place_order)
DROP FUNCTION IF EXISTS public.increment_coupon_usage(UUID);
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(p_coupon_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.coupons 
  SET used_count = used_count + 1 
  WHERE id = p_coupon_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
