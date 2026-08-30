/**
 * Marketplace category hierarchy — DilMart-STOREFRONT-CATEGORY-HIERARCHY-AUDIT-FIX-001
 *
 * Covers cases 1–16 from the task matrix using a fake Supabase (no network),
 * mirroring marketplace-public-visibility.test.mjs.
 *
 * Run: npm run build && node --test tests/marketplace-category-hierarchy.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

const { MarketplaceService } = await import("../dist/modules/marketplace/marketplace.service.js");
const {
  collectActiveDescendantIds,
  enrichCategoriesWithPublicCounts,
  filterRootCategories,
  resolveCategoryScopeFromRows,
  sortCategoriesDeterministic,
} = await import("../dist/modules/marketplace/category-scope.js");

// ── Fake Supabase ─────────────────────────────────────────────────────────

function makeRecord(table) {
  return { table, ops: [], wantSingle: false, wantMaybeSingle: false };
}

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

function assertPublicVisibilityFilters(ops) {
  assert.ok(hasFilter(ops, "eq", "is_active", true), "missing is_active=true");
  assert.ok(hasFilter(ops, "eq", "is_published", true), "missing is_published=true");
  assert.ok(hasFilter(ops, "eq", "visibility_status", "public"), "missing visibility_status=public");
  assert.ok(hasFilter(ops, "eq", "merchants.status", "active"), "missing merchants.status=active");
}

function findInOp(ops, col) {
  return ops.find((op) => op[0] === "in" && op[1] === col);
}

const fakeWhatsAppIntents = { getComplianceMultiplierMap: async () => new Map() };

/** Fixture tree used across service tests. */
const ROOT_EMPTY = {
  id: "root-empty",
  name: "Empty Root",
  slug: "empty-root",
  parent_id: null,
  is_active: true,
  is_featured: false,
  sort_order: 2,
};
const ROOT_FRAG = {
  id: "root-frag",
  name: "Fragrances",
  slug: "fragrances-and-scents",
  parent_id: null,
  is_active: true,
  is_featured: true,
  sort_order: 1,
};
const CHILD_PERFUMES = {
  id: "child-perfumes",
  name: "Perfumes",
  slug: "perfumes",
  parent_id: "root-frag",
  is_active: true,
  is_featured: false,
  sort_order: 1,
};
const CHILD_EMPTY = {
  id: "child-empty",
  name: "Empty Child",
  slug: "empty-child",
  parent_id: "root-frag",
  is_active: true,
  is_featured: false,
  sort_order: 2,
};
const CHILD_MIST = {
  id: "child-mist",
  name: "Body Mist",
  slug: "body-mist",
  parent_id: "root-frag",
  is_active: true,
  is_featured: false,
  sort_order: 3,
};
const GRANDCHILD = {
  id: "grandchild-oils",
  name: "Oils",
  slug: "oils",
  parent_id: "child-perfumes",
  is_active: true,
  is_featured: false,
  sort_order: 1,
};
const INACTIVE_ROOT = {
  id: "inactive-root",
  name: "Inactive Root",
  slug: "inactive-root",
  parent_id: null,
  is_active: false,
  sort_order: 99,
};
const INACTIVE_CHILD = {
  id: "inactive-child",
  name: "Inactive Child",
  slug: "inactive-child",
  parent_id: "root-frag",
  is_active: false,
  sort_order: 50,
};

const ACTIVE_TREE = [ROOT_FRAG, ROOT_EMPTY, CHILD_PERFUMES, CHILD_EMPTY, CHILD_MIST, GRANDCHILD];

function categoriesRoute(rows) {
  return (record) => {
    const activeOnly = record.ops.some((op) => op[0] === "eq" && op[1] === "is_active" && op[2] === true);
    const data = activeOnly ? rows.filter((r) => r.is_active !== false) : rows;
    return { data, error: null };
  };
}

function makeService(categoryRows, productRoute) {
  const { client, allCalls } = createFakeMarketplaceSupabase({
    categories: categoriesRoute(categoryRows),
    products: productRoute ?? (() => ({ data: [], error: null, count: 0 })),
  });
  const service = new MarketplaceService({ client }, fakeWhatsAppIntents);
  return { service, allCalls, client };
}

