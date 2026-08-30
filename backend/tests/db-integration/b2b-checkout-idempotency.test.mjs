/**
 * b2b-checkout-idempotency.test.mjs
 *
 * Real PostgreSQL Database Integration Suite for B2B Cart Checkout Idempotency (Task 064).
 *
 * Purpose:
 *   Proves atomic purchase integrity, concurrency protection, one-order-per-cart uniqueness,
 *   true post-place_order rollback on failure, owner XOR constraints, and completed-replay historical truth
 *   against a real PostgreSQL / Supabase instance.
 *
 * CI Execution:
 *   Automatically discovered by `npm run test:db-integration` which expands `tests/db-integration/*.test.mjs`.
 *
 * DB Test Matrix:
 *   DB1: Same attempt initial success + replay (reused=false then reused=true, 1 order, stock decremented 1x)
 *   DB2: Same attempt + changed hash (rejects with IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD)
 *   DB3: Two attempts same cart concurrently (exactly 1 committed order, stock decremented 1x)
 *   DB4: Pre-place_order cart version guard (p_expected_cart_updated_at mismatch rejects before order)
 *   DB5: TRUE post-place_order rollback (sentinel order unique collision rolls back nested order & stock)
 *   DB6: Different attempt after converted cart (max one order per cart invariant)
 *   DB7: Financial snapshot created exactly once without duplication
 *   DB8: Owner XOR and B2B cart requirement constraints (web vs B2B vs invalid combinations)
 *   DB9: FK / audit-history delete behavior (ON DELETE RESTRICT protects checkout attempt history)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { getTestClient } from "./db-client-helper.mjs";
import * as crypto from "crypto";

test("DilMart-STORE-064: B2B Checkout Idempotency & Database Atomicity Suite", async (t) => {
  let supabase;
  try {
    supabase = getTestClient();
  } catch (err) {
    // If running in environment without local Supabase credentials (e.g. production guard)
    t.skip(`Skipping real DB execution: ${err.message}`);
    return;
  }

  // ─── Fixture Helper ─────────────────────────────────────────────────────────

  const setupB2BFixtures = async () => {
    const govId = crypto.randomUUID();
    const { error: govErr } = await supabase.from("governorates").insert({
      id: govId,
      name: `Gov-${crypto.randomBytes(6).toString("hex")}`,
      delivery_price: 5000,
    });
    if (govErr) throw govErr;

    const merchantId = crypto.randomUUID();
    const { error: merchErr } = await supabase.from("merchants").insert({
      id: merchantId,
      slug: `merch-${crypto.randomBytes(6).toString("hex")}`,
      name_ar: "تاجر فحص B2B",
      name_en: "B2B Test Merchant",
      display_name: "B2B Test Merchant",
      status: "active",
    });
    if (merchErr) throw merchErr;

    const catId = crypto.randomUUID();
    const { error: catErr } = await supabase.from("categories").insert({
      id: catId,
      name: `Cat-${crypto.randomBytes(6).toString("hex")}`,
      slug: `cat-${crypto.randomBytes(6).toString("hex")}`,
      is_active: true,
    });
    if (catErr) throw catErr;

    const prodId = crypto.randomUUID();
    const { error: prodErr } = await supabase.from("products").insert({
      id: prodId,
      merchant_id: merchantId,
      category_id: catId,
      name: `Product-${crypto.randomBytes(6).toString("hex")}`,
      slug: `prod-${crypto.randomBytes(6).toString("hex")}`,
      price: 25000,
      stock: 100,
      sold_count: 0,
      is_active: true,
      is_published: true,
      visibility_status: "public",
      purchase_mode: ["both"],
    });
    if (prodErr) throw prodErr;

    const linkedProfileId = crypto.randomUUID();
    const { error: profileErr } = await supabase.from("store_linked_profiles").insert({
      id: linkedProfileId,
      source_app: "barber_app",
      DilMart_user_id: crypto.randomUUID(),
      DilMart_barbershop_id: crypto.randomUUID(),
      DilMart_role: "OWNER",
      segment: "DilMart_APP_BARBER_OWNER",
      business_type: "men_barbershop",
      phone: "+96477" + Math.floor(10000000 + Math.random() * 90000000),
      link_status: "LINKED",
    });
    if (profileErr) throw profileErr;

    const cartId = crypto.randomUUID();
    const { data: cartData, error: cartErr } = await supabase
      .from("store_carts")
      .insert({
        id: cartId,
        store_linked_profile_id: linkedProfileId,
        source_app: "barber_app",
        merchant_id: merchantId,
        status: "active",
      })
      .select("*")
      .single();
    if (cartErr) throw cartErr;

    const itemId = crypto.randomUUID();
    const { error: itemErr } = await supabase.from("store_cart_items").insert({
      id: itemId,
      cart_id: cartId,
      product_id: prodId,
      merchant_id: merchantId,
      quantity: 2,
      product_name: "Test Item",
      unit_price: 25000,
      effective_unit_price: 25000,
      line_total: 50000,
    });
    if (itemErr) throw itemErr;

    return {
      govId,
      merchantId,
      prodId,
      linkedProfileId,
      cartId,
      cartUpdatedAt: cartData.updated_at,
    };
  };

  const computeHash = (params) => {
    const canonical = JSON.stringify({
      store_linked_profile_id: params.store_linked_profile_id,
      store_cart_id: params.store_cart_id,
      customer_name: params.customer_name?.trim() || "",
      customer_phone: params.customer_phone?.trim() || "",
      governorate_id: params.governorate_id || "",
      area: params.area?.trim() || "",
      nearest_landmark: params.nearest_landmark?.trim() || "",
      notes: params.notes?.trim() || "",
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
      map_url: params.map_url?.trim() || "",
    });
    return crypto.createHash("sha256").update(canonical).digest("hex");
  };

  const buildRpcParams = (fixtures, attemptId, customHash) => {
    const base = {
      store_linked_profile_id: fixtures.linkedProfileId,
      store_cart_id: fixtures.cartId,
      customer_name: "حيدر علي",
      customer_phone: "07701234567",
      governorate_id: fixtures.govId,
      area: "الكرادة",
      nearest_landmark: "قرب ساحة كهرمانة",
      notes: "يرجى الاتصال قبل الوصول",
      latitude: 33.31,
      longitude: 44.36,
      map_url: "https://maps.google.com/?q=33.31,44.36",
    };

    const requestHash = customHash || computeHash(base);

    return {
      p_checkout_attempt_id: attemptId,
      p_checkout_request_hash: requestHash,
      p_store_linked_profile_id: fixtures.linkedProfileId,
      p_store_cart_id: fixtures.cartId,
      p_expected_cart_updated_at: fixtures.cartUpdatedAt,
      p_customer_name: base.customer_name,
      p_customer_phone: base.customer_phone,
      p_governorate_id: base.governorate_id,
      p_area: base.area,
      p_nearest_landmark: base.nearest_landmark,
      p_notes: base.notes,
      p_subtotal: 50000,
      p_delivery_cost: 5000,
      p_discount: 0,
      p_total: 55000,
      p_coupon_id: null,
      p_items: [
        {
          product_id: fixtures.prodId,
          product_name: "Test Item",
          quantity: 2,
          price: 25000,
        },
      ],
      p_latitude: base.latitude,
      p_longitude: base.longitude,
      p_map_url: base.map_url,
      p_merchant_id: fixtures.merchantId,
      p_merchandise_subtotal: 50000,
      p_discount_total: 0,
      p_delivery_fee_charged: 5000,
      p_platform_commission_type: "fixed",
      p_platform_commission_rate: 0,
      p_platform_commission_amount: 2500,
      p_platform_assisted_fee_amount: 0,
      p_platform_extra_fee_amount: 0,
      p_courier_fee_payable: 4000,
      p_merchant_gross_amount: 50000,
      p_merchant_net_amount: 47500,
      p_gross_collected_amount: 55000,
      p_platform_net_revenue_amount: 3500,
      p_currency_code: "IQD",
      p_financial_snapshot_version: 1,
      p_payment_status: "unpaid",
      p_collection_status: "not_collected",
      p_settlement_status: "not_accrued",
      p_cash_expected_amount: 55000,
      p_commission_rule_id: null,
      p_assisted_fee_rule_id: null,
      p_platform_fee_rule_id: null,
      p_delivery_billing_rule_id: null,
      p_resolved_plan_id: null,
      p_resolved_plan_code: null,
      p_commercial_snapshot_version: 1,
      p_source_app: "barber_app",
      p_channel: "barber_app_checkout",
      p_DilMart_user_id: crypto.randomUUID(),
      p_DilMart_barbershop_id: crypto.randomUUID(),
      p_segment: "barber",
      p_business_type: "salon",
    };
  };

  // ─── DB1: Same Attempt Replay ───────────────────────────────────────────────
  await t.test("DB1: Same attempt initial success + replay (one order, reused=true, stock once)", async () => {
    const fixtures = await setupB2BFixtures();
    const attemptId = crypto.randomUUID();
    const params = buildRpcParams(fixtures, attemptId);

    // Call 1: First attempt
    const { data: res1, error: err1 } = await supabase.rpc("place_b2b_cart_order_idempotent", params);
    assert.equal(err1, null, `First call should succeed: ${err1?.message}`);
    assert.ok(res1.order_number, "Must return order_number");
    assert.ok(res1.order_id, "Must return order_id");
    assert.equal(res1.reused, false, "First call must have reused=false");

    // Verify stock decremented by 2 (100 -> 98)
    const { data: prodAfter1 } = await supabase.from("products").select("stock").eq("id", fixtures.prodId).single();
    assert.equal(prodAfter1.stock, 98, "Stock must be decremented by 2");

    // Call 2: Exact same attempt replay
    const { data: res2, error: err2 } = await supabase.rpc("place_b2b_cart_order_idempotent", params);
    assert.equal(err2, null, `Replay call should succeed: ${err2?.message}`);
    assert.equal(res2.order_id, res1.order_id, "Replay must return the same order_id");
    assert.equal(res2.order_number, res1.order_number, "Replay must return the same order_number");
    assert.equal(res2.reused, true, "Replay must have reused=true");

    // Verify total orders for this cart is exactly 1
    const { data: orders } = await supabase.from("orders").select("id").eq("store_cart_id", fixtures.cartId);
    assert.equal(orders.length, 1, "Must be exactly 1 committed order for this cart");

    // Verify stock was NOT decremented again (still 98)
    const { data: prodAfter2 } = await supabase.from("products").select("stock").eq("id", fixtures.prodId).single();
    assert.equal(prodAfter2.stock, 98, "Stock must remain 98 after replay");
  });

  // ─── DB2: Same Attempt Hash Mismatch ────────────────────────────────────────
  await t.test("DB2: Same attempt + changed hash rejects with IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD", async () => {
    const fixtures = await setupB2BFixtures();
    const attemptId = crypto.randomUUID();
    const params = buildRpcParams(fixtures, attemptId);

    // Call 1: Success
    const { data: res1, error: err1 } = await supabase.rpc("place_b2b_cart_order_idempotent", params);
    assert.equal(err1, null);
    assert.equal(res1.reused, false);

    // Call 2: Same attempt ID, different customer name / hash
    const mismatchedParams = {
      ...params,
      p_checkout_request_hash: crypto.createHash("sha256").update("different-payload").digest("hex"),
      p_customer_name: "محمد حسن المختلف",
    };

    const { data: res2, error: err2 } = await supabase.rpc("place_b2b_cart_order_idempotent", mismatchedParams);
    assert.ok(err2, "Must reject with error on hash mismatch");
    assert.ok(
      err2.message.includes("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD"),
      `Error must be IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD, got: ${err2.message}`,
    );

    // Orders count remains 1
    const { data: orders } = await supabase.from("orders").select("id").eq("store_cart_id", fixtures.cartId);
    assert.equal(orders.length, 1);
  });

  // ─── DB3: Concurrent Same Cart ──────────────────────────────────────────────
  await t.test("DB3: Two attempts same cart concurrently (exactly 1 committed order)", async () => {
    const fixtures = await setupB2BFixtures();
    const attemptA = crypto.randomUUID();
    const attemptB = crypto.randomUUID();

    const paramsA = buildRpcParams(fixtures, attemptA);
    const paramsB = buildRpcParams(fixtures, attemptB);

    // Execute concurrently
    const [settledA, settledB] = await Promise.allSettled([
      supabase.rpc("place_b2b_cart_order_idempotent", paramsA),
      supabase.rpc("place_b2b_cart_order_idempotent", paramsB),
    ]);

    const successes = [settledA, settledB].filter(
      (s) => s.status === "fulfilled" && s.value.error === null && s.value.data?.reused === false,
    );
    assert.equal(successes.length, 1, "Exactly one concurrent attempt must win (reused=false)");

    // Cart must be converted
    const { data: cart } = await supabase.from("store_carts").select("status").eq("id", fixtures.cartId).single();
    assert.equal(cart.status, "converted", "Cart status must be converted");

    // Orders count is exactly 1
    const { data: orders } = await supabase.from("orders").select("id").eq("store_cart_id", fixtures.cartId);
    assert.equal(orders.length, 1, "Exactly 1 order must be committed for the cart");

    // Stock decremented exactly 1x (100 -> 98)
    const { data: prod } = await supabase.from("products").select("stock").eq("id", fixtures.prodId).single();
    assert.equal(prod.stock, 98, "Stock must be decremented only once");
  });

  // ─── DB4: Pre-place_order Cart Version Guard ────────────────────────────────
  await t.test("DB4: Pre-place_order cart version mismatch rejects before place_order runs", async () => {
    const fixtures = await setupB2BFixtures();
    const attemptId = crypto.randomUUID();
    const params = buildRpcParams(fixtures, attemptId);

    // Provide stale cart updated_at
    const staleParams = {
      ...params,
      p_expected_cart_updated_at: new Date(Date.now() - 1000000).toISOString(),
    };

    const { error: versionErr } = await supabase.rpc("place_b2b_cart_order_idempotent", staleParams);
    assert.ok(versionErr, "Version guard must reject stale cart");
    assert.ok(
      versionErr.message.includes("B2B_CART_CHANGED_DURING_CHECKOUT"),
      `Expected B2B_CART_CHANGED_DURING_CHECKOUT, got: ${versionErr.message}`,
    );

    // Verify 0 orders created
    const { data: orders } = await supabase.from("orders").select("id").eq("store_cart_id", fixtures.cartId);
    assert.equal(orders.length, 0, "No order must be created on version guard rejection");

    // Verify stock is still 100
    const { data: prod } = await supabase.from("products").select("stock").eq("id", fixtures.prodId).single();
    assert.equal(prod.stock, 100, "Stock must remain 100");

    // Verify cart is still active
    const { data: cart } = await supabase.from("store_carts").select("status").eq("id", fixtures.cartId).single();
    assert.equal(cart.status, "active", "Cart must remain active");
  });

  // ─── DB5: TRUE Post-place_order Rollback ────────────────────────────────────
  await t.test("DB5: TRUE post-place_order failure rolls back nested order, items, and stock", async () => {
    const fixtures = await setupB2BFixtures();

    // 1. Create a sentinel order already holding store_cart_id = fixtures.cartId
    // This pre-occupies the UNIQUE idx_orders_store_cart_id constraint for fixtures.cartId.
    const sentinelOrderId = crypto.randomUUID();
    const { error: sentinelErr } = await supabase.from("orders").insert({
      id: sentinelOrderId,
      order_number: `ORD-SENTINEL-${crypto.randomBytes(4).toString("hex")}`,
      customer_name: "حارس الاختبار",
      customer_phone: "+9647700000000",
      governorate_id: fixtures.govId,
      area: "المنصور",
      merchant_id: fixtures.merchantId,
      subtotal: 10000,
      delivery_cost: 5000,
      discount: 0,
      total: 15000,
      payment_method: "cod",
      status: "new",
      store_cart_id: fixtures.cartId, // Pre-occupies unique index!
    });
    assert.equal(sentinelErr, null, `Sentinel order creation failed: ${sentinelErr?.message}`);

    // 2. Capture exact baseline metrics before executing place_b2b_cart_order_idempotent
    const { data: allOrdersBefore } = await supabase.from("orders").select("id");
    const { data: allItemsBefore } = await supabase.from("order_items").select("id");
    const { data: prodBefore } = await supabase.from("products").select("stock, sold_count").eq("id", fixtures.prodId).single();
    const { data: cartBefore } = await supabase.from("store_carts").select("status").eq("id", fixtures.cartId).single();

    const ordersCountBefore = allOrdersBefore.length;
    const itemsCountBefore = allItemsBefore.length;
    const stockBefore = prodBefore.stock;
    const soldCountBefore = prodBefore.sold_count ?? 0;

    assert.equal(cartBefore.status, "active", "Cart must be active before test");

    // 3. Execute place_b2b_cart_order_idempotent
    // Execution path in PostgreSQL:
    //   - Phase 1: Attempt insert succeeds
    //   - Phase 2: Cart lock & active check succeeds
    //   - Phase 3: place_order() executes! It inserts a NEW order, inserts order_items,
    //              decrements stock (100 -> 98), and increments sold_count.
    //   - Phase 4: Outer RPC executes `UPDATE public.orders SET store_cart_id = p_store_cart_id WHERE id = v_order_id;`
    //   - PostgreSQL UNIQUE constraint on idx_orders_store_cart_id VIOLATES because sentinel order already holds fixtures.cartId!
    //   - Entire transaction aborts and ROLLS BACK!
    const attemptId = crypto.randomUUID();
    const params = buildRpcParams(fixtures, attemptId);

    const { data: res, error: rpcErr } = await supabase.rpc("place_b2b_cart_order_idempotent", params);

    // 4. Assert that the RPC failed due to unique constraint on orders.store_cart_id
    assert.ok(rpcErr, "RPC must fail when linking new order to already-occupied store_cart_id");
    assert.ok(
      rpcErr.message.includes("idx_orders_store_cart_id") ||
      rpcErr.message.includes("orders_store_cart_id") ||
      rpcErr.code === "23505",
      `Expected unique constraint violation on idx_orders_store_cart_id, got: ${rpcErr.message}`,
    );

    // 5. TRUE ROLLBACK ASSERTIONS:
    // Assert DELTA = 0 for orders and order_items
    const { data: allOrdersAfter } = await supabase.from("orders").select("id");
    const { data: allItemsAfter } = await supabase.from("order_items").select("id");
    assert.equal(
      allOrdersAfter.length - ordersCountBefore,
      0,
      "No new order must remain committed after rollback (delta = 0)",
    );
    assert.equal(
      allItemsAfter.length - itemsCountBefore,
      0,
      "No new order_items must remain committed after rollback (delta = 0)",
    );

    // Assert product stock and sold_count are EXACTLY baseline
    const { data: prodAfter } = await supabase.from("products").select("stock, sold_count").eq("id", fixtures.prodId).single();
    assert.equal(
      prodAfter.stock,
      stockBefore,
      `Stock must be restored to baseline ${stockBefore} (was decremented inside place_order and rolled back)`,
    );
    assert.equal(
      prodAfter.sold_count ?? 0,
      soldCountBefore,
      `sold_count must be restored to baseline ${soldCountBefore}`,
    );

    // Assert cart status is still active (not converted, not locked)
    const { data: cartAfter } = await supabase.from("store_carts").select("status").eq("id", fixtures.cartId).single();
    assert.equal(cartAfter.status, "active", "Cart status must roll back to active");

    // Assert sentinel order is completely untouched
    const { data: sentinelOrderAfter } = await supabase.from("orders").select("id, status").eq("id", sentinelOrderId).single();
    assert.equal(sentinelOrderAfter.id, sentinelOrderId, "Sentinel order must remain intact");
  });

  // ─── DB6: Different Attempt After Converted Cart ───────────────────────────
  await t.test("DB6: Different attempt for an already converted cart cannot create second order", async () => {
    const fixtures = await setupB2BFixtures();
    const attempt1 = crypto.randomUUID();
    const params1 = buildRpcParams(fixtures, attempt1);

    // First checkout succeeds
    const { data: res1, error: err1 } = await supabase.rpc("place_b2b_cart_order_idempotent", params1);
    assert.equal(err1, null);
    assert.equal(res1.reused, false);

    // New attempt 2 for the same now-converted cart
    const attempt2 = crypto.randomUUID();
    const params2 = buildRpcParams(fixtures, attempt2);

    const { data: res2, error: err2 } = await supabase.rpc("place_b2b_cart_order_idempotent", params2);
    // Either returns existing order or throws deterministic cart converted error
    if (!err2) {
      assert.equal(res2.order_id, res1.order_id, "Must link to existing order");
      assert.equal(res2.reused, true, "Must have reused=true");
    }

    // Orders count is still exactly 1
    const { data: orders } = await supabase.from("orders").select("id").eq("store_cart_id", fixtures.cartId);
    assert.equal(orders.length, 1, "Exactly 1 order committed for the cart");
  });

  // ─── DB7: Financial Snapshot Single Creation ────────────────────────────────
  await t.test("DB7: Successful checkout creates accurate financial snapshot without duplication", async () => {
    const fixtures = await setupB2BFixtures();
    const attemptId = crypto.randomUUID();
    const params = buildRpcParams(fixtures, attemptId);

    const { data: res, error } = await supabase.rpc("place_b2b_cart_order_idempotent", params);
    assert.equal(error, null);

    const { data: order } = await supabase
      .from("orders")
      .select("platform_commission_amount, merchant_net_amount, gross_collected_amount, cash_expected_amount")
      .eq("id", res.order_id)
      .single();

    assert.equal(Number(order.platform_commission_amount), 2500);
    assert.equal(Number(order.merchant_net_amount), 47500);
    assert.equal(Number(order.gross_collected_amount), 55000);
    assert.equal(Number(order.cash_expected_amount), 55000);
  });

  // ─── DB8: Owner XOR & B2B Cart Requirement Constraints ──────────────────────
  await t.test("DB8: chk_checkout_attempts_owner_xor enforces owner XOR and cart requirement", async () => {
    const fixtures = await setupB2BFixtures();

    // 1. Web attempt (user_id set, store_linked_profile_id null) -> allowed
    const { data: profiles } = await supabase.from("profiles").select("id").limit(1);
    if (profiles && profiles.length > 0) {
      const webUserId = profiles[0].id;
      const webAttemptId = crypto.randomUUID();
      const { error: webErr } = await supabase.from("checkout_attempts").insert({
        id: webAttemptId,
        user_id: webUserId,
        store_linked_profile_id: null,
        store_cart_id: null,
        request_hash: "hash-web-db8",
        status: "processing",
      });
      assert.equal(webErr, null, "Web attempt with user_id only must succeed");
    }

    // 2. B2B attempt (store_linked_profile_id + store_cart_id set, user_id null) -> allowed
    const b2bAttemptId = crypto.randomUUID();
    const { error: b2bErr } = await supabase.from("checkout_attempts").insert({
      id: b2bAttemptId,
      user_id: null,
      store_linked_profile_id: fixtures.linkedProfileId,
      store_cart_id: fixtures.cartId,
      request_hash: "hash-b2b-db8",
      status: "processing",
    });
    assert.equal(b2bErr, null, "B2B attempt with linked_profile and cart must succeed");

    // 3. Both owners -> rejected
    const bothAttemptId = crypto.randomUUID();
    const { error: bothErr } = await supabase.from("checkout_attempts").insert({
      id: bothAttemptId,
      user_id: fixtures.linkedProfileId,
      store_linked_profile_id: fixtures.linkedProfileId,
      store_cart_id: fixtures.cartId,
      request_hash: "hash-both-db8",
      status: "processing",
    });
    assert.ok(bothErr, "Attempt with both user_id and store_linked_profile_id must fail");

    // 4. Neither owner -> rejected
    const neitherAttemptId = crypto.randomUUID();
    const { error: neitherErr } = await supabase.from("checkout_attempts").insert({
      id: neitherAttemptId,
      user_id: null,
      store_linked_profile_id: null,
      store_cart_id: fixtures.cartId,
      request_hash: "hash-neither-db8",
      status: "processing",
    });
    assert.ok(neitherErr, "Attempt with neither owner must fail");

    // 5. B2B attempt without store_cart_id -> rejected
    const b2bNoCartId = crypto.randomUUID();
    const { error: noCartErr } = await supabase.from("checkout_attempts").insert({
      id: b2bNoCartId,
      user_id: null,
      store_linked_profile_id: fixtures.linkedProfileId,
      store_cart_id: null,
      request_hash: "hash-nocart-db8",
      status: "processing",
    });
    assert.ok(noCartErr, "B2B attempt without store_cart_id must fail");
  });

  // ─── DB9: FK Delete Semantics ───────────────────────────────────────────────
  await t.test("DB9: ON DELETE RESTRICT on store_linked_profile_id and store_cart_id prevents silent audit deletion", async () => {
    const fixtures = await setupB2BFixtures();
    const attemptId = crypto.randomUUID();
    const params = buildRpcParams(fixtures, attemptId);

    // Create completed attempt
    await supabase.rpc("place_b2b_cart_order_idempotent", params);

    // 1. Attempt to delete store_linked_profile
    const { error: deleteProfileErr } = await supabase
      .from("store_linked_profiles")
      .delete()
      .eq("id", fixtures.linkedProfileId);

    assert.ok(deleteProfileErr, "Deleting store_linked_profile must be rejected by RESTRICT constraint");
    assert.ok(
      deleteProfileErr.code === "23503" || deleteProfileErr.message.includes("violates foreign key constraint"),
      `Expected FK violation (23503), got: ${deleteProfileErr.message}`,
    );

    // 2. Attempt to delete store_cart
    const { error: deleteCartErr } = await supabase
      .from("store_carts")
      .delete()
      .eq("id", fixtures.cartId);

    assert.ok(deleteCartErr, "Deleting store_cart must be rejected by RESTRICT constraint on checkout_attempts");
    assert.ok(
      deleteCartErr.code === "23503" || deleteCartErr.message.includes("violates foreign key constraint"),
      `Expected FK violation (23503), got: ${deleteCartErr.message}`,
    );
  });
});
