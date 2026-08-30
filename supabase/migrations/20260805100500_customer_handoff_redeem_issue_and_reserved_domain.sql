-- STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Customer Handoff foundation, migration 6/6.
-- B4 (reserved-domain enforcement at the auth boundary via a trigger + a direct-insert provisioning RPC
-- that sets ownership metadata AT insert). No atomic redeem-and-issue RPC ships in PR3 — final federated
-- session issuance is owned by STORE-PR4 (see the PR3/PR4 boundary note below).

-- ── B4: reserved-domain enforcement (INSERT + UPDATE OF email / metadata) ─────────────────────
-- GoTrue applies admin app_metadata post-INSERT, so a trigger keyed on it would block the legitimate
-- provisioner. We therefore provision the shadow user via a SECURITY DEFINER RPC that INSERTs the full
-- ownership metadata AT insert time. This trigger then requires — for ANY row on the reserved domain —
-- account_type + origin + a valid DilMart_user_id UUID + federated_id that matches the email local part.
-- A public signup/OTP/email-change to the reserved domain cannot satisfy this and is rejected.
CREATE OR REPLACE FUNCTION public.reject_reserved_federated_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fed_id        TEXT;
  v_expected_email TEXT;
BEGIN
  IF NEW.email IS NULL OR lower(btrim(NEW.email)) NOT LIKE '%@federated.DilMart.internal' THEN
    RETURN NEW;  -- not a reserved-domain row → unaffected
  END IF;

  v_fed_id := NEW.raw_app_meta_data ->> 'federated_id';

  IF (NEW.raw_app_meta_data ->> 'account_type') IS DISTINCT FROM 'DilMart_federated_customer'
     OR (NEW.raw_app_meta_data ->> 'origin') IS DISTINCT FROM 'DilMart_federated'
     OR v_fed_id IS NULL
     OR (NEW.raw_user_meta_data ->> 'DilMart_user_id') IS NULL
     OR (NEW.raw_user_meta_data ->> 'DilMart_user_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'The federated.DilMart.internal domain requires complete federation ownership metadata.';
  END IF;

  v_expected_email := 'DilMart-federated+' || v_fed_id || '@federated.DilMart.internal';
  IF lower(btrim(NEW.email)) IS DISTINCT FROM lower(v_expected_email) THEN
    RAISE EXCEPTION 'Reserved federated email does not match its federated_id.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_reserved_federated_email ON auth.users;
CREATE TRIGGER trg_reject_reserved_federated_email
  BEFORE INSERT OR UPDATE OF email, raw_app_meta_data, raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.reject_reserved_federated_email();

COMMENT ON FUNCTION public.reject_reserved_federated_email() IS
  'Reserved-domain protection (task B4): only rows carrying full federation ownership metadata whose federated_id matches the email local part may exist on @federated.DilMart.internal. Public signup / email change cannot satisfy this.';

-- ── B4: shadow customer provisioning (direct insert, ownership metadata AT insert) ────────────
-- Idempotent + ownership-validated: reuse an owned record, refuse a foreign-held email (collision),
-- else create the auth user (the handle_new_user trigger creates the profile in the same transaction).
CREATE OR REPLACE FUNCTION public.provision_DilMart_federated_customer(
  p_DilMart_user_id UUID,
  p_federated_id   TEXT
)
RETURNS TABLE (store_customer_id UUID, error_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email TEXT := 'DilMart-federated+' || p_federated_id || '@federated.DilMart.internal';
  v_id    UUID;
  v_other UUID;
BEGIN
  IF p_federated_id IS NULL OR p_federated_id !~ '^[A-Za-z0-9_-]{16,120}$' THEN
    RAISE EXCEPTION 'invalid federated_id' USING ERRCODE = 'check_violation';
  END IF;

  -- 1) Ownership-validated recovery.
  SELECT u.id INTO v_id
  FROM auth.users u JOIN public.profiles p ON p.id = u.id
  WHERE lower(btrim(u.email)) = lower(v_email)
    AND (u.raw_app_meta_data ->> 'account_type') = 'DilMart_federated_customer'
    AND (u.raw_app_meta_data ->> 'origin') = 'DilMart_federated'
    AND (u.raw_user_meta_data ->> 'DilMart_user_id') = p_DilMart_user_id::text
    AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until < now())
    AND p.role = 'customer'
  LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_id, NULL::TEXT; RETURN;
  END IF;

  -- 2) Email held by a non-owned account → collision, never reuse.
  SELECT u.id INTO v_other FROM auth.users u WHERE lower(btrim(u.email)) = lower(v_email) LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT NULL::UUID, 'IDENTITY_BLOCKED'::TEXT; RETURN;
  END IF;

  -- 3) Provision. Ownership metadata + federated_id are set AT insert so the reserved-domain trigger allows it.
  v_id := gen_random_uuid();
  INSERT INTO auth.users
    (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data,
     created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
     email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  VALUES
    (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
     encode(sha256((gen_random_uuid()::text)::bytea), 'hex'),   -- unusable password; login impossible, never logged
     jsonb_build_object('provider','email','providers', array['email'],
                        'account_type','DilMart_federated_customer','origin','DilMart_federated','federated_id', p_federated_id),
     jsonb_build_object('account_type','DilMart_federated_customer','DilMart_user_id', p_DilMart_user_id::text),
     now(), now(), '', '', '', '', '', '', '', '');

  RETURN QUERY SELECT v_id, NULL::TEXT;
  RETURN;

EXCEPTION WHEN unique_violation THEN
  -- Concurrent creation: re-run ownership recovery; reuse if it is now ours, else collision.
  SELECT u.id INTO v_id
  FROM auth.users u JOIN public.profiles p ON p.id = u.id
  WHERE lower(btrim(u.email)) = lower(v_email)
    AND (u.raw_user_meta_data ->> 'DilMart_user_id') = p_DilMart_user_id::text
    AND (u.raw_app_meta_data ->> 'origin') = 'DilMart_federated'
    AND p.role = 'customer'
  LIMIT 1;
  IF FOUND THEN RETURN QUERY SELECT v_id, NULL::TEXT; ELSE RETURN QUERY SELECT NULL::UUID, 'IDENTITY_BLOCKED'::TEXT; END IF;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_DilMart_federated_customer(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_DilMart_federated_customer(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.provision_DilMart_federated_customer(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.provision_DilMart_federated_customer(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.provision_DilMart_federated_customer(UUID, TEXT) IS
  'Direct-insert shadow customer provisioning (task B4): sets full ownership metadata + federated_id at INSERT (satisfies the reserved-domain trigger). Idempotent; foreign-held email → IDENTITY_BLOCKED. Service-role only.';

-- ── PR3/PR4 SESSION BOUNDARY (no redeem-and-issue RPC in PR3) ───────────────────────────────────
-- STORE-PR3 deliberately does NOT ship an atomic redeem-and-issue RPC. Generating a refresh-token HASH
-- here would require a corresponding RAW refresh token that only the backend can mint and return — a hash
-- with no raw token is an unusable orphan row. The single-use consume primitive (redeem_customer_handoff)
-- is fully implemented and tested; final atomic session issuance (consume + session family + refresh hash
-- + audit, committing together and returning the raw refresh token from backend memory) is owned entirely
-- by STORE-PR4 via FederatedSessionIssuer.redeemAndIssue(...). PR3 inserts NO rows into
-- store_federated_session_families / store_federated_refresh_tokens at runtime or in tests; those tables
-- remain schema foundations only. The public redeem endpoint stays disabled (no issuer bound).
