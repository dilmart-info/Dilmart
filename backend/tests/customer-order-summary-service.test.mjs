/**
 * STORE-PR6A — Order Summary identity + orders + flag (spec §20, §21, §22) and read-only/minimal-query guarantees.
 * Pure service logic with fake config/assertion/repository — no DB, no network.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const {
  CustomerOrderSummaryService,
  isLinkedCustomer,
  projectLatestOrder,
  extractBearer,
} = await import("../dist/modules/store-integration/customer-order-summary/customer-order-summary.service.js");
const { isActiveOrderStatus, TERMINAL_ORDER_STATUSES } = await import(
  "../dist/modules/store-integration/customer-order-summary/customer-order-summary.types.js"
);
const { OrderSummaryError } = await import(
  "../dist/modules/store-integration/customer-order-summary/customer-order-summary.errors.js"
);

const SUB = "11111111-1111-4111-8111-111111111111";
const STORE_CUST = "store-cust-123";

function makeService(over = {}) {
  const calls = { verify: 0, findCustomerLink: 0, countActiveOrders: 0, findLatestOrder: 0, countArg: null };
  // Pass the flag through exactly (default true only when unspecified) so the "absent flag" case stays falsy.
  const config = { enabled: Object.prototype.hasOwnProperty.call(over, "enabled") ? over.enabled : true };
  const assertion = {
    verify: async () => {
      calls.verify++;
      if (over.verifyThrows) throw new Error("bad");
      return { sub: over.sub ?? SUB };
    },
  };
  const repo = {
    findCustomerLink: async () => {
      calls.findCustomerLink++;
      return over.link ?? null;
    },
    countActiveOrders: async (id) => {
      calls.countActiveOrders++;
      calls.countArg = id;
      return over.activeCount ?? 0;
    },
    findLatestOrder: async () => {
      calls.findLatestOrder++;
      return over.latest ?? null;
    },
  };
  return { svc: new CustomerOrderSummaryService(config, assertion, repo), calls };
}

const linkedRow = { DilMart_role: "CUSTOMER", link_status: "LINKED", store_customer_id: STORE_CUST };
const AUTH = "Bearer sometoken";

// ── Flag (§22) ────────────────────────────────────────────────────────────────
test("flag false/absent → disabled, verify NOT attempted", async () => {
  for (const enabled of [false, undefined]) {
    const { svc, calls } = makeService({ enabled });
    const err = await svc.getOrderSummary(AUTH).catch((e) => e);
    assert.ok(err instanceof OrderSummaryError && err.code === "STORE_INTEGRATION_DISABLED");
    assert.equal(calls.verify, 0);
  }
});

test("flag true → operates (independent of any handoff flag)", async () => {
  const { svc } = makeService({ enabled: true, link: linkedRow, activeCount: 2 });
  const res = await svc.getOrderSummary(AUTH);
  assert.equal(res.linked, true);
  assert.equal(res.activeOrdersCount, 2);
});

test("missing bearer / bad assertion → UNAUTHORIZED", async () => {
  const a = await makeService({ enabled: true }).svc.getOrderSummary(undefined).catch((e) => e);
  assert.ok(a instanceof OrderSummaryError && a.code === "UNAUTHORIZED");
  const b = await makeService({ enabled: true, verifyThrows: true }).svc.getOrderSummary(AUTH).catch((e) => e);
  assert.ok(b instanceof OrderSummaryError && b.code === "UNAUTHORIZED");
});

// ── Identity (§20) ──────────────────────────────────────────────────────────────
test("CUSTOMER + LINKED + store_customer_id → linked true", async () => {
  const { svc } = makeService({ link: linkedRow });
  const res = await svc.getOrderSummary(AUTH);
  assert.equal(res.linked, true);
  assert.equal(typeof res.updatedAt, "string");
});

test("every not-linked variant → linked false, no order queries, no mutation", async () => {
  const variants = [
    null,
    { DilMart_role: "CUSTOMER", link_status: "BLOCKED", store_customer_id: STORE_CUST },
    { DilMart_role: "CUSTOMER", link_status: "REVOKED", store_customer_id: STORE_CUST },
    { DilMart_role: "CUSTOMER", link_status: "LINK_REQUIRED", store_customer_id: STORE_CUST },
    { DilMart_role: "CUSTOMER", link_status: null, store_customer_id: STORE_CUST },
    { DilMart_role: "OWNER", link_status: "LINKED", store_customer_id: STORE_CUST },
    { DilMart_role: "CUSTOMER", link_status: "LINKED", store_customer_id: null },
  ];
  for (const link of variants) {
    const { svc, calls } = makeService({ link });
    const res = await svc.getOrderSummary(AUTH);
    assert.deepEqual(res.linked, false);
    assert.equal(res.activeOrdersCount, 0);
    assert.equal(res.latestOrder, null);
    // Read-only: no order queries for a not-linked identity; only the link lookup happened.
    assert.equal(calls.countActiveOrders, 0);
    assert.equal(calls.findLatestOrder, 0);
    assert.equal(calls.findCustomerLink, 1);
  }
});

test("isLinkedCustomer predicate is exact", () => {
  assert.equal(isLinkedCustomer(linkedRow), true);
  assert.equal(isLinkedCustomer(null), false);
  assert.equal(isLinkedCustomer({ DilMart_role: "CUSTOMER", link_status: "LINKED", store_customer_id: "" }), false);
});

// ── Orders (§21) ────────────────────────────────────────────────────────────────
test("linked + zero orders → count 0, latest null; count queried with resolved store_customer_id", async () => {
  const { svc, calls } = makeService({ link: linkedRow, activeCount: 0, latest: null });
  const res = await svc.getOrderSummary(AUTH);
  assert.equal(res.activeOrdersCount, 0);
  assert.equal(res.latestOrder, null);
  assert.equal(calls.countArg, STORE_CUST); // orders queried by resolved store_customer_id (→ orders.user_id)
});

test("linked + orders → count reflected, latest projected to exactly six fields, currency = currency_code", async () => {
  const latest = {
    order_number: "ST-12345",
    status: "preparing",
    delivery_status: "pending_assignment",
    total: 25000,
    currency_code: "USD", // non-IQD preserved, not hard-coded
    created_at: "2026-08-10T00:00:00.000Z",
  };
  const { svc } = makeService({ link: linkedRow, activeCount: 3, latest });
  const res = await svc.getOrderSummary(AUTH);
  assert.equal(res.activeOrdersCount, 3);
  assert.deepEqual(Object.keys(res.latestOrder).sort(), ["createdAt", "currency", "deliveryStatus", "orderNumber", "status", "total"].sort());
  assert.equal(res.latestOrder.orderNumber, "ST-12345");
  assert.equal(res.latestOrder.currency, "USD");
  assert.equal(res.latestOrder.total, 25000);
});

test("active/terminal classification is Store-owned + case-insensitive (§11)", () => {
  // Canonical orders.status terminal set (baseline CHECK + updateOrderStatus "Terminal statuses"): only these 3.
  for (const t of ["delivered", "returned", "cancelled", "DELIVERED", "Cancelled"]) {
    assert.equal(isActiveOrderStatus(t), false, `${t} must be terminal`);
  }
  // 'rejected' (merchant_decision_status, not orders.status) and 'completed' (checkout_attempts) are NOT terminal orders.
  for (const a of ["pending", "preparing", "processing", "accepted", "dispatched", "in_transit", "shipped", "new", "rejected", "completed"]) {
    assert.equal(isActiveOrderStatus(a), true, `${a} must be active`);
  }
  assert.deepEqual([...TERMINAL_ORDER_STATUSES].sort(), ["cancelled", "delivered", "returned"]);
});

test("projectLatestOrder maps currency_code → currency and never leaks extra keys", () => {
  const out = projectLatestOrder({
    order_number: "ST-1", status: "pending", delivery_status: null, total: 100, currency_code: "IQD",
    created_at: "2026-08-10T00:00:00.000Z",
    // hostile extras that must NOT survive projection:
    customer_phone: "+964...", customer_name: "x", address: "y",
  });
  assert.deepEqual(Object.keys(out).sort(), ["createdAt", "currency", "deliveryStatus", "orderNumber", "status", "total"].sort());
  assert.equal(out.currency, "IQD");
});

// ── extractBearer ──────────────────────────────────────────────────────────────
test("extractBearer parses only a Bearer token", () => {
  assert.equal(extractBearer("Bearer abc.def"), "abc.def");
  assert.equal(extractBearer("bearer abc"), "abc");
  assert.equal(extractBearer("Basic abc"), null);
  assert.equal(extractBearer(undefined), null);
  assert.equal(extractBearer("Bearer   "), null);
});

// ── Data-minimization regression: the summary query is bounded, never select("*") (§10, §21) ──
test("repository uses a bounded 6-column select and never select(\"*\")", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoJs = readFileSync(
    join(here, "../dist/modules/store-integration/customer-order-summary/customer-order-summary.repository.js"),
    "utf8",
  );
  assert.match(repoJs, /order_number, status, delivery_status, total, currency_code, created_at/);
  assert.doesNotMatch(repoJs, /select\(\s*["'`]\*/);
  // and it does NOT reuse OrdersService.getMyOrders
  assert.doesNotMatch(repoJs, /getMyOrders/);
});