// ── Pure helpers (category-scope) ─────────────────────────────────────────

test("helper: collectActiveDescendantIds walks nested depth", () => {
  const ids = collectActiveDescendantIds(ACTIVE_TREE, "root-frag");
  assert.deepEqual(ids.sort(), ["child-empty", "child-mist", "child-perfumes", "grandchild-oils"].sort());
});

test("helper: resolveCategoryScopeFromRows root aggregates descendants", () => {
  const scope = resolveCategoryScopeFromRows("fragrances-and-scents", ACTIVE_TREE);
  assert.ok(scope);
  assert.equal(scope.selectedCategory.id, "root-frag");
  assert.ok(scope.isParent);
  assert.equal(scope.parent, null);
  assert.equal(scope.children.length, 3);
  assert.ok(scope.categoryIds.includes("root-frag"));
  assert.ok(scope.categoryIds.includes("grandchild-oils"));
});

test("helper: resolveCategoryScopeFromRows leaf is isolated", () => {
  const scope = resolveCategoryScopeFromRows("empty-child", ACTIVE_TREE);
  assert.ok(scope);
  assert.deepEqual(scope.categoryIds, ["child-empty"]);
  assert.equal(scope.isParent, false);
  assert.equal(scope.parent?.id, "root-frag");
});

test("helper: inactive categories excluded from scope resolution", () => {
  const rows = [...ACTIVE_TREE, INACTIVE_ROOT, INACTIVE_CHILD];
  assert.equal(resolveCategoryScopeFromRows("inactive-root", rows), null);
  assert.equal(resolveCategoryScopeFromRows("inactive-child", rows), null);
  const frag = resolveCategoryScopeFromRows("fragrances-and-scents", rows);
  assert.ok(frag);
  assert.ok(!frag.categoryIds.includes("inactive-child"));
});

test("helper: enrichCategoriesWithPublicCounts does not drop empty rows", () => {
  const enriched = enrichCategoriesWithPublicCounts(ACTIVE_TREE, { "child-perfumes": 2 });
  assert.equal(enriched.length, ACTIVE_TREE.length);
  const empty = enriched.find((c) => c.id === "child-empty");
  assert.ok(empty);
  assert.equal(empty.direct_public_product_count, 0);
  assert.equal(empty.has_public_products, false);
  const root = enriched.find((c) => c.id === "root-frag");
  assert.equal(root.subtree_public_product_count, 2);
});

test("helper: filterRootCategories / sort deterministic", () => {
  const roots = filterRootCategories(ACTIVE_TREE);
  assert.deepEqual(
    roots.map((r) => r.slug),
    ["fragrances-and-scents", "empty-root"],
  );
  const sorted = sortCategoriesDeterministic([
    { id: "b", name: "ب", slug: "b", parent_id: null, sort_order: 2, is_featured: false },
    { id: "a", name: "ا", slug: "a", parent_id: null, sort_order: 1, is_featured: true },
  ]);
  assert.equal(sorted[0].id, "a");
});

// ── Case 1–4: getCategories occupancy never drops active rows ─────────────

test("1. Active Root with no products is returned", async () => {
  const { service } = makeService(ACTIVE_TREE, () => ({ data: [], error: null }));
  const cats = await service.getCategories();
  assert.ok(cats.some((c) => c.slug === "empty-root"));
});

test("2. Active Child with no products is returned", async () => {
  const { service } = makeService(ACTIVE_TREE, () => ({ data: [], error: null }));
  const cats = await service.getCategories();
  assert.ok(cats.some((c) => c.slug === "empty-child"));
  assert.ok(cats.some((c) => c.slug === "perfumes"));
});

test("3. Inactive Root is not returned", async () => {
  const { service } = makeService([...ACTIVE_TREE, INACTIVE_ROOT], () => ({ data: [], error: null }));
  const cats = await service.getCategories();
  assert.ok(!cats.some((c) => c.slug === "inactive-root"));
});

test("4. Inactive Child is not returned", async () => {
  const { service } = makeService([...ACTIVE_TREE, INACTIVE_CHILD], () => ({ data: [], error: null }));
  const cats = await service.getCategories();
  assert.ok(!cats.some((c) => c.slug === "inactive-child"));
});

