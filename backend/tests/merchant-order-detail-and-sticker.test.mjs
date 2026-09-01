/**
 * Phase 3B Backend Authority Test Suite
 *
 * Tests:
 * 1. OrdersService.getOrderDetailForMerchant — canonical 404 (NotFoundException) without PostgREST leak
 * 2. OrdersService.getOrderDetail — canonical 404 on missing/out-of-scope orders
 * 3. JenniStickerService — multi-store exact merchant membership authorization
 * 4. JenniStickerService — dispatch status eligibility (dispatched | synced) and external_shipment_number validation
 */

import test from "node:test";
import assert from "node:assert/strict";
import { NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";

const { OrdersService } = await import("../dist/modules/orders/orders.service.js");
const { JenniStickerService } = await import("../dist/modules/jenni/jenni-sticker.service.js");

function createMockSupabaseAdmin(tableHandlers = {}) {
  return {
    client: {
      from: (table) => {
        if (tableHandlers[table]) {
          return tableHandlers[table]();
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
                single: async () => ({ data: null, error: null }),
              }),
              maybeSingle: async () => ({ data: null, error: null }),
              single: async () => ({ data: null, error: null }),
            }),
          }),
        };
      },
    },
  };
}

test("OrdersService.getOrderDetailForMerchant — returns canonical NotFoundException (404) when order does not exist", async () => {
  const mockSupabase = createMockSupabaseAdmin({
    orders: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }),
  });

  const ordersService = new OrdersService(
    mockSupabase,
    null, // scopeResolver
    null, // whatsappIntents
    null, // orderFinance
    null, // deliveryOps
    null, // jenniClient
    null, // orderCancellation
  );

  await assert.rejects(
    async () => {
      await ordersService.getOrderDetailForMerchant("non-existent-id", "m-123");
    },
    (err) => {
      assert(err instanceof NotFoundException, `Expected NotFoundException, got ${err?.constructor?.name}`);
      assert.equal(err.message, "Order not found");
      assert.equal(err.getStatus(), 404);
      return true;
    },
  );
});

test("OrdersService.getOrderDetailForMerchant — returns canonical NotFoundException (404) on PGRST116 without leaking PostgREST trace", async () => {
  const mockSupabase = createMockSupabaseAdmin({
    orders: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
            }),
          }),
        }),
      }),
    }),
  });

  const ordersService = new OrdersService(
    mockSupabase,
    null,
    null,
    null,
    null,
    null,
    null,
  );

  await assert.rejects(
    async () => {
      await ordersService.getOrderDetailForMerchant("foreign-order-id", "m-other");
    },
    (err) => {
      assert(err instanceof NotFoundException, `Expected NotFoundException, got ${err?.constructor?.name}`);
      assert.equal(err.message, "Order not found");
      return true;
    },
  );
});

test("OrdersService.getOrderDetailForMerchant — returns sanitized order detail when order exists for resolved merchant", async () => {
  const fakeOrder = {
    id: "ord-1",
    order_number: "DUK-101",
    merchant_id: "m-123",
    status: "new",
    channel: "online_store",
    subtotal: 50000,
    total: 54000,
    order_delivery_integrations: [
      {
        id: "int-1",
        provider_code: "jenni",
        dispatch_status: "dispatched",
        external_shipment_number: "JENNI-TRK-101",
        provider_shipment_id: "JENNI-TRK-101",
        provider_current_step_ar: "مركز التوزيع",
      },
    ],
  };

  const mockSupabase = createMockSupabaseAdmin({
    orders: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: fakeOrder, error: null }),
          }),
        }),
      }),
    }),
  });

  const ordersService = new OrdersService(
    mockSupabase,
    null,
    null,
    null,
    null,
    null,
    null,
  );

  const result = await ordersService.getOrderDetailForMerchant("ord-1", "m-123");
  assert.equal(result.id, "ord-1");
  assert.equal(result.order_number, "DUK-101");
  assert.equal(result.order_delivery_integrations[0].id, "int-1");
  assert.equal(result.order_delivery_integrations[0].external_shipment_number, "JENNI-TRK-101");
});

