/**
 * Customer cancellation: order load and canonical carrier lookup.
 *
 * DilMart-STORE-CANCEL-ORDER-JENNI-LOOKUP-001
 *
 * requestCustomerCancellation used to SELECT `provider_shipment_id` from `public.orders`, a column
 * that does not exist. PostgREST failed the whole query with 42703, and `if (error || !order)`
 * collapsed that into NotFound — so every customer cancellation returned a false
 * "الطلب غير موجود" and never reached the atomic RPC.
 *
 * These tests boot the real compiled service against a Supabase stub, so they assert the actual
 * query shape and the actual error handling rather than re-implementing the logic. That distinction
 * matters: the pre-existing pure-logic suite could not have caught this.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { Test } = await import("@nestjs/testing");
const { NotFoundException, ForbiddenException } = await import("@nestjs/common");
const { OrderReturnsService } = await import("../dist/modules/orders/order-returns.service.js");
const { OrderCancellationService } = await import("../dist/modules/orders/order-cancellation.service.js");
const { DeliveryOperationsService } = await import("../dist/modules/shipping/delivery-operations.service.js");
const { ScopeResolverService } = await import("../dist/modules/scope-resolver/scope-resolver.service.js");
const { SupabaseAdminService } = await import("../dist/modules/supabase-admin/supabase-admin.service.js");

const ORDER_ID = "11111111-1111-1111-1111-111111111111";
const CUSTOMER_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_CUSTOMER_ID = "33333333-3333-3333-3333-333333333333";
const MERCHANT_ID = "44444444-4444-4444-4444-444444444444";

const eligibleOrder = (overrides = {}) => ({
  id: ORDER_ID,
  status: "new",
  user_id: CUSTOMER_ID,
  merchant_id: MERCHANT_ID,
  delivery_status: null,
  merchant_decision_status: "pending",
  order_number: "TST-0001",
  ...overrides,
});

/**
 * Supabase stub recording the exact column list requested from each table, so a test can assert
 * that the phantom column is gone rather than trusting a comment.
 */
