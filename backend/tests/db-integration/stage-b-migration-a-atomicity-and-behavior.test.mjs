import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OrdersService } from "../../dist/modules/orders/orders.service.js";
import { CheckoutService } from "../../dist/modules/checkout/checkout.service.js";

// ==============================================================================
// STAGE B PASS 3 — MIGRATION A VALIDATION SUITE
// ==============================================================================

test("Stage B Migration A — Static SQL Contract & Invariant Assertions [STATIC SQL ASSERTION]", async (t) => {
  const migrationPath = resolve("..", "supabase/migrations/20260831100000_stage_b_place_order_authority_refactor.sql");
  const sql = readFileSync(migrationPath, "utf8");

  await t.test("1. Transaction Atomicity: Explicit BEGIN and COMMIT block", () => {
    assert.ok(sql.includes("BEGIN;"), "Migration MUST contain explicit BEGIN;");
    assert.ok(sql.includes("COMMIT;"), "Migration MUST contain explicit COMMIT;");
    assert.ok(sql.indexOf("BEGIN;") < sql.indexOf("DO $$"), "BEGIN; MUST precede preflight assertions");
    assert.ok(sql.lastIndexOf("COMMIT;") > sql.lastIndexOf("END $$;"), "COMMIT; MUST succeed postconditions");
  });

  await t.test("2. Hardened Preflight: Compares exact pg_get_function_identity_arguments()", () => {
    assert.ok(sql.includes("v_old_identity <> v_expected_old_identity"), "Must compare exact 55-argument old identity string");
    assert.ok(sql.includes("v_idempotent_identity <> v_expected_idempotent_identity"), "Must compare exact 51-argument idempotent identity string");
    assert.ok(sql.includes("v_old_count <> 1"), "Must assert exactly 1 place_order function");
  });

  await t.test("3. Rename-First Atomic Sequence with RESTRICT drop", () => {
    assert.ok(sql.includes("RENAME TO place_order_legacy_stageb;"), "Must rename old function first");
    assert.ok(sql.includes("CREATE FUNCTION public.place_order("), "Must create new 49-argument function");
    assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.place_order_idempotent("), "Must re-create idempotent wrapper");
    assert.ok(sql.includes("DROP FUNCTION public.place_order_legacy_stageb("), "Must drop temporary legacy function");
    assert.ok(sql.includes("RESTRICT;"), "Must specify RESTRICT on drop");
  });

  await t.test("4. Explicit Owner and SECURITY DEFINER Preservation", () => {
    assert.ok(sql.includes("ALTER FUNCTION public.place_order(\n  TEXT, TEXT, UUID"), "Must explicitly alter place_order owner");
    assert.ok(sql.includes("OWNER TO postgres;"), "Must preserve postgres owner");
    assert.ok(sql.includes("SECURITY DEFINER"), "Must specify SECURITY DEFINER");
    assert.ok(sql.includes("SET search_path = public, pg_temp"), "Must pin search_path to public, pg_temp");
  });

  await t.test("5. Hardened Postconditions: Identity, Privileges, Volatility, Config", () => {
    assert.ok(sql.includes("v_po_rec.pronargs <> 49"), "Must assert exactly 49 arguments on place_order");
    assert.ok(sql.includes("v_po_rec.identity_args <> v_expected_po_identity"), "Must assert exact modern identity arguments");
    assert.ok(sql.includes("v_po_rec.owner_name <> 'postgres'"), "Must assert postgres owner in postcondition");
    assert.ok(sql.includes("has_function_privilege('service_role', v_po_rec.oid, 'EXECUTE')"), "Must assert service_role execute");
    assert.ok(sql.includes("has_function_privilege('anon', v_po_rec.oid, 'EXECUTE')"), "Must assert anon has NO execute");
    assert.ok(sql.includes("has_function_privilege('authenticated', v_po_rec.oid, 'EXECUTE')"), "Must assert authenticated has NO execute");
    assert.ok(sql.includes("has_function_privilege('public', v_po_rec.oid, 'EXECUTE')"), "Must assert public has NO execute");
  });
});

test("Stage B Migration A — Application Callers Parameter Verification [APPLICATION MOCK]", async (t) => {
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

test("Stage B Migration A — OrdersService Integration Behavior [APPLICATION MOCK]", async (t) => {
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

  const mockScopeResolver = { resolveMerchantScope: async (m) => m };
  const mockWhatsAppIntents = { resolveIntentForManualOrder: async () => {} };
  const mockJenniService = { lookupPricing: async () => ({ price: 3000 }) };

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
