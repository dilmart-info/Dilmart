-- Marketplace RLS and role helpers

-- Helper: platform admins
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'admin')
  );
$$;

-- Helper: merchant membership
CREATE OR REPLACE FUNCTION public.is_merchant_member(p_merchant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.merchant_users mu
    WHERE mu.user_id = auth.uid()
      AND mu.merchant_id = p_merchant_id
  );
$$;

ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active merchants" ON public.merchants;
DROP POLICY IF EXISTS "Admins can manage merchants" ON public.merchants;
DROP POLICY IF EXISTS "Merchant members can view own merchant" ON public.merchants;

CREATE POLICY "Public can view active merchants"
ON public.merchants
FOR SELECT
USING (status = 'active' OR public.is_platform_admin() OR public.is_merchant_member(id));

CREATE POLICY "Admins can manage merchants"
ON public.merchants
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage merchant_users" ON public.merchant_users;
DROP POLICY IF EXISTS "Merchant members can view merchant_users" ON public.merchant_users;

CREATE POLICY "Admins can manage merchant_users"
ON public.merchant_users
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

CREATE POLICY "Merchant members can view merchant_users"
ON public.merchant_users
FOR SELECT
USING (public.is_merchant_member(merchant_id));

DROP POLICY IF EXISTS "Admins can manage merchant_settings" ON public.merchant_settings;
DROP POLICY IF EXISTS "Merchant members can manage own settings" ON public.merchant_settings;

CREATE POLICY "Admins can manage merchant_settings"
ON public.merchant_settings
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

CREATE POLICY "Merchant members can manage own settings"
ON public.merchant_settings
FOR ALL
USING (public.is_merchant_member(merchant_id))
WITH CHECK (public.is_merchant_member(merchant_id));

-- Product visibility and management
DROP POLICY IF EXISTS "Products are viewable by everyone" ON public.products;
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Public can view active merchant products" ON public.products;
DROP POLICY IF EXISTS "Admins can manage all products" ON public.products;
DROP POLICY IF EXISTS "Merchant members can manage own products" ON public.products;

CREATE POLICY "Public can view active merchant products"
ON public.products
FOR SELECT
USING (
  is_active = true
  AND EXISTS (
    SELECT 1 FROM public.merchants m
    WHERE m.id = products.merchant_id
      AND m.status = 'active'
  )
);

CREATE POLICY "Admins can manage all products"
ON public.products
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

CREATE POLICY "Merchant members can manage own products"
ON public.products
FOR ALL
USING (public.is_merchant_member(merchant_id))
WITH CHECK (public.is_merchant_member(merchant_id));

-- Orders access by scope
DROP POLICY IF EXISTS "Merchant members can view own merchant orders" ON public.orders;
DROP POLICY IF EXISTS "Merchant members can update own merchant orders" ON public.orders;

CREATE POLICY "Merchant members can view own merchant orders"
ON public.orders
FOR SELECT
USING (public.is_merchant_member(merchant_id));

CREATE POLICY "Merchant members can update own merchant orders"
ON public.orders
FOR UPDATE
USING (public.is_merchant_member(merchant_id))
WITH CHECK (public.is_merchant_member(merchant_id));

DROP POLICY IF EXISTS "Merchant members can view own merchant order items" ON public.order_items;

CREATE POLICY "Merchant members can view own merchant order items"
ON public.order_items
FOR SELECT
USING (public.is_merchant_member(merchant_id));

-- Coupons can be platform-wide (merchant_id null) or merchant-specific
DROP POLICY IF EXISTS "Merchant members can manage own coupons" ON public.coupons;

CREATE POLICY "Merchant members can manage own coupons"
ON public.coupons
FOR ALL
USING (merchant_id IS NOT NULL AND public.is_merchant_member(merchant_id))
WITH CHECK (merchant_id IS NOT NULL AND public.is_merchant_member(merchant_id));
