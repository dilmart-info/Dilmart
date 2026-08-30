-- Verification for 20260820190000_abort_password_reset_finalization.sql
-- (DilMart-STORE-WEAK-PASSWORD-RECOVERY-SAGA-001).
--
-- Proves the abort RPC unwinds exactly one attempt and nothing else:
--   * a real first abort returns the token to active and marks the operation aborted;
--   * repeating the SAME abort is an idempotent no-op (response-loss retry);
--   * a stale abort from a previous attempt cannot cancel a newer one;
--   * wrong reservation / fingerprint / purpose / token all fail closed;
--   * auth_updated, token_consumed, completed, failed_recoverable and consumed tokens can never
--     be aborted — failed_recoverable records an AMBIGUOUS earlier Auth call, so the password may
--     already have changed;
--   * after an abort, reserve → begin_password_reset_finalization succeeds with a DIFFERENT password;
--   * PUBLIC/anon/authenticated cannot execute it; service_role can.
--
-- Everything runs inside a transaction that always ROLLBACKs, so nothing is persisted. A passing run
-- emits a NOTICE and exits 0; a failing run RAISEs and, with ON_ERROR_STOP=1, exits non-zero.
-- Unexpected SQL errors are recorded as failures, never silently counted as denials.
--
-- Run against a LOCAL / ephemeral database built from supabase/migrations — never Production: it
-- creates an auth.users row and action-token rows (all discarded by the final ROLLBACK).
--   docker cp backend/scripts/verify-abort-password-reset-finalization.sql <db>:/tmp/v.sql
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/v.sql
BEGIN;

DO $verify$
DECLARE
  v_results JSONB := '[]'::jsonb;
  v_pass INT := 0;
  v_fail INT := 0;
  v_user  UUID := gen_random_uuid();
  v_token UUID;
  v_res   UUID := gen_random_uuid();
  v_res2  UUID;                      -- issued by the real reserve RPC, never invented here
  v_fp    TEXT := 'fingerprint-attempt-1';
  v_fp2   TEXT := 'fingerprint-attempt-2';
  v_phone TEXT := '+96477' || lpad((floor(random() * 100000000))::bigint::text, 8, '0');
  v_digest TEXT := 'digest-' || gen_random_uuid()::text;
  v_ok    BOOLEAN;
  v_errm  TEXT;
  v_status text;
  v_stage  text;
  v_count  INT;
  v_rows   INT;
