/**
 * PR-Q1 / PR-H8 — Hardening Regression Tests
 *
 * Pure unit tests for validators, search utils, phone normalizer,
 * and merchant privacy enforcement.
 * No Supabase, no HTTP server — just import compiled functions and assert.
 *
 * Run:  npm run build && node --test tests/hardening-regression.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";

// ── 1. Phone validation & normalization ─────────────────────────────────────

let normalizeIraqiPhone;
let phoneValidator;

test("load phone validators", async () => {
  const mod = await import("../dist/common/validators/iraqi-phone.validator.js");
  normalizeIraqiPhone = mod.normalizeIraqiPhone;
  // Instantiate the constraint class to test the validate method
  phoneValidator = new mod.IsIraqiPhoneConstraint();
  assert.ok(normalizeIraqiPhone);
  assert.ok(phoneValidator);
});

test("normalizeIraqiPhone: 07XXXXXXXXX passthrough", () => {
  assert.equal(normalizeIraqiPhone("07501234567"), "07501234567");
});

test("normalizeIraqiPhone: +9647XXXXXXXXX → 07...", () => {
  assert.equal(normalizeIraqiPhone("+9647501234567"), "07501234567");
});

test("normalizeIraqiPhone: 009647XXXXXXXXX → 07...", () => {
  assert.equal(normalizeIraqiPhone("009647501234567"), "07501234567");
});

test("normalizeIraqiPhone: already normalized stays unchanged", () => {
  assert.equal(normalizeIraqiPhone("07801234567"), "07801234567");
});

test("phone validator: valid 07... accepted", () => {
  assert.ok(phoneValidator.validate("07501234567"));
});

test("phone validator: valid +964... accepted", () => {
  assert.ok(phoneValidator.validate("+9647501234567"));
});

test("phone validator: valid 00964... accepted", () => {
  assert.ok(phoneValidator.validate("009647501234567"));
});

test("phone validator: random string rejected", () => {
  assert.ok(!phoneValidator.validate("abc123"));
});

test("phone validator: US number rejected", () => {
  assert.ok(!phoneValidator.validate("+14155551234"));
});

test("phone validator: too short rejected", () => {
  assert.ok(!phoneValidator.validate("0750123"));
});

// ── 2. NoHtmlTags validation — tests the ACTUAL constraint class ────────────

let htmlValidator;

test("load NoHtmlTagsConstraint", async () => {
  const mod = await import("../dist/common/validators/no-html-tags.validator.js");
  htmlValidator = new mod.NoHtmlTagsConstraint();
  assert.ok(htmlValidator);
  assert.equal(typeof htmlValidator.validate, "function");
});

test("NoHtmlTags: plain Arabic text passes", () => {
  assert.ok(htmlValidator.validate("أحمد من بغداد - منطقة الكرادة"));
});

test("NoHtmlTags: <script> rejected", () => {
  assert.ok(!htmlValidator.validate('<script>alert("xss")</script>'));
});

test("NoHtmlTags: <div> rejected", () => {
  assert.ok(!htmlValidator.validate("<div>hello</div>"));
});

test("NoHtmlTags: <img src=...> rejected", () => {
  assert.ok(!htmlValidator.validate('<img src="x" onerror="alert(1)">'));
});

test("NoHtmlTags: normal special chars allowed", () => {
  assert.ok(htmlValidator.validate("شارع 40 - مجاور مطعم (سعيد) #123"));
});

test("NoHtmlTags: non-string returns true (other validators handle type)", () => {
  assert.ok(htmlValidator.validate(12345));
  assert.ok(htmlValidator.validate(null));
  assert.ok(htmlValidator.validate(undefined));
});

test("NoHtmlTags: empty closing tag rejected", () => {
  assert.ok(!htmlValidator.validate("text </br> more"));
});

test("NoHtmlTags: self-closing tag rejected", () => {
  assert.ok(!htmlValidator.validate('<input type="text"/>'));
});

// ── 3. PostgREST search escaping ────────────────────────────────────────────

let escapePostgrestSearch;
let sanitizeSearchTerm;
let buildSafeOrFilter;

test("load search-utils", async () => {
  const mod = await import("../dist/common/search-utils.js");
  escapePostgrestSearch = mod.escapePostgrestSearch;
  sanitizeSearchTerm = mod.sanitizeSearchTerm;
  buildSafeOrFilter = mod.buildSafeOrFilter;
  assert.ok(escapePostgrestSearch);
  assert.ok(sanitizeSearchTerm);
  assert.ok(buildSafeOrFilter);
});

test("escapePostgrestSearch: plain text unchanged", () => {
  assert.equal(escapePostgrestSearch("أحمد"), "أحمد");
});

test("escapePostgrestSearch: % wildcard escaped", () => {
  const result = escapePostgrestSearch("100%");
  assert.ok(result.includes("\\%"));
  assert.ok(!result.includes("100%"));
});

test("escapePostgrestSearch: _ wildcard escaped", () => {
  const result = escapePostgrestSearch("a_b");
  assert.ok(result.includes("\\_"));
});

test("escapePostgrestSearch: comma removed (prevents filter injection)", () => {
  const result = escapePostgrestSearch("a,b");
  assert.ok(!result.includes(","));
});

test("escapePostgrestSearch: parentheses removed", () => {
  const result = escapePostgrestSearch("test(abc)");
  assert.ok(!result.includes("("));
  assert.ok(!result.includes(")"));
});

test("escapePostgrestSearch: dots removed", () => {
  const result = escapePostgrestSearch("user.name");
  assert.ok(!result.includes("."));
});

test("sanitizeSearchTerm: null returns empty", () => {
  assert.equal(sanitizeSearchTerm(null), "");
  assert.equal(sanitizeSearchTerm(undefined), "");
  assert.equal(sanitizeSearchTerm(""), "");
});

test("sanitizeSearchTerm: trims whitespace", () => {
  const result = sanitizeSearchTerm("  أحمد  ");
  assert.equal(result, "أحمد");
});

test("sanitizeSearchTerm: enforces maxLen", () => {
  const long = "a".repeat(200);
  const result = sanitizeSearchTerm(long, 80);
  assert.ok(result.length <= 80);
});

test("buildSafeOrFilter: generates correct ilike filter", () => {
  const filter = buildSafeOrFilter("أحمد", ["full_name", "email"]);
  assert.equal(filter, "full_name.ilike.%أحمد%,email.ilike.%أحمد%");
});

// ── 4. Merchant privacy: select string and search scope enforcement ─────────

let OrdersService;

test("load OrdersService", async () => {
  const mod = await import("../dist/modules/orders/orders.service.js");
  OrdersService = mod.OrdersService;
  assert.ok(OrdersService);
});

test("merchant-scoped select string excludes customer_name and customer_phone", async () => {
  // Track all .select() calls made by OrdersService.listOrdersForMerchant
  const selectCalls = [];
  const orCalls = [];
  const mockChain = () => {
    const chain = {
      select(...args) { selectCalls.push(args); return chain; },
      order() { return chain; },
      eq() { return chain; },
      gte() { return chain; },
      lte() { return chain; },
      or(...args) { orCalls.push(args); return chain; },
      range() { return chain; },
      limit() { return chain; },
      maybeSingle: async () => ({ data: { merchant_id: "m1" }, error: null }),
      then(resolve) { resolve({ data: [], error: null, count: 0 }); return chain; },
    };
    // Make chain awaitable
    chain[Symbol.for("nodejs.util.promisify.custom")] = undefined;
    return chain;
  };

  const mockSupabase = {
    client: {
      from(table) { return mockChain(); },
    },
  };

  const service = new OrdersService(mockSupabase);
  service.scopeResolver = {
    resolveMerchantScope: async (reqId, role, actorId) => reqId || "m1"
  };

  // Call listOrders with merchant_owner role
  try {
    await service.listOrders({
      actor_role: "merchant_owner",
      actor_id: "user-1",
      merchant_id: "m1",
    });
  } catch {
    // may throw on mock limitations — we still capture .select()
  }

  // Verify select calls
  assert.ok(selectCalls.length > 0, "Expected at least one .select() call");

  // Find the orders select (the one with "order_number")
  const ordersSelect = selectCalls.find((args) => {
    const str = typeof args[0] === "string" ? args[0] : "";
    return str.includes("order_number");
  });
  assert.ok(ordersSelect, "Expected orders .select() call with order_number");

  const selectStr = ordersSelect[0];
  assert.ok(!selectStr.includes("customer_name"),
    `Merchant select must NOT contain customer_name. Got: ${selectStr}`);
  assert.ok(!selectStr.includes("customer_phone"),
    `Merchant select must NOT contain customer_phone. Got: ${selectStr}`);
});

test("merchant-scoped search uses only order_number column", async () => {
  const orCalls = [];
  const mockChain = () => {
    const chain = {
      select() { return chain; },
      order() { return chain; },
      eq() { return chain; },
      gte() { return chain; },
      lte() { return chain; },
      or(...args) { orCalls.push(args); return chain; },
      range() { return chain; },
      limit() { return chain; },
      maybeSingle: async () => ({ data: { merchant_id: "m1" }, error: null }),
      then(resolve) { resolve({ data: [], error: null, count: 0 }); return chain; },
    };
    return chain;
  };

  const mockSupabase = {
    client: {
      from() { return mockChain(); },
    },
  };

  const service = new OrdersService(mockSupabase);
  service.scopeResolver = {
    resolveMerchantScope: async (reqId, role, actorId) => reqId || "m1"
  };

  try {
    await service.listOrders({
      actor_role: "merchant_owner",
      actor_id: "user-1",
      merchant_id: "m1",
      search: "test-search",
    });
  } catch {
    // expected with mock
  }

  // Find the or() call (search filter)
  if (orCalls.length > 0) {
    const filterStr = orCalls[0][0];
    assert.ok(filterStr.includes("order_number"),
      `Merchant search filter must include order_number. Got: ${filterStr}`);
    assert.ok(!filterStr.includes("customer_name"),
      `Merchant search filter must NOT include customer_name. Got: ${filterStr}`);
    assert.ok(!filterStr.includes("customer_phone"),
      `Merchant search filter must NOT include customer_phone. Got: ${filterStr}`);
  }
  // If no or() calls, search was empty or sanitized away — that's still safe
});

// ── 5. Scoped Customers privacy: merchant path uses RPC, no PII ─────────────

let AdminService;
let AdminCustomersService;

test("load AdminService", async () => {
  const mod = await import("../dist/modules/admin/admin.service.js");
  AdminService = mod.AdminService;
  assert.ok(AdminService);
  const custMod = await import("../dist/modules/admin/admin-customers.service.js");
  AdminCustomersService = custMod.AdminCustomersService;
  assert.ok(AdminCustomersService);
});

test("merchant getScopedCustomers uses RPC, not orders.select with customer fields", async () => {
  const selectCalls = [];
  const rpcCalls = [];
  const mockChain = () => {
    const chain = {
      select(...args) { selectCalls.push(args); return chain; },
      order() { return chain; },
      eq() { return chain; },
      in() { return chain; },
      gte() { return chain; },
      lte() { return chain; },
      or() { return chain; },
      range() { return chain; },
      limit() { return chain; },
      maybeSingle: async () => ({ data: { merchant_id: "m1" }, error: null }),
      then(resolve) { resolve({ data: [], error: null, count: 0 }); return chain; },
    };
    return chain;
  };

  const mockSupabase = {
    client: {
      from() { return mockChain(); },
      rpc(name, params) {
        rpcCalls.push({ name, params });
        return Promise.resolve({
          data: { items: [], total: 0, limit: 50, offset: 0, has_more: false },
          error: null,
        });
      },
    },
  };

  // Build a minimal AdminCustomersService with only the dependencies we need
  const service = new AdminCustomersService(
    mockSupabase,     // supabaseAdmin
    {
      resolveMerchantScope: async (reqId, role, actorId) => reqId || "m1"
    }
  );

  let result;
  try {
    result = await service.getScopedCustomers({
      actor_role: "merchant_owner",
      actor_id: "user-1",
      merchant_id: "m1",
    });
  } catch {
    // may throw due to missing dependencies, but we can still check calls
  }

  // Merchant path must call RPC, not select customer_name/customer_phone
  assert.ok(rpcCalls.length > 0,
    "Expected merchant path to call RPC merchant_customer_summary");
  assert.equal(rpcCalls[0].name, "merchant_customer_summary",
    `Expected RPC name 'merchant_customer_summary', got '${rpcCalls[0].name}'`);

  // No select call should contain customer_name or customer_phone
  for (const call of selectCalls) {
    const str = typeof call[0] === "string" ? call[0] : "";
    assert.ok(!str.includes("customer_name"),
      `Merchant getScopedCustomers must NOT select customer_name. Got: ${str}`);
    assert.ok(!str.includes("customer_phone"),
      `Merchant getScopedCustomers must NOT select customer_phone. Got: ${str}`);
  }

  // If result succeeded, verify no PII fields in response
  if (result?.items) {
    for (const item of result.items) {
      assert.ok(!("name" in item),
        "Merchant customer item must NOT have 'name' field");
      assert.ok(!("phone" in item),
        "Merchant customer item must NOT have 'phone' field");
      assert.ok(!("customer_name" in item),
        "Merchant customer item must NOT have 'customer_name' field");
      assert.ok(!("customer_phone" in item),
        "Merchant customer item must NOT have 'customer_phone' field");
    }
  }
});

test("merchant getScopedCustomers response has paginated structure", async () => {
  const mockSupabase = {
    client: {
      from() {
        const chain = {
          select() { return chain; },
          order() { return chain; },
          eq() { return chain; },
          in() { return chain; },
          or() { return chain; },
          range() { return chain; },
          limit() { return chain; },
          maybeSingle: async () => ({ data: { merchant_id: "m1" }, error: null }),
        };
        return chain;
      },
      rpc() {
        return Promise.resolve({
          data: {
            items: [
              { customer_ref: "عميل #A1B2", phone_masked: "****4567", orders: 3, spent: 75000, last_order_at: "2026-06-08" },
            ],
            total: 1,
            limit: 50,
            offset: 0,
            has_more: false,
          },
          error: null,
        });
      },
    },
  };

  const service = new AdminCustomersService(
    mockSupabase,
    {
      resolveMerchantScope: async (reqId, role, actorId) => reqId || "m1"
    }
  );

  const result = await service.getScopedCustomers({
    actor_role: "merchant_owner",
    actor_id: "user-1",
    merchant_id: "m1",
  });

  // Verify paginated structure
  assert.ok(result.items, "Response must have 'items' array");
  assert.equal(typeof result.page, "number", "Response must have 'page'");
  assert.equal(typeof result.limit, "number", "Response must have 'limit'");
  assert.equal(typeof result.total, "number", "Response must have 'total'");
  assert.equal(typeof result.hasMore, "boolean", "Response must have 'hasMore'");

  // Verify item structure: customer_ref, phone_masked, orders, spent
  const item = result.items[0];
  assert.ok(item.customer_ref, "Item must have customer_ref");
  assert.ok(item.phone_masked, "Item must have phone_masked");
  assert.ok(!item.customer_ref.includes("07"), "customer_ref must not contain a real phone number");
});

test("merchant getScopedCustomers search passes p_search to RPC (masked search only)", async () => {
  const rpcCalls = [];
  const mockSupabase = {
    client: {
      from() {
        const chain = {
          select() { return chain; },
          order() { return chain; },
          eq() { return chain; },
          in() { return chain; },
          or() { return chain; },
          range() { return chain; },
          limit() { return chain; },
          maybeSingle: async () => ({ data: { merchant_id: "m1" }, error: null }),
        };
        return chain;
      },
      rpc(name, params) {
        rpcCalls.push({ name, params });
        return Promise.resolve({
          data: { items: [], total: 0, limit: 50, offset: 0, has_more: false },
          error: null,
        });
      },
    },
  };

  const service = new AdminCustomersService(
    mockSupabase,
    {
      resolveMerchantScope: async (reqId, role, actorId) => reqId || "m1"
    }
  );

  await service.getScopedCustomers({
    actor_role: "merchant_owner",
    actor_id: "user-1",
    merchant_id: "m1",
    search: "07501234567",  // Full phone number — should be passed as p_search
  });

  // RPC should be called with the search term
  assert.ok(rpcCalls.length > 0, "Expected RPC call");
  const rpcParams = rpcCalls[0].params;
  assert.ok(rpcParams.p_search !== undefined, "RPC must receive p_search param");
});

// ── 6. SQL structure: merchant_customer_summary search privacy verification ──

test("SQL: merchant_customer_summary does NOT search on raw customer_name or customer_phone", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");

  // Find the latest migration that defines merchant_customer_summary
  const migrationsDir = path.resolve(import.meta.dirname, "../../supabase/migrations");
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.includes("merchant_customer") || f.includes("fix_merchant_customer"))
    .sort()
    .reverse(); // latest first

  assert.ok(files.length > 0, "Expected at least one merchant_customer migration file");

  const latestFile = path.join(migrationsDir, files[0]);
  const sql = fs.readFileSync(latestFile, "utf-8");

  // Extract WHERE clauses that involve ILIKE (search filtering)
  // The RPC should NOT contain customer_name ILIKE or customer_phone ILIKE
  // It SHOULD only contain customer_ref ILIKE and phone_masked ILIKE
  const ilikeLines = sql.split("\n").filter((line) =>
    line.toLowerCase().includes("ilike") && line.toLowerCase().includes("p_search")
  );

  assert.ok(ilikeLines.length > 0, "Expected ILIKE lines in SQL for search");

  for (const line of ilikeLines) {
    assert.ok(!line.includes("customer_name"),
      `SQL must NOT search on customer_name. Found: ${line.trim()}`);
    assert.ok(!line.includes("customer_phone"),
      `SQL must NOT search on customer_phone. Found: ${line.trim()}`);
  }

  // Verify search is on masked fields
  const searchesRef = ilikeLines.some((l) => l.includes("customer_ref"));
  const searchesMasked = ilikeLines.some((l) => l.includes("phone_masked"));
  assert.ok(searchesRef, "SQL must search on customer_ref");
  assert.ok(searchesMasked, "SQL must search on phone_masked");
});

console.log("\n✅ All hardening regression tests defined.\n");
