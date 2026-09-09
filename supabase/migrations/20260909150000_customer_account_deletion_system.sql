-- Migration: Customer Account Deletion & Data Anonymization Engine
-- Timestamp: 20260909150000
-- Purpose:
-- 1. Safely decouple historical orders, cancellations, and return requests from auth users (ON DELETE SET NULL)
-- 2. Preserve financial, accounting, invoice, and dispute records in anonymized form
-- 3. Provide transactional RPC in app_private for atomic customer data anonymization and detachment
-- 4. Create account_deletion_requests table for cross-boundary state machine and reconciliation
-- 5. Strict security: no public access, service_role execution only

-- 1. Update foreign key on public.orders(user_id) to ON DELETE SET NULL
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'orders'
      AND kcu.column_name = 'user_id'
  ) LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', r.constraint_name);
  END LOOP;

  ALTER TABLE public.orders
    ADD CONSTRAINT orders_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
END $$;

-- 2. Update foreign key on public.order_cancellation_requests(user_id) to ON DELETE SET NULL
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'order_cancellation_requests'
  ) THEN
    ALTER TABLE public.order_cancellation_requests ALTER COLUMN user_id DROP NOT NULL;

    FOR r IN (
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = 'order_cancellation_requests'
        AND kcu.column_name = 'user_id'
    ) LOOP
      EXECUTE format('ALTER TABLE public.order_cancellation_requests DROP CONSTRAINT %I', r.constraint_name);
    END LOOP;

    ALTER TABLE public.order_cancellation_requests
      ADD CONSTRAINT order_cancellation_requests_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Update foreign key on public.order_return_requests(customer_id) to ON DELETE SET NULL
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'order_return_requests'
  ) THEN
    ALTER TABLE public.order_return_requests ALTER COLUMN customer_id DROP NOT NULL;

    FOR r IN (
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = 'order_return_requests'
        AND kcu.column_name = 'customer_id'
    ) LOOP
      EXECUTE format('ALTER TABLE public.order_return_requests DROP CONSTRAINT %I', r.constraint_name);
    END LOOP;

    ALTER TABLE public.order_return_requests
      ADD CONSTRAINT order_return_requests_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Create public.account_deletion_requests for partial-failure tracking & reconciliation
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'completed', 'failed')),
  step TEXT NOT NULL DEFAULT 'requested' CHECK (step IN ('requested', 'db_anonymized', 'auth_revoked', 'auth_deleted')),
  error_code TEXT NULL,
  source TEXT NOT NULL DEFAULT 'app_customer' CHECK (source IN ('app_customer', 'web_request', 'reconciliation_worker')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_pending
  ON public.account_deletion_requests (user_id, status)
  WHERE status IN ('requested', 'processing', 'failed');

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_created_at
  ON public.account_deletion_requests (created_at DESC);

-- Lock down account_deletion_requests with RLS and revoke all public access
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.account_deletion_requests TO service_role;

-- 5. Ensure internal app_private schema exists
CREATE SCHEMA IF NOT EXISTS app_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO anon, authenticated, service_role;

-- 6. Transactional anonymization & detachment function in app_private
CREATE OR REPLACE FUNCTION app_private.anonymize_and_detach_customer(
  p_user_id pg_catalog.uuid,
  p_reason pg_catalog.text DEFAULT 'customer_account_deletion'
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orders_detached pg_catalog.int4 := 0;
  v_returns_detached pg_catalog.int4 := 0;
  v_cancellations_detached pg_catalog.int4 := 0;
  v_addresses_deleted pg_catalog.int4 := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: user_id is required';
  END IF;

  -- Active orders check (fulfillment in progress)
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE user_id = p_user_id
      AND (
        status IN ('new', 'contacted', 'preparing', 'shipped')
        OR delivery_status IN ('assigned_to_company', 'assigned_to_agent', 'picked_up', 'in_transit')
      )
  ) THEN
    RAISE EXCEPTION 'ACTIVE_ORDERS_IN_FULFILLMENT: Cannot delete account with orders currently in preparation or delivery';
  END IF;

  -- Active returns check (dispute or manual refund pending)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'order_return_requests'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.order_return_requests
      WHERE customer_id = p_user_id
        AND (
          status NOT IN ('rejected', 'completed', 'cancelled')
          OR refund_status = 'pending_manual'
        )
    ) THEN
      RAISE EXCEPTION 'ACTIVE_RETURNS_EXIST: Cannot delete account with active return or refund requests';
    END IF;
  END IF;

  -- Active cancellations check
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'order_cancellation_requests'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.order_cancellation_requests
      WHERE user_id = p_user_id
        AND status = 'pending'
    ) THEN
      RAISE EXCEPTION 'ACTIVE_CANCELLATIONS_EXIST: Cannot delete account with pending cancellation requests';
    END IF;
  END IF;

  -- Anonymize and detach historical orders
  -- Retain accounting figures, merchandise totals, items, merchant snapshots, commissions, fees
  UPDATE public.orders
  SET user_id = NULL,
      customer_name = 'عميل سابق (حساب محذوف)',
      customer_phone = '0000000000',
      nearest_landmark = NULL,
      map_url = NULL,
      notes = NULL
  WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_orders_detached = ROW_COUNT;

  -- Anonymize and detach customer cancellations
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'order_cancellation_requests'
  ) THEN
    UPDATE public.order_cancellation_requests
    SET user_id = NULL,
        notes = NULL
    WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_cancellations_detached = ROW_COUNT;
  END IF;

  -- Anonymize and detach customer returns
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'order_return_requests'
  ) THEN
    UPDATE public.order_return_requests
    SET customer_id = NULL,
        reason_details = NULL,
        evidence_urls = NULL
    WHERE customer_id = p_user_id;
    GET DIAGNOSTICS v_returns_detached = ROW_COUNT;
  END IF;

  -- Delete customer addresses
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'customer_addresses'
  ) THEN
    DELETE FROM public.customer_addresses WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_addresses_deleted = ROW_COUNT;
  END IF;

  -- Delete customer phone identities
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'customer_phone_identities'
  ) THEN
    DELETE FROM public.customer_phone_identities WHERE user_id = p_user_id;
  END IF;

  -- Delete customer profiles (secondary storage)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'customer_profiles'
  ) THEN
    DELETE FROM public.customer_profiles WHERE user_id = p_user_id;
  END IF;

  -- Delete carts and items
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'carts'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'cart_items'
    ) THEN
      DELETE FROM public.cart_items WHERE cart_id IN (SELECT id FROM public.carts WHERE user_id = p_user_id);
    END IF;
    DELETE FROM public.carts WHERE user_id = p_user_id;
  END IF;

  -- Delete notifications
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'notification_outbox'
  ) THEN
    DELETE FROM public.notification_outbox WHERE recipient_type = 'customer' AND recipient_id = p_user_id;
  END IF;

  -- Delete user notifications
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_notifications'
  ) THEN
    DELETE FROM public.user_notifications WHERE user_id = p_user_id;
  END IF;

  -- Delete loyalty points ledger
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'loyalty_ledger'
  ) THEN
    DELETE FROM public.loyalty_ledger WHERE user_id = p_user_id;
  END IF;

  -- Delete checkout idempotency records
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'checkout_idempotency_records'
  ) THEN
    DELETE FROM public.checkout_idempotency_records WHERE user_id = p_user_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'orders_detached', v_orders_detached,
    'returns_detached', v_returns_detached,
    'cancellations_detached', v_cancellations_detached,
    'addresses_deleted', v_addresses_deleted
  );
