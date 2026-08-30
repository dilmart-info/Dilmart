-- Migration: Atomic Order Cancellation Engine and Merchant Rejection (PR-2)
-- Timestamp: 20260724150000

-- 1. Expand public.orders with cancellation fields
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by_type TEXT NULL CHECK (cancelled_by_type IN ('merchant', 'customer', 'admin', 'system')),
  ADD COLUMN IF NOT EXISTS cancelled_by_id UUID NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS cancellation_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS cancellation_effects_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inventory_reverted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS coupon_reverted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS loyalty_reverted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_orders_cancelled_at ON public.orders(cancelled_at) WHERE cancelled_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_cancellation_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id UUID NULL,
  reason_code TEXT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cancellation_operations_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_cancellation_ops_order ON public.order_cancellation_operations(order_id);

ALTER TABLE public.order_cancellation_operations ENABLE ROW LEVEL SECURITY;

-- 1b. Notification Outbox Table
CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('customer', 'admin', 'merchant')),
  recipient_id UUID NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ NULL,
  locked_by TEXT NULL,
  processed_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_notification_outbox_batch(
  p_worker_id TEXT,
  p_limit INTEGER
)
RETURNS TABLE (
  id UUID,
  event_key TEXT,
  recipient_type TEXT,
  recipient_id UUID,
  title TEXT,
  message TEXT,
  link TEXT
) AS $$
BEGIN
  RETURN QUERY
  UPDATE public.notification_outbox
  SET status = 'processing',
      locked_at = NOW(),
      locked_by = p_worker_id,
      attempt_count = attempt_count + 1
  WHERE notification_outbox.id IN (
    SELECT o.id
    FROM public.notification_outbox o
    WHERE (o.status = 'pending' OR (o.status = 'processing' AND o.locked_at < NOW() - INTERVAL '5 minutes'))
      AND o.next_attempt_at <= NOW()
    ORDER BY o.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING notification_outbox.id, notification_outbox.event_key, notification_outbox.recipient_type, notification_outbox.recipient_id, notification_outbox.title, notification_outbox.message, notification_outbox.link;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.claim_notification_outbox_batch(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_outbox_batch(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_notification_outbox_batch(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_outbox_batch(TEXT, INTEGER) TO service_role;

-- 2. Create Atomic Order Cancellation RPC
CREATE OR REPLACE FUNCTION public.cancel_order_atomic(
  p_order_id UUID,
  p_actor_type TEXT,
  p_actor_id UUID DEFAULT NULL,
  p_reason_code TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_expected_merchant_id UUID DEFAULT NULL,
  p_mark_merchant_rejected BOOLEAN DEFAULT false,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_op RECORD;
  v_inventory_reverted BOOLEAN := false;
  v_coupon_reverted BOOLEAN := false;
  v_loyalty_reverted BOOLEAN := false;
  v_already_cancelled BOOLEAN := false;
  v_old_status TEXT;
  v_res JSONB;
BEGIN
  -- 0. Check idempotency key if provided
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    SELECT * INTO v_op FROM public.order_cancellation_operations WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_op.result || jsonb_build_object('already_cancelled', true);
    END IF;
  END IF;

  -- 1. Lock order row
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  v_old_status := v_order.status;

  -- 2. Verify merchant scope if requested
  IF p_expected_merchant_id IS NOT NULL AND v_order.merchant_id <> p_expected_merchant_id THEN
    RAISE EXCEPTION 'Merchant scope mismatch for order: %', p_order_id;
  END IF;

  -- 3. Check if already cancelled
  IF v_order.status = 'cancelled' THEN
    v_already_cancelled := true;
    v_res := jsonb_build_object(
      'order_id', p_order_id,
      'order_number', v_order.order_number,
      'old_status', v_old_status,
      'new_status', 'cancelled',
      'inventory_reverted', v_order.inventory_reverted_at IS NOT NULL,
      'coupon_reverted', v_order.coupon_reverted_at IS NOT NULL,
      'loyalty_reverted', v_order.loyalty_reverted_at IS NOT NULL,
      'already_cancelled', true
    );
    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
      INSERT INTO public.order_cancellation_operations (order_id, idempotency_key, actor_type, actor_id, reason_code, result)
      VALUES (p_order_id, p_idempotency_key, p_actor_type, p_actor_id, p_reason_code, v_res)
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
    RETURN v_res;
  END IF;

  -- 2b. Enforce strict CAS constraint for merchant rejection
  IF p_mark_merchant_rejected THEN
    IF v_order.merchant_decision_status <> 'pending' OR v_order.status <> 'new' THEN
      RAISE EXCEPTION 'ORDER_DECISION_ALREADY_MADE: Order decision status is % and order status is %', v_order.merchant_decision_status, v_order.status;
    END IF;
  END IF;

  -- 4. Reject cancellation if order is in immutable terminal state
  IF v_order.status IN ('delivered', 'returned') THEN
    RAISE EXCEPTION 'Cannot cancel completed order with status: %', v_order.status;
  END IF;

  -- 5. Reject local cancellation if order has active Jenni shipment
  IF (v_order.provider_shipment_id IS NOT NULL AND TRIM(v_order.provider_shipment_id) <> '')
     OR v_order.dispatch_status = 'dispatched' THEN
    RAISE EXCEPTION 'JENNI_SHIPMENT_DISPATCHED: Order has active carrier shipment and requires admin intervention';
  END IF;

  -- 6. Atomically update order status
  UPDATE public.orders
  SET
    status = 'cancelled',
    delivery_status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, NOW()),
    cancelled_by_type = COALESCE(cancelled_by_type, p_actor_type),
    cancelled_by_id = COALESCE(cancelled_by_id, p_actor_id),
    cancellation_reason_code = COALESCE(cancellation_reason_code, p_reason_code),
    cancellation_notes = COALESCE(cancellation_notes, p_notes),
    merchant_decision_status = CASE WHEN p_mark_merchant_rejected THEN 'rejected' ELSE merchant_decision_status END,
    merchant_rejection_reason_code = CASE WHEN p_mark_merchant_rejected THEN p_reason_code ELSE merchant_rejection_reason_code END,
    merchant_decision_at = CASE WHEN p_mark_merchant_rejected THEN NOW() ELSE merchant_decision_at END,
    merchant_decision_by = CASE WHEN p_mark_merchant_rejected THEN p_actor_id ELSE merchant_decision_by END,
    updated_at = NOW()
  WHERE id = p_order_id;

  -- 7. Revert inventory (once)
  IF v_order.inventory_reverted_at IS NULL THEN
    FOR v_item IN
      SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id
    LOOP
      UPDATE public.products
      SET
        stock = COALESCE(stock, 0) + v_item.quantity,
        sold_count = GREATEST(0, COALESCE(sold_count, 0) - v_item.quantity),
        updated_at = NOW()
      WHERE id = v_item.product_id;
    END LOOP;

    UPDATE public.orders SET inventory_reverted_at = NOW() WHERE id = p_order_id;
    v_inventory_reverted := true;
  ELSE
    v_inventory_reverted := true;
  END IF;

  -- 8. Revert coupon usage (once)
  IF v_order.coupon_id IS NOT NULL AND v_order.coupon_reverted_at IS NULL THEN
    UPDATE public.coupons
    SET
      used_count = GREATEST(0, COALESCE(used_count, 0) - 1),
      updated_at = NOW()
    WHERE id = v_order.coupon_id;

    UPDATE public.orders SET coupon_reverted_at = NOW() WHERE id = p_order_id;
    v_coupon_reverted := true;
  ELSE
    v_coupon_reverted := (v_order.coupon_id IS NULL OR v_order.coupon_reverted_at IS NOT NULL);
  END IF;

  -- 9. Revert spent loyalty points (once)
  IF v_order.user_id IS NOT NULL AND COALESCE(v_order.points_spent, 0) > 0 AND v_order.loyalty_reverted_at IS NULL THEN
    INSERT INTO public.loyalty_transactions (user_id, order_id, amount, transaction_type, description)
    VALUES (
      v_order.user_id,
      p_order_id,
      v_order.points_spent,
      'admin_adjustment',
      'استرجاع نقاط مصروفة لطلب ملغى #' || v_order.order_number
    );

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_available_points') THEN
      UPDATE public.profiles
      SET points = public.get_available_points(v_order.user_id),
          updated_at = NOW()
      WHERE id = v_order.user_id;
    END IF;

    UPDATE public.orders SET loyalty_reverted_at = NOW() WHERE id = p_order_id;
    v_loyalty_reverted := true;
  ELSE
    v_loyalty_reverted := true;
  END IF;

  -- 10. Record delivery event
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'delivery_events') THEN
    INSERT INTO public.delivery_events (order_id, event_type, actor_type, actor_id, notes, created_at)
    VALUES (p_order_id, 'cancelled', p_actor_type, p_actor_id, COALESCE(p_notes, 'Atomic cancellation executed'), NOW());
  END IF;

  v_res := jsonb_build_object(
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'old_status', v_old_status,
    'new_status', 'cancelled',
    'inventory_reverted', v_inventory_reverted,
    'coupon_reverted', v_coupon_reverted,
    'loyalty_reverted', v_loyalty_reverted,
    'already_cancelled', false
  );

  -- 11. Write outbox notification events inside same transaction
  IF v_order.user_id IS NOT NULL THEN
    INSERT INTO public.notification_outbox (event_key, recipient_type, recipient_id, title, message, link)
    VALUES (
      'cancel-customer:' || p_order_id,
      'customer',
      v_order.user_id,
      'تم إلغاء الطلب #' || v_order.order_number,
      CASE WHEN p_mark_merchant_rejected THEN
        'عذراً، اعتذر التاجر عن قبول طلبك #' || v_order.order_number || '. السبب: ' || COALESCE(p_reason_code, 'غير متوفر')
      ELSE
        'تم إلغاء الطلب #' || v_order.order_number || ' بنجاح.'
      END,
      '/account/orders/' || p_order_id
    ) ON CONFLICT (event_key) DO NOTHING;
  END IF;

  IF p_mark_merchant_rejected THEN
    INSERT INTO public.notification_outbox (event_key, recipient_type, recipient_id, title, message, link)
    VALUES (
      'cancel-admin:' || p_order_id,
      'admin',
      NULL,
      'تم رفض وإلغاء الطلب #' || v_order.order_number,
      'سبب الرفض: ' || COALESCE(p_reason_code, 'غير محدد'),
      '/admin/orders/' || p_order_id
    ) ON CONFLICT (event_key) DO NOTHING;
  END IF;

  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    INSERT INTO public.order_cancellation_operations (order_id, idempotency_key, actor_type, actor_id, reason_code, result)
    VALUES (p_order_id, p_idempotency_key, p_actor_type, p_actor_id, p_reason_code, v_res)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.cancel_order_atomic(UUID, TEXT, UUID, TEXT, TEXT, UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_order_atomic(UUID, TEXT, UUID, TEXT, TEXT, UUID, BOOLEAN, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_order_atomic(UUID, TEXT, UUID, TEXT, TEXT, UUID, BOOLEAN, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_atomic(UUID, TEXT, UUID, TEXT, TEXT, UUID, BOOLEAN, TEXT) TO service_role;

-- 3. Redefine notify_user_order_status trigger function to exclude 'cancelled' status
CREATE OR REPLACE FUNCTION public.notify_user_order_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Exclude 'cancelled' status because it is handled by the notification outbox worker
  IF NEW.user_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
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
          ELSE NEW.status
        END,
      '/profile'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Harden notification tables against client injection and add source_event_key deduplication indexes
DROP POLICY IF EXISTS "Users can insert own notifications only" ON public.user_notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.user_notifications;

ALTER TABLE public.user_notifications ADD COLUMN IF NOT EXISTS source_event_key TEXT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notifications_source_event_key ON public.user_notifications(source_event_key) WHERE source_event_key IS NOT NULL;

ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS source_event_key TEXT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_notifications_source_event_key ON public.admin_notifications(source_event_key) WHERE source_event_key IS NOT NULL;