// ── Case 5–9: listProducts category scope ─────────────────────────────────

test("5. Root list query includes public child products (categoryIds)", async () => {
  const { service, allCalls } = makeService(ACTIVE_TREE);
  service.clearCachesForTests();
  await service.listProducts({ offset: 0, limit: 20, category_slug: "fragrances-and-scents" });
  const productsCalls = allCalls.filter((c) => c.table === "products");
  const listCall = productsCalls.find((c) => findInOp(c.ops, "category_id"));
  assert.ok(listCall, "expected category_id IN filter");
  const ids = findInOp(listCall.ops, "category_id")[2];
  assert.ok(ids.includes("root-frag"));
  assert.ok(ids.includes("child-perfumes"));
  assert.ok(ids.includes("child-empty"));
  assert.ok(ids.includes("grandchild-oils"));
});

test("6. Root list query includes direct root id for legacy parent products", async () => {
  const { service, allCalls } = makeService(ACTIVE_TREE);
  service.clearCachesForTests();
  await service.listProducts({ offset: 0, limit: 20, category_slug: "fragrances-and-scents" });
  const listCall = allCalls.filter((c) => c.table === "products").find((c) => findInOp(c.ops, "category_id"));
  const ids = findInOp(listCall.ops, "category_id")[2];
  assert.ok(ids.includes("root-frag"), "root id must be in scope for legacy direct assignments");
});

test("7. Child list query excludes siblings", async () => {
  const { service, allCalls } = makeService(ACTIVE_TREE);
  service.clearCachesForTests();
  await service.listProducts({ offset: 0, limit: 20, category_slug: "perfumes" });
  const listCall = allCalls.filter((c) => c.table === "products").find((c) => findInOp(c.ops, "category_id"));
  const ids = findInOp(listCall.ops, "category_id")[2];
  assert.ok(ids.includes("child-perfumes"));
  assert.ok(ids.includes("grandchild-oils"), "descendant of selected leaf included");
  assert.ok(!ids.includes("child-mist"));
  assert.ok(!ids.includes("child-empty"));
  assert.ok(!ids.includes("root-frag"));
});

test("8. Parent aggregation handles more than one child", async () => {
  const scope = resolveCategoryScopeFromRows("fragrances-and-scents", ACTIVE_TREE);
  assert.ok(scope.children.length >= 2);
  assert.ok(scope.categoryIds.includes("child-perfumes"));
  assert.ok(scope.categoryIds.includes("child-mist"));
});

test("9. Recursive descendants are supported", async () => {
  const { service, allCalls } = makeService(ACTIVE_TREE);
  service.clearCachesForTests();
  await service.getCategoryPage("fragrances-and-scents");
  const listCall = allCalls.filter((c) => c.table === "products").find((c) => findInOp(c.ops, "category_id"));
  assert.ok(listCall);
  const ids = findInOp(listCall.ops, "category_id")[2];
  assert.ok(ids.includes("grandchild-oils"));
});

// ── Case 10–13: public safety filters still applied ───────────────────────

test("10–13. Private/inactive/unpublished/draft-merchant filters remain on category list", async () => {
  const { service, allCalls } = makeService(ACTIVE_TREE);
  service.clearCachesForTests();
  await service.listProducts({ offset: 0, limit: 20, category_slug: "fragrances-and-scents" });
  const listCall = allCalls.filter((c) => c.table === "products").find((c) => findInOp(c.ops, "category_id"));
  assert.ok(listCall);
  assertPublicVisibilityFilters(listCall.ops);
});

test("10. Private products excluded via visibility_status filter", async () => {
  const { service, allCalls } = makeService(ACTIVE_TREE);
  service.clearCachesForTests();
  await service.listProducts({ offset: 0, limit: 10, category_slug: "perfumes" });
  const listCall = allCalls.filter((c) => c.table === "products").find((c) => findInOp(c.ops, "category_id"));
  assert.ok(hasFilter(listCall.ops, "eq", "visibility_status", "public"));
});

test("11. Inactive products excluded via is_active filter", async () => {
  const { service, allCalls } = makeService(ACTIVE_TREE);
  service.clearCachesForTests();
  await service.listProducts({ offset: 0, limit: 10, category_slug: "perfumes" });
  const listCall = allCalls.filter((c) => c.table === "products").find((c) => findInOp(c.ops, "category_id"));
  assert.ok(hasFilter(listCall.ops, "eq", "is_active", true));
});

