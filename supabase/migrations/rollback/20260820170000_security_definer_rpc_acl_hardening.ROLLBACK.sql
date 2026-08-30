-- Rollback for 20260820170000_security_definer_rpc_acl_hardening.sql
--
-- ⚠ SECURITY-REDUCING — EMERGENCY USE ONLY. ⚠
--
-- This restores the exact pre-task Production state, which means deliberately re-exposing trusted
-- SECURITY DEFINER functions to browser roles. Running it accepts that anyone holding the public
-- anon key can again call, among others:
--   * approve_merchant_atomic / reject_merchant_atomic — approve or reject any merchant application;
--   * claim_pending_points — link any phone's orders to an arbitrary user and mint loyalty points;
--   * place_order — create orders with caller-chosen financial fields;
--   * increment_coupon_usage — burn coupon usage counters;
-- none of which performs any authorization of its own. It also restores the mutable search_path on
-- validate_coupon (both overloads) and place_order.
--
-- Do not run this to "undo a deploy". The hardening changes no function body and no policy, and
-- every consumer uses service_role, so a failure afterwards is very unlikely to originate here —
-- investigate first. If a rollback is genuinely required, treat it as an active security incident
-- and re-apply the hardening as soon as the real cause is fixed.
--
-- WHY THIS LISTS EXACT SIGNATURES WHILE THE MIGRATION ITERATES THE CATALOG
-- The forward migration must work on any schema shape, so it hardens whatever is present. A rollback
-- has the opposite requirement: it must restore ONLY what was actually changed, and only to the
-- state that existed before. Driving it from a catalog scan would grant browser EXECUTE to overloads
-- that never had it, and reset a search_path that was already pinned beforehand — inventing state
-- rather than restoring it. The 18 identities below are the ones captured read-only from Production
-- immediately before the hardening, together with the exact grants each held:
--   * approve_merchant_atomic and reject_merchant_atomic held ONLY the PUBLIC grant;
--   * the other 16 held PUBLIC + anon + authenticated;
--   * service_role held EXECUTE on all 18 — explicitly on the 9 trigger functions too;
--   * exactly three signatures had a mutable search_path.
-- The forward migration never revokes service_role, so that grant survives the hardening and needs
-- no restoration statement here; only the browser grants and the pinned search_paths are restored.
-- Each statement is guarded by to_regprocedure(), so a database that lacks a signature is skipped
-- rather than aborting the script.
--
-- Nothing here is resolved by function NAME. A catalog scan over `place_order` or `validate_coupon`
-- would also match overloads this task never touched: an unrelated overload can legitimately carry
-- `search_path=public, pg_temp` without this migration having set it, and granting it browser EXECUTE
-- or resetting its search_path would invent state rather than restore it. An overload whose
-- pre-state was never recorded therefore stays hardened.

BEGIN;

