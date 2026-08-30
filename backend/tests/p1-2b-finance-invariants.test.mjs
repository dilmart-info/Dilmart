/**
 * P1-2b: Finance invariants — focused property tests.
 *
 * G1: Duplicate accrual → no ledger entries posted (settlement_status guard)
 * G2: evaluatePayableTransition → conditions_not_met when COD not remitted
 * G3: evaluatePayableTransition → transitioned:true when COD remitted
 * G4: createPayoutBatch only queries entries for the specified merchant_id
 * G5: settlement_status regression guard — in_payout/settled → early return
 * G6: postMerchantReversalEntry twice → same idempotency_key (idempotent upsert)
 * G7: POST /admin/finance/manual-adjustments requires super_admin or admin role
 * G8: settlePayoutBatch updates orders.settlement_status to settled (R2 fix)
 * G9: settlePayoutBatch fetches order_ids from ledger entries and updates only payable/in_payout orders
 * G10: create_payout_batch_atomic migration advances orders to in_payout with payable guard (R1 fix)
 */

import "reflect-metadata"; // must precede any NestJS module import for Reflect.getMetadata to work
import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORDER_ID    = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MERCHANT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ADMIN_ID    = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chain(getData) {
  const filters = {};
  const obj = {
    select()              { return this; },
    eq(col, val)          { filters[col] = val; return this; },
    neq()                 { return this; },
    in()                  { return this; },
    is()                  { return this; },
    order()               { return this; },
    limit()               { return this; },
    update()              { return this; },
    upsert()              { return this; },
    insert()              { return this; },
    maybeSingle: async () => getData(filters),
    single:      async () => getData(filters),
    then(resolve, reject) {
      return Promise.resolve(getData(filters)).then(resolve, reject);
    },
  };
  return obj;
}

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

// ─── G1: Duplicate accrual — settlement_status guard short-circuits ───────────

test("G1: handleOrderStatusTransition skips accrual when settlement_status=accrued", async () => {
  const { OrderFinanceService } = await import("../dist/modules/finance/order-finance.service.js");

  const ledgerCallLog = [];

  const supabase = {
    client: {
      from(table) {
        return chain((filters) => {
          if (table === "orders") {
            return {
              data: {
                id: ORDER_ID,
                merchant_id: MERCHANT_ID,
                settlement_status: "accrued",
                financial_snapshot_version: 1,
              },
              error: null,
            };
          }
          if (table === "merchant_ledger_entries") {
            ledgerCallLog.push("upsert");
            return { data: null, error: null };
          }
          return { data: null, error: null };
        });
      },
      async rpc() { return { data: null, error: null }; },
    },
  };

  const service = new OrderFinanceService(supabase, mockCourierFinance(), mockCommercialEngine());
  await service.handleOrderStatusTransition({ orderId: ORDER_ID, previousStatus: "pending", nextStatus: "delivered" });

  assert.equal(
    ledgerCallLog.length,
    0,
    "No ledger entries must be posted when settlement_status=accrued (early-exit guard)",
  );
});

// ─── G2: evaluatePayableTransition → conditions_not_met when COD not remitted ─

test("G2: evaluatePayableTransition returns conditions_not_met when collection_status=not_collected", async () => {
  const { OrderFinanceService } = await import("../dist/modules/finance/order-finance.service.js");

  const supabase = {
    client: {
      from(table) {
        return chain(() => {
          if (table === "orders") {
            return {
              data: {
                id: ORDER_ID,
                merchant_id: MERCHANT_ID,
                status: "delivered",
                payment_method: "cod",
                payment_status: "unpaid",
                collection_status: "not_collected",
                settlement_status: "accrued",
                courier_cod_remittance_mode: "gross_remittance",
                cash_gross_expected_amount: 5000,
                cash_net_expected_from_courier: 0,
                cash_actual_remitted_amount: 0,
              },
              error: null,
            };
          }
          return { data: null, error: null };
        });
      },
    },
  };

  const service = new OrderFinanceService(supabase, mockCourierFinance(), mockCommercialEngine());
  const result = await service.evaluatePayableTransition(ORDER_ID);

  assert.equal(result.transitioned, false, "Must not transition when COD not yet remitted");
  assert.equal(result.reason, "conditions_not_met", "Reason must be conditions_not_met");
});

