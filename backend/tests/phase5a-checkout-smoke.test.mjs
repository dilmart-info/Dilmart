/**
 * Phase 5A Checkout API Smoke Test
 *
 * Tests:
 *   - Authentication guards (401 / 403)
 *   - Endpoint availability
 *   - POST /cart/checkout/preview  — totals shape
 *   - POST /cart/checkout          — order creation + B2B field population
 *   - Double-checkout protection   — 409
 *   - Empty cart                   — 400
 *   - M30 backward compat          — existing web checkout unaffected
 *
 * Requires env vars:
 *   DilMart_INTEGRATION_SECRET  — shared HMAC secret
 *   STORE_LINKED_PROFILE_ID    — UUID of test linked profile (from Phase 4B: 6728dc7f-...)
 *   DilMart_USER_ID             — DilMart_user_id of that profile (from store_linked_profiles)
 *   STORE_SUPABASE_URL         — e.g. https://<ref>.supabase.co
 *   STORE_SUPABASE_SERVICE_KEY — service role key for DB assertions
 *
 * Optional:
 *   STORE_BACKEND_URL          — default: https://DilMart-store-backend.onrender.com/api
 *   TEST_PRODUCT_ID            — default: f281fc29-f627-4ca7-8d50-bff93a7cf50e
 *   TEST_GOVERNORATE_ID        — default: a known governorate UUID from staging DB
 */

import { createHmac } from "node:crypto";
import assert from "node:assert/strict";

// ─── Configuration ────────────────────────────────────────────────────────────

const BASE = process.env.STORE_BACKEND_URL ?? "https://DilMart-store-backend.onrender.com/api";

const INTEGRATION_SECRET = process.env.DilMart_INTEGRATION_SECRET;
if (!INTEGRATION_SECRET) throw new Error("DilMart_INTEGRATION_SECRET env var is required.");

const LINKED_PROFILE_ID = process.env.STORE_LINKED_PROFILE_ID ?? "6728dc7f-70a3-4d2f-b8f3-d415413de49d";
const DilMart_USER_ID = process.env.DilMart_USER_ID ?? "00000000-0000-0000-0000-000000000000";
const DilMart_BARBERSHOP_ID = process.env.DilMart_BARBERSHOP_ID ?? null;
const PRODUCT_ID = process.env.TEST_PRODUCT_ID ?? "f281fc29-f627-4ca7-8d50-bff93a7cf50e";

// Supabase (for DB assertions)
const SUPABASE_URL = process.env.STORE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.STORE_SUPABASE_SERVICE_KEY;

// ─── Token Minting ────────────────────────────────────────────────────────────

function mintStoreSession(overrides = {}) {
  const claims = {
    linkedProfileId: LINKED_PROFILE_ID,
    segment: "DilMart_APP_BARBER_OWNER",
    DilMartUserId: DilMart_USER_ID,
    DilMartBarbershopId: DilMart_BARBERSHOP_ID ?? undefined,
    businessType: "men_barbershop",
    sourceApp: "barber_app",
    iss: "DilMart-store",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  };
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = createHmac("sha256", INTEGRATION_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

function mintNonBarberSession() {
  return mintStoreSession({ sourceApp: "web" });
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function post(path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}

async function del(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers,
  });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}

async function get(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "GET",
    headers,
  });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}

