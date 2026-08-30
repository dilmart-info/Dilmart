import assert from "node:assert/strict";
import test from "node:test";
import { ProductsService } from "../dist/modules/products/products.service.js";

const MERCHANT_ID = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";

function makeService(products = [], options = {}) {
  const state = {
    products: structuredClone(products),
    updates: [],
    inserts: [],
    dbError: null,
  };

  class Query {
    constructor(tableName) {
      this.tableName = tableName;
      this.filters = [];
      this.inFilters = [];
      this.neqFilters = [];
      this.limitVal = null;
    }

    select(fields) {
      this.selectFields = fields;
      return this;
    }

    eq(field, value) {
      this.filters.push([field, value]);
      return this;
    }

    neq(field, value) {
      this.neqFilters.push([field, value]);
      return this;
    }

    in(field, values) {
      this.inFilters.push([field, values]);
      return this;
    }

    limit(val) {
      this.limitVal = val;
      return this;
    }

    update(payload) {
      state.updates.push({
        payload,
        filters: [...this.filters],
        inFilters: [...this.inFilters],
      });
      if (state.dbError) {
        return this;
      }
      // Apply updates locally to mock state
      const targetIds = this.inFilters.find(([f]) => f === "id")?.[1] || [];
      const eqId = this.filters.find(([f]) => f === "id")?.[1];
      const idsToUpdate = eqId ? [eqId] : targetIds;

      for (const prod of state.products) {
        if (idsToUpdate.includes(prod.id)) {
          Object.assign(prod, payload);
        }
      }
      return this;
    }

    insert(payload) {
      state.inserts.push(payload);
      return this;
    }

    async single() {
      if (state.dbError) throw state.dbError;
      if (this.tableName === "merchants") {
        return { data: { id: MERCHANT_ID, status: "active" }, error: null };
      }
      if (state.inserts.length > 0) {
        const payload = state.inserts[state.inserts.length - 1];
        return { data: { id: "new-id", ...payload }, error: null };
      }
      return { data: state.products[0] || null, error: null };
    }

    async maybeSingle() {
      if (state.dbError) throw state.dbError;
      if (this.tableName === "merchants") {
        return { data: { id: MERCHANT_ID, status: "active" }, error: null };
      }
      const data = state.products.find((product) => {
        const matchEq = this.filters.every(([field, value]) => product[field] === value);
        const matchIn = this.inFilters.every(([field, values]) => values.includes(product[field]));
        const matchNeq = this.neqFilters.every(([field, value]) => product[field] !== value);
        return matchEq && matchIn && matchNeq;
      });
      return { data: data || null, error: null };
    }

    async then(resolve, reject) {
      try {
        if (state.dbError) throw state.dbError;
        let data = state.products;
        if (this.filters.length > 0 || this.inFilters.length > 0 || this.neqFilters.length > 0) {
          data = state.products.filter((product) => {
            const matchEq = this.filters.every(([field, value]) => product[field] === value);
            const matchIn = this.inFilters.every(([field, values]) => values.includes(product[field]));
            const matchNeq = this.neqFilters.every(([field, value]) => product[field] !== value);
            return matchEq && matchIn && matchNeq;
          });
        }
        resolve({ data, error: null });
      } catch (err) {
        reject(err);
      }
    }
  }

  const supabaseAdmin = {
    client: {
      from: (tableName) => new Query(tableName),
    },
  };

  const scopeResolver = {
    resolveMerchantScope: async (merchantId, role, actorId) => {
      if (options.scopeError) throw options.scopeError;
      if (options.crossMerchant) return "another-merchant-id";
      return merchantId || MERCHANT_ID;
    },
  };

  const categoriesService = {
    assertAssignableCategoryId: async (catId) => {
      if (options.invalidCategory) throw new Error("Invalid Category");
      return undefined;
    },
  };

  return {
    service: new ProductsService(supabaseAdmin, scopeResolver, categoriesService),
    state,
  };
}

function makeValidProduct(overrides = {}) {
  return {
    id: "prod-1",
    merchant_id: MERCHANT_ID,
    name: "منتج تجريبي",
    slug: "demo-product",
    description: "هذا وصف للمنتج التجريبي",
    short_description: "وصف قصير صالح يحتوي على ما يكفي من التفاصيل الكافية.",
    price: 1000,
    category_id: CATEGORY_ID,
    images: ["https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/img.png"],
    stock: 10,
    is_active: false,
    is_published: false,
    visibility_status: "private",
    brand: null,
    colors: [],
    sizes: [],
    dimensions: null,
    weight_grams: null,
    discount_price: null,
    purchase_price: 0,
    low_stock_threshold: 5,
    loyalty_points_enabled: false,
    ...overrides,
  };
}

