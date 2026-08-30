/**
 * P0-1 tests: Checkout identity security, loyalty auth, and geo persistence.
 *
 * Section A — Service-level (no HTTP): CheckoutService identity + geo
 * Section B — HTTP-level: LoyaltyController auth guard
 */

import test from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

// ─── Shared fixtures ────────────────────────────────────────────────────────

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const MERCHANT_ID = "22222222-2222-4222-8222-222222222222";
const GOV_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";
const mockJenniPricing = { async resolveJenniDeliveryPrice() { return 3000; } };

// STORE-PR5 §21 — harness-only DI repair: CheckoutService gained checkoutAttempts + enrichmentService
// deps after these tests were written, so the 3-arg constructions left them undefined and crashed at
// enrichPostCheckout. These no-op stubs restore the deps WITHOUT changing any checkout runtime semantics.
const mockCheckoutAttempts = () => ({
  computeRequestHash: () => "req-hash",
  async tryStartAttempt() { return { status: "started" }; },
  async completeAttempt() { return undefined; },
  async getAttemptStatus() { return { status: "unknown" }; },
});
const mockEnrichment = () => ({ async enrichPostCheckout() { return []; } });

/**
 * Build a thenable Supabase query-builder chain.
 * Supports both `await chain` (via .then) and `.maybeSingle()` terminal calls.
 */
function chain(getData) {
  const filters = {};
  const obj = {
    select() { return this; },
    eq(col, val) { filters[col] = val; return this; },
    in() { return this; },
    gte() { return this; },
    order() { return this; },
    limit() { return this; },
    or() { return this; },
    lte() { return this; },
    neq() { return this; },
    update() { return this; },
    upsert() { return this; },
    insert() { return this; },
    maybeSingle: async () => getData(filters),
    single: async () => getData(filters),
    then(resolve, reject) {
      return Promise.resolve(getData(filters)).then(resolve, reject);
    },
  };
  return obj;
}

/** Mock finance service — returns zero-rate terms so order math is trivial. */
function mockFinanceService() {
  return {
    async resolveCommercialTerms() {
      return {
        commission_type: "percentage",
        commission_rate: 0,
        assisted_fee_rate: 0,
        platform_fee_rate: 0,
        delivery_billing_mode: "customer_pays",
        commission_rule_id: null,
        assisted_fee_rule_id: null,
        platform_fee_rule_id: null,
        delivery_billing_rule_id: null,
        plan_id: null,
        plan_code: null,
        commercial_snapshot_version: 0,
        plan_defaults: {
          default_commission_type: "percentage",
          default_commission_rate: 0,
          default_assisted_fee_rate: 0,
          default_platform_fee_rate: 0,
          default_delivery_billing_mode: "customer_pays",
        },
      };
    },
    computeOrderFinancialSnapshot({ subtotal, discount, deliveryFeeCharged }) {
      const gross = subtotal - discount;
      return {
        merchandise_subtotal: subtotal,
        discount_total: discount,
        delivery_fee_charged: deliveryFeeCharged,
        platform_commission_type: "percentage",
        platform_commission_rate: 0,
        platform_commission_amount: 0,
        platform_assisted_fee_amount: 0,
        platform_extra_fee_amount: 0,
        courier_fee_payable: deliveryFeeCharged,
        merchant_gross_amount: gross,
        merchant_net_amount: gross,
        gross_collected_amount: gross + deliveryFeeCharged,
        platform_net_revenue_amount: 0,
        currency_code: "IQD",
        financial_snapshot_version: 1,
        commission_rule_id: null,
        assisted_fee_rule_id: null,
        platform_fee_rule_id: null,
        delivery_billing_rule_id: null,
        resolved_plan_id: null,
        resolved_plan_code: null,
        commercial_snapshot_version: 0,
      };
    },
  };
}

/**
 * Build a mock Supabase admin client for CheckoutService tests.
 * @param {object} opts
 * @param {number} opts.userPoints - actor's loyalty points balance
 * @param {object} opts.capturedRpc - object that accumulates rpc(name, params) calls
 */
function checkoutSupabase({ userPoints = 0, capturedRpc = {} } = {}) {
  return {
    auth: {
      async getUser(token) {
        if (token === "token-actor") return { data: { user: { id: ACTOR_ID } }, error: null };
        return { data: { user: null }, error: new Error("invalid") };
      },
    },
    from(table) {
      if (table === "products") {
        return chain(() => ({
          data: [
            {
              id: PRODUCT_ID,
              name: "Widget",
              price: 1000,
              discount_price: null,
              offer_ends_at: null,
              stock: 10,
              is_active: true,
              visibility_status: "public",
              merchant_id: MERCHANT_ID,
              category_id: null,
            },
          ],
          error: null,
        }));
      }
      if (table === "merchants") {
        return chain(() => ({ data: { id: MERCHANT_ID, status: "active" }, error: null }));
      }
      if (table === "governorates") {
        return chain(() => ({ data: { delivery_price: 3000 }, error: null }));
      }
      if (table === "profiles") {
        return chain(() => ({ data: { points: userPoints }, error: null }));
      }
      return chain(() => ({ data: null, error: null }));
    },
    async rpc(name, params) {
      capturedRpc[name] = params;
      if (name === "place_order") return { data: "ORD-MOCK-001", error: null };
      if (name === "validate_coupon") return { data: { valid: false }, error: null };
      return { data: null, error: null };
    },
  };
}