BEGIN
  ------------------------------------------------------------------- fixtures
  -- auth_action_tokens.user_id is a real FK to auth.users and phone_normalized is NOT NULL, so the
  -- fixture provisions an actual Auth row. The password hash is unusable, so the account cannot be
  -- signed into even if a run were somehow committed.
  INSERT INTO auth.users
    (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data,
     created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
     email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  VALUES
    (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'abort-verify-' || v_user::text || '@example.invalid',
     encode(sha256((gen_random_uuid()::text)::bytea), 'hex'),
     jsonb_build_object('provider', 'email', 'providers', array['email']),
     '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', '');

  INSERT INTO public.auth_action_tokens (id, user_id, phone_normalized, token_digest, purpose, status,
                                         reservation_id, reserved_at, reserved_until, expires_at)
  VALUES (gen_random_uuid(), v_user, v_phone, v_digest, 'password_reset',
          'finalizing', v_res, now(), now() + interval '10 minutes', now() + interval '30 minutes')
  RETURNING id INTO v_token;

  INSERT INTO public.auth_action_operations (token_id, reservation_id, operation_type, source_user_id,
                                             stage, request_fingerprint, updated_at)
  VALUES (v_token, v_res, 'password_reset', v_user, 'password_update_pending', v_fp, now());

  ------------------------------------------------------- 01 wrong fingerprint is refused
  BEGIN
    PERFORM public.abort_password_reset_finalization(v_token, v_res, 'not-the-fingerprint');
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('01 wrong fingerprint refused: FAIL (succeeded)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    IF v_errm LIKE 'INVALID_ABORT%' THEN
      v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('01 wrong fingerprint refused: PASS');
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('01 wrong fingerprint: FAIL ' || left(v_errm, 70));
    END IF;
  END;

  --------------------------------------------------------- 02 wrong reservation is refused
  BEGIN
    PERFORM public.abort_password_reset_finalization(v_token, gen_random_uuid(), v_fp);
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('02 wrong reservation refused: FAIL (succeeded)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    IF v_errm LIKE 'INVALID_ABORT%' THEN
      v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('02 wrong reservation refused: PASS');
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('02 wrong reservation: FAIL ' || left(v_errm, 70));
    END IF;
  END;

  ------------------------------------------------------------- 03 unknown token is refused
  BEGIN
    PERFORM public.abort_password_reset_finalization(gen_random_uuid(), v_res, v_fp);
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('03 unknown token refused: FAIL (succeeded)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    IF v_errm LIKE 'INVALID_ABORT%' THEN
      v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('03 unknown token refused: PASS');
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('03 unknown token: FAIL ' || left(v_errm, 70));
    END IF;
  END;

  --------------------------------------------------- 04 stages that must never be abortable
  FOR v_stage IN SELECT unnest(ARRAY['auth_updated', 'token_consumed', 'completed'])
  LOOP
    UPDATE public.auth_action_operations SET stage = v_stage WHERE token_id = v_token;
    BEGIN
      PERFORM public.abort_password_reset_finalization(v_token, v_res, v_fp);
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('04 stage %s refused: FAIL (succeeded)', v_stage));
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
      IF v_errm LIKE 'INVALID_ABORT%' THEN
        v_pass := v_pass + 1; v_results := v_results || jsonb_build_array(format('04 stage %s refused: PASS', v_stage));
      ELSE
        v_fail := v_fail + 1; v_results := v_results || jsonb_build_array(format('04 stage %s: FAIL %s', v_stage, left(v_errm, 60)));
      END IF;
    END;
  END LOOP;
  UPDATE public.auth_action_operations SET stage = 'password_update_pending' WHERE token_id = v_token;

  ------------------------------------------------------------- 05 consumed token is refused
  UPDATE public.auth_action_tokens SET consumed_at = now() WHERE id = v_token;
  BEGIN
    PERFORM public.abort_password_reset_finalization(v_token, v_res, v_fp);
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('05 consumed token refused: FAIL (succeeded)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    IF v_errm LIKE 'INVALID_ABORT%' THEN
      v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('05 consumed token refused: PASS');
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('05 consumed token: FAIL ' || left(v_errm, 70));
    END IF;
  END;
  UPDATE public.auth_action_tokens SET consumed_at = NULL WHERE id = v_token;

  ------------------------------------------------------------- 06 wrong purpose is refused
  UPDATE public.auth_action_tokens SET purpose = 'claim_account' WHERE id = v_token;
  BEGIN
    PERFORM public.abort_password_reset_finalization(v_token, v_res, v_fp);
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('06 wrong purpose refused: FAIL (succeeded)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    IF v_errm LIKE 'INVALID_ABORT%' THEN
      v_pass := v_pass + 1; v_results := v_results || jsonb_build_array('06 wrong purpose refused: PASS');
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('06 wrong purpose: FAIL ' || left(v_errm, 70));
    END IF;
  END;
  UPDATE public.auth_action_tokens SET purpose = 'password_reset' WHERE id = v_token;

  ---------------------------------------------------------------- 07 the real first abort
  BEGIN
    v_ok := public.abort_password_reset_finalization(v_token, v_res, v_fp);
    SELECT status INTO v_status FROM public.auth_action_tokens WHERE id = v_token;
    SELECT stage INTO v_stage FROM public.auth_action_operations WHERE token_id = v_token;
    SELECT count(*) INTO v_count FROM public.auth_action_tokens
     WHERE id = v_token AND reservation_id IS NULL AND reserved_at IS NULL AND reserved_until IS NULL;
    IF v_ok AND v_status = 'active' AND v_stage = 'aborted' AND v_count = 1 THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('07 first abort: token active, reservation cleared, operation aborted: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('07 first abort: FAIL status=%s stage=%s cleared=%s', v_status, v_stage, v_count));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('07 first abort raised: FAIL ' || left(v_errm, 80));
  END;

  ------------------------------------------- 08 the aborted attempt keeps its audit identity
  SELECT count(*) INTO v_count FROM public.auth_action_operations
   WHERE token_id = v_token AND reservation_id = v_res AND request_fingerprint = v_fp;
  IF v_count = 1 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('08 aborted operation retains reservation + fingerprint: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('08 aborted operation identity: FAIL');
  END IF;

  -------------------------------------------------- 09 idempotent response-loss retry is a no-op
  BEGIN
    v_ok := public.abort_password_reset_finalization(v_token, v_res, v_fp);
    SELECT status INTO v_status FROM public.auth_action_tokens WHERE id = v_token;
    SELECT stage INTO v_stage FROM public.auth_action_operations WHERE token_id = v_token;
    IF v_ok AND v_status = 'active' AND v_stage = 'aborted' THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('09 repeat abort with identical arguments is an idempotent no-op: PASS');
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('09 idempotent retry: FAIL');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('09 idempotent retry raised: FAIL ' || left(v_errm, 80));
  END;

  ------------------------------- 10 a new attempt on the same token, with a DIFFERENT password
  -- Driven through the REAL saga entry points — reserve_auth_action_token() then
  -- begin_password_reset_finalization() — not simulated with direct UPDATEs, so this proves the
  -- aborted token is genuinely reusable by the production code path. The new reservation is issued
  -- by the reserve RPC itself.
  BEGIN
    SELECT r.reservation_id INTO v_res2
      FROM public.reserve_auth_action_token(v_digest, 'password_reset') AS r;

    IF v_res2 IS NULL THEN
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array('10 reserve after abort: FAIL (the aborted token could not be reserved)');
    ELSIF v_res2 = v_res THEN
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array('10 reserve after abort: FAIL (reservation was not rotated)');
    ELSE
      v_ok := public.begin_password_reset_finalization(v_token, v_res2, v_fp2);

      SELECT count(*) INTO v_count FROM public.auth_action_tokens t
       WHERE t.id = v_token AND t.status = 'finalizing' AND t.reservation_id = v_res2;
      SELECT count(*) INTO v_rows FROM public.auth_action_operations o
       WHERE o.token_id = v_token AND o.stage = 'password_update_pending'
         AND o.reservation_id = v_res2 AND o.request_fingerprint = v_fp2;

      IF v_ok AND v_count = 1 AND v_rows = 1 THEN
        v_pass := v_pass + 1;
        v_results := v_results || jsonb_build_array('10 real reserve + begin_password_reset_finalization succeed on the aborted token with a different password: PASS');
      ELSE
        v_fail := v_fail + 1;
        v_results := v_results || jsonb_build_array(format('10 real reserve + begin: FAIL ok=%s token=%s operation=%s', v_ok, v_count, v_rows));
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('10 real reserve + begin raised: FAIL ' || left(v_errm, 80));
  END;

  ---------------------------------------------- 11 a stale abort cannot cancel the new attempt
  -- The old reservation and old fingerprint, replayed after the token was legitimately re-reserved
  -- and re-begun by the real RPCs above.
  BEGIN
    PERFORM public.abort_password_reset_finalization(v_token, v_res, v_fp);
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('11 stale abort refused: FAIL (it cancelled a newer attempt)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    SELECT status INTO v_status FROM public.auth_action_tokens WHERE id = v_token;
    IF v_errm LIKE 'INVALID_ABORT%' AND v_status = 'finalizing' THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('11 stale abort from the previous attempt refused, newer attempt untouched: PASS');
    ELSE
      v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('11 stale abort: FAIL ' || left(v_errm, 60) || ' status=' || v_status);
    END IF;
  END;

  ------------------------------- 12 failed_recoverable is refused even for its own exact attempt
  -- The stage records an earlier Auth call whose result was ambiguous, so the password may already
  -- have changed. Matching token, reservation and fingerprint are NOT enough to unwind it.
  UPDATE public.auth_action_operations SET stage = 'failed_recoverable' WHERE token_id = v_token;
  BEGIN
    PERFORM public.abort_password_reset_finalization(v_token, v_res2, v_fp2);
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('12 failed_recoverable refused: FAIL (an ambiguous attempt was unwound)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    SELECT status INTO v_status FROM public.auth_action_tokens WHERE id = v_token;
    SELECT stage INTO v_stage FROM public.auth_action_operations WHERE token_id = v_token;
    IF v_errm LIKE 'INVALID_ABORT%' AND v_status = 'finalizing' AND v_stage = 'failed_recoverable' THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('12 failed_recoverable refused, token left finalizing: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('12 failed_recoverable refusal: FAIL %s status=%s stage=%s', left(v_errm, 50), v_status, v_stage));
    END IF;
  END;

  ------------------------------------------------------------------- 13 privilege contract
  IF has_function_privilege('service_role', 'public.abort_password_reset_finalization(uuid,uuid,text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.abort_password_reset_finalization(uuid,uuid,text)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.abort_password_reset_finalization(uuid,uuid,text)', 'EXECUTE')
     AND NOT has_function_privilege('public', 'public.abort_password_reset_finalization(uuid,uuid,text)', 'EXECUTE')
  THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('13 service_role-only EXECUTE (PUBLIC/anon/authenticated denied): PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('13 privilege contract: FAIL');
  END IF;

  --------------------------------------------------------- 14 function security properties
  IF (SELECT p.prosecdef AND p.proconfig @> ARRAY['search_path=public'] AND p.pronargs = 3
        FROM pg_proc p
       WHERE p.oid = 'public.abort_password_reset_finalization(uuid,uuid,text)'::regprocedure)
  THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('14 SECURITY DEFINER + search_path=public + 3 args: PASS');
  ELSE
    v_fail := v_fail + 1; v_results := v_results || jsonb_build_array('14 function security properties: FAIL');
  END IF;

  ---------------------------------------------- 15 the generic release RPC was NOT broadened
  IF (SELECT position('status = ''reserved''' IN p.prosrc) > 0
        FROM pg_proc p WHERE p.oid = 'public.release_auth_action_token_reservation(uuid,uuid)'::regprocedure)
  THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('15 release_auth_action_token_reservation still restricted to reserved: PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('15 generic release RPC was modified: FAIL');
  END IF;

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'ABORT_PASSWORD_RESET_FINALIZATION FAILED pass=% fail=% details=%', v_pass, v_fail, v_results::text;
  END IF;

  RAISE NOTICE 'ABORT_PASSWORD_RESET_FINALIZATION PASSED pass=% fail=% details=%', v_pass, v_fail, v_results::text;
END
$verify$;

-- Fixtures exist only for this run.
ROLLBACK;
