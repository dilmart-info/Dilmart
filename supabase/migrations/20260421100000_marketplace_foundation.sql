-- Marketplace foundation (incremental, backward-compatible)

-- 1) Merchant domain tables
CREATE TABLE IF NOT EXISTS public.merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  banner_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'suspended', 'archived')),
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.merchant_settings (
  merchant_id UUID PRIMARY KEY REFERENCES public.merchants(id) ON DELETE CASCADE,
  contact_phone TEXT,
  whatsapp_phone TEXT,
  support_email TEXT,
  city TEXT,
  address TEXT,
  delivery_notes TEXT,
  order_auto_accept BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Commerce entities become merchant-aware
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES public.merchants(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS visibility_status TEXT NOT NULL DEFAULT 'public' CHECK (visibility_status IN ('public', 'private', 'archived')),
  ADD COLUMN IF NOT EXISTS merchant_sku TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES public.merchants(id) ON DELETE RESTRICT;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES public.merchants(id) ON DELETE RESTRICT;

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES public.merchants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_products_merchant_id ON public.products(merchant_id);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_id ON public.orders(merchant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_merchant_id ON public.order_items(merchant_id);
CREATE INDEX IF NOT EXISTS idx_coupons_merchant_id ON public.coupons(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_users_user_id ON public.merchant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_merchant_users_merchant_id ON public.merchant_users(merchant_id);

-- 3) Expand profile role model safely
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'role'
  ) THEN
    BEGIN
      ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'customer', 'agent', 'merchant_owner', 'merchant_manager', 'merchant_staff'));

-- 4) Default merchant + data backfill for single-store compatibility
INSERT INTO public.merchants (
  slug, name_ar, name_en, display_name, description, status, is_featured, logo_url
)
VALUES (
  'DilMart-primary',
  'ستايلاي ستور',
  'DilMart Store',
  'DilMart Store',
  'Default merchant migrated from legacy single-store mode',
  'active',
  true,
  '/DilMart-store-icon-only.png'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.merchant_settings (merchant_id, contact_phone, whatsapp_phone, support_email, city, address, delivery_notes, order_auto_accept)
SELECT
  m.id,
  '+964 787 185 7930',
  '9647871857930',
  NULL,
  'Baghdad',
  NULL,
  'Legacy default merchant settings',
  false
FROM public.merchants m
WHERE m.slug = 'DilMart-primary'
ON CONFLICT (merchant_id) DO NOTHING;

UPDATE public.products p
SET merchant_id = m.id
FROM public.merchants m
WHERE m.slug = 'DilMart-primary' AND p.merchant_id IS NULL;

UPDATE public.orders o
SET merchant_id = m.id
FROM public.merchants m
WHERE m.slug = 'DilMart-primary' AND o.merchant_id IS NULL;

UPDATE public.order_items oi
SET merchant_id = o.merchant_id
FROM public.orders o
WHERE oi.order_id = o.id AND oi.merchant_id IS NULL;

UPDATE public.coupons c
SET merchant_id = m.id
FROM public.merchants m
WHERE m.slug = 'DilMart-primary' AND c.merchant_id IS NULL;

-- 5) Keep order integrity merchant-aware (for historical rows too)
UPDATE public.order_items oi
SET merchant_id = p.merchant_id
FROM public.products p
WHERE oi.product_id = p.id
  AND (oi.merchant_id IS NULL OR oi.merchant_id <> p.merchant_id);

-- 6) Optional NOT NULL hardening after backfill
ALTER TABLE public.products ALTER COLUMN merchant_id SET NOT NULL;
ALTER TABLE public.orders ALTER COLUMN merchant_id SET NOT NULL;
ALTER TABLE public.order_items ALTER COLUMN merchant_id SET NOT NULL;

-- 7) Merchant-aware place_order while preserving old params
DROP FUNCTION IF EXISTS public.place_order(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID, JSONB, UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, INTEGER, NUMERIC, INTEGER);

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
  p_points_earned INTEGER DEFAULT 0,
  p_merchant_id UUID DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_merchant_id UUID;
  v_distinct_merchant_count INT;
  v_item_product_merchant UUID;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order items cannot be empty';
  END IF;

  IF p_merchant_id IS NOT NULL THEN
    v_merchant_id := p_merchant_id;
  ELSE
    SELECT COUNT(DISTINCT p.merchant_id), MIN(p.merchant_id)
    INTO v_distinct_merchant_count, v_merchant_id
    FROM jsonb_array_elements(p_items) item
    JOIN public.products p ON p.id = (item->>'product_id')::UUID;

    IF v_distinct_merchant_count <> 1 OR v_merchant_id IS NULL THEN
      RAISE EXCEPTION 'Cart must contain products from exactly one merchant';
    END IF;
  END IF;

  INSERT INTO public.orders (
    customer_name, customer_phone, governorate_id, area,
    nearest_landmark, notes, subtotal, delivery_cost,
    discount, total, coupon_id, order_number, user_id,
    latitude, longitude, map_url,
    points_spent, points_discount, points_earned,
    merchant_id
  ) VALUES (
    p_customer_name, p_customer_phone, p_governorate_id, p_area,
    p_nearest_landmark, p_notes, p_subtotal, p_delivery_cost,
    p_discount, p_total, p_coupon_id, 'TEMP', p_user_id,
    p_latitude, p_longitude, p_map_url,
    p_points_spent, p_points_discount, p_points_earned,
    v_merchant_id
  ) RETURNING id, order_number INTO v_order_id, v_order_number;

  IF p_user_id IS NOT NULL AND p_points_spent > 0 THEN
    INSERT INTO public.loyalty_transactions (user_id, order_id, amount, transaction_type, description)
    VALUES (p_user_id, v_order_id, -p_points_spent, 'spend', 'استخدام نقاط في الطلب #' || v_order_number);
    UPDATE public.profiles SET points = public.get_available_points(p_user_id) WHERE id = p_user_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT merchant_id INTO v_item_product_merchant
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID;

    IF v_item_product_merchant IS NULL OR v_item_product_merchant <> v_merchant_id THEN
      RAISE EXCEPTION 'Item merchant mismatch in order';
    END IF;

    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, price, merchant_id)
    VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'product_name'),
      (v_item->>'quantity')::INT,
      (v_item->>'price')::NUMERIC,
      v_merchant_id
    );
  END LOOP;

  IF p_coupon_id IS NOT NULL THEN
    PERFORM public.increment_coupon_usage(p_coupon_id);
  END IF;

  RETURN v_order_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
