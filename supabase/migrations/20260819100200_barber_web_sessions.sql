-- STORE-BARBER-HANDOFF — Barber/Owner web session storage, migration 3/3.
--
-- A single opaque, hash-only, revocable bearer session (NOT the Customer federated system's
-- asymmetric-JWT + rotating-refresh-token-family). Appropriate for a lower-frequency B2B "check
-- the store" session: absolute TTL (default 12h, a work-shift window), instantly revocable by
-- flipping status, no client-held claims to trust — every request re-checks this table.

CREATE TABLE IF NOT EXISTS public.DilMart_barber_web_sessions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The raw 256-bit CSPRNG session token is NEVER stored — only its hash.
  session_token_hash TEXT        NOT NULL UNIQUE,

  linked_profile_id  UUID        NOT NULL REFERENCES public.store_linked_profiles(id) ON DELETE CASCADE,
  DilMart_user_id     UUID        NOT NULL,
  DilMart_barbershop_id UUID      NOT NULL,
  role               TEXT        NOT NULL,

  status             TEXT        NOT NULL DEFAULT 'ACTIVE',

  expires_at         TIMESTAMPTZ NOT NULL,
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at         TIMESTAMPTZ NULL,

  CONSTRAINT DilMart_barber_web_sessions_status_check CHECK (status IN ('ACTIVE', 'REVOKED')),
  CONSTRAINT DilMart_barber_web_sessions_role_check CHECK (role IN ('OWNER', 'BARBER'))
);

CREATE INDEX IF NOT EXISTS idx_DilMart_barber_web_sessions_expires_at
  ON public.DilMart_barber_web_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_DilMart_barber_web_sessions_DilMart_user_id
  ON public.DilMart_barber_web_sessions(DilMart_user_id);
CREATE INDEX IF NOT EXISTS idx_DilMart_barber_web_sessions_linked_profile_id
  ON public.DilMart_barber_web_sessions(linked_profile_id);

ALTER TABLE public.DilMart_barber_web_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.DilMart_barber_web_sessions FORCE ROW LEVEL SECURITY;
-- No anon/authenticated policies: service_role only.

COMMENT ON TABLE public.DilMart_barber_web_sessions IS
  'Opaque, hash-only, revocable Barber/Owner web sessions established via a Barber Handoff redeem. Service-role only.';
COMMENT ON COLUMN public.DilMart_barber_web_sessions.session_token_hash IS 'SHA-256 of the raw 256-bit CSPRNG session token carried in the __Host- cookie. Raw token is never stored.';

