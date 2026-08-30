-- M24: notifications security hardening

-- 1) Tighten user notification INSERT policy to self-only for authenticated users.
DROP POLICY IF EXISTS "System can insert notifications" ON public.user_notifications;
CREATE POLICY "Users can insert own notifications only"
ON public.user_notifications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 2) Ensure admin read/update policy covers super_admin as well.
DROP POLICY IF EXISTS "Admins have full access to admin_notifications" ON public.admin_notifications;
CREATE POLICY "Admins have full access to admin_notifications"
ON public.admin_notifications
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  )
);

-- 3) Add missing indexes for hot paths.
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at ON public.admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread_created_at ON public.admin_notifications(is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created_at ON public.user_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread_user_created_at ON public.user_notifications(user_id, is_read, created_at DESC);

-- 4) Harden SECURITY DEFINER functions with explicit search_path.
CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_notifications (type, title, message, link)
  VALUES (
    'order',
    'طلب جديد #' || NEW.order_number,
    'تم استلام طلب جديد من ' || NEW.customer_name || ' بقيمة ' || NEW.total,
    '/admin/orders/' || NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_low_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stock <= COALESCE(NEW.low_stock_threshold, 5) AND OLD.stock > COALESCE(OLD.low_stock_threshold, 5) THEN
    INSERT INTO public.admin_notifications (type, title, message, link)
    VALUES (
      'stock',
      'تنبيه مخزون: ' || NEW.name,
      'الكمية المتبقية من ' || NEW.name || ' هي ' || NEW.stock || ' فقط.',
      '/admin/inventory'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_agent_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.agent_id IS DISTINCT FROM OLD.agent_id AND NEW.agent_id IS NOT NULL) OR
     (TG_OP = 'INSERT' AND NEW.agent_id IS NOT NULL) THEN
    INSERT INTO public.user_notifications (user_id, title, message, link)
    VALUES (
      NEW.agent_id,
      'طلب جديد للمهمة #' || NEW.order_number,
      'تم تعيين طلب جديد لك للتوصيل. العميل: ' || NEW.customer_name,
      '/agent/orders'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_user_order_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.user_notifications (user_id, title, message, link)
    VALUES (
      NEW.user_id,
      'تحديث لطلبك #' || NEW.order_number,
      'حالة طلبك الآن هي: ' ||
        CASE
          WHEN NEW.status = 'pending' THEN 'قيد المراجعة'
          WHEN NEW.status = 'confirmed' THEN 'تم التأكيد'
          WHEN NEW.status = 'preparing' THEN 'قيد التحضير'
          WHEN NEW.status = 'shipped' THEN 'تم الشحن'
          WHEN NEW.status = 'delivered' THEN 'تم التوصيل'
          WHEN NEW.status = 'returned' THEN 'مسترجع'
          WHEN NEW.status = 'cancelled' THEN 'ملغي'
          ELSE NEW.status
        END,
      '/profile'
    );
  END IF;
  RETURN NEW;
END;
$$;
