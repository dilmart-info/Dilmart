-- ============================================================================
-- DILMART — STAGE B MIGRATION B: LEGACY DESTRUCTIVE CLEANUP (AUTHORITY CORRECTED)
-- Migration: 20260831120000_stage_b_legacy_destructive_cleanup.sql
-- ============================================================================
-- Accounting & Authority Invariants:
-- 1. Total legacy candidate function names in family: 19
-- 2. Migration B disposition: 18 REMOVE, 1 KEEP/DEFER (reject_reserved_federated_email)
-- 3. Preflight strictly asserts Migration A post-state authority by comparing the
--    COMPLETE literal pg_get_function_identity_arguments() for place_order (49 args)
--    and place_order_idempotent (51 args), postgres owner, prosecdef=true,
--    search_path=public, pg_temp, strict ACLs: service_role execute only.
-- 4. Preflight asserts all 11 legacy tables contain exactly 0 rows.
-- 5. Preflight asserts all target legacy columns contain zero non-default data.
-- 6. Preflight asserts checkout_attempts contains zero rows with NULL user_id.
-- 7. Preflight validates exact function identities against approved whitelist;
--    any unexpected identity or overload aborts migration (FAIL CLOSED).
-- 8. Enforces checkout_attempts.user_id SET NOT NULL to restore modern integrity.
-- 9. Explicitly drops dependent triggers, exact-signature legacy functions (RESTRICT),
--    constraints, indexes, columns, child tables, and parent tables with RESTRICT.
-- 10. Preserves auth.users trigger & reject_reserved_federated_email() for Migration F.
-- 11. Postconditions assert 0 legacy functions for 18 removed names, 0 legacy tables,
--     0 legacy columns, checkout_attempts.user_id NOT NULL, preserved auth guard,
--     and intact place_order & place_order_idempotent authority.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 1: FAIL-CLOSED PREFLIGHT VALIDATION GATES
-- ────────────────────────────────────────────────────────────────────────────
DO $preflight$
DECLARE
  v_po_count            INT;
  v_po_rec              RECORD;
  v_po_legacy_count     INT;
  v_poi_count           INT;
  v_poi_rec             RECORD;
  v_tbl                 RECORD;
  v_tbl_count           BIGINT;
  v_col_non_null        BIGINT;
  v_salon_true_count    BIGINT;
  v_null_user_id_count  BIGINT;
  v_fn                  RECORD;
  c_po_expected_args    CONSTANT TEXT := 'p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric, p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid, p_latitude double precision, p_longitude double precision, p_map_url text, p_points_spent integer, p_points_discount numeric, p_points_earned integer, p_merchant_id uuid, p_payment_method text, p_merchant_notes text, p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric, p_platform_commission_type text, p_platform_commission_rate numeric, p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric, p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric, p_merchant_gross_amount numeric, p_merchant_net_amount numeric, p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric, p_currency_code text, p_financial_snapshot_version integer, p_payment_status text, p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric, p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid, p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text, p_commercial_snapshot_version integer, p_channel text';
  c_poi_expected_args   CONSTANT TEXT := 'p_checkout_attempt_id uuid, p_checkout_request_hash text, p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric, p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid, p_latitude double precision, p_longitude double precision, p_map_url text, p_points_spent integer, p_points_discount numeric, p_points_earned integer, p_merchant_id uuid, p_payment_method text, p_merchant_notes text, p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric, p_platform_commission_type text, p_platform_commission_rate numeric, p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric, p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric, p_merchant_gross_amount numeric, p_merchant_net_amount numeric, p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric, p_currency_code text, p_financial_snapshot_version integer, p_payment_status text, p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric, p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid, p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text, p_commercial_snapshot_version integer, p_channel text';
