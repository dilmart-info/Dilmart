/**
 * P1-2 Order Lifecycle Smoke Tests — service-level, no DB required.
 *
 * E1: adminOverrideDeliveryStatus does NOT call handleOrderStatusTransition
 *     (gap: finance accrual is skipped for admin-overridden deliveries)
 * E2: assignOrderToAgent rejects when delivery company not yet assigned
 * E3: assignOrderToAgent rejects when agent belongs to a different delivery company
 * E4: cancelOrder rejects delivered/returned orders
 * E5: delivery state machine rejects invalid transition (delivered → picked_up)
 */

import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ORDER_ID     = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT_ID     = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COMPANY_A    = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const COMPANY_B    = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ADMIN_ID     = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function chain(getData) {
  const filters = {};
  const obj = {
    select()          { return this; },
    eq(col, val)      { filters[col] = val; return this; },
    in()              { return this; },
    order()           { return this; },
    limit()           { return this; },
    update()          { return this; },
    maybeSingle: async () => getData(filters),
    single:      async () => getData(filters),
    then(resolve, reject) {
      return Promise.resolve(getData(filters)).then(resolve, reject);
    },
  };
  return obj;
}

// ─── E1: adminOverrideDeliveryStatus skips finance accrual ───────────────────

test("E1: adminOverrideDeliveryStatus to delivered invokes handleOrderStatusTransition with nextStatus=delivered", async () => {
  const { OrdersService } = await import("../dist/modules/orders/orders.service.js");

  const financeCallLog = [];
  const mockFinanceService = {
    async resolveCommercialTerms() { return {}; },
    computeOrderFinancialSnapshot() { return {}; },
    async handleOrderStatusTransition(input) {
      financeCallLog.push(input);
    },
  };

  const mockDeliveryOps = {
    async assignOrderToAgent() {},
    async clearOrderAgent() {},
    async markPickedUp() {},
    async markInTransit() {},
    async markDelivered() {},
    async markFailed() {},
    async markCancelled() {},
    async addDeliveryNote() {},
    async listDeliveryEvents() { return { events: [] }; },
    async assertAgentCanOperate() {},
  };

  const mockSupabase = {
    client: {
      from() { return chain(() => ({ data: null, error: null })); },
      async rpc() { return { data: null, error: null }; },
    },
  };

  const service = new OrdersService(
    mockSupabase,
    {},
    {},
    mockFinanceService,
    mockDeliveryOps,
  );

  const actor = { actorRole: "admin", actorId: ADMIN_ID };
  await service.adminOverrideDeliveryStatus(ORDER_ID, "delivered", "manual correction", actor);

  assert.equal(financeCallLog.length, 1, `handleOrderStatusTransition must be called once — got ${financeCallLog.length}`);
  assert.equal(financeCallLog[0].nextStatus, "delivered");
  assert.equal(financeCallLog[0].orderId, ORDER_ID);
});

// ─── E2: assignOrderToAgent requires delivery company first ──────────────────

test("E2: assignOrderToAgent rejects when delivery_company_id not set on order", async () => {
  const { DeliveryOperationsService } = await import("../dist/modules/shipping/delivery-operations.service.js");

  const supabase = {
    client: {
      from(table) {
        return chain(() => {
          if (table === "orders") {
            // Order has no delivery_company_id assigned yet
            return { data: { id: ORDER_ID, status: "pending", delivery_status: "pending_assignment", delivery_company_id: null, agent_id: null }, error: null };
          }
          return { data: null, error: null };
        });
      },
    },
  };

  const service = new DeliveryOperationsService(supabase, {});
  const actor = { actorType: "admin", actorId: ADMIN_ID };

  await assert.rejects(
    () => service.assignOrderToAgent(ORDER_ID, AGENT_ID, actor),
    /assign delivery company before assigning an agent/i,
  );
});

// ─── E3: assignOrderToAgent rejects agent from different company ──────────────

test("E3: assignOrderToAgent rejects agent whose delivery_company_id differs from order", async () => {
  const { DeliveryOperationsService } = await import("../dist/modules/shipping/delivery-operations.service.js");

  const supabase = {
    client: {
      from(table) {
        return chain((filters) => {
          if (table === "orders") {
            return {
              data: {
                id: ORDER_ID,
                status: "pending",
                delivery_status: "assigned_to_company",
                delivery_company_id: COMPANY_A,  // order belongs to company A
                agent_id: null,
              },
              error: null,
            };
          }
          if (table === "profiles") {
            return {
              data: {
                id: AGENT_ID,
                role: "agent",
                is_active: true,
                delivery_company_id: COMPANY_B,  // agent belongs to company B — mismatch
              },
              error: null,
            };
          }
          return { data: null, error: null };
        });
      },
    },
  };

  const service = new DeliveryOperationsService(supabase, {});
  const actor = { actorType: "admin", actorId: ADMIN_ID };

  await assert.rejects(
    () => service.assignOrderToAgent(ORDER_ID, AGENT_ID, actor),
    /different delivery company/i,
  );
});

// ─── E4: cancelOrder rejects delivered or returned orders ────────────────────

test("E4: cancelOrder rejects a delivered order", async () => {
  const { OrdersService } = await import("../dist/modules/orders/orders.service.js");

  const supabase = {
    client: {
      from(table) {
        return chain(() => {
          if (table === "orders") {
            return {
              data: {
                id: ORDER_ID,
                status: "delivered",
                delivery_status: "delivered",
                merchant_id: "m1",
              },
              error: null,
            };
          }
          return { data: null, error: null };
        });
      },
    },
  };

  const service = new OrdersService(supabase, {}, {}, {}, {});
  const actor = { actorRole: "admin", actorId: ADMIN_ID };

  await assert.rejects(
    () => service.cancelOrder(ORDER_ID, "wrong order", actor),
    /delivered or returned orders cannot be cancelled/i,
  );
});

// ─── E5: state machine rejects invalid transition ────────────────────────────

test("E5: delivery state machine rejects delivered → picked_up (invalid back-transition)", async () => {
  const { DeliveryOperationsService } = await import("../dist/modules/shipping/delivery-operations.service.js");

  const supabase = {
    client: {
      from(table) {
        return chain(() => {
          if (table === "orders") {
            // Order is already delivered
            return {
              data: {
                id: ORDER_ID,
                status: "delivered",
                delivery_status: "delivered",
                delivery_company_id: COMPANY_A,
                agent_id: AGENT_ID,
                delivery_sla_due_at: null,
                delivery_sla_breached: false,
                delivery_assigned_at: null,
              },
              error: null,
            };
          }
          return { data: null, error: null };
        });
      },
    },
  };

  const service = new DeliveryOperationsService(supabase, {});
  const actor = { actorType: "admin", actorId: ADMIN_ID };

  await assert.rejects(
    () => service.markPickedUp(ORDER_ID, actor),
    /invalid delivery status transition/i,
  );
});
