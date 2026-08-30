/**
 * Marketplace public visibility filters — Gate 2 correction for
 * DilMart-ARD-AL-KHALEEJ-VERTICAL-PILOT-10-001.
 *
 * Verifies that `applyPublicProductFilters` (is_active + is_published + visibility_status)
 * is actually applied by EVERY public-facing `products` query in `MarketplaceService`,
 * including the ones Gate 1 had left on the older `is_active`-only rule (`getCategoryPage`,
 * `getProductsByIds`, `getOffersList`, `getBrands`, the barber_app segmented home).
 *
 * No network. `SupabaseAdminService` and `WhatsAppIntentsService` are fakes; the fake query
 * builder just records every `.eq()/.not()/.contains()/...` call made against each table so we
 * can assert the three visibility filters are present, without needing a real Postgres.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { MarketplaceService } = await import("../dist/modules/marketplace/marketplace.service.js");

// ── Fake Supabase: records every filter call per `.from(table)` invocation ─

function makeRecord(table) {
  return { table, ops: [], wantSingle: false, wantMaybeSingle: false };
}

/**
 * `routes[table]` is `(record) => ({ data, error, count })`. If omitted, defaults to an empty
 * result set, which is enough for tests that only care about which filters were applied.
 */
function createFakeMarketplaceSupabase(routes = {}) {
  const allCalls = [];

  function builder(table) {
    const record = makeRecord(table);
    allCalls.push(record);

    function resolve() {
      const routeFn = routes[table];
      const result = routeFn ? routeFn(record) : { data: [], error: null, count: 0 };
      return Promise.resolve({ data: null, error: null, count: null, ...result });
    }

    const api = {
      select(sel, opts) {
        record.ops.push(["select", sel, opts]);
        return api;
      },
      eq(col, val) {
        record.ops.push(["eq", col, val]);
        return api;
      },
      neq(col, val) {
        record.ops.push(["neq", col, val]);
        return api;
      },
      not(col, op, val) {
        record.ops.push(["not", col, op, val]);
        return api;
      },
      or(expr) {
        record.ops.push(["or", expr]);
        return api;
      },
      contains(col, val) {
        record.ops.push(["contains", col, val]);
        return api;
      },
      ilike(col, val) {
        record.ops.push(["ilike", col, val]);
        return api;
      },
      gte(col, val) {
        record.ops.push(["gte", col, val]);
        return api;
      },
      lte(col, val) {
        record.ops.push(["lte", col, val]);
        return api;
      },
      in(col, val) {
        record.ops.push(["in", col, val]);
        return api;
      },
      filter(col, op, val) {
        record.ops.push(["filter", col, op, val]);
        return api;
      },
      order(col, opts) {
        record.ops.push(["order", col, opts]);
        return api;
      },
      limit(n) {
        record.ops.push(["limit", n]);
        return api;
      },
      range(from, to) {
        record.ops.push(["range", from, to]);
        return api;
      },
      maybeSingle() {
        record.wantMaybeSingle = true;
        return resolve();
      },
      single() {
        record.wantSingle = true;
        return resolve();
      },
      then(onResolve, onReject) {
        return resolve().then(onResolve, onReject);
      },
    };
    return api;
  }

  return { client: { from: (table) => builder(table) }, allCalls };
}

function hasFilter(ops, method, col, val) {
  return ops.some((op) => op[0] === method && op[1] === col && (val === undefined || op[2] === val));
}

function assertPublicVisibilityFilters(ops, { requireMerchantActive = true } = {}) {
  assert.ok(hasFilter(ops, "eq", "is_active", true), "missing is_active=true filter");
  assert.ok(hasFilter(ops, "eq", "is_published", true), "missing is_published=true filter");
  assert.ok(hasFilter(ops, "eq", "visibility_status", "public"), "missing visibility_status='public' filter");
  if (requireMerchantActive) {
    assert.ok(hasFilter(ops, "eq", "merchants.status", "active"), "missing merchants.status='active' filter");
  }
}

const fakeWhatsAppIntents = { getComplianceMultiplierMap: async () => new Map() };

function findProductsCalls(allCalls) {
  return allCalls.filter((c) => c.table === "products");
}

// ── getCategoryPage ───────────────────────────────────────────────────────

test("getCategoryPage applies the public visibility filters to its products query", async () => {
  const { client, allCalls } = createFakeMarketplaceSupabase({
    categories: () => ({
      data: [{ id: "cat-1", name: "Hair Care", slug: "hair-care", parent_id: null, is_active: true, sort_order: 1 }],
      error: null,
    }),
    products: () => ({ data: [], error: null }),
  });
  const service = new MarketplaceService({ client }, fakeWhatsAppIntents);

  await service.getCategoryPage("hair-care");

  const productsCalls = findProductsCalls(allCalls);
  assert.ok(productsCalls.length >= 1, "expected at least one products query");
  for (const call of productsCalls) {
    assertPublicVisibilityFilters(call.ops);
  }
});

// ── getProductsByIds ──────────────────────────────────────────────────────

test("getProductsByIds applies the public visibility filters", async () => {
  const { client, allCalls } = createFakeMarketplaceSupabase({ products: () => ({ data: [], error: null }) });
  const service = new MarketplaceService({ client }, fakeWhatsAppIntents);

  await service.getProductsByIds(["p1", "p2"]);

  const [productsCall] = findProductsCalls(allCalls);
  assert.ok(productsCall);
  assertPublicVisibilityFilters(productsCall.ops);
});