BEGIN
  -- ── 1.1 Protect Migration A Modern place_order Authority ───────────────────
  SELECT count(*) INTO v_po_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_po_count <> 1 THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order count must be exactly 1 (found %)', v_po_count;
  END IF;

  SELECT
    p.oid,
    p.pronargs,
    p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner_name,
    p.proconfig,
    pg_get_function_identity_arguments(p.oid) AS identity_args
  INTO v_po_rec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_po_rec.pronargs <> 49 THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order must have exactly 49 arguments (found %)', v_po_rec.pronargs;
  END IF;

  IF v_po_rec.owner_name <> 'postgres' OR v_po_rec.prosecdef IS NOT TRUE THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order must be SECURITY DEFINER owned by postgres';
  END IF;

  IF v_po_rec.proconfig IS NULL OR NOT (array_to_string(v_po_rec.proconfig, ',') ~* 'search_path=public,\s*pg_temp') THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order search_path not pinned to public, pg_temp (found %)', v_po_rec.proconfig;
  END IF;

  -- Verify COMPLETE literal identity arguments for place_order (49 args)
  IF v_po_rec.identity_args <> c_po_expected_args THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order identity arguments do not match exact approved Migration A signature. Found [%], Expected [%]',
      v_po_rec.identity_args, c_po_expected_args;
  END IF;

  -- Verify ACL privileges: PUBLIC, anon, authenticated must NOT have execute; service_role MUST have execute
  IF has_function_privilege('public', v_po_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order must NOT be executable by PUBLIC';
  END IF;
  IF has_function_privilege('anon', v_po_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order must NOT be executable by anon';
  END IF;
  IF has_function_privilege('authenticated', v_po_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order must NOT be executable by authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', v_po_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order must be executable by service_role';
  END IF;

  -- Verify obsolete overloads / temporary functions are absent
  SELECT count(*) INTO v_po_legacy_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('place_order_legacy_stageb', 'place_order_legacy');

  IF v_po_legacy_count <> 0 THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: temporary legacy place_order functions must not exist';
  END IF;

  -- ── 1.2 Protect Migration A place_order_idempotent Wrapper Authority ───────
  SELECT count(*) INTO v_poi_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_idempotent';

  IF v_poi_count <> 1 THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order_idempotent count must be exactly 1 (found %)', v_poi_count;
  END IF;

  SELECT
    p.oid,
    p.pronargs,
    p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner_name,
    p.proconfig,
    pg_get_function_identity_arguments(p.oid) AS identity_args
  INTO v_poi_rec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_idempotent';

  IF v_poi_rec.pronargs <> 51 THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order_idempotent must have exactly 51 arguments (found %)', v_poi_rec.pronargs;
  END IF;

  IF v_poi_rec.owner_name <> 'postgres' OR v_poi_rec.prosecdef IS NOT TRUE THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order_idempotent must be SECURITY DEFINER owned by postgres';
  END IF;

  IF v_poi_rec.proconfig IS NULL OR NOT (array_to_string(v_poi_rec.proconfig, ',') ~* 'search_path=public,\s*pg_temp') THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order_idempotent search_path not pinned to public, pg_temp (found %)', v_poi_rec.proconfig;
  END IF;

  -- Verify COMPLETE literal identity arguments for place_order_idempotent (51 args)
  IF v_poi_rec.identity_args <> c_poi_expected_args THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order_idempotent identity arguments do not match exact approved Migration A signature. Found [%], Expected [%]',
      v_poi_rec.identity_args, c_poi_expected_args;
  END IF;

  -- Verify ACL privileges: PUBLIC, anon, authenticated must NOT have execute; service_role MUST have execute
  IF has_function_privilege('public', v_poi_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order_idempotent must NOT be executable by PUBLIC';
  END IF;
  IF has_function_privilege('anon', v_poi_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order_idempotent must NOT be executable by anon';
  END IF;
  IF has_function_privilege('authenticated', v_poi_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order_idempotent must NOT be executable by authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', v_poi_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order_idempotent must be executable by service_role';
  END IF;

  -- ── 1.3 Assert Zero Rows in All 11 Legacy Tables ───────────────────────────
  FOR v_tbl IN
    SELECT unnest(ARRAY[
      'dilmart_barber_handoff_audit_events',
      'dilmart_barber_handoffs',
      'dilmart_barber_web_sessions',
      'dilmart_customer_handoff_audit_events',
      'dilmart_customer_handoffs',
      'store_cart_items',
      'store_carts',
      'store_federated_refresh_tokens',
      'store_federated_session_audit_events',
      'store_federated_session_families',
      'store_linked_profiles'
    ]) AS tbl_name
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_tbl.tbl_name
    ) THEN
      EXECUTE format('SELECT count(*) FROM public.%I', v_tbl.tbl_name) INTO v_tbl_count;
      IF v_tbl_count > 0 THEN
        RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: Legacy table % contains % rows (must be 0)', v_tbl.tbl_name, v_tbl_count;
      END IF;
    END IF;
  END LOOP;

  -- ── 1.4 Assert Zero Non-Null Data in Target Legacy Columns on Active Tables ─
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'dilmart_barbershop_id') THEN
    SELECT count(*) INTO v_col_non_null FROM public.orders WHERE dilmart_barbershop_id IS NOT NULL;
    IF v_col_non_null > 0 THEN
      RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: orders.dilmart_barbershop_id contains % non-null rows', v_col_non_null;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'dilmart_user_id') THEN
    SELECT count(*) INTO v_col_non_null FROM public.orders WHERE dilmart_user_id IS NOT NULL;
    IF v_col_non_null > 0 THEN
      RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: orders.dilmart_user_id contains % non-null rows', v_col_non_null;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'store_cart_id') THEN
    SELECT count(*) INTO v_col_non_null FROM public.orders WHERE store_cart_id IS NOT NULL;
    IF v_col_non_null > 0 THEN
      RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: orders.store_cart_id contains % non-null rows', v_col_non_null;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'store_linked_profile_id') THEN
    SELECT count(*) INTO v_col_non_null FROM public.orders WHERE store_linked_profile_id IS NOT NULL;
    IF v_col_non_null > 0 THEN
      RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: orders.store_linked_profile_id contains % non-null rows', v_col_non_null;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'checkout_attempts' AND column_name = 'store_cart_id') THEN
    SELECT count(*) INTO v_col_non_null FROM public.checkout_attempts WHERE store_cart_id IS NOT NULL;
    IF v_col_non_null > 0 THEN
      RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: checkout_attempts.store_cart_id contains % non-null rows', v_col_non_null;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'checkout_attempts' AND column_name = 'store_linked_profile_id') THEN
    SELECT count(*) INTO v_col_non_null FROM public.checkout_attempts WHERE store_linked_profile_id IS NOT NULL;
    IF v_col_non_null > 0 THEN
      RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: checkout_attempts.store_linked_profile_id contains % non-null rows', v_col_non_null;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'requires_verified_salon') THEN
    SELECT count(*) INTO v_salon_true_count FROM public.products WHERE requires_verified_salon IS TRUE;
    IF v_salon_true_count > 0 THEN
      RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: products.requires_verified_salon contains % TRUE rows', v_salon_true_count;
    END IF;
  END IF;

  -- ── 1.5 Assert Zero checkout_attempts Rows with NULL user_id ───────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'checkout_attempts') THEN
    SELECT count(*) INTO v_null_user_id_count FROM public.checkout_attempts WHERE user_id IS NULL;
    IF v_null_user_id_count > 0 THEN
      RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: checkout_attempts contains % rows with NULL user_id', v_null_user_id_count;
    END IF;
  END IF;

  -- ── 1.6 Fail-Closed Whitelist Validation of Legacy Functions (19 Names) ─────
  -- Assert that every single function currently existing in the catalog for the
  -- 19 legacy candidate names EXACTLY matches an approved regprocedure identity.
  -- If ANY unexpected function identity or unreviewed overload exists: FAIL CLOSED.
  FOR v_fn IN
    SELECT
      p.oid::regprocedure::text AS ident,
      p.proname AS name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'finalize_barber_handoff',
        'finalize_customer_handoff',
        'logout_all_federated_sessions',
        'logout_federated_session',
        'place_b2b_cart_order_idempotent',
        'provision_dilmart_federated_customer',
        'redeem_and_create_federated_session',
        'redeem_barber_handoff_and_create_session',
        'redeem_customer_handoff',
        'reject_barber_handoff_audit_mutation',
        'reject_handoff_audit_mutation',
        'reject_federated_session_audit_mutation',
        'reject_reserved_federated_email',
        'resolve_dilmart_federated_customer',
        'revoke_barber_web_sessions_for_user',
        'revoke_federated_sessions_for_identity',
        'rotate_federated_refresh_token',
        'validate_federated_session_family',
        'verify_barber_web_session'
      )
  LOOP
    IF v_fn.ident NOT IN (
      -- Whitelist of Approved Live Production & Clean Replay Identities:
      'finalize_barber_handoff(uuid,text,uuid,text,text,text,text,text,text,text,text,text,text,integer,uuid)',
      'finalize_customer_handoff(uuid,uuid,text,text,text,text,boolean,text,text,text,text,text,text,text,integer,text,text,timestamp with time zone,timestamp with time zone,uuid)',
      'logout_all_federated_sessions(text,uuid)',
      'logout_federated_session(text,uuid)',
      'place_b2b_cart_order_idempotent(uuid,text,uuid,uuid,timestamp with time zone,text,text,uuid,text,numeric,numeric,numeric,jsonb,text,text,numeric,uuid,double precision,double precision,text,uuid,numeric,numeric,numeric,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,integer,text,text,text,numeric,uuid,uuid,uuid,uuid,uuid,text,integer,text,text,uuid,uuid,text,text)',
      'provision_dilmart_federated_customer(uuid,text)',
      'redeem_and_create_federated_session(text,text,uuid,uuid,text,uuid,text,uuid,uuid,uuid,uuid,text,uuid)',
      'redeem_barber_handoff_and_create_session(text,text,text,integer)',
      'redeem_customer_handoff(text,text)',
      'reject_barber_handoff_audit_mutation()',
      'reject_handoff_audit_mutation()',
      'reject_federated_session_audit_mutation()',
      'reject_reserved_federated_email()',
      'resolve_dilmart_federated_customer(uuid,text)',
      'revoke_barber_web_sessions_for_user(uuid)',
      'revoke_federated_sessions_for_identity(uuid,uuid,text,uuid)',
      'rotate_federated_refresh_token(text,uuid,text,text,uuid,uuid,uuid,uuid,integer,uuid)',
      'validate_federated_session_family(uuid,integer)',
      'verify_barber_web_session(text)'
    ) THEN
      RAISE EXCEPTION 'STAGE_B_UNEXPECTED_LEGACY_FUNCTION_IDENTITY: Function % with identity [%] is not in the approved whitelist. Aborting migration.',
        v_fn.name, v_fn.ident;
    END IF;
  END LOOP;
END;
$preflight$;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 2: DROP DEPENDENT AUDIT TRIGGERS ON LEGACY TABLES (EXCLUDING AUTH.USERS)
-- ────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_reject_barber_handoff_audit_mutation ON public.dilmart_barber_handoff_audit_events;
DROP TRIGGER IF EXISTS trg_reject_handoff_audit_mutation ON public.dilmart_customer_handoff_audit_events;
DROP TRIGGER IF EXISTS trg_reject_federated_session_audit_mutation ON public.store_federated_session_audit_events;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 3: DROP LEGACY FUNCTIONS BY EXACT APPROVED IDENTITIES (STRICT RESTRICT)
-- ────────────────────────────────────────────────────────────────────────────
-- Explicit DROP of 18 target legacy functions by exact verified signature.
-- Note: public.reject_reserved_federated_email() is DEFERRED to Migration F.
DROP FUNCTION IF EXISTS public.finalize_barber_handoff(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid) RESTRICT;
DROP FUNCTION IF EXISTS public.finalize_customer_handoff(uuid, uuid, text, text, text, text, boolean, text, text, text, text, text, text, text, integer, text, text, timestamp with time zone, timestamp with time zone, uuid) RESTRICT;
DROP FUNCTION IF EXISTS public.logout_all_federated_sessions(text, uuid) RESTRICT;
DROP FUNCTION IF EXISTS public.logout_federated_session(text, uuid) RESTRICT;
DROP FUNCTION IF EXISTS public.place_b2b_cart_order_idempotent(uuid, text, uuid, uuid, timestamp with time zone, text, text, uuid, text, numeric, numeric, numeric, jsonb, text, text, numeric, uuid, double precision, double precision, text, uuid, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, text, text) RESTRICT;
DROP FUNCTION IF EXISTS public.provision_dilmart_federated_customer(uuid, text) RESTRICT;
DROP FUNCTION IF EXISTS public.redeem_and_create_federated_session(text, text, uuid, uuid, text, uuid, text, uuid, uuid, uuid, uuid, text, uuid) RESTRICT;
DROP FUNCTION IF EXISTS public.redeem_barber_handoff_and_create_session(text, text, text, integer) RESTRICT;
DROP FUNCTION IF EXISTS public.redeem_customer_handoff(text, text) RESTRICT;
DROP FUNCTION IF EXISTS public.reject_barber_handoff_audit_mutation() RESTRICT;
DROP FUNCTION IF EXISTS public.reject_handoff_audit_mutation() RESTRICT;
DROP FUNCTION IF EXISTS public.reject_federated_session_audit_mutation() RESTRICT;
DROP FUNCTION IF EXISTS public.resolve_dilmart_federated_customer(uuid, text) RESTRICT;
DROP FUNCTION IF EXISTS public.revoke_barber_web_sessions_for_user(uuid) RESTRICT;
DROP FUNCTION IF EXISTS public.revoke_federated_sessions_for_identity(uuid, uuid, text, uuid) RESTRICT;
DROP FUNCTION IF EXISTS public.rotate_federated_refresh_token(text, uuid, text, text, uuid, uuid, uuid, uuid, integer, uuid) RESTRICT;
DROP FUNCTION IF EXISTS public.validate_federated_session_family(uuid, integer) RESTRICT;
DROP FUNCTION IF EXISTS public.verify_barber_web_session(text) RESTRICT;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 4: RESTORE MODERN INTEGRITY & DROP CONSTRAINTS ON ACTIVE TABLES
-- ────────────────────────────────────────────────────────────────────────────
-- 4.1 checkout_attempts: Restore user_id NOT NULL invariant, drop legacy XOR & FKs
ALTER TABLE public.checkout_attempts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.checkout_attempts DROP CONSTRAINT IF EXISTS chk_checkout_attempts_owner_xor;
ALTER TABLE public.checkout_attempts DROP CONSTRAINT IF EXISTS checkout_attempts_store_cart_id_fkey;
ALTER TABLE public.checkout_attempts DROP CONSTRAINT IF EXISTS checkout_attempts_store_linked_profile_id_fkey;
DROP INDEX IF EXISTS public.idx_checkout_attempts_linked_profile;
DROP INDEX IF EXISTS public.idx_checkout_attempts_store_cart_id;

-- 4.2 orders: Drop legacy FKs and indexes
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_store_cart_id_fkey;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_store_linked_profile_id_fkey;
DROP INDEX IF EXISTS public.idx_orders_dilmart_barbershop_id;
DROP INDEX IF EXISTS public.idx_orders_dilmart_user_id;
DROP INDEX IF EXISTS public.idx_orders_store_cart_id;
DROP INDEX IF EXISTS public.idx_orders_store_linked_profile_id;

-- 4.3 products: Drop legacy index
DROP INDEX IF EXISTS public.idx_products_requires_verified_salon;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 5: DROP TARGET LEGACY COLUMNS FROM ACTIVE TABLES
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.checkout_attempts DROP COLUMN IF EXISTS store_cart_id;
ALTER TABLE public.checkout_attempts DROP COLUMN IF EXISTS store_linked_profile_id;

ALTER TABLE public.orders DROP COLUMN IF EXISTS dilmart_barbershop_id;
ALTER TABLE public.orders DROP COLUMN IF EXISTS dilmart_user_id;
ALTER TABLE public.orders DROP COLUMN IF EXISTS store_cart_id;
ALTER TABLE public.orders DROP COLUMN IF EXISTS store_linked_profile_id;

ALTER TABLE public.products DROP COLUMN IF EXISTS requires_verified_salon;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 6: DROP LEGACY TABLES IN STRICT DEPENDENCY ORDER (STRICT RESTRICT)
-- ────────────────────────────────────────────────────────────────────────────
-- 6.1 Child audit, token, and items tables
DROP TABLE IF EXISTS public.dilmart_barber_handoff_audit_events;
DROP TABLE IF EXISTS public.dilmart_customer_handoff_audit_events;
DROP TABLE IF EXISTS public.store_federated_session_audit_events;
DROP TABLE IF EXISTS public.store_federated_refresh_tokens;
DROP TABLE IF EXISTS public.store_cart_items;

-- 6.2 Session, handoff, and cart tables
DROP TABLE IF EXISTS public.dilmart_barber_web_sessions;
DROP TABLE IF EXISTS public.dilmart_barber_handoffs;
DROP TABLE IF EXISTS public.dilmart_customer_handoffs;
DROP TABLE IF EXISTS public.store_federated_session_families;
DROP TABLE IF EXISTS public.store_carts;

-- 6.3 Root linked profile table
DROP TABLE IF EXISTS public.store_linked_profiles;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 7: FAIL-CLOSED POSTCONDITION CATALOG ASSERTIONS
-- ────────────────────────────────────────────────────────────────────────────
DO $postconditions$
DECLARE
  v_remaining_fn_count  INT;
  v_remaining_tbl_count INT;
  v_tbl                 RECORD;
  v_po_count            INT;
  v_po_rec              RECORD;
  v_poi_count           INT;
  v_poi_rec             RECORD;
  v_is_nullable         TEXT;
  v_auth_guard_count    INT;
  c_po_expected_args    CONSTANT TEXT := 'p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric, p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid, p_latitude double precision, p_longitude double precision, p_map_url text, p_points_spent integer, p_points_discount numeric, p_points_earned integer, p_merchant_id uuid, p_payment_method text, p_merchant_notes text, p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric, p_platform_commission_type text, p_platform_commission_rate numeric, p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric, p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric, p_merchant_gross_amount numeric, p_merchant_net_amount numeric, p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric, p_currency_code text, p_financial_snapshot_version integer, p_payment_status text, p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric, p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid, p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text, p_commercial_snapshot_version integer, p_channel text';
  c_poi_expected_args   CONSTANT TEXT := 'p_checkout_attempt_id uuid, p_checkout_request_hash text, p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric, p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid, p_latitude double precision, p_longitude double precision, p_map_url text, p_points_spent integer, p_points_discount numeric, p_points_earned integer, p_merchant_id uuid, p_payment_method text, p_merchant_notes text, p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric, p_platform_commission_type text, p_platform_commission_rate numeric, p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric, p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric, p_merchant_gross_amount numeric, p_merchant_net_amount numeric, p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric, p_currency_code text, p_financial_snapshot_version integer, p_payment_status text, p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric, p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid, p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text, p_commercial_snapshot_version integer, p_channel text';
BEGIN
  -- ── 7.1 Verify Zero Target Legacy Functions Remain (18 target functions) ────
  SELECT count(*) INTO v_remaining_fn_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'finalize_barber_handoff',
      'finalize_customer_handoff',
      'logout_all_federated_sessions',
      'logout_federated_session',
      'place_b2b_cart_order_idempotent',
      'provision_dilmart_federated_customer',
      'redeem_and_create_federated_session',
      'redeem_barber_handoff_and_create_session',
      'redeem_customer_handoff',
      'reject_barber_handoff_audit_mutation',
      'reject_handoff_audit_mutation',
      'reject_federated_session_audit_mutation',
      'resolve_dilmart_federated_customer',
      'revoke_barber_web_sessions_for_user',
      'revoke_federated_sessions_for_identity',
      'rotate_federated_refresh_token',
      'validate_federated_session_family',
      'verify_barber_web_session'
    );

  IF v_remaining_fn_count <> 0 THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: % legacy functions still exist in public schema', v_remaining_fn_count;
  END IF;

  -- ── 7.2 Verify Zero Legacy Tables Remain ───────────────────────────────────
  SELECT count(*) INTO v_remaining_tbl_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'dilmart_barber_handoff_audit_events',
      'dilmart_barber_handoffs',
      'dilmart_barber_web_sessions',
      'dilmart_customer_handoff_audit_events',
      'dilmart_customer_handoffs',
      'store_cart_items',
      'store_carts',
      'store_federated_refresh_tokens',
      'store_federated_session_audit_events',
      'store_federated_session_families',
      'store_linked_profiles'
    );

  IF v_remaining_tbl_count <> 0 THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: % legacy tables still exist in public schema', v_remaining_tbl_count;
  END IF;

  -- ── 7.3 Verify Zero Target Legacy Columns Remain ───────────────────────────
  FOR v_tbl IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'products' AND column_name = 'requires_verified_salon')
        OR (table_name = 'orders' AND column_name IN ('dilmart_barbershop_id', 'dilmart_user_id', 'store_cart_id', 'store_linked_profile_id'))
        OR (table_name = 'checkout_attempts' AND column_name IN ('store_cart_id', 'store_linked_profile_id'))
      )
  LOOP
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: Legacy column %.% still exists in schema', v_tbl.table_name, v_tbl.column_name;
  END LOOP;

  -- ── 7.4 Verify checkout_attempts.user_id is NOT NULL ───────────────────────
  SELECT is_nullable INTO v_is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'checkout_attempts'
    AND column_name = 'user_id';

  IF v_is_nullable <> 'NO' THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: checkout_attempts.user_id must be NOT NULL (found %)', v_is_nullable;
  END IF;

  -- ── 7.5 Verify auth.users Guard Function is Preserved for Migration F ───────
  SELECT count(*) INTO v_auth_guard_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'reject_reserved_federated_email';

  IF v_auth_guard_count <> 1 THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.reject_reserved_federated_email must remain intact for Migration F';
  END IF;

  -- ── 7.6 Re-Verify Pristine Modern place_order Authority ───────────────────
  SELECT count(*) INTO v_po_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_po_count <> 1 THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order count must be exactly 1';
  END IF;

  SELECT
    p.oid,
    p.pronargs,
    p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner_name,
    p.proconfig,
    pg_get_function_identity_arguments(p.oid) AS identity_args
  INTO v_po_rec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_po_rec.pronargs <> 49 THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order must have exactly 49 arguments (found %)', v_po_rec.pronargs;
  END IF;

  IF v_po_rec.owner_name <> 'postgres' OR v_po_rec.prosecdef IS NOT TRUE THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order owner=[%] (expected postgres), prosecdef=[%] (expected true)', v_po_rec.owner_name, v_po_rec.prosecdef;
  END IF;

  IF v_po_rec.proconfig IS NULL OR NOT (array_to_string(v_po_rec.proconfig, ',') ~* 'search_path=public,\s*pg_temp') THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order search_path not pinned to public, pg_temp (found %)', v_po_rec.proconfig;
  END IF;

  IF v_po_rec.identity_args <> c_po_expected_args THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order identity arguments altered during Migration B';
  END IF;

  -- ── 7.7 Re-Verify Pristine place_order_idempotent Authority ────────────────
  SELECT count(*) INTO v_poi_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_idempotent';

  IF v_poi_count <> 1 THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order_idempotent count must be exactly 1 (found %)', v_poi_count;
  END IF;

  SELECT
    p.oid,
    p.pronargs,
    p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner_name,
    p.proconfig,
    pg_get_function_identity_arguments(p.oid) AS identity_args
  INTO v_poi_rec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_idempotent';

  IF v_poi_rec.pronargs <> 51 THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order_idempotent must have exactly 51 arguments (found %)', v_poi_rec.pronargs;
  END IF;

  IF v_poi_rec.owner_name <> 'postgres' OR v_poi_rec.prosecdef IS NOT TRUE THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order_idempotent owner=[%] (expected postgres), prosecdef=[%] (expected true)', v_poi_rec.owner_name, v_poi_rec.prosecdef;
  END IF;

  IF v_poi_rec.identity_args <> c_poi_expected_args THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order_idempotent identity arguments altered during Migration B';
  END IF;
END;
$postconditions$;

COMMIT;