const ACTOR = { actor_role: "merchant_owner", actor_id: "owner-1" };

test("Single product activation writes all three public fields atomically and makes exactly one update call", async () => {
  const product = makeValidProduct({ is_active: false });
  const { service, state } = makeService([product]);

  const result = await service.updateProductStatus("prod-1", { is_active: true });
  assert.deepEqual(result, { ok: true });
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.is_active, true);
  assert.equal(state.updates[0].payload.is_published, true);
  assert.equal(state.updates[0].payload.visibility_status, "public");
  assert.ok(state.updates[0].payload.updated_at);
});

// Contract change (DilMart-STORE-PRODUCT-READINESS-INVARIANT-001 closure): deactivation used to
// write ONLY is_active=false, which left `is_published=true` + `visibility_status=public` behind
// on a product that is off. It now writes the whole canonical triple.
test("Single product deactivation writes the full private triple in exactly one update call", async () => {
  const product = makeValidProduct({ is_active: true, is_published: true, visibility_status: "public" });
  const { service, state } = makeService([product]);

  const result = await service.updateProductStatus("prod-1", { is_active: false });
  assert.deepEqual(result, { ok: true });
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.is_active, false);
  assert.equal(state.updates[0].payload.is_published, false);
  assert.equal(state.updates[0].payload.visibility_status, "private");
  assert.ok(state.updates[0].payload.updated_at);
});

test("Deactivating an ARCHIVED product keeps it archived instead of restoring it to private", async () => {
  const product = makeValidProduct({ is_active: false, is_published: false, visibility_status: "archived" });
  const { service, state } = makeService([product]);

  await service.updateProductStatus("prod-1", { is_active: false });
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.is_active, false);
  assert.equal(state.updates[0].payload.is_published, false);
  assert.equal(state.updates[0].payload.visibility_status, "archived");
});

test("Archive sets inactive, unpublished, and archived, and wins over contradictory is_active=true input", async () => {
  const product = makeValidProduct({ is_active: true, is_published: true, visibility_status: "public" });
  const { service, state } = makeService([product]);

  const result = await service.updateProduct("prod-1", {
    ...product,
    is_active: true,
    visibility_status: "archived",
  }, { merchant_id: MERCHANT_ID });

  assert.deepEqual(result, { ok: true });
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.is_active, false);
  assert.equal(state.updates[0].payload.is_published, false);
  assert.equal(state.updates[0].payload.visibility_status, "archived");
  assert.ok(state.updates[0].payload.updated_at);
});

test("Bulk activate writes all three public fields atomically and makes exactly one update call", async () => {
  const p1 = makeValidProduct({ id: "prod-1", slug: "slug-1" });
  const p2 = makeValidProduct({ id: "prod-2", slug: "slug-2" });
  const { service, state } = makeService([p1, p2]);

  const result = await service.performBulkAction({
    product_ids: ["prod-1", "prod-2"],
    action: "activate",
  }, ACTOR);
  assert.equal(result.affected, 2);
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.is_active, true);
  assert.equal(state.updates[0].payload.is_published, true);
  assert.equal(state.updates[0].payload.visibility_status, "public");
});

test("Bulk deactivate sets is_active=false", async () => {
  const p1 = makeValidProduct({ id: "prod-1", slug: "slug-1", is_active: true });
  const p2 = makeValidProduct({ id: "prod-2", slug: "slug-2", is_active: true });
  const { service, state } = makeService([p1, p2]);

  const result = await service.performBulkAction({
    product_ids: ["prod-1", "prod-2"],
    action: "deactivate",
  }, ACTOR);
  assert.equal(result.affected, 2);
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.is_active, false);
});

test("Activation succeeds when the only failed readiness item is is_active", async () => {
  const product = makeValidProduct({ is_active: false });
  const { service, state } = makeService([product]);

  const result = await service.updateProductStatus("prod-1", { is_active: true });
  assert.deepEqual(result, { ok: true });
  assert.equal(state.updates.length, 1);
});

