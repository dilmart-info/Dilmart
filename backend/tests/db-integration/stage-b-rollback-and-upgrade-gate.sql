-- ==============================================================================
-- DILMART — STAGE B PASS 3: DISTINCT IMMEDIATE PRE-A & ROLLBACK RESTORATION GATE
-- ==============================================================================

-- ── 1. PRE-A STATE & AUTHORITY SNAPSHOT VERIFICATION ──────────────────────────
DO $pre_a_state_gate$
DECLARE
  v_po_count INT;
  v_poi_count INT;
  v_po_rec RECORD;
  v_poi_rec RECORD;
  v_expected_old_identity TEXT := 'p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric, p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid, p_latitude double precision, p_longitude double precision, p_map_url text, p_points_spent integer, p_points_discount numeric, p_points_earned integer, p_merchant_id uuid, p_payment_method text, p_merchant_notes text, p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric, p_platform_commission_type text, p_platform_commission_rate numeric, p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric, p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric, p_merchant_gross_amount numeric, p_merchant_net_amount numeric, p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric, p_currency_code text, p_financial_snapshot_version integer, p_payment_status text, p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric, p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid, p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text, p_commercial_snapshot_version integer, p_source_app text, p_channel text, p_store_linked_profile_id uuid, p_dilmart_user_id uuid, p_dilmart_barbershop_id uuid, p_segment text, p_business_type text';
  v_expected_idempotent_identity TEXT := 'p_checkout_attempt_id uuid, p_checkout_request_hash text, p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric, p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid, p_latitude double precision, p_longitude double precision, p_map_url text, p_points_spent integer, p_points_discount numeric, p_points_earned integer, p_merchant_id uuid, p_payment_method text, p_merchant_notes text, p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric, p_platform_commission_type text, p_platform_commission_rate numeric, p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric, p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric, p_merchant_gross_amount numeric, p_merchant_net_amount numeric, p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric, p_currency_code text, p_financial_snapshot_version integer, p_payment_status text, p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric, p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid, p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text, p_commercial_snapshot_version integer, p_channel text';
