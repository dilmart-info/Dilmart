/**
 * True product-readiness filtering (DilMart-STORE-TRUE-PRODUCT-READINESS-FILTERING).
 *
 * `readiness=ready` must mean the row's ACTUAL `buildProductReadiness(row).is_ready === true`
 * over the COMPLETE scoped population, with the filter applied BEFORE pagination/counting —
 * not the old `is_active` approximation.
 *
 * The fake below models PostgREST over a `products` table that carries the STORED GENERATED
 * column `is_ready` (migration 20260820120000). The generated value is computed here by
 * `sqlIsReady`, a faithful transcription of the SQL expression — deliberately written
 * independently of the TypeScript `buildProductReadiness` so the parity assertions below are a
 * real comparison rather than a tautology.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ProductsService } from "../dist/modules/products/products.service.js";
import { buildProductReadiness } from "../dist/modules/products/product-readiness.js";

const MERCHANT_A = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
const MERCHANT_B = "1689ae4a-41f5-425b-bebe-c99c74880008";
const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE = "https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/img.png";

/** Characters `String.prototype.trim()` strips — the same set the SQL btrim() uses. */
const JS_TRIM_CHARS = [
  " ", "\t", "\n", "\r", "\f", "\v",
  " ", " ", " ", " ", " ", " ", " ", " ",
  " ", " ", " ", " ", " ", " ", " ", " ",
  " ", "　", "﻿",
];

function sqlBtrim(value) {
  const text = value === null || value === undefined ? "" : String(value);
  let start = 0;
  let end = text.length;
  while (start < end && JS_TRIM_CHARS.includes(text[start])) start += 1;
  while (end > start && JS_TRIM_CHARS.includes(text[end - 1])) end -= 1;
  return text.slice(start, end);
}

/** Transcription of the generated-column expression from the migration. */
function sqlIsReady(row) {
  const price = row.price ?? 0;
  const stock = row.stock ?? 0;
  const images = Array.isArray(row.images) ? row.images : [];
  const discount = row.discount_price ?? null;
  return (
    sqlBtrim(row.name) !== "" &&
    sqlBtrim(row.slug) !== "" &&
    Number(price) > 0 &&
    row.category_id !== null &&
    row.category_id !== undefined &&
    images.length > 0 &&
    Number(stock) >= 0 &&
    (discount === null || (Number(discount) > 0 && Number(discount) < Number(price))) &&
    sqlBtrim(row.description) !== "" &&
    row.is_active === true
  );
}

/** Rows as the DATABASE stores them: `is_ready` is generated, never written by the app. */
function storedRow(row) {
  return { ...row, is_ready: sqlIsReady(row) };
}

function makeProduct(index, overrides = {}) {
  const num = String(index).padStart(4, "0");
  return storedRow({
    id: `prod-${num}`,
    merchant_id: MERCHANT_A,
    name: `منتج ${num}`,
    slug: `product-${num}`,
    description: `وصف المنتج ${num}`,
    price: 150,
    discount_price: null,
    category_id: CATEGORY_ID,
    images: [IMAGE],
    stock: 5,
    is_active: true,
    is_published: true,
    visibility_status: "public",
    created_at: new Date(1700000000000 + index * 1000).toISOString(),
    categories: { name: "العطور" },
    merchants: { display_name: "أرض الخليج" },
    ...overrides,
  });
}