test("12. Unpublished products excluded via is_published filter", async () => {
  const { service, allCalls } = makeService(ACTIVE_TREE);
  service.clearCachesForTests();
  await service.listProducts({ offset: 0, limit: 10, category_slug: "perfumes" });
  const listCall = allCalls.filter((c) => c.table === "products").find((c) => findInOp(c.ops, "category_id"));
  assert.ok(hasFilter(listCall.ops, "eq", "is_published", true));
});

test("13. Draft merchant products excluded via merchants.status filter", async () => {
  const { service, allCalls } = makeService(ACTIVE_TREE);
  service.clearCachesForTests();
  await service.listProducts({ offset: 0, limit: 10, category_slug: "perfumes" });
  const listCall = allCalls.filter((c) => c.table === "products").find((c) => findInOp(c.ops, "category_id"));
  assert.ok(hasFilter(listCall.ops, "eq", "merchants.status", "active"));
});

// ── Case 14–16: empty slug, order, cache ──────────────────────────────────

test("14. Category slug not found returns empty result safely", async () => {
  const { service } = makeService(ACTIVE_TREE);
  service.clearCachesForTests();
  const listed = await service.listProducts({ offset: 0, limit: 20, category_slug: "does-not-exist" });
  assert.deepEqual(listed.items, []);
  assert.equal(listed.total, 0);
  const page = await service.getCategoryPage("does-not-exist");
  assert.equal(page.category, null);
  assert.deepEqual(page.subcategories, []);
  assert.deepEqual(page.products, []);
});

test("15. Category tree order is deterministic (featured → sort_order → name)", async () => {
  const { service } = makeService(ACTIVE_TREE, () => ({ data: [], error: null }));
  service.clearCachesForTests();
  const cats = await service.getCategories();
  const roots = cats.filter((c) => !c.parent_id);
  assert.equal(roots[0].slug, "fragrances-and-scents");
  const children = cats.filter((c) => c.parent_id === "root-frag");
  assert.deepEqual(
    children.map((c) => c.slug),
    ["perfumes", "empty-child", "body-mist"],
  );
});

test("16. Cache TTL is 60s and clearCachesForTests refreshes hierarchy", async () => {
  assert.equal(MarketplaceService.categoriesCacheTtlMs, 60_000);

  let generation = 0;
  const { client, allCalls } = createFakeMarketplaceSupabase({
    categories: () => {
      generation += 1;
      if (generation === 1) {
        return { data: [{ ...ROOT_FRAG, name: "Old Name" }, CHILD_PERFUMES], error: null };
      }
      return { data: [{ ...ROOT_FRAG, name: "New Name", slug: "fragrances-and-scents" }, CHILD_PERFUMES, CHILD_EMPTY], error: null };
    },
    products: () => ({ data: [], error: null, count: 0 }),
  });
  const service = new MarketplaceService({ client }, fakeWhatsAppIntents);

  const first = await service.getCategories();
  assert.equal(first.find((c) => c.id === "root-frag")?.name, "Old Name");
  assert.equal(first.some((c) => c.slug === "empty-child"), false);

  // Cached — same generation payload until cleared
  const cached = await service.getCategories();
  assert.equal(cached.find((c) => c.id === "root-frag")?.name, "Old Name");

  service.clearCachesForTests();
  const refreshed = await service.getCategories();
  assert.equal(refreshed.find((c) => c.id === "root-frag")?.name, "New Name");
  assert.ok(refreshed.some((c) => c.slug === "empty-child"), "renamed/expanded tree visible after cache clear");
  assert.ok(allCalls.filter((c) => c.table === "categories").length >= 2);
});

test("getCategoryPage keeps empty children in subcategories", async () => {
  const { service } = makeService(ACTIVE_TREE, () => ({ data: [], error: null, count: 0 }));
  service.clearCachesForTests();
  const page = await service.getCategoryPage("fragrances-and-scents");
  assert.ok(page.subcategories.some((s) => s.slug === "empty-child"));
  assert.ok(page.subcategories.some((s) => s.slug === "perfumes"));
});
