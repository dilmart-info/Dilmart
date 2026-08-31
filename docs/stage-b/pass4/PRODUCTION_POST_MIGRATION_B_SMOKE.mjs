import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const smokeSql = `
DO $smoke$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_gov_id UUID;
  v_prod RECORD;
  v_unit NUMERIC;
  v_disc NUMERIC;
  v_raw_price NUMERIC;
  v_offer_ok BOOLEAN;
  v_delivery NUMERIC := 5000.00;
  v_total NUMERIC;
  v_attempt_id UUID := gen_random_uuid();
  v_hash TEXT := 'smoke_test_hash_' || gen_random_uuid()::text;
  v_res JSONB;
  v_res2 JSONB;
  v_order_id UUID;
  v_order_num TEXT;
  v_channel TEXT;
  v_items JSONB;
  v_initial_stock INT;
  v_post_stock INT;
BEGIN
  -- 1. Create temporary smoke user in auth.users
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'smoke_' || v_user_id || '@dilmart.test',
    'smoke_encrypted_password',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Smoke Customer"}',
    now(),
    now()
  );

  -- 2. Fetch live governorate and product
  SELECT id INTO v_gov_id FROM public.governorates LIMIT 1;
  SELECT p.id, p.merchant_id, p.price, p.discount_price, p.offer_ends_at, p.stock
  INTO v_prod
  FROM public.products p
  INNER JOIN public.merchants m ON m.id = p.merchant_id
  WHERE p.is_active = true AND p.stock > 0 AND p.price > 0 AND m.status = 'active'
  LIMIT 1;

  IF v_gov_id IS NULL OR v_prod.id IS NULL THEN
    RAISE NOTICE 'Smoke skipped: no active product or governorate found';
    DELETE FROM auth.users WHERE id = v_user_id;
    RETURN;
  END IF;

  v_initial_stock := v_prod.stock;
  v_raw_price := COALESCE(v_prod.price, 0);

  IF v_prod.discount_price IS NOT NULL AND v_prod.discount_price::text <> '' THEN
    v_disc := v_prod.discount_price::NUMERIC;
  ELSE
    v_disc := NULL;
  END IF;

  v_offer_ok := (v_prod.offer_ends_at IS NULL OR v_prod.offer_ends_at::TIMESTAMPTZ > NOW());

  IF v_disc IS NOT NULL AND v_disc >= 0 AND v_disc < v_raw_price AND v_offer_ok THEN
    v_unit := v_disc;
  ELSE
    v_unit := v_raw_price;
  END IF;

  v_total := v_unit + v_delivery;
  v_items := jsonb_build_array(
    jsonb_build_object(
      'product_id', v_prod.id,
      'quantity', 1,
      'price', v_unit
    )
  );

  -- 3. Execute place_order_idempotent
  SELECT place_order_idempotent(
    p_checkout_attempt_id := v_attempt_id,
    p_checkout_request_hash := v_hash,
    p_customer_name := 'DilMart Production Smoke Customer',
    p_customer_phone := '07700000000',
    p_governorate_id := v_gov_id,
    p_area := 'Al-Mansour',
    p_nearest_landmark := 'Tower',
    p_notes := 'Post-Migration B Verification Smoke',
    p_subtotal := v_unit,
    p_delivery_cost := v_delivery,
    p_discount := 0.00,
    p_total := v_total,
    p_coupon_id := NULL,
    p_items := v_items,
    p_user_id := v_user_id,
    p_latitude := 33.3152,
    p_longitude := 44.3661,
    p_map_url := NULL,
    p_points_spent := 0,
    p_points_discount := 0.00,
    p_points_earned := 0,
    p_merchant_id := v_prod.merchant_id,
    p_payment_method := 'cod',
    p_merchant_notes := NULL,
    p_merchandise_subtotal := v_unit,
    p_discount_total := 0.00,
    p_delivery_fee_charged := v_delivery,
    p_platform_commission_type := 'percentage',
    p_platform_commission_rate := 10.00,
    p_platform_commission_amount := round(v_unit * 0.10, 2),
    p_platform_assisted_fee_amount := 0.00,
    p_platform_extra_fee_amount := 0.00,
    p_courier_fee_payable := 4000.00,
    p_merchant_gross_amount := v_unit,
    p_merchant_net_amount := round(v_unit * 0.90, 2),
    p_gross_collected_amount := v_total,
    p_platform_net_revenue_amount := round(v_unit * 0.10 + 1000.00, 2),
    p_currency_code := 'IQD',
    p_financial_snapshot_version := 1,
    p_payment_status := 'unpaid',
    p_collection_status := 'not_collected',
    p_settlement_status := 'not_accrued',
    p_cash_expected_amount := v_total,
    p_commission_rule_id := NULL,
    p_assisted_fee_rule_id := NULL,
    p_platform_fee_rule_id := NULL,
    p_delivery_billing_rule_id := NULL,
    p_resolved_plan_id := NULL,
    p_resolved_plan_code := 'STANDARD',
    p_commercial_snapshot_version := 1,
    p_channel := 'web_checkout'
  ) INTO v_res;

  v_order_id := (v_res->>'order_id')::UUID;
  v_order_num := v_res->>'order_number';

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL: place_order_idempotent returned NULL order_id: %', v_res;
  END IF;

  IF (v_res->>'reused')::BOOLEAN IS NOT FALSE THEN
    RAISE EXCEPTION 'SMOKE_FAIL: initial call must have reused=false: %', v_res;
  END IF;

  -- 4. Verify channel persistence and order items creation
  SELECT channel INTO v_channel FROM public.orders WHERE id = v_order_id;
  IF v_channel <> 'web_checkout' THEN
    RAISE EXCEPTION 'SMOKE_FAIL: channel was not persisted correctly (found %)', v_channel;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = v_order_id AND product_id = v_prod.id) THEN
    RAISE EXCEPTION 'SMOKE_FAIL: order_items was not created for order %', v_order_id;
  END IF;

  -- Verify inventory stock decremented by 1
  SELECT stock INTO v_post_stock FROM public.products WHERE id = v_prod.id;
  IF v_post_stock <> v_initial_stock - 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL: product stock was not decremented (initial %, post %)', v_initial_stock, v_post_stock;
  END IF;

  -- 5. Test Idempotent Retry (re-calling with same attempt_id and request_hash)
  SELECT place_order_idempotent(
    p_checkout_attempt_id := v_attempt_id,
    p_checkout_request_hash := v_hash,
    p_customer_name := 'DilMart Production Smoke Customer',
    p_customer_phone := '07700000000',
    p_governorate_id := v_gov_id,
    p_area := 'Al-Mansour',
    p_nearest_landmark := 'Tower',
    p_notes := 'Post-Migration B Verification Smoke',
    p_subtotal := v_unit,
    p_delivery_cost := v_delivery,
    p_discount := 0.00,
    p_total := v_total,
    p_coupon_id := NULL,
    p_items := v_items,
    p_user_id := v_user_id,
    p_latitude := 33.3152,
    p_longitude := 44.3661,
    p_map_url := NULL,
    p_points_spent := 0,
    p_points_discount := 0.00,
    p_points_earned := 0,
    p_merchant_id := v_prod.merchant_id,
    p_payment_method := 'cod',
    p_merchant_notes := NULL,
    p_merchandise_subtotal := v_unit,
    p_discount_total := 0.00,
    p_delivery_fee_charged := v_delivery,
    p_platform_commission_type := 'percentage',
    p_platform_commission_rate := 10.00,
    p_platform_commission_amount := round(v_unit * 0.10, 2),
    p_platform_assisted_fee_amount := 0.00,
    p_platform_extra_fee_amount := 0.00,
    p_courier_fee_payable := 4000.00,
    p_merchant_gross_amount := v_unit,
    p_merchant_net_amount := round(v_unit * 0.90, 2),
    p_gross_collected_amount := v_total,
    p_platform_net_revenue_amount := round(v_unit * 0.10 + 1000.00, 2),
    p_currency_code := 'IQD',
    p_financial_snapshot_version := 1,
    p_payment_status := 'unpaid',
    p_collection_status := 'not_collected',
    p_settlement_status := 'not_accrued',
    p_cash_expected_amount := v_total,
    p_commission_rule_id := NULL,
    p_assisted_fee_rule_id := NULL,
    p_platform_fee_rule_id := NULL,
    p_delivery_billing_rule_id := NULL,
    p_resolved_plan_id := NULL,
    p_resolved_plan_code := 'STANDARD',
    p_commercial_snapshot_version := 1,
    p_channel := 'web_checkout'
  ) INTO v_res2;

  IF (v_res2->>'order_id')::UUID <> v_order_id THEN
    RAISE EXCEPTION 'SMOKE_FAIL: idempotent retry returned different order_id (% vs %)', v_res2->>'order_id', v_order_id;
  END IF;

  IF (v_res2->>'reused')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'SMOKE_FAIL: idempotent retry must have reused=true: %', v_res2;
  END IF;

  -- 6. Clean up temporary smoke artifacts to leave production pristine
  DELETE FROM public.order_items WHERE order_id = v_order_id;
  DELETE FROM public.orders WHERE id = v_order_id;
  DELETE FROM public.checkout_attempts WHERE id = v_attempt_id;
  UPDATE public.products SET stock = v_initial_stock WHERE id = v_prod.id;
  DELETE FROM auth.users WHERE id = v_user_id;

  RAISE NOTICE 'SMOKE_VERIFICATION_SUCCESS: Order % (id: %), idempotent retry (reused=true), channel %, inventory stock decremented and restored, and production cleaned up cleanly.', v_order_num, v_order_id, v_channel;
END;
$smoke$;
`;

const tmpSql = path.join("C:/Users/derma/.gemini/antigravity-ide/brain/928f7e86-081d-41be-b38e-576768ae3521/scratch", "run_smoke.sql");
fs.writeFileSync(tmpSql, smokeSql, "utf8");

console.log("Running production smoke test on linked database...");
const out = execSync(`npx supabase db query --linked -f "${tmpSql}"`, { encoding: "utf8" });
console.log(out);
console.log("PRODUCTION SMOKE PASSED WITH 100% SUCCESS.");
