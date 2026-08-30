/**
 * Phase 5A — Live Functional Checkout Tests
 *
 * Obtains a real X-Store-Session without printing secrets:
 *   1. X_STORE_SESSION env (pre-issued token), OR
 *   2. Main Backend OTP → POST /store-integration/session
 *
 * DB assertions use linked `supabase db query` (no service key in env).
 *
 * Usage:
 *   cd DilMart-Store/backend
 *   node tests/phase5a-checkout-live.test.mjs
 *
 * Optional env:
 *   X_STORE_SESSION          — skip OTP; use this token directly
 *   MAIN_BACKEND_URL         — default https://DilMart-backend-staging.onrender.com
 *   STORE_BACKEND_URL        — default https://DilMart-store-backend.onrender.com/api
 *   TEST_PHONE               — staging OWNER phone (mock OTP eligible)
 *   TEST_OTP                 — default 123456
 *   TEST_PRODUCT_ID          — default f281fc29-f627-4ca7-8d50-bff93a7cf50e
 *   TEST_GOVERNORATE_ID      — default e33e4da8-309f-4657-a411-b7d6865a18f3
 *   DilMart_INTEGRATION_SECRET — only needed for sourceApp=web 403 mint test
 */

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

const STORE_BASE = process.env.STORE_BACKEND_URL ?? "https://DilMart-store-backend.onrender.com/api";
const MAIN_BASE = process.env.MAIN_BACKEND_URL ?? "https://DilMart-backend-staging.onrender.com";
const TEST_PHONE = process.env.TEST_PHONE ?? "+9647905988619";
const TEST_OTP = process.env.TEST_OTP ?? "123456";
const PRODUCT_ID = process.env.TEST_PRODUCT_ID ?? "f281fc29-f627-4ca7-8d50-bff93a7cf50e";
const GOVERNORATE_ID = process.env.TEST_GOVERNORATE_ID ?? "e33e4da8-309f-4657-a411-b7d6865a18f3";

let passed = 0;
let failed = 0;
const results = [];
const samples = {};

async function test(name, fn) {
  try {
    const extra = await fn();
    console.log(`✅  ${name}`);
    passed++;
    results.push({ name, status: "PASS", ...(extra ? { extra } : {}) });
  } catch (err) {
    console.error(`❌  ${name}`);
    console.error(`    ${err.message}`);
    failed++;
    results.push({ name, status: "FAIL", error: err.message });
  }
}

async function post(url, body, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, json };
}

async function del(url, headers = {}) {
  const res = await fetch(url, { method: "DELETE", headers });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, json };
}

