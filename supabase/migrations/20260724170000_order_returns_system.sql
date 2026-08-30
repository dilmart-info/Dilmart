-- Migration: Order Return Requests & Customer Cancellation System (PR-4)
-- Timestamp: 20260724170000

-- 1. Create order_cancellation_requests table for cancellation review workflow
CREATE TABLE IF NOT EXISTS public.order_cancellation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL,
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn', 'completed')),
  reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  review_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cancellation_requests_order ON public.order_cancellation_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_user ON public.order_cancellation_requests(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_cancellation_request_per_order
  ON public.order_cancellation_requests(order_id)
  WHERE status = 'pending';

-- 2. Create order_return_requests table for post-delivery return requests
CREATE TABLE IF NOT EXISTS public.order_return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL,
  reason_details TEXT NULL,
  evidence_urls TEXT[] NULL,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'awaiting_item', 'item_received', 'completed', 'cancelled')),
  refund_status TEXT NOT NULL DEFAULT 'not_required' CHECK (refund_status IN ('not_required', 'pending_manual', 'manual_completed', 'rejected')),
  refund_amount NUMERIC(12,2) NULL CHECK (refund_amount IS NULL OR refund_amount > 0),
  refund_reference TEXT NULL CHECK (refund_reference IS NULL OR TRIM(refund_reference) <> ''),
  refund_completed_at TIMESTAMPTZ NULL,
  received_at TIMESTAMPTZ NULL,
  admin_notes TEXT NULL,
  merchant_notes TEXT NULL,
  reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_return_requests_refund_ref 
  ON public.order_return_requests(refund_reference) 
  WHERE refund_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_return_requests_order ON public.order_return_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_order_return_requests_customer ON public.order_return_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_return_requests_merchant ON public.order_return_requests(merchant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_return_request_per_order
  ON public.order_return_requests(order_id)
  WHERE status NOT IN ('rejected', 'completed', 'cancelled');

-- Enable RLS
ALTER TABLE public.order_cancellation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_return_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for order_cancellation_requests
CREATE POLICY "Customers can view their own cancellation requests"
  ON public.order_cancellation_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins and scoped Merchants can view cancellation requests"
  ON public.order_cancellation_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.merchant_users mu ON mu.merchant_id = o.merchant_id
      WHERE o.id = order_cancellation_requests.order_id
        AND mu.user_id = auth.uid()
    )
  );

-- RLS Policies for order_return_requests
CREATE POLICY "Customers can view their own return requests"
  ON public.order_return_requests FOR SELECT
  USING (auth.uid() = customer_id);

CREATE POLICY "Admins and scoped Merchants can view return requests"
  ON public.order_return_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.merchant_users mu
      WHERE mu.merchant_id = order_return_requests.merchant_id
        AND mu.user_id = auth.uid()
    )
  );

-- 3. Atomic Cancellation Review and Return RPCs
CREATE OR REPLACE FUNCTION public.review_cancellation_request_atomic(
  p_request_id UUID,
  p_action TEXT,
  p_reviewed_by UUID,
  p_notes TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_req RECORD;
  v_res JSONB;
BEGIN
  -- 1. Lock the cancellation request row
  SELECT * INTO v_req
  FROM public.order_cancellation_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCELLATION_REQUEST_NOT_FOUND: Request ID does not exist';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'INVALID_REQUEST_STATE: Request is already reviewed or cancelled';
  END IF;

  IF p_action = 'approve' THEN
    -- Execute atomic order cancellation
    v_res := public.cancel_order_atomic(
      p_order_id => v_req.order_id,
      p_actor_type => 'admin',
      p_actor_id => p_reviewed_by,
      p_reason_code => 'admin_approved_cancellation',
      p_idempotency_key => 'cancel_approve_' || p_request_id,
      p_notes => p_notes,
      p_mark_merchant_rejected => false,
      p_expected_merchant_id => NULL
    );

    UPDATE public.order_cancellation_requests
    SET status = 'approved',
        reviewed_by = p_reviewed_by,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'approved',
      'cancellation_result', v_res
    );

  ELSIF p_action = 'reject' THEN
    UPDATE public.order_cancellation_requests
    SET status = 'rejected',
        reviewed_by = p_reviewed_by,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'rejected'
    );

  ELSE
    RAISE EXCEPTION 'INVALID_ACTION: Action must be approve or reject';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.review_cancellation_request_atomic(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_cancellation_request_atomic(UUID, TEXT, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.review_cancellation_request_atomic(UUID, TEXT, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.review_cancellation_request_atomic(UUID, TEXT, UUID, TEXT) TO service_role;

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
REVOKE ALL ON FUNCTION public.mark_return_item_received_atomic(UUID, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.mark_return_item_received_atomic(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_return_item_received_atomic(UUID, UUID, TEXT) TO service_role;

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
      'already_completed', true
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
    'refund_status', 'manual_completed'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.complete_return_refund_atomic(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_return_refund_atomic(UUID, NUMERIC, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.complete_return_refund_atomic(UUID, NUMERIC, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_return_refund_atomic(UUID, NUMERIC, TEXT, TEXT) TO service_role;

-- 4. Atomic Review Return Request RPC
CREATE OR REPLACE FUNCTION public.review_return_request_atomic(
  p_return_request_id UUID,
  p_decision TEXT,
  p_actor_id UUID,
  p_admin_notes TEXT,
  p_merchant_notes TEXT
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

REVOKE ALL ON FUNCTION public.review_return_request_atomic(UUID, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_return_request_atomic(UUID, TEXT, UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.review_return_request_atomic(UUID, TEXT, UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.review_return_request_atomic(UUID, TEXT, UUID, TEXT, TEXT) TO service_role;

-- Ensure service_role has permissions to read/write all tables/sequences in public schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- Grant permissions to auth schema and auth.users for foreign keys check
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT SELECT, REFERENCES ON auth.users TO service_role;
