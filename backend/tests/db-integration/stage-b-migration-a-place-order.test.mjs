import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OrdersService } from "../../dist/modules/orders/orders.service.js";
import { CheckoutService } from "../../dist/modules/checkout/checkout.service.js";

test("Stage B Migration A — place_order authority refactor SQL file checks", async (t) => {
  const migrationPath = resolve("..", "supabase/migrations/20260831100000_stage_b_place_order_authority_refactor.sql");
  const sql = readFileSync(migrationPath, "utf8");

  await t.test("1. Migration file contains rename-first transition", () => {
    assert.ok(sql.includes("RENAME TO place_order_legacy_stageb;"), "Must contain rename-first to place_order_legacy_stageb");
    assert.ok(sql.includes("CREATE FUNCTION public.place_order("), "Must create new public.place_order");
    assert.ok(sql.includes("DROP FUNCTION public.place_order_legacy_stageb("), "Must drop legacy function under RESTRICT");
    assert.ok(sql.includes("RESTRICT;"), "Must specify RESTRICT on drop");
  });

  await t.test("2. Migration file removes all 6 legacy parameters", () => {
    const legacyParams = [
      "p_source_app",
      "p_store_linked_profile_id",
      "p_dilmart_user_id",
      "p_dilmart_barbershop_id",
      "p_segment",
      "p_business_type"
    ];

    const createBlock = sql.slice(
      sql.indexOf("CREATE FUNCTION public.place_order("),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.place_order_idempotent(")
    );
    for (const param of legacyParams) {
      assert.ok(!createBlock.includes(param), `New place_order signature must not contain ${param}`);
    }
  });

  await t.test("3. Migration file removes legacy column writes from INSERT INTO public.orders", () => {
    const createBlock = sql.slice(
      sql.indexOf("CREATE FUNCTION public.place_order("),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.place_order_idempotent(")
    );
    const insertBlock = createBlock.slice(
      createBlock.indexOf("INSERT INTO public.orders ("),
      createBlock.indexOf("RETURNING id, order_number")
    );
    
    assert.ok(!insertBlock.includes("source_app,"), "orders insert must not include source_app");
    assert.ok(!insertBlock.includes("store_linked_profile_id,"), "orders insert must not include store_linked_profile_id");
    assert.ok(!insertBlock.includes("dilmart_user_id,"), "orders insert must not include dilmart_user_id");
    assert.ok(!insertBlock.includes("dilmart_barbershop_id,"), "orders insert must not include dilmart_barbershop_id");
    assert.ok(!insertBlock.includes("segment,"), "orders insert must not include segment");
    assert.ok(!insertBlock.includes("business_type"), "orders insert must not include business_type");
    assert.ok(insertBlock.includes("channel"), "orders insert must write modern channel column");
  });

  await t.test("4. Migration file preserves SECURITY DEFINER and strict ACL grants", () => {
    assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.place_order"), "Must revoke ALL on place_order");
    assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.place_order"), "Must grant EXECUTE on place_order");
    assert.ok(sql.includes("TO service_role;"), "Must grant execute to service_role");
    assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.place_order_idempotent"), "Must revoke ALL on place_order_idempotent");
    assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.place_order_idempotent"), "Must grant EXECUTE on place_order_idempotent");
  });

  await t.test("5. Migration file contains post-transition assertions", () => {
    assert.ok(sql.includes("v_new_args <> 49"), "Must assert exactly 49 arguments");
    assert.ok(sql.includes("v_new_count <> 1"), "Must assert exactly 1 place_order function");
    assert.ok(sql.includes("place_order_legacy_stageb"), "Must assert temporary legacy function is dropped");
  });
});

test("Stage B Migration A — Application Callers Verification", async (t) => {
  await t.test("1. OrdersService.createManualOrder passes modern p_channel", () => {
    const ordersServicePath = resolve("src/modules/orders/orders.service.ts");
    const code = readFileSync(ordersServicePath, "utf8");
    assert.ok(code.includes("p_channel: channel,"), "OrdersService must pass p_channel");
    assert.ok(!code.includes("p_source_app"), "OrdersService must not pass p_source_app");
    assert.ok(!code.includes("p_store_linked_profile_id"), "OrdersService must not pass p_store_linked_profile_id");
    assert.ok(!code.includes("p_dilmart_barbershop_id"), "OrdersService must not pass p_dilmart_barbershop_id");
  });

  await t.test("2. CheckoutService.submit passes modern p_channel", () => {
    const checkoutServicePath = resolve("src/modules/checkout/checkout.service.ts");
    const code = readFileSync(checkoutServicePath, "utf8");
    assert.ok(code.includes("p_channel: \"web_checkout\""), "CheckoutService must pass p_channel");
    assert.ok(!code.includes("p_source_app"), "CheckoutService must not pass p_source_app");
    assert.ok(!code.includes("p_store_linked_profile_id"), "CheckoutService must not pass p_store_linked_profile_id");
  });
});

test("Stage B Migration A — OrdersService and CheckoutService Integration Behavior", async (t) => {
  let capturedRpc = {};
  const mockSupabaseAdmin = {
    client: {
      from(table) {
        const filters = {};
        const query = {
          select() { return this; },
          eq(k, v) { filters[k] = v; return this; },
          in(k, v) { filters[k] = v; return this; },
          order() { return this; },
          limit() { return this; },
          single: async () => {
            if (table === "orders") {
              return { data: { id: "order-uuid-1", order_number: "ORD-12345", total: 25000, channel: "manual_assisted" }, error: null };
            }
            return { data: null, error: null };
          },
          maybeSingle: async () => {
            if (table === "merchants") {
              return { data: { id: "m-1", status: "active", name: "Test Merchant" }, error: null };
            }
            if (table === "products") {
              return { data: { id: "p-1", name: "Product 1", price: 25000, stock: 10, is_active: true, merchant_id: "m-1" }, error: null };
            }
            return { data: null, error: null };
          },
          update() { return this; },
          insert: async () => ({ data: null, error: null }),
          then(resolve, reject) {
            if (table === "products") {
              return Promise.resolve({
                data: [{ id: "p-1", merchant_id: "m-1", category_id: "cat-1" }],
                error: null,
              }).then(resolve, reject);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          }
        };
        return query;
      },
      rpc: async (name, params) => {
        capturedRpc[name] = params;
        if (name === "place_order") return { data: "ORD-12345", error: null };
        if (name === "place_order_idempotent") return { data: { order_number: "ORD-12345", order_id: "order-uuid-1", reused: false }, error: null };
        return { data: null, error: null };
      }
    }
  };

  const mockFinanceService = {
    resolveCommercialTerms: async () => ({
      commission_type: "percentage",
      commission_rate: 10,
      assisted_fee_rate: 0,
      platform_fee_rate: 0,
      delivery_billing_mode: "customer_pays",
      commission_rule_id: null,
      assisted_fee_rule_id: null,
      platform_fee_rule_id: null,
      delivery_billing_rule_id: null,
      plan_id: null,
      plan_code: "STANDARD",
      commercial_snapshot_version: 1,
    }),
    computeOrderFinancialSnapshot: () => ({
      merchandise_subtotal: 25000,
      discount_total: 0,
      delivery_fee_charged: 3000,
      platform_commission_type: "percentage",
      platform_commission_rate: 10,
      platform_commission_amount: 2500,
      platform_assisted_fee_amount: 0,
      platform_extra_fee_amount: 0,
      courier_fee_payable: 3000,
      merchant_gross_amount: 25000,
      merchant_net_amount: 22500,
      gross_collected_amount: 28000,
      platform_net_revenue_amount: 2500,
      currency_code: "IQD",
      financial_snapshot_version: 1,
      commission_rule_id: null,
      assisted_fee_rule_id: null,
      platform_fee_rule_id: null,
      delivery_billing_rule_id: null,
      resolved_plan_id: null,
      resolved_plan_code: "STANDARD",
      commercial_snapshot_version: 1,
    }),
    recordFinancialEventsForOrder: async () => {},
  };

  const mockAuditLogger = { logEvent: async () => {} };
  const mockJenniService = { lookupPricing: async () => ({ price: 3000 }) };
  const mockScopeResolver = { resolveMerchantScope: async (m) => m };
  const mockWhatsAppIntents = { resolveIntentForManualOrder: async () => {} };

  await t.test("1. OrdersService.createManualOrder executes place_order with manual_assisted channel", async () => {
    capturedRpc = {};
    const ordersService = new OrdersService(
      mockSupabaseAdmin,
      mockScopeResolver,
      mockWhatsAppIntents,
      mockFinanceService,
      {},
      mockJenniService,
      {}
    );

    const result = await ordersService.createManualOrder(
      {
        customer_name: "أحمد علي",
        customer_phone: "07701234567",
        governorate_id: "gov-uuid-1",
        area: "المنصور",
        items: [{ product_id: "p-1", product_name: "Product 1", price: 25000, quantity: 1 }],
        delivery_cost: 3000,
      },
      "agent-user-id"
    );

    assert.ok(result);
    assert.equal(capturedRpc.place_order.p_channel, "manual_assisted");
    assert.equal(capturedRpc.place_order.p_source_app, undefined);
    assert.equal(capturedRpc.place_order.p_store_linked_profile_id, undefined);
    assert.equal(capturedRpc.place_order.p_dilmart_barbershop_id, undefined);
  });

  await t.test("2. OrdersService.createManualOrder with intent_id executes with whatsapp_assisted channel", async () => {
    capturedRpc = {};
    const ordersService = new OrdersService(
      mockSupabaseAdmin,
      mockScopeResolver,
      mockWhatsAppIntents,
      mockFinanceService,
      {},
      mockJenniService,
      {}
    );

    const result = await ordersService.createManualOrder(
      {
        customer_name: "أحمد علي",
        customer_phone: "07701234567",
        governorate_id: "gov-uuid-1",
        area: "المنصور",
        items: [{ product_id: "p-1", product_name: "Product 1", price: 25000, quantity: 1 }],
        delivery_cost: 3000,
        intent_id: "intent-uuid-1",
      },
      "agent-user-id"
    );

    assert.ok(result);
    assert.equal(capturedRpc.place_order.p_channel, "whatsapp_assisted");
  });
});
