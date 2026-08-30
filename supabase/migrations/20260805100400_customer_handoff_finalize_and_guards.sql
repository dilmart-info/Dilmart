-- STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Customer Handoff foundation, migration 5/6.
-- Hardening: B4/B5/B6 atomic prepare finalization + B8 audit immutability. Security-closure round 2:
-- B2 (finalize locks + rechecks identity invariants in-transaction), B3 (exact 120s TTL), B8 (request_id).

-- ── finalize_customer_handoff — ONE transaction: recheck (FOR UPDATE) + link + handoff + PREPARED audit ─
-- Does NOT trust the resolver decision made before the transaction. It locks the existing link row
-- (FOR UPDATE), rechecks role/status/ownership, and uses the LOCKED store_customer_id as the value written
-- to the handoff — never preserving customer A while emitting a handoff for customer B. Concurrent races
-- resolve deterministically to EXISTING_LINK / LINKED / IDENTITY_BLOCKED / HANDOFF_INVALID (not a 503).
-- expires_at is DB-clock derived; linked_at is preserved; the whole op rolls back on any failure.
CREATE OR REPLACE FUNCTION public.finalize_customer_handoff(
  p_DilMart_user_id     UUID,
  p_store_customer_id  UUID,
  p_identity_outcome   TEXT,
  p_link_method        TEXT,
  p_link_status        TEXT,
  p_identity_assurance TEXT,
  p_reuse_existing     BOOLEAN,
  p_conflict_reason    TEXT,
  p_code_hash          TEXT,
  p_state_hash         TEXT,
  p_assertion_jti      TEXT,
  p_target_path        TEXT,
  p_source_surface     TEXT,
  p_campaign           TEXT,
  p_code_ttl_seconds   INTEGER,
  p_kid                TEXT,
  p_email              TEXT,
  p_phone_verified_at  TIMESTAMPTZ,
  p_email_verified_at  TIMESTAMPTZ,
  p_request_id         UUID
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
  v_link              public.store_linked_profiles%ROWTYPE;
  v_found             BOOLEAN := FALSE;
  v_linked_profile_id UUID;
  v_effective_customer UUID;
  v_actual_customer   UUID;
  v_handoff_id        UUID;
  v_expires_at        TIMESTAMPTZ;
  v_constraint        TEXT;
BEGIN
  -- B3: the code TTL is EXACTLY 120s for this implementation, or fail.
  IF p_code_ttl_seconds IS DISTINCT FROM 120 THEN
    RAISE EXCEPTION 'handoff code ttl must be exactly 120 seconds' USING ERRCODE = 'check_violation';
  END IF;

  -- B2: serialize all finalizations for the SAME DilMart user (transaction-scoped advisory lock) so
  -- concurrent calls resolve deterministically rather than racing on the store_customer_id partial-unique
  -- index (which ON CONFLICT(DilMart_user_id) does not arbitrate). The second caller then observes the
  -- first's committed link under the FOR UPDATE read below.
  PERFORM pg_advisory_xact_lock(hashtext('customer_handoff_finalize'), hashtext(p_DilMart_user_id::text));

  -- Lock the existing identity link for this DilMart user and recheck under serialization.
  SELECT * INTO v_link FROM public.store_linked_profiles WHERE DilMart_user_id = p_DilMart_user_id FOR UPDATE;
  v_found := FOUND;

  IF p_identity_outcome = 'LINKED' THEN
    IF p_reuse_existing THEN
      -- EXISTING_LINK: the locked row must STILL be a customer-compatible LINKED row owning exactly
      -- p_store_customer_id; anything else fails closed.
      IF NOT v_found
         OR upper(coalesce(v_link.DilMart_role, '')) <> 'CUSTOMER'
         OR upper(coalesce(v_link.link_status, '')) <> 'LINKED'
         OR v_link.store_customer_id IS DISTINCT FROM p_store_customer_id THEN
        RETURN QUERY SELECT 'ERROR', 'IDENTITY_BLOCKED', NULL::UUID, NULL::TIMESTAMPTZ, NULL::UUID;
        RETURN;
      END IF;
      v_linked_profile_id := v_link.id;
      v_effective_customer := v_link.store_customer_id;  -- the LOCKED value is authoritative
      UPDATE public.store_linked_profiles
         SET last_handoff_at = clock_timestamp(), updated_at = now()
       WHERE id = v_link.id;
    ELSE
      -- New / verified-candidate link. A pre-existing row must be customer-compatible, not blocked/revoked,
      -- and must not already own a DIFFERENT store customer.
      IF v_found THEN
        IF upper(coalesce(v_link.DilMart_role, '')) NOT IN ('', 'CUSTOMER')
           OR upper(coalesce(v_link.link_status, '')) IN ('BLOCKED', 'REVOKED')
           OR (v_link.store_customer_id IS NOT NULL AND v_link.store_customer_id IS DISTINCT FROM p_store_customer_id) THEN
          RETURN QUERY SELECT 'ERROR', 'IDENTITY_BLOCKED', NULL::UUID, NULL::TIMESTAMPTZ, NULL::UUID;
          RETURN;
        END IF;
      END IF;

      -- Upsert, then re-verify the ACTUAL persisted customer equals the intended one. A concurrent request
      -- that linked a different customer first makes COALESCE keep the other value → roll back + BLOCK.
      BEGIN
        INSERT INTO public.store_linked_profiles
          (DilMart_user_id, DilMart_role, store_customer_id, segment, source_app, email,
           link_status, link_method, identity_assurance, phone_verified_at, email_verified_at,
           linked_at, last_handoff_at, last_synced_at, updated_at)
        VALUES
          (p_DilMart_user_id, 'CUSTOMER', p_store_customer_id, 'DilMart_APP_CUSTOMER', 'customer_app', p_email,
           p_link_status, p_link_method, p_identity_assurance, p_phone_verified_at, p_email_verified_at,
           clock_timestamp(), clock_timestamp(), now(), now())
        ON CONFLICT (DilMart_user_id) DO UPDATE
          SET store_customer_id  = COALESCE(public.store_linked_profiles.store_customer_id, EXCLUDED.store_customer_id),
              link_status        = EXCLUDED.link_status,
              link_method        = EXCLUDED.link_method,
              identity_assurance = EXCLUDED.identity_assurance,
              email              = COALESCE(EXCLUDED.email, public.store_linked_profiles.email),
              phone_verified_at  = COALESCE(EXCLUDED.phone_verified_at, public.store_linked_profiles.phone_verified_at),
              email_verified_at  = COALESCE(EXCLUDED.email_verified_at, public.store_linked_profiles.email_verified_at),
              linked_at          = COALESCE(public.store_linked_profiles.linked_at, EXCLUDED.linked_at),
              last_handoff_at    = clock_timestamp(),
              updated_at         = now()
        RETURNING id, store_customer_id INTO v_linked_profile_id, v_actual_customer;

        IF v_actual_customer IS DISTINCT FROM p_store_customer_id THEN
          RAISE EXCEPTION 'store customer ownership conflict';  -- rolls back this upsert (nested savepoint)
        END IF;
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM LIKE '%ownership conflict%' THEN
          RETURN QUERY SELECT 'ERROR', 'IDENTITY_BLOCKED', NULL::UUID, NULL::TIMESTAMPTZ, NULL::UUID;
          RETURN;
        END IF;
        RAISE;
      END;

      v_effective_customer := v_actual_customer;
    END IF;
  ELSE
    -- LINK_REQUIRED / BLOCKED: never create, re-own, OR mutate a link row (task C3). The conflict state
    -- lives only in the handoff row (identity_outcome/status) and the audit event (error_code + metadata);
    -- a Barber/OWNER linked-profile row is left byte-for-byte semantically unchanged.
    v_linked_profile_id := NULL;
    v_effective_customer := NULL;
  END IF;

  INSERT INTO public.DilMart_customer_handoffs AS h
    (code_hash, state_hash, assertion_jti, DilMart_user_id, linked_profile_id, store_customer_id,
     target_path, source_surface, campaign, status, identity_outcome, expires_at)
  VALUES
    (p_code_hash, p_state_hash, p_assertion_jti, p_DilMart_user_id,
     CASE WHEN p_identity_outcome = 'LINKED' THEN v_linked_profile_id ELSE NULL END,
     CASE WHEN p_identity_outcome = 'LINKED' THEN v_effective_customer ELSE NULL END,
     p_target_path, p_source_surface, p_campaign,
     CASE WHEN p_identity_outcome = 'LINKED' THEN 'PENDING' ELSE p_identity_outcome END,
     p_identity_outcome,
     clock_timestamp() + make_interval(secs => p_code_ttl_seconds))
  RETURNING h.id, h.expires_at INTO v_handoff_id, v_expires_at;

  -- B8: the atomic PREPARED audit carries the API request id.
  INSERT INTO public.DilMart_customer_handoff_audit_events
    (request_id, handoff_id, linked_profile_id, event_type, status, source_surface, campaign, error_code, metadata)
  VALUES
    (p_request_id, v_handoff_id,
     CASE WHEN p_identity_outcome = 'LINKED' THEN v_linked_profile_id ELSE NULL END,
     'HANDOFF_PREPARED', p_identity_outcome, p_source_surface, p_campaign,
     CASE WHEN p_identity_outcome IN ('LINK_REQUIRED','BLOCKED') THEN p_identity_outcome ELSE NULL END,
     jsonb_build_object('kid', p_kid, 'linkMethod', p_link_method, 'conflictReason', p_conflict_reason));

  RETURN QUERY SELECT 'OK', NULL::TEXT, v_handoff_id, v_expires_at, v_linked_profile_id;
  RETURN;

EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'uq_store_linked_profiles_store_customer_id' THEN
      RETURN QUERY SELECT 'ERROR', 'IDENTITY_BLOCKED', NULL::UUID, NULL::TIMESTAMPTZ, NULL::UUID;
    ELSE
      RETURN QUERY SELECT 'ERROR', 'HANDOFF_INVALID', NULL::UUID, NULL::TIMESTAMPTZ, NULL::UUID;
    END IF;
    RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_customer_handoff(UUID,UUID,TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_customer_handoff(UUID,UUID,TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,UUID) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_customer_handoff(UUID,UUID,TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_customer_handoff(UUID,UUID,TEXT,TEXT,TEXT,TEXT,BOOLEAN,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,UUID) TO service_role;

COMMENT ON FUNCTION public.finalize_customer_handoff IS
  'Atomic Customer Handoff prepare finalization (task B4/B5/B6 + B2/B3/B8): FOR UPDATE lock + in-tx identity recheck, exact 120s DB-clock expiry, linked_at preserved, request-id audit, deterministic race/unique mapping. Service-role only.';

-- ── B8: audit immutability — reject UPDATE/DELETE on handoff audit events ──────────────────────
CREATE OR REPLACE FUNCTION public.reject_handoff_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'DilMart_customer_handoff_audit_events is append-only (immutable audit trail).';
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_handoff_audit_mutation ON public.DilMart_customer_handoff_audit_events;
CREATE TRIGGER trg_reject_handoff_audit_mutation
  BEFORE UPDATE OR DELETE ON public.DilMart_customer_handoff_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_handoff_audit_mutation();

COMMENT ON FUNCTION public.reject_handoff_audit_mutation() IS
  'Enforces audit immutability (task B8): blocks UPDATE/DELETE on handoff audit events for every role.';

-- Migration 6 (20260805100500) adds reserved-domain enforcement and the direct shadow-provisioning RPC
-- only. There is NO atomic redeem-and-issue operation in STORE-PR3; final atomic session issuance
-- (consume + session family + refresh-token hash + audit, returning the raw refresh token from backend
-- memory) is deferred entirely to STORE-PR4.
