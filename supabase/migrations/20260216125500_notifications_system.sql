-- Create admin_notifications table
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('order', 'stock', 'cancellation', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Allow admins to read and update notifications
CREATE POLICY "Admins have full access to admin_notifications" 
ON public.admin_notifications 
FOR ALL 
TO authenticated 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Trigger Function: New Order Notification
CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: On New Order
DROP TRIGGER IF EXISTS on_new_order ON public.orders;
CREATE TRIGGER on_new_order
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_order();

-- Trigger Function: Low Stock Notification
CREATE OR REPLACE FUNCTION public.notify_low_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if stock dropped below threshold and wasn't already below it (to avoid spam)
  IF NEW.stock <= COALESCE(NEW.low_stock_threshold, 5) AND OLD.stock > COALESCE(OLD.low_stock_threshold, 5) THEN
    INSERT INTO public.admin_notifications (type, title, message, link)
    VALUES (
      'stock',
      'تنبيه مخزون: ' || NEW.name,
      'الكمية المتبقية من ' || NEW.name || ' هي ' || NEW.stock || ' فقط.',
      '/admin/inventory' -- Or product edit link
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: On Product Update
DROP TRIGGER IF EXISTS on_low_stock ON public.products;
CREATE TRIGGER on_low_stock
AFTER UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.notify_low_stock();

-- Trigger Function: High Cancellation Rate (Optional Logic)
-- This is harder to do purely with triggers efficiently. 
-- We can do a daily check or a check every N orders.
-- For now, let's keep it simple. We can add a function to check cancellation rate manually or via cron later.

