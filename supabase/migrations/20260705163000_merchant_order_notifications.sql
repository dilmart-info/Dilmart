-- Create merchant_notifications table
CREATE TABLE IF NOT EXISTS public.merchant_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('new_order', 'order_status', 'stock', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.merchant_notifications ENABLE ROW LEVEL SECURITY;

-- Policies using existing helper functions
DROP POLICY IF EXISTS "Merchant members can view own merchant notifications"
ON public.merchant_notifications;

CREATE POLICY "Merchant members can view own merchant notifications"
ON public.merchant_notifications
FOR SELECT
TO authenticated
USING (public.is_merchant_member(merchant_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS "Merchant members can update own merchant notifications"
ON public.merchant_notifications;

CREATE POLICY "Merchant members can update own merchant notifications"
ON public.merchant_notifications
FOR UPDATE
TO authenticated
USING (public.is_merchant_member(merchant_id) OR public.is_platform_admin())
WITH CHECK (public.is_merchant_member(merchant_id) OR public.is_platform_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_merchant_notifications_merchant_created_at
ON public.merchant_notifications(merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_notifications_merchant_unread_created_at
ON public.merchant_notifications(merchant_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_notifications_order_id
ON public.merchant_notifications(order_id);

-- Trigger Function: Notify Merchant on New Order
CREATE OR REPLACE FUNCTION public.notify_merchant_new_order()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.merchant_id IS NOT NULL THEN
    INSERT INTO public.merchant_notifications (merchant_id, order_id, type, title, message, link)
    VALUES (
      NEW.merchant_id,
      NEW.id,
      'new_order',
      'طلب جديد #' || NEW.order_number,
      'وصل طلب جديد بقيمة ' || NEW.total || ' د.ع',
      '/merchant/orders/' || NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger: On New Order for Merchant
DROP TRIGGER IF EXISTS on_merchant_new_order ON public.orders;
CREATE TRIGGER on_merchant_new_order
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_merchant_new_order();

-- Add table to Supabase Realtime publication safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'merchant_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.merchant_notifications;
  END IF;
END $$;
