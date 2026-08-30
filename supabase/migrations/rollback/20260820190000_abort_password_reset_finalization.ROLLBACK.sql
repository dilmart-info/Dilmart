-- Rollback for 20260820190000_abort_password_reset_finalization.sql
--
-- Drops the new abort RPC and nothing else. It touches no existing Saga function, no policy, no
-- table and no row: reserve_auth_action_token(), release_auth_action_token_reservation(),
-- consume_auth_action_token() and begin_password_reset_finalization() are untouched, and no
-- auth_action_tokens / auth_action_operations data is modified.
--
-- Consequence of running it: the Saga returns to the pre-task behaviour in which a password
-- deterministically rejected by Supabase Auth (error.code = weak_password) strands its reset token
-- in `finalizing` — the user must request a new OTP. That is the state main is in today, so this is
-- a return to the status quo rather than a security reduction. Do not run it while leaked-password
-- protection (HIBP) is enabled: rejections become routine at that point and the dead-end would be
-- hit regularly.
--
-- ORDERING: roll the BACKEND back first. Once the recovery service calls this RPC, dropping the
-- function while that code is live turns every weak-password rejection into an unhandled error.

BEGIN;

DROP FUNCTION public.abort_password_reset_finalization(uuid, uuid, text);

COMMIT;
