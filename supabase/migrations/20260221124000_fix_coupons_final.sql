-- Ensure all expected columns exist in the coupons table
DO $$ 
BEGIN 
    -- Add starts_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coupons' AND column_name = 'starts_at') THEN
        ALTER TABLE public.coupons ADD COLUMN starts_at TIMESTAMPTZ DEFAULT now();
    END IF;

    -- Add expires_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coupons' AND column_name = 'expires_at') THEN
        ALTER TABLE public.coupons ADD COLUMN expires_at TIMESTAMPTZ;
    END IF;

    -- Add max_uses if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coupons' AND column_name = 'max_uses') THEN
        ALTER TABLE public.coupons ADD COLUMN max_uses INTEGER;
    END IF;

    -- Add used_count if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coupons' AND column_name = 'used_count') THEN
        ALTER TABLE public.coupons ADD COLUMN used_count INTEGER DEFAULT 0;
    END IF;

    -- Add is_active if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coupons' AND column_name = 'is_active') THEN
        ALTER TABLE public.coupons ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Re-create the validate_coupon function to ensure it's up to date with the columns
CREATE OR REPLACE FUNCTION public.validate_coupon(p_code TEXT, p_total NUMERIC)
RETURNS JSONB AS $$
DECLARE
  v_coupon record;
BEGIN
  -- Use UPPER for case-insensitive matching
  SELECT * INTO v_coupon FROM public.coupons WHERE UPPER(code) = UPPER(p_code);
  
  IF v_coupon IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'message', 'الكوبون غير موجود');
  END IF;

  IF v_coupon.is_active = false THEN
    RETURN jsonb_build_object('valid', false, 'message', 'الكوبون غير نشط');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'message', 'الكوبون منتهي الصلاحية');
  END IF;

  -- Only check starts_at if the column exists (which it should now)
  IF v_coupon.starts_at IS NOT NULL AND v_coupon.starts_at > now() THEN
    RETURN jsonb_build_object('valid', false, 'message', 'الكوبون لم يبدأ بعد');
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'message', 'تم استنفاد عدد مرات استخدام الكوبون');
  END IF;

  IF p_total < COALESCE(v_coupon.min_order_amount, 0) THEN
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