function makeService(products = [], options = {}) {
  const state = { products: structuredClone(products) };

  class MockQuery {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.searchField = null;
      this.searchVal = null;
      this.rangeFrom = null;
      this.rangeTo = null;
      this.orderClauses = [];
    }
    select(fields, opts) {
      this.selectFields = fields;
      this.countMode = opts?.count ?? null;
      return this;
    }
    eq(field, value) {
      this.filters.push([field, value]);
      return this;
    }
    ilike(field, pattern) {
      this.searchField = field;
      this.searchVal = String(pattern ?? "").replace(/^%|%$/g, "").toLowerCase();
      return this;
    }
    order(field, opts) {
      this.orderClauses.push({ field, ascending: opts?.ascending ?? true });
      return this;
    }
    range(from, to) {
      this.rangeFrom = from;
      this.rangeTo = to;
      return this;
    }
    async then(resolve) {
      let rows = [...state.products];
      for (const [field, value] of this.filters) {
        rows = rows.filter((row) => row[field] === value);
      }
      if (this.searchField && this.searchVal) {
        rows = rows.filter((row) =>
          String(row[this.searchField] ?? "").toLowerCase().includes(this.searchVal),
        );
      }
      for (const clause of [...this.orderClauses].reverse()) {
        rows.sort((a, b) => {
          const va = a[clause.field];
          const vb = b[clause.field];
          if (va === vb) return 0;
          return clause.ascending ? (va > vb ? 1 : -1) : va < vb ? 1 : -1;
        });
      }
      // count: "exact" is computed on the FILTERED population, before range() — exactly like
      // PostgREST. If the service filtered on the wrong predicate, this count is wrong too.
      const total = rows.length;
      const paged =
        this.rangeFrom !== null && this.rangeTo !== null ? rows.slice(this.rangeFrom, this.rangeTo + 1) : rows;
      return resolve({ data: paged, count: total, error: null });
    }
  }

  const scopeResolver = {
    resolveMerchantScope: async (merchantId, actorRole) => {
      if (actorRole === "merchant_owner" || actorRole === "merchant_manager" || actorRole === "merchant_staff") {
        // server-authoritative: a merchant actor is always pinned to their own merchant
        return options.forcedMerchantId ?? MERCHANT_A;
      }
      return merchantId ?? null;
    },
  };

  return new ProductsService({ client: { from: (table) => new MockQuery(table) } }, scopeResolver, {
    assertAssignableCategoryId: async () => {},
  });
}

// ── Phase 2 reproduction fixture ─────────────────────────────────────────────
// A: active + complete            → truly ready
// B: active + missing image       → truly NOT ready (the old filter called it "ready")
// C: inactive + otherwise complete→ truly NOT ready
const A = makeProduct(1, { id: "prod-A" });
const B = makeProduct(2, { id: "prod-B", images: [] });
const C = makeProduct(3, { id: "prod-C", is_active: false, is_published: false, visibility_status: "private" });

test("readiness=ready returns only truly ready products (not merely active ones)", async () => {
  const service = makeService([A, B, C]);
  const result = await service.listProducts({ merchant_id: MERCHANT_A, readiness: "ready" });

  assert.deepEqual(result.items.map((item) => item.id).sort(), ["prod-A"]);
  assert.equal(result.total, 1, "total must count only truly ready products");
  for (const item of result.items) {
    assert.equal(item.readiness.is_ready, true, `${item.id} must actually be ready`);
  }
});

test("readiness=not_ready returns every truly not-ready product, including active ones", async () => {
  const service = makeService([A, B, C]);
  const result = await service.listProducts({ merchant_id: MERCHANT_A, readiness: "not_ready" });

  assert.deepEqual(result.items.map((item) => item.id).sort(), ["prod-B", "prod-C"]);
  assert.equal(result.total, 2);
  for (const item of result.items) {
    assert.equal(item.readiness.is_ready, false, `${item.id} must actually be not-ready`);
  }
});

test("readiness=all applies no readiness filtering", async () => {
  const service = makeService([A, B, C]);
  const all = await service.listProducts({ merchant_id: MERCHANT_A, readiness: "all" });
  const none = await service.listProducts({ merchant_id: MERCHANT_A });

  assert.equal(all.total, 3);
  assert.equal(none.total, 3);
  assert.deepEqual(all.items.map((i) => i.id).sort(), ["prod-A", "prod-B", "prod-C"]);
});

test("ready and not_ready partition the scoped population exactly once", async () => {
  const population = [A, B, C];
  const service = makeService(population);
  const ready = await service.listProducts({ merchant_id: MERCHANT_A, readiness: "ready", limit: 500 });
  const notReady = await service.listProducts({ merchant_id: MERCHANT_A, readiness: "not_ready", limit: 500 });

  const readyIds = ready.items.map((i) => i.id);
  const notReadyIds = notReady.items.map((i) => i.id);
  assert.equal(readyIds.length + notReadyIds.length, population.length);
  assert.equal(new Set([...readyIds, ...notReadyIds]).size, population.length);
  assert.equal(ready.total + notReady.total, population.length);
});

