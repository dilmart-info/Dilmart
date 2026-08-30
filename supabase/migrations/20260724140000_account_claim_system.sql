-- Migration: Account Claim, Phone Verification, and Password Recovery System (PR-1)
-- Timestamp: 20260724140000

-- 1. Customer Phone Identities Table
CREATE TABLE IF NOT EXISTS public.customer_phone_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_normalized TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ NULL,
  verification_source TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_customer_phone_identities_user_id UNIQUE (user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_phone_identities_verified_phone
  ON public.customer_phone_identities(phone_normalized)
  WHERE is_verified = true;

CREATE INDEX IF NOT EXISTS idx_customer_phone_identities_phone
  ON public.customer_phone_identities(phone_normalized);

-- Enable RLS
ALTER TABLE public.customer_phone_identities ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, read policy for owners
CREATE POLICY customer_phone_identities_select_own
  ON public.customer_phone_identities
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. Auth OTP Challenges Table
CREATE TABLE IF NOT EXISTS public.auth_otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose TEXT NOT NULL CHECK (purpose IN ('claim_account', 'password_reset', 'verify_phone')),
  subject_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  phone_normalized TEXT NOT NULL,
  otp_digest TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'verified', 'consumed', 'expired', 'blocked')),
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  send_count INTEGER NOT NULL DEFAULT 1,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ NULL,
  created_ip_hash TEXT NULL,
  user_agent_hash TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_otp_challenges_active
  ON public.auth_otp_challenges(phone_normalized, purpose, status);

ALTER TABLE public.auth_otp_challenges ENABLE ROW LEVEL SECURITY;
-- Direct client access blocked, managed by NestJS backend service role

-- 3. Auth Action Tokens Table
CREATE TABLE IF NOT EXISTS public.auth_action_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_normalized TEXT NOT NULL,
  challenge_id UUID NULL REFERENCES public.auth_otp_challenges(id) ON DELETE SET NULL,
  token_digest TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reserved', 'consumed', 'released', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  reservation_id UUID NULL,
  reserved_at TIMESTAMPTZ NULL,
  reserved_until TIMESTAMPTZ NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_action_tokens_digest
  ON public.auth_action_tokens(token_digest);

ALTER TABLE public.auth_action_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.auth_action_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES public.auth_action_tokens(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL,
  operation_type TEXT NOT NULL,
  source_user_id UUID NOT NULL,
  target_user_id UUID NULL,
  stage TEXT NOT NULL, -- 'reserved', 'auth_updated', 'account_merged', 'profile_updated', 'token_consumed', 'completed', 'failed_recoverable'
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL
);

ALTER TABLE public.auth_action_operations ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_action_operations_token
  ON public.auth_action_operations(token_id);


-- 4. Atomic Provisional Account Merge RPC
CREATE OR REPLACE FUNCTION public.merge_provisional_customer_account(
  p_source_user_id UUID,
  p_target_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_source_profile RECORD;
  v_target_profile RECORD;
  v_orders_migrated INT := 0;
  v_addresses_migrated INT := 0;
  v_loyalty_migrated INT := 0;
  v_notifications_migrated INT := 0;
BEGIN
  -- Prevent self merge
  IF p_source_user_id = p_target_user_id THEN
    RAISE EXCEPTION 'Source and target user IDs cannot be identical';
  END IF;

  -- Verify source is provisional user
  SELECT * INTO v_source_profile
  FROM public.profiles
  WHERE id = p_source_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source user profile not found';
  END IF;

  -- Verify target user
  SELECT * INTO v_target_profile
  FROM public.profiles
  WHERE id = p_target_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  -- 1. Migrate Orders
  UPDATE public.orders
  SET user_id = p_target_user_id,
      updated_at = NOW()
  WHERE user_id = p_source_user_id;

  GET DIAGNOSTICS v_orders_migrated = ROW_COUNT;

  -- 2. Migrate Addresses (skip duplicates based on governorate_id, area, phone)
  INSERT INTO public.customer_addresses (
    user_id, governorate_id, area, nearest_landmark, phone, is_default, created_at, updated_at
  )
  SELECT
    p_target_user_id, ca.governorate_id, ca.area, ca.nearest_landmark, ca.phone, false, ca.created_at, NOW()
  FROM public.customer_addresses ca
  WHERE ca.user_id = p_source_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.customer_addresses target_ca
      WHERE target_ca.user_id = p_target_user_id
        AND target_ca.governorate_id = ca.governorate_id
        AND LOWER(TRIM(target_ca.area)) = LOWER(TRIM(ca.area))
        AND target_ca.phone = ca.phone
    );

  GET DIAGNOSTICS v_addresses_migrated = ROW_COUNT;

  -- Clean up source addresses
  DELETE FROM public.customer_addresses WHERE user_id = p_source_user_id;

  -- 3. Migrate Loyalty Transactions & Recalculate Points
  UPDATE public.loyalty_transactions
  SET user_id = p_target_user_id
  WHERE user_id = p_source_user_id;

  GET DIAGNOSTICS v_loyalty_migrated = ROW_COUNT;

  -- Recalculate target points via canonical function if it exists
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_available_points') THEN
    UPDATE public.profiles
    SET points = public.get_available_points(p_target_user_id),
        updated_at = NOW()
    WHERE id = p_target_user_id;
  END IF;

  -- 4. Migrate User Notifications
  UPDATE public.user_notifications
  SET user_id = p_target_user_id
  WHERE user_id = p_source_user_id;

  GET DIAGNOSTICS v_notifications_migrated = ROW_COUNT;

  -- 5. Mark source provisional profile as claimed/merged
  UPDATE public.profiles
  SET account_type = 'claimed_provisional',
      updated_at = NOW()
  WHERE id = p_source_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'source_user_id', p_source_user_id,
    'target_user_id', p_target_user_id,
    'orders_migrated', v_orders_migrated,
    'addresses_migrated', v_addresses_migrated,
    'loyalty_migrated', v_loyalty_migrated,
    'notifications_migrated', v_notifications_migrated
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.merge_provisional_customer_account(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_provisional_customer_account(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.merge_provisional_customer_account(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.merge_provisional_customer_account(UUID, UUID) TO service_role;

-- 5. Action Token Reservation & Consumption RPCs
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
REVOKE ALL ON FUNCTION public.reserve_auth_action_token(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_auth_action_token(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_auth_action_token(TEXT, TEXT) TO service_role;

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
    AND status = 'reserved'
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
REVOKE ALL ON FUNCTION public.release_auth_action_token_reservation(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.release_auth_action_token_reservation(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_auth_action_token_reservation(UUID, UUID) TO service_role;

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
      consumed_at = NOW()
  WHERE id = p_token_id
    AND status = 'reserved'
    AND reservation_id = p_reservation_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'INVALID_RESERVATION: Token is not reserved by this reservation ID or already consumed';
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.consume_auth_action_token(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_auth_action_token(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.consume_auth_action_token(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_auth_action_token(UUID, UUID) TO service_role;
