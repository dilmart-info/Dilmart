-- Function to check if current user is admin safely
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply profile policies without recursion
DROP POLICY IF EXISTS "Profiles are readable by owners" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are readable by admins" ON public.profiles;

CREATE POLICY "Profiles are readable by owners" ON public.profiles 
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Profiles are readable by admins" ON public.profiles 
  FOR SELECT USING (public.is_admin());

-- Fix Order policies
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can delete orders" ON public.orders;

CREATE POLICY "Admins can view all orders" ON public.orders 
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can update orders" ON public.orders 
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "Admins can delete orders" ON public.orders 
  FOR DELETE USING (public.is_admin());

-- Fix Order Items policies
DROP POLICY IF EXISTS "Admins can view all order items" ON public.order_items;

CREATE POLICY "Admins can view all order items" ON public.order_items 
  FOR SELECT USING (public.is_admin());

-- Fix Coupon policies
DROP POLICY IF EXISTS "Admins can manage coupons" ON public.coupons;

CREATE POLICY "Admins can manage coupons" ON public.coupons 
  FOR ALL USING (public.is_admin());