// ── Phase 9 semantic matrix ──────────────────────────────────────────────────
const MATRIX = [
  { label: "1 active + all checks pass", overrides: {}, ready: true },
  { label: "2 active + missing images", overrides: { images: [] }, ready: false },
  { label: "3 active + missing description", overrides: { description: "" }, ready: false },
  { label: "4 active + whitespace-only description", overrides: { description: "   \t\n" }, ready: false },
  { label: "5 active + whitespace-only name", overrides: { name: "  " }, ready: false },
  { label: "6 active + whitespace-only slug", overrides: { slug: "\t" }, ready: false },
  { label: "7 active + price = 0", overrides: { price: 0 }, ready: false },
  { label: "7b active + negative price", overrides: { price: -5 }, ready: false },
  { label: "8 active + missing category", overrides: { category_id: null }, ready: false },
  { label: "9 active + negative stock", overrides: { stock: -1 }, ready: false },
  { label: "9b active + zero stock still ready", overrides: { stock: 0 }, ready: true },
  { label: "10 active + discount <= 0", overrides: { discount_price: 0 }, ready: false },
  { label: "11 active + discount >= price", overrides: { discount_price: 150 }, ready: false },
  { label: "12 active + discount null", overrides: { discount_price: null }, ready: true },
  { label: "12b active + valid discount", overrides: { discount_price: 100 }, ready: true },
  { label: "13 inactive but otherwise complete", overrides: { is_active: false }, ready: false },
  { label: "13b images null", overrides: { images: null }, ready: false },
  { label: "13c description null", overrides: { description: null }, ready: false },
];

for (const entry of MATRIX) {
  test(`semantic matrix — ${entry.label} → ${entry.ready ? "ready" : "not_ready"}`, async () => {
    const product = makeProduct(1, { id: "prod-matrix", ...entry.overrides });
    const service = makeService([product]);

    // the DB-generated value and the TypeScript contract must agree
    assert.equal(product.is_ready, entry.ready, "stored generated column");
    assert.equal(buildProductReadiness(product).is_ready, entry.ready, "buildProductReadiness");

    const ready = await service.listProducts({ merchant_id: MERCHANT_A, readiness: "ready" });
    const notReady = await service.listProducts({ merchant_id: MERCHANT_A, readiness: "not_ready" });

    if (entry.ready) {
      assert.equal(ready.total, 1);
      assert.equal(notReady.total, 0);
      assert.equal(ready.items[0].readiness.is_ready, true);
    } else {
      assert.equal(ready.total, 0);
      assert.equal(notReady.total, 1);
      assert.equal(notReady.items[0].readiness.is_ready, false);
    }
  });
}

// ── Phase 8 pagination correctness ───────────────────────────────────────────
function buildLargePopulation() {
  const products = [];
  for (let i = 1; i <= 210; i += 1) {
    const bucket = i % 6;
    const overrides = { id: `prod-${String(i).padStart(4, "0")}` };
    if (bucket === 1) Object.assign(overrides, { images: [] }); // active, not ready
    if (bucket === 2) Object.assign(overrides, { description: "   " }); // active, not ready
    if (bucket === 3) Object.assign(overrides, { is_active: false }); // inactive, not ready
    if (bucket === 4) Object.assign(overrides, { discount_price: 200 }); // invalid discount
    // buckets 5 and 0 stay fully ready
    if (i % 7 === 0) overrides.name = `منتج مميز ${String(i).padStart(4, "0")}`; // search subset
    products.push(makeProduct(i, overrides));
  }
  return products;
}