// ── getOffersList ─────────────────────────────────────────────────────────

test("getOffersList applies the public visibility filters", async () => {
  const { client, allCalls } = createFakeMarketplaceSupabase({ products: () => ({ data: [], error: null, count: 0 }) });
  const service = new MarketplaceService({ client }, fakeWhatsAppIntents);

  await service.getOffersList({ offset: 0, limit: 10 });

  const [productsCall] = findProductsCalls(allCalls);
  assert.ok(productsCall);
  assertPublicVisibilityFilters(productsCall.ops);
});

// ── getBrands ─────────────────────────────────────────────────────────────

test("getBrands applies the public visibility filters (web_store default context)", async () => {
  const { client, allCalls } = createFakeMarketplaceSupabase({ products: () => ({ data: [], error: null }) });
  const service = new MarketplaceService({ client }, fakeWhatsAppIntents);

  await service.getBrands();

  const [productsCall] = findProductsCalls(allCalls);
  assert.ok(productsCall);
  assertPublicVisibilityFilters(productsCall.ops);
});

// ── listProducts ──────────────────────────────────────────────────────────

test("listProducts applies the public visibility filters", async () => {
  const { client, allCalls } = createFakeMarketplaceSupabase({
    categories: () => ({ data: [], error: null }),
    products: () => ({ data: [], error: null, count: 0 }),
  });
  const service = new MarketplaceService({ client }, fakeWhatsAppIntents);

  await service.listProducts({ offset: 0, limit: 20 });

  const [productsCall] = findProductsCalls(allCalls);
  assert.ok(productsCall);
  assertPublicVisibilityFilters(productsCall.ops);
});

// ── getSuggested ──────────────────────────────────────────────────────────

test("getSuggested applies the public visibility filters", async () => {
  const { client, allCalls } = createFakeMarketplaceSupabase({ products: () => ({ data: [], error: null }) });
  const service = new MarketplaceService({ client }, fakeWhatsAppIntents);

  await service.getSuggested({ category_id: "cat-1", exclude_id: "prod-1" });

  const [productsCall] = findProductsCalls(allCalls);
  assert.ok(productsCall);
  assertPublicVisibilityFilters(productsCall.ops);
});

// ── getProductBySlug (detail) ─────────────────────────────────────────────

test("getProductBySlug applies the public visibility filters and returns a qualifying row", async () => {
  const productRow = {
    id: "prod-1",
    merchant_id: "merch-1",
    slug: "argan-oil",
    is_active: true,
    is_published: true,
    visibility_status: "public",
  };
  const { client, allCalls } = createFakeMarketplaceSupabase({ products: () => ({ data: [productRow], error: null }) });
  const service = new MarketplaceService({ client }, fakeWhatsAppIntents);

  const result = await service.getProductBySlug("argan-oil");

  const [productsCall] = findProductsCalls(allCalls);
  assert.ok(productsCall);
  assertPublicVisibilityFilters(productsCall.ops);
  assert.equal(result?.id, "prod-1");
});

// ── barber_app segmented home (_buildSegmentedHome via getHome) ─────────

test("the barber_app segmented home applies the public visibility filters to every product carousel query", async () => {
  const bestSellerRow = {
    id: "prod-bs-1",
    is_active: true,
    is_published: true,
    visibility_status: "public",
    visible_in: ["all"],
    business_type_tags: ["all"],
    target_audience: ["all"],
  };
  const { client, allCalls } = createFakeMarketplaceSupabase({
    categories: () => ({ data: [], error: null }),
    // Only the first (best-sellers) query returns a row, so the fallback query never fires and
    // we can assert on exactly the 3 primary segmented-home product queries.
    products: (record) => {
      const isBestSellerQuery = record.ops.some((op) => op[0] === "eq" && op[1] === "is_best_seller" && op[2] === true);
      return { data: isBestSellerQuery ? [bestSellerRow] : [], error: null };
    },
  });
  const service = new MarketplaceService({ client }, fakeWhatsAppIntents);

  await service.getHome({ surface: "barber_app" });

  const productsCalls = findProductsCalls(allCalls);
  assert.ok(productsCalls.length >= 3, `expected at least 3 products queries, got ${productsCalls.length}`);
  for (const call of productsCalls) {
    assertPublicVisibilityFilters(call.ops);
  }
});

// ── web_store home (_buildWebStoreHome) ──────────────────────────────────

test("the web_store home applies the public visibility filters to featured/new/offers buckets", async () => {
  const { client, allCalls } = createFakeMarketplaceSupabase({
    categories: () => ({ data: [], error: null }),
    merchants: () => ({ data: [], error: null }),
    products: () => ({ data: [], error: null }),
  });
  const service = new MarketplaceService({ client }, fakeWhatsAppIntents);

  await service.getHome({ surface: "web_store" });

  const productsCalls = findProductsCalls(allCalls);
  // featured + new + offers, plus getCategories occupancy metadata query (counts only; not a visibility gate).
  assert.equal(productsCalls.length, 4, "featured + new + offers + categories occupancy metadata");
  for (const call of productsCalls) {
    assertPublicVisibilityFilters(call.ops);
  }
});
