-- DilMart-STORE-SUPABASE-DEFINER-RPC-HARDENING-001
-- Removes browser-role EXECUTE from the legacy SECURITY DEFINER functions the Supabase Security
-- Advisor flags, and pins the search_path of the three that still have a mutable one.
--
-- WHY
-- Production has 71 SECURITY DEFINER functions in `public`; 50 of them already carry explicit
-- service_role-only ACLs. The 21 the Advisor flags are exactly the older ones that still grant
-- EXECUTE to PUBLIC — and 19 of those additionally hold explicit `anon` and `authenticated` grants.
-- Because PUBLIC confers execution on its own, `REVOKE ... FROM anon` alone would secure nothing;
-- every revoke below therefore targets PUBLIC, anon and authenticated together.
--
-- This migration covers 18 of the 21. The three RLS helpers — is_admin(), is_platform_admin() and
-- is_merchant_member(uuid) — are deliberately NOT touched here: 45 policies call them and 43 of
-- those are evaluated for role PUBLIC, including "Public can view active merchants" on
-- public.merchants, so revoking anon EXECUTE without first splitting those policies would break
-- anonymous storefront reads. That is Task 7B-2. The leaked-password Advisor warning is Auth
-- configuration rather than SQL, and is out of scope too.
--
-- WHAT THIS CLOSES
-- None of the mutating functions below binds its parameters to auth.uid() or performs any
-- authorization of its own, and all of them are reachable over PostgREST with the public anon key:
--   * approve_merchant_atomic / reject_merchant_atomic — approve or reject ANY merchant application,
--     writing merchants and profiles, with the actor id supplied by the caller;
--   * claim_pending_points — attach a phone number's delivered orders to an ARBITRARY user id and
--     mint loyalty transactions;
--   * place_order — insert orders with caller-chosen financial fields (subtotal, discount,
--     commission, settlement), bypassing every server-side pricing and eligibility check;
--   * increment_coupon_usage — burn any coupon's usage counter;
--   * get_available_points / get_order_status — read another user's balance or order state.
-- The backend already calls each of these through SupabaseAdminService (service_role), and the
-- frontend issues no .rpc() calls at all, so no application flow depends on the browser grants.
--
-- TRIGGER FUNCTIONS
-- The nine trigger functions are a different case, and this migration does not claim they are
-- directly exploitable: they read NEW/OLD/TG_OP and generally cannot do useful work outside trigger
-- context. The defect is simply that browser EXECUTE is unnecessary attack surface. A trigger fires
-- its function regardless of the invoking role's EXECUTE privilege — the privilege is consulted only
-- for a direct call — so revoking it cannot break trigger execution. That is asserted, not assumed,
-- in backend/scripts/verify-security-definer-rpc-hardening.sql.
--
-- Their post-migration state is owner + service_role, NOT owner-only. All nine already carry an
-- EXPLICIT `service_role=X/postgres` grant in Production, and this migration does not revoke it:
-- service_role is the trusted backend/database execution boundary, the Advisor finding concerns
-- browser roles, and removing an existing trusted-role grant would widen the blast radius for no
-- browser-security gain. The boundary this task establishes is BROWSER DENIED / TRUSTED SERVICE ROLE
-- PRESERVED.
--
-- WHY A CATALOG LOOP RATHER THAN LITERAL SIGNATURES
-- Each statement below targets ONE exact function identity (`p.oid::regprocedure`), never a bare
-- name, so overloads can never be confused — `validate_coupon` has two and `place_order` has had
-- several. The loop exists because the repository's migration history and Production have drifted:
-- approve_merchant_atomic and reject_merchant_atomic exist in Production but are created by no
-- migration in this repository, and older `place_order` / `validate_coupon` overloads differ from the
-- ones live today. Hard-coded signatures would therefore fail a from-scratch replay while silently
-- missing whatever overload actually exists. Iterating the catalog hardens exactly what is present,
-- names anything absent in a NOTICE (never a silent gap), and fails closed if anything that IS
-- present is left reachable.
--
-- SEARCH_PATH
-- validate_coupon (both overloads) and place_order are the only SECURITY DEFINER functions in
-- `public` with no proconfig. They are pinned with a metadata-only ALTER FUNCTION; no body is
-- rewritten and no CREATE OR REPLACE is used, so prosrc stays byte-identical. `pg_temp` is listed
-- last explicitly, which is stronger than the repository's usual `search_path = public`: it stops a
-- temporary object from being resolved ahead of a real one inside a SECURITY DEFINER body.
--
-- LEGACY SIGNATURES
-- validate_coupon(text, numeric) and get_order_status(text, text) currently have no runtime caller.
-- They are restricted rather than dropped — removing a signature is irreversible and belongs to a
-- separate compatibility cleanup.
--
-- NOT IN SCOPE: no function body, no policy, no table, no data, no Auth setting is changed.
--
-- ROLLBACK: supabase/migrations/rollback/20260820170000_security_definer_rpc_acl_hardening.ROLLBACK.sql
-- The rollback is SECURITY-REDUCING and emergency-only.

