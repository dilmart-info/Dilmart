-- Verification for 20260823010000_fix_cancel_order_atomic_jenni_lookup.sql
-- (DilMart-STORE-CANCEL-ORDER-JENNI-LOOKUP-001).
--
-- This EXECUTES PostgreSQL against a real schema. That matters: the defect it covers —
--   record "v_order" has no field "provider_shipment_id"
-- is a RUNTIME plpgsql RECORD-field error. It cannot be caught by a pure-JS test that never runs
-- the function, which is exactly why backend/tests/order-cancellation-atomic.test.mjs missed a
-- defect that broke every merchant rejection in Production.
--
-- Proves:
--   * public.orders does NOT own provider_shipment_id / dispatch_status; order_delivery_integrations does;
--   * with no Jenni integration row, cancellation succeeds;
--   * a merchant rejection moves new + pending to cancelled + rejected;
--   * a failed integration with no shipment id still allows cancellation;
--   * a populated provider_shipment_id raises JENNI_SHIPMENT_DISPATCHED and changes nothing;
--   * dispatch_status = 'dispatched' raises JENNI_SHIPMENT_DISPATCHED and changes nothing;
--   * merchant scope mismatch still fails;
--   * a non-new / non-pending order still fails the merchant CAS;
--   * idempotent replay still returns the recorded result without re-cancelling;
--   * a merchant actor with NO explicit merchant scope is refused, changing nothing;
--   * a merchant actor with the correct scope still succeeds, with the wrong scope still fails;
--   * a customer cancels only their own order: the correct id succeeds, a NULL id and another
--     account's id are both refused with no side effects;
--   * customer and merchant cancellations are audited under their own actor_type;
--   * the carrier block applies to the customer path too;
--   * EXECUTE remains service_role-only.
--
-- Everything runs inside a transaction that always ROLLBACKs, so nothing is persisted. A passing
-- run emits a NOTICE and exits 0; a failing run RAISEs and, with ON_ERROR_STOP=1, exits non-zero.
-- Unexpected SQL errors are recorded as failures, never silently counted as denials.
--
-- Run against a LOCAL / ephemeral database only — never Production: it creates fixture rows.
--   docker cp backend/scripts/verify-cancel-order-atomic-jenni-lookup.sql <db>:/tmp/v.sql
--   docker exec <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/v.sql
BEGIN;

-- Builds a fresh cancellable order (status new, merchant decision pending, one item) so each case
-- starts from an identical, realistic state. Created in pg_temp inside the transaction, so the
-- terminal ROLLBACK removes it along with every fixture row.
CREATE FUNCTION pg_temp.new_cancellable_order(
  p_merchant UUID,
  p_product  UUID,
  p_suffix   TEXT,
  p_case     TEXT
) RETURNS UUID LANGUAGE plpgsql AS $helper$
DECLARE
  v_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO public.orders
    (id, order_number, customer_name, customer_phone, area, subtotal, delivery_cost, total,
     merchant_id, status, merchant_decision_status)
  VALUES
    (v_id, 'VER-' || p_case || '-' || left(p_suffix, 10), 'Verify Customer', '07700000000',
     'المنصور', 10000, 0, 10000, p_merchant, 'new', 'pending');

  INSERT INTO public.order_items (order_id, product_id, product_name, price, quantity, merchant_id)
  VALUES (v_id, p_product, 'Verify Product', 10000, 2, p_merchant);

  RETURN v_id;
END
$helper$;

DO $verify$
DECLARE
  v_results JSONB := '[]'::jsonb;
  v_pass INT := 0;
  v_fail INT := 0;
  v_merchant   UUID := gen_random_uuid();
  v_merchant_b UUID := gen_random_uuid();
  v_product    UUID := gen_random_uuid();
  v_order      UUID;
  v_res        JSONB;
  v_errm       TEXT;
  v_status     TEXT;
  v_decision   TEXT;
  v_count      INT;
  v_stock      INT;
  v_outbox_before INT;
  v_customer       UUID := gen_random_uuid();
  v_other_customer UUID := gen_random_uuid();
  v_suffix     TEXT := replace(gen_random_uuid()::text, '-', '');
