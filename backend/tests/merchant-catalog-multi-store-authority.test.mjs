import assert from "node:assert/strict";
import test from "node:test";
import { ProductsService } from "../dist/modules/products/products.service.js";
import { ProductImportService } from "../dist/modules/products/product-import.service.js";
import { CategoriesService } from "../dist/modules/categories/categories.service.js";
import { BadRequestException, ForbiddenException } from "@nestjs/common";

const STORE_A = "11111111-1111-4111-8111-111111111111";
const STORE_B = "22222222-2222-4222-8222-222222222222";
const STORE_UNAUTHORIZED = "33333333-3333-4333-8333-333333333333";
const STORE_INACTIVE = "55555555-5555-4555-8555-555555555555";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";
const IMAGE_URL = "https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/img.png";

function makeHarness() {
  const state = {
    products: [
      {
        id: "prod-a-1",
        merchant_id: STORE_A,
        name: "منتج متجر أ",
        slug: "prod-a-1",
        price: 5000,
        category_id: CATEGORY_ID,
        images: [IMAGE_URL],
        stock: 10,
        is_active: true,
        is_published: true,
        visibility_status: "public",
        short_description: "وصف قصير صالح يحتوي على ما يكفي من التفاصيل الكافية.",
        description: "وصف كامل ومفصل لمنتج متجر أ",
      },
      {
        id: "prod-b-1",
        merchant_id: STORE_B,
        name: "منتج متجر ب",
        slug: "prod-b-1",
        price: 7000,
        category_id: CATEGORY_ID,
        images: [IMAGE_URL],
        stock: 5,
        is_active: true,
        is_published: true,
        visibility_status: "public",
        short_description: "وصف قصير صالح يحتوي على ما يكفي من التفاصيل الكافية.",
        description: "وصف كامل ومفصل لمنتج متجر ب",
      },
      {
        id: "prod-inactive-1",
        merchant_id: STORE_INACTIVE,
        name: "منتج متجر غير نشط",
        slug: "prod-inactive-1",
        price: 9000,
        category_id: CATEGORY_ID,
        images: [IMAGE_URL],
        stock: 5,
        is_active: true,
        is_published: true,
        visibility_status: "public",
        short_description: "وصف قصير صالح يحتوي على ما يكفي من التفاصيل الكافية.",
        description: "وصف كامل ومفصل لمنتج متجر غير نشط",
      },
    ],
    merchants: [
      { id: STORE_A, status: "active" },
      { id: STORE_B, status: "active" },
      { id: STORE_UNAUTHORIZED, status: "active" },
      { id: STORE_INACTIVE, status: "pending" },
    ],
    categories: [
      { id: CATEGORY_ID, name: "العطور", slug: "perfumes", is_active: true, is_leaf: true, parent_id: null },
    ],
    sessions: [],
    scopeResolutionCalls: [],
  };

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.inFilters = [];
      this.neqFilters = [];
      this.insertPayload = null;
      this.updatePayload = null;
    }
    select() {
      return this;
    }
    limit() {
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
    insert(payload) {
      this.insertPayload = payload;
      const genId = this.table === "products" ? `prod-${Date.now()}-${Math.random()}` : `session-${Date.now()}-${Math.random()}`;
      const row = { ...payload, id: payload.id || genId };
      if (this.table === "products") {
        state.products.push(row);
        this.lastInserted = row;
      } else if (this.table === "product_import_sessions") {
        state.sessions.push(row);
        this.lastInserted = row;
      }
      return this;
    }
    update(payload) {
      this.updatePayload = payload;
      return this;
    }
    #match() {
      let list = [];
      if (this.table === "products") list = state.products;
      if (this.table === "merchants") list = state.merchants;
      if (this.table === "categories") list = state.categories;
      if (this.table === "product_import_sessions") list = state.sessions;
      return list.filter((row) => {
        const eqMatch = this.filters.every(([f, v]) => row[f] === v);
        const inMatch = this.inFilters.every(([f, vals]) => vals.includes(row[f]));
        const neqMatch = this.neqFilters.every(([f, v]) => row[f] !== v);
        return eqMatch && inMatch && neqMatch;
      });
    }
    async single() {
      if (this.insertPayload) {
        return { data: { ...this.insertPayload, id: this.lastInserted?.id || "new-prod-id" }, error: null };
      }
      const matched = this.#match();
      return { data: matched[0] ?? null, error: matched.length === 0 ? { message: "Not found" } : null };
    }
    async maybeSingle() {
      const matched = this.#match();
      return { data: matched[0] ?? null, error: null };
    }
    then(resolve) {
      if (this.updatePayload) {
        const matched = this.#match();
        matched.forEach((r) => Object.assign(r, this.updatePayload));
        return resolve({ data: matched, error: null });
      }
      return resolve({ data: this.#match(), error: null });
    }
  }

  const supabaseAdmin = {
    client: {
      from: (table) => new Query(table),
      rpc: async (_fn, args) => {
        return {
          data: {
            total: 1,
            created: 1,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
          },
          error: null,
        };
      },
    },
  };

  const scopeResolver = {
    async resolveMerchantScope(requestedMerchantId, actorRole, actorId) {
      state.scopeResolutionCalls.push({ requestedMerchantId, actorRole, actorId });
      // Actor belongs to STORE_A, STORE_B, and STORE_INACTIVE
      const actorMemberships = [STORE_A, STORE_B, STORE_INACTIVE];
      if (!requestedMerchantId) return null;
      if (actorMemberships.includes(requestedMerchantId)) {
        return requestedMerchantId;
      }
      return null;
    },
  };

  const categoriesService = new CategoriesService(supabaseAdmin);
  categoriesService.assertAssignableCategoryId = async () => undefined;
  const auditService = { log: async () => undefined };

  const productsService = new ProductsService(supabaseAdmin, scopeResolver, categoriesService);
  const productImportService = new ProductImportService(supabaseAdmin, scopeResolver, auditService, categoriesService);

  return { productsService, productImportService, state };
}

