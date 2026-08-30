import assert from "node:assert/strict";
import test from "node:test";
import { ProductsService } from "../dist/modules/products/products.service.js";

const MERCHANT_ID = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";

function makeService(products = []) {
  const state = { products: structuredClone(products), inserted: null };
  class Query {
    constructor() {
      this.filters = [];
      this.insertPayload = null;
    }
    select() {
      return this;
    }
    eq(field, value) {
      this.filters.push([field, value]);
      return this;
    }
    neq() {
      return this;
    }
    limit() {
      return this;
    }
    insert(payload) {
      this.insertPayload = payload;
      state.inserted = structuredClone(payload);
      return this;
    }
    async maybeSingle() {
      const data = state.products.find((product) =>
        this.filters.every(([field, value]) => product[field] === value),
      );
      return { data: data || null, error: null };
    }
    async single() {
      return { data: { id: "created-1", ...this.insertPayload }, error: null };
    }
  }
  const supabaseAdmin = { client: { from: () => new Query() } };
  const scopeResolver = {
    resolveMerchantScope: async (merchantId) => merchantId,
  };
  const categoriesService = {
    assertAssignableCategoryId: async () => undefined,
  };
  return {
    service: new ProductsService(supabaseAdmin, scopeResolver, categoriesService),
    state,
  };
}

function payload(overrides = {}) {
  return {
    name: "منتج اختبار",
    slug: "safe-product-ard-9001",
    description: "وصف كامل",
    short_description: "وصف مختصر صالح يحتوي على تفاصيل كافية وآمنة للمنتج.",
    price: 10000,
    discount_price: null,
    category_id: CATEGORY_ID,
    stock: 0,
    purchase_price: 0,
    low_stock_threshold: 5,
    is_active: false,
    is_featured: false,
    is_new: false,
    is_best_seller: false,
    images: ["https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/x.webp"],
    loyalty_points_enabled: false,
    merchant_id: MERCHANT_ID,
    merchant_sku: "ard-9001",
    ...overrides,
  };
}

test("Admin product create normalizes merchant_sku and forces private unpublished defaults", async () => {
  const { service, state } = makeService();
  const created = await service.createProduct(payload(), { actor_role: "admin", actor_id: "admin-1" });
  assert.equal(created.merchant_sku, "ARD-9001");
  assert.equal(state.inserted.merchant_sku, "ARD-9001");
  assert.equal(state.inserted.is_active, false);
  assert.equal(state.inserted.is_published, false);
  assert.equal(state.inserted.visibility_status, "private");
});

test("Admin product create rejects an existing merchant_sku instead of updating", async () => {
  const { service } = makeService([
    { id: "existing-1", merchant_id: MERCHANT_ID, merchant_sku: "ARD-9001", slug: "different" },
  ]);
  await assert.rejects(
    () => service.createProduct(payload(), { actor_role: "admin", actor_id: "admin-1" }),
    (error) => error?.response?.code === "PRODUCT_MERCHANT_SKU_EXISTS",
  );
});
