/**
 * Unit Tests: JenniDispatchService Dispatch Gate and store_id mapping
 *
 * Run: npm run build && node --test tests/jenni-dispatch-gate.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

function createMockConfig(allowed = "true") {
  return {
    get(key) {
      if (key === "JENNI_ALLOW_SHIPMENT_DISPATCH") return allowed;
      return null;
    }
  };
}

function createMockQueryChain(table, calls, integrationData, orderData, merchantData) {
  const chain = {
    eq(col, val) {
      calls.push({ method: "eq", table, col, val });
      return chain;
    },
    neq(col, val) {
      calls.push({ method: "neq", table, col, val });
      return chain;
    },
    async maybeSingle() {
      calls.push({ method: "maybeSingle", table });
      if (table === "orders") {
        return { data: orderData, error: null };
      }
      if (table === "merchants") {
        return { data: merchantData, error: null };
      }
      if (table === "order_delivery_integrations") {
        return { data: integrationData, error: null };
      }
      if (table === "governorates") {
        return { data: { id: "gov-uuid", name: "Baghdad", jenni_governorate_code: "BGD" }, error: null };
      }
      return { data: null, error: null };
    },
    then(onfulfilled) {
      let resolvedValue = { data: null, error: null };
      if (table === "order_items") {
        resolvedValue = { data: [{ quantity: 1, product_name: "Test Product" }], error: null };
      }
      return Promise.resolve(resolvedValue).then(onfulfilled);
    }
  };
  return chain;
}

function createMockSupabase(calls, integrationData, orderData, merchantData) {
  return {
    client: {
      from(table) {
        return {
          select(fields) {
            calls.push({ method: "select", table, fields });
            return createMockQueryChain(table, calls, integrationData, orderData, merchantData);
          },
          upsert(payload, opts) {
            calls.push({ method: "upsert", table, payload });
            return {
              async maybeSingle() { return { data: null, error: null }; },
              then(onfulfilled) {
                return Promise.resolve({ data: null, error: null }).then(onfulfilled);
              }
            };
          },
          insert(payload) {
            calls.push({ method: "insert", table, payload });
            return {
              async maybeSingle() { return { data: null, error: null }; },
              then(onfulfilled) {
                return Promise.resolve({ data: null, error: null }).then(onfulfilled);
              }
            };
          },
          update(payload) {
            calls.push({ method: "update", table, payload });
            return createMockQueryChain(table, calls, integrationData, orderData, merchantData);
          }
        };
      }
    }
  };
}

let JenniDispatchService;

test("load compiled module", async () => {
  const mod = await import("../dist/modules/jenni/jenni-dispatch.service.js");
  JenniDispatchService = mod.JenniDispatchService;
  assert.ok(JenniDispatchService, "JenniDispatchService should be exported");
});

test("dispatchOrderToJenni throws ForbiddenException when JENNI_ALLOW_SHIPMENT_DISPATCH is false", async () => {
  const mockConfig = createMockConfig("false");
  const mockSupabase = {};
  const mockJenniClient = {
    createShipments: async () => {
      throw new Error("JenniClient.createShipments should NEVER be called");
    }
  };
  const mockPricing = {};
  const mockDeliveryOps = {};

  const service = new JenniDispatchService(
    mockSupabase,
    mockJenniClient,
    mockPricing,
    mockDeliveryOps,
    mockConfig
  );

  await assert.rejects(
    () => service.dispatchOrderToJenni("test-order-id"),
    (err) => {
      assert.equal(err.getStatus(), 403, "Status should be 403 Forbidden");
      assert.ok(err.message.includes("disabled"), `Error should mention disabled: ${err.message}`);
      return true;
    }
  );
});

test("dispatchOrderToJenni throws error when merchant_id is missing on order", async () => {
  const mockConfig = createMockConfig("true");
  const calls = [];
  const orderData = {
    id: "test-order-id",
    order_number: "SAB-123456-0001",
    customer_name: "Customer Name",
    customer_phone: "07725332211",
    governorate_id: "gov-uuid",
    area: "Mansour",
    total: 50000,
    delivery_status: "pending_assignment",
    status: "preparing",
    merchant_id: null // Missing
  };

  const mockSupabase = createMockSupabase(calls, null, orderData, null);
  const mockJenniClient = {};
  const mockPricing = {
    getJenniCompanyId: async () => "company-uuid"
  };
  const mockDeliveryOps = {};

  const service = new JenniDispatchService(
    mockSupabase,
    mockJenniClient,
    mockPricing,
    mockDeliveryOps,
    mockConfig
  );

  await assert.rejects(
    () => service.dispatchOrderToJenni("test-order-id"),
    (err) => {
      assert.equal(err.getStatus(), 400, "Should be bad request");
      assert.ok(err.message.includes("does not have a linked Jenni Store"), `Error message: ${err.message}`);
      return true;
    }
  );

  const failureLog = calls.find(c => c.method === "upsert" && c.table === "order_delivery_integrations");
  assert.ok(failureLog, "Failure log should be persisted in DB");
  assert.equal(failureLog.payload.dispatch_status, "failed");
  assert.ok(failureLog.payload.dispatch_error.includes("does not have a linked Jenni Store"));
});

test("dispatchOrderToJenni throws error when jenni_store_id is missing on merchant", async () => {
  const mockConfig = createMockConfig("true");
  const calls = [];
  const orderData = {
    id: "test-order-id",
    order_number: "SAB-123456-0001",
    customer_name: "Customer Name",
    customer_phone: "07725332211",
    governorate_id: "gov-uuid",
    area: "Mansour",
    total: 50000,
    delivery_status: "pending_assignment",
    status: "preparing",
    merchant_id: "merchant-uuid"
  };
  const merchantData = {
    id: "merchant-uuid",
    jenni_store_id: null, // Missing
    jenni_merchant_id: 17168
  };

  const mockSupabase = createMockSupabase(calls, null, orderData, merchantData);
  const mockJenniClient = {};
  const mockPricing = {
    getJenniCompanyId: async () => "company-uuid"
  };
  const mockDeliveryOps = {};

  const service = new JenniDispatchService(
    mockSupabase,
    mockJenniClient,
    mockPricing,
    mockDeliveryOps,
    mockConfig
  );

  await assert.rejects(
    () => service.dispatchOrderToJenni("test-order-id"),
    (err) => {
      assert.equal(err.getStatus(), 400, "Should be bad request");
      assert.ok(err.message.includes("does not have a linked Jenni Store"));
      return true;
    }
  );

  const failureLog = calls.find(c => c.method === "upsert" && c.table === "order_delivery_integrations");
  assert.ok(failureLog);
  assert.equal(failureLog.payload.dispatch_status, "failed");
  assert.ok(failureLog.payload.dispatch_error.includes("does not have a linked Jenni Store"));
});

test("dispatchOrderToJenni throws error when jenni_merchant_id is missing on merchant", async () => {
  const mockConfig = createMockConfig("true");
  const calls = [];
  const orderData = {
    id: "test-order-id",
    order_number: "SAB-123456-0001",
    customer_name: "Customer Name",
    customer_phone: "07725332211",
    governorate_id: "gov-uuid",
    area: "Mansour",
    total: 50000,
    delivery_status: "pending_assignment",
    status: "preparing",
    merchant_id: "merchant-uuid"
  };
  const merchantData = {
    id: "merchant-uuid",
    jenni_store_id: 17900,
    jenni_merchant_id: null // Missing
  };

  const mockSupabase = createMockSupabase(calls, null, orderData, merchantData);
  const mockJenniClient = {};
  const mockPricing = {
    getJenniCompanyId: async () => "company-uuid"
  };
  const mockDeliveryOps = {};

  const service = new JenniDispatchService(
    mockSupabase,
    mockJenniClient,
    mockPricing,
    mockDeliveryOps,
    mockConfig
  );

  await assert.rejects(
    () => service.dispatchOrderToJenni("test-order-id"),
    (err) => {
      assert.equal(err.getStatus(), 400, "Should be bad request");
      assert.ok(err.message.includes("does not have a linked Jenni Store"));
      return true;
    }
  );

  const failureLog = calls.find(c => c.method === "upsert" && c.table === "order_delivery_integrations");
  assert.ok(failureLog);
  assert.equal(failureLog.payload.dispatch_status, "failed");
  assert.ok(failureLog.payload.dispatch_error.includes("does not have a linked Jenni Store"));
});

test("dispatchOrderToJenni throws error when jenni_store_id is invalid or non-numeric", async () => {
  const mockConfig = createMockConfig("true");
  const calls = [];
  const orderData = {
    id: "test-order-id",
    order_number: "SAB-123456-0001",
    customer_name: "Customer Name",
    customer_phone: "07725332211",
    governorate_id: "gov-uuid",
    area: "Mansour",
    total: 50000,
    delivery_status: "pending_assignment",
    status: "preparing",
    merchant_id: "merchant-uuid"
  };
  const merchantData = {
    id: "merchant-uuid",
    jenni_store_id: -55, // Invalid
    jenni_merchant_id: 17168
  };

  const mockSupabase = createMockSupabase(calls, null, orderData, merchantData);
  const mockJenniClient = {};
  const mockPricing = {
    getJenniCompanyId: async () => "company-uuid"
  };
  const mockDeliveryOps = {};

  const service = new JenniDispatchService(
    mockSupabase,
    mockJenniClient,
    mockPricing,
    mockDeliveryOps,
    mockConfig
  );

  await assert.rejects(
    () => service.dispatchOrderToJenni("test-order-id"),
    (err) => {
      assert.equal(err.getStatus(), 400, "Should be bad request");
      assert.ok(err.message.includes("does not have a linked Jenni Store"));
      return true;
    }
  );
});

test("dispatchOrderToJenni throws error when jenni_merchant_id is invalid or non-numeric", async () => {
  const mockConfig = createMockConfig("true");
  const calls = [];
  const orderData = {
    id: "test-order-id",
    order_number: "SAB-123456-0001",
    customer_name: "Customer Name",
    customer_phone: "07725332211",
    governorate_id: "gov-uuid",
    area: "Mansour",
    total: 50000,
    delivery_status: "pending_assignment",
    status: "preparing",
    merchant_id: "merchant-uuid"
  };
  const merchantData = {
    id: "merchant-uuid",
    jenni_store_id: 17900,
    jenni_merchant_id: -99 // Invalid
  };

  const mockSupabase = createMockSupabase(calls, null, orderData, merchantData);
  const mockJenniClient = {};
  const mockPricing = {
    getJenniCompanyId: async () => "company-uuid"
  };
  const mockDeliveryOps = {};

  const service = new JenniDispatchService(
    mockSupabase,
    mockJenniClient,
    mockPricing,
    mockDeliveryOps,
    mockConfig
  );

  await assert.rejects(
    () => service.dispatchOrderToJenni("test-order-id"),
    (err) => {
      assert.equal(err.getStatus(), 400, "Should be bad request");
      assert.ok(err.message.includes("does not have a linked Jenni Store"));
      return true;
    }
  );
});

test("dispatchOrderToJenni passes store_id and merchant_id in payload and persists store_id on success", async () => {
  const mockConfig = createMockConfig("true");
  const calls = [];
  const orderData = {
    id: "test-order-id",
    order_number: "SAB-123456-0001",
    customer_name: "Customer Name",
    customer_phone: "07725332211",
    governorate_id: "gov-uuid",
    area: "Mansour",
    total: 50000,
    delivery_status: "pending_assignment",
    status: "preparing",
    merchant_id: "merchant-uuid"
  };
  const merchantData = {
    id: "merchant-uuid",
    jenni_store_id: 17900,
    jenni_merchant_id: 17168
  };

  const mockSupabase = createMockSupabase(calls, null, orderData, merchantData);

  let capturedPayload = null;
  const mockJenniClient = {
    createShipments: async (payloads) => {
      capturedPayload = payloads[0];
      return {
        accepted: [{ shipment_number: "SAB-123456-0001", shipment_id: 998877, airway_bill_number: "AWB-123" }],
        rejected: []
      };
    }
  };

  const mockPricing = {
    getJenniCompanyId: async () => "company-uuid"
  };

  const mockDeliveryOps = {
    assignOrderToDeliveryCompany: async () => {}
  };

  const service = new JenniDispatchService(
    mockSupabase,
    mockJenniClient,
    mockPricing,
    mockDeliveryOps,
    mockConfig
  );

  const res = await service.dispatchOrderToJenni("test-order-id");
  assert.equal(res.ok, true);
  assert.equal(res.provider_shipment_id, "998877");
  assert.equal(res.airway_bill_number, "AWB-123");

  // Verify payload includes store_id and merchant_id
  assert.ok(capturedPayload, "Jenni payload should be captured");
  assert.equal(capturedPayload.store_id, 17900);
  assert.equal(capturedPayload.merchant_id, 17168);

  // Verify upsert persists jenni_store_id to integrations table
  const upsertCall = calls.find(c => c.method === "upsert" && c.table === "order_delivery_integrations");
  assert.ok(upsertCall);
  assert.equal(upsertCall.payload.jenni_store_id, 17900);
});

test("retryLocalDispatchFromIntegration preserves or resolves store_id", async () => {
  const mockConfig = createMockConfig("true");
  const calls = [];
  const orderData = {
    id: "test-order-id",
    order_number: "SAB-123456-0001",
    customer_name: "Customer Name",
    customer_phone: "07725332211",
    governorate_id: "gov-uuid",
    area: "Mansour",
    total: 50000,
    delivery_status: "pending_assignment",
    status: "preparing",
    merchant_id: "merchant-uuid"
  };
  const merchantData = {
    id: "merchant-uuid",
    jenni_store_id: 17900
  };
  const integrationData = {
    provider_shipment_id: "998877",
    airway_bill_number: "AWB-123",
    dispatch_status: "local_update_failed",
    jenni_store_id: null // Missing in integration, needs lookup
  };

  const mockSupabase = createMockSupabase(calls, integrationData, orderData, merchantData);

  const mockJenniClient = {
    createShipments: async () => {
      throw new Error("Should not call Jenni on local retry");
    }
  };

  const mockPricing = {
    getJenniCompanyId: async () => "company-uuid"
  };

  const mockDeliveryOps = {
    assignOrderToDeliveryCompany: async () => {}
  };

  const service = new JenniDispatchService(
    mockSupabase,
    mockJenniClient,
    mockPricing,
    mockDeliveryOps,
    mockConfig
  );

  const res = await service.dispatchOrderToJenni("test-order-id");
  assert.equal(res.ok, true);
  assert.equal(res.retried_local_dispatch, true);

  // Check integration updates updated jenni_store_id
  const updateCall = calls.find(c => c.method === "update" && c.table === "order_delivery_integrations");
  assert.ok(updateCall);
  assert.equal(updateCall.payload.jenni_store_id, 17900);
  assert.equal(updateCall.payload.dispatch_status, "dispatched");
});

test("Jenni provider 400 error persists order_delivery_integrations.dispatch_status='failed'", async () => {
  const exceptionMod = await import("../dist/modules/jenni/jenni-provider.exception.js");
  const JenniProviderException = exceptionMod.JenniProviderException;

  const mockConfig = createMockConfig("true");
  const calls = [];
  const orderData = {
    id: "test-order-id",
    order_number: "SAB-123456-0001",
    customer_name: "Customer Name",
    customer_phone: "07725332211",
    governorate_id: "gov-uuid",
    area: "Mansour",
    total: 50000,
    delivery_status: "pending_assignment",
    status: "preparing",
    merchant_id: "merchant-uuid"
  };
  const merchantData = {
    id: "merchant-uuid",
    jenni_store_id: 17900,
    jenni_merchant_id: 17168
  };

  const mockSupabase = createMockSupabase(calls, null, orderData, merchantData);
  const mockJenniClient = {
    createShipments: async () => {
      throw new JenniProviderException("Jenni rejected shipment validation", 400, "Invalid city name");
    }
  };
  const mockPricing = {
    getJenniCompanyId: async () => "company-uuid"
  };
  const mockDeliveryOps = {};

  const service = new JenniDispatchService(
    mockSupabase,
    mockJenniClient,
    mockPricing,
    mockDeliveryOps,
    mockConfig
  );

  await assert.rejects(
    () => service.dispatchOrderToJenni("test-order-id"),
    (err) => {
      assert.ok(err instanceof JenniProviderException);
      assert.equal(err.getStatus(), 400);
      return true;
    }
  );

  const failureLog = calls.find(c => c.method === "upsert" && c.table === "order_delivery_integrations");
  assert.ok(failureLog, "Failure log should be persisted in DB for JenniProviderException");
  assert.equal(failureLog.payload.dispatch_status, "failed");
  assert.ok(failureLog.payload.dispatch_error.includes("Jenni rejected shipment validation"));
});

test("Local validation BadRequest (e.g. invalid phone) does not call Jenni", async () => {
  const mockConfig = createMockConfig("true");
  const calls = [];
  const orderData = {
    id: "test-order-id",
    order_number: "SAB-123456-0001",
    customer_name: "Customer Name",
    customer_phone: "invalid-phone", // Local validation failure
    governorate_id: "gov-uuid",
    area: "Mansour",
    total: 50000,
    delivery_status: "pending_assignment",
    status: "preparing",
    merchant_id: "merchant-uuid"
  };
  const merchantData = {
    id: "merchant-uuid",
    jenni_store_id: 17900,
    jenni_merchant_id: 17168
  };

  const mockSupabase = createMockSupabase(calls, null, orderData, merchantData);
  const mockJenniClient = {
    createShipments: async () => {
      throw new Error("Should not call Jenni for local validation failure");
    }
  };
  const mockPricing = {
    getJenniCompanyId: async () => "company-uuid"
  };
  const mockDeliveryOps = {};

  const service = new JenniDispatchService(
    mockSupabase,
    mockJenniClient,
    mockPricing,
    mockDeliveryOps,
    mockConfig
  );

  await assert.rejects(
    () => service.dispatchOrderToJenni("test-order-id"),
    (err) => {
      assert.equal(err.getStatus(), 400);
      assert.ok(err.message.includes("Iraqi mobile format"));
      return true;
    }
  );

  const failureLog = calls.find(c => c.method === "upsert" && c.table === "order_delivery_integrations");
  assert.ok(!failureLog, "No integration failure log should be persisted for local payload validation errors");
});
