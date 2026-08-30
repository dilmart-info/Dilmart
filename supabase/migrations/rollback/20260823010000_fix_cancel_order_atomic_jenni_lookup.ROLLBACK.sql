-- ROLLBACK for 20260823010000_fix_cancel_order_atomic_jenni_lookup.sql
--
-- ⚠ EMERGENCY ONLY — THIS RESTORES A KNOWN-BROKEN FUNCTION.
--
-- The body below is the pre-fix deployed definition, verified against Production ignoring line
-- endings: md5(prosrc without CR) = f4c12e323f766654ea51febf70617938, 7997 chars, identical on both
-- sides. The deployed original is stored CRLF (md5 76c2e68d6d158e5db6b1ce1d11e928d5, 8201 chars);
-- this file is LF, so the restored body is semantically identical but not byte-identical.
--
-- It contains the defect this migration exists to fix: it reads
-- v_order.provider_shipment_id and v_order.dispatch_status, neither of which is a column of
-- public.orders, so plpgsql raises
--   record "v_order" has no field "provider_shipment_id"
-- at runtime.
--
-- CONSEQUENCE OF RUNNING THIS: every merchant rejection and every order cancellation that reaches
-- the Jenni check fails again with HTTP 400. That is a live customer- and merchant-facing outage,
-- not a degraded edge case. Do not run it to "return to the known state" — the known state is the
-- outage.
--
-- Run it only if the corrective function is proven to cause a WORSE regression, and expect to
-- re-apply the fix immediately afterwards.
--
-- It restores no schema and touches no data: only the function body changes.

BEGIN;

-- Same fail-fast lock policy as the forward migration: abort rather than queue.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Restores the narrower delivery_events actor_type constraint (no 'merchant'). Safe only because
-- the restored function body below fails before ever reaching the delivery-event INSERT. If any
-- row with actor_type = 'merchant' was written while the fix was live, this ALTER will fail — that
-- is deliberate: it refuses to leave the table in a state its own constraint rejects.
ALTER TABLE public.delivery_events DROP CONSTRAINT IF EXISTS delivery_events_actor_type_check;
ALTER TABLE public.delivery_events
  ADD CONSTRAINT delivery_events_actor_type_check
  CHECK (actor_type IN ('admin', 'delivery_company', 'agent', 'system', 'external_provider'));

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

COMMIT;