BEGIN
  ------------------------------------------------------------------- fixtures
  INSERT INTO public.merchants (id, slug, name_ar, name_en, display_name)
  VALUES (v_merchant,   'verify-a-' || left(v_suffix, 8), 'تاجر أ', 'Verify Merchant A', 'Verify Merchant A'),
         (v_merchant_b, 'verify-b-' || left(v_suffix, 8), 'تاجر ب', 'Verify Merchant B', 'Verify Merchant B');

  -- orders.user_id is a real FK to auth.users, so the customer fixtures need actual Auth rows.
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_customer,       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'verify-c1-' || left(v_suffix, 8) || '@example.invalid',
          encode(sha256(gen_random_uuid()::text::bytea), 'hex'), '{}'::jsonb, '{}'::jsonb, now(), now()),
         (v_other_customer, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'verify-c2-' || left(v_suffix, 8) || '@example.invalid',
          encode(sha256(gen_random_uuid()::text::bytea), 'hex'), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.products (id, name, slug, price, merchant_id, stock, sold_count)
  VALUES (v_product, 'Verify Product', 'verify-product-' || left(v_suffix, 8), 10000, v_merchant, 100, 20);

  ------------------------------------------------------- 01 schema fact: orders owns neither column
  SELECT count(*) INTO v_count
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orders'
     AND column_name IN ('provider_shipment_id', 'dispatch_status');
  SELECT count(*) INTO v_stock
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'order_delivery_integrations'
     AND column_name IN ('provider_shipment_id', 'dispatch_status');
  IF v_count = 0 AND v_stock = 2 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('01 orders owns no carrier columns; order_delivery_integrations owns both: PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array(format('01 schema fact: FAIL orders=%s odi=%s', v_count, v_stock));
  END IF;

  ------------------------------------------------- 02 no Jenni integration: cancellation succeeds
  v_order := pg_temp.new_cancellable_order(v_merchant, v_product, v_suffix, '02');
  BEGIN
    v_res := public.cancel_order_atomic(v_order, 'merchant', NULL, 'out_of_stock', NULL, v_merchant, true, NULL);
    SELECT status, merchant_decision_status INTO v_status, v_decision FROM public.orders WHERE id = v_order;
    IF v_res->>'new_status' = 'cancelled' AND v_status = 'cancelled' AND v_decision = 'rejected' THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('02 no integration row: merchant rejection cancels the order: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('02 no integration: FAIL res=%s status=%s decision=%s', v_res, v_status, v_decision));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('02 no integration raised: FAIL ' || left(v_errm, 90));
  END;

  ------------------------------------------- 03 merchant rejection stamps the decision audit fields
  SELECT count(*) INTO v_count
    FROM public.orders
   WHERE id = v_order AND cancelled_at IS NOT NULL AND merchant_decision_at IS NOT NULL;
  IF v_count = 1 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('03 cancellation and merchant-decision timestamps recorded: PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('03 decision audit fields: FAIL');
  END IF;

  --------------------------------------- 04 failed integration, no shipment id: still cancellable
  v_order := pg_temp.new_cancellable_order(v_merchant, v_product, v_suffix, '04');
  INSERT INTO public.order_delivery_integrations
    (order_id, provider_code, provider_shipment_id, dispatch_status, external_shipment_id, external_shipment_number)
  VALUES (v_order, 'jenni', NULL, 'failed', 'ext-04-' || left(v_suffix, 8), 'num-04-' || left(v_suffix, 8));
  BEGIN
    v_res := public.cancel_order_atomic(v_order, 'merchant', NULL, 'out_of_stock', NULL, v_merchant, true, NULL);
    SELECT status INTO v_status FROM public.orders WHERE id = v_order;
    IF v_res->>'new_status' = 'cancelled' AND v_status = 'cancelled' THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('04 failed dispatch with no shipment id stays cancellable: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('04 failed integration: FAIL status=%s', v_status));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('04 failed integration raised: FAIL ' || left(v_errm, 90));
  END;

  ------------------------------------------- 05 populated shipment id: carrier protection holds
  v_order := pg_temp.new_cancellable_order(v_merchant, v_product, v_suffix, '05');
  INSERT INTO public.order_delivery_integrations
    (order_id, provider_code, provider_shipment_id, dispatch_status, external_shipment_id, external_shipment_number)
  VALUES (v_order, 'jenni', 'JEN-' || left(v_suffix, 8), 'pending', 'ext-05-' || left(v_suffix, 8), 'num-05-' || left(v_suffix, 8));
  BEGIN
    PERFORM public.cancel_order_atomic(v_order, 'merchant', NULL, 'out_of_stock', NULL, v_merchant, true, NULL);
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('05 active shipment refused: FAIL (cancellation succeeded)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    SELECT status, merchant_decision_status INTO v_status, v_decision FROM public.orders WHERE id = v_order;
    IF v_errm LIKE 'JENNI_SHIPMENT_DISPATCHED%' AND v_status = 'new' AND v_decision = 'pending' THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('05 populated shipment id refused, order untouched: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('05 active shipment: FAIL %s status=%s', left(v_errm, 70), v_status));
    END IF;
  END;

  --------------------------- 06 dispatched status with a NULL shipment id: protection still holds
  v_order := pg_temp.new_cancellable_order(v_merchant, v_product, v_suffix, '06');
  INSERT INTO public.order_delivery_integrations
    (order_id, provider_code, provider_shipment_id, dispatch_status, external_shipment_id, external_shipment_number)
  VALUES (v_order, 'jenni', NULL, 'dispatched', 'ext-06-' || left(v_suffix, 8), 'num-06-' || left(v_suffix, 8));
  BEGIN
    PERFORM public.cancel_order_atomic(v_order, 'merchant', NULL, 'out_of_stock', NULL, v_merchant, true, NULL);
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('06 dispatched status refused: FAIL (cancellation succeeded)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    SELECT status INTO v_status FROM public.orders WHERE id = v_order;
    IF v_errm LIKE 'JENNI_SHIPMENT_DISPATCHED%' AND v_status = 'new' THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('06 dispatched status without an id still refused: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('06 dispatched status: FAIL %s status=%s', left(v_errm, 70), v_status));
    END IF;
  END;

  ------------------------------------------------ 07 a blank shipment id must NOT block cancellation
  v_order := pg_temp.new_cancellable_order(v_merchant, v_product, v_suffix, '07');
  INSERT INTO public.order_delivery_integrations
    (order_id, provider_code, provider_shipment_id, dispatch_status, external_shipment_id, external_shipment_number)
  VALUES (v_order, 'jenni', '   ', 'failed', 'ext-07-' || left(v_suffix, 8), 'num-07-' || left(v_suffix, 8));
  BEGIN
    v_res := public.cancel_order_atomic(v_order, 'merchant', NULL, 'out_of_stock', NULL, v_merchant, true, NULL);
    SELECT status INTO v_status FROM public.orders WHERE id = v_order;
    IF v_res->>'new_status' = 'cancelled' AND v_status = 'cancelled' THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('07 whitespace-only shipment id treated as absent: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('07 blank shipment id: FAIL status=%s', v_status));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('07 blank shipment id raised: FAIL ' || left(v_errm, 90));
  END;

  ----------------------------------------------------- 08 merchant scope mismatch still refused
  v_order := pg_temp.new_cancellable_order(v_merchant, v_product, v_suffix, '08');
  BEGIN
    PERFORM public.cancel_order_atomic(v_order, 'merchant', NULL, 'out_of_stock', NULL, v_merchant_b, true, NULL);
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('08 scope mismatch refused: FAIL (cancellation succeeded)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    SELECT status INTO v_status FROM public.orders WHERE id = v_order;
    IF v_errm LIKE 'Merchant scope mismatch%' AND v_status = 'new' THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('08 another merchant cannot cancel this order: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('08 scope mismatch: FAIL %s status=%s', left(v_errm, 70), v_status));
    END IF;
  END;

  ------------------------------------------- 09 merchant CAS: a decided order cannot be re-decided
  UPDATE public.orders SET merchant_decision_status = 'accepted', status = 'preparing' WHERE id = v_order;
  BEGIN
    PERFORM public.cancel_order_atomic(v_order, 'merchant', NULL, 'out_of_stock', NULL, v_merchant, true, NULL);
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('09 merchant CAS refused: FAIL (cancellation succeeded)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    IF v_errm LIKE 'ORDER_DECISION_ALREADY_MADE%' THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('09 already-decided order fails the merchant CAS: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array('09 merchant CAS: FAIL ' || left(v_errm, 80));
    END IF;
  END;

  ------------------------------------------------------- 10 idempotent replay returns the same result
  v_order := pg_temp.new_cancellable_order(v_merchant, v_product, v_suffix, '10');
  BEGIN
    v_res := public.cancel_order_atomic(v_order, 'merchant', NULL, 'out_of_stock', NULL, v_merchant, true, 'idem-' || left(v_suffix, 12));
    SELECT count(*) INTO v_count FROM public.order_cancellation_operations WHERE idempotency_key = 'idem-' || left(v_suffix, 12);
    -- Replaying the SAME key must return the recorded result and must not record a second operation.
    v_res := public.cancel_order_atomic(v_order, 'merchant', NULL, 'out_of_stock', NULL, v_merchant, true, 'idem-' || left(v_suffix, 12));
    SELECT count(*) INTO v_stock FROM public.order_cancellation_operations WHERE idempotency_key = 'idem-' || left(v_suffix, 12);
    IF v_count = 1 AND v_stock = 1 AND v_res->>'new_status' = 'cancelled' THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('10 idempotent replay returns the recorded result exactly once: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('10 idempotency: FAIL first=%s second=%s', v_count, v_stock));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('10 idempotency raised: FAIL ' || left(v_errm, 90));
  END;

  ------------------------------------------------- 11 inventory is returned to stock on cancellation
  SELECT stock INTO v_stock FROM public.products WHERE id = v_product;
  IF v_stock > 100 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array(format('11 inventory reversal still runs (stock %s > initial 100): PASS', v_stock));
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array(format('11 inventory reversal: FAIL stock=%s', v_stock));
  END IF;

  ------------------------- 15 fail closed: merchant actor with no explicit scope is refused
  -- Without this guard p_expected_merchant_id = NULL skips the ownership comparison entirely, so a
  -- merchant-actor call could cancel ANY order. Nothing at all may change when it is refused.
  v_order := pg_temp.new_cancellable_order(v_merchant, v_product, v_suffix, '15');
  SELECT stock INTO v_stock FROM public.products WHERE id = v_product;
  -- Baseline AFTER the order exists: creating an order fires the merchant new-order notification
  -- trigger, so only the delta across the refused call is attributable to the call itself.
  SELECT count(*) INTO v_outbox_before FROM public.notification_outbox WHERE link LIKE '%' || v_order::text || '%';
  BEGIN
    PERFORM public.cancel_order_atomic(v_order, 'merchant', NULL, 'out_of_stock', NULL, NULL, true, NULL);
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('15 merchant with NULL scope refused: FAIL (cancellation succeeded)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    SELECT status, merchant_decision_status INTO v_status, v_decision FROM public.orders WHERE id = v_order;
    SELECT count(*) INTO v_count FROM public.products WHERE id = v_product AND stock = v_stock;
    IF v_errm LIKE 'MERCHANT_SCOPE_REQUIRED%' AND v_status = 'new' AND v_decision = 'pending' AND v_count = 1 THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('15 merchant actor without explicit scope refused, order and stock untouched: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('15 merchant NULL scope: FAIL %s status=%s decision=%s stock_unchanged=%s',
                                                          left(v_errm, 60), v_status, v_decision, v_count));
    END IF;
  END;

  ------------------- 16 the refused call leaves no operation, delivery event or outbox side effect
  SELECT (SELECT count(*) FROM public.order_cancellation_operations WHERE order_id = v_order)
       + (SELECT count(*) FROM public.delivery_events WHERE order_id = v_order)
       + (SELECT count(*) FROM public.notification_outbox WHERE link LIKE '%' || v_order::text || '%')
       - v_outbox_before
    INTO v_count;
  IF v_count = 0 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('16 refused merchant call wrote no operation, delivery event or outbox row: PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array(format('16 refused call side effects: FAIL rows=%s', v_count));
  END IF;

  ------------------------------- 17 merchant WITH the correct explicit scope still succeeds
  BEGIN
    v_res := public.cancel_order_atomic(v_order, 'merchant', NULL, 'out_of_stock', NULL, v_merchant, true, NULL);
    SELECT status, merchant_decision_status INTO v_status, v_decision FROM public.orders WHERE id = v_order;
    IF v_res->>'new_status' = 'cancelled' AND v_status = 'cancelled' AND v_decision = 'rejected' THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('17 merchant with the correct scope still cancels normally: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('17 merchant correct scope: FAIL status=%s decision=%s', v_status, v_decision));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('17 merchant correct scope raised: FAIL ' || left(v_errm, 90));
  END;

  ------------------------------------- 18 merchant with the WRONG explicit scope is still refused
  v_order := pg_temp.new_cancellable_order(v_merchant, v_product, v_suffix, '18');
  BEGIN
    PERFORM public.cancel_order_atomic(v_order, 'merchant', NULL, 'out_of_stock', NULL, v_merchant_b, true, NULL);
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('18 merchant wrong scope refused: FAIL (cancellation succeeded)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    SELECT status INTO v_status FROM public.orders WHERE id = v_order;
    IF v_errm LIKE 'Merchant scope mismatch%' AND v_status = 'new' THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('18 merchant with another merchant''s scope still refused: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('18 merchant wrong scope: FAIL %s status=%s', left(v_errm, 60), v_status));
    END IF;
  END;

  ------------------------------------ 19 customer with the correct actor id cancels successfully
  v_order := pg_temp.new_cancellable_order(v_merchant, v_product, v_suffix, '19');
  UPDATE public.orders SET user_id = v_customer WHERE id = v_order;
  BEGIN
    v_res := public.cancel_order_atomic(v_order, 'customer', v_customer, 'customer_requested_cancellation', NULL, NULL, false, NULL);
    SELECT status INTO v_status FROM public.orders WHERE id = v_order;
    IF v_res->>'new_status' = 'cancelled' AND v_status = 'cancelled' THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('19 customer with the correct actor id cancels: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('19 customer correct id: FAIL status=%s', v_status));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('19 customer correct id raised: FAIL ' || left(v_errm, 90));
  END;

  --------------------------------- 20 the successful customer cancellation is audited truthfully
  SELECT count(*) INTO v_count
    FROM public.delivery_events
   WHERE order_id = v_order AND event_type = 'cancelled' AND actor_type = 'customer';
  IF v_count = 1 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('20 delivery event recorded with actor_type = customer: PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array(format('20 customer delivery event: FAIL rows=%s', v_count));
  END IF;

  --------------------------------------------- 21 customer with a NULL actor id is refused
  v_order := pg_temp.new_cancellable_order(v_merchant, v_product, v_suffix, '21');
  UPDATE public.orders SET user_id = v_customer WHERE id = v_order;
  SELECT stock INTO v_stock FROM public.products WHERE id = v_product;
  SELECT count(*) INTO v_outbox_before FROM public.notification_outbox WHERE link LIKE '%' || v_order::text || '%';
  BEGIN
    PERFORM public.cancel_order_atomic(v_order, 'customer', NULL, 'customer_requested_cancellation', NULL, NULL, false, NULL);
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('21 customer NULL actor id refused: FAIL (cancellation succeeded)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    SELECT status, merchant_decision_status INTO v_status, v_decision FROM public.orders WHERE id = v_order;
    SELECT count(*) INTO v_count FROM public.products WHERE id = v_product AND stock = v_stock;
    IF v_errm LIKE 'CUSTOMER_SCOPE_REQUIRED%' AND v_status = 'new' AND v_decision = 'pending' AND v_count = 1 THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('21 customer without an actor id refused, order and stock untouched: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('21 customer NULL id: FAIL %s status=%s stock_unchanged=%s',
                                                          left(v_errm, 60), v_status, v_count));
    END IF;
  END;

  --------------------------------- 22 customer with the WRONG actor id is refused, no side effects
  BEGIN
    PERFORM public.cancel_order_atomic(v_order, 'customer', v_other_customer, 'customer_requested_cancellation', NULL, NULL, false, NULL);
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('22 customer wrong actor id refused: FAIL (cancellation succeeded)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    SELECT status INTO v_status FROM public.orders WHERE id = v_order;
    SELECT (SELECT count(*) FROM public.order_cancellation_operations WHERE order_id = v_order)
         + (SELECT count(*) FROM public.delivery_events WHERE order_id = v_order)
         + (SELECT count(*) FROM public.notification_outbox WHERE link LIKE '%' || v_order::text || '%')
         - v_outbox_before
      INTO v_count;
    IF v_errm LIKE 'Customer scope mismatch%' AND v_status = 'new' AND v_count = 0 THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('22 a different customer cannot cancel this order, no side effects: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('22 customer wrong id: FAIL %s status=%s side_effects=%s',
                                                          left(v_errm, 55), v_status, v_count));
    END IF;
  END;

  ------------------------------- 23 the customer path is blocked by an active carrier shipment
  v_order := pg_temp.new_cancellable_order(v_merchant, v_product, v_suffix, '23');
  UPDATE public.orders SET user_id = v_customer WHERE id = v_order;
  INSERT INTO public.order_delivery_integrations
    (order_id, provider_code, provider_shipment_id, dispatch_status, external_shipment_id, external_shipment_number)
  VALUES (v_order, 'jenni', 'JEN-C-' || left(v_suffix, 6), 'pending', 'ext-23-' || left(v_suffix, 8), 'num-23-' || left(v_suffix, 8));
  BEGIN
    PERFORM public.cancel_order_atomic(v_order, 'customer', v_customer, 'customer_requested_cancellation', NULL, NULL, false, NULL);
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('23 customer blocked by shipment id: FAIL (cancellation succeeded)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    SELECT status INTO v_status FROM public.orders WHERE id = v_order;
    IF v_errm LIKE 'JENNI_SHIPMENT_DISPATCHED%' AND v_status = 'new' THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('23 customer path blocked by an active shipment id: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('23 customer active shipment: FAIL %s status=%s', left(v_errm, 60), v_status));
    END IF;
  END;

  -------------------------- 24 the customer path is blocked by dispatch_status = dispatched
  v_order := pg_temp.new_cancellable_order(v_merchant, v_product, v_suffix, '24');
  UPDATE public.orders SET user_id = v_customer WHERE id = v_order;
  INSERT INTO public.order_delivery_integrations
    (order_id, provider_code, provider_shipment_id, dispatch_status, external_shipment_id, external_shipment_number)
  VALUES (v_order, 'jenni', NULL, 'dispatched', 'ext-24-' || left(v_suffix, 8), 'num-24-' || left(v_suffix, 8));
  BEGIN
    PERFORM public.cancel_order_atomic(v_order, 'customer', v_customer, 'customer_requested_cancellation', NULL, NULL, false, NULL);
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('24 customer blocked by dispatched status: FAIL (cancellation succeeded)');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_errm = MESSAGE_TEXT;
    SELECT status INTO v_status FROM public.orders WHERE id = v_order;
    IF v_errm LIKE 'JENNI_SHIPMENT_DISPATCHED%' AND v_status = 'new' THEN
      v_pass := v_pass + 1;
      v_results := v_results || jsonb_build_array('24 customer path blocked by dispatched status: PASS');
    ELSE
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_array(format('24 customer dispatched: FAIL %s status=%s', left(v_errm, 60), v_status));
    END IF;
  END;

  ----------------------------- 25 merchant rejection is still audited as actor_type = merchant
  SELECT count(*) INTO v_count
    FROM public.delivery_events
   WHERE event_type = 'cancelled' AND actor_type = 'merchant';
  IF v_count > 0 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('25 merchant rejections recorded with actor_type = merchant: PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('25 merchant delivery event actor: FAIL');
  END IF;

  ------------------- 26 the final constraint admits both new actors and every previous one
  v_count := 0;
  FOREACH v_status IN ARRAY ARRAY['admin', 'delivery_company', 'agent', 'system', 'external_provider', 'merchant', 'customer']
  LOOP
    BEGIN
      INSERT INTO public.delivery_events (order_id, event_type, actor_type, notes, created_at)
      VALUES (v_order, 'note_added', v_status, 'constraint probe', NOW());
      v_count := v_count + 1;
    EXCEPTION WHEN check_violation THEN
      v_results := v_results || jsonb_build_array(format('26 actor_type %s rejected by the constraint', v_status));
    END;
  END LOOP;
  IF v_count = 7 THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('26 all five original actors plus merchant and customer accepted: PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array(format('26 actor constraint coverage: FAIL accepted=%s of 7', v_count));
  END IF;

  ------------------------------------------------------------------- 12 privilege contract
  IF has_function_privilege('service_role', 'public.cancel_order_atomic(uuid,text,uuid,text,text,uuid,boolean,text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.cancel_order_atomic(uuid,text,uuid,text,text,uuid,boolean,text)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.cancel_order_atomic(uuid,text,uuid,text,text,uuid,boolean,text)', 'EXECUTE')
     AND NOT has_function_privilege('public', 'public.cancel_order_atomic(uuid,text,uuid,text,text,uuid,boolean,text)', 'EXECUTE')
  THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('12 service_role-only EXECUTE (PUBLIC/anon/authenticated denied): PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('12 privilege contract: FAIL');
  END IF;

  ------------------------------------------------------- 13 function security properties preserved
  IF (SELECT p.prosecdef AND p.proconfig @> ARRAY['search_path=public'] AND pg_get_userbyid(p.proowner) = 'postgres'
        FROM pg_proc p
       WHERE p.oid = 'public.cancel_order_atomic(uuid,text,uuid,text,text,uuid,boolean,text)'::regprocedure)
  THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('13 SECURITY DEFINER + search_path=public + owner postgres: PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('13 function security properties: FAIL');
  END IF;

  ------------------------------------- 14 the deployed body no longer reads carrier state off orders
  IF (SELECT position('v_order.provider_shipment_id' IN p.prosrc) = 0
             AND position('v_order.dispatch_status' IN p.prosrc) = 0
             AND position('order_delivery_integrations' IN p.prosrc) > 0
        FROM pg_proc p
       WHERE p.oid = 'public.cancel_order_atomic(uuid,text,uuid,text,text,uuid,boolean,text)'::regprocedure)
  THEN
    v_pass := v_pass + 1;
    v_results := v_results || jsonb_build_array('14 carrier state read from order_delivery_integrations, not the order record: PASS');
  ELSE
    v_fail := v_fail + 1;
    v_results := v_results || jsonb_build_array('14 carrier lookup source: FAIL');
  END IF;

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'CANCEL_ORDER_ATOMIC_JENNI_LOOKUP FAILED pass=% fail=% details=%', v_pass, v_fail, v_results::text;
  END IF;

  RAISE NOTICE 'CANCEL_ORDER_ATOMIC_JENNI_LOOKUP PASSED pass=% fail=% details=%', v_pass, v_fail, v_results::text;
END
$verify$;

-- Fixtures exist only for this run.
ROLLBACK;
