import test from "node:test";
import assert from "node:assert/strict";
import { getTestClient } from "./db-client-helper.mjs";
import * as crypto from "crypto";

test("PR-3: Checkout Attempt Concurrency & Processing (Database Integration Suite)", async (t) => {
  const supabase = getTestClient();

  const setupCheckoutFixtures = async () => {
    // 1. Create Governorate
    const govId = crypto.randomUUID();
    const { error: govErr } = await supabase.from("governorates").insert({
      id: govId,
      name: `Gov-${crypto.randomBytes(6).toString("hex")}`,
      delivery_price: 5000,
    });
    if (govErr) throw govErr;

    // 2. Create Merchant
    const merchantId = crypto.randomUUID();
    const { error: merchErr } = await supabase.from("merchants").insert({
      id: merchantId,
      slug: `merch-${crypto.randomBytes(6).toString("hex")}`,
      name_ar: "تاجر فحص",
      name_en: "Test Merchant",
      display_name: "Test Merchant",
      status: "active",
    });
    if (merchErr) throw merchErr;

    // 3. Create Category
    const catId = crypto.randomUUID();
    const { error: catErr } = await supabase.from("categories").insert({
      id: catId,
      name: `Category-${crypto.randomBytes(6).toString("hex")}`,
      slug: `cat-${crypto.randomBytes(6).toString("hex")}`,
      is_active: true,
    });
    if (catErr) throw catErr;

    // 4. Create Product linked to Merchant
    const prodId = crypto.randomUUID();
    const { error: prodErr } = await supabase.from("products").insert({
      id: prodId,
      merchant_id: merchantId,
      category_id: catId,
      name: `Product-${crypto.randomBytes(6).toString("hex")}`,
      slug: `prod-${crypto.randomBytes(6).toString("hex")}`,
      price: 25000,
      stock: 100,
      is_active: true,
    });
    if (prodErr) throw prodErr;

    // 5. Create real auth user
    const phone = "+96477" + Math.floor(10000000 + Math.random() * 90000000);
    const email = `checkout-user-${crypto.randomBytes(6).toString("hex")}@example.com`;
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      phone,
      password: "password123",
      email_confirm: true,
      phone_confirm: true,
    });
    if (authErr) throw authErr;
    const userId = authData.user.id;

    // Update profile phone just in case
    await supabase.from("profiles").update({
      full_name: "علي كريم الموثق",
      phone,
    }).eq("id", userId);

    return { govId, merchantId, prodId, userId, phone };
  };

  await t.test("first checkout call creates attempt and order successfully", async () => {
    const { govId, merchantId, prodId, userId, phone } = await setupCheckoutFixtures();

    const attemptId = crypto.randomUUID();
    const requestHash = crypto.createHash("sha256").update(attemptId + phone).digest("hex");
    const items = [{ product_id: prodId, quantity: 1 }];

    const { data: res, error } = await supabase.rpc("place_order_idempotent", {
      p_checkout_attempt_id: attemptId,
      p_checkout_request_hash: requestHash,
      p_customer_name: "علي كريم الموثق",
      p_customer_phone: phone,
      p_governorate_id: govId,
      p_area: "المنصور",
      p_nearest_landmark: "برج المنصور",
      p_notes: "لا يوجد",
      p_subtotal: 25000,
      p_delivery_cost: 5000,
      p_discount: 0,
      p_total: 30000,
      p_coupon_id: null,
      p_items: items,
      p_user_id: userId,
      p_latitude: null,
      p_longitude: null,
      p_map_url: null,
      p_points_spent: 0,
      p_points_discount: 0,
      p_points_earned: 0,
      p_merchant_id: merchantId,
      p_payment_method: "cod",
      p_merchant_notes: null,
      p_merchandise_subtotal: 25000,
      p_discount_total: 0,
      p_delivery_fee_charged: 5000,
      p_platform_commission_type: "fixed",
      p_platform_commission_rate: 0,
      p_platform_commission_amount: 500,
      p_platform_assisted_fee_amount: 0,
      p_platform_extra_fee_amount: 0,
      p_courier_fee_payable: 4000,
      p_merchant_gross_amount: 25000,
      p_merchant_net_amount: 24500,
      p_gross_collected_amount: 30000,
      p_platform_net_revenue_amount: 1500,
      p_currency_code: "IQD",
      p_financial_snapshot_version: 1,
      p_payment_status: "unpaid",
      p_collection_status: "not_collected",
      p_settlement_status: "not_accrued",
      p_cash_expected_amount: 30000,
      p_commission_rule_id: null,
      p_assisted_fee_rule_id: null,
      p_platform_fee_rule_id: null,
      p_delivery_billing_rule_id: null,
      p_resolved_plan_id: null,
      p_resolved_plan_code: null,
      p_commercial_snapshot_version: 1,
      p_channel: "web_checkout"
    });

    assert.equal(error, null, `RPC place_order_idempotent should not return error: ${error?.message}`);
    assert.ok(res.order_number, "Should return a valid order number");
    assert.equal(res.reused, false, "First call should not be marked as reused");

    const { data: order } = await supabase.from("orders").select("channel").eq("order_number", res.order_number).single();
    assert.equal(order.channel, "web_checkout", "Order channel must be web_checkout");
  });

  await t.test("second sequential call with same attempt ID returns existing order (reused = true)", async () => {
    const { govId, merchantId, prodId, userId, phone } = await setupCheckoutFixtures();

    const attemptId = crypto.randomUUID();
    const requestHash = crypto.createHash("sha256").update(attemptId + phone).digest("hex");
    const items = [{ product_id: prodId, quantity: 1 }];

    const params = {
      p_checkout_attempt_id: attemptId,
      p_checkout_request_hash: requestHash,
      p_customer_name: "علي كريم الموثق",
      p_customer_phone: phone,
      p_governorate_id: govId,
      p_area: "المنصور",
      p_nearest_landmark: "برج المنصور",
      p_notes: "لا يوجد",
      p_subtotal: 25000,
      p_delivery_cost: 5000,
      p_discount: 0,
      p_total: 30000,
      p_coupon_id: null,
      p_items: items,
      p_user_id: userId,
      p_latitude: null,
      p_longitude: null,
      p_map_url: null,
      p_points_spent: 0,
      p_points_discount: 0,
      p_points_earned: 0,
      p_merchant_id: merchantId,
      p_payment_method: "cod",
      p_merchant_notes: null,
      p_merchandise_subtotal: 25000,
      p_discount_total: 0,
      p_delivery_fee_charged: 5000,
      p_platform_commission_type: "fixed",
      p_platform_commission_rate: 0,
      p_platform_commission_amount: 500,
      p_platform_assisted_fee_amount: 0,
      p_platform_extra_fee_amount: 0,
      p_courier_fee_payable: 4000,
      p_merchant_gross_amount: 25000,
      p_merchant_net_amount: 24500,
      p_gross_collected_amount: 30000,
      p_platform_net_revenue_amount: 1500,
      p_currency_code: "IQD",
      p_financial_snapshot_version: 1,
      p_payment_status: "unpaid",
      p_collection_status: "not_collected",
      p_settlement_status: "not_accrued",
      p_cash_expected_amount: 30000,
      p_commission_rule_id: null,
      p_assisted_fee_rule_id: null,
      p_platform_fee_rule_id: null,
      p_delivery_billing_rule_id: null,
      p_resolved_plan_id: null,
      p_resolved_plan_code: null,
      p_commercial_snapshot_version: 1,
      p_channel: "web_checkout"
    };

    const { data: res1, error: err1 } = await supabase.rpc("place_order_idempotent", params);
    assert.equal(err1, null, err1?.message);

    const { data: res2, error: err2 } = await supabase.rpc("place_order_idempotent", params);
    assert.equal(err2, null, err2?.message);
    assert.equal(res2.order_number, res1.order_number, "Second call must return same order number");
    assert.equal(res2.reused, true, "Second call must be marked as reused");
  });

  await t.test("concurrent calls with same attempt ID result in only one order creation", async () => {
    const { govId, merchantId, prodId, userId, phone } = await setupCheckoutFixtures();

    const attemptId = crypto.randomUUID();
    const requestHash = crypto.createHash("sha256").update(attemptId + phone).digest("hex");
    const items = [{ product_id: prodId, quantity: 1 }];

    const params = {
      p_checkout_attempt_id: attemptId,
      p_checkout_request_hash: requestHash,
      p_customer_name: "علي كريم الموثق",
      p_customer_phone: phone,
      p_governorate_id: govId,
      p_area: "المنصور",
      p_nearest_landmark: "برج المنصور",
      p_notes: "لا يوجد",
      p_subtotal: 25000,
      p_delivery_cost: 5000,
      p_discount: 0,
      p_total: 30000,
      p_coupon_id: null,
      p_items: items,
      p_user_id: userId,
      p_latitude: null,
      p_longitude: null,
      p_map_url: null,
      p_points_spent: 0,
      p_points_discount: 0,
      p_points_earned: 0,
      p_merchant_id: merchantId,
      p_payment_method: "cod",
      p_merchant_notes: null,
      p_merchandise_subtotal: 25000,
      p_discount_total: 0,
      p_delivery_fee_charged: 5000,
      p_platform_commission_type: "fixed",
      p_platform_commission_rate: 0,
      p_platform_commission_amount: 500,
      p_platform_assisted_fee_amount: 0,
      p_platform_extra_fee_amount: 0,
      p_courier_fee_payable: 4000,
      p_merchant_gross_amount: 25000,
      p_merchant_net_amount: 24500,
      p_gross_collected_amount: 30000,
      p_platform_net_revenue_amount: 1500,
      p_currency_code: "IQD",
      p_financial_snapshot_version: 1,
      p_payment_status: "unpaid",
      p_collection_status: "not_collected",
      p_settlement_status: "not_accrued",
      p_cash_expected_amount: 30000,
      p_commission_rule_id: null,
      p_assisted_fee_rule_id: null,
      p_platform_fee_rule_id: null,
      p_delivery_billing_rule_id: null,
      p_resolved_plan_id: null,
      p_resolved_plan_code: null,
      p_commercial_snapshot_version: 1,
      p_channel: "web_checkout"
    };

    const [call1, call2] = await Promise.all([
      supabase.rpc("place_order_idempotent", params),
      supabase.rpc("place_order_idempotent", params)
    ]);

    const successes = [];
    const inProgressErrors = [];
    const otherErrors = [];

    for (const call of [call1, call2]) {
      if (call.error) {
        if (call.error.message.includes("CHECKOUT_IN_PROGRESS")) {
          inProgressErrors.push(call.error);
        } else {
          otherErrors.push(call.error);
        }
      } else {
        successes.push(call.data);
      }
    }

    assert.equal(otherErrors.length, 0, `Should not have unexpected errors: ${otherErrors.map(e => e.message).join(", ")}`);

    if (successes.length === 2) {
      assert.equal(successes[0].order_number, successes[1].order_number, "If both succeeded, they must have returned same order number");
    } else {
      assert.equal(successes.length, 1, "Should have exactly one success");
      assert.equal(inProgressErrors.length, 1, "The other concurrent call must have failed with CHECKOUT_IN_PROGRESS");
    }
  });
});
