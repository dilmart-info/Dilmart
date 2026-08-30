-- STORE-PR4 Final Closure (DilMart-CUSTOMER-STORE-STORE-PR4) — Multi-Family Logout-All Concurrency.
-- Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §9.6, §21.
--
-- ADDITIVE. Replaces ONLY logout_all_federated_sessions. The prior version locked the presented token's
-- family first, then every ACTIVE identity family in id order — so two concurrent logout-all calls that
-- present valid tokens from DIFFERENT families of the SAME identity could deadlock:
--     T1 holds family A, waits for family B   ┐  cycle
--     T2 holds family B, waits for family A   ┘
--
-- Fix: an IDENTITY-LEVEL serialization point taken BEFORE any session-family row is locked. We lock the
-- identity's store_linked_profiles row FOR UPDATE (the identity triple is 1:1:1 with that row), so only one
-- logout-all per identity proceeds at a time; family rows are then locked in a single ORDER BY id pass, and
-- the presented token is locked AFTER its family (preserving the global family→token order used by rotate /
-- logout). Interactions with rotate / logout / revoke_federated_sessions_for_identity /
-- redeem_and_create_federated_session stay acyclic:
--   • rotate/logout lock family→token and never take the linked_profiles lock;
--   • revoke_for_identity locks families in the SAME id order and never takes the linked_profiles lock;
--   • redeem locks handoff→linked_profiles and only INSERTs a new family (never locks an existing one).

DROP FUNCTION IF EXISTS public.logout_all_federated_sessions(TEXT,UUID);

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
  v_sc UUID; v_lp UUID; v_su UUID;
  v_link public.store_linked_profiles%ROWTYPE;
  v_tok public.store_federated_refresh_tokens%ROWTYPE;
  v_pfam public.store_federated_session_families%ROWTYPE;
  r RECORD;
BEGIN
  -- (1) Resolve the presented token → family → identity triple WITHOUT any row lock.
  SELECT session_family_id INTO v_fam_id FROM public.store_federated_refresh_tokens WHERE token_hash = p_refresh_token_hash;
  IF v_fam_id IS NULL THEN RETURN QUERY SELECT 'logged_out'; RETURN; END IF;
  SELECT store_customer_id, linked_profile_id, DilMart_user_id INTO v_sc, v_lp, v_su
    FROM public.store_federated_session_families WHERE id = v_fam_id;
  IF v_lp IS NULL THEN RETURN QUERY SELECT 'logged_out'; RETURN; END IF;

  -- (2) IDENTITY MUTEX: lock the linked_profiles row for this identity. Serializes all logout-all for the
  --     identity BEFORE any session-family row is locked → the A↔B cross-family deadlock cannot form.
  SELECT * INTO v_link FROM public.store_linked_profiles WHERE id = v_lp FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'logged_out'; RETURN; END IF;

  -- (3) Re-read/revalidate the identity context under the mutex (the family identity columns are immutable,
  --     but we re-read the presented family below under lock for the authority gate).

  -- (4) Lock EVERY matching ACTIVE family for the identity, in a single deterministic id-ordered pass. This
  --     matches revoke_federated_sessions_for_identity's order, so those two can never deadlock either.
  FOR r IN
    SELECT f.id FROM public.store_federated_session_families f
     WHERE f.store_customer_id = v_sc AND f.linked_profile_id = v_lp AND f.DilMart_user_id = v_su
       AND f.status = 'ACTIVE'
     ORDER BY f.id
     FOR UPDATE
  LOOP
    NULL; -- rows are now locked; revoked in the second pass after the authority gate passes
  END LOOP;

  -- (5) Lock the exact presented refresh-token row (its family is already locked → family→token order kept).
  SELECT * INTO v_tok FROM public.store_federated_refresh_tokens WHERE token_hash = p_refresh_token_hash FOR UPDATE;
  -- (6) Read the presented family (locked above if ACTIVE) and enforce the full authority gate.
  SELECT * INTO v_pfam FROM public.store_federated_session_families WHERE id = v_fam_id;
  IF v_tok.id IS NULL
     OR v_tok.session_family_id IS DISTINCT FROM v_fam_id
     OR v_tok.used_at IS NOT NULL
     OR v_tok.revoked_at IS NOT NULL
     OR v_tok.expires_at <= clock_timestamp()
     OR v_pfam.id IS NULL
     OR v_pfam.status <> 'ACTIVE'
     OR v_pfam.revoked_at IS NOT NULL
     OR v_pfam.absolute_expires_at <= clock_timestamp()
     OR (v_pfam.last_used_at + make_interval(secs => 2592000)) <= clock_timestamp()
     OR v_pfam.store_customer_id IS DISTINCT FROM v_sc
     OR v_pfam.linked_profile_id IS DISTINCT FROM v_lp
     OR v_pfam.DilMart_user_id    IS DISTINCT FROM v_su THEN
    -- Invalid/used/revoked/expired presented token → no change, no success audit, generic response.
    RETURN QUERY SELECT 'logged_out'; RETURN;
  END IF;

  -- (7) Revoke every ACTIVE identity family (already locked) + its tokens; one audit per revoked family.
  FOR r IN
    SELECT f.id, f.linked_profile_id, f.store_customer_id FROM public.store_federated_session_families f
     WHERE f.store_customer_id = v_sc AND f.linked_profile_id = v_lp AND f.DilMart_user_id = v_su
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

  RETURN QUERY SELECT 'logged_out'; RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.logout_all_federated_sessions(TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.logout_all_federated_sessions(TEXT,UUID) TO service_role;
COMMENT ON FUNCTION public.logout_all_federated_sessions IS
  'STORE-PR4 (final) logout-all. Identity mutex on store_linked_profiles FOR UPDATE before any family lock → no cross-family deadlock. Requires a currently-valid, locked presented token matching the full identity triple; revokes every ACTIVE family for that identity (one audit each). Service-role only.';
