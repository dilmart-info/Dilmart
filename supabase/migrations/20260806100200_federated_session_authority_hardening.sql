-- STORE-PR4 Security Closure (DilMart-CUSTOMER-STORE-STORE-PR4) — Session Authority & Concurrency.
-- Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §8.7–§8.10, §9, §16, §21.
--
-- ADDITIVE hardening layered on 20260806100100 (which is UNMERGED — it exists only on this Draft PR and
-- has never been deployed to a persistent environment). This migration REPLACES the six federated session
-- RPCs with hardened versions. Every old signature is explicitly DROPPED first so no stale overload can
-- remain callable. Closes:
--   B1 logout/logout-all require a currently-valid, locked refresh token (all-three identity for logout-all)
--   B2 one deterministic lock order everywhere: token→family (unlocked) → family FOR UPDATE → token FOR UPDATE
--   B3 approved security constants enforced INSIDE PostgreSQL (no trusted caller params)
--   B4 redeem + rotate return the committed refresh lifetime in seconds (DB clock, not the app clock)
--   B6 redeem + rotate bind pre-signed identity context under lock (mismatch → complete rollback / no rotation)
--   B7 internal revoke uses AND semantics (never widening OR)

-- Drop old signatures so no stale overload survives the signature changes.
DROP FUNCTION IF EXISTS public.redeem_and_create_federated_session(TEXT,TEXT,UUID,UUID,TEXT,UUID,TEXT,INTEGER,INTEGER,UUID);
DROP FUNCTION IF EXISTS public.rotate_federated_refresh_token(TEXT,UUID,TEXT,TEXT,INTEGER,INTEGER,INTEGER,INTEGER,UUID);
DROP FUNCTION IF EXISTS public.logout_federated_session(TEXT,UUID);
DROP FUNCTION IF EXISTS public.logout_all_federated_sessions(TEXT,UUID);
DROP FUNCTION IF EXISTS public.revoke_federated_sessions_for_identity(UUID,UUID,TEXT,UUID);
DROP FUNCTION IF EXISTS public.validate_federated_session_family(UUID,INTEGER,INTEGER);