test("Activation fails when another readiness requirement is missing (e.g. empty images)", async () => {
  const product = makeValidProduct({ is_active: false, images: [] });
  const { service, state } = makeService([product]);

  await assert.rejects(
    () => service.updateProductStatus("prod-1", { is_active: true }),
    (error) => error?.response?.code === "PRODUCT_NOT_READY",
  );
  assert.equal(state.updates.length, 0);
});

test("Failed bulk readiness validation performs no update if one product lacks a requirement", async () => {
  const p1 = makeValidProduct({ id: "prod-1", slug: "slug-1" });
  const p2 = makeValidProduct({ id: "prod-2", slug: "slug-2", images: [] });
  const { service, state } = makeService([p1, p2]);

  await assert.rejects(
    () => service.performBulkAction({ product_ids: ["prod-1", "prod-2"], action: "activate" }, ACTOR),
    (error) => error?.response?.code === "PRODUCT_NOT_READY" && error?.response?.product_id === "prod-2",
  );
  assert.equal(state.updates.length, 0);
});

test("Merchant scope prevents cross-merchant updates in bulk actions", async () => {
  const p1 = makeValidProduct({ id: "prod-1", merchant_id: "other-merchant" });
  const { service, state } = makeService([p1]);

  await assert.rejects(
    () => service.performBulkAction({ product_ids: ["prod-1"], action: "activate" }, ACTOR),
    (error) => error.status === 403 || error.message.includes("scope"),
  );
  assert.equal(state.updates.length, 0);
});

test("Database errors propagate", async () => {
  const product = makeValidProduct({ is_active: false });
  const { service, state } = makeService([product]);
  state.dbError = new Error("Database Connection Lost");

  await assert.rejects(
    () => service.updateProductStatus("prod-1", { is_active: true }),
    (error) => error.message === "Database Connection Lost",
  );
});

test("Ordinary edit preserves active-private state", async () => {
  const existing = makeValidProduct({
    id: "prod-1",
    is_active: true,
    is_published: false,
    visibility_status: "private",
  });
  const { service, state } = makeService([existing]);

  const result = await service.updateProduct("prod-1", {
    is_active: true,
    name: "اسم جديد للمنتج",
    price: existing.price,
  }, { merchant_id: MERCHANT_ID });

  assert.deepEqual(result, { ok: true });
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.name, "اسم جديد للمنتج");
  assert.equal(state.updates[0].payload.is_published, undefined);
  assert.equal(state.updates[0].payload.visibility_status, undefined);
});

test("Ordinary edit preserves active-unpublished-public state", async () => {
  const existing = makeValidProduct({
    id: "prod-1",
    is_active: true,
    is_published: false,
    visibility_status: "public",
  });
  const { service, state } = makeService([existing]);

  const result = await service.updateProduct("prod-1", {
    is_active: true,
    price: 1500,
  }, { merchant_id: MERCHANT_ID });

  assert.deepEqual(result, { ok: true });
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.price, 1500);
  assert.equal(state.updates[0].payload.is_published, undefined);
});

test("Ordinary edit of active product does not run activation readiness even if deficient", async () => {
  const existing = makeValidProduct({
    id: "prod-1",
    is_active: true,
    is_published: false,
    visibility_status: "private",
    images: [],
  });
  const { service, state } = makeService([existing]);

  const result = await service.updateProduct("prod-1", {
    ...existing,
    stock: 20,
  }, { merchant_id: MERCHANT_ID });

  assert.deepEqual(result, { ok: true });
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.stock, 20);
});

test("Inactive-to-active transition publishes when the payload does not pin the exposure axes", async () => {
  const existing = makeValidProduct({
    id: "prod-1",
    is_active: false,
    is_published: false,
    visibility_status: "private",
  });
  const { service, state } = makeService([existing]);

  const result = await service.updateProduct("prod-1", {
    // Only `is_active` is sent — this is what the admin Product form actually submits.
    name: existing.name,
    slug: existing.slug,
    price: existing.price,
    is_active: true,
  }, { merchant_id: MERCHANT_ID });

  assert.deepEqual(result, { ok: true });
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.is_active, true);
  assert.equal(state.updates[0].payload.is_published, true);
  assert.equal(state.updates[0].payload.visibility_status, "public");
});

