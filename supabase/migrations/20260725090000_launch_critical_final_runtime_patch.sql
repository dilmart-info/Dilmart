-- Additive Cumulative Migration: Launch Critical Final Runtime Patch (PR-5 + Final Gate)
-- Timestamp: 20260725090000

-- 1. Ensure RLS Policy Lockdown on user_notifications (From PR-5 fixes + Final Gate)
-- Remove ALL insert policies including any that allow authenticated clients to write.
-- Do NOT recreate any INSERT policy for authenticated users.
DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "Users can insert own notifications only" ON public.user_notifications;

-- 2. Add uq_auth_action_operations_token index (From PR-5 fixes)
CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_action_operations_token
  ON public.auth_action_operations(token_id);

-- 3. Redefine reserve_auth_action_token with qualified purpose column (From PR-5 fixes)
CREATE OR REPLACE FUNCTION public.reserve_auth_action_token(
  p_token_digest TEXT,
  p_expected_purpose TEXT
)
RETURNS TABLE (
  id UUID,
  reservation_id UUID,
  user_id UUID,
  phone_normalized TEXT,
  challenge_id UUID,
  purpose TEXT
) AS $$
DECLARE
  v_new_reservation_id UUID;
BEGIN
  v_new_reservation_id := gen_random_uuid();

  RETURN QUERY
  UPDATE public.auth_action_tokens
  SET status = 'reserved',
      reservation_id = v_new_reservation_id,
      reserved_at = NOW(),
      reserved_until = NOW() + INTERVAL '5 minutes'
  WHERE token_digest = p_token_digest
    AND auth_action_tokens.purpose = p_expected_purpose
    AND (status = 'active' OR status IS NULL OR (status = 'reserved' AND reserved_until < NOW()))
    AND consumed_at IS NULL
    AND expires_at > NOW()
  RETURNING auth_action_tokens.id, auth_action_tokens.reservation_id, auth_action_tokens.user_id, auth_action_tokens.phone_normalized, auth_action_tokens.challenge_id, auth_action_tokens.purpose;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.reserve_auth_action_token(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_auth_action_token(TEXT, TEXT) TO service_role;

-- 4. Redefine claim_notification_outbox_batch with qualified id column (From PR-5 fixes)
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
GRANT EXECUTE ON FUNCTION public.claim_notification_outbox_batch(TEXT, INTEGER) TO service_role;

-- 5. Drop legacy 2-argument mark_return_item_received_atomic RPC (historical overload)
DROP FUNCTION IF EXISTS public.mark_return_item_received_atomic(UUID, TEXT);

-- 5b. Redefine mark_return_item_received_atomic using override function (3-argument canonical form)
CREATE OR REPLACE FUNCTION public.mark_return_item_received_atomic(
  p_request_id UUID,
  p_actor_id UUID,
  p_notes TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_req RECORD;
  v_order RECORD;
BEGIN
  -- 1. Lock return request
  SELECT * INTO v_req
  FROM public.order_return_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RETURN_REQUEST_NOT_FOUND: Request ID does not exist';
  END IF;

  -- ENFORCE: Must be awaiting_item only!
  IF v_req.status <> 'awaiting_item' THEN
    RAISE EXCEPTION 'INVALID_RETURN_STATE: Return request status must be awaiting_item';
  END IF;

  -- 2. Lock order
  SELECT id, status, delivery_status, delivery_company_id, agent_id
  INTO v_order
  FROM public.orders
  WHERE id = v_req.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order for this return request does not exist';
  END IF;

  -- 3. Call admin_override_delivery_status to transition order from delivered to returned terminal state
  PERFORM public.admin_override_delivery_status(
    p_order_id    => v_req.order_id,
    p_next_status => 'returned',
    p_actor_id    => p_actor_id,
    p_reason      => COALESCE(p_notes, 'المنتج مسترجع وتم استلامه في مخزن المنصة')
  );

  -- 4. Update return request status
  UPDATE public.order_return_requests
  SET status = 'item_received',
      received_at = NOW(),
      admin_notes = COALESCE(admin_notes, '') || E'\n' || COALESCE(p_notes, ''),
      updated_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'item_received'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.mark_return_item_received_atomic(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_return_item_received_atomic(UUID, UUID, TEXT) TO service_role;

-- 6. Add 'finalizing' to auth_action_tokens status check constraint
ALTER TABLE public.auth_action_tokens DROP CONSTRAINT IF EXISTS auth_action_tokens_status_check;
ALTER TABLE public.auth_action_tokens ADD CONSTRAINT auth_action_tokens_status_check CHECK (status IN ('active', 'reserved', 'finalizing', 'consumed', 'released', 'expired'));

-- 7. Add request_fingerprint column to auth_action_operations table
ALTER TABLE public.auth_action_operations ADD COLUMN IF NOT EXISTS request_fingerprint TEXT NULL;

-- 8. Create begin_password_reset_finalization RPC function
CREATE OR REPLACE FUNCTION public.begin_password_reset_finalization(
  p_token_id UUID,
  p_reservation_id UUID,
  p_request_fingerprint TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_rows_affected INTEGER;
BEGIN
  -- Lock and update token status to finalizing
  UPDATE public.auth_action_tokens
  SET status = 'finalizing'
  WHERE id = p_token_id
    AND status = 'reserved'
    AND reservation_id = p_reservation_id
    AND purpose = 'password_reset'
    AND consumed_at IS NULL;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'INVALID_RESERVATION: Token is not reserved by this reservation ID';
  END IF;

  -- Insert or update auth_action_operations saga tracking
  INSERT INTO public.auth_action_operations (
    token_id,
    reservation_id,
    operation_type,
    source_user_id,
    stage,
    request_fingerprint,
    updated_at
  )
  SELECT 
    p_token_id,
    p_reservation_id,
    'password_reset',
    user_id,
    'password_update_pending',
    p_request_fingerprint,
    NOW()
  FROM public.auth_action_tokens
  WHERE id = p_token_id
  ON CONFLICT (token_id) DO UPDATE SET
    reservation_id = EXCLUDED.reservation_id,
    stage = 'password_update_pending',
    request_fingerprint = EXCLUDED.request_fingerprint,
    updated_at = NOW();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.begin_password_reset_finalization(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.begin_password_reset_finalization(UUID, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.begin_password_reset_finalization(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.begin_password_reset_finalization(UUID, UUID, TEXT) TO service_role;

-- 9. Redefine release_auth_action_token_reservation to restrict release of finalizing tokens
CREATE OR REPLACE FUNCTION public.release_auth_action_token_reservation(
  p_token_id UUID,
  p_reservation_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_rows_affected INTEGER;
BEGIN
  UPDATE public.auth_action_tokens
  SET status = 'active',
      reservation_id = NULL,
      reserved_at = NULL,
      reserved_until = NULL
  WHERE id = p_token_id
    AND status = 'reserved' -- Restrict release to 'reserved' only (no 'finalizing')
    AND reservation_id = p_reservation_id
    AND consumed_at IS NULL;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'INVALID_RESERVATION: Token is not reserved by this reservation ID or already consumed';
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.release_auth_action_token_reservation(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_auth_action_token_reservation(UUID, UUID) TO service_role;

-- 10. Redefine consume_auth_action_token atomically:
--     Token status update and operation-stage transition execute in the same
--     PostgreSQL transaction. If the operation update fails, the whole function
--     rolls back. Zero affected operation rows is allowed (non-Saga tokens).
CREATE OR REPLACE FUNCTION public.consume_auth_action_token(
  p_token_id UUID,
  p_reservation_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_rows_affected INTEGER;
BEGIN
  UPDATE public.auth_action_tokens
  SET status = 'consumed',
      consumed_at = COALESCE(consumed_at, NOW())
  WHERE id = p_token_id
    AND status IN ('reserved', 'finalizing')
    AND reservation_id = p_reservation_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION
      'INVALID_RESERVATION: Token is not reserved by this reservation ID or already consumed';
  END IF;

  -- Atomically advance the Saga stage to token_consumed.
  -- Targets only rows not yet completed; zero affected rows is allowed
  -- for token purposes that do not use an operation record.
  UPDATE public.auth_action_operations
  SET stage = 'token_consumed',
      updated_at = NOW()
  WHERE token_id = p_token_id
    AND reservation_id = p_reservation_id
    AND stage <> 'completed';

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION public.consume_auth_action_token(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_auth_action_token(UUID, UUID) TO service_role;


-- 11. Drop old unscoped review_return_request_atomic RPC signature
DROP FUNCTION IF EXISTS public.review_return_request_atomic(UUID, TEXT, UUID, TEXT, TEXT);

-- 12. Create new scoped review_return_request_atomic RPC signature
CREATE OR REPLACE FUNCTION public.review_return_request_atomic(
  p_return_request_id UUID,
  p_decision TEXT,
  p_actor_id UUID,
  p_admin_notes TEXT,
  p_merchant_notes TEXT,
  p_expected_merchant_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_req RECORD;
  v_allowed_next TEXT[];
  v_status_to_set TEXT;
BEGIN
  -- Normalize decision
  v_status_to_set := CASE
    WHEN p_decision = 'approve' THEN 'approved'
    WHEN p_decision = 'reject' THEN 'rejected'
    ELSE p_decision
  END;

  IF v_status_to_set = 'completed' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: Cannot transition return request to completed via review RPC';
  END IF;

  -- 1. Lock return request row
  SELECT * INTO v_req
  FROM public.order_return_requests
  WHERE id = p_return_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RETURN_REQUEST_NOT_FOUND: Return request does not exist';
  END IF;

  -- Enforce merchant scope
  IF p_expected_merchant_id IS NOT NULL
     AND v_req.merchant_id <> p_expected_merchant_id
  THEN
    RAISE EXCEPTION
      'MERCHANT_SCOPE_MISMATCH: Return request belongs to another merchant';
  END IF;

  -- Enforce allowed transitions
  v_allowed_next := CASE v_req.status
    WHEN 'pending_review' THEN ARRAY['approved', 'rejected']
    WHEN 'approved'       THEN ARRAY['awaiting_item']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (v_status_to_set = ANY(v_allowed_next)) THEN
    RAISE EXCEPTION 'INVALID_RETURN_STATE_TRANSITION: Cannot transition from % to %', v_req.status, v_status_to_set;
  END IF;

  -- 2. Update status and notes
  UPDATE public.order_return_requests
  SET status = v_status_to_set,
      admin_notes = p_admin_notes,
      merchant_notes = p_merchant_notes,
      reviewed_by = p_actor_id,
      reviewed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_return_request_id;

  -- 3. Insert notification outbox event for customer
  INSERT INTO public.notification_outbox (event_key, recipient_type, recipient_id, title, message, link)
  VALUES (
    'return-review:' || p_return_request_id || ':' || v_status_to_set,
    'customer',
    v_req.customer_id,
    'تحديث بشأن طلب الإرجاع',
    CASE 
      WHEN v_status_to_set = 'approved' OR v_status_to_set = 'awaiting_item' THEN 'تم قبول طلب الإرجاع الخاص بك، يرجى تجهيز المنتجات لاستلامها'
      ELSE 'تم رفض طلب الإرجاع'
    END,
    '/account/orders/' || v_req.order_id
  ) ON CONFLICT (event_key) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status_to_set
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.review_return_request_atomic(UUID, TEXT, UUID, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_return_request_atomic(UUID, TEXT, UUID, TEXT, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.review_return_request_atomic(UUID, TEXT, UUID, TEXT, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.review_return_request_atomic(UUID, TEXT, UUID, TEXT, TEXT, UUID) TO service_role;

-- 13. Redefine complete_return_refund_atomic to return extra idempotency details
CREATE OR REPLACE FUNCTION public.complete_return_refund_atomic(
  p_request_id UUID,
  p_refund_amount NUMERIC,
  p_refund_reference TEXT,
  p_notes TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_req RECORD;
  v_order RECORD;
BEGIN
  IF p_refund_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_REFUND_AMOUNT: Refund amount must be positive';
  END IF;

  IF p_refund_reference IS NULL OR TRIM(p_refund_reference) = '' THEN
    RAISE EXCEPTION 'INVALID_REFUND_REFERENCE: Refund reference must be non-empty';
  END IF;

  -- 1. Lock return request
  SELECT * INTO v_req
  FROM public.order_return_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RETURN_REQUEST_NOT_FOUND: Request ID does not exist';
  END IF;

  -- Idempotency check: if already completed with same reference and amount
  IF v_req.status = 'completed'
     AND v_req.refund_reference = p_refund_reference
     AND v_req.refund_amount = p_refund_amount
  THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_completed', true,
      'refund_amount', p_refund_amount,
      'refund_reference', p_refund_reference
    );
  END IF;

  -- Enforce: must be item_received only!
  IF v_req.status <> 'item_received' THEN
    RAISE EXCEPTION 'INVALID_RETURN_STATE: Return request status must be item_received to complete refund';
  END IF;

  -- Check duplicate refund reference
  IF EXISTS (
    SELECT 1 FROM public.order_return_requests
    WHERE refund_reference = p_refund_reference AND id <> p_request_id
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_REFUND_REFERENCE: Refund reference already exists';
  END IF;

  -- 2. Lock order row
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_req.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order for this return request does not exist';
  END IF;

  -- Validate amount limit
  IF p_refund_amount > v_order.total THEN
    RAISE EXCEPTION 'INVALID_REFUND_AMOUNT: Refund amount cannot exceed order total of %', v_order.total;
  END IF;

  -- 3. Update return request status
  UPDATE public.order_return_requests
  SET status = 'completed',
      refund_status = 'manual_completed',
      refund_amount = p_refund_amount,
      refund_reference = p_refund_reference,
      refund_completed_at = NOW(),
      admin_notes = COALESCE(admin_notes, '') || E'\n' || COALESCE(p_notes, ''),
      updated_at = NOW()
  WHERE id = p_request_id;

  -- 4. Update order status to returned
  UPDATE public.orders
  SET status = 'returned',
      updated_at = NOW()
  WHERE id = v_req.order_id;

  -- 5. Insert notification outbox event
  IF v_order.user_id IS NOT NULL THEN
    INSERT INTO public.notification_outbox (event_key, recipient_type, recipient_id, title, message, link)
    VALUES (
      'refund-complete:' || p_request_id,
      'customer',
      v_order.user_id,
      'تم إكمال استرجاع طلبك #' || v_order.order_number,
      'تمت معالجة استرجاع طلبك بنجاح بمبلغ ' || p_refund_amount || ' د.ع. رقم المرجع: ' || p_refund_reference,
      '/account/orders/' || v_req.order_id
    ) ON CONFLICT (event_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'completed',
    'refund_status', 'manual_completed',
    'already_completed', false,
    'refund_amount', p_refund_amount,
    'refund_reference', p_refund_reference
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.complete_return_refund_atomic(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_return_refund_atomic(UUID, NUMERIC, TEXT, TEXT) TO service_role;

-- Ensure service_role has permissions to read/write all tables/sequences in public schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- Grant permissions to auth schema and auth.users for foreign keys check
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT SELECT, REFERENCES ON auth.users TO service_role;