function buildSupabaseStub({ order = eligibleOrder(), orderError = null, integration = null, integrationError = null } = {}) {
  const calls = { orderSelects: [], integrationSelects: [], integrationFilters: {} };

  const client = {
    from(table) {
      if (table === "orders") {
        return {
          select: (columns) => {
            calls.orderSelects.push(columns);
            return { eq: () => ({ maybeSingle: async () => ({ data: orderError ? null : order, error: orderError }) }) };
          },
        };
      }
      if (table === "order_delivery_integrations") {
        return {
          select: (columns) => {
            calls.integrationSelects.push(columns);
            return {
              eq: (columnA, valueA) => {
                calls.integrationFilters[columnA] = valueA;
                return {
                  eq: (columnB, valueB) => {
                    calls.integrationFilters[columnB] = valueB;
                    return {
                      maybeSingle: async () => ({
                        data: integrationError ? null : integration,
                        error: integrationError,
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      }
      // Any other table means the flow went past instant cancellation into the request path,
      // which these tests do not exercise.
      throw new Error(`unexpected table in stub: ${table}`);
    },
  };

  return { client, calls };
}

function buildCancellationStub(result = { order_id: ORDER_ID, new_status: "cancelled" }) {
  const calls = [];
  return {
    calls,
    service: {
      cancelOrder: async (params) => {
        calls.push(params);
        return result;
      },
    },
  };
}

async function buildService(supabaseStub, cancellationStub) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      OrderReturnsService,
      { provide: SupabaseAdminService, useValue: { client: supabaseStub.client } },
      { provide: OrderCancellationService, useValue: cancellationStub.service },
      { provide: DeliveryOperationsService, useValue: { markCancelled: async () => ({}) } },
      { provide: ScopeResolverService, useValue: {} },
    ],
  }).compile();
  return moduleRef.get(OrderReturnsService);
}

async function run(options = {}, input = {}) {
  const supabase = buildSupabaseStub(options);
  const cancellation = buildCancellationStub(options.cancelResult);
  const service = await buildService(supabase, cancellation);

  let thrown = null;
  let result = null;
  try {
    result = await service.requestCustomerCancellation({
      orderId: ORDER_ID,
      actorId: CUSTOMER_ID,
      reasonCode: "customer_requested_cancellation",
      ...input,
    });
  } catch (error) {
    thrown = error;
  }
  return { supabase, cancellation, result, thrown };
}

test("customer cancellation order load", async (t) => {
  await t.test("never requests provider_shipment_id from orders", async () => {
    const { supabase } = await run();

    assert.equal(supabase.calls.orderSelects.length, 1);
    const columns = supabase.calls.orderSelects[0];
    assert.ok(
      !columns.includes("provider_shipment_id"),
      `orders select must not reference the phantom column, got: ${columns}`,
    );
    // The legitimate fields the flow depends on are still requested.
    for (const column of ["id", "status", "user_id", "merchant_id", "delivery_status", "merchant_decision_status"]) {
      assert.ok(columns.includes(column), `orders select is missing ${column}`);
    }
  });

  await t.test("a database error is surfaced, not disguised as a missing order", async () => {
    // This is the exact shape PostgREST returned for the phantom column.
    const dbError = Object.assign(new Error('column orders.provider_shipment_id does not exist'), { code: "42703" });
    const { thrown } = await run({ orderError: dbError });

    assert.ok(thrown, "expected the query failure to propagate");
    assert.ok(
      !(thrown instanceof NotFoundException),
      "a query failure must never be reported as الطلب غير موجود",
    );
    assert.equal(thrown.code, "42703");
  });

  await t.test("a genuinely absent order still returns NotFound", async () => {
    const { thrown } = await run({ order: null });

    assert.ok(thrown instanceof NotFoundException, `expected NotFoundException, got ${thrown}`);
  });

  await t.test("ownership is still enforced", async () => {
    const { thrown, cancellation } = await run({ order: eligibleOrder({ user_id: OTHER_CUSTOMER_ID }) });

    assert.ok(thrown instanceof ForbiddenException, `expected ForbiddenException, got ${thrown}`);
    assert.equal(cancellation.calls.length, 0);
  });
});

test("customer cancellation carrier eligibility", async (t) => {
  await t.test("no integration row cancels atomically as the customer", async () => {
    const { result, cancellation, supabase } = await run({ integration: null });

    assert.equal(result.cancelled, true);
    assert.deepEqual(supabase.calls.integrationFilters, { order_id: ORDER_ID, provider_code: "jenni" });
    assert.equal(cancellation.calls.length, 1);
    assert.equal(cancellation.calls[0].actorType, "customer");
    assert.equal(cancellation.calls[0].actorId, CUSTOMER_ID);
    assert.equal(cancellation.calls[0].orderId, ORDER_ID);
  });

  await t.test("a failed dispatch with no shipment id is still cancellable", async () => {
    const { result, cancellation } = await run({
      integration: { provider_shipment_id: null, dispatch_status: "failed" },
    });

    assert.equal(result.cancelled, true);
    assert.equal(cancellation.calls.length, 1);
  });

  await t.test("a whitespace-only shipment id is treated as absent", async () => {
    const { result, cancellation } = await run({
      integration: { provider_shipment_id: "   ", dispatch_status: "failed" },
    });

    assert.equal(result.cancelled, true);
    assert.equal(cancellation.calls.length, 1);
  });

  await t.test("a populated shipment id does NOT instant-cancel", async () => {
    const { result, cancellation } = await run({
      integration: { provider_shipment_id: "JEN-123456", dispatch_status: "pending" },
    });

    assert.notEqual(result?.cancelled, true);
    assert.equal(cancellation.calls.length, 0, "an active carrier shipment must never be cancelled locally");
  });

  await t.test("dispatch_status dispatched does NOT instant-cancel", async () => {
    const { result, cancellation } = await run({
      integration: { provider_shipment_id: null, dispatch_status: "dispatched" },
    });

    assert.notEqual(result?.cancelled, true);
    assert.equal(cancellation.calls.length, 0);
  });

  await t.test("the local delivery_status protections still apply", async () => {
    for (const deliveryStatus of ["dispatched", "in_transit"]) {
      const { result, cancellation } = await run({
        order: eligibleOrder({ delivery_status: deliveryStatus }),
        integration: null,
      });

      assert.notEqual(result?.cancelled, true, `delivery_status ${deliveryStatus} must block instant cancellation`);
      assert.equal(cancellation.calls.length, 0);
    }
  });

  await t.test("an integration lookup error fails closed instead of assuming no shipment", async () => {
    const lookupError = Object.assign(new Error("connection reset"), { code: "08006" });
    const { thrown, cancellation } = await run({ integrationError: lookupError });

    assert.ok(thrown, "a carrier lookup failure must not be swallowed");
    assert.equal(cancellation.calls.length, 0, "unknown carrier state must never cancel");
  });

  await t.test("an already-cancelled order short-circuits before any carrier lookup", async () => {
    const { result, supabase, cancellation } = await run({ order: eligibleOrder({ status: "cancelled" }) });

    assert.equal(result.cancelled, true);
    assert.equal(supabase.calls.integrationSelects.length, 0);
    assert.equal(cancellation.calls.length, 0);
  });
});