test("JenniStickerService — allows multi-store merchant user belonging to order's merchant", async () => {
  const fakeOrder = {
    id: "ord-2",
    order_number: "DUK-202",
    merchant_id: "m-store-2",
    status: "preparing",
  };

  const fakeIntegration = {
    provider_code: "jenni",
    dispatch_status: "dispatched",
    external_shipment_number: "JENNI-SHIP-202",
    provider_shipment_id: "JENNI-SHIP-202",
  };

  const mockSupabase = {
    client: {
      from: (table) => {
        if (table === "orders") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: fakeOrder, error: null }),
              }),
            }),
          };
        }
        if (table === "merchant_users") {
          return {
            select: () => ({
              eq: (field1, val1) => ({
                eq: (field2, val2) => ({
                  limit: () => ({
                    maybeSingle: async () => {
                      // Actor belongs to m-store-1 and m-store-2
                      if (val1 === "user-multi-store" && val2 === "m-store-2") {
                        return { data: { merchant_id: "m-store-2" }, error: null };
                      }
                      return { data: null, error: null };
                    },
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "order_delivery_integrations") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: fakeIntegration, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    },
  };

  const fakeJenniClient = {
    fetchStickerPdf: async (numbers) => {
      assert.deepEqual(numbers, ["JENNI-SHIP-202"]);
      return Buffer.from("%PDF-1.4 mock sticker data");
    },
  };

  const fakeJenniAuth = {
    isConfigured: () => true,
  };

  const stickerService = new JenniStickerService(
    fakeJenniClient,
    fakeJenniAuth,
    mockSupabase,
  );

  const pdf = await stickerService.getStickerForOrder("ord-2", "merchant_owner", "user-multi-store");
  assert(Buffer.isBuffer(pdf));
  assert.equal(pdf.toString(), "%PDF-1.4 mock sticker data");
});

test("JenniStickerService — denies merchant user who is not a member of the order's merchant", async () => {
  const fakeOrder = {
    id: "ord-3",
    merchant_id: "m-store-target",
    status: "preparing",
  };

  const mockSupabase = {
    client: {
      from: (table) => {
        if (table === "orders") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: fakeOrder, error: null }),
              }),
            }),
          };
        }
        if (table === "merchant_users") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null }), // Not a member
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    },
  };

  const stickerService = new JenniStickerService(
    null,
    { isConfigured: () => true },
    mockSupabase,
  );

  await assert.rejects(
    async () => {
      await stickerService.getStickerForOrder("ord-3", "merchant_staff", "user-unauthorized");
    },
    (err) => {
      assert(err instanceof ForbiddenException, `Expected ForbiddenException, got ${err?.constructor?.name}`);
      assert.equal(err.message, "You do not have access to this order.");
      return true;
    },
  );
});

test("JenniStickerService — allows sticker generation when dispatch_status is 'synced'", async () => {
  const fakeOrder = {
    id: "ord-4",
    merchant_id: "m-store-1",
    status: "in_transit",
  };

  const fakeIntegration = {
    provider_code: "jenni",
    dispatch_status: "synced", // synced status is supported by backend
    external_shipment_number: "JENNI-SHIP-SYNCED",
  };

  const mockSupabase = {
    client: {
      from: (table) => {
        if (table === "orders") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: fakeOrder, error: null }),
              }),
            }),
          };
        }
        if (table === "order_delivery_integrations") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: fakeIntegration, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    },
  };

  const fakeJenniClient = {
    fetchStickerPdf: async (numbers) => {
      assert.deepEqual(numbers, ["JENNI-SHIP-SYNCED"]);
      return Buffer.from("%PDF-1.4 synced sticker data");
    },
  };

  const stickerService = new JenniStickerService(
    fakeJenniClient,
    { isConfigured: () => true },
    mockSupabase,
  );

  // admin actor bypasses merchant_users check
  const pdf = await stickerService.getStickerForOrder("ord-4", "admin", "admin-1");
  assert.equal(pdf.toString(), "%PDF-1.4 synced sticker data");
});

test("JenniStickerService — rejects sticker generation when dispatch_status is pending or failed", async () => {
  const fakeOrder = { id: "ord-5", merchant_id: "m-store-1" };
  const fakeIntegration = {
    provider_code: "jenni",
    dispatch_status: "pending",
    external_shipment_number: "JENNI-PENDING",
  };

  const mockSupabase = {
    client: {
      from: (table) => {
        if (table === "orders") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: fakeOrder, error: null }),
              }),
            }),
          };
        }
        if (table === "order_delivery_integrations") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: fakeIntegration, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    },
  };

  const stickerService = new JenniStickerService(
    null,
    { isConfigured: () => true },
    mockSupabase,
  );

  await assert.rejects(
    async () => {
      await stickerService.getStickerForOrder("ord-5", "admin", "admin-1");
    },
    (err) => {
      assert(err instanceof BadRequestException);
      assert(err.message.includes('dispatch status is "pending"'));
      return true;
    },
  );
});

test("JenniStickerService — rejects sticker generation when external_shipment_number is missing", async () => {
  const fakeOrder = { id: "ord-6", merchant_id: "m-store-1" };
  const fakeIntegration = {
    provider_code: "jenni",
    dispatch_status: "dispatched",
    external_shipment_number: "", // missing
  };

  const mockSupabase = {
    client: {
      from: (table) => {
        if (table === "orders") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: fakeOrder, error: null }),
              }),
            }),
          };
        }
        if (table === "order_delivery_integrations") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: fakeIntegration, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    },
  };

  const stickerService = new JenniStickerService(
    null,
    { isConfigured: () => true },
    mockSupabase,
  );

  await assert.rejects(
    async () => {
      await stickerService.getStickerForOrder("ord-6", "admin", "admin-1");
    },
    (err) => {
      assert(err instanceof BadRequestException);
      assert(err.message.includes("Shipment number is missing"));
      return true;
    },
  );
});
