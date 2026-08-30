-- STORE-BARBER-HANDOFF — Barber/Owner web SSO handoff foundation, migration 2/2.
--
-- SECURITY DEFINER functions. Both:
--   * SET search_path = pg_catalog, public   (no mutable path)
--   * REVOKE EXECUTE FROM PUBLIC/anon/authenticated
--   * GRANT EXECUTE TO service_role only
-- No SQL/JWT client can invoke these directly.

-- ── finalize_barber_handoff — upsert store_linked_profiles + insert PENDING handoff (prepare time) ──
-- Runs at PREPARE time (mirrors finalize_customer_handoff's design: resolve identity once, up front,
-- so redeem is a pure "consume the code" operation). Unlike Customer, there is no ambiguity to
-- resolve here — the caller already holds a signature-verified Main assertion for this exact
-- DilMart_user_id, so this always upserts by DilMart_user_id (same columns the existing native
-- X-Store-Session exchange already sets — see store-integration.service.ts). store_customer_id,
-- link_status, link_method, identity_assurance, email, phone_verified_at, email_verified_at,
-- linked_at, last_handoff_at, conflict_reason are ALL Customer-handoff-owned columns and are never
-- touched here, on insert or on conflict — a Barber-issued handoff can never create, block, or
-- silently turn a linked profile into a Customer identity.
CREATE OR REPLACE FUNCTION public.finalize_barber_handoff(
  p_DilMart_user_id    UUID,
  p_DilMart_role       TEXT,
  p_barbershop_id     UUID,
  p_segment           TEXT,
  p_display_name      TEXT,
  p_phone             TEXT,
  p_city              TEXT,
  p_business_type     TEXT,
  p_code_hash         TEXT,
  p_state_hash        TEXT,
  p_assertion_jti     TEXT,
  p_target_path       TEXT,
  p_source_surface    TEXT,
  p_code_ttl_seconds  INTEGER,
  p_request_id        UUID
)
RETURNS TABLE (
  status            TEXT,
  error_code        TEXT,
  handoff_id        UUID,
  expires_at        TIMESTAMPTZ,
  linked_profile_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_linked_profile_id UUID;
  v_handoff_id        UUID;
  v_expires_at        TIMESTAMPTZ;
  v_existing          public.store_linked_profiles%ROWTYPE;
BEGIN
  IF p_code_ttl_seconds IS DISTINCT FROM 120 THEN
    RAISE EXCEPTION 'handoff code ttl must be exactly 120 seconds' USING ERRCODE = 'check_violation';
  END IF;
  IF upper(coalesce(p_DilMart_role, '')) NOT IN ('OWNER', 'BARBER') THEN
    RAISE EXCEPTION 'finalize_barber_handoff requires role OWNER or BARBER' USING ERRCODE = 'check_violation';
  END IF;

  -- Review (Major): use the SAME advisory-lock key as finalize_customer_handoff so Customer and
  -- Barber finalizations for one DilMart user can never interleave — a customer link created
  -- between our not-found check and our upsert would otherwise be silently overwritten. The key
  -- string is deliberately 'customer_handoff_finalize' (the already-deployed Customer key): it is
  -- the shared per-user IDENTITY lock, not a customer-only lock.
  PERFORM pg_advisory_xact_lock(hashtext('customer_handoff_finalize'), hashtext(p_DilMart_user_id::text));

  -- Fail closed on a Customer-owned identity row (review P1): a linked profile that carries a
  -- Store customer identity (store_customer_id / CUSTOMER role / any customer link_status) must
  -- NEVER be overwritten into a Barber identity — that would break customer session refreshes
  -- and future customer handoffs. Mirrors the Customer finalize's symmetric refusal to mutate a
  -- Barber-owned row. Locked FOR UPDATE so the check holds through the upsert below.
  SELECT * INTO v_existing FROM public.store_linked_profiles
   WHERE DilMart_user_id = p_DilMart_user_id FOR UPDATE;
  IF FOUND AND (
       v_existing.store_customer_id IS NOT NULL
    OR upper(coalesce(v_existing.DilMart_role, '')) = 'CUSTOMER'
    OR v_existing.link_status IS NOT NULL
  ) THEN
    RETURN QUERY SELECT 'ERROR', 'IDENTITY_BLOCKED', NULL::UUID, NULL::TIMESTAMPTZ, NULL::UUID;
    RETURN;
  END IF;

  INSERT INTO public.store_linked_profiles AS lp
    (DilMart_user_id, DilMart_role, DilMart_barbershop_id, segment, display_name, phone, city,
     business_type, source_app, last_synced_at, created_at, updated_at)
  VALUES
    (p_DilMart_user_id, upper(p_DilMart_role), p_barbershop_id, p_segment, p_display_name, p_phone,
     p_city, p_business_type, 'barber_app', now(), now(), now())
  ON CONFLICT (DilMart_user_id) DO UPDATE
    SET DilMart_role           = EXCLUDED.DilMart_role,
        DilMart_barbershop_id  = EXCLUDED.DilMart_barbershop_id,
        segment               = EXCLUDED.segment,
        display_name          = EXCLUDED.display_name,
        phone                 = EXCLUDED.phone,
        city                  = EXCLUDED.city,
        business_type         = EXCLUDED.business_type,
        source_app            = 'barber_app',
        last_synced_at        = now(),
        updated_at            = now()
    -- Defense in depth on the write path itself (belt to the locked check above): the update
    -- only ever applies to a row that is NOT customer-owned. If this predicate fails, RETURNING
    -- yields no row and we fail closed below instead of mutating a customer identity.
    WHERE lp.store_customer_id IS NULL
      AND upper(coalesce(lp.DilMart_role, '')) <> 'CUSTOMER'
      AND lp.link_status IS NULL
  RETURNING lp.id INTO v_linked_profile_id;

  IF v_linked_profile_id IS NULL THEN
    RETURN QUERY SELECT 'ERROR', 'IDENTITY_BLOCKED', NULL::UUID, NULL::TIMESTAMPTZ, NULL::UUID;
    RETURN;
  END IF;

  INSERT INTO public.DilMart_barber_handoffs AS h
    (code_hash, state_hash, assertion_jti, DilMart_user_id, linked_profile_id,
     target_path, source_surface, status, expires_at)
  VALUES
    (p_code_hash, p_state_hash, p_assertion_jti, p_DilMart_user_id, v_linked_profile_id,
     p_target_path, p_source_surface, 'PENDING',
     clock_timestamp() + make_interval(secs => p_code_ttl_seconds))
  -- Qualified via the alias: `expires_at` is also a RETURNS TABLE output name; an unqualified
  -- reference would be ambiguous (42702) under plpgsql.variable_conflict = error.
  RETURNING h.id, h.expires_at INTO v_handoff_id, v_expires_at;

  INSERT INTO public.DilMart_barber_handoff_audit_events
    (request_id, handoff_id, linked_profile_id, event_type, status, source_surface, metadata)
  VALUES
    (p_request_id, v_handoff_id, v_linked_profile_id, 'HANDOFF_PREPARED', 'PENDING', p_source_surface, '{}'::jsonb);

  RETURN QUERY SELECT 'OK', NULL::TEXT, v_handoff_id, v_expires_at, v_linked_profile_id;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_barber_handoff(UUID,TEXT,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_barber_handoff(UUID,TEXT,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,UUID) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_barber_handoff(UUID,TEXT,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_barber_handoff(UUID,TEXT,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,UUID) TO service_role;

COMMENT ON FUNCTION public.finalize_barber_handoff IS
  'Atomic Barber Handoff prepare: upserts store_linked_profiles by DilMart_user_id (same columns the native X-Store-Session exchange sets, never touching Customer-owned columns), inserts the PENDING handoff row, exact 120s DB-clock expiry. Service-role only.';

-- NOTE (review P1): redemption + session creation is a SINGLE atomic operation —
-- redeem_barber_handoff_and_create_session, defined in 20260819100200_barber_web_sessions.sql
-- (it needs the session table, created there). There is deliberately NO standalone redeem
-- function: consuming a code without atomically producing its session would let a transient
-- failure strand a valid login (code burned, no cookie, retry → HANDOFF_INVALID).
