-- DilMart-STORE-WEAK-PASSWORD-RECOVERY-SAGA-001
-- Lets the password-reset Saga recover from a password Supabase Auth deterministically REJECTED.
--
-- WHY
-- The reset Saga marks the action token `finalizing` and records a request fingerprint BEFORE
-- calling auth.admin.updateUserById():
--
--   reserve → begin_password_reset_finalization (token=finalizing,
--             operation=password_update_pending + request_fingerprint) → updateUserById({password})
--
-- When Supabase rejects the password (`error.code = 'weak_password'`, reasons include `pwned`,
-- `length`, `characters`), the rejection happens BEFORE any mutation — the password did not change.
-- Today the backend records `failed_recoverable` and leaves the token `finalizing`. Because the
-- fingerprint is derived from the submitted password, a corrected password produces a different
-- fingerprint, the finalizing reconciliation refuses it, and
-- `release_auth_action_token_reservation()` deliberately refuses to release a `finalizing` token.
-- One rejected password therefore strands that reset token permanently. This must be fixed BEFORE
-- leaked-password protection (HIBP) is enabled, since HIBP makes the rejection a routine event.
--
-- WHAT
-- One narrowly-scoped RPC that returns the token to `active` — and ONLY for an attempt the caller
-- proves is the same one that was rejected, by presenting the exact token id, reservation id and
-- request fingerprint.
--
-- WHY THE CALLER IS THE PROOF SOURCE
-- The database cannot know what Supabase Auth answered. The trusted backend classifies the response
-- by its stable machine-readable `error.code`, never by message text, and only a deterministic
-- `weak_password` triggers this RPC. Every ambiguous outcome — timeout, transport failure, 5xx,
-- unknown SDK error — must NOT call it; those keep the existing `failed_recoverable` + finalizing
-- reconciliation, so a password update whose result is unknown can never be silently discarded.
-- The RPC's own job is to make sure the abort applies to exactly the attempt it claims to.
--
-- WHY NOT BROADEN release_auth_action_token_reservation()
-- That function is generic across every action-token purpose, and its `status = 'reserved'`
-- restriction is a deliberate safety property. Broadening it would let any caller unwind a token
-- that may already have mutated auth state, for every purpose at once. It is left untouched, as are
-- reserve_auth_action_token(), consume_auth_action_token() and begin_password_reset_finalization().
--
-- ONLY ONE STAGE IS ABORTABLE
-- `password_update_pending` is the only stage in which the password update is PROVEN not to have
-- taken effect, and only because the backend restricts the call to the request that just wrote that
-- stage and received a deterministic rejection from Auth.
--
-- `failed_recoverable` is explicitly NOT abortable. It records an earlier Auth request whose result
-- was AMBIGUOUS — a timeout, transport failure or 5xx — so the password may already have changed.
-- If a later retry of that same attempt were rejected (say leaked-password protection is enabled, or
-- its corpus changes, between the two), aborting would return an unconsumed token to `active` even
-- though a password change may already have committed, letting one reset credential drive a second
-- password change and discarding the record that the first may have landed. It fails closed instead:
-- that token stays `finalizing` and the user must request a new code, exactly as today.
--
-- `auth_updated`, `token_consumed`, `completed` and any consumed token all mean the password change
-- either happened or is durably recorded. They fail closed too.
--
-- IDEMPOTENCE
-- If the backend loses the RPC response it will retry with identical arguments. A repeat that finds
-- the token already back to `active` and the operation already `aborted` — with the same reservation
-- and fingerprint — returns true without changing anything. The operation keeps its reservation_id
-- and request_fingerprint precisely so that this retry can be recognised as the SAME attempt; the
-- next legitimate attempt is unaffected because begin_password_reset_finalization() overwrites
-- reservation_id, stage and request_fingerprint via ON CONFLICT (token_id) DO UPDATE.
--
-- STALE ABORTS
-- Once a new attempt reserves the token, the operation row carries a new reservation and
-- fingerprint, so a delayed abort from the previous attempt matches nothing and raises. A late
-- weak-password request can therefore never cancel a newer, valid password attempt.
--
-- ROLLBACK: supabase/migrations/rollback/20260820190000_abort_password_reset_finalization.ROLLBACK.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.abort_password_reset_finalization(
  p_token_id uuid,
  p_reservation_id uuid,
  p_request_fingerprint text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_token_status  text;
  v_token_purpose text;
  v_token_reservation uuid;
  v_token_consumed_at timestamptz;
  v_op_stage       text;
  v_op_type        text;
  v_op_reservation uuid;
  v_op_fingerprint text;
  v_rows           int;
BEGIN
  IF p_token_id IS NULL OR p_reservation_id IS NULL OR p_request_fingerprint IS NULL THEN
    RAISE EXCEPTION 'INVALID_ABORT: token id, reservation id and request fingerprint are all required';
  END IF;

  -- Deterministic lock order: token first, then its operation row. Both are locked before anything
  -- is validated or written, so concurrent aborts serialise instead of racing.
  SELECT t.status, t.purpose, t.reservation_id, t.consumed_at
    INTO v_token_status, v_token_purpose, v_token_reservation, v_token_consumed_at
    FROM public.auth_action_tokens t
   WHERE t.id = p_token_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_ABORT: action token not found';
  END IF;

  SELECT o.stage, o.operation_type, o.reservation_id, o.request_fingerprint
    INTO v_op_stage, v_op_type, v_op_reservation, v_op_fingerprint
    FROM public.auth_action_operations o
   WHERE o.token_id = p_token_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_ABORT: no saga operation recorded for this token';
  END IF;

  IF v_token_purpose IS DISTINCT FROM 'password_reset' OR v_op_type IS DISTINCT FROM 'password_reset' THEN
    RAISE EXCEPTION 'INVALID_ABORT: token or operation is not a password_reset';
  END IF;

  IF v_token_consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_ABORT: token is already consumed and can never be aborted';
  END IF;

  -- The attempt must match exactly: same reservation, same submitted password.
  IF v_op_reservation IS DISTINCT FROM p_reservation_id
     OR v_op_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
    RAISE EXCEPTION 'INVALID_ABORT: reservation or request fingerprint does not match the recorded attempt';
  END IF;

  -- ── Idempotent response-loss retry ────────────────────────────────────────
  -- Already aborted, by this same attempt: report success without touching anything.
  IF v_token_status = 'active'
     AND v_token_reservation IS NULL
     AND v_op_stage = 'aborted' THEN
    RETURN TRUE;
  END IF;

  -- ── First abort ───────────────────────────────────────────────────────────
  IF v_token_status IS DISTINCT FROM 'finalizing' THEN
    RAISE EXCEPTION 'INVALID_ABORT: token status is %, expected finalizing', COALESCE(v_token_status, 'NULL');
  END IF;

  IF v_token_reservation IS DISTINCT FROM p_reservation_id THEN
    RAISE EXCEPTION 'INVALID_ABORT: token is finalizing under a different reservation';
  END IF;

  -- Only the stage in which the password update is PROVEN not to have taken effect may be unwound.
  -- failed_recoverable is excluded on purpose: it means an earlier Auth call whose outcome was
  -- ambiguous, so the password may already have changed. auth_updated / token_consumed / completed /
  -- aborted are excluded because it definitely did.
  IF v_op_stage IS DISTINCT FROM 'password_update_pending' THEN
    RAISE EXCEPTION 'INVALID_ABORT: operation stage % cannot be aborted', COALESCE(v_op_stage, 'NULL');
  END IF;

  UPDATE public.auth_action_tokens
     SET status = 'active',
         reservation_id = NULL,
         reserved_at = NULL,
         reserved_until = NULL
   WHERE id = p_token_id
     AND status = 'finalizing'
     AND reservation_id = p_reservation_id
     AND purpose = 'password_reset'
     AND consumed_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'INVALID_ABORT: token could not be returned to active (% rows affected)', v_rows;
  END IF;

  -- reservation_id and request_fingerprint are RETAINED: they identify the aborted attempt for the
  -- idempotent retry above and for audit. The next begin_password_reset_finalization() overwrites
  -- all three fields, so they cannot bind the next password attempt.
  UPDATE public.auth_action_operations
     SET stage = 'aborted',
         updated_at = NOW()
   WHERE token_id = p_token_id
     AND operation_type = 'password_reset'
     AND reservation_id = p_reservation_id
     AND request_fingerprint = p_request_fingerprint
     AND stage = 'password_update_pending';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'INVALID_ABORT: saga operation could not be marked aborted (% rows affected)', v_rows;
  END IF;

  RETURN TRUE;
END
$fn$;

COMMENT ON FUNCTION public.abort_password_reset_finalization(uuid, uuid, text) IS
  'Returns a password-reset action token from finalizing to active after Supabase Auth deterministically rejected the submitted password (error.code = weak_password), which proves the password was not changed. Requires an exact token/reservation/request-fingerprint match, aborts only from stage password_update_pending (failed_recoverable is refused because that stage records an ambiguous Auth result), and is idempotent for a response-loss retry of the same attempt. Backend/service_role only — never call it for an ambiguous Auth failure.';

REVOKE ALL ON FUNCTION public.abort_password_reset_finalization(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.abort_password_reset_finalization(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.abort_password_reset_finalization(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.abort_password_reset_finalization(uuid, uuid, text) TO service_role;

COMMIT;