// ─── G3: evaluatePayableTransition → transitioned:true when COD remitted ──────

test("G3: evaluatePayableTransition returns transitioned:true when collection_status=remitted_to_platform", async () => {
  const { OrderFinanceService } = await import("../dist/modules/finance/order-finance.service.js");

  const supabase = {
    client: {
      from(table) {
        return chain(() => {
          if (table === "orders") {
            return {
              data: {
                id: ORDER_ID,
                merchant_id: MERCHANT_ID,
                status: "delivered",
                payment_method: "cod",
                payment_status: "unpaid",
                collection_status: "remitted_to_platform",
                settlement_status: "accrued",
                courier_cod_remittance_mode: "gross_remittance",
                cash_gross_expected_amount: 5000,
                cash_net_expected_from_courier: 0,
                cash_actual_remitted_amount: 5000,
              },
              error: null,
            };
          }
          // merchant_ledger_entries update and order_finance_events insert succeed silently
          return { data: null, error: null };
        });
      },
    },
  };

  const service = new OrderFinanceService(supabase, mockCourierFinance(), mockCommercialEngine());
  const result = await service.evaluatePayableTransition(ORDER_ID);

  assert.equal(result.transitioned, true, "Must transition to payable when COD remitted and actual >= expected");
});

// ─── G4: createPayoutBatch passes merchant_id to the atomic RPC ───────────────
// Updated for P1-6: the old three-write flow is replaced by create_payout_batch_atomic.
// We now verify p_merchant_id is passed to the RPC, not that an eq() filter is set.

test("G4: createPayoutBatch passes p_merchant_id to create_payout_batch_atomic RPC", async () => {
  const { AdminService } = await import("../dist/modules/admin/admin.service.js");

  const rpcCalls = [];

  const supabase = {
    client: {
      from() { throw new Error("from() must not be called after P1-6 refactor"); },
      async rpc(name, args) {
        rpcCalls.push({ name, args });
        return { data: { ok: true, empty: false, entries_count: 1, batch: { id: "batch-1", merchant_id: MERCHANT_ID, status: "draft" } }, error: null };
      },
    },
  };

  const service = new AdminService(supabase, {}, {}, {}, {}, {}, {}, {});
  await service.createPayoutBatch({ merchant_id: MERCHANT_ID }, { actorRole: "admin", actorId: ADMIN_ID });

  assert.equal(rpcCalls.length, 1, "Exactly one RPC call must be made");
  assert.equal(rpcCalls[0].name, "create_payout_batch_atomic",
    "Must call create_payout_batch_atomic");
  assert.equal(rpcCalls[0].args.p_merchant_id, MERCHANT_ID,
    `p_merchant_id must equal ${MERCHANT_ID}`);
});

// ─── G5: settlement_status regression guard ───────────────────────────────────

test("G5a: evaluatePayableTransition returns already_payable_or_beyond when settlement_status=in_payout", async () => {
  const { OrderFinanceService } = await import("../dist/modules/finance/order-finance.service.js");

  const updateCallLog = [];

  const supabase = {
    client: {
      from(table) {
        if (table === "orders") {
          const obj = {
            select()               { return this; },
            eq()                   { return this; },
            neq()                  { return this; },
            update(data)           { updateCallLog.push(data); return this; },
            maybeSingle: async () => ({
              data: {
                id: ORDER_ID,
                merchant_id: MERCHANT_ID,
                status: "delivered",
                payment_method: "cod",
                payment_status: "unpaid",
                collection_status: "remitted_to_platform",
                settlement_status: "in_payout",
                courier_cod_remittance_mode: "gross_remittance",
                cash_gross_expected_amount: 0,
                cash_net_expected_from_courier: 0,
                cash_actual_remitted_amount: 0,
              },
              error: null,
            }),
            then(resolve, reject) { return this.maybeSingle().then(resolve, reject); },
          };
          return obj;
        }
        return chain(() => ({ data: null, error: null }));
      },
    },
  };

  const service = new OrderFinanceService(supabase, mockCourierFinance(), mockCommercialEngine());
  const result = await service.evaluatePayableTransition(ORDER_ID);

  assert.equal(result.transitioned, false, "Must not re-transition when already in_payout");
  assert.equal(result.reason, "already_payable_or_beyond");
  assert.equal(updateCallLog.length, 0, "No orders update must fire when already in_payout");
});