/** Minimal valid submit payload (no points, no geo). */
function baseSubmitPayload() {
  return {
    customer_name: "Test User",
    customer_phone: "07700000000",
    governorate_id: GOV_ID,
    area: "Test Area",
    items: [{ product_id: PRODUCT_ID, quantity: 1 }],
  };
}

// ─── Section A: CheckoutService unit tests ───────────────────────────────────

// STORE-PR5 §22 — the backend checkout submit contract now REQUIRES an authenticated (or provisional)
// actor: a no-actor submit is rejected, and the guest → provisional-session → authenticated-submit flow is
// owned by the frontend (Checkout.tsx §Phase L), NOT by an unauthenticated backend path. A1/A2 are updated
// to this contract (previously they asserted the superseded guest-null-user backend behavior).
test("A1: a no-actor checkout is rejected (guest must establish a provisional session first)", async () => {
  const { CheckoutService } = await import("../dist/modules/checkout/checkout.service.js");
  const service = new CheckoutService(
    { client: checkoutSupabase({ userPoints: 100 }) },
    mockFinanceService(),
    mockJenniPricing,
    mockCheckoutAttempts(),
    mockEnrichment(),
  );

  await assert.rejects(
    () => service.submit({ ...baseSubmitPayload(), points_spent: 5 }, undefined),
    /جلسة متابعة مؤقتة|authentication required/i,
  );
});

test("A2: a no-actor checkout never reaches place_order (no unauthenticated backend order)", async () => {
  const captured = {};
  const { CheckoutService } = await import("../dist/modules/checkout/checkout.service.js");
  const service = new CheckoutService(
    { client: checkoutSupabase({ capturedRpc: captured }) },
    mockFinanceService(),
    mockJenniPricing,
    mockCheckoutAttempts(),
    mockEnrichment(),
  );

  await assert.rejects(() => service.submit(baseSubmitPayload(), undefined), /جلسة متابعة مؤقتة|authentication required/i);
  assert.equal(captured["place_order"], undefined, "place_order must NOT be called without an actor");
});

test("A3: authenticated checkout uses actor id, ignores any body user_id", async () => {
  const captured = {};
  const { CheckoutService } = await import("../dist/modules/checkout/checkout.service.js");
  const service = new CheckoutService(
    { client: checkoutSupabase({ capturedRpc: captured }) },
    mockFinanceService(),
    mockJenniPricing,
    mockCheckoutAttempts(),
    mockEnrichment(),
  );

  // Pass a payload that has no user_id field (it was removed from the DTO).
  // The actorId comes exclusively from the second argument (injected by the controller from JWT).
  await service.submit(baseSubmitPayload(), ACTOR_ID);

  assert.ok(captured["place_order"], "place_order RPC must be called");
  assert.equal(captured["place_order"].p_user_id, ACTOR_ID, "p_user_id must be the JWT actor id");
});

test("A4: authenticated checkout rejects points_spent exceeding balance", async () => {
  const { CheckoutService } = await import("../dist/modules/checkout/checkout.service.js");
  const service = new CheckoutService(
    { client: checkoutSupabase({ userPoints: 3 }) },
    mockFinanceService(),
    mockJenniPricing,
    mockCheckoutAttempts(),
    mockEnrichment(),
  );

  await assert.rejects(
    () => service.submit({ ...baseSubmitPayload(), points_spent: 10 }, ACTOR_ID),
    /insufficient loyalty points/i,
  );
});

test("A5: authenticated checkout allows points_spent equal to balance", async () => {
  const captured = {};
  const { CheckoutService } = await import("../dist/modules/checkout/checkout.service.js");
  const service = new CheckoutService(
    { client: checkoutSupabase({ userPoints: 5, capturedRpc: captured }) },
    mockFinanceService(),
    mockJenniPricing,
    mockCheckoutAttempts(),
    mockEnrichment(),
  );

  await service.submit({ ...baseSubmitPayload(), points_spent: 5 }, ACTOR_ID);

  assert.equal(captured["place_order"].p_points_spent, 5);
  assert.equal(captured["place_order"].p_points_discount, 50);
});

