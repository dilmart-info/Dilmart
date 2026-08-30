-- السماح للمدير بتحديث أي صف في profiles (تغيير الصلاحيات مثل customer ↔ agent)
-- يستخدم is_admin() المعرف مسبقاً كـ SECURITY DEFINER لتجنب تكرار RLS
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());
