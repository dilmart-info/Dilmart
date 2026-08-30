import assert from "node:assert/strict";
import test from "node:test";
import { ProductsService } from "../dist/modules/products/products.service.js";

const TARGET_MERCHANT_ID = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
const OTHER_MERCHANT_ID = "1689ae4a-41f5-425b-bebe-c99c74880008";

function makeProduct(index, merchantId = TARGET_MERCHANT_ID, override = {}) {
  const num = String(index).padStart(4, "0");
  return {
    id: `prod-uuid-${num}`,
    merchant_id: merchantId,
    name: `منتج تجريبي ${num}`,
    slug: `test-product-${num}`,
    description: `وصف المنتج التجريبي رقم ${num}`,
    price: 150,
    stock: 20,
    is_active: index % 2 === 0,
    is_published: index % 2 === 0,
    visibility_status: index % 2 === 0 ? "public" : "private",
    created_at: new Date(1700000000000 + index * 1000).toISOString(),
    categories: { name: "العطور" },
    merchants: { display_name: "أرض الخليج" },
    ...override,
  };
}

function makeProductsService(allProducts = []) {
  const state = {
    products: structuredClone(allProducts),
  };

  class MockQuery {
    constructor(tableName) {
      this.tableName = tableName;
      this.filters = [];
      this.searchField = null;
      this.searchVal = null;
      this.rangeFrom = null;
      this.rangeTo = null;
      this.countMode = null;
      this.orderClauses = [];
    }

    select(fields, options) {
      this.selectFields = fields;
      if (options?.count) this.countMode = options.count;
      return this;
    }

    eq(field, value) {
      this.filters.push({ field, op: "eq", value });
      return this;
    }

    ilike(field, pattern) {
      this.searchField = field;
      this.searchVal = String(pattern || "").replace(/^%|%$/g, "").toLowerCase();
      return this;
    }

    order(field, options) {
      this.orderClauses.push({ field, ascending: options?.ascending ?? true });
      return this;
    }

    range(from, to) {
      this.rangeFrom = from;
      this.rangeTo = to;
      return this;
    }

    async then(resolve) {
      let filtered = [...state.products];
      for (const f of this.filters) {
        if (f.op === "eq") {
          filtered = filtered.filter((row) => row[f.field] === f.value);
        }
      }
      if (this.searchField && this.searchVal) {
        filtered = filtered.filter((row) =>
          String(row[this.searchField] ?? "").toLowerCase().includes(this.searchVal)
        );
      }

      // Sort
      for (const clause of [...this.orderClauses].reverse()) {
        filtered.sort((a, b) => {
          const valA = a[clause.field];
          const valB = b[clause.field];
          if (valA === valB) return 0;
          if (clause.ascending) return valA > valB ? 1 : -1;
          return valA < valB ? 1 : -1;
        });
      }

      const totalCount = filtered.length;
      let pagedData = filtered;
      if (this.rangeFrom !== null && this.rangeTo !== null) {
        pagedData = filtered.slice(this.rangeFrom, this.rangeTo + 1);
      }

      return resolve({
        data: pagedData,
        count: totalCount,
        error: null,
      });
    }
  }

  const mockSupabase = {
    from: (table) => new MockQuery(table),
  };

  const mockScopeResolver = {
    resolveMerchantScope: async (merchantId, actorRole) => {
      if (actorRole === "merchant_owner" || actorRole === "merchant_manager" || actorRole === "merchant_staff") {
        return TARGET_MERCHANT_ID;
      }
      return merchantId ?? null;
    },
  };

  const mockCategoriesService = {
    assertAssignableCategoryId: async () => {},
  };

  return new ProductsService(
    { client: mockSupabase },
    mockScopeResolver,
    mockCategoriesService
  );
}

