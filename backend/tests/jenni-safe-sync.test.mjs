/**
 * Unit Tests: Safe Jenni shipment status sync
 *
 * Run: npm run build && node --test tests/jenni-safe-sync.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distRoot = join(__dirname, "..", "dist", "modules", "jenni");
const dist = (name) => import(pathToFileURL(join(distRoot, name)).href);

let JenniSyncService;

test("load compiled module", async () => {
  const mod = await dist("jenni-sync.service.js");
  JenniSyncService = mod.JenniSyncService;
  assert.ok(JenniSyncService, "JenniSyncService should be exported");
});

function createMockSupabase(dbState) {
  const calls = [];
  const client = {
    from(table) {
      return {
        select(cols) {
          calls.push({ method: "select", table, cols });
          return {
            eq(col1, val1) {
              calls.push({ method: "eq", table, col: col1, val: val1 });
              return {
                eq(col2, val2) {
                  calls.push({ method: "eq", table, col: col2, val: val2 });
                  return {
                    async maybeSingle() {
                      calls.push({ method: "maybeSingle", table });
                      if (table === "order_delivery_integrations") {
                        return { data: dbState.integration, error: null };
                      }
                      if (table === "orders") {
                        return { data: dbState.order, error: null };
                      }
                      return { data: null, error: null };
                    }
                  };
                },
                async maybeSingle() {
                  calls.push({ method: "maybeSingle", table });
                  if (table === "order_delivery_integrations") {
                    return { data: dbState.integration, error: null };
                  }
                  if (table === "orders") {
                    return { data: dbState.order, error: null };
                  }
                  return { data: null, error: null };
                }
              };
            }
          };
        },
        update(payload) {
          calls.push({ method: "update", table, payload });
          return {
            eq(col1, val1) {
              calls.push({ method: "eq", table, col: col1, val: val1 });
              return {
                eq(col2, val2) {
                  calls.push({ method: "eq", table, col: col2, val: val2 });
                  return {
                    then(cb) {
                      return Promise.resolve({ data: null, error: null }).then(cb);
                    }
                  };
                },
                then(cb) {
                  return Promise.resolve({ data: null, error: null }).then(cb);
                }
              };
            }
          };
        },
        insert(payload) {
          calls.push({ method: "insert", table, payload });
          return {
            then(cb) {
              if (table === "delivery_provider_sync_events" && dbState.duplicateSyncEvent) {
                return Promise.resolve({ error: { code: "23505", message: "duplicate key" } }).then(cb);
              }
              return Promise.resolve({ data: null, error: null }).then(cb);
            }
          };
        }
      };
    }
  };
  return { client, calls };
}

const mockDeliveryOps = {
  markPickedUp: async () => ({ ok: true }),
  markInTransit: async () => ({ ok: true }),
  markDelivered: async () => ({ ok: true }),
  markReturned: async () => ({ ok: true }),
  markFailed: async () => ({ ok: true }),
};

const mockOrderFinance = {
  handleOrderStatusTransition: async () => {},
};

test("syncOrderFromJenni calls query with correct shipment ID", async () => {
  const dbState = {
    integration: {
      order_id: "order-uuid",
      provider_shipment_id: "9311578",
      external_shipment_id: "order-uuid",
      external_shipment_number: "DUK-260430-2387",
    },
    order: {
      id: "order-uuid",
      delivery_status: "assigned_to_company",
      status: "new",
      total: 10000,
    }
  };

  const { client: mockClient, calls } = createMockSupabase(dbState);
  const mockSupabaseAdmin = { client: mockClient };

  const lastQueryArgs = [];
  const mockJenniClient = {
    systemCode() { return "TEST_SYS"; },
    async queryShipments(args) {
      lastQueryArgs.push(args);
      return {
        shipments: [
          {
            shipment_id: 9311578,
            shipment_number: "DUK-260430-2387",
            amount_iqd: 10000,
            current_step: "NEW_WITH_PA",
            current_step_ar: "جديدة مع المندوب",
            current_stage: "pickup",
          }
        ]
      };
    }
  };

  const service = new JenniSyncService(
    mockSupabaseAdmin,
    mockDeliveryOps,
    mockOrderFinance,
    mockJenniClient
  );

  const res = await service.syncOrderFromJenni("order-uuid");
  assert.ok(res.ok);
  assert.equal(lastQueryArgs.length, 1);
  assert.deepEqual(lastQueryArgs[0], { shipment_ids: [9311578] });

  // Verify DB update was executed with raw payload and current step
  const updateCall = calls.find(c => c.method === "update" && c.table === "order_delivery_integrations");
  assert.ok(updateCall);
  assert.equal(updateCall.payload.provider_current_step, "NEW_WITH_PA");
  assert.equal(updateCall.payload.provider_current_step_ar, "جديدة مع المندوب");
  assert.equal(updateCall.payload.provider_last_payload.shipment_id, 9311578);
  assert.ok(updateCall.payload.last_synced_at);
});

test("syncOrderFromJenni fails locally when provider_shipment_id is missing", async () => {
  const dbState = {
    integration: {
      order_id: "order-uuid",
      provider_shipment_id: null, // missing!
      external_shipment_id: "order-uuid",
      external_shipment_number: "DUK-260430-2387",
    }
  };

  const { client: mockClient } = createMockSupabase(dbState);
  const mockSupabaseAdmin = { client: mockClient };

  const mockJenniClient = {
    systemCode() { return "TEST_SYS"; },
    async queryShipments() {
      throw new Error("Should not be called");
    }
  };

  const service = new JenniSyncService(
    mockSupabaseAdmin,
    mockDeliveryOps,
    mockOrderFinance,
    mockJenniClient
  );

  await assert.rejects(
    () => service.syncOrderFromJenni("order-uuid"),
    (err) => {
      assert.equal(err.getStatus(), 400);
      assert.ok(err.message.includes("missing a linked Jenni Provider Shipment ID"));
      return true;
    }
  );
});

test("NEW_WITH_PA maps to assigned_to_company and does not mark as delivered/picked_up", async () => {
  const dbState = {
    integration: {
      order_id: "order-uuid",
      provider_shipment_id: "9311578",
      external_shipment_id: "order-uuid",
      external_shipment_number: "DUK-260430-2387",
    },
    order: {
      id: "order-uuid",
      delivery_status: "assigned_to_company",
      status: "new",
      total: 10000,
    }
  };

  const { client: mockClient, calls } = createMockSupabase(dbState);
  const mockSupabaseAdmin = { client: mockClient };

  const mockJenniClient = {
    systemCode() { return "TEST_SYS"; },
    async queryShipments() {
      return {
        shipments: [
          {
            shipment_id: 9311578,
            shipment_number: "DUK-260430-2387",
            current_step: "NEW_WITH_PA",
            amount_iqd: 10000,
          }
        ]
      };
    }
  };

  let deliveryTransitionCalled = false;
  const mockDeliveryOpsCustom = {
    ...mockDeliveryOps,
    markPickedUp() {
      deliveryTransitionCalled = true;
      return { ok: true };
    },
    markInTransit() {
      deliveryTransitionCalled = true;
      return { ok: true };
    }
  };

  const service = new JenniSyncService(
    mockSupabaseAdmin,
    mockDeliveryOpsCustom,
    mockOrderFinance,
    mockJenniClient
  );

  const res = await service.syncOrderFromJenni("order-uuid");
  assert.ok(res.ok);

  // Since NEW_WITH_PA maps to assigned_to_company, and order is already assigned_to_company,
  // the delivery transition is a no-op (current === target), so markPickedUp or markInTransit should not be called.
  assert.equal(deliveryTransitionCalled, false, "Should not mark as delivered or picked up");
});

test("Unknown status is stored safely without modifying delivery status", async () => {
  const dbState = {
    integration: {
      order_id: "order-uuid",
      provider_shipment_id: "9311578",
      external_shipment_id: "order-uuid",
      external_shipment_number: "DUK-260430-2387",
    },
    order: {
      id: "order-uuid",
      delivery_status: "assigned_to_company",
      status: "new",
      total: 10000,
    }
  };

  const { client: mockClient, calls } = createMockSupabase(dbState);
  const mockSupabaseAdmin = { client: mockClient };

  const mockJenniClient = {
    systemCode() { return "TEST_SYS"; },
    async queryShipments() {
      return {
        shipments: [
          {
            shipment_id: 9311578,
            shipment_number: "DUK-260430-2387",
            current_step: "SOME_UNKNOWN_STEP_COULD_BE_ANYTHING",
            amount_iqd: 10000,
          }
        ]
      };
    }
  };

  const mockDeliveryOpsCustom = {
    markPickedUp() { throw new Error("Should not be called"); },
    markInTransit() { throw new Error("Should not be called"); },
    markDelivered() { throw new Error("Should not be called"); },
  };

  const service = new JenniSyncService(
    mockSupabaseAdmin,
    mockDeliveryOpsCustom,
    mockOrderFinance,
    mockJenniClient
  );

  const res = await service.syncOrderFromJenni("order-uuid");
  assert.ok(res.ok);

  // Verify the integration record still gets updated with the step and last payload
  const updateCall = calls.find(c => c.method === "update" && c.table === "order_delivery_integrations");
  assert.ok(updateCall);
  assert.equal(updateCall.payload.provider_current_step, "SOME_UNKNOWN_STEP_COULD_BE_ANYTHING");
  assert.ok(updateCall.payload.provider_last_payload);
});

test("Manual sync on duplicate payload still updates last_synced_at", async () => {
  const dbState = {
    integration: {
      order_id: "order-uuid",
      provider_shipment_id: "9311578",
      external_shipment_id: "order-uuid",
      external_shipment_number: "DUK-260430-2387",
    },
    order: {
      id: "order-uuid",
      delivery_status: "assigned_to_company",
      status: "new",
      total: 10000,
    },
    duplicateSyncEvent: true, // triggers duplicate in mock recordSyncEvent
  };

  const { client: mockClient, calls } = createMockSupabase(dbState);
  const mockSupabaseAdmin = { client: mockClient };

  const mockJenniClient = {
    systemCode() { return "TEST_SYS"; },
    async queryShipments() {
      return {
        shipments: [
          {
            shipment_id: 9311578,
            shipment_number: "DUK-260430-2387",
            current_step: "NEW_WITH_PA",
            amount_iqd: 10000,
          }
        ]
      };
    }
  };

  const service = new JenniSyncService(
    mockSupabaseAdmin,
    mockDeliveryOps,
    mockOrderFinance,
    mockJenniClient
  );

  const res = await service.syncOrderFromJenni("order-uuid");
  assert.ok(res.ok);
  assert.equal(res.updated, false, "Should be duplicate, not updated");

  // Verify update of last_synced_at was still called on order_delivery_integrations
  const updateCall = calls.find(c => c.method === "update" && c.table === "order_delivery_integrations");
  assert.ok(updateCall);
  assert.ok(updateCall.payload.last_synced_at);
  assert.ok(updateCall.payload.updated_at);
});

test("Query response with step field instead of current_step normalizes to provider_current_step", async () => {
  const dbState = {
    integration: {
      order_id: "order-uuid",
      provider_shipment_id: "9311578",
      external_shipment_id: "order-uuid",
      external_shipment_number: "DUK-260430-2387",
    },
    order: {
      id: "order-uuid",
      delivery_status: "assigned_to_company",
      status: "new",
      total: 10000,
    }
  };

  const { client: mockClient, calls } = createMockSupabase(dbState);
  const mockSupabaseAdmin = { client: mockClient };

  const mockJenniClient = {
    systemCode() { return "TEST_SYS"; },
    async queryShipments() {
      return {
        shipments: [
          {
            shipment_id: 9311578,
            shipment_number: "DUK-260430-2387",
            step: "NEW_WITH_PA", // step field instead of current_step
            amount_iqd: 10000,
          }
        ]
      };
    }
  };

  const service = new JenniSyncService(
    mockSupabaseAdmin,
    mockDeliveryOps,
    mockOrderFinance,
    mockJenniClient
  );

  const res = await service.syncOrderFromJenni("order-uuid");
  assert.ok(res.ok);

  const updateCall = calls.find(c => c.method === "update" && c.table === "order_delivery_integrations");
  assert.ok(updateCall);
  assert.equal(updateCall.payload.provider_current_step, "NEW_WITH_PA");
  // Ensure the original un-normalized payload is preserved in provider_last_payload
  assert.equal(updateCall.payload.provider_last_payload.step, "NEW_WITH_PA");
  assert.equal(updateCall.payload.provider_last_payload.current_step, undefined);
});

test("Existing integration with dispatch_status='dispatched' remains 'dispatched' after manual sync", async () => {
  const dbState = {
    integration: {
      order_id: "order-uuid",
      provider_shipment_id: "9311578",
      external_shipment_id: "order-uuid",
      external_shipment_number: "DUK-260430-2387",
      dispatch_status: "dispatched",
    },
    order: {
      id: "order-uuid",
      delivery_status: "assigned_to_company",
      status: "new",
      total: 10000,
    }
  };

  const { client: mockClient, calls } = createMockSupabase(dbState);
  const mockSupabaseAdmin = { client: mockClient };

  const mockJenniClient = {
    systemCode() { return "TEST_SYS"; },
    async queryShipments() {
      return {
        shipments: [
          {
            shipment_id: 9311578,
            shipment_number: "DUK-260430-2387",
            current_step: "NEW_WITH_PA",
            amount_iqd: 10000,
          }
        ]
      };
    }
  };

  const service = new JenniSyncService(
    mockSupabaseAdmin,
    mockDeliveryOps,
    mockOrderFinance,
    mockJenniClient
  );

  const res = await service.syncOrderFromJenni("order-uuid");
  assert.ok(res.ok);

  const updateCall = calls.find(c => c.method === "update" && c.table === "order_delivery_integrations");
  assert.ok(updateCall);
  // Ensure update call payload does NOT contain dispatch_status, leaving it untouched in the database
  assert.equal(updateCall.payload.dispatch_status, undefined);
});

test("RTO_WITH_DA updates status to returned, saves event type provider_return with metadata", async () => {
  const dbState = {
    integration: {
      order_id: "order-uuid",
      provider_shipment_id: "9311578",
      external_shipment_id: "order-uuid",
      external_shipment_number: "DUK-260430-2387",
    },
    order: {
      id: "order-uuid",
      delivery_status: "in_transit",
      status: "preparing",
      total: 10000,
    }
  };

  const { client: mockClient, calls } = createMockSupabase(dbState);
  const mockSupabaseAdmin = { client: mockClient };

  let markReturnedCalled = false;
  const testDeliveryOps = {
    ...mockDeliveryOps,
    markReturned: async (orderId, subCode, reason, actor) => {
      markReturnedCalled = true;
      return { ok: true };
    }
  };

  const service = new JenniSyncService(
    mockSupabaseAdmin,
    testDeliveryOps,
    mockOrderFinance,
    { systemCode() { return "TEST_SYS"; } }
  );

  const update = {
    shipment_id: 9311578,
    shipment_number: "DUK-260430-2387",
    amount_iqd: 10000,
    current_step: "RTO_WITH_DA",
    return_reason: "customer refused",
  };

  const res = await service.applyProviderUpdate(update, "webhook");
  assert.ok(res.ok);
  assert.ok(markReturnedCalled, "markReturned should be called");

  const insertEventCall = calls.find(c => c.method === "insert" && c.table === "delivery_events");
  assert.ok(insertEventCall, "delivery_event should be inserted");
  assert.equal(insertEventCall.payload.event_type, "provider_return");
  assert.equal(insertEventCall.payload.metadata.return_reason, "customer refused");
});

test("PARTIALLY_DELIVERED sets event type provider_partially_delivered and keeps amount_change_flag aligned with mapper requiresAdminReview", async () => {
  const dbState = {
    integration: {
      order_id: "order-uuid",
      provider_shipment_id: "9311578",
      external_shipment_id: "order-uuid",
      external_shipment_number: "DUK-260430-2387",
    },
    order: {
      id: "order-uuid",
      delivery_status: "in_transit",
      status: "preparing",
      total: 10000,
    }
  };

  const { client: mockClient, calls } = createMockSupabase(dbState);
  const mockSupabaseAdmin = { client: mockClient };

  const service = new JenniSyncService(
    mockSupabaseAdmin,
    mockDeliveryOps,
    mockOrderFinance,
    { systemCode() { return "TEST_SYS"; } }
  );

  const update = {
    shipment_id: 9311578,
    shipment_number: "DUK-260430-2387",
    amount_iqd: 10000,
    current_step: "PARTIALLY_DELIVERED",
  };

  const res = await service.applyProviderUpdate(update, "webhook");
  assert.ok(res.ok);

  const updateCall = calls.find(c => c.method === "update" && c.table === "order_delivery_integrations");
  assert.ok(updateCall);
  assert.equal(updateCall.payload.amount_change_flag, true); // aligns with requiresAdminReview=true in mapper

  const insertEventCall = calls.find(c => c.method === "insert" && c.table === "delivery_events");
  assert.ok(insertEventCall);
  assert.equal(insertEventCall.payload.event_type, "provider_partially_delivered");
});

test("POSTPONED sets event type provider_postponed and saves postponed_reason in metadata", async () => {
  const dbState = {
    integration: {
      order_id: "order-uuid",
      provider_shipment_id: "9311578",
      external_shipment_id: "order-uuid",
      external_shipment_number: "DUK-260430-2387",
    },
    order: {
      id: "order-uuid",
      delivery_status: "in_transit",
      status: "preparing",
      total: 10000,
    }
  };

  const { client: mockClient, calls } = createMockSupabase(dbState);
  const mockSupabaseAdmin = { client: mockClient };

  const service = new JenniSyncService(
    mockSupabaseAdmin,
    mockDeliveryOps,
    mockOrderFinance,
    { systemCode() { return "TEST_SYS"; } }
  );

  const update = {
    shipment_id: 9311578,
    shipment_number: "DUK-260430-2387",
    amount_iqd: 10000,
    current_step: "POSTPONED",
    postponed_reason: "customer requested later",
  };

  const res = await service.applyProviderUpdate(update, "webhook");
  assert.ok(res.ok);

  const insertEventCall = calls.find(c => c.method === "insert" && c.table === "delivery_events");
  assert.ok(insertEventCall);
  assert.equal(insertEventCall.payload.event_type, "provider_postponed");
  assert.equal(insertEventCall.payload.metadata.postponed_reason, "customer requested later");
});

test("DELIVERED_PRICE_CHANGED with COD mismatch sets delivery status to delivered, sets amount_change_flag to true on mismatch", async () => {
  const dbState = {
    integration: {
      order_id: "order-uuid",
      provider_shipment_id: "9311578",
      external_shipment_id: "order-uuid",
      external_shipment_number: "DUK-260430-2387",
    },
    order: {
      id: "order-uuid",
      delivery_status: "in_transit",
      status: "preparing",
      cash_expected_amount: 10000,
      total: 10000,
    }
  };

  const { client: mockClient, calls } = createMockSupabase(dbState);
  const mockSupabaseAdmin = { client: mockClient };

  let markDeliveredCalled = false;
  const testDeliveryOps = {
    ...mockDeliveryOps,
    markDelivered: async (orderId, actor) => {
      markDeliveredCalled = true;
      return { ok: true };
    }
  };

  const service = new JenniSyncService(
    mockSupabaseAdmin,
    testDeliveryOps,
    mockOrderFinance,
    { systemCode() { return "TEST_SYS"; } }
  );

  const update = {
    shipment_id: 9311578,
    shipment_number: "DUK-260430-2387",
    amount_iqd: 7500, // Significant discrepancy: 7500 vs 10000 IQD expected
    current_step: "DELIVERED_PRICE_CHANGED",
  };

  const res = await service.applyProviderUpdate(update, "webhook");
  assert.ok(res.ok);
  assert.ok(markDeliveredCalled, "markDelivered should be called");

  const updateCall = calls.find(c => c.method === "update" && c.table === "order_delivery_integrations");
  assert.ok(updateCall);
  assert.equal(updateCall.payload.amount_change_flag, true);

  const insertEventCalls = calls.filter(c => c.method === "insert" && c.table === "delivery_events");
  assert.ok(insertEventCalls.length >= 1);
  assert.ok(insertEventCalls.some(c => c.payload.event_type === "amount_change_reported"));
});


