-- ============================================================================
-- PREFLIGHT for 20260731120000_handle_new_user_phone_only_signup.sql
--
-- Read-only. Run this in the SQL editor of the target project BEFORE applying the
-- migration, and keep the output. It answers the four questions that decide whether the
-- migration is safe here, rather than safe in the abstract:
--
--   1. Is profiles.email actually NOT NULL right now? (If it is already nullable, some
--      other change got there first and the migration's assumptions need re-checking.)
--   2. Does the on_auth_user_created trigger exist, and is it bound to handle_new_user?
--   3. What is the current function body? Capture it — it is the rollback target.
--   4. How many profiles exist, and how many would be affected?
--
-- The migration is additive: it drops a NOT NULL constraint and replaces a function. It
-- writes no rows. Query 5 is the zero-data-loss check that makes that claim testable
-- instead of asserted.
--
-- SELECTs only. Nothing here modifies anything.
-- ============================================================================

-- 1. Is profiles.email NOT NULL today?
--    Expected before the migration: is_nullable = 'NO'
select
  table_schema,
  table_name,
  column_name,
  is_nullable,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name = 'email';

-- 2. Does the trigger exist, and what does it call?
--    Expected: exactly one row, action_statement referencing handle_new_user.
select
  trigger_name,
  event_object_schema,
  event_object_table,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_name = 'on_auth_user_created';

-- 3. The current function definition. THIS IS THE ROLLBACK TARGET — save the output
--    verbatim before applying anything. The md5 makes it easy to prove afterwards that a
--    rollback restored the same body.
select
  p.oid::regprocedure          as function_signature,
  md5(pg_get_functiondef(p.oid)) as definition_md5,
  pg_get_functiondef(p.oid)    as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'handle_new_user';

-- 4. Scale of the change.
select
  (select count(*) from public.profiles)                          as profiles_total,
  (select count(*) from public.profiles where email is null)      as profiles_without_email,
  (select count(*) from public.profiles where phone is not null)  as profiles_with_phone,
  (select count(*) from auth.users)                               as auth_users_total,
  (select count(*) from auth.users where phone is not null and phone <> '') as auth_users_with_phone;

-- 5. Zero-data-loss check.
--
--    Run this before, apply the migration, then run it again. Every number must be
--    identical. The migration only relaxes a constraint and replaces a function body, so
--    any change here means something unexpected happened and the rollback below applies.
select
  count(*)                                       as profiles_total,
  count(email)                                   as profiles_with_email,
  count(phone)                                   as profiles_with_phone,
  count(full_name)                               as profiles_with_full_name,
  count(distinct account_type)                   as distinct_account_types,
  md5(string_agg(id::text, ',' order by id))     as profile_id_fingerprint
from public.profiles;

-- 6. Existing profiles that would violate the constraint being dropped.
--    Expected: 0. A non-zero result means the current NOT NULL is already being bypassed
--    somehow, which would need explaining before proceeding.
select count(*) as profiles_violating_not_null
from public.profiles
where email is null;