const MULTI_STORE_ACTOR = { actor_role: "merchant_owner", actor_id: "multi-store-user-1" };

// ── Multi-Store Target Routing ────────────────────────────────────────────────

test("Quick Add targets Store B when requestedMerchantId is Store B", async () => {
  const { productsService, state } = makeHarness();

  const created = await productsService.quickAddProduct(
    {
      merchant_id: STORE_B,
      name: "منتج جديد في متجر ب",
      category_id: CATEGORY_ID,
      price: 12000,
      stock: 3,
      image_url: IMAGE_URL,
      description: "وصف كافي للمنتج الجديد في متجر ب",
      is_active: true,
    },
    MULTI_STORE_ACTOR,
  );

  assert.ok(created?.id);
  const inDb = state.products.find((p) => p.id === created.id);
  assert.equal(inDb?.merchant_id, STORE_B, "Product must be created under Store B");
  assert.equal(
    state.scopeResolutionCalls.some((c) => c.requestedMerchantId === STORE_B),
    true,
    "ScopeResolver must have been called with STORE_B",
  );
});

test("Bulk Action targets Store B and ignores products from Store A", async () => {
  const { productsService, state } = makeHarness();

  // Attempt bulk action targeting Store B on Store B's product
  const result = await productsService.performBulkAction(
    {
      merchant_id: STORE_B,
      product_ids: ["prod-b-1"],
      action: "deactivate",
    },
    MULTI_STORE_ACTOR,
  );

  assert.equal(result.ok, true);
  const prodB = state.products.find((p) => p.id === "prod-b-1");
  assert.equal(prodB?.is_active, false, "Store B product must be deactivated");

  // Attempt bulk action targeting Store B on Store A's product -> must fail or be rejected
  await assert.rejects(
    () =>
      productsService.performBulkAction(
        {
          merchant_id: STORE_B,
          product_ids: ["prod-a-1"],
          action: "deactivate",
        },
        MULTI_STORE_ACTOR,
      ),
    (err) => err instanceof ForbiddenException || /forbidden/i.test(err.message),
  );
});

