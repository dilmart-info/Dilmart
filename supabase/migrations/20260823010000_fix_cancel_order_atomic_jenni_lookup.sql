-- DilMart-STORE-CANCEL-ORDER-JENNI-LOOKUP-001
-- Fixes a Production defect that made EVERY merchant rejection fail with HTTP 400.
--
-- SYMPTOM
--   POST /api/orders/:id/merchant-reject -> 400
--   OrderCancellationService: Atomic cancellation RPC failed
--   PostgreSQL: record "v_order" has no field "provider_shipment_id"
--
-- ROOT CAUSE
--   cancel_order_atomic() loads the order with `SELECT * INTO v_order FROM public.orders`, then
--   reads v_order.provider_shipment_id and v_order.dispatch_status to decide whether an active
--   carrier shipment blocks local cancellation. Neither column exists on public.orders. They are
--   columns of public.order_delivery_integrations, where the Jenni integration has always stored
--   them (order_id, provider_code, provider_shipment_id, dispatch_status).
--
--   plpgsql resolves RECORD field references at RUNTIME, so this never failed to create and never
--   failed a static check — it raised only when the branch was reached, which is every cancellation
--   that gets past the terminal-state guard. That is why the existing pure-JS cancellation test
--   suite could not catch it: it never executes PostgreSQL.
--
-- FIX
--   Read the two values from public.order_delivery_integrations for provider_code = 'jenni',
--   locked FOR UPDATE, and apply the SAME safety rule. No row means no Jenni integration, so
--   cancellation may proceed.
--
--   This is NOT a missing-schema problem: provider_shipment_id and dispatch_status must NOT be
--   added to public.orders. order_delivery_integrations is canonical.
--
-- CARRIER PROTECTION IS UNCHANGED AND SLIGHTLY STRICTER IN ITS NULL HANDLING
--   before:  (v_order.provider_shipment_id IS NOT NULL AND TRIM(...) <> '') OR dispatch_status = 'dispatched'
--   after:   NULLIF(BTRIM(v_provider_shipment_id), '') IS NOT NULL        OR dispatch_status = 'dispatched'
--   Identical truth table, expressed NULL-safely. An order with a real shipment id, or a dispatched
--   status even without an id, still raises JENNI_SHIPMENT_DISPATCHED.
--
-- EVERYTHING ELSE IS BYTE-FOR-BYTE THE DEPLOYED BODY
--   The order FOR UPDATE lock, merchant scope check, merchant CAS (status = 'new' AND
--   merchant_decision_status = 'pending'), terminal-state protection, inventory reversal,
--   sold_count reversal, coupon reversal, loyalty reversal, delivery event, notification outbox,
--   idempotency, cancellation audit fields, merchant rejection fields and the result JSON contract
--   are all unchanged. The deployed body was verified identical to
--   20260724150000_atomic_cancellation_engine.sql (md5 76c2e68d6d158e5db6b1ce1d11e928d5, 8201
--   chars) before this file was derived from it, so the diff really is only the Jenni lookup.
--   This file stores the body with LF endings rather than the deployed CRLF, so prosrc's md5 will
--   change on apply even for the untouched lines. Compare with CR stripped when diffing.
--
-- The historical migration 20260724150000 is NOT edited; it is already applied.
--
-- WHAT THIS MIGRATION CONTAINS
--   1. delivery_events actor CHECK extended with 'merchant' and 'customer' (additive)
--   2. cancel_order_atomic reads carrier state from the canonical order_delivery_integrations
--   3. fail-closed merchant scope guard
--   4. fail-closed customer ownership guard
--
-- ROLLBACK: supabase/migrations/rollback/20260823010000_fix_cancel_order_atomic_jenni_lookup.ROLLBACK.sql

BEGIN;