BEGIN
  -- 1. Assert exactly 1 public.place_order function with 55 args
  SELECT count(*) INTO v_po_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_po_count <> 1 THEN
    RAISE EXCEPTION 'PRE-A GATE FAILED: Expected exactly 1 public.place_order, found %', v_po_count;
  END IF;

  SELECT
    p.oid,
    p.pronargs,
    pg_get_function_identity_arguments(p.oid) AS identity_args,
    p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner_name,
    p.proconfig
  INTO v_po_rec
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_po_rec.pronargs <> 55 THEN
    RAISE EXCEPTION 'PRE-A GATE FAILED: Expected 55 args on public.place_order, found %', v_po_rec.pronargs;
  END IF;

  IF v_po_rec.identity_args <> v_expected_old_identity THEN
    RAISE EXCEPTION 'PRE-A GATE FAILED: public.place_order identity [%] does not match reviewed pre-A authority [%]', v_po_rec.identity_args, v_expected_old_identity;
  END IF;

  IF NOT v_po_rec.prosecdef THEN
    RAISE EXCEPTION 'PRE-A GATE FAILED: public.place_order is not SECURITY DEFINER';
  END IF;

  IF v_po_rec.owner_name <> 'postgres' THEN
    RAISE EXCEPTION 'PRE-A GATE FAILED: public.place_order owner [%] is not postgres', v_po_rec.owner_name;
  END IF;

  IF NOT has_function_privilege('service_role', v_po_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRE-A GATE FAILED: service_role lacks EXECUTE on public.place_order';
  END IF;
  IF has_function_privilege('anon', v_po_rec.oid, 'EXECUTE') OR has_function_privilege('authenticated', v_po_rec.oid, 'EXECUTE') OR has_function_privilege('public', v_po_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRE-A GATE FAILED: Non-service-role role has EXECUTE on public.place_order';
  END IF;

  -- 2. Assert exactly 1 public.place_order_idempotent function with 51 args
  SELECT count(*) INTO v_poi_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_idempotent';

  IF v_poi_count <> 1 THEN
    RAISE EXCEPTION 'PRE-A GATE FAILED: Expected exactly 1 public.place_order_idempotent, found %', v_poi_count;
  END IF;

  SELECT
    p.oid,
    p.pronargs,
    pg_get_function_identity_arguments(p.oid) AS identity_args,
    p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner_name,
    p.proconfig
  INTO v_poi_rec
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_idempotent';

  IF v_poi_rec.pronargs <> 51 THEN
    RAISE EXCEPTION 'PRE-A GATE FAILED: Expected 51 args on public.place_order_idempotent, found %', v_poi_rec.pronargs;
  END IF;

  IF v_poi_rec.identity_args <> v_expected_idempotent_identity THEN
    RAISE EXCEPTION 'PRE-A GATE FAILED: public.place_order_idempotent identity [%] does not match expected [%]', v_poi_rec.identity_args, v_expected_idempotent_identity;
  END IF;

  IF NOT v_poi_rec.prosecdef THEN
    RAISE EXCEPTION 'PRE-A GATE FAILED: public.place_order_idempotent is not SECURITY DEFINER';
  END IF;

  IF v_poi_rec.owner_name <> 'postgres' THEN
    RAISE EXCEPTION 'PRE-A GATE FAILED: public.place_order_idempotent owner [%] is not postgres', v_poi_rec.owner_name;
  END IF;

  IF NOT has_function_privilege('service_role', v_poi_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRE-A GATE FAILED: service_role lacks EXECUTE on public.place_order_idempotent';
  END IF;
  IF has_function_privilege('anon', v_poi_rec.oid, 'EXECUTE') OR has_function_privilege('authenticated', v_poi_rec.oid, 'EXECUTE') OR has_function_privilege('public', v_poi_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRE-A GATE FAILED: Non-service-role role has EXECUTE on public.place_order_idempotent';
  END IF;
END;
$pre_a_state_gate$;

-- ── 2. REAL FORCED-FAILURE ROLLBACK PROOF (PL/pgSQL SUBTRANSACTION) ───────────
DO $forced_failure_test$
BEGIN
  -- Perform rename inside anonymous block, then deliberately raise exception
  -- to trigger an automatic subtransaction abort and rollback.
  BEGIN
    ALTER FUNCTION public.place_order(
      text, text, uuid, text, text, text, numeric, numeric, numeric, numeric,
      uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid,
      text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric,
      numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text,
      numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text,
      uuid, uuid, uuid, text, text
    ) RENAME TO place_order_legacy_stageb;

    -- Forced failure immediately after rename
    RAISE EXCEPTION 'STAGE_B_TEST_FORCED_FAILURE';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%STAGE_B_TEST_FORCED_FAILURE%' THEN
        RAISE;
      END IF;
      -- Sub-transaction rolled back cleanly
  END;
END;
$forced_failure_test$;

-- ── 3. ASSERT COMPLETE RESTORATION AFTER FORCED-FAILURE ROLLBACK ──────────────
DO $post_rollback_gate$
DECLARE
  v_po_count INT;
  v_legacy_count INT;
  v_partial_49_count INT;
  v_poi_count INT;
  v_po_rec RECORD;
  v_poi_rec RECORD;
  v_expected_old_identity TEXT := 'p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric, p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid, p_latitude double precision, p_longitude double precision, p_map_url text, p_points_spent integer, p_points_discount numeric, p_points_earned integer, p_merchant_id uuid, p_payment_method text, p_merchant_notes text, p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric, p_platform_commission_type text, p_platform_commission_rate numeric, p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric, p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric, p_merchant_gross_amount numeric, p_merchant_net_amount numeric, p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric, p_currency_code text, p_financial_snapshot_version integer, p_payment_status text, p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric, p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid, p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text, p_commercial_snapshot_version integer, p_source_app text, p_channel text, p_store_linked_profile_id uuid, p_dilmart_user_id uuid, p_dilmart_barbershop_id uuid, p_segment text, p_business_type text';
  v_expected_idempotent_identity TEXT := 'p_checkout_attempt_id uuid, p_checkout_request_hash text, p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric, p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid, p_latitude double precision, p_longitude double precision, p_map_url text, p_points_spent integer, p_points_discount numeric, p_points_earned integer, p_merchant_id uuid, p_payment_method text, p_merchant_notes text, p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric, p_platform_commission_type text, p_platform_commission_rate numeric, p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric, p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric, p_merchant_gross_amount numeric, p_merchant_net_amount numeric, p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric, p_currency_code text, p_financial_snapshot_version integer, p_payment_status text, p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric, p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid, p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text, p_commercial_snapshot_version integer, p_channel text';
BEGIN
  -- 1. Assert exactly 1 place_order exists after rollback
  SELECT count(*) INTO v_po_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_po_count <> 1 THEN
    RAISE EXCEPTION 'ROLLBACK RESTORATION FAILED: Expected exactly 1 public.place_order after rollback, found %', v_po_count;
  END IF;

  -- 2. Inspect restored place_order attributes
  SELECT
    p.oid,
    p.pronargs,
    pg_get_function_identity_arguments(p.oid) AS identity_args,
    p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner_name,
    p.proconfig
  INTO v_po_rec
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_po_rec.pronargs <> 55 THEN
    RAISE EXCEPTION 'ROLLBACK RESTORATION FAILED: Expected 55 args on public.place_order after rollback, found %', v_po_rec.pronargs;
  END IF;

  IF v_po_rec.identity_args <> v_expected_old_identity THEN
    RAISE EXCEPTION 'ROLLBACK RESTORATION FAILED: public.place_order identity [%] does not match original [%]', v_po_rec.identity_args, v_expected_old_identity;
  END IF;

  IF NOT v_po_rec.prosecdef THEN
    RAISE EXCEPTION 'ROLLBACK RESTORATION FAILED: public.place_order is not SECURITY DEFINER after rollback';
  END IF;

  IF v_po_rec.owner_name <> 'postgres' THEN
    RAISE EXCEPTION 'ROLLBACK RESTORATION FAILED: public.place_order owner [%] is not postgres after rollback', v_po_rec.owner_name;
  END IF;

  IF NOT has_function_privilege('service_role', v_po_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'ROLLBACK RESTORATION FAILED: service_role lacks EXECUTE on public.place_order after rollback';
  END IF;
  IF has_function_privilege('anon', v_po_rec.oid, 'EXECUTE') OR has_function_privilege('authenticated', v_po_rec.oid, 'EXECUTE') OR has_function_privilege('public', v_po_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'ROLLBACK RESTORATION FAILED: Non-service-role role has EXECUTE on public.place_order after rollback';
  END IF;

  -- 3. Assert temporary legacy function does NOT exist
  SELECT count(*) INTO v_legacy_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_legacy_stageb';

  IF v_legacy_count <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK RESTORATION FAILED: Temporary legacy function place_order_legacy_stageb exists after rollback, count %', v_legacy_count;
  END IF;

  -- 4. Assert NO partial 49-arg function exists
  SELECT count(*) INTO v_partial_49_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order' AND p.pronargs = 49;

  IF v_partial_49_count <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK RESTORATION FAILED: Partial 49-arg place_order function exists after rollback, count %', v_partial_49_count;
  END IF;

  -- 5. Assert place_order_idempotent remains singular and untouched
  SELECT count(*) INTO v_poi_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_idempotent';

  IF v_poi_count <> 1 THEN
    RAISE EXCEPTION 'ROLLBACK RESTORATION FAILED: Expected exactly 1 public.place_order_idempotent after rollback, found %', v_poi_count;
  END IF;

  SELECT
    p.oid,
    p.pronargs,
    pg_get_function_identity_arguments(p.oid) AS identity_args,
    p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner_name,
    p.proconfig
  INTO v_poi_rec
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_idempotent';

  IF v_poi_rec.pronargs <> 51 THEN
    RAISE EXCEPTION 'ROLLBACK RESTORATION FAILED: Expected 51 args on public.place_order_idempotent after rollback, found %', v_poi_rec.pronargs;
  END IF;

  IF v_poi_rec.identity_args <> v_expected_idempotent_identity THEN
    RAISE EXCEPTION 'ROLLBACK RESTORATION FAILED: public.place_order_idempotent identity [%] does not match expected [%] after rollback', v_poi_rec.identity_args, v_expected_idempotent_identity;
  END IF;

  IF NOT v_poi_rec.prosecdef THEN
    RAISE EXCEPTION 'ROLLBACK RESTORATION FAILED: public.place_order_idempotent is not SECURITY DEFINER after rollback';
  END IF;

  IF v_poi_rec.owner_name <> 'postgres' THEN
    RAISE EXCEPTION 'ROLLBACK RESTORATION FAILED: public.place_order_idempotent owner [%] is not postgres after rollback', v_poi_rec.owner_name;
  END IF;

  IF NOT has_function_privilege('service_role', v_poi_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'ROLLBACK RESTORATION FAILED: service_role lacks EXECUTE on public.place_order_idempotent after rollback';
  END IF;
  IF has_function_privilege('anon', v_poi_rec.oid, 'EXECUTE') OR has_function_privilege('authenticated', v_poi_rec.oid, 'EXECUTE') OR has_function_privilege('public', v_poi_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'ROLLBACK RESTORATION FAILED: Non-service-role role has EXECUTE on public.place_order_idempotent after rollback';
  END IF;
END;
$post_rollback_gate$;