END;
$$;

-- Restrict function execution: backend service role ONLY
REVOKE ALL ON FUNCTION app_private.anonymize_and_detach_customer(pg_catalog.uuid, pg_catalog.text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.anonymize_and_detach_customer(pg_catalog.uuid, pg_catalog.text) TO service_role;

-- 7. Atomic batch claiming function for reconciliation worker (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION app_private.claim_account_deletion_batch(
  p_batch_size pg_catalog.int4 DEFAULT 10,
  p_worker_id pg_catalog.text DEFAULT 'reconciliation_worker'
)
RETURNS TABLE (
  id pg_catalog.uuid,
  user_id pg_catalog.uuid,
  status pg_catalog.text,
  step pg_catalog.text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT r.id
    FROM public.account_deletion_requests r
    WHERE r.user_id IS NOT NULL
      AND (
        r.status IN ('requested', 'failed')
        OR (r.status = 'processing' AND r.updated_at < (pg_catalog.now() - pg_catalog.interval '15 minutes'))
      )
    ORDER BY r.created_at ASC
    LIMIT pg_catalog.greatest(1, pg_catalog.least(p_batch_size, 50))
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.account_deletion_requests r
    SET
      status = 'processing',
      updated_at = pg_catalog.now()
    FROM claimable c
    WHERE r.id = c.id
    RETURNING r.id, r.user_id, r.status, r.step
  )
  SELECT u.id, u.user_id, u.status, u.step
  FROM updated u;
END;
$$;

-- Restrict function execution: backend service role ONLY
REVOKE ALL ON FUNCTION app_private.claim_account_deletion_batch(pg_catalog.int4, pg_catalog.text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.claim_account_deletion_batch(pg_catalog.int4, pg_catalog.text) TO service_role;