// Contract refinement (closure pass): an activation payload that ALSO pins `is_published` /
// `visibility_status` is honored instead of being overridden to published+public — activation
// may never expose a product more than the caller asked for. Readiness is still gated, because
// activating is itself an exposure increase.
test("Inactive-to-active transition honors an explicitly requested private/unpublished state", async () => {
  const existing = makeValidProduct({
    id: "prod-1",
    is_active: false,
    is_published: false,
    visibility_status: "private",
  });
  const { service, state } = makeService([existing]);

  await service.updateProduct("prod-1", { ...existing, is_active: true }, { merchant_id: MERCHANT_ID });

  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.is_active, true);
  assert.equal(state.updates[0].payload.is_published, undefined, "already false; nothing to write");
  assert.equal(state.updates[0].payload.visibility_status, undefined, "already private; nothing to write");
});

test("Inactive-to-active transition with an explicit private state still runs the readiness gate", async () => {
  const existing = makeValidProduct({
    id: "prod-1",
    is_active: false,
    is_published: false,
    visibility_status: "private",
    images: [],
  });
  const { service, state } = makeService([existing]);

  await assert.rejects(
    () => service.updateProduct("prod-1", { ...existing, is_active: true }, { merchant_id: MERCHANT_ID }),
    (error) => error?.response?.code === "PRODUCT_NOT_READY",
  );
  assert.equal(state.updates.length, 0);
});

test("Inactive-to-active transition validates readiness and rejects deficient product", async () => {
  const existing = makeValidProduct({
    id: "prod-1",
    is_active: false,
    is_published: false,
    visibility_status: "private",
    images: [],
  });
  const { service, state } = makeService([existing]);

  await assert.rejects(
    () => service.updateProduct("prod-1", { ...existing, is_active: true }, { merchant_id: MERCHANT_ID }),
    (error) => error?.response?.code === "PRODUCT_NOT_READY",
  );
  assert.equal(state.updates.length, 0);
});

test("updateProductStatus activation validates readiness before writing", async () => {
  const product = makeValidProduct({ is_active: false, name: "" });
  const { service, state } = makeService([product]);

  await assert.rejects(
    () => service.updateProductStatus("prod-1", { is_active: true }),
    (error) => error?.response?.code === "PRODUCT_NOT_READY",
  );
  assert.equal(state.updates.length, 0);
});

test("Inactive createProduct sets private and unpublished states", async () => {
  const { service, state } = makeService();
  const payload = makeValidProduct({ is_active: false });
  await service.createProduct(payload, { actor_role: "admin" });

  assert.equal(state.inserts.length, 1);
  assert.equal(state.inserts[0].is_active, false);
  assert.equal(state.inserts[0].is_published, false);
  assert.equal(state.inserts[0].visibility_status, "private");
});

test("Active createProduct sets public and published states", async () => {
  const { service, state } = makeService();
  const payload = makeValidProduct({ is_active: true });
  await service.createProduct(payload, { actor_role: "admin" });

  assert.equal(state.inserts.length, 1);
  assert.equal(state.inserts[0].is_active, true);
  assert.equal(state.inserts[0].is_published, true);
  assert.equal(state.inserts[0].visibility_status, "public");
});

test("createProduct archive wins over contradictory is_active=true", async () => {
  const { service, state } = makeService();
  const payload = makeValidProduct({ is_active: true, visibility_status: "archived" });
  await service.createProduct(payload, { actor_role: "admin" });

  assert.equal(state.inserts.length, 1);
  assert.equal(state.inserts[0].is_active, false);
  assert.equal(state.inserts[0].is_published, false);
  assert.equal(state.inserts[0].visibility_status, "archived");
});

// ── Quick Add readiness invariant (DilMart-STORE-PRODUCT-READINESS-INVARIANT-001) ──
//
// Contract change: Quick Add used to publish whatever it was given
// (`is_active ?? true` → is_published/public) even without an image or description, which was a
// bypass of the readiness rules every other activation path enforces. It now shares the single
// authoritative readiness definition. The is_active=false half of the old expectation is
// unchanged and still asserted below.

test("QuickAddProduct with an explicit is_active=true and a READY payload activates and publishes", async () => {
  const { service, state } = makeService();

  await service.quickAddProduct({
    name: "سريع نشط",
    category_id: CATEGORY_ID,
    price: 100,
    stock: 5,
    image_url: "https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/img.png",
    description: "وصف كافٍ للمنتج السريع",
    is_active: true,
  }, ACTOR);
  assert.equal(state.inserts.length, 1);
  assert.equal(state.inserts[0].is_active, true);
  assert.equal(state.inserts[0].is_published, true);
  assert.equal(state.inserts[0].visibility_status, "public");
});

