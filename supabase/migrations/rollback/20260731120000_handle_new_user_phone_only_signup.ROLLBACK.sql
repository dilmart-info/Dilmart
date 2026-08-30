-- ============================================================================
-- ROLLBACK for 20260731120000_handle_new_user_phone_only_signup.sql
--
-- Reverses the two changes the migration makes:
--   * the NOT NULL constraint dropped from profiles.email
--   * the replaced public.handle_new_user() body
--
-- READ THIS BEFORE RUNNING.
--
-- Restoring NOT NULL is the dangerous half, and it is not symmetric with dropping it. If
-- any phone-only profile was created while the migration was live, that row has email =
-- NULL and the constraint cannot come back without either deleting the row or inventing an
-- email for it. Neither is something this script will do silently.
--
-- So step 1 is a check, not an action. If it returns anything above zero, STOP: the
-- rollback is no longer a clean reversal, and what to do with those accounts is a product
-- decision, not a migration one.
--
-- The function rollback below is a *template*. Paste the definition captured by query 3 of
-- the preflight — the original body, not a reconstruction from memory.
-- ============================================================================

-- ── Step 1. Is a clean rollback still possible? ─────────────────────────────
-- Expected: 0. Anything else means STOP.
select count(*) as profiles_that_block_rollback
from public.profiles
where email is null;

-- ── Step 2. Restore the original trigger function ───────────────────────────
--
-- Replace the body below with the definition captured in preflight query 3, then run it.
-- Do not hand-write a "close enough" version: the whole point of capturing the md5 is that
-- the restored body can be proven identical.
--
-- CREATE OR REPLACE FUNCTION public.handle_new_user()
-- RETURNS TRIGGER AS $$
-- ... paste the captured definition here ...
-- $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Rebind the trigger. Unchanged by the migration, recreated here for the same reason the
-- migration recreates it.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── Step 3. Restore NOT NULL ────────────────────────────────────────────────
--
-- ONLY run this if step 1 returned 0. It will fail loudly otherwise, which is the intended
-- behaviour — a failed statement is much better than a silent data decision.
ALTER TABLE public.profiles ALTER COLUMN email SET NOT NULL;

-- ── Step 4. Verify ──────────────────────────────────────────────────────────
-- is_nullable must read 'NO', and the md5 must match what preflight captured.
select
  column_name,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name = 'email';

select md5(pg_get_functiondef(p.oid)) as definition_md5
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'handle_new_user';
