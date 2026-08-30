-- STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Customer Handoff foundation, migration 4/5.
-- Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §8.7 (atomic redeem), §10.1 (identity),
--                 §16.2/§16.3 (single-use, replay), task H1/H3/H4, A3 + hardening B2/eligibility.
--
-- SECURITY DEFINER functions. Every one:
--   * SET search_path = pg_catalog, public   (no mutable path)
--   * REVOKE EXECUTE FROM PUBLIC/anon/authenticated
--   * GRANT EXECUTE TO service_role only
-- No SQL/JWT client can invoke these directly (they read auth.* and bypass RLS).

-- ── redeem_customer_handoff — atomic, single-use, DB-time expiry ──────────────
-- PostgreSQL is the SOLE authority for expiry (clock_timestamp()) and single-use.
-- Exactly one concurrent caller wins the guarded UPDATE (redeemed_at IS NULL); the
-- loser reads redeemed_at set and receives HANDOFF_ALREADY_REDEEMED. A state mismatch
-- or expiry does NOT consume the row (the UPDATE guard fails, redeemed_at stays NULL).
CREATE OR REPLACE FUNCTION public.redeem_customer_handoff(
  p_code_hash  TEXT,
  p_state_hash TEXT
)
RETURNS TABLE (
  outcome_status    TEXT,
  error_code        TEXT,
  handoff_id        UUID,
  linked_profile_id UUID,
  store_customer_id UUID,
  DilMart_user_id    UUID,
  target_path       TEXT,
  identity_outcome  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.DilMart_customer_handoffs%ROWTYPE;
  v_event TEXT;
BEGIN
  UPDATE public.DilMart_customer_handoffs h
     SET redeemed_at = clock_timestamp(),
         status = CASE WHEN h.identity_outcome = 'LINKED' THEN 'REDEEMED' ELSE h.status END,
         updated_at = now()
   WHERE h.code_hash = p_code_hash
     AND h.redeemed_at IS NULL
     AND h.status IN ('PENDING','LINK_REQUIRED','BLOCKED')
     AND h.expires_at > clock_timestamp()
     AND h.state_hash = p_state_hash
  RETURNING h.* INTO v_row;

  IF FOUND THEN
    -- Exactly ONE correctly-typed audit event per consumed outcome (task B5).
    v_event := CASE v_row.identity_outcome
                 WHEN 'LINKED'        THEN 'HANDOFF_REDEEMED'
                 WHEN 'LINK_REQUIRED' THEN 'HANDOFF_REDEEM_LINK_REQUIRED'
                 WHEN 'BLOCKED'       THEN 'HANDOFF_REDEEM_BLOCKED'
               END;
    INSERT INTO public.DilMart_customer_handoff_audit_events
      (handoff_id, linked_profile_id, event_type, status, source_surface, campaign, metadata)
    VALUES
      (v_row.id, v_row.linked_profile_id, v_event, v_row.identity_outcome,
       v_row.source_surface, v_row.campaign, '{}'::jsonb);

    RETURN QUERY SELECT
      CASE v_row.identity_outcome WHEN 'LINKED' THEN 'REDEEMED' ELSE v_row.identity_outcome END,
      NULL::TEXT,
      v_row.id, v_row.linked_profile_id, v_row.store_customer_id,
      v_row.DilMart_user_id, v_row.target_path, v_row.identity_outcome;
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.DilMart_customer_handoffs WHERE code_hash = p_code_hash;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'ERROR', 'HANDOFF_INVALID', NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT;
  ELSIF v_row.state_hash IS DISTINCT FROM p_state_hash AND v_row.redeemed_at IS NULL THEN
    RETURN QUERY SELECT 'ERROR', 'HANDOFF_STATE_MISMATCH', NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT;
  ELSIF v_row.redeemed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'ERROR', 'HANDOFF_ALREADY_REDEEMED', NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT;
  ELSIF v_row.expires_at <= clock_timestamp() THEN
    RETURN QUERY SELECT 'ERROR', 'HANDOFF_EXPIRED', NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT 'ERROR', 'HANDOFF_INVALID', NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_customer_handoff(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_customer_handoff(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.redeem_customer_handoff(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_customer_handoff(TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.redeem_customer_handoff(TEXT, TEXT) IS
  'Atomic single-use Customer Handoff consume (spec §8.7). DB-time (clock_timestamp) expiry authority. Exactly one concurrent winner. State mismatch/expiry never consume. Service-role only.';

-- ── find_confirmed_auth_users_by_phone — confirmed AND customer-compatible ────
-- Returns Store customer ids whose auth.users.phone is CONFIRMED, the account is active, AND the
-- profiles row is a customer-compatible identity (never admin/merchant/agent/courier/staff/disabled).
-- Never uses unverified profiles.phone. auth.users stores the phone as E.164 digits without '+'.
CREATE OR REPLACE FUNCTION public.find_confirmed_auth_users_by_phone(
  p_phone_digits TEXT
)
RETURNS TABLE (store_customer_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.id
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE u.phone = p_phone_digits
    AND u.phone_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until < now())
    AND p.role = 'customer'
    AND (p.account_type IS NULL OR p.account_type IN ('customer','provisional_customer','claimed_provisional'));
$$;

REVOKE ALL ON FUNCTION public.find_confirmed_auth_users_by_phone(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_confirmed_auth_users_by_phone(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.find_confirmed_auth_users_by_phone(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.find_confirmed_auth_users_by_phone(TEXT) TO service_role;

COMMENT ON FUNCTION public.find_confirmed_auth_users_by_phone(TEXT) IS
  'Identity lookup (spec §10.1 Step 2). Confirmed auth.users.phone + customer-compatible profile only. Input is E.164 digits without +. Service-role only.';

-- ── find_confirmed_auth_users_by_email — confirmed AND customer-compatible ────
CREATE OR REPLACE FUNCTION public.find_confirmed_auth_users_by_email(
  p_email_normalized TEXT
)
RETURNS TABLE (store_customer_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.id
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE lower(btrim(u.email)) = p_email_normalized
    AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until < now())
    AND p.role = 'customer'
    AND (p.account_type IS NULL OR p.account_type IN ('customer','provisional_customer','claimed_provisional'));
$$;

REVOKE ALL ON FUNCTION public.find_confirmed_auth_users_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_confirmed_auth_users_by_email(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.find_confirmed_auth_users_by_email(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.find_confirmed_auth_users_by_email(TEXT) TO service_role;

COMMENT ON FUNCTION public.find_confirmed_auth_users_by_email(TEXT) IS
  'Identity lookup (spec §10.1 Step 3). Confirmed auth.users.email + customer-compatible profile only, normalized lower(btrim()). Service-role only.';

-- ── resolve_DilMart_federated_customer — OWNERSHIP-VALIDATING recovery ─────────
-- Deterministic recovery for shadow provisioning (task B2). Returns the shadow customer id ONLY when
-- ALL ownership conditions hold; a matching email with missing/malformed/different metadata is a
-- COLLISION and returns NULL (the caller must NOT reuse it). Drops the old single-arg version.
DROP FUNCTION IF EXISTS public.resolve_DilMart_federated_customer(TEXT);

CREATE OR REPLACE FUNCTION public.resolve_DilMart_federated_customer(
  p_DilMart_user_id   UUID,
  p_internal_email   TEXT
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.id
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE lower(btrim(u.email)) = lower(btrim(p_internal_email))
    AND (u.raw_app_meta_data ->> 'account_type') = 'DilMart_federated_customer'
    AND (u.raw_app_meta_data ->> 'origin') = 'DilMart_federated'
    AND (u.raw_user_meta_data ->> 'DilMart_user_id') = p_DilMart_user_id::text
    AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until < now())
    AND p.role = 'customer'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_DilMart_federated_customer(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_DilMart_federated_customer(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_DilMart_federated_customer(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_DilMart_federated_customer(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.resolve_DilMart_federated_customer(UUID, TEXT) IS
  'Ownership-validating shadow-provisioning recovery (task B2/F4): resolves an existing shadow customer only when auth metadata (account_type/origin/DilMart_user_id), an eligible customer profile, and active status ALL match. A metadata mismatch returns NULL (collision — never reused). Service-role only.';