test("products pagination: 1410 products catalog across pages with exact total count", async () => {
  const products = Array.from({ length: 1410 }, (_, i) => makeProduct(i + 1));
  const service = makeProductsService(products);

  // Page 1: limit 100, offset 0
  const p1 = await service.listProducts({
    merchant_id: TARGET_MERCHANT_ID,
    limit: 100,
    offset: 0,
  });
  assert.equal(p1.total, 1410, "Total must be exactly 1410");
  assert.equal(p1.items.length, 100, "Page 1 must return 100 items");
  assert.equal(p1.offset, 0);
  assert.equal(p1.limit, 100);

  // Page 2: limit 100, offset 100
  const p2 = await service.listProducts({
    merchant_id: TARGET_MERCHANT_ID,
    limit: 100,
    offset: 100,
  });
  assert.equal(p2.total, 1410, "Total must remain 1410 on page 2");
  assert.equal(p2.items.length, 100, "Page 2 must return 100 items");
  assert.equal(p2.offset, 100);

  // Check no ID overlap between Page 1 and Page 2
  const p1Ids = new Set(p1.items.map((i) => i.id));
  const overlap = p2.items.filter((i) => p1Ids.has(i.id));
  assert.equal(overlap.length, 0, "No duplicate IDs between Page 1 and Page 2");

  // Page 2 using page=2 param
  const p2Page = await service.listProducts({
    merchant_id: TARGET_MERCHANT_ID,
    limit: 100,
    page: 2,
  });
  assert.equal(p2Page.offset, 100);
  assert.deepEqual(p2Page.items.map((i) => i.id), p2.items.map((i) => i.id));

  // Last page: offset 1400, limit 100
  const pLast = await service.listProducts({
    merchant_id: TARGET_MERCHANT_ID,
    limit: 100,
    offset: 1400,
  });
  assert.equal(pLast.total, 1410);
  assert.equal(pLast.items.length, 10, "Last page should have remaining 10 items");
  assert.equal(pLast.offset, 1400);
});

test("products pagination: safe bounds enforcement for limit and offset", async () => {
  const products = Array.from({ length: 1410 }, (_, i) => makeProduct(i + 1));
  const service = makeProductsService(products);

  // Default limit is 100, default offset is 0
  const pDefault = await service.listProducts({
    merchant_id: TARGET_MERCHANT_ID,
  });
  assert.equal(pDefault.limit, 100);
  assert.equal(pDefault.offset, 0);
  assert.equal(pDefault.items.length, 100);

  // Limit > 500 clamped to 500
  const pMax = await service.listProducts({
    merchant_id: TARGET_MERCHANT_ID,
    limit: 1000,
  });
  assert.equal(pMax.limit, 500);
  assert.equal(pMax.items.length, 500);

  // Limit < 1 clamped to 1
  const pMin = await service.listProducts({
    merchant_id: TARGET_MERCHANT_ID,
    limit: 0,
  });
  assert.equal(pMin.limit, 1);
  assert.equal(pMin.items.length, 1);

  // Negative offset clamped to 0
  const pNegOffset = await service.listProducts({
    merchant_id: TARGET_MERCHANT_ID,
    offset: -50,
  });
  assert.equal(pNegOffset.offset, 0);
  assert.equal(pNegOffset.items[0].id, pDefault.items[0].id);
});

test("products pagination: search filter returns exact matching total and scoped rows", async () => {
  const products = [
    ...Array.from({ length: 50 }, (_, i) => makeProduct(i + 1, TARGET_MERCHANT_ID, { name: `عطر العود المميز ${i + 1}` })),
    ...Array.from({ length: 100 }, (_, i) => makeProduct(i + 51, TARGET_MERCHANT_ID, { name: `بخور شرقي فاخر ${i + 1}` })),
  ];
  const service = makeProductsService(products);

  const searchRes = await service.listProducts({
    merchant_id: TARGET_MERCHANT_ID,
    search: "العود",
    limit: 20,
    offset: 0,
  });

  assert.equal(searchRes.total, 50, "Search total should match exact filtered count");
  assert.equal(searchRes.items.length, 20, "Page size should be 20");
  for (const item of searchRes.items) {
    assert.ok(item.name.includes("العود"));
  }
});

test("products pagination: merchant scoping isolation", async () => {
  const targetProducts = Array.from({ length: 100 }, (_, i) => makeProduct(i + 1, TARGET_MERCHANT_ID));
  const otherProducts = Array.from({ length: 50 }, (_, i) => makeProduct(i + 101, OTHER_MERCHANT_ID));
  const service = makeProductsService([...targetProducts, ...otherProducts]);

  const targetRes = await service.listProducts({
    merchant_id: TARGET_MERCHANT_ID,
    limit: 200,
  });
  assert.equal(targetRes.total, 100);
  for (const item of targetRes.items) {
    assert.equal(item.merchant_id, TARGET_MERCHANT_ID);
  }

  // Merchant role cannot access other merchant products
  const merchantActorRes = await service.listProducts({
    merchant_id: OTHER_MERCHANT_ID,
    actor_role: "merchant_owner",
    limit: 200,
  });
  assert.equal(merchantActorRes.total, 100);
  for (const item of merchantActorRes.items) {
    assert.equal(item.merchant_id, TARGET_MERCHANT_ID);
  }
});