-- ── redeem_and_create_federated_session (hardened) ─────────────────────────────────────────────
-- B3: no caller TTLs (constants inside). B4: returns refresh_expires_in_seconds. B6: expected-context
-- params are checked UNDER LOCK before the handoff is consumed; any mismatch rolls the whole tx back so
-- the one-time code is never spent for a stale/altered context.
CREATE FUNCTION public.redeem_and_create_federated_session(
  p_code_hash                  TEXT,
  p_state_hash                 TEXT,
  p_family_id                  UUID,
  p_refresh_token_id           UUID,
  p_refresh_token_hash         TEXT,
  p_access_jti                 UUID,
  p_device_hash                TEXT,
  p_expected_handoff_id        UUID,
  p_expected_store_customer_id UUID,
  p_expected_linked_profile_id UUID,
  p_expected_DilMart_user_id    UUID,
  p_expected_target_path       TEXT,
  p_request_id                 UUID
)
RETURNS TABLE (
  status                    TEXT,
  error_code                TEXT,
  store_customer_id         UUID,
  linked_profile_id         UUID,
  DilMart_user_id            UUID,
  target_path               TEXT,
  display_name              TEXT,
  session_version           INTEGER,
  refresh_expires_in_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c_refresh CONSTANT INTEGER := 2592000;  -- 30d, approved
  c_abs     CONSTANT INTEGER := 7776000;  -- 90d, approved
  v_h    public.DilMart_customer_handoffs%ROWTYPE;
  v_link public.store_linked_profiles%ROWTYPE;
  v_prole TEXT;
  v_now  TIMESTAMPTZ;
  v_abs  TIMESTAMPTZ;
  v_rexp TIMESTAMPTZ;
  v_rsecs INTEGER;
BEGIN
  SELECT * INTO v_h FROM public.DilMart_customer_handoffs WHERE code_hash = p_code_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'ERROR','HANDOFF_INVALID',NULL::UUID,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;
  IF v_h.state_hash IS DISTINCT FROM p_state_hash AND v_h.redeemed_at IS NULL THEN
    RETURN QUERY SELECT 'ERROR','HANDOFF_STATE_MISMATCH',NULL::UUID,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;
  IF v_h.redeemed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'ERROR','HANDOFF_ALREADY_REDEEMED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;
  IF v_h.expires_at <= clock_timestamp() THEN
    RETURN QUERY SELECT 'ERROR','HANDOFF_EXPIRED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;
  IF v_h.identity_outcome <> 'LINKED' OR v_h.linked_profile_id IS NULL OR v_h.store_customer_id IS NULL THEN
    RETURN QUERY SELECT 'ERROR','HANDOFF_INVALID',NULL::UUID,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;

  -- B6: the context the caller pre-signed the access token for must still match the locked handoff, EXACTLY.
  IF v_h.id                IS DISTINCT FROM p_expected_handoff_id
     OR v_h.store_customer_id IS DISTINCT FROM p_expected_store_customer_id
     OR v_h.linked_profile_id IS DISTINCT FROM p_expected_linked_profile_id
     OR v_h.DilMart_user_id    IS DISTINCT FROM p_expected_DilMart_user_id
     OR v_h.target_path       IS DISTINCT FROM p_expected_target_path THEN
    RETURN QUERY SELECT 'ERROR','HANDOFF_CONTEXT_MISMATCH',NULL::UUID,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;

  -- Recheck the link + customer are still LINKED and Customer-compatible under lock.
  SELECT * INTO v_link FROM public.store_linked_profiles WHERE id = v_h.linked_profile_id FOR UPDATE;
  IF NOT FOUND
     OR upper(coalesce(v_link.DilMart_role,'')) <> 'CUSTOMER'
     OR upper(coalesce(v_link.link_status,'')) <> 'LINKED'
     OR v_link.store_customer_id IS DISTINCT FROM v_h.store_customer_id THEN
    RETURN QUERY SELECT 'ERROR','IDENTITY_BLOCKED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;
  SELECT role INTO v_prole FROM public.profiles WHERE id = v_h.store_customer_id;
  IF v_prole IS DISTINCT FROM 'customer' THEN
    RETURN QUERY SELECT 'ERROR','IDENTITY_BLOCKED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::TEXT,NULL::TEXT,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;

  -- Consume the handoff.
  UPDATE public.DilMart_customer_handoffs
     SET redeemed_at = clock_timestamp(), status = 'REDEEMED', updated_at = now()
   WHERE id = v_h.id;

  v_now  := clock_timestamp();
  v_abs  := v_now + make_interval(secs => c_abs);
  v_rexp := LEAST(v_now + make_interval(secs => c_refresh), v_abs);
  v_rsecs := GREATEST(0, floor(extract(epoch FROM (v_rexp - v_now))))::INTEGER;

  INSERT INTO public.store_federated_session_families
    (id, store_customer_id, linked_profile_id, DilMart_user_id, device_id_hash, session_version, status,
     last_used_at, absolute_expires_at, refresh_window_started_at, refresh_count, created_at, updated_at)
  VALUES
    (p_family_id, v_h.store_customer_id, v_h.linked_profile_id, v_h.DilMart_user_id, p_device_hash, 1, 'ACTIVE',
     v_now, v_abs, v_now, 0, v_now, v_now);

  INSERT INTO public.store_federated_refresh_tokens
    (id, session_family_id, token_hash, parent_token_id, expires_at, created_at)
  VALUES
    (p_refresh_token_id, p_family_id, p_refresh_token_hash, NULL, v_rexp, v_now);

  UPDATE public.store_linked_profiles SET last_handoff_at = clock_timestamp(), updated_at = now() WHERE id = v_link.id;

  INSERT INTO public.DilMart_customer_handoff_audit_events
    (request_id, handoff_id, linked_profile_id, event_type, status, source_surface, campaign, metadata)
  VALUES
    (p_request_id, v_h.id, v_h.linked_profile_id, 'HANDOFF_REDEEMED', 'REDEEMED', v_h.source_surface, v_h.campaign,
     jsonb_build_object('sessionFamilyId', p_family_id));

  INSERT INTO public.store_federated_session_audit_events
    (request_id, session_family_id, refresh_token_id, handoff_id, linked_profile_id, store_customer_id, event_type, status, metadata)
  VALUES
    (p_request_id, p_family_id, p_refresh_token_id, v_h.id, v_h.linked_profile_id, v_h.store_customer_id,
     'FEDERATED_SESSION_CREATED', 'ACTIVE', jsonb_build_object('accessJti', p_access_jti));

  RETURN QUERY SELECT 'OK', NULL::TEXT, v_h.store_customer_id, v_h.linked_profile_id, v_h.DilMart_user_id,
                      v_h.target_path, v_link.display_name, 1, v_rsecs;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_and_create_federated_session(TEXT,TEXT,UUID,UUID,TEXT,UUID,TEXT,UUID,UUID,UUID,UUID,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_and_create_federated_session(TEXT,TEXT,UUID,UUID,TEXT,UUID,TEXT,UUID,UUID,UUID,UUID,TEXT,UUID) TO service_role;
COMMENT ON FUNCTION public.redeem_and_create_federated_session IS
  'STORE-PR4 (hardened) atomic redeem + session creation. Approved TTLs are constants; expected-context is checked under lock before consuming (mismatch => full rollback); returns the committed refresh lifetime in seconds. Service-role only.';

-- ── rotate_federated_refresh_token (hardened) ──────────────────────────────────────────────────
-- B2 lock order: token→family (unlocked read) → family FOR UPDATE → token FOR UPDATE → revalidate membership.
-- B3 constants inside (refresh/inactive 2592000, rate 30/3600). B4 returns refresh_expires_in_seconds.
-- B6 expected family/identity/session_version checked under lock; mismatch => no rotation.
CREATE FUNCTION public.rotate_federated_refresh_token(
  p_current_token_hash         TEXT,
  p_new_token_id               UUID,
  p_new_token_hash             TEXT,
  p_device_hash                TEXT,
  p_expected_family_id         UUID,
  p_expected_store_customer_id UUID,
  p_expected_linked_profile_id UUID,
  p_expected_DilMart_user_id    UUID,
  p_expected_session_version   INTEGER,
  p_request_id                 UUID
)
RETURNS TABLE (
  status                     TEXT,
  error_code                 TEXT,
  family_id                  UUID,
  store_customer_id          UUID,
  linked_profile_id          UUID,
  DilMart_user_id             UUID,
  session_version            INTEGER,
  refresh_expires_in_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c_refresh  CONSTANT INTEGER := 2592000;  -- 30d
  c_inactive CONSTANT INTEGER := 2592000;  -- 30d inactivity
  c_rate     CONSTANT INTEGER := 30;
  c_window   CONSTANT INTEGER := 3600;
  v_fam_id UUID;
  v_tok public.store_federated_refresh_tokens%ROWTYPE;
  v_fam public.store_federated_session_families%ROWTYPE;
  v_link public.store_linked_profiles%ROWTYPE;
  v_prole TEXT;
  v_now TIMESTAMPTZ;
  v_new_exp TIMESTAMPTZ;
  v_rsecs INTEGER;
BEGIN
  -- (1) Read token → family id WITHOUT a row lock.
  SELECT session_family_id INTO v_fam_id FROM public.store_federated_refresh_tokens WHERE token_hash = p_current_token_hash;
  IF v_fam_id IS NULL THEN
    RETURN QUERY SELECT 'ERROR','FEDERATED_SESSION_EXPIRED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;

  -- (2) Lock the family FIRST (deterministic order → no deadlock across lifecycle RPCs).
  SELECT * INTO v_fam FROM public.store_federated_session_families WHERE id = v_fam_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'ERROR','FEDERATED_SESSION_EXPIRED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;

  -- (3) Lock the exact token row. (4) Revalidate it still belongs to the locked family.
  SELECT * INTO v_tok FROM public.store_federated_refresh_tokens WHERE token_hash = p_current_token_hash FOR UPDATE;
  IF NOT FOUND OR v_tok.session_family_id IS DISTINCT FROM v_fam.id THEN
    RETURN QUERY SELECT 'ERROR','FEDERATED_SESSION_EXPIRED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;

  -- REUSE DETECTION (precedes everything else). A used token presented again compromises the family.
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
    RETURN QUERY SELECT 'ERROR','FEDERATED_REFRESH_REUSE_DETECTED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;

  -- Token/family validity (fail closed; no enumeration oracle → all map to FEDERATED_SESSION_EXPIRED).
  IF v_tok.revoked_at IS NOT NULL
     OR v_tok.expires_at <= clock_timestamp()
     OR v_fam.status <> 'ACTIVE'
     OR v_fam.revoked_at IS NOT NULL
     OR v_fam.absolute_expires_at <= clock_timestamp()
     OR (v_fam.last_used_at + make_interval(secs => c_inactive)) <= clock_timestamp() THEN
    IF v_fam.status = 'ACTIVE'
       AND (v_fam.absolute_expires_at <= clock_timestamp()
            OR (v_fam.last_used_at + make_interval(secs => c_inactive)) <= clock_timestamp()) THEN
      UPDATE public.store_federated_session_families SET status = 'EXPIRED', updated_at = now() WHERE id = v_fam.id;
      UPDATE public.store_federated_refresh_tokens SET revoked_at = clock_timestamp()
        WHERE session_family_id = v_fam.id AND revoked_at IS NULL;
      INSERT INTO public.store_federated_session_audit_events
        (request_id, session_family_id, refresh_token_id, linked_profile_id, store_customer_id, event_type, status, error_code)
      VALUES (p_request_id, v_fam.id, v_tok.id, v_fam.linked_profile_id, v_fam.store_customer_id,
              'FEDERATED_SESSION_EXPIRED', 'EXPIRED', 'FEDERATED_SESSION_EXPIRED');
    END IF;
    RETURN QUERY SELECT 'ERROR','FEDERATED_SESSION_EXPIRED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;

  -- B6: the pre-signed access-token context must match the locked family EXACTLY (incl. session_version).
  IF v_fam.id                IS DISTINCT FROM p_expected_family_id
     OR v_fam.store_customer_id IS DISTINCT FROM p_expected_store_customer_id
     OR v_fam.linked_profile_id IS DISTINCT FROM p_expected_linked_profile_id
     OR v_fam.DilMart_user_id    IS DISTINCT FROM p_expected_DilMart_user_id
     OR v_fam.session_version   IS DISTINCT FROM p_expected_session_version THEN
    RETURN QUERY SELECT 'ERROR','FEDERATED_SESSION_EXPIRED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;

  -- Device binding: a bound family requires the same device hash at refresh.
  IF v_fam.device_id_hash IS NOT NULL AND v_fam.device_id_hash IS DISTINCT FROM p_device_hash THEN
    RETURN QUERY SELECT 'ERROR','FEDERATED_SESSION_EXPIRED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;

  -- Link/customer still LINKED + Customer-compatible.
  SELECT * INTO v_link FROM public.store_linked_profiles WHERE id = v_fam.linked_profile_id;
  IF NOT FOUND OR upper(coalesce(v_link.DilMart_role,'')) <> 'CUSTOMER' OR upper(coalesce(v_link.link_status,'')) <> 'LINKED' THEN
    RETURN QUERY SELECT 'ERROR','FEDERATED_SESSION_EXPIRED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;
  SELECT role INTO v_prole FROM public.profiles WHERE id = v_fam.store_customer_id;
  IF v_prole IS DISTINCT FROM 'customer' THEN
    RETURN QUERY SELECT 'ERROR','FEDERATED_SESSION_EXPIRED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;

  -- RATE LIMIT (DB fixed window, under the family lock). Reset the window if elapsed.
  IF (v_fam.refresh_window_started_at + make_interval(secs => c_window)) <= clock_timestamp() THEN
    UPDATE public.store_federated_session_families
       SET refresh_window_started_at = clock_timestamp(), refresh_count = 0, updated_at = now()
     WHERE id = v_fam.id;
    v_fam.refresh_count := 0;
  END IF;
  IF v_fam.refresh_count >= c_rate THEN
    RETURN QUERY SELECT 'ERROR','FEDERATED_REFRESH_RATE_LIMITED',NULL::UUID,NULL::UUID,NULL::UUID,NULL::UUID,NULL::INTEGER,NULL::INTEGER; RETURN;
  END IF;

  -- ROTATE. New token expiry may not extend beyond the family's absolute expiry.
  v_now := clock_timestamp();
  v_new_exp := LEAST(v_now + make_interval(secs => c_refresh), v_fam.absolute_expires_at);
  v_rsecs := GREATEST(0, floor(extract(epoch FROM (v_new_exp - v_now))))::INTEGER;

  -- Insert the child token FIRST so the old token's replaced_by_token_id FK is satisfiable.
  INSERT INTO public.store_federated_refresh_tokens
    (id, session_family_id, token_hash, parent_token_id, expires_at, created_at)
  VALUES (p_new_token_id, v_fam.id, p_new_token_hash, v_tok.id, v_new_exp, v_now);

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
                      v_fam.DilMart_user_id, v_fam.session_version, v_rsecs;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_federated_refresh_token(TEXT,UUID,TEXT,TEXT,UUID,UUID,UUID,UUID,INTEGER,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_federated_refresh_token(TEXT,UUID,TEXT,TEXT,UUID,UUID,UUID,UUID,INTEGER,UUID) TO service_role;
COMMENT ON FUNCTION public.rotate_federated_refresh_token IS
  'STORE-PR4 (hardened) refresh rotation. Deterministic family-then-token lock order; reuse detection precedes all; approved rate/TTL constants inside; expected-context checked under lock; returns committed refresh lifetime in seconds. Service-role only.';

-- ── logout_federated_session (hardened) ────────────────────────────────────────────────────────
-- B1: only a CURRENTLY VALID, locked token grants revocation authority. Invalid/used/revoked/expired makes
-- no change and writes no success audit. B2: family-then-token lock order. No token-existence oracle.
CREATE FUNCTION public.logout_federated_session(
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
  v_tok public.store_federated_refresh_tokens%ROWTYPE;
BEGIN
  SELECT session_family_id INTO v_fam_id FROM public.store_federated_refresh_tokens WHERE token_hash = p_refresh_token_hash;
  IF v_fam_id IS NOT NULL THEN
    SELECT * INTO v_fam FROM public.store_federated_session_families WHERE id = v_fam_id FOR UPDATE;
    IF FOUND THEN
      SELECT * INTO v_tok FROM public.store_federated_refresh_tokens WHERE token_hash = p_refresh_token_hash FOR UPDATE;
      IF FOUND
         AND v_tok.session_family_id = v_fam.id
         AND v_tok.used_at IS NULL
         AND v_tok.revoked_at IS NULL
         AND v_tok.expires_at > clock_timestamp()
         AND v_fam.status = 'ACTIVE'
         AND v_fam.revoked_at IS NULL
         AND v_fam.absolute_expires_at > clock_timestamp()
         AND (v_fam.last_used_at + make_interval(secs => 2592000)) > clock_timestamp() THEN
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
  END IF;
  -- Idempotent + no oracle: always report logged_out.
  RETURN QUERY SELECT 'logged_out'; RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.logout_federated_session(TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.logout_federated_session(TEXT,UUID) TO service_role;
COMMENT ON FUNCTION public.logout_federated_session IS
  'STORE-PR4 (hardened) logout. Requires a currently-valid, locked refresh token; used/revoked/expired/unknown tokens change nothing and never emit a success audit. Generic response (no existence oracle). Service-role only.';

-- ── logout_all_federated_sessions (hardened) ───────────────────────────────────────────────────
-- B1: valid-token gate + revoke every ACTIVE family whose (store_customer_id, linked_profile_id,
-- DilMart_user_id) ALL match the validated token's family. Never widens on a 2-of-3 match.
CREATE FUNCTION public.logout_all_federated_sessions(
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
  v_tok public.store_federated_refresh_tokens%ROWTYPE;
  r RECORD;
BEGIN
  SELECT session_family_id INTO v_fam_id FROM public.store_federated_refresh_tokens WHERE token_hash = p_refresh_token_hash;
  IF v_fam_id IS NOT NULL THEN
    SELECT * INTO v_fam FROM public.store_federated_session_families WHERE id = v_fam_id FOR UPDATE;
    IF FOUND THEN
      SELECT * INTO v_tok FROM public.store_federated_refresh_tokens WHERE token_hash = p_refresh_token_hash FOR UPDATE;
      IF FOUND
         AND v_tok.session_family_id = v_fam.id
         AND v_tok.used_at IS NULL
         AND v_tok.revoked_at IS NULL
         AND v_tok.expires_at > clock_timestamp()
         AND v_fam.status = 'ACTIVE'
         AND v_fam.revoked_at IS NULL
         AND v_fam.absolute_expires_at > clock_timestamp()
         AND (v_fam.last_used_at + make_interval(secs => 2592000)) > clock_timestamp() THEN
        FOR r IN
          SELECT f.id, f.linked_profile_id, f.store_customer_id
            FROM public.store_federated_session_families f
           WHERE f.store_customer_id = v_fam.store_customer_id
             AND f.linked_profile_id = v_fam.linked_profile_id
             AND f.DilMart_user_id    = v_fam.DilMart_user_id
             AND f.status = 'ACTIVE'
           ORDER BY f.id
           FOR UPDATE
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
  END IF;
  RETURN QUERY SELECT 'logged_out'; RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.logout_all_federated_sessions(TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.logout_all_federated_sessions(TEXT,UUID) TO service_role;
COMMENT ON FUNCTION public.logout_all_federated_sessions IS
  'STORE-PR4 (hardened) logout-all. Requires a currently-valid, locked token; revokes every ACTIVE family matching ALL THREE committed identity values (store_customer_id + linked_profile_id + DilMart_user_id). Service-role only.';

-- ── revoke_federated_sessions_for_identity (hardened) ──────────────────────────────────────────
-- B7: AND semantics. When both selectors are supplied, a family must match BOTH. Exactly-one selector is
-- allowed. Never the widening union of two unrelated identity sets.
CREATE FUNCTION public.revoke_federated_sessions_for_identity(
  p_DilMart_user_id    UUID,
  p_linked_profile_id UUID,
  p_reason            TEXT,
  p_request_id        UUID
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
       AND (p_DilMart_user_id    IS NULL OR DilMart_user_id    = p_DilMart_user_id)
       AND (p_linked_profile_id IS NULL OR linked_profile_id = p_linked_profile_id)
     ORDER BY id
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
COMMENT ON FUNCTION public.revoke_federated_sessions_for_identity IS
  'STORE-PR4 (hardened) internal identity revoke foundation. AND semantics: when both selectors are supplied a family must match BOTH; never the widening OR. Service-role only. No HTTP endpoint in PR4.';

-- ── validate_federated_session_family (hardened) ───────────────────────────────────────────────
-- B3: inactivity TTL is a constant inside PostgreSQL (no trusted caller value).
CREATE FUNCTION public.validate_federated_session_family(
  p_family_id       UUID,
  p_session_version INTEGER
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
  c_inactive CONSTANT INTEGER := 2592000;  -- 30d
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
     OR (v_fam.last_used_at + make_interval(secs => c_inactive)) <= clock_timestamp() THEN
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

REVOKE ALL ON FUNCTION public.validate_federated_session_family(UUID,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_federated_session_family(UUID,INTEGER) TO service_role;
COMMENT ON FUNCTION public.validate_federated_session_family IS
  'STORE-PR4 (hardened) DB-time session validation. Inactivity TTL is a fixed constant inside PostgreSQL. Read-only. Service-role only.';