test("G5b: evaluatePayableTransition returns already_payable_or_beyond when settlement_status=settled", async () => {
  const { OrderFinanceService } = await import("../dist/modules/finance/order-finance.service.js");

  const supabase = {
    client: {
      from(table) {
        return chain(() => {
          if (table === "orders") {
            return {
              data: {
                id: ORDER_ID,
                merchant_id: MERCHANT_ID,
                status: "delivered",
                payment_method: "cod",
                payment_status: "unpaid",
                collection_status: "remitted_to_platform",
                settlement_status: "settled",
                courier_cod_remittance_mode: "gross_remittance",
                cash_gross_expected_amount: 0,
                cash_net_expected_from_courier: 0,
                cash_actual_remitted_amount: 0,
              },
              error: null,
            };
          }
          return { data: null, error: null };
        });
      },
    },
  };

  const service = new OrderFinanceService(supabase, mockCourierFinance(), mockCommercialEngine());
  const result = await service.evaluatePayableTransition(ORDER_ID);

  assert.equal(result.transitioned, false);
  assert.equal(result.reason, "already_payable_or_beyond");
});

// ─── G6: Reversal idempotency — same idempotency_key on both calls ─────────────

test("G6: postMerchantReversalEntry called twice uses the same idempotency_key", async () => {
  const { OrderFinanceService } = await import("../dist/modules/finance/order-finance.service.js");

  const upsertKeys = [];

  const supabase = {
    client: {
      from(table) {
        if (table === "merchant_ledger_entries") {
          const obj = {
            select()              { return this; },
            eq()                  { return this; },
            update()              { return this; },
            upsert(data)          { upsertKeys.push(data?.idempotency_key ?? null); return this; },
            maybeSingle: async () => ({ data: null, error: null }),
            single:      async () => ({ data: null, error: null }),
            then(resolve, reject) {
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            },
          };
          return obj;
        }
        if (table === "orders") {
          return chain(() => ({
            data: {
              id: ORDER_ID,
              merchant_id: MERCHANT_ID,
              settlement_status: "accrued",
              courier_settlement_status: "accrued",
              merchant_net_amount: 8000,
              currency_code: "IQD",
            },
            error: null,
          }));
        }
        return chain(() => ({ data: null, error: null }));
      },
    },
  };

  const service = new OrderFinanceService(supabase, mockCourierFinance(), mockCommercialEngine());

  // movedToReversal = (previousStatus === "delivered") && (nextStatus === "cancelled")
  await service.handleOrderStatusTransition({ orderId: ORDER_ID, previousStatus: "delivered", nextStatus: "cancelled" });
  await service.handleOrderStatusTransition({ orderId: ORDER_ID, previousStatus: "delivered", nextStatus: "cancelled" });

  assert.ok(upsertKeys.length >= 2, `Expected at least 2 ledger upsert calls, got ${upsertKeys.length}`);
  const [key1, key2] = upsertKeys;
  assert.ok(key1, "First reversal upsert must carry an idempotency_key");
  assert.equal(key1, key2, "Both reversal calls must use the identical idempotency_key (DB dedup via ignoreDuplicates:true)");
});

// ─── G7: Manual-adjustment route is admin-only ────────────────────────────────