-- Fail fast rather than queue behind a busy Production lock. delivery_events is tiny (54 rows,
-- 176 kB in Production), so the validating CHECK scan is trivial and a plain validated constraint
-- is preferable to ADD ... NOT VALID plus a second migration. What must not happen is this
-- migration blocking indefinitely on a lock: with these timeouts it aborts and rolls back instead.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- DEFECT 2 — found by the new real-database verifier, blocking the same endpoint
-- ─────────────────────────────────────────────────────────────────────────────
-- cancel_order_atomic writes a delivery event with `actor_type = p_actor_type`, and merchant
-- rejection passes 'merchant' (backend/src/modules/orders/orders.service.ts). But
-- delivery_events_actor_type_check allows only admin / delivery_company / agent / system /
-- external_provider, in Production as well as in a clean migration replay, so that INSERT raises
--   new row for relation "delivery_events" violates check constraint "delivery_events_actor_type_check"
-- and aborts the whole cancellation transaction.
--
-- The Jenni defect above raises FIRST, so this one was never reached and never observed. Fixing
-- only the Jenni lookup would move merchant rejection from one HTTP 400 to a different HTTP 400.
-- Both must be fixed for the endpoint to work at all.
--
-- A static audit of every runtime caller of OrderCancellationService.cancelOrder finds exactly two,
-- and BOTH pass an actor the constraint rejects:
--   orders.service.ts merchantRejectOrder        -> 'merchant'
--   order-returns.service.ts requestCustomerCancellation -> 'customer'
-- (The admin/agent cancellation path does not reach this RPC at all — it routes through
-- deliveryOperationsService.markCancelled — so no other actor value needs to be allowed here.)
--
-- Both are the truthful audit actor for their cancellation, so the constraint is extended rather
-- than the event being suppressed or mislabelled as 'system'/'admin', which would silently falsify
-- the delivery audit trail. Additive only: every previously allowed value stays allowed, so no
-- existing row can be invalidated. Managed with the same drop-and-re-add pattern
-- 20260513100000_jenni_delivery_integration.sql already uses.
ALTER TABLE public.delivery_events DROP CONSTRAINT IF EXISTS delivery_events_actor_type_check;
ALTER TABLE public.delivery_events
  ADD CONSTRAINT delivery_events_actor_type_check
  CHECK (actor_type IN ('admin', 'delivery_company', 'agent', 'system', 'external_provider',
                        'merchant', 'customer'));

-- ─────────────────────────────────────────────────────────────────────────────
-- DEFECT 1 — the reported failure: carrier state read from the wrong table
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- Carrier state lives on order_delivery_integrations, never on orders.
  v_provider_shipment_id TEXT;
  v_dispatch_status TEXT;
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
  -- Fail closed: a merchant-initiated cancellation MUST carry an explicit merchant scope. Without
  -- this, p_expected_merchant_id = NULL would skip the ownership comparison below entirely and let
  -- a merchant-actor call cancel any order. The current backend caller always supplies it
  -- (orders.service.ts merchantRejectOrder), so this rejects only calls that were already unsafe.
  IF p_actor_type = 'merchant' AND p_expected_merchant_id IS NULL THEN
    RAISE EXCEPTION 'MERCHANT_SCOPE_REQUIRED: merchant cancellation requires explicit merchant scope';
  END IF;

  -- Fail closed for customers too. cancel_order_atomic is SECURITY DEFINER, so it must not depend
  -- on the caller's preflight ownership read: the backend check and this one are independent
  -- layers, and only this one is inside the locked transaction that performs the cancellation.
  IF p_actor_type = 'customer' THEN
    IF p_actor_id IS NULL THEN
      RAISE EXCEPTION 'CUSTOMER_SCOPE_REQUIRED: customer cancellation requires actor id';
    END IF;

    IF v_order.user_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'Customer scope mismatch for order: %', p_order_id;
    END IF;
  END IF;

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

  -- 5. Reject local cancellation if order has active Jenni shipment.
  --
  -- provider_shipment_id and dispatch_status are columns of order_delivery_integrations, NOT of
  -- orders. Reading them off the v_order RECORD raised
  --   record "v_order" has no field "provider_shipment_id"
  -- at runtime, which surfaced as HTTP 400 on every merchant rejection. Locked FOR UPDATE so a
  -- concurrent dispatch writing the same row serialises against this check.
  --
  -- No row means no Jenni integration exists, so cancellation may proceed.
  SELECT odi.provider_shipment_id, odi.dispatch_status
    INTO v_provider_shipment_id, v_dispatch_status
  FROM public.order_delivery_integrations odi
  WHERE odi.order_id = p_order_id
    AND odi.provider_code = 'jenni'
  FOR UPDATE;

  -- Same safety rule as before, NULL- and whitespace-safe: a shipment id that is present and not
  -- blank, or a dispatched status even without an id, both block local cancellation.
  IF NULLIF(BTRIM(v_provider_shipment_id), '') IS NOT NULL
     OR v_dispatch_status = 'dispatched' THEN
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
