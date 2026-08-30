/**
 * P1-2a: Admin override finance accrual — correctness and idempotency.
 *
 * F1: adminOverrideDeliveryStatus to "delivered" triggers finance accrual
 * F2: duplicate call is idempotent — settlement_status guard prevents double-post
 * F3: adminOverrideDeliveryStatus to "failed" or "returned" does NOT trigger finance
 */

import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ORDER_ID  = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID  = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const MERCHANT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function chain(getData) {
  const filters = {};
  const obj = {
    select()           { return this; },
    eq(col, val)       { filters[col] = val; return this; },
    in()               { return this; },
    order()            { return this; },
    limit()            { return this; },
    update()           { return this; },
    insert()           { return this; },
    upsert()           { return this; },
    maybeSingle: async () => getData(filters),
    single:      async () => getData(filters),
    then(resolve, reject) {
      return Promise.resolve(getData(filters)).then(resolve, reject);
    },
  };
  return obj;
}

/** Minimal mock finance/courier services used when constructing OrderFinanceService. */
function mockCourierFinance() {
  return {
    async postCourierAccrualForOrder() {},
    async evaluateCourierPayableTransition() {},
    async postCourierReversalForOrder() {},
  };
}

function mockCommercialEngine() {
  return {
    async resolveCommercialTerms() {
      return {
        commission_type: "percentage", commission_rate: 0, assisted_fee_rate: 0,
        platform_fee_rate: 0, delivery_billing_mode: "customer_pays",
        commission_rule_id: null, assisted_fee_rule_id: null,
        platform_fee_rule_id: null, delivery_billing_rule_id: null,
        plan_id: null, plan_code: null, commercial_snapshot_version: 0,
        plan_defaults: {
          default_commission_type: "percentage", default_commission_rate: 0,
          default_assisted_fee_rate: 0, default_platform_fee_rate: 0,
          default_delivery_billing_mode: "customer_pays",
        },
      };
    },
  };
}

// ─── F1: adminOverrideDeliveryStatus calls finance for delivered ──────────────

test("F1: adminOverrideDeliveryStatus to delivered triggers handleOrderStatusTransition", async () => {
  const { OrdersService } = await import("../dist/modules/orders/orders.service.js");

  const financeCallLog = [];
  const mockFinance = {
    async handleOrderStatusTransition(input) { financeCallLog.push(input); },
    async resolveCommercialTerms() { return {}; },
    computeOrderFinancialSnapshot() { return {}; },
  };

  const service = new OrdersService(
    { client: { from() { return chain(() => ({ data: null, error: null })); }, async rpc() { return { data: null, error: null }; } } },
    {}, {}, mockFinance, {},
  );

  await service.adminOverrideDeliveryStatus(ORDER_ID, "delivered", "customer requested", { actorRole: "admin", actorId: ADMIN_ID });

  assert.equal(financeCallLog.length, 1, "handleOrderStatusTransition must be called exactly once");
  assert.equal(financeCallLog[0].nextStatus,  "delivered", "nextStatus must be delivered");
  assert.equal(financeCallLog[0].orderId,     ORDER_ID,   "orderId must match");
  assert.equal(financeCallLog[0].actorId,     ADMIN_ID,   "actorId must be passed through");
  assert.notEqual(financeCallLog[0].previousStatus, "delivered", "previousStatus must not be delivered (guards movedToDelivered)");
});

// ─── F2: handleOrderStatusTransition is idempotent via settlement_status guard ─

test("F2: duplicate delivered transition is idempotent — settlement_status guard short-circuits accrual", async () => {
  const { OrderFinanceService } = await import("../dist/modules/finance/order-finance.service.js");

  const ledgerCallLog = [];

  /**
   * Settlement status starts as "not_accrued" for the first call.
   * After the first call, postMerchantAccrualEntries would set it to "accrued"
   * (in the real DB; we simulate this by toggling the variable below).
   */
  let settlementStatus = "not_accrued";

  const supabase = {
    client: {
      from(table) {
        return chain((filters) => {
          if (table === "orders") {
            return {
              data: {
                id: ORDER_ID,
                merchant_id: MERCHANT_ID,
                settlement_status: settlementStatus,
                financial_snapshot_version: 1,
                merchant_gross_amount: 10000,
                merchant_net_amount: 9000,
                platform_commission_amount: 500,
                platform_assisted_fee_amount: 0,
                platform_extra_fee_amount: 0,
                courier_fee_payable: 3000,
                delivery_fee_charged: 3000,
                currency_code: "IQD",
              },
              error: null,
            };
          }
          if (table === "merchant_ledger_entries") {
            ledgerCallLog.push("upsert");
            return { data: null, error: null };
          }
          if (table === "order_finance_events") {
            return { data: null, error: null };
          }
          // evaluatePayableTransition reads orders again
          return { data: { id: ORDER_ID, payment_method: "cod", settlement_status: settlementStatus, collection_status: "not_collected", payment_status: "unpaid" }, error: null };
        });
      },
      async rpc() { return { data: null, error: null }; },
    },
  };

  const service = new OrderFinanceService(supabase, mockCourierFinance(), mockCommercialEngine());

  // First call — settlement_status = "not_accrued" → accrual should run
  await service.handleOrderStatusTransition({ orderId: ORDER_ID, previousStatus: "pending", nextStatus: "delivered" });
  const afterFirst = ledgerCallLog.length;
  assert.ok(afterFirst > 0, `First call must post ledger entries (got ${afterFirst})`);

  // Simulate DB update: settlement_status is now "accrued"
  settlementStatus = "accrued";

  // Second call — settlement_status = "accrued" → early return, NO new ledger entries
  await service.handleOrderStatusTransition({ orderId: ORDER_ID, previousStatus: "pending", nextStatus: "delivered" });
  assert.equal(
    ledgerCallLog.length,
    afterFirst,
    `Second call must NOT post additional ledger entries (expected ${afterFirst}, got ${ledgerCallLog.length})`,
  );
});

// ─── F3: adminOverrideDeliveryStatus to failed/returned skips finance ─────────

test("F3: adminOverrideDeliveryStatus to failed does NOT trigger handleOrderStatusTransition", async () => {
  const { OrdersService } = await import("../dist/modules/orders/orders.service.js");

  const financeCallLog = [];
  const mockFinance = {
    async handleOrderStatusTransition(input) { financeCallLog.push(input); },
    async resolveCommercialTerms() { return {}; },
    computeOrderFinancialSnapshot() { return {}; },
  };

  const service = new OrdersService(
    { client: { from() { return chain(() => ({ data: null, error: null })); }, async rpc() { return { data: null, error: null }; } } },
    {}, {}, mockFinance, {},
  );

  const actor = { actorRole: "admin", actorId: ADMIN_ID };

  await service.adminOverrideDeliveryStatus(ORDER_ID, "failed", "customer refused", actor);
  assert.equal(financeCallLog.length, 0, "failed override must NOT call handleOrderStatusTransition");

  await service.adminOverrideDeliveryStatus(ORDER_ID, "returned", "customer returned", actor);
  assert.equal(financeCallLog.length, 0, "returned override must NOT call handleOrderStatusTransition");
});