-- ── verify_barber_web_session — read-checked-then-touch, single statement ─────
-- A plain SELECT would race a concurrent revoke between read and the last_seen_at UPDATE below;
-- this does both atomically and returns nothing for an inactive/expired/unknown token.
CREATE OR REPLACE FUNCTION public.verify_barber_web_session(
  p_session_token_hash TEXT
)
RETURNS TABLE (
  linked_profile_id    UUID,
  DilMart_user_id       UUID,
  DilMart_barbershop_id UUID,
  role                 TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.DilMart_barber_web_sessions s
     SET last_seen_at = clock_timestamp()
   WHERE s.session_token_hash = p_session_token_hash
     AND s.status = 'ACTIVE'
     AND s.expires_at > clock_timestamp()
  RETURNING s.linked_profile_id, s.DilMart_user_id, s.DilMart_barbershop_id, s.role;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_barber_web_session(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_barber_web_session(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.verify_barber_web_session(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_barber_web_session(TEXT) TO service_role;

COMMENT ON FUNCTION public.verify_barber_web_session(TEXT) IS
  'Atomic verify + touch (last_seen_at) for a Barber web session. Returns zero rows for unknown/expired/revoked. Service-role only.';

-- ── redeem_barber_handoff_and_create_session — ONE transaction (review P1) ────
-- Consume the one-time code, enforce the OWNER/BARBER profile invariant, revoke every prior
-- ACTIVE session for the user (single-active-session), and insert the new session — atomically.
-- If ANY step after the consume fails, the whole transaction rolls back and the code remains
-- unconsumed, so a transient DB failure can never strand a valid login. State mismatch/expiry
-- never consume (the guarded UPDATE simply doesn't match). Exactly one concurrent caller wins.
CREATE OR REPLACE FUNCTION public.redeem_barber_handoff_and_create_session(
  p_code_hash           TEXT,
  p_state_hash          TEXT,
  p_session_token_hash  TEXT,
  p_session_ttl_seconds INTEGER
)
RETURNS TABLE (
  outcome_status       TEXT,
  error_code           TEXT,
  handoff_id           UUID,
  linked_profile_id    UUID,
  DilMart_user_id       UUID,
  DilMart_barbershop_id UUID,
  role                 TEXT,
  display_name         TEXT,
  target_path          TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row     public.DilMart_barber_handoffs%ROWTYPE;
  v_profile public.store_linked_profiles%ROWTYPE;
BEGIN
  IF p_session_ttl_seconds IS NULL OR p_session_ttl_seconds < 300 OR p_session_ttl_seconds > 86400 THEN
    RAISE EXCEPTION 'barber web session ttl out of bounds' USING ERRCODE = 'check_violation';
  END IF;
  IF p_session_token_hash IS NULL OR length(p_session_token_hash) <> 64 THEN
    RAISE EXCEPTION 'barber web session token hash must be sha256 hex' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.DilMart_barber_handoffs h
     SET redeemed_at = clock_timestamp(),
         status = 'REDEEMED',
         updated_at = now()
   WHERE h.code_hash = p_code_hash
     AND h.redeemed_at IS NULL
     AND h.status = 'PENDING'
     AND h.expires_at > clock_timestamp()
     AND h.state_hash = p_state_hash
  RETURNING h.* INTO v_row;

  IF FOUND THEN
    SELECT * INTO v_profile FROM public.store_linked_profiles
     WHERE id = v_row.linked_profile_id FOR UPDATE;
    -- Fail closed WITHOUT consuming: raising rolls back the consume above, so a corrupted /
    -- concurrently-mutated profile row never burns a valid code. A NULL DilMart_barbershop_id
    -- (legacy/partial row) is included here explicitly — without it the NOT NULL session insert
    -- below would raise an unclassified 23502 instead of this deliberate check_violation.
    IF NOT FOUND
       OR upper(coalesce(v_profile.DilMart_role, '')) NOT IN ('OWNER', 'BARBER')
       OR v_profile.DilMart_barbershop_id IS NULL THEN
      RAISE EXCEPTION 'barber handoff linked profile is not a complete Barber/Owner identity'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Single-active-session: every prior ACTIVE session for this user dies with this redeem.
    -- Aliased + qualified: `DilMart_user_id` is also a RETURNS TABLE output name; unqualified it
    -- is ambiguous (42702) under plpgsql.variable_conflict = error.
    UPDATE public.DilMart_barber_web_sessions s
       SET status = 'REVOKED', revoked_at = clock_timestamp()
     WHERE s.DilMart_user_id = v_profile.DilMart_user_id
       AND s.status = 'ACTIVE';

    INSERT INTO public.DilMart_barber_web_sessions
      (session_token_hash, linked_profile_id, DilMart_user_id, DilMart_barbershop_id, role, expires_at)
    VALUES
      (p_session_token_hash, v_profile.id, v_profile.DilMart_user_id, v_profile.DilMart_barbershop_id,
       upper(v_profile.DilMart_role), clock_timestamp() + make_interval(secs => p_session_ttl_seconds));

    INSERT INTO public.DilMart_barber_handoff_audit_events
      (handoff_id, linked_profile_id, event_type, status, source_surface, metadata)
    VALUES
      (v_row.id, v_row.linked_profile_id, 'HANDOFF_REDEEMED', 'REDEEMED', v_row.source_surface, '{}'::jsonb);

    RETURN QUERY SELECT
      'REDEEMED', NULL::TEXT, v_row.id, v_profile.id, v_profile.DilMart_user_id,
      v_profile.DilMart_barbershop_id, upper(v_profile.DilMart_role), v_profile.display_name,
      v_row.target_path;
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.DilMart_barber_handoffs WHERE code_hash = p_code_hash;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'ERROR', 'HANDOFF_INVALID', NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
  ELSIF v_row.state_hash IS DISTINCT FROM p_state_hash AND v_row.redeemed_at IS NULL THEN
    RETURN QUERY SELECT 'ERROR', 'HANDOFF_STATE_MISMATCH', NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
  ELSIF v_row.redeemed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'ERROR', 'HANDOFF_ALREADY_REDEEMED', NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
  ELSIF v_row.expires_at <= clock_timestamp() THEN
    RETURN QUERY SELECT 'ERROR', 'HANDOFF_EXPIRED', NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT 'ERROR', 'HANDOFF_INVALID', NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_barber_handoff_and_create_session(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_barber_handoff_and_create_session(TEXT, TEXT, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.redeem_barber_handoff_and_create_session(TEXT, TEXT, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_barber_handoff_and_create_session(TEXT, TEXT, TEXT, INTEGER) TO service_role;

COMMENT ON FUNCTION public.redeem_barber_handoff_and_create_session(TEXT, TEXT, TEXT, INTEGER) IS
  'Atomic Barber Handoff redeem + prior-session revocation + new-session insert in ONE transaction. A failure after consume rolls the consume back (no stranded logins). State mismatch/expiry never consume. Service-role only.';

-- ── revoke_barber_web_sessions_for_user — logout / identity-switch safety ─────
CREATE OR REPLACE FUNCTION public.revoke_barber_web_sessions_for_user(
  p_DilMart_user_id UUID
)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH updated AS (
    UPDATE public.DilMart_barber_web_sessions
       SET status = 'REVOKED', revoked_at = clock_timestamp()
     WHERE DilMart_user_id = p_DilMart_user_id
       AND status = 'ACTIVE'
    RETURNING id
  )
  SELECT count(*)::INTEGER FROM updated;
$$;

REVOKE ALL ON FUNCTION public.revoke_barber_web_sessions_for_user(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_barber_web_sessions_for_user(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.revoke_barber_web_sessions_for_user(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_barber_web_sessions_for_user(UUID) TO service_role;

COMMENT ON FUNCTION public.revoke_barber_web_sessions_for_user(UUID) IS
  'Revokes every ACTIVE Barber web session for a DilMart user (Main-side logout webhook, or a new handoff superseding old sessions). Service-role only.';