function dbQuery(sql) {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  const raw = execSync(`npx supabase db query ${JSON.stringify(oneLine)} --linked`, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const match = raw.match(/\{[\s\S]*"rows"[\s\S]*\}/);
  if (!match) throw new Error("Could not parse supabase db query output");
  const parsed = JSON.parse(match[0]);
  return parsed.rows ?? [];
}

async function acquireStoreSession() {
  if (process.env.X_STORE_SESSION) {
    console.log("Using X_STORE_SESSION from environment (token not printed).");
    return {
      token: process.env.X_STORE_SESSION,
      profile: null,
      source: "env",
    };
  }

  console.log(`Acquiring session via Main Backend for phone ${TEST_PHONE.replace(/\d(?=\d{4})/g, "*")}...`);

  const otpReq = await post(`${MAIN_BASE}/auth/otp/request`, { phone: TEST_PHONE });
  assert.ok(
    otpReq.status === 200 || otpReq.status === 201,
    `OTP request failed: ${otpReq.status} ${JSON.stringify(otpReq.json)}`,
  );

  const otpVerify = await post(`${MAIN_BASE}/auth/otp/verify`, {
    phone: TEST_PHONE,
    code: TEST_OTP,
    appType: "barber",
  });
  assert.ok(
    otpVerify.status === 200 || otpVerify.status === 201,
    `OTP verify failed: ${otpVerify.status} ${JSON.stringify(otpVerify.json)}`,
  );

  const accessToken = otpVerify.json?.accessToken;
  assert.ok(accessToken, "OTP verify did not return accessToken");

  const sessionRes = await post(`${MAIN_BASE}/store-integration/session`, {}, {
    Authorization: `Bearer ${accessToken}`,
  });
  assert.ok(
    sessionRes.status === 200 || sessionRes.status === 201,
    `Store session exchange failed: ${sessionRes.status} ${JSON.stringify(sessionRes.json)}`,
  );

  const token = sessionRes.json?.storeSessionToken;
  assert.ok(token, "Store session exchange did not return storeSessionToken");

  console.log("Store session acquired via Main Backend (token not printed).");
  return {
    token,
    profile: sessionRes.json?.profile ?? null,
    source: "main_backend",
  };
}

function sessionHeaders(token) {
  return { "X-Store-Session": token };
}

function mintWebSession(linkedProfileId, DilMartUserId, DilMartBarbershopId) {
  const secret = process.env.DilMart_INTEGRATION_SECRET;
  if (!secret) return null;
  const claims = {
    linkedProfileId,
    segment: "DilMart_APP_BARBER_OWNER",
    DilMartUserId,
    DilMartBarbershopId: DilMartBarbershopId ?? undefined,
    businessType: "men_barbershop",
    sourceApp: "web",
    iss: "DilMart-store",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
  };
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

function redact(obj) {
  return JSON.parse(
    JSON.stringify(obj, (_, v) =>
      typeof v === "string" && v.split(".").length === 3 && v.length > 40 ? "[REDACTED_JWT]" : v,
    ),
  );
}

// ─── Bootstrap session ────────────────────────────────────────────────────────

const { token: SESSION, profile: SESSION_PROFILE } = await acquireStoreSession();
const HDR = sessionHeaders(SESSION);

let linkedProfileId = SESSION_PROFILE?.id ?? process.env.STORE_LINKED_PROFILE_ID ?? null;

// ─── Live tests ───────────────────────────────────────────────────────────────

await test("LT-0: Setup — clear cart", async () => {
  const r = await del(`${STORE_BASE}/cart/clear`, HDR);
  assert.ok(r.status === 200 || r.status === 404, `clear cart: ${r.status}`);
});

await test("LT-1: Empty cart → POST /cart/checkout/preview returns zero totals", async () => {
  const r = await post(`${STORE_BASE}/cart/checkout/preview`, { governorate_id: GOVERNORATE_ID }, HDR);
  assert.ok(r.status === 200 || r.status === 201, `${r.status} ${JSON.stringify(r.json)}`);
  assert.equal(r.json?.subtotal ?? 0, 0);
  assert.equal(r.json?.itemCount ?? 0, 0);
  samples.empty_preview = { subtotal: r.json?.subtotal, itemCount: r.json?.itemCount, total: r.json?.total };
});

await test("LT-2: Empty cart → POST /cart/checkout returns 400", async () => {
  const r = await post(
    `${STORE_BASE}/cart/checkout`,
    {
      customer_name: "اختبار Phase 5A",
      customer_phone: "07700000001",
      governorate_id: GOVERNORATE_ID,
      area: "منطقة الاختبار",
    },
    HDR,
  );
  assert.equal(r.status, 400, JSON.stringify(r.json));
  samples.empty_checkout_error = r.json?.message ?? r.json;
});

await test("LT-3: Add product to cart", async () => {
  const r = await post(`${STORE_BASE}/cart/items`, { productId: PRODUCT_ID, quantity: 1 }, HDR);
  assert.ok(r.status === 201 || r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);
});

let previewTotals;
await test("LT-4: POST /cart/checkout/preview — live totals", async () => {
  const r = await post(`${STORE_BASE}/cart/checkout/preview`, { governorate_id: GOVERNORATE_ID }, HDR);
  assert.ok(r.status === 200 || r.status === 201, `${r.status} ${JSON.stringify(r.json)}`);
  const t = {
    subtotal: r.json?.subtotal ?? r.json?.totals?.subtotal,
    delivery_cost: r.json?.delivery_cost ?? r.json?.totals?.delivery_cost,
    total: r.json?.total ?? r.json?.totals?.total,
  };
  assert.ok(typeof t.subtotal === "number");
  assert.ok(typeof t.delivery_cost === "number");
  assert.ok(typeof t.total === "number");
  assert.ok(t.subtotal > 0);
  assert.ok(t.total >= t.subtotal);
  previewTotals = t;
  samples.preview_totals = t;
  console.log(`    subtotal=${t.subtotal} delivery=${t.delivery_cost} total=${t.total}`);
});

let orderNumber;
let checkoutTotals;
await test("LT-5: POST /cart/checkout — creates order", async () => {
  const r = await post(
    `${STORE_BASE}/cart/checkout`,
    {
      customer_name: "اختبار Phase 5A Live",
      customer_phone: "07700000001",
      governorate_id: GOVERNORATE_ID,
      area: "منطقة الاختبار Live",
      notes: "Phase 5A live functional test",
    },
    HDR,
  );
  assert.ok(r.status === 200 || r.status === 201, `${r.status} ${JSON.stringify(r.json)}`);
  orderNumber = r.json?.order_number;
  checkoutTotals = r.json?.totals;
  assert.ok(orderNumber, "missing order_number");
  samples.checkout_response = { order_number: orderNumber, totals: checkoutTotals };
  console.log(`    order_number=${orderNumber}`);
});

await test("LT-6: DB — order B2B fields populated", async () => {
  assert.ok(orderNumber, "order_number required from LT-5");
  const rows = dbQuery(
    `SELECT source_app, channel, store_linked_profile_id, DilMart_user_id, DilMart_barbershop_id, segment, business_type
     FROM public.orders WHERE order_number = '${orderNumber.replace(/'/g, "''")}' LIMIT 1;`,
  );
  assert.equal(rows.length, 1, "order row not found");
  const row = rows[0];
  assert.equal(row.source_app, "barber_app");
  assert.equal(row.channel, "barber_app_checkout");
  assert.ok(row.store_linked_profile_id, "store_linked_profile_id missing");
  assert.ok(row.DilMart_user_id, "DilMart_user_id missing");
  assert.ok(row.segment, "segment missing");
  assert.ok(row.business_type, "business_type missing");
  samples.order_db_row = {
    source_app: row.source_app,
    channel: row.channel,
    store_linked_profile_id: row.store_linked_profile_id,
    DilMart_user_id: row.DilMart_user_id,
    DilMart_barbershop_id: row.DilMart_barbershop_id,
    segment: row.segment,
    business_type: row.business_type,
  };
  linkedProfileId = row.store_linked_profile_id;
});

await test("LT-7: DB — cart.status = converted", async () => {
  const profileId = linkedProfileId ?? samples.order_db_row?.store_linked_profile_id;
  assert.ok(profileId, "linked profile id required");
  const rows = dbQuery(
    `SELECT id, status FROM public.store_carts WHERE store_linked_profile_id = '${profileId.replace(/'/g, "''")}' AND status = 'converted' ORDER BY updated_at DESC LIMIT 1;`,
  );
  assert.ok(rows.length >= 1, "no converted cart found");
  samples.converted_cart = { id: rows[0].id, status: rows[0].status };
});

await test("LT-8: After checkout — preview on new empty cart returns zero totals", async () => {
  const r = await post(`${STORE_BASE}/cart/checkout/preview`, { governorate_id: GOVERNORATE_ID }, HDR);
  assert.ok(r.status === 200 || r.status === 201, `${r.status} ${JSON.stringify(r.json)}`);
  assert.equal(r.json?.itemCount ?? 0, 0);
});

// Double checkout — parallel submits must not create duplicate orders
await test("LT-9: Double checkout — no duplicate order (409 or single success)", async () => {
  await del(`${STORE_BASE}/cart/clear`, HDR);
  const add = await post(`${STORE_BASE}/cart/items`, { productId: PRODUCT_ID, quantity: 1 }, HDR);
  assert.ok(add.status === 201 || add.status === 200, `add item: ${add.status}`);

  const profileId = linkedProfileId ?? SESSION_PROFILE?.id;
  assert.ok(profileId, "linked profile id required");

  const countBeforeRows = dbQuery(
    `SELECT COUNT(*)::int AS c FROM public.orders WHERE store_linked_profile_id = '${profileId.replace(/'/g, "''")}' AND notes = 'parallel checkout race test';`,
  );
  const countBefore = Number(countBeforeRows[0]?.c ?? 0);

  const body = {
    customer_name: "اختبار Double Checkout",
    customer_phone: "07700000002",
    governorate_id: GOVERNORATE_ID,
    area: "منطقة Double",
    notes: "parallel checkout race test",
  };

  const [r1, r2] = await Promise.all([
    post(`${STORE_BASE}/cart/checkout`, body, HDR),
    post(`${STORE_BASE}/cart/checkout`, body, HDR),
  ]);

  const hasSuccess = [r1.status, r2.status].some((s) => s === 200 || s === 201);
  const hasConflict = r1.status === 409 || r2.status === 409;
  const hasBlocked = hasConflict || r2.status === 400 || r1.status === 400;
  assert.ok(hasSuccess, `expected one success, got ${r1.status} and ${r2.status}`);
  assert.ok(hasBlocked, `expected second attempt blocked, got ${r1.status} and ${r2.status}`);

  const countAfterRows = dbQuery(
    `SELECT COUNT(*)::int AS c FROM public.orders WHERE store_linked_profile_id = '${profileId.replace(/'/g, "''")}' AND notes = 'parallel checkout race test';`,
  );
  const countAfter = Number(countAfterRows[0]?.c ?? 0);
  assert.equal(countAfter - countBefore, 1, `duplicate orders created: before=${countBefore} after=${countAfter}`);

  samples.double_checkout_statuses = { first: r1.status, second: r2.status, orders_created: countAfter - countBefore };
  console.log(`    statuses: ${r1.status}, ${r2.status} | new_orders=${countAfter - countBefore}`);
});

{
  const webToken = mintWebSession(
    linkedProfileId ?? SESSION_PROFILE?.id,
    samples.order_db_row?.DilMart_user_id,
    samples.order_db_row?.DilMart_barbershop_id,
  );
  if (!webToken) {
    console.log("⏭️  LT-10: sourceApp=web → 403 — skipped (DilMart_INTEGRATION_SECRET not set locally)");
    results.push({ name: "LT-10: sourceApp=web → 403", status: "SKIP", reason: "no secret" });
  } else {
    await test("LT-10: sourceApp=web → 403", async () => {
      const r = await post(
        `${STORE_BASE}/cart/checkout/preview`,
        { governorate_id: GOVERNORATE_ID },
        { "X-Store-Session": webToken },
      );
      assert.equal(r.status, 403, JSON.stringify(r.json));
      samples.web_session_forbidden = { status: 403, message: r.json?.message };
    });
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

const summary = {
  ranAt: new Date().toISOString(),
  sessionSource: SESSION_PROFILE ? "main_backend" : process.env.X_STORE_SESSION ? "env" : "unknown",
  passed,
  failed,
  total: passed + failed,
  orderNumber: orderNumber ?? null,
  previewTotals: previewTotals ?? null,
  checkoutTotals: checkoutTotals ?? null,
  samples: redact(samples),
  results,
};

console.log("\n" + "─".repeat(60));
console.log(`Phase 5A Live Checkout Tests — ${summary.ranAt}`);
console.log(`PASSED: ${passed}   FAILED: ${failed}`);
console.log("─".repeat(60));

if (failed > 0) process.exit(1);