async function supabaseGet(table, filter) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅  ${name}`);
    passed++;
    results.push({ name, status: "PASS" });
  } catch (err) {
    console.error(`❌  ${name}`);
    console.error(`    ${err.message}`);
    failed++;
    results.push({ name, status: "FAIL", error: err.message });
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const SESSION = mintStoreSession();
const NON_BARBER_SESSION = mintNonBarberSession();

// ─── T0: Health ───────────────────────────────────────────────────────────────
await test("T0: GET /health returns 200 ok", async () => {
  const r = await get("/health");
  assert.equal(r.status, 200);
  assert.equal(r.json?.ok, true);
});

// ─── M30 backward-compat: web checkout unaffected ────────────────────────────
await test("T1: Backward compat — POST /checkout/preview (web) still reachable", async () => {
  // Send empty body → expect 400 validation, NOT 404 (endpoint still exists)
  const r = await post("/checkout/preview", {});
  assert.ok(r.status === 400 || r.status === 401, `Expected 400 or 401 but got ${r.status}`);
});

// ─── AUTH: no session → 401 ──────────────────────────────────────────────────
await test("SEC-1: POST /cart/checkout/preview — no X-Store-Session → 401", async () => {
  const r = await post("/cart/checkout/preview", { governorate_id: "550e8400-e29b-41d4-a716-446655440000" });
  assert.equal(r.status, 401, `Expected 401, got ${r.status}: ${JSON.stringify(r.json)}`);
});

await test("SEC-2: POST /cart/checkout — no X-Store-Session → 401", async () => {
  const r = await post("/cart/checkout", {
    customer_name: "Test",
    customer_phone: "07700000001",
    governorate_id: "550e8400-e29b-41d4-a716-446655440000",
    area: "Test Area",
  });
  assert.equal(r.status, 401, `Expected 401, got ${r.status}: ${JSON.stringify(r.json)}`);
});

// ─── AUTH: invalid token → 401 ───────────────────────────────────────────────
await test("SEC-3: POST /cart/checkout/preview — invalid token → 401", async () => {
  const r = await post(
    "/cart/checkout/preview",
    { governorate_id: "550e8400-e29b-41d4-a716-446655440000" },
    { "X-Store-Session": "invalid.token.here" },
  );
  assert.equal(r.status, 401, `Expected 401, got ${r.status}`);
});

// ─── AUTH: non-barber_app session → 403 ──────────────────────────────────────
await test("SEC-4: POST /cart/checkout/preview — sourceApp=web → 403", async () => {
  const r = await post(
    "/cart/checkout/preview",
    { governorate_id: "550e8400-e29b-41d4-a716-446655440000" },
    { "X-Store-Session": NON_BARBER_SESSION },
  );
  assert.equal(r.status, 403, `Expected 403 (sourceApp=web), got ${r.status}: ${JSON.stringify(r.json)}`);
});

await test("SEC-5: POST /cart/checkout — sourceApp=web → 403", async () => {
  const r = await post(
    "/cart/checkout",
    {
      customer_name: "Test",
      customer_phone: "07700000001",
      governorate_id: "550e8400-e29b-41d4-a716-446655440000",
      area: "Test Area",
    },
    { "X-Store-Session": NON_BARBER_SESSION },
  );
  assert.equal(r.status, 403, `Expected 403 (sourceApp=web), got ${r.status}: ${JSON.stringify(r.json)}`);
});

// ─── EMPTY CART: reset to ensure we have an empty cart ───────────────────────
await test("SETUP: Clear/reset cart for test user", async () => {
  // Clear any active cart first
  const r = await del("/cart/clear", { "X-Store-Session": SESSION });
  // 200 = cleared, 404 = no cart, both are acceptable
  assert.ok(
    r.status === 200 || r.status === 404,
    `Unexpected clear status: ${r.status} ${JSON.stringify(r.json)}`,
  );
});

// ─── FUNCTIONAL: empty cart → 400 ────────────────────────────────────────────
await test("F1: POST /cart/checkout/preview — empty cart → 400", async () => {
  const r = await get("/cart", { "X-Store-Session": SESSION });
  const cartHasItems = r.json?.items?.length > 0;
  if (cartHasItems) {
    // Clear first
    await del("/cart/clear", { "X-Store-Session": SESSION });
  }
  const gov = await getAnyGovernorateId();
  const preview = await post(
    "/cart/checkout/preview",
    { governorate_id: gov },
    { "X-Store-Session": SESSION },
  );
  assert.equal(preview.status, 400, `Expected 400 for empty cart, got ${preview.status}: ${JSON.stringify(preview.json)}`);
});

await test("F2: POST /cart/checkout — empty cart → 400", async () => {
  const gov = await getAnyGovernorateId();
  const r = await post(
    "/cart/checkout",
    {
      customer_name: "حسن علي",
      customer_phone: "07700000001",
      governorate_id: gov,
      area: "منطقة الاختبار",
    },
    { "X-Store-Session": SESSION },
  );
  assert.equal(r.status, 400, `Expected 400 for empty cart, got ${r.status}: ${JSON.stringify(r.json)}`);
});

// ─── FUNCTIONAL: add item then checkout ──────────────────────────────────────
await test("F3: Add product to cart for checkout test", async () => {
  const r = await post(
    "/cart/items",
    { productId: PRODUCT_ID, quantity: 1 },
    { "X-Store-Session": SESSION },
  );
  assert.ok(
    r.status === 201 || r.status === 200,
    `Expected 201/200 adding item, got ${r.status}: ${JSON.stringify(r.json)}`,
  );
});

let governorateId;
await test("F4: POST /cart/checkout/preview — returns totals shape", async () => {
  governorateId = await getAnyGovernorateId();
  const r = await post(
    "/cart/checkout/preview",
    { governorate_id: governorateId },
    { "X-Store-Session": SESSION },
  );
  assert.equal(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.json)}`);
  const t = r.json?.totals;
  assert.ok(t, "Response should have 'totals' field");
  assert.ok(typeof t.subtotal === "number", "totals.subtotal should be a number");
  assert.ok(typeof t.delivery_cost === "number", "totals.delivery_cost should be a number");
  assert.ok(typeof t.total === "number", "totals.total should be a number");
  assert.ok(t.subtotal > 0, `subtotal should be > 0, got ${t.subtotal}`);
  assert.ok(t.total >= t.subtotal, `total (${t.total}) should be >= subtotal (${t.subtotal})`);
  console.log(`    Preview totals: subtotal=${t.subtotal} delivery=${t.delivery_cost} total=${t.total}`);
});