test("A6: checkout passes p_latitude / p_longitude / p_map_url to place_order", async () => {
  const captured = {};
  const { CheckoutService } = await import("../dist/modules/checkout/checkout.service.js");
  const service = new CheckoutService(
    { client: checkoutSupabase({ capturedRpc: captured }) },
    mockFinanceService(),
    mockJenniPricing,
    mockCheckoutAttempts(),
    mockEnrichment(),
  );

  await service.submit(
    {
      ...baseSubmitPayload(),
      latitude: 33.3152,
      longitude: 44.3661,
      map_url: "https://maps.google.com/?q=33.3152,44.3661",
    },
    ACTOR_ID, // §22: an authenticated actor is required; geo forwarding is unchanged.
  );

  const rpc = captured["place_order"];
  assert.ok(rpc, "place_order RPC must be called");
  assert.equal(rpc.p_latitude, 33.3152, "latitude must be forwarded");
  assert.equal(rpc.p_longitude, 44.3661, "longitude must be forwarded");
  assert.equal(rpc.p_map_url, "https://maps.google.com/?q=33.3152,44.3661", "map_url must be forwarded");
});

test("A7: checkout with no geo fields passes null for all three", async () => {
  const captured = {};
  const { CheckoutService } = await import("../dist/modules/checkout/checkout.service.js");
  const service = new CheckoutService(
    { client: checkoutSupabase({ capturedRpc: captured }) },
    mockFinanceService(),
    mockJenniPricing,
    mockCheckoutAttempts(),
    mockEnrichment(),
  );

  await service.submit(baseSubmitPayload(), ACTOR_ID); // §22: authenticated actor required.

  const rpc = captured["place_order"];
  assert.equal(rpc.p_latitude, null);
  assert.equal(rpc.p_longitude, null);
  assert.equal(rpc.p_map_url, null);
});

// ─── Section B: LoyaltyController HTTP tests ─────────────────────────────────

let app;
let baseUrl;

function guardSupabase() {
  const tokenToUser = { "token-user": { id: "user-001" } };
  const profiles = [{ id: "user-001", role: "customer", points: 10 }];
  return {
    auth: { async getUser(token) {
      const user = tokenToUser[token];
      if (!user) return { data: { user: null }, error: new Error("invalid") };
      return { data: { user }, error: null };
    }},
    from(table) {
      return chain((filters) => {
        if (table === "profiles") {
          const row = profiles.find((p) => p.id === filters.id) ?? null;
          return { data: row, error: null };
        }
        return { data: null, error: null };
      });
    },
    async rpc() { return { data: null, error: null }; },
  };
}

async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

test("B0: boot app for loyalty HTTP tests", async () => {
  const { AppModule } = await import("../dist/app.module.js");
  const { SupabaseAdminService } = await import("../dist/modules/supabase-admin/supabase-admin.service.js");
  
  const fakeAdminService = {
    client: guardSupabase(),
    async resolveUserFromAccessToken(token) {
      const tokenToUser = { "token-user": { id: "user-001" } };
      const user = tokenToUser[token];
      return user ? { id: user.id } : null;
    }
  };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAdminService)
    .useValue(fakeAdminService)
    .compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  await app.init();
  await app.listen(0);

  const addr = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
  assert.ok(baseUrl.includes("127.0.0.1"));
});

test("B1: loyalty preview without auth is rejected (401)", async () => {
  const res = await post("/api/loyalty/preview", { subtotal: 1000 });
  assert.equal(res.status, 401, `expected 401, got ${res.status}: ${res.text}`);
});

test("B2: loyalty redeem without auth is rejected (401)", async () => {
  const res = await post("/api/loyalty/redeem", { points: 5 });
  assert.equal(res.status, 401, `expected 401, got ${res.status}: ${res.text}`);
});

test("B3: loyalty redeem with valid token and points=0 is rejected (400)", async () => {
  const res = await post("/api/loyalty/redeem", { points: 0 }, "token-user");
  // points=0 fails DTO @Min(1) validation → 400
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${res.text}`);
});

test("B4: loyalty redeem with valid token and negative points is rejected (400)", async () => {
  const res = await post("/api/loyalty/redeem", { points: -1 }, "token-user");
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${res.text}`);
});

test("B5: loyalty preview with valid token returns points data", async () => {
  const res = await post("/api/loyalty/preview", { subtotal: 500 }, "token-user");
  // The mock profiles table returns points: 10 for user-001.
  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${res.text}`);
  const body = JSON.parse(res.text);
  assert.equal(body.available_points, 10);
  assert.ok(typeof body.redeemable_amount === "number");
});

test("BZ: shutdown app", async () => {
  if (app) await app.close();
  assert.ok(true);
});