test("Duplicate product duplicates inside Store B and rejects cross-store duplication", async () => {
  const { productsService, state } = makeHarness();

  // Duplicating Store B's product under Store B
  const copy = await productsService.duplicateProduct("prod-b-1", STORE_B, MULTI_STORE_ACTOR);
  assert.ok(copy?.id);
  const copyInDb = state.products.find((p) => p.id === copy.id);
  assert.equal(copyInDb?.merchant_id, STORE_B, "Duplicate must belong to Store B");

  // Attempting to duplicate Store A's product under Store B scope -> must fail
  await assert.rejects(
    () => productsService.duplicateProduct("prod-a-1", STORE_B, MULTI_STORE_ACTOR),
    (err) => err instanceof ForbiddenException || /Product not found in merchant scope/i.test(err.message),
  );
});

// ── Non-Member & Unauthorized Rejections ──────────────────────────────────────

test("Mutations targeting an unauthorized store fail with HTTP 403", async () => {
  const { productsService } = makeHarness();

  await assert.rejects(
    () =>
      productsService.quickAddProduct(
        {
          merchant_id: STORE_UNAUTHORIZED,
          name: "منتج في متجر غير مصرح",
          category_id: CATEGORY_ID,
          price: 5000,
        },
        MULTI_STORE_ACTOR,
      ),
    (err) => err instanceof ForbiddenException,
  );

  await assert.rejects(
    () =>
      productsService.performBulkAction(
        {
          merchant_id: STORE_UNAUTHORIZED,
          product_ids: ["prod-b-1"],
          action: "deactivate",
        },
        MULTI_STORE_ACTOR,
      ),
    (err) => err instanceof ForbiddenException,
  );

  await assert.rejects(
    () => productsService.duplicateProduct("prod-b-1", STORE_UNAUTHORIZED, MULTI_STORE_ACTOR),
    (err) => err instanceof ForbiddenException,
  );
});

// ── Missing merchant_id Rejections (HTTP 400) ──────────────────────────────────

test("Mutations missing merchant_id fail with HTTP 400 BadRequestException", async () => {
  const { productsService, productImportService } = makeHarness();

  // Quick Add missing merchant_id
  await assert.rejects(
    () =>
      productsService.quickAddProduct(
        {
          merchant_id: undefined,
          name: "منتج بدون متجر",
          category_id: CATEGORY_ID,
          price: 5000,
        },
        MULTI_STORE_ACTOR,
      ),
    (err) => err instanceof BadRequestException && /merchant_id is required/i.test(err.message),
  );

  // Bulk Action missing merchant_id
  await assert.rejects(
    () =>
      productsService.performBulkAction(
        {
          merchant_id: undefined,
          product_ids: ["prod-b-1"],
          action: "deactivate",
        },
        MULTI_STORE_ACTOR,
      ),
    (err) => err instanceof BadRequestException && /merchant_id is required/i.test(err.message),
  );

  // Duplicate missing merchant_id
  await assert.rejects(
    () => productsService.duplicateProduct("prod-b-1", undefined, MULTI_STORE_ACTOR),
    (err) => err instanceof BadRequestException && /merchant_id is required/i.test(err.message),
  );

  // Import preview missing merchant_id
  const csvBuffer = Buffer.from("name,short_description,price,category,sku\n");
  await assert.rejects(
    () => productImportService.previewForMerchant(csvBuffer, "test.csv", undefined, MULTI_STORE_ACTOR),
    (err) => err instanceof BadRequestException && /merchant_id is required/i.test(err.message),
  );

  // Import confirm missing merchant_id
  await assert.rejects(
    () => productImportService.confirmForMerchant("session-1", undefined, MULTI_STORE_ACTOR),
    (err) => err instanceof BadRequestException && /merchant_id is required/i.test(err.message),
  );

  // Product status update missing merchant_id for merchant actor
  await assert.rejects(
    () => productsService.updateProductStatus("prod-b-1", { is_active: false, merchant_id: undefined, ...MULTI_STORE_ACTOR }),
    (err) => err instanceof BadRequestException && /merchant_id is required/i.test(err.message),
  );
});

// ── Inactive Store Rejections (HTTP 403) ───────────────────────────────────────