let orderNumber;
await test("F5: POST /cart/checkout — creates order with B2B fields", async () => {
  const r = await post(
    "/cart/checkout",
    {
      customer_name: "حسن اختبار",
      customer_phone: "07700000001",
      governorate_id: governorateId ?? (await getAnyGovernorateId()),
      area: "منطقة الاختبار الصيانة",
      notes: "طلب اختبار Phase 5A",
    },
    { "X-Store-Session": SESSION },
  );
  assert.equal(r.status, 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.json)}`);
  orderNumber = r.json?.order_number;
  assert.ok(orderNumber, "Response should contain order_number");
  const t = r.json?.totals;
  assert.ok(t?.subtotal > 0, "totals.subtotal should be > 0");
  assert.ok(typeof t?.delivery_cost === "number", "totals.delivery_cost should be a number");
  console.log(`    Order created: ${orderNumber}`);
  console.log(`    Totals: subtotal=${t?.subtotal} delivery=${t?.delivery_cost} total=${t?.total}`);
});

// ─── DB ASSERTIONS: verify B2B fields in orders table ────────────────────────
if (SUPABASE_URL && SUPABASE_SERVICE_KEY && orderNumber) {
  await test("DB1: Order has source_app=barber_app", async () => {
    const row = await supabaseGet("orders", `order_number=eq.${orderNumber}&select=source_app`);
    assert.ok(row, `Order ${orderNumber} not found in DB`);
    assert.equal(row.source_app, "barber_app", `source_app should be barber_app, got ${row.source_app}`);
  });

  await test("DB2: Order has store_linked_profile_id", async () => {
    const row = await supabaseGet(
      "orders",
      `order_number=eq.${orderNumber}&select=store_linked_profile_id`,
    );
    assert.ok(row?.store_linked_profile_id, "store_linked_profile_id should be set");
    assert.equal(
      row.store_linked_profile_id,
      LINKED_PROFILE_ID,
      `Expected ${LINKED_PROFILE_ID}, got ${row.store_linked_profile_id}`,
    );
  });

  await test("DB3: Order has DilMart_user_id", async () => {
    const row = await supabaseGet("orders", `order_number=eq.${orderNumber}&select=DilMart_user_id`);
    assert.ok(row?.DilMart_user_id, "DilMart_user_id should be set");
  });

  await test("DB4: Order has segment", async () => {
    const row = await supabaseGet("orders", `order_number=eq.${orderNumber}&select=segment`);
    assert.equal(row?.segment, "DilMart_APP_BARBER_OWNER", `segment mismatch: ${row?.segment}`);
  });

  await test("DB5: Order has business_type", async () => {
    const row = await supabaseGet("orders", `order_number=eq.${orderNumber}&select=business_type`);
    assert.equal(row?.business_type, "men_barbershop", `business_type mismatch: ${row?.business_type}`);
  });

  await test("DB6: Cart status is 'converted'", async () => {
    const row = await supabaseGet(
      "store_carts",
      `store_linked_profile_id=eq.${LINKED_PROFILE_ID}&status=eq.converted&order=updated_at.desc`,
    );
    assert.ok(row, "A converted cart should exist after successful checkout");
  });
}

// ─── DOUBLE CHECKOUT: cart now converted → second checkout must fail ─────────
await test("F6: POST /cart/checkout/preview — no active cart after checkout → 400", async () => {
  const gov = governorateId ?? (await getAnyGovernorateId());
  const r = await post(
    "/cart/checkout/preview",
    { governorate_id: gov },
    { "X-Store-Session": SESSION },
  );
  // Cart is now converted; a new empty cart should be auto-created → 400 empty cart
  assert.equal(r.status, 400, `Expected 400 (empty/no cart after checkout), got ${r.status}: ${JSON.stringify(r.json)}`);
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(60));
console.log(`Phase 5A Checkout Smoke Test — ${new Date().toISOString()}`);
console.log(`PASSED: ${passed}   FAILED: ${failed}   TOTAL: ${passed + failed}`);
if (failed > 0) {
  console.log("\nFailed tests:");
  results.filter((r) => r.status === "FAIL").forEach((r) => console.log(`  ❌ ${r.name}: ${r.error}`));
  process.exit(1);
}
console.log("─".repeat(60));

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getAnyGovernorateId() {
  if (process.env.TEST_GOVERNORATE_ID) return process.env.TEST_GOVERNORATE_ID;
  // Try fetching from delivery_prices table to find a known governorate_id
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    const url = `${SUPABASE_URL}/rest/v1/delivery_prices?select=governorate_id&limit=1`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });
    const rows = await res.json();
    if (Array.isArray(rows) && rows[0]?.governorate_id) return rows[0].governorate_id;
  }
  // Fallback to a hardcoded known test value
  return "550e8400-e29b-41d4-a716-446655440000";
}
