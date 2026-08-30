-- Fix coupons table schema mismatch

-- 1. Add missing min_order_amount column
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC DEFAULT 0;

-- 2. Rename discount_value back to value (to match frontend code expectation)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coupons' AND column_name = 'discount_value') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coupons' AND column_name = 'value') THEN
        ALTER TABLE public.coupons RENAME COLUMN discount_value TO value;
    END IF;
END
$$;

-- 3. Reload schema cache to ensure PostgREST picks up the changes immediately
NOTIFY pgrst, 'reload schema';