test("Mutations targeting an inactive/pending store fail with HTTP 403 ForbiddenException", async () => {
  const { productsService, productImportService } = makeHarness();

  await assert.rejects(
    () =>
      productsService.quickAddProduct(
        {
          merchant_id: STORE_INACTIVE,
          name: "منتج في متجر معلق",
          category_id: CATEGORY_ID,
          price: 5000,
        },
        MULTI_STORE_ACTOR,
      ),
    (err) => err instanceof ForbiddenException && /not active/i.test(err.message),
  );

  await assert.rejects(
    () =>
      productsService.performBulkAction(
        {
          merchant_id: STORE_INACTIVE,
          product_ids: ["prod-inactive-1"],
          action: "deactivate",
        },
        MULTI_STORE_ACTOR,
      ),
    (err) => err instanceof ForbiddenException && /not active/i.test(err.message),
  );

  await assert.rejects(
    () => productsService.duplicateProduct("prod-inactive-1", STORE_INACTIVE, MULTI_STORE_ACTOR),
    (err) => err instanceof ForbiddenException && /not active/i.test(err.message),
  );

  const csvBuffer = Buffer.from("name,short_description,price,category,sku\n");
  await assert.rejects(
    () => productImportService.previewForMerchant(csvBuffer, "test.csv", STORE_INACTIVE, MULTI_STORE_ACTOR),
    (err) => err instanceof ForbiddenException && /not active/i.test(err.message),
  );

  await assert.rejects(
    () => productsService.updateProductStatus("prod-inactive-1", { is_active: false, merchant_id: STORE_INACTIVE, ...MULTI_STORE_ACTOR }),
    (err) => err instanceof ForbiddenException && /not active/i.test(err.message),
  );
});

// ── Status Update Authority ───────────────────────────────────────────────────

test("Status update succeeds with authorized merchant_id and rejects mismatched merchant_id", async () => {
  const { productsService, state } = makeHarness();

  // Status update with matching store B
  const res = await productsService.updateProductStatus("prod-b-1", {
    is_active: false,
    merchant_id: STORE_B,
    ...MULTI_STORE_ACTOR,
  });
  assert.equal(res.ok, true);
  const prodB = state.products.find((p) => p.id === "prod-b-1");
  assert.equal(prodB.is_active, false);

  // Status update with unauthorized store
  await assert.rejects(
    () =>
      productsService.updateProductStatus("prod-b-1", {
        is_active: false,
        merchant_id: STORE_UNAUTHORIZED,
        ...MULTI_STORE_ACTOR,
      }),
    (err) => err instanceof ForbiddenException,
  );
});

// ── CSV Import Multi-Store Authority & Cross-Store Protection ──────────────────

test("CSV Import preview and confirmation bind strictly to the requested merchant", async () => {
  const { productImportService, state } = makeHarness();

  const csvBuffer = Buffer.from(
    "name,short_description,description,category,price,stock,sku,is_active\n" +
      "عطر مميز,وصف قصير صالح يحتوي على ما يكفي من التفاصيل الكافية.,وصف كامل ومفصل لهذا المنتج,العطور,10000,5,SKU-B-1,false\n",
  );

  // Preview for Store B
  const preview = await productImportService.previewForMerchant(
    csvBuffer,
    "products.csv",
    STORE_B,
    MULTI_STORE_ACTOR,
  );

  assert.ok(preview?.import_id);
  const session = state.sessions.find((s) => s.id === preview.import_id);
  assert.equal(session?.merchant_id, STORE_B, "Import session must be recorded under Store B");
  assert.equal(preview.summary.valid_rows, 1, "CSV row should be valid");

  // Confirming with matching Store B succeeds
  const confirmResult = await productImportService.confirmForMerchant(
    preview.import_id,
    STORE_B,
    MULTI_STORE_ACTOR,
  );
  assert.ok(confirmResult.created >= 1);

  // Confirming Store B session with Store A must fail
  const preview2 = await productImportService.previewForMerchant(
    csvBuffer,
    "products2.csv",
    STORE_B,
    MULTI_STORE_ACTOR,
  );

  await assert.rejects(
    () => productImportService.confirmForMerchant(preview2.import_id, STORE_A, MULTI_STORE_ACTOR),
    (err) => err instanceof ForbiddenException || /Merchant mismatch|not found in merchant scope/i.test(err.message),
  );
});