test("pagination: totals and pages reflect the true readiness population", async () => {
  const population = buildLargePopulation();
  const service = makeService(population);

  const expectedReady = population.filter((p) => p.is_ready).length;
  const expectedNotReady = population.length - expectedReady;
  assert.ok(expectedReady > 40 && expectedNotReady > 40, "fixture must exercise both buckets");

  const readyPage1 = await service.listProducts({ merchant_id: MERCHANT_A, readiness: "ready", limit: 20, offset: 0 });
  assert.equal(readyPage1.total, expectedReady);
  assert.equal(readyPage1.items.length, 20);
  assert.ok(readyPage1.items.every((item) => item.readiness.is_ready === true));

  const readyPage2 = await service.listProducts({ merchant_id: MERCHANT_A, readiness: "ready", limit: 20, offset: 20 });
  assert.equal(readyPage2.total, expectedReady);
  assert.equal(readyPage2.items.length, 20);
  assert.ok(readyPage2.items.every((item) => item.readiness.is_ready === true));

  const page1Ids = new Set(readyPage1.items.map((i) => i.id));
  const page2Ids = readyPage2.items.map((i) => i.id);
  assert.equal(page2Ids.some((id) => page1Ids.has(id)), false, "pages must not overlap");

  // walking every page must yield exactly the ready population, with no holes
  const walked = [];
  for (let offset = 0; offset < expectedReady; offset += 20) {
    const page = await service.listProducts({ merchant_id: MERCHANT_A, readiness: "ready", limit: 20, offset });
    walked.push(...page.items.map((i) => i.id));
  }
  assert.equal(walked.length, expectedReady);
  assert.equal(new Set(walked).size, expectedReady);

  const notReadyPage1 = await service.listProducts({
    merchant_id: MERCHANT_A,
    readiness: "not_ready",
    limit: 20,
    offset: 0,
  });
  assert.equal(notReadyPage1.total, expectedNotReady);
  assert.equal(notReadyPage1.items.length, 20);
  assert.ok(notReadyPage1.items.every((item) => item.readiness.is_ready === false));
});

test("pagination: search intersects with readiness for both totals and pages", async () => {
  const population = buildLargePopulation();
  const service = makeService(population);

  const expected = population.filter((p) => p.is_ready && p.name.includes("مميز")).length;
  assert.ok(expected > 0, "fixture must contain ready products matching the search");

  const result = await service.listProducts({
    merchant_id: MERCHANT_A,
    readiness: "ready",
    search: "مميز",
    limit: 10,
    offset: 0,
  });

  assert.equal(result.total, expected, "total must be the search ∩ readiness intersection");
  assert.ok(result.items.every((item) => item.readiness.is_ready === true));
  assert.ok(result.items.every((item) => item.name.includes("مميز")));
});

test("pagination: merchant scope intersects with readiness", async () => {
  const mine = buildLargePopulation();
  const theirs = buildLargePopulation().map((p) => ({ ...p, id: `other-${p.id}`, merchant_id: MERCHANT_B }));
  const service = makeService([...mine, ...theirs]);

  const expectedReady = mine.filter((p) => p.is_ready).length;
  const result = await service.listProducts({
    merchant_id: MERCHANT_A,
    readiness: "ready",
    limit: 500,
    offset: 0,
  });

  assert.equal(result.total, expectedReady, "another merchant's ready products must not be counted");
  assert.ok(result.items.every((item) => item.merchant_id === MERCHANT_A));
});

// ── Phase 6 scope security ───────────────────────────────────────────────────
test("a merchant actor cannot widen readiness filtering beyond their resolved scope", async () => {
  const mine = buildLargePopulation();
  const theirs = buildLargePopulation().map((p) => ({ ...p, id: `other-${p.id}`, merchant_id: MERCHANT_B }));
  const service = makeService([...mine, ...theirs]);

  // crafted merchant_id for a merchant the actor does not belong to
  const result = await service.listProducts({
    merchant_id: MERCHANT_B,
    readiness: "ready",
    limit: 500,
    actor_role: "merchant_owner",
    actor_id: "owner-1",
  });

  assert.ok(result.items.length > 0);
  assert.ok(
    result.items.every((item) => item.merchant_id === MERCHANT_A),
    "ScopeResolver stays authoritative: the crafted merchant_id must not broaden access",
  );
});

test("every returned row's readiness object agrees with the filter it was returned under", async () => {
  const population = buildLargePopulation();
  const service = makeService(population);

  const ready = await service.listProducts({ merchant_id: MERCHANT_A, readiness: "ready", limit: 500 });
  const notReady = await service.listProducts({ merchant_id: MERCHANT_A, readiness: "not_ready", limit: 500 });

  for (const item of ready.items) {
    assert.equal(item.readiness.is_ready, true);
    assert.equal(buildProductReadiness(item).is_ready, true);
    assert.equal(item.is_ready, true, "stored generated column parity");
  }
  for (const item of notReady.items) {
    assert.equal(item.readiness.is_ready, false);
    assert.equal(buildProductReadiness(item).is_ready, false);
    assert.equal(item.is_ready, false, "stored generated column parity");
  }
});