DO $unharden$
DECLARE
  -- identity signature, grantees to restore
  c_public_only CONSTANT text[] := ARRAY[
    'public.approve_merchant_atomic(uuid, uuid)',
    'public.reject_merchant_atomic(uuid, text, uuid)'
  ];
  c_browser CONSTANT text[] := ARRAY[
    'public.claim_pending_points(uuid, text)',
    'public.increment_coupon_usage(uuid)',
    'public.get_available_points(uuid)',
    'public.get_order_status(text, text)',
    'public.validate_coupon(text, numeric)',
    'public.validate_coupon(text, numeric, uuid)',
    'public.handle_new_user()',
    'public.handle_profile_points_claim()',
    'public.handle_order_status_points()',
    'public.enforce_order_item_merchant_consistency()',
    'public.notify_new_order()',
    'public.notify_merchant_new_order()',
    'public.notify_user_order_status()',
    'public.notify_agent_assignment()',
    'public.notify_low_stock()',
    -- The exact 55-argument identity live in Production, reconfirmed read-only before this edit.
    'public.place_order(text,text,uuid,text,text,text,numeric,numeric,numeric,numeric,uuid,jsonb,uuid,double precision,double precision,text,integer,numeric,integer,uuid,text,text,numeric,numeric,numeric,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,integer,text,text,text,numeric,uuid,uuid,uuid,uuid,uuid,text,integer,text,text,uuid,uuid,uuid,text,text)'
  ];
  -- service_role also held EXECUTE on the server-callable set before the hardening.
  c_service CONSTANT text[] := ARRAY[
    'public.approve_merchant_atomic(uuid, uuid)',
    'public.reject_merchant_atomic(uuid, text, uuid)',
    'public.claim_pending_points(uuid, text)',
    'public.increment_coupon_usage(uuid)',
    'public.get_available_points(uuid)',
    'public.get_order_status(text, text)',
    'public.validate_coupon(text, numeric)',
    'public.validate_coupon(text, numeric, uuid)',
    'public.place_order(text,text,uuid,text,text,text,numeric,numeric,numeric,numeric,uuid,jsonb,uuid,double precision,double precision,text,integer,numeric,integer,uuid,text,text,numeric,numeric,numeric,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,integer,text,text,text,numeric,uuid,uuid,uuid,uuid,uuid,text,integer,text,text,uuid,uuid,uuid,text,text)'
  ];
  -- The ONLY three identities whose search_path this migration pinned. Provenance cannot be
  -- inferred from proname or proconfig: an unrelated overload may legitimately carry
  -- 'search_path=public, pg_temp' without this task having set it, and resetting that would be
  -- inventing state. Only these three are reset.
  c_pinned CONSTANT text[] := ARRAY[
    'public.validate_coupon(text, numeric)',
    'public.validate_coupon(text, numeric, uuid)',
    'public.place_order(text,text,uuid,text,text,text,numeric,numeric,numeric,numeric,uuid,jsonb,uuid,double precision,double precision,text,integer,numeric,integer,uuid,text,text,numeric,numeric,numeric,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,integer,text,text,text,numeric,uuid,uuid,uuid,uuid,uuid,text,integer,text,text,uuid,uuid,uuid,text,text)'
  ];
  v_sig      text;
  v_oid      oid;
  v_restored int := 0;
  v_reset    int := 0;
  v_skipped  text := '';
BEGIN
  -- Restore browser grants on the recorded identities only, each resolved by exact signature.
  FOREACH v_sig IN ARRAY (c_public_only || c_browser)
  LOOP
    v_oid := to_regprocedure(v_sig);
    IF v_oid IS NULL THEN
      v_skipped := v_skipped || ' ' || v_sig;
      CONTINUE;
    END IF;
    IF v_sig = ANY(c_public_only) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', v_oid::regprocedure);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC, anon, authenticated', v_oid::regprocedure);
    END IF;
    v_restored := v_restored + 1;
  END LOOP;

  FOREACH v_sig IN ARRAY c_service
  LOOP
    v_oid := to_regprocedure(v_sig);
    IF v_oid IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_oid::regprocedure);
    END IF;
  END LOOP;

  -- Reset the search_path ONLY on the three exact identities this migration pinned.
  FOREACH v_sig IN ARRAY c_pinned
  LOOP
    v_oid := to_regprocedure(v_sig);
    IF v_oid IS NULL THEN
      v_skipped := v_skipped || ' ' || split_part(v_sig, '(', 1) || '(search_path)';
      CONTINUE;
    END IF;
    EXECUTE format('ALTER FUNCTION %s RESET search_path', v_oid::regprocedure);
    v_reset := v_reset + 1;
  END LOOP;

  IF v_skipped <> '' THEN
    RAISE NOTICE 'rollback: not present in this database, nothing to restore:%', v_skipped;
  END IF;

  RAISE NOTICE 'rollback complete: browser-role EXECUTE restored on % recorded identity(ies), % pinned search_path(s) reset (SECURITY-REDUCING)', v_restored, v_reset;
END
$unharden$;

COMMIT;