test("G7: AdminController.createManualAdjustment is decorated with roles=[super_admin, admin]", async () => {
  const { AdminController } = await import("../dist/modules/admin/admin.controller.js");

  // NestJS SetMetadata stores metadata on descriptor.value (the method fn), not on prototype+key
  const method = AdminController.prototype.createManualAdjustment;
  const roles = Reflect.getMetadata("roles", method);
  assert.ok(Array.isArray(roles) && roles.length > 0,
    `roles metadata must be a non-empty array on createManualAdjustment — got: ${JSON.stringify(roles)}`);
  assert.ok(
    roles.includes("super_admin") || roles.includes("admin"),
    `roles must include super_admin or admin — got: ${JSON.stringify(roles)}`,
  );
});

// ─── G8: settlePayoutBatch updates orders.settlement_status to settled ─────────

test("G8: settlePayoutBatch updates orders.settlement_status to settled for impacted orders", async () => {
  const { AdminService } = await import("../dist/modules/admin/admin.service.js");

  const BATCH_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const LEDGER_ID_1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const ordersUpdateCalls = [];

  const supabase = {
    client: {
      from(table) {
        const filters = { eqs: {}, ins: {} };
        const obj = {
          select()              { return this; },
          eq(col, val)          { filters.eqs[col] = val; return this; },
          neq()                 { return this; },
          in(col, vals)         { filters.ins[col] = vals; return this; },
          is()                  { return this; },
          order()               { return this; },
          limit()               { return this; },
          update(data)          {
            if (table === "orders" && data?.settlement_status === "settled") {
              ordersUpdateCalls.push({ data, filters: { ...filters } });
            }
            return this;
          },
          upsert()              { return this; },
          insert()              { return this; },
          maybeSingle: async () => {
            if (table === "merchant_payout_batches") {
              return {
                data: { id: BATCH_ID, status: "approved", locked_at: new Date().toISOString() },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          single: async () => ({ data: null, error: null }),
          then(resolve, reject) {
            // For merchant_payout_batch_items select
            if (table === "merchant_payout_batch_items") {
              return Promise.resolve({
                data: [{ merchant_ledger_entry_id: LEDGER_ID_1 }],
                error: null,
              }).then(resolve, reject);
            }
            // For merchant_ledger_entries select (order_id lookup)
            if (table === "merchant_ledger_entries" && !filters.ins.id) {
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            }
            if (table === "merchant_ledger_entries" && filters.ins.id) {
              return Promise.resolve({
                data: [{ order_id: ORDER_ID }],
                error: null,
              }).then(resolve, reject);
            }
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          },
        };
        return obj;
      },
    },
  };

  const service = new AdminService(supabase, {}, {}, {}, {}, {}, {}, {});
  const result = await service.settlePayoutBatch(BATCH_ID, { actorRole: "admin", actorId: ADMIN_ID });

  assert.equal(result.ok, true, "settlePayoutBatch must succeed");
  assert.ok(
    ordersUpdateCalls.length >= 1,
    `Expected at least 1 orders update with settlement_status=settled, got ${ordersUpdateCalls.length}`,
  );
  const call = ordersUpdateCalls[0];
  assert.equal(call.data.settlement_status, "settled", "orders.settlement_status must be set to settled");
});

// ─── G9: settlePayoutBatch only updates payable/in_payout orders ──────────────

test("G9: settlePayoutBatch restricts order update to payable or in_payout settlement_status", async () => {
  const { AdminService } = await import("../dist/modules/admin/admin.service.js");

  const BATCH_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const LEDGER_ID_1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const ordersInCalls = [];

  const supabase = {
    client: {
      from(table) {
        const filters = { eqs: {}, ins: {} };
        const obj = {
          select()              { return this; },
          eq(col, val)          { filters.eqs[col] = val; return this; },
          neq()                 { return this; },
          in(col, vals)         {
            filters.ins[col] = vals;
            if (table === "orders" && col === "settlement_status") {
              ordersInCalls.push(vals);
            }
            return this;
          },
          is()                  { return this; },
          order()               { return this; },
          limit()               { return this; },
          update()              { return this; },
          upsert()              { return this; },
          insert()              { return this; },
          maybeSingle: async () => {
            if (table === "merchant_payout_batches") {
              return {
                data: { id: BATCH_ID, status: "approved", locked_at: new Date().toISOString() },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          single: async () => ({ data: null, error: null }),
          then(resolve, reject) {
            if (table === "merchant_payout_batch_items") {
              return Promise.resolve({
                data: [{ merchant_ledger_entry_id: LEDGER_ID_1 }],
                error: null,
              }).then(resolve, reject);
            }
            if (table === "merchant_ledger_entries" && filters.ins.id) {
              return Promise.resolve({
                data: [{ order_id: ORDER_ID }],
                error: null,
              }).then(resolve, reject);
            }
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          },
        };
        return obj;
      },
    },
  };

  const service = new AdminService(supabase, {}, {}, {}, {}, {}, {}, {});
  await service.settlePayoutBatch(BATCH_ID, { actorRole: "admin", actorId: ADMIN_ID });

  assert.ok(
    ordersInCalls.length >= 1,
    `Expected at least 1 .in('settlement_status', ...) call on orders, got ${ordersInCalls.length}`,
  );
  const allowedStatuses = ordersInCalls[0];
  assert.ok(
    allowedStatuses.includes("payable") && allowedStatuses.includes("in_payout"),
    `Orders update must restrict to payable and in_payout — got: ${JSON.stringify(allowedStatuses)}`,
  );
  assert.ok(
    !allowedStatuses.includes("disputed") && !allowedStatuses.includes("settled"),
    `Orders update must NOT include disputed or settled — got: ${JSON.stringify(allowedStatuses)}`,
  );
});

// ─── G10: R1 verification — migration SQL contains Phase 5 with payable guard ─

test("G10: create_payout_batch_atomic migration advances orders to in_payout with payable guard", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");

  const migrationPath = resolve(
    import.meta.dirname,
    "..",
    "..",
    "supabase",
    "migrations",
    "20260630120000_fix_merchant_payout_order_settlement_status.sql",
  );

  const sql = readFileSync(migrationPath, "utf-8");

  // Verify Phase 5 UPDATE exists.
  assert.ok(
    sql.includes("settlement_status = 'in_payout'"),
    "Migration must contain: settlement_status = 'in_payout'",
  );

  // Verify it targets public.orders.
  assert.ok(
    sql.includes("UPDATE public.orders"),
    "Migration must contain: UPDATE public.orders",
  );

  // Verify the payable guard prevents regression.
  assert.ok(
    sql.includes("settlement_status = 'payable'"),
    "Migration must contain guard: AND settlement_status = 'payable'",
  );

  // Verify Phase 5 comment exists (documentation for future readers).
  assert.ok(
    sql.includes("Phase 5"),
    "Migration must document the new phase as 'Phase 5'",
  );
});

// ─── G11: Idempotency constraint verification — migration SQL contains unique constraint on order_finance_events ─

test("G11: add_unique_constraint_order_finance_events migration adds unique constraint with guard", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");

  const migrationPath = resolve(
    import.meta.dirname,
    "..",
    "..",
    "supabase",
    "migrations",
    "20260630130000_add_unique_constraint_order_finance_events.sql",
  );

  const sql = readFileSync(migrationPath, "utf-8");

  // Verify UNIQUE (idempotency_key) exists
  assert.ok(
    sql.includes("UNIQUE (idempotency_key)"),
    "Migration must contain: UNIQUE (idempotency_key)",
  );

  // Verify ALTER TABLE public.order_finance_events exists
  assert.ok(
    sql.includes("ALTER TABLE public.order_finance_events"),
    "Migration must contain: ALTER TABLE public.order_finance_events",
  );

  // Verify ADD CONSTRAINT exists
  assert.ok(
    sql.includes("ADD CONSTRAINT"),
    "Migration must contain: ADD CONSTRAINT",
  );

  // Verify guard checks exists
  assert.ok(
    sql.includes("IF NOT EXISTS"),
    "Migration must contain guard: IF NOT EXISTS",
  );

  // Verify pg_constraint lookup exists
  assert.ok(
    sql.includes("pg_constraint"),
    "Migration must query pg_constraint table: pg_constraint",
  );
});

