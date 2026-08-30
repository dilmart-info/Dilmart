-- Phase 1: Merchant Web Push (amended)
-- - push subscriptions
-- - per-subscription delivery ledger (idempotent multi-device)
-- - acknowledgement columns
-- - Phase-1 alert settings only (NO WhatsApp columns)
-- - revoke direct client UPDATE on merchant_notifications
-- - enqueue push outbox from new-order trigger

-- ---------------------------------------------------------------------------
-- 1. merchant_push_subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchant_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  device_label TEXT NULL,
  user_agent TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  last_success_at TIMESTAMPTZ NULL,
  last_failure_at TIMESTAMPTZ NULL,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_merchant_push_merchant_endpoint UNIQUE (merchant_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_merchant_push_subs_merchant_status
  ON public.merchant_push_subscriptions (merchant_id, status);

CREATE INDEX IF NOT EXISTS idx_merchant_push_subs_user
  ON public.merchant_push_subscriptions (user_id);

ALTER TABLE public.merchant_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Merchant members can view own push subscriptions"
  ON public.merchant_push_subscriptions;

-- Lock down direct client access (SELECT, INSERT, UPDATE, DELETE) completely
REVOKE ALL ON public.merchant_push_subscriptions FROM authenticated, anon, public;
GRANT ALL ON public.merchant_push_subscriptions TO service_role;

DROP POLICY IF EXISTS "No direct client insert on merchant_push_subscriptions"
  ON public.merchant_push_subscriptions;
DROP POLICY IF EXISTS "No direct client update on merchant_push_subscriptions"
  ON public.merchant_push_subscriptions;
DROP POLICY IF EXISTS "No direct client delete on merchant_push_subscriptions"
  ON public.merchant_push_subscriptions;


-- ---------------------------------------------------------------------------
-- 2. Per-subscription push delivery ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchant_push_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID NOT NULL
    REFERENCES public.notification_outbox(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL
    REFERENCES public.merchant_push_subscriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'sending',
        'accepted',
        'retryable_failure',
        'permanent_failure',
        'skipped'
      )
    ),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider_status_code INTEGER NULL,
  last_error TEXT NULL,
  accepted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_merchant_push_delivery UNIQUE (outbox_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_merchant_push_deliveries_outbox_status
  ON public.merchant_push_deliveries (outbox_id, status, next_attempt_at);

ALTER TABLE public.merchant_push_deliveries ENABLE ROW LEVEL SECURITY;

-- Service-role only; merchants must not read raw delivery/provider errors broadly.
DROP POLICY IF EXISTS "No direct client access on merchant_push_deliveries"
  ON public.merchant_push_deliveries;
CREATE POLICY "No direct client access on merchant_push_deliveries"
  ON public.merchant_push_deliveries
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.merchant_push_deliveries FROM authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- 3. Acknowledgement columns on merchant_notifications
-- ---------------------------------------------------------------------------
ALTER TABLE public.merchant_notifications
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS acknowledged_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acknowledged_device_id UUID NULL,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_notifications_new_order
  ON public.merchant_notifications (merchant_id, order_id)
  WHERE type = 'new_order' AND order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_merchant_notifications_unacked
  ON public.merchant_notifications (merchant_id, created_at DESC)
  WHERE acknowledged_at IS NULL AND type = 'new_order';

-- Close direct client UPDATE (mark-read / acknowledge must go through Nest service role).
DROP POLICY IF EXISTS "Merchant members can update own merchant notifications"
  ON public.merchant_notifications;

REVOKE UPDATE ON public.merchant_notifications FROM authenticated;
REVOKE UPDATE ON public.merchant_notifications FROM anon;

-- ---------------------------------------------------------------------------
-- 4. Phase-1 alert settings only (NO WhatsApp columns)
-- ---------------------------------------------------------------------------
ALTER TABLE public.merchant_settings
  ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sound_repeat_interval_seconds INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS sound_max_duration_seconds INTEGER NOT NULL DEFAULT 300;

-- ---------------------------------------------------------------------------
-- 5. Extend new-order trigger: in-app notification + push outbox (idempotent)
-- In-app message may include order number; push payload is minimized in the worker.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_merchant_new_order()
RETURNS TRIGGER AS $$
DECLARE
  v_title TEXT;
  v_message TEXT;
  v_link TEXT;
  v_event_key TEXT;
BEGIN
  IF NEW.merchant_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_title := 'طلب جديد';
  v_message := 'وصل طلب جديد إلى متجرك';
  IF NEW.order_number IS NOT NULL THEN
    v_message := 'وصل طلب رقم ' || NEW.order_number || ' — افتح الطلب لبدء التجهيز';
  END IF;
  v_link := '/merchant/orders/' || NEW.id;
  v_event_key := 'merchant-new-order-push:' || NEW.id::text;

  INSERT INTO public.merchant_notifications (
    merchant_id, order_id, type, title, message, link
  )
  VALUES (
    NEW.merchant_id,
    NEW.id,
    'new_order',
    v_title,
    v_message,
    v_link
  )
  ON CONFLICT (merchant_id, order_id)
  WHERE type = 'new_order' AND order_id IS NOT NULL
  DO NOTHING;

  INSERT INTO public.notification_outbox (
    event_key, recipient_type, recipient_id, title, message, link
  )
  VALUES (
    v_event_key,
    'merchant',
    NEW.merchant_id,
    v_title,
    v_message,
    v_link
  )
  ON CONFLICT (event_key) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_merchant_new_order ON public.orders;
CREATE TRIGGER on_merchant_new_order
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_merchant_new_order();

-- ---------------------------------------------------------------------------
-- 6. Atomic notification acknowledgement RPC function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acknowledge_merchant_notification_atomic(
  p_notification_id UUID,
  p_expected_merchant_id UUID,
  p_actor_id UUID,
  p_device_id UUID,
  p_opened BOOLEAN
)
RETURNS public.merchant_notifications
AS $$
DECLARE
  v_result public.merchant_notifications;
BEGIN
  UPDATE public.merchant_notifications
  SET
    is_read = true,
    acknowledged_at = COALESCE(acknowledged_at, NOW()),
    acknowledged_by = COALESCE(acknowledged_by, p_actor_id),
    acknowledged_device_id = COALESCE(acknowledged_device_id, p_device_id),
    opened_at = CASE
      WHEN p_opened THEN COALESCE(opened_at, NOW())
      ELSE opened_at
    END
  WHERE id = p_notification_id
    AND merchant_id = p_expected_merchant_id
  RETURNING *
  INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOTIFICATION_NOT_FOUND_OR_SCOPE_MISMATCH';
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.acknowledge_merchant_notification_atomic(UUID, UUID, UUID, UUID, BOOLEAN) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_merchant_notification_atomic(UUID, UUID, UUID, UUID, BOOLEAN) TO service_role;

COMMENT ON TABLE public.merchant_push_subscriptions IS
  'Web Push endpoints for merchant devices. Mutations via backend service role only.';
COMMENT ON TABLE public.merchant_push_deliveries IS
  'Per-subscription push delivery ledger. Prevents duplicate pushes on partial retry.';