test("QuickAddProduct with is_active=false always creates a draft", async () => {
  const { service, state } = makeService();

  await service.quickAddProduct({
    name: "سريع معطل",
    category_id: CATEGORY_ID,
    price: 100,
    is_active: false,
  }, ACTOR);
  assert.equal(state.inserts.length, 1);
  assert.equal(state.inserts[0].is_active, false);
  assert.equal(state.inserts[0].is_published, false);
  assert.equal(state.inserts[0].visibility_status, "private");
});

test("REGRESSION: minimal QuickAddProduct (name/category/price/stock only) cannot become active/public/published", async () => {
  const { service, state } = makeService();

  const created = await service.quickAddProduct({
    name: "سريع ناقص",
    category_id: CATEGORY_ID,
    price: 100,
    stock: 3,
  }, ACTOR);

  assert.equal(state.inserts.length, 1);
  assert.equal(state.inserts[0].is_active, false, "no image/description → must not be active");
  assert.equal(state.inserts[0].is_published, false);
  assert.equal(state.inserts[0].visibility_status, "private");
  // The product is still created — Quick Add stays useful, it just lands as a draft.
  assert.equal(created.is_active, false);
});

test("REGRESSION: QuickAddProduct explicitly asking to activate an incomplete product is refused with PRODUCT_NOT_READY", async () => {
  const { service, state } = makeService();

  await assert.rejects(
    () => service.quickAddProduct({
      name: "سريع ناقص مفعّل",
      category_id: CATEGORY_ID,
      price: 100,
      stock: 3,
      is_active: true,
    }, ACTOR),
    (error) => {
      assert.equal(error?.response?.code, "PRODUCT_NOT_READY");
      const keys = (error?.response?.missing_checks ?? []).map((c) => c.key);
      assert.ok(keys.includes("image_present"));
      assert.ok(keys.includes("description_present"));
      return true;
    },
  );
  assert.equal(state.inserts.length, 0, "nothing is written when activation is refused");
});

test("QuickAddProduct without is_active activates only when the payload is fully ready", async () => {
  const { service, state } = makeService();

  await service.quickAddProduct({
    name: "سريع مكتمل",
    category_id: CATEGORY_ID,
    price: 100,
    stock: 2,
    image_url: "https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/img.png",
    description: "وصف كافٍ للمنتج السريع المكتمل",
  }, ACTOR);

  assert.equal(state.inserts.length, 1);
  assert.equal(state.inserts[0].is_active, true);
  assert.equal(state.inserts[0].is_published, true);
  assert.equal(state.inserts[0].visibility_status, "public");
});

// ── Duplicate / ordinary-edit invariant coverage ──────────────────────────────

test("REGRESSION: duplicating a published product leaves the copy inactive, unpublished and private", async () => {
  const source = makeValidProduct({
    id: "prod-1",
    is_active: true,
    is_published: true,
    visibility_status: "public",
  });
  const { service, state } = makeService([source]);

  await service.duplicateProduct("prod-1", ACTOR);

  assert.equal(state.inserts.length, 1);
  assert.equal(state.inserts[0].is_active, false);
  assert.equal(state.inserts[0].is_published, false, "copy must not inherit is_published=true");
  assert.equal(state.inserts[0].visibility_status, "private");
});

test("REGRESSION: an ordinary edit cannot strip a readiness requirement off a live product", async () => {
  const existing = makeValidProduct({
    id: "prod-1",
    is_active: true,
    is_published: true,
    visibility_status: "public",
  });
  const { service, state } = makeService([existing]);

  await assert.rejects(
    () => service.updateProduct("prod-1", { ...existing, images: [] }, { merchant_id: MERCHANT_ID }),
    (error) => {
      assert.equal(error?.response?.code, "PRODUCT_NOT_READY");
      assert.deepEqual(error?.response?.missing_checks.map((c) => c.key), ["image_present"]);
      return true;
    },
  );
  assert.equal(state.updates.length, 0);
});

test("An ordinary edit that fixes a deficiency on a live product is allowed", async () => {
  const existing = makeValidProduct({
    id: "prod-1",
    is_active: true,
    is_published: true,
    visibility_status: "public",
    description: "",
  });
  const { service, state } = makeService([existing]);

  const result = await service.updateProduct(
    "prod-1",
    { ...existing, description: "وصف تم إصلاحه" },
    { merchant_id: MERCHANT_ID },
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.description, "وصف تم إصلاحه");
});
