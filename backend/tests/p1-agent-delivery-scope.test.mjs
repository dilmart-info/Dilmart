/**
 * P1-1 tests: Agent delivery scope enforcement.
 *
 * Section D — Service-level (no HTTP):
 *   D1-D3  DeliveryOperationsService.assertAgentCanOperate
 *   D4-D5  OrdersService delivery scope ordering (scope check before side effects)
 */

import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const AGENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORDER_AGENT_A = "11111111-1111-4111-8111-111111111111";
const ORDER_AGENT_B = "22222222-2222-4222-8222-222222222222";
const ORDER_UNASSIGNED = "33333333-3333-4333-8333-333333333333";

const ORDER_AGENT_MAP = {
  [ORDER_AGENT_A]: AGENT_A,
  [ORDER_AGENT_B]: AGENT_B,
  [ORDER_UNASSIGNED]: null,
};

/**
 * Build a thenable Supabase query-builder chain.
 * Supports `.eq()`, `.maybeSingle()`, and direct await via `.then()`.
 */
function chain(getData) {
  const filters = {};
  const obj = {
    select() { return this; },
    eq(col, val) { filters[col] = val; return this; },
    in() { return this; },
    order() { return this; },
    limit() { return this; },
    maybeSingle: async () => getData(filters),
    single: async () => getData(filters),
    then(resolve, reject) {
      return Promise.resolve(getData(filters)).then(resolve, reject);
    },
  };
  return obj;
}

/** Mock SupabaseAdminService: returns agent_id keyed by order id. */
function scopeSupabase() {
  return {
    client: {
      from(table) {
        return chain((filters) => {
          if (table === "orders") {
            const orderId = filters["id"];
            if (Object.prototype.hasOwnProperty.call(ORDER_AGENT_MAP, orderId)) {
              return { data: { id: orderId, agent_id: ORDER_AGENT_MAP[orderId] }, error: null };
            }
          }
          return { data: null, error: null };
        });
      },
    },
  };
}

/**
 * Spy DeliveryOperationsService that re-implements the scope check and tracks calls.
 * Used to verify call ordering in D4/D5 without hitting the real DB.
 */
function mockDeliveryOpsService() {
  const callLog = [];
  return {
    callLog,
    async assertAgentCanOperate(orderId, actorId) {
      callLog.push("assertAgentCanOperate");
      if (!actorId) {
        throw Object.assign(new Error("Missing actor identity."), { status: 403 });
      }
      if (!Object.prototype.hasOwnProperty.call(ORDER_AGENT_MAP, orderId)) {
        throw Object.assign(new Error("Order not found."), { status: 404 });
      }
      const agentId = ORDER_AGENT_MAP[orderId];
      if (String(agentId ?? "") !== actorId) {
        throw Object.assign(
          new Error("Agent can only update orders assigned to him."),
          { status: 403 },
        );
      }
    },
    async markPickedUp(_orderId, _actor) {
      callLog.push("markPickedUp");
      return { ok: true };
    },
    async markInTransit(_orderId, _actor) {
      callLog.push("markInTransit");
      return { ok: true };
    },
    async markDelivered(_orderId, _actor) {
      callLog.push("markDelivered");
      return { ok: true };
    },
    async markFailed(_orderId, _reasonCode, _notes, _actor) {
      callLog.push("markFailed");
      return { ok: true };
    },
    async addDeliveryNote(_orderId, _notes, _actor) {
      callLog.push("addDeliveryNote");
      return { ok: true };
    },
    async listDeliveryEvents(_orderId, _limit) {
      callLog.push("listDeliveryEvents");
      return [];
    },
  };
}

// ─── Section D: DeliveryOperationsService.assertAgentCanOperate ──────────────

test("D1: agent A can operate on order assigned to agent A (no throw)", async () => {
  const { DeliveryOperationsService } = await import("../dist/modules/shipping/delivery-operations.service.js");
  const service = new DeliveryOperationsService(scopeSupabase(), {});
  await assert.doesNotReject(
    () => service.assertAgentCanOperate(ORDER_AGENT_A, AGENT_A),
    "assertAgentCanOperate must not throw when agent matches the assigned agent",
  );
});

test("D2: agent A cannot operate on order assigned to agent B (ForbiddenException)", async () => {
  const { DeliveryOperationsService } = await import("../dist/modules/shipping/delivery-operations.service.js");
  const service = new DeliveryOperationsService(scopeSupabase(), {});
  await assert.rejects(
    () => service.assertAgentCanOperate(ORDER_AGENT_B, AGENT_A),
    /agent can only update orders assigned to him/i,
  );
});

test("D3: agent A cannot operate on unassigned order (agent_id = null)", async () => {
  const { DeliveryOperationsService } = await import("../dist/modules/shipping/delivery-operations.service.js");
  const service = new DeliveryOperationsService(scopeSupabase(), {});
  await assert.rejects(
    () => service.assertAgentCanOperate(ORDER_UNASSIGNED, AGENT_A),
    /agent can only update orders assigned to him/i,
  );
});

// ─── Section D: OrdersService scope-check ordering ───────────────────────────

test("D4: admin bypasses scope check — assertAgentCanOperate not called, markPickedUp is called", async () => {
  const { OrdersService } = await import("../dist/modules/orders/orders.service.js");
  const deliveryOps = mockDeliveryOpsService();

  // OrdersService(supabaseAdmin, scopeResolver, whatsAppIntentsService, orderFinanceService, deliveryOps)
  const service = new OrdersService(
    { client: {} },  // supabaseAdmin — unused in markDeliveryPickedUp
    {},              // scopeResolver — unused in delivery path
    {},              // whatsAppIntentsService — unused here
    {},              // orderFinanceService — unused here
    deliveryOps,
  );

  const adminActor = { actorRole: "admin", actorId: ADMIN_ID };
  await service.markDeliveryPickedUp(ORDER_AGENT_A, adminActor);

  assert.ok(
    !deliveryOps.callLog.includes("assertAgentCanOperate"),
    `admin must NOT trigger scope check — callLog: ${deliveryOps.callLog}`,
  );
  assert.ok(
    deliveryOps.callLog.includes("markPickedUp"),
    `admin must reach markPickedUp — callLog: ${deliveryOps.callLog}`,
  );
});

test("D5: scope check fires and rejects before markPickedUp when agent operates on wrong order", async () => {
  const { OrdersService } = await import("../dist/modules/orders/orders.service.js");
  const deliveryOps = mockDeliveryOpsService();

  const service = new OrdersService(
    { client: {} },
    {},
    {},
    {},
    deliveryOps,
  );

  const agentActor = { actorRole: "agent", actorId: AGENT_A };
  await assert.rejects(
    () => service.markDeliveryPickedUp(ORDER_AGENT_B, agentActor),
    /agent can only update orders assigned to him/i,
  );

  assert.ok(
    deliveryOps.callLog.includes("assertAgentCanOperate"),
    `scope check must have been called — callLog: ${deliveryOps.callLog}`,
  );
  assert.ok(
    !deliveryOps.callLog.includes("markPickedUp"),
    `markPickedUp must NOT be reached after scope rejection — callLog: ${deliveryOps.callLog}`,
  );
});