BEGIN;

DO $harden$
DECLARE
  -- Server-callable: browser roles out, service_role keeps the trusted execution boundary.
  c_service CONSTANT text[] := ARRAY[
    'approve_merchant_atomic', 'reject_merchant_atomic', 'claim_pending_points', 'place_order',
    'increment_coupon_usage', 'get_available_points', 'get_order_status', 'validate_coupon'
  ];
  -- Trigger-only: browser roles lose direct EXECUTE. The owner and the existing explicit
  -- service_role grant are left in place; the trigger itself needs no grant at all.
  c_trigger CONSTANT text[] := ARRAY[
    'handle_new_user', 'handle_profile_points_claim', 'handle_order_status_points',
    'enforce_order_item_merchant_consistency', 'notify_new_order', 'notify_merchant_new_order',
    'notify_user_order_status', 'notify_agent_assignment', 'notify_low_stock'
  ];
  -- The only two that still lack a pinned search_path.
  c_pin CONSTANT text[] := ARRAY['validate_coupon', 'place_order'];
  v_fn        RECORD;
  v_name      text;
  v_hardened  int := 0;
  v_pinned    int := 0;
  v_absent    text := '';
  v_leaky     int;
BEGIN
  -- 1. Revoke browser-role EXECUTE, one exact identity at a time.
  FOR v_fn IN
    SELECT p.oid, p.oid::regprocedure AS ident, p.proname
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prosecdef
       AND p.proname = ANY(c_service || c_trigger)
     ORDER BY p.proname, p.oid::regprocedure::text
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn.ident);
    IF v_fn.proname = ANY(c_service) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn.ident);
    END IF;
    v_hardened := v_hardened + 1;
  END LOOP;

  -- 2. Pin the mutable search_paths — metadata only, no body is touched.
  FOR v_fn IN
    SELECT p.oid::regprocedure AS ident
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prosecdef
       AND p.proname = ANY(c_pin)
       AND p.proconfig IS NULL
     ORDER BY p.oid::regprocedure::text
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', v_fn.ident);
    v_pinned := v_pinned + 1;
  END LOOP;

  -- 3. Name anything that was not present, so a partial schema is visible rather than silent.
  FOREACH v_name IN ARRAY (c_service || c_trigger)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.proname = v_name
    ) THEN
      v_absent := v_absent || ' ' || v_name;
    END IF;
  END LOOP;

  IF v_absent <> '' THEN
    RAISE NOTICE 'security hardening: not present in this database, nothing to revoke:%', v_absent;
  END IF;

  -- 4. Fail closed: nothing that IS present may remain reachable by a browser role.
  SELECT count(*) INTO v_leaky
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prosecdef
     AND p.proname = ANY(c_service || c_trigger)
     AND (has_function_privilege('public', p.oid, 'EXECUTE')
       OR has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  IF v_leaky > 0 THEN
    RAISE EXCEPTION 'security hardening FAILED: % in-scope function(s) still executable by a browser role', v_leaky;
  END IF;

  -- 5. The three Advisor findings must be gone: no validate_coupon / place_order overload may keep a
  --    mutable search_path. This is deliberately scoped to the pin set. Other functions' search_path
  --    is not this task's business — in Production every one of them is already pinned, and a
  --    from-scratch replay of this repository produces older definitions that are not. Widening the
  --    assertion would make the migration rewrite objects the Advisor does not flag.
  SELECT count(*) INTO v_leaky
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prosecdef
     AND p.proname = ANY(c_pin)
     AND p.proconfig IS NULL;

  IF v_leaky > 0 THEN
    RAISE EXCEPTION 'security hardening FAILED: % validate_coupon/place_order signature(s) still have a mutable search_path', v_leaky;
  END IF;

  RAISE NOTICE 'security hardening: browser EXECUTE removed from % function(s) (owner and service_role preserved), % search_path(s) pinned', v_hardened, v_pinned;
END
$harden$;

COMMIT;
