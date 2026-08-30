-- STORE-PR4 (DilMart-CUSTOMER-STORE-STORE-PR4) — Federated Store Session core, migration 2/2.
-- Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §8.7–§8.10, §9, §16, §21.
--
-- Atomic session issuance, refresh rotation (with reuse detection + a DB-window rate limit), and
-- revocation. All SECURITY DEFINER, search_path pinned, REVOKEd from PUBLIC/anon/authenticated,
-- GRANTed to service_role only. PostgreSQL time is the sole authority for every expiry decision.

-- ── redeem_and_create_federated_session ───────────────────────────────────────────────────────
-- ONE transaction: lock + revalidate the Handoff, mark it redeemed, create the session family +
-- initial refresh-token hash, and write the HANDOFF_REDEEMED + FEDERATED_SESSION_CREATED audits. A
-- non-LINKED handoff is NOT consumed here (the caller uses the existing safe redeem_customer_handoff
-- for LINK_REQUIRED/BLOCKED). Any failure rolls the whole transaction back → handoff stays unredeemed.
CREATE OR REPLACE FUNCTION public.redeem_and_create_federated_session(
  p_code_hash            TEXT,
  p_state_hash           TEXT,
  p_family_id            UUID,
  p_refresh_token_id     UUID,
  p_refresh_token_hash   TEXT,
  p_access_jti           UUID,
  p_device_hash          TEXT,
  p_refresh_ttl_seconds  INTEGER,
  p_absolute_ttl_seconds INTEGER,
  p_request_id           UUID
)
RETURNS TABLE (
  status            TEXT,
  error_code        TEXT,
  store_customer_id UUID,
  linked_profile_id UUID,
  DilMart_user_id    UUID,
  target_path       TEXT,
  display_name      TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_h    public.DilMart_customer_handoffs%ROWTYPE;
  v_link public.store_linked_profiles%ROWTYPE;
  v_prole TEXT;
  v_abs  TIMESTAMPTZ;
BEGIN
  IF p_refresh_ttl_seconds IS DISTINCT FROM 2592000 OR p_absolute_ttl_seconds IS DISTINCT FROM 7776000 THEN
    RAISE EXCEPTION 'invalid federated session ttls' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_h FROM public.DilMart_customer_handoffs WHERE code_hash = p_code_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'ERROR','HANDOFF_INVALID',NULL::UUID,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT; RETURN;
  END IF;
  IF v_h.state_hash IS DISTINCT FROM p_state_hash AND v_h.redeemed_at IS NULL THEN
    RETURN QUERY SELECT 'ERROR','HANDOFF_STATE_MISMATCH',NULL::UUID,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT; RETURN;
  END IF;
  IF v_h.redeemed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'ERROR','HANDOFF_ALREADY_REDEEMED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT; RETURN;
  END IF;
  IF v_h.expires_at <= clock_timestamp() THEN
    RETURN QUERY SELECT 'ERROR','HANDOFF_EXPIRED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT; RETURN;
  END IF;
  IF v_h.identity_outcome <> 'LINKED' OR v_h.linked_profile_id IS NULL OR v_h.store_customer_id IS NULL THEN
    RETURN QUERY SELECT 'ERROR','HANDOFF_INVALID',NULL::UUID,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT; RETURN;
  END IF;

  -- Recheck the link + customer are still LINKED and Customer-compatible under lock.
  SELECT * INTO v_link FROM public.store_linked_profiles WHERE id = v_h.linked_profile_id FOR UPDATE;
  IF NOT FOUND
     OR upper(coalesce(v_link.DilMart_role,'')) <> 'CUSTOMER'
     OR upper(coalesce(v_link.link_status,'')) <> 'LINKED'
     OR v_link.store_customer_id IS DISTINCT FROM v_h.store_customer_id THEN
    RETURN QUERY SELECT 'ERROR','IDENTITY_BLOCKED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT; RETURN;
  END IF;
  SELECT role INTO v_prole FROM public.profiles WHERE id = v_h.store_customer_id;
  IF v_prole IS DISTINCT FROM 'customer' THEN
    RETURN QUERY SELECT 'ERROR','IDENTITY_BLOCKED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT; RETURN;
  END IF;

  -- Consume the handoff.
  UPDATE public.DilMart_customer_handoffs
     SET redeemed_at = clock_timestamp(), status = 'REDEEMED', updated_at = now()
   WHERE id = v_h.id;

  v_abs := clock_timestamp() + make_interval(secs => p_absolute_ttl_seconds);

  INSERT INTO public.store_federated_session_families
    (id, store_customer_id, linked_profile_id, DilMart_user_id, device_id_hash, session_version, status,
     last_used_at, absolute_expires_at, refresh_window_started_at, refresh_count, created_at, updated_at)
  VALUES
    (p_family_id, v_h.store_customer_id, v_h.linked_profile_id, v_h.DilMart_user_id, p_device_hash, 1, 'ACTIVE',
     clock_timestamp(), v_abs, clock_timestamp(), 0, clock_timestamp(), clock_timestamp());

  INSERT INTO public.store_federated_refresh_tokens
    (id, session_family_id, token_hash, parent_token_id, expires_at, created_at)
  VALUES
    (p_refresh_token_id, p_family_id, p_refresh_token_hash, NULL,
     LEAST(clock_timestamp() + make_interval(secs => p_refresh_ttl_seconds), v_abs), clock_timestamp());

  -- last_handoff link touch.
  UPDATE public.store_linked_profiles SET last_handoff_at = clock_timestamp(), updated_at = now() WHERE id = v_link.id;

  -- Handoff-side audit (immutable handoff audit table).
  INSERT INTO public.DilMart_customer_handoff_audit_events
    (request_id, handoff_id, linked_profile_id, event_type, status, source_surface, campaign, metadata)
  VALUES
    (p_request_id, v_h.id, v_h.linked_profile_id, 'HANDOFF_REDEEMED', 'REDEEMED', v_h.source_surface, v_h.campaign,
     jsonb_build_object('sessionFamilyId', p_family_id));

  -- Session-side audit (immutable session audit table).
  INSERT INTO public.store_federated_session_audit_events
    (request_id, session_family_id, refresh_token_id, handoff_id, linked_profile_id, store_customer_id, event_type, status, metadata)
  VALUES
    (p_request_id, p_family_id, p_refresh_token_id, v_h.id, v_h.linked_profile_id, v_h.store_customer_id,
     'FEDERATED_SESSION_CREATED', 'ACTIVE', jsonb_build_object('accessJti', p_access_jti));

  RETURN QUERY SELECT 'OK', NULL::TEXT, v_h.store_customer_id, v_h.linked_profile_id, v_h.DilMart_user_id,
                      v_h.target_path, v_link.display_name;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_and_create_federated_session(TEXT,TEXT,UUID,UUID,TEXT,UUID,TEXT,INTEGER,INTEGER,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_and_create_federated_session(TEXT,TEXT,UUID,UUID,TEXT,UUID,TEXT,INTEGER,INTEGER,UUID) TO service_role;
COMMENT ON FUNCTION public.redeem_and_create_federated_session IS
  'STORE-PR4 atomic redeem + federated session creation (spec §8.7/§9). DB-time expiry; consume + family + first refresh hash + both audits commit together, or roll back (handoff stays unredeemed). Service-role only.';

-- ── rotate_federated_refresh_token ─────────────────────────────────────────────────────────────
-- Reuse detection takes precedence over rate limiting. Reuse of a used token COMPROMISES the family
-- (committed, not rolled back). A DB fixed-window rate limit is enforced under the family lock. Exactly
-- one concurrent use of the same current token succeeds.
CREATE OR REPLACE FUNCTION public.rotate_federated_refresh_token(
  p_current_token_hash   TEXT,
  p_new_token_id         UUID,
  p_new_token_hash       TEXT,
  p_device_hash          TEXT,
  p_refresh_ttl_seconds  INTEGER,
  p_inactive_ttl_seconds INTEGER,
  p_rate_limit           INTEGER,
  p_rate_window_seconds  INTEGER,
  p_request_id           UUID
)
RETURNS TABLE (
  status            TEXT,
  error_code        TEXT,
  family_id         UUID,
  store_customer_id UUID,
  linked_profile_id UUID,
  DilMart_user_id    UUID,
  session_version   INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tok public.store_federated_refresh_tokens%ROWTYPE;
  v_fam public.store_federated_session_families%ROWTYPE;
  v_link public.store_linked_profiles%ROWTYPE;
  v_prole TEXT;
  v_new_exp TIMESTAMPTZ;
BEGIN
  IF p_refresh_ttl_seconds IS DISTINCT FROM 2592000 THEN
    RAISE EXCEPTION 'invalid refresh ttl' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_tok FROM public.store_federated_refresh_tokens WHERE token_hash = p_current_token_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'ERROR','FEDERATED_SESSION_EXPIRED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER; RETURN;
  END IF;

  SELECT * INTO v_fam FROM public.store_federated_session_families WHERE id = v_tok.session_family_id FOR UPDATE;

  -- REUSE DETECTION (precedes everything). A used token presented again compromises the family.
  IF v_tok.used_at IS NOT NULL THEN
    UPDATE public.store_federated_session_families
       SET status = 'COMPROMISED', revoked_at = clock_timestamp(), revoke_reason = 'REFRESH_REUSE',
           session_version = store_federated_session_families.session_version + 1, updated_at = now()
     WHERE id = v_fam.id;
    UPDATE public.store_federated_refresh_tokens
       SET revoked_at = clock_timestamp()
     WHERE session_family_id = v_fam.id AND revoked_at IS NULL;
    UPDATE public.store_federated_refresh_tokens SET reuse_detected_at = clock_timestamp() WHERE id = v_tok.id;
    INSERT INTO public.store_federated_session_audit_events
      (request_id, session_family_id, refresh_token_id, linked_profile_id, store_customer_id, event_type, status, error_code)
    VALUES (p_request_id, v_fam.id, v_tok.id, v_fam.linked_profile_id, v_fam.store_customer_id,
            'FEDERATED_REFRESH_REUSE_DETECTED', 'COMPROMISED', 'FEDERATED_REFRESH_REUSE_DETECTED');
    RETURN QUERY SELECT 'ERROR','FEDERATED_REFRESH_REUSE_DETECTED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER; RETURN;
  END IF;

  -- Token/family validity (fail closed; no enumeration oracle → all map to FEDERATED_SESSION_EXPIRED).
  IF v_tok.revoked_at IS NOT NULL
     OR v_tok.expires_at <= clock_timestamp()
     OR v_fam.status <> 'ACTIVE'
     OR v_fam.revoked_at IS NOT NULL
     OR v_fam.absolute_expires_at <= clock_timestamp()
     OR (v_fam.last_used_at + make_interval(secs => p_inactive_ttl_seconds)) <= clock_timestamp() THEN
    -- Atomically mark an absolutely/inactivity-expired ACTIVE family EXPIRED + revoke its tokens.
    IF v_fam.status = 'ACTIVE'
       AND (v_fam.absolute_expires_at <= clock_timestamp()
            OR (v_fam.last_used_at + make_interval(secs => p_inactive_ttl_seconds)) <= clock_timestamp()) THEN
      UPDATE public.store_federated_session_families SET status = 'EXPIRED', updated_at = now() WHERE id = v_fam.id;
      UPDATE public.store_federated_refresh_tokens SET revoked_at = clock_timestamp()
        WHERE session_family_id = v_fam.id AND revoked_at IS NULL;
      INSERT INTO public.store_federated_session_audit_events
        (request_id, session_family_id, refresh_token_id, linked_profile_id, store_customer_id, event_type, status, error_code)
      VALUES (p_request_id, v_fam.id, v_tok.id, v_fam.linked_profile_id, v_fam.store_customer_id,
              'FEDERATED_SESSION_EXPIRED', 'EXPIRED', 'FEDERATED_SESSION_EXPIRED');
    END IF;
    RETURN QUERY SELECT 'ERROR','FEDERATED_SESSION_EXPIRED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER; RETURN;
  END IF;

  -- Device binding: a bound family requires the same device hash at refresh.
  IF v_fam.device_id_hash IS NOT NULL AND v_fam.device_id_hash IS DISTINCT FROM p_device_hash THEN
    RETURN QUERY SELECT 'ERROR','FEDERATED_SESSION_EXPIRED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER; RETURN;
  END IF;

  -- Link/customer still LINKED + Customer-compatible.
  SELECT * INTO v_link FROM public.store_linked_profiles WHERE id = v_fam.linked_profile_id;
  IF NOT FOUND OR upper(coalesce(v_link.DilMart_role,'')) <> 'CUSTOMER' OR upper(coalesce(v_link.link_status,'')) <> 'LINKED' THEN
    RETURN QUERY SELECT 'ERROR','FEDERATED_SESSION_EXPIRED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER; RETURN;
  END IF;
  SELECT role INTO v_prole FROM public.profiles WHERE id = v_fam.store_customer_id;
  IF v_prole IS DISTINCT FROM 'customer' THEN
    RETURN QUERY SELECT 'ERROR','FEDERATED_SESSION_EXPIRED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER; RETURN;
  END IF;

  -- RATE LIMIT (DB fixed window, under the family lock). Reset the window if elapsed.
  IF (v_fam.refresh_window_started_at + make_interval(secs => p_rate_window_seconds)) <= clock_timestamp() THEN
    UPDATE public.store_federated_session_families
       SET refresh_window_started_at = clock_timestamp(), refresh_count = 0, updated_at = now()
     WHERE id = v_fam.id;
    v_fam.refresh_count := 0;
  END IF;
  IF v_fam.refresh_count >= p_rate_limit THEN
    -- Rate-limited: do NOT rotate, do NOT consume the current token.
    RETURN QUERY SELECT 'ERROR','FEDERATED_REFRESH_RATE_LIMITED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER; RETURN;
  END IF;

  -- ROTATE. New token expiry may not extend beyond the family's absolute expiry.
  v_new_exp := LEAST(clock_timestamp() + make_interval(secs => p_refresh_ttl_seconds), v_fam.absolute_expires_at);

  -- Insert the child token FIRST so the old token's replaced_by_token_id FK is satisfiable.
  INSERT INTO public.store_federated_refresh_tokens
    (id, session_family_id, token_hash, parent_token_id, expires_at, created_at)
  VALUES (p_new_token_id, v_fam.id, p_new_token_hash, v_tok.id, v_new_exp, clock_timestamp());

  UPDATE public.store_federated_refresh_tokens
     SET used_at = clock_timestamp(), replaced_by_token_id = p_new_token_id
   WHERE id = v_tok.id;

  UPDATE public.store_federated_session_families
     SET last_used_at = clock_timestamp(), last_rotated_at = clock_timestamp(),
         refresh_count = refresh_count + 1, updated_at = now()
   WHERE id = v_fam.id;

  INSERT INTO public.store_federated_session_audit_events
    (request_id, session_family_id, refresh_token_id, linked_profile_id, store_customer_id, event_type, status)
  VALUES (p_request_id, v_fam.id, p_new_token_id, v_fam.linked_profile_id, v_fam.store_customer_id,
          'FEDERATED_SESSION_REFRESHED', 'ACTIVE');

  RETURN QUERY SELECT 'OK', NULL::TEXT, v_fam.id, v_fam.store_customer_id, v_fam.linked_profile_id,
                      v_fam.DilMart_user_id, v_fam.session_version;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_federated_refresh_token(TEXT,UUID,TEXT,TEXT,INTEGER,INTEGER,INTEGER,INTEGER,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_federated_refresh_token(TEXT,UUID,TEXT,TEXT,INTEGER,INTEGER,INTEGER,INTEGER,UUID) TO service_role;
COMMENT ON FUNCTION public.rotate_federated_refresh_token IS
  'STORE-PR4 atomic refresh rotation (spec §9.3). Reuse detection precedes rate limiting; reuse compromises the family (committed). DB-window rate limit under the family lock. Exactly one concurrent rotation of a current token. Service-role only.';

-- ── logout / logout-all / internal identity revoke ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.logout_federated_session(
  p_refresh_token_hash TEXT,
  p_request_id         UUID
)
RETURNS TABLE (status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fam_id UUID;
  v_fam public.store_federated_session_families%ROWTYPE;
BEGIN
  SELECT session_family_id INTO v_fam_id FROM public.store_federated_refresh_tokens WHERE token_hash = p_refresh_token_hash;
  IF v_fam_id IS NOT NULL THEN
    SELECT * INTO v_fam FROM public.store_federated_session_families WHERE id = v_fam_id FOR UPDATE;
    IF FOUND AND v_fam.status = 'ACTIVE' THEN
      UPDATE public.store_federated_session_families
         SET status = 'REVOKED', revoked_at = clock_timestamp(), revoke_reason = 'USER_LOGOUT',
             session_version = store_federated_session_families.session_version + 1, updated_at = now()
       WHERE id = v_fam.id;
      UPDATE public.store_federated_refresh_tokens SET revoked_at = clock_timestamp()
        WHERE session_family_id = v_fam.id AND revoked_at IS NULL;
      INSERT INTO public.store_federated_session_audit_events
        (request_id, session_family_id, linked_profile_id, store_customer_id, event_type, status)
      VALUES (p_request_id, v_fam.id, v_fam.linked_profile_id, v_fam.store_customer_id, 'FEDERATED_SESSION_LOGOUT', 'REVOKED');
    END IF;
  END IF;
  -- Idempotent + no oracle: always report logged_out.
  RETURN QUERY SELECT 'logged_out'; RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.logout_federated_session(TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.logout_federated_session(TEXT,UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.logout_all_federated_sessions(
  p_refresh_token_hash TEXT,
  p_request_id         UUID
)
RETURNS TABLE (status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fam_id UUID;
  v_sc UUID; v_lp UUID; v_su UUID;
  r RECORD;
BEGIN
  SELECT session_family_id INTO v_fam_id FROM public.store_federated_refresh_tokens WHERE token_hash = p_refresh_token_hash;
  IF v_fam_id IS NOT NULL THEN
    SELECT store_customer_id, linked_profile_id, DilMart_user_id INTO v_sc, v_lp, v_su
      FROM public.store_federated_session_families WHERE id = v_fam_id;
    IF v_sc IS NOT NULL THEN
      -- Revoke every ACTIVE federated family for this confirmed identity. (Never touches Supabase sessions.)
      FOR r IN
        SELECT f.id, f.linked_profile_id, f.store_customer_id FROM public.store_federated_session_families f
         WHERE f.store_customer_id = v_sc AND f.DilMart_user_id = v_su AND f.status = 'ACTIVE' FOR UPDATE
      LOOP
        UPDATE public.store_federated_session_families
           SET status = 'REVOKED', revoked_at = clock_timestamp(), revoke_reason = 'USER_LOGOUT_ALL',
               session_version = store_federated_session_families.session_version + 1, updated_at = now()
         WHERE id = r.id;
        UPDATE public.store_federated_refresh_tokens SET revoked_at = clock_timestamp()
          WHERE session_family_id = r.id AND revoked_at IS NULL;
        INSERT INTO public.store_federated_session_audit_events
          (request_id, session_family_id, linked_profile_id, store_customer_id, event_type, status)
        VALUES (p_request_id, r.id, r.linked_profile_id, r.store_customer_id, 'FEDERATED_SESSION_LOGOUT_ALL', 'REVOKED');
      END LOOP;
    END IF;
  END IF;
  RETURN QUERY SELECT 'logged_out'; RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.logout_all_federated_sessions(TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.logout_all_federated_sessions(TEXT,UUID) TO service_role;

-- Internal revocation FOUNDATION (not exposed as an endpoint in PR4). Revokes all active families for a
-- DilMart_user_id and/or linked_profile_id; increments versions; revokes tokens; audits. Returns the count.
CREATE OR REPLACE FUNCTION public.revoke_federated_sessions_for_identity(
  p_DilMart_user_id   UUID,
  p_linked_profile_id UUID,
  p_reason           TEXT,
  p_request_id       UUID
)
RETURNS TABLE (revoked_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE r RECORD; v_n INTEGER := 0;
BEGIN
  IF p_DilMart_user_id IS NULL AND p_linked_profile_id IS NULL THEN
    RAISE EXCEPTION 'an identity key is required' USING ERRCODE = 'check_violation';
  END IF;
  FOR r IN
    SELECT id, linked_profile_id, store_customer_id FROM public.store_federated_session_families
     WHERE status = 'ACTIVE'
       AND ((p_DilMart_user_id IS NOT NULL AND DilMart_user_id = p_DilMart_user_id)
         OR (p_linked_profile_id IS NOT NULL AND linked_profile_id = p_linked_profile_id))
     FOR UPDATE
  LOOP
    UPDATE public.store_federated_session_families
       SET status = 'REVOKED', revoked_at = clock_timestamp(), revoke_reason = COALESCE(p_reason,'INTERNAL_REVOKE'),
           session_version = store_federated_session_families.session_version + 1, updated_at = now()
     WHERE id = r.id;
    UPDATE public.store_federated_refresh_tokens SET revoked_at = clock_timestamp()
      WHERE session_family_id = r.id AND revoked_at IS NULL;
    INSERT INTO public.store_federated_session_audit_events
      (request_id, session_family_id, linked_profile_id, store_customer_id, event_type, status, error_code)
    VALUES (p_request_id, r.id, r.linked_profile_id, r.store_customer_id, 'FEDERATED_SESSION_REVOKED', 'REVOKED', p_reason);
    v_n := v_n + 1;
  END LOOP;
  RETURN QUERY SELECT v_n; RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_federated_sessions_for_identity(UUID,UUID,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_federated_sessions_for_identity(UUID,UUID,TEXT,UUID) TO service_role;

-- ── validate_federated_session_family — DB-time verification foundation (read-only) ───────────
-- Used by the exported verifier (STORE-PR5 will compose it). Confirms a cryptographically-valid access
-- token maps to a live, version-matching, Customer-compatible family, using clock_timestamp() for expiry.
CREATE OR REPLACE FUNCTION public.validate_federated_session_family(
  p_family_id       UUID,
  p_session_version INTEGER,
  p_inactive_ttl_seconds INTEGER
)
RETURNS TABLE (
  valid             BOOLEAN,
  store_customer_id UUID,
  linked_profile_id UUID,
  DilMart_user_id    UUID,
  session_version   INTEGER,
  email             TEXT,
  phone             TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fam public.store_federated_session_families%ROWTYPE;
  v_link public.store_linked_profiles%ROWTYPE;
  v_prole TEXT; v_email TEXT; v_phone TEXT;
BEGIN
  SELECT * INTO v_fam FROM public.store_federated_session_families WHERE id = p_family_id;
  IF NOT FOUND
     OR v_fam.status <> 'ACTIVE'
     OR v_fam.session_version <> p_session_version
     OR v_fam.revoked_at IS NOT NULL
     OR v_fam.absolute_expires_at <= clock_timestamp()
     OR (v_fam.last_used_at + make_interval(secs => p_inactive_ttl_seconds)) <= clock_timestamp() THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::UUID, NULL::INTEGER, NULL::TEXT, NULL::TEXT; RETURN;
  END IF;

  SELECT * INTO v_link FROM public.store_linked_profiles WHERE id = v_fam.linked_profile_id;
  IF NOT FOUND OR upper(coalesce(v_link.DilMart_role,'')) <> 'CUSTOMER' OR upper(coalesce(v_link.link_status,'')) <> 'LINKED' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::UUID, NULL::INTEGER, NULL::TEXT, NULL::TEXT; RETURN;
  END IF;

  SELECT p.role, p.email, p.phone INTO v_prole, v_email, v_phone FROM public.profiles p WHERE p.id = v_fam.store_customer_id;
  IF v_prole IS DISTINCT FROM 'customer' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::UUID, NULL::INTEGER, NULL::TEXT, NULL::TEXT; RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, v_fam.store_customer_id, v_fam.linked_profile_id, v_fam.DilMart_user_id, v_fam.session_version, v_email, v_phone;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_federated_session_family(UUID,INTEGER,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_federated_session_family(UUID,INTEGER,INTEGER) TO service_role;
COMMENT ON FUNCTION public.validate_federated_session_family IS
  'STORE-PR4 DB-time session verification (spec §9). Read-only: confirms an ACTIVE, version-matching, Customer-compatible family that is not absolutely/inactivity expired. Service-role only.';
