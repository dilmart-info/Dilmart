-- Create user_notifications table for agents and customers
CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can view their own notifications"
ON public.user_notifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can update the read status of their own notifications
CREATE POLICY "Users can update their own notification status"
ON public.user_notifications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- System can insert notifications (via triggers)
CREATE POLICY "System can insert notifications"
ON public.user_notifications
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Trigger Function: Notify Agent when assigned
CREATE OR REPLACE FUNCTION public.notify_agent_assignment()
RETURNS TRIGGER AS $$
BEGIN
    -- If agent_id changed and is not null
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: On Order Update/Insert for Agent Assignment
DROP TRIGGER IF EXISTS on_agent_assigned ON public.orders;
CREATE TRIGGER on_agent_assigned
AFTER INSERT OR UPDATE OF agent_id ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_agent_assignment();

-- Trigger Function: Notify User when status changes
CREATE OR REPLACE FUNCTION public.notify_user_order_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify if user_id is set and status changed
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: On Order Status Change
DROP TRIGGER IF EXISTS on_user_order_status_change ON public.orders;
CREATE TRIGGER on_user_order_status_change
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_user_order_status();
