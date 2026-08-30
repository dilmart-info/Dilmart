/**
 * Product readiness invariant — DilMart-STORE-PRODUCT-READINESS-INVARIANT-001.
 *
 * Two layers:
 *  1. the pure, shared readiness module (`product-readiness.ts`) — the single definition every
 *     activation path must use;
 *  2. a shared readiness MATRIX replayed against every production activation path, proving none
 *     of them can leave a product active/published/public below that definition.
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
  PRODUCT_NOT_READY_CODE,
  buildProductReadiness,
  findNewlyBrokenActivationChecks,
  getBlockingActivationChecks,
  isReadyForActivation,
  resolveProductPublicationState,
  toMissingChecks,
} = await import("../dist/modules/products/product-readiness.js");
const { ProductsService } = await import("../dist/modules/products/products.service.js");

const MERCHANT_ID = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE = "https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/img.png";
const ACTOR = { actor_role: "merchant_owner", actor_id: "owner-1" };

function readyProduct(overrides = {}) {
  return {
    id: "prod-1",
    merchant_id: MERCHANT_ID,
    name: "منتج جاهز",
    slug: "ready-product",
    description: "وصف تفصيلي للمنتج الجاهز",
    short_description: "وصف قصير صالح يحتوي على ما يكفي من التفاصيل الكافية.",
    price: 1000,
    discount_price: null,
    category_id: CATEGORY_ID,
    images: [IMAGE],
    stock: 5,
    purchase_price: 0,
    low_stock_threshold: 5,
    is_active: false,
    is_published: false,
    visibility_status: "private",
    is_featured: false,
    is_new: false,
    is_best_seller: false,
    colors: [],
    sizes: [],
    brand: null,
    dimensions: null,
    weight_grams: null,
    loyalty_points_enabled: false,
    ...overrides,
  };
}

// ── 1. Pure module ────────────────────────────────────────────────────────────

test("readiness checklist exposes the full, stable set of checks", () => {
  const readiness = buildProductReadiness(readyProduct({ is_active: true }));
  assert.deepEqual(
    readiness.checklist.map((c) => c.key),
    [
      "name_completed",
      "slug_completed",
      "price_valid",
      "category_linked",
      "image_present",
      "stock_valid",
      "discount_valid",
      "description_present",
      "is_active",
    ],
  );
  assert.equal(readiness.total_checks, 9);
  assert.equal(readiness.passed_checks, 9);
  assert.equal(readiness.score, 100);
  assert.equal(readiness.is_ready, true);
});

test("is_active is a state marker, never an activation blocker", () => {
  const inactiveButComplete = readyProduct({ is_active: false });
  assert.equal(buildProductReadiness(inactiveButComplete).is_ready, false);
  assert.deepEqual(getBlockingActivationChecks(inactiveButComplete), []);
  assert.equal(isReadyForActivation(inactiveButComplete), true);
});

const DEFICIENCIES = [
  { key: "name_completed", patch: { name: "   " } },
  { key: "slug_completed", patch: { slug: "" } },
  { key: "price_valid", patch: { price: 0 } },
  { key: "category_linked", patch: { category_id: null } },
  { key: "image_present", patch: { images: [] } },
  { key: "stock_valid", patch: { stock: -1 } },
  { key: "discount_valid", patch: { discount_price: 5000 } },
  { key: "description_present", patch: { description: "" } },
];

for (const deficiency of DEFICIENCIES) {
  test(`readiness blocks activation when ${deficiency.key} fails`, () => {
    const product = readyProduct(deficiency.patch);
    const blocking = getBlockingActivationChecks(product);
    assert.deepEqual(blocking.map((c) => c.key), [deficiency.key]);
    assert.equal(isReadyForActivation(product), false);
    assert.equal(toMissingChecks(blocking)[0].key, deficiency.key);
    assert.ok(toMissingChecks(blocking)[0].label);
  });
}

test("findNewlyBrokenActivationChecks tolerates pre-existing gaps and catches new ones", () => {
  const legacy = readyProduct({ is_active: true, images: [] });
  assert.deepEqual(findNewlyBrokenActivationChecks(legacy, { ...legacy, stock: 9 }), []);
  assert.deepEqual(
    findNewlyBrokenActivationChecks(legacy, { ...legacy, description: "" }).map((c) => c.key),
    ["description_present"],
  );
  assert.deepEqual(findNewlyBrokenActivationChecks(legacy, { ...legacy, images: [IMAGE] }), []);
});

test("publication state triple is resolved in one place and stays internally consistent", () => {
  assert.deepEqual(resolveProductPublicationState({ requestedActive: true }), {
    is_active: true,
    is_published: true,
    visibility_status: "public",
  });
  assert.deepEqual(resolveProductPublicationState({ requestedActive: false }), {
    is_active: false,
    is_published: false,
    visibility_status: "private",
  });
  // Archival always wins over a contradictory activation request.
  assert.deepEqual(resolveProductPublicationState({ requestedActive: true, archived: true }), {
    is_active: false,
    is_published: false,
    visibility_status: "archived",
  });
});

// ── 2. Shared matrix across every production activation path ──────────────────

function makeService(products = []) {
  const state = { products: structuredClone(products), updates: [], inserts: [] };

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.inFilters = [];
      this.neqFilters = [];
    }
    select() {
      return this;
    }
    limit() {
      return this;
    }
    eq(field, value) {
      this.filters.push([field, value]);
      // Filters are frequently chained AFTER `.update(...)`; keep the recorded call in sync.
      if (this.record) this.record.filters = [...this.filters];
      return this;
    }
    neq(field, value) {
      this.neqFilters.push([field, value]);
      return this;
    }
    in(field, values) {
      this.inFilters.push([field, values]);
      if (this.record) this.record.inFilters = [...this.inFilters];
      return this;
    }
    update(payload) {
      this.record = { payload, filters: [...this.filters], inFilters: [...this.inFilters] };
      state.updates.push(this.record);
      return this;
    }
    insert(payload) {
      state.inserts.push(payload);
      return this;
    }
    matchRows() {
      return state.products.filter(
        (p) =>
          this.filters.every(([f, v]) => p[f] === v) &&
          this.inFilters.every(([f, values]) => values.includes(p[f])) &&
          this.neqFilters.every(([f, v]) => p[f] !== v),
      );
    }
    async single() {
      if (this.table === "merchants") return { data: { id: MERCHANT_ID, status: "active" }, error: null };
      if (state.inserts.length > 0) {
        return { data: { id: "new-id", ...state.inserts[state.inserts.length - 1] }, error: null };
      }
      return { data: this.matchRows()[0] ?? null, error: null };
    }
    async maybeSingle() {
      if (this.table === "merchants") return { data: { id: MERCHANT_ID, status: "active" }, error: null };
      return { data: this.matchRows()[0] ?? null, error: null };
    }
    then(resolve, reject) {
      try {
        resolve({ data: this.matchRows(), error: null });
      } catch (err) {
        reject(err);
      }
    }
  }

  const service = new ProductsService(
    { client: { from: (table) => new Query(table) } },
    { resolveMerchantScope: async (merchantId) => merchantId || MERCHANT_ID },
    { assertAssignableCategoryId: async () => undefined },
  );
  return { service, state };
}

function isNotReady(error) {
  assert.equal(error?.response?.code, PRODUCT_NOT_READY_CODE, `expected ${PRODUCT_NOT_READY_CODE}`);
  return true;
}

/**
 * Deficiencies expressible through EVERY path below (Quick Add only carries name, category,
 * price, stock, image_url and description, so the matrix uses the subset all paths share).
 */
const MATRIX = [
  { key: "image_present", productPatch: { images: [] }, quickAddPatch: { image_url: undefined } },
  { key: "description_present", productPatch: { description: "" }, quickAddPatch: { description: undefined } },
];

for (const entry of MATRIX) {
  test(`createProduct cannot activate a product missing ${entry.key}`, async () => {
    const { service, state } = makeService();
    await assert.rejects(
      () => service.createProduct(readyProduct({ ...entry.productPatch, is_active: true }), { actor_role: "admin" }),
      isNotReady,
    );
    assert.equal(state.inserts.length, 0);
  });

  test(`updateProduct cannot activate a product missing ${entry.key}`, async () => {
    const existing = readyProduct(entry.productPatch);
    const { service, state } = makeService([existing]);
    await assert.rejects(
      () => service.updateProduct("prod-1", { ...existing, is_active: true }, { merchant_id: MERCHANT_ID }),
      isNotReady,
    );
    assert.equal(state.updates.length, 0);
  });

  test(`updateProductStatus cannot activate a product missing ${entry.key}`, async () => {
    const { service, state } = makeService([readyProduct(entry.productPatch)]);
    await assert.rejects(() => service.updateProductStatus("prod-1", { is_active: true }), isNotReady);
    assert.equal(state.updates.length, 0);
  });

  test(`bulk activate cannot activate a product missing ${entry.key}`, async () => {
    const { service, state } = makeService([
      readyProduct({ id: "prod-1", slug: "slug-1" }),
      readyProduct({ id: "prod-2", slug: "slug-2", ...entry.productPatch }),
    ]);
    await assert.rejects(
      () => service.performBulkAction({ product_ids: ["prod-1", "prod-2"], action: "activate" }, ACTOR),
      (error) => isNotReady(error) && error.response.product_id === "prod-2",
    );
    assert.equal(state.updates.length, 0);
  });

  test(`quickAddProduct cannot activate a product missing ${entry.key}`, async () => {
    const { service, state } = makeService();
    await assert.rejects(
      () =>
        service.quickAddProduct(
          {
            name: "سريع",
            category_id: CATEGORY_ID,
            price: 100,
            stock: 1,
            image_url: IMAGE,
            description: "وصف تفصيلي",
            is_active: true,
            ...entry.quickAddPatch,
          },
          ACTOR,
        ),
      isNotReady,
    );
    assert.equal(state.inserts.length, 0);
  });
}

test("every activation path accepts the same fully ready product", async () => {
  const created = makeService();
  await created.service.createProduct(readyProduct({ is_active: true }), { actor_role: "admin" });
  assert.equal(created.state.inserts[0].is_active, true);

  const status = makeService([readyProduct()]);
  await status.service.updateProductStatus("prod-1", { is_active: true });
  assert.equal(status.state.updates[0].payload.is_active, true);

  const bulk = makeService([readyProduct({ id: "prod-1" })]);
  await bulk.service.performBulkAction({ product_ids: ["prod-1"], action: "activate" }, ACTOR);
  assert.equal(bulk.state.updates[0].payload.is_active, true);

  const quick = makeService();
  await quick.service.quickAddProduct(
    {
      name: "سريع جاهز",
      category_id: CATEGORY_ID,
      price: 100,
      stock: 1,
      image_url: IMAGE,
      description: "وصف تفصيلي",
      is_active: true,
    },
    ACTOR,
  );
  assert.equal(quick.state.inserts[0].is_active, true);
});

test("archival always leaves the product inactive, unpublished and archived", async () => {
  const bulk = makeService([readyProduct({ id: "prod-1", is_active: true, is_published: true, visibility_status: "public" })]);
  await bulk.service.performBulkAction({ product_ids: ["prod-1"], action: "archive" }, ACTOR);
  assert.deepEqual(
    {
      is_active: bulk.state.updates[0].payload.is_active,
      is_published: bulk.state.updates[0].payload.is_published,
      visibility_status: bulk.state.updates[0].payload.visibility_status,
    },
    { is_active: false, is_published: false, visibility_status: "archived" },
  );

  const existing = readyProduct({ is_active: true, is_published: true, visibility_status: "public" });
  const update = makeService([existing]);
  await update.service.updateProduct("prod-1", { ...existing, visibility_status: "archived" }, { merchant_id: MERCHANT_ID });
  assert.equal(update.state.updates[0].payload.is_active, false);
  assert.equal(update.state.updates[0].payload.is_published, false);
  assert.equal(update.state.updates[0].payload.visibility_status, "archived");

  const create = makeService();
  await create.service.createProduct(readyProduct({ is_active: true, visibility_status: "archived" }), { actor_role: "admin" });
  assert.equal(create.state.inserts[0].is_active, false);
  assert.equal(create.state.inserts[0].is_published, false);
  assert.equal(create.state.inserts[0].visibility_status, "archived");
});

// ── 3. Publication-state canonicalization (closure pass) ──────────────────────
//
// UpsertProductDto lets a client send is_active / is_published / visibility_status. None of
// them are persisted verbatim: `resolveUpdatePublicationState` canonicalizes the triple, and any
// transition that increases exposure runs the FULL readiness gate (never the
// "did this edit newly break something" comparison).

const { increasesPublicExposure, resolveUpdatePublicationState } = await import(
  "../dist/modules/products/product-readiness.js"
);

test("resolveUpdatePublicationState never returns an exposed inactive product", () => {
  const existing = { is_active: false, is_published: false, visibility_status: "private" };
  for (const requested of [
    { is_active: false, is_published: true, visibility_status: "public" },
    { is_active: false, is_published: true, visibility_status: "private" },
    { is_active: false, is_published: false, visibility_status: "public" },
  ]) {
    assert.deepEqual(resolveUpdatePublicationState(existing, requested), {
      is_active: false,
      is_published: false,
      visibility_status: "private",
    });
  }
});

test("increasesPublicExposure detects activation, publication and publicization", () => {
  const legacy = { is_active: true, is_published: false, visibility_status: "private" };
  assert.equal(increasesPublicExposure(legacy, { is_active: true, is_published: true, visibility_status: "private" }), true);
  assert.equal(increasesPublicExposure(legacy, { is_active: true, is_published: false, visibility_status: "public" }), true);
  assert.equal(increasesPublicExposure(legacy, { is_active: true, is_published: false, visibility_status: "private" }), false);
  assert.equal(
    increasesPublicExposure(
      { is_active: false, is_published: false, visibility_status: "private" },
      { is_active: true, is_published: true, visibility_status: "public" },
    ),
    true,
  );
  assert.equal(
    increasesPublicExposure(
      { is_active: true, is_published: true, visibility_status: "public" },
      { is_active: false, is_published: false, visibility_status: "archived" },
    ),
    false,
  );
});

// A + G. inactive + requested published/public can never persist an exposed inactive product.
const EXPOSED_INACTIVE_REQUESTS = [
  { label: "false / true / public", is_active: false, is_published: true, visibility_status: "public" },
  { label: "false / true / private", is_active: false, is_published: true, visibility_status: "private" },
  { label: "false / false / public", is_active: false, is_published: false, visibility_status: "public" },
];

for (const request of EXPOSED_INACTIVE_REQUESTS) {
  test(`updateProduct canonicalizes the contradictory client state ${request.label} to false/false/private`, async () => {
    const existing = readyProduct({ is_active: true, is_published: true, visibility_status: "public" });
    const { service, state } = makeService([existing]);

    await service.updateProduct(
      "prod-1",
      {
        ...existing,
        is_active: request.is_active,
        is_published: request.is_published,
        visibility_status: request.visibility_status,
      },
      { merchant_id: MERCHANT_ID },
    );

    assert.equal(state.updates.length, 1);
    assert.equal(state.updates[0].payload.is_active, false);
    assert.equal(state.updates[0].payload.is_published, false);
    assert.equal(state.updates[0].payload.visibility_status, "private");
  });

  test(`updateProduct on an INACTIVE product cannot persist ${request.label}`, async () => {
    const existing = readyProduct({ is_active: false, is_published: false, visibility_status: "private" });
    const { service, state } = makeService([existing]);

    await service.updateProduct(
      "prod-1",
      {
        ...existing,
        is_active: request.is_active,
        is_published: request.is_published,
        visibility_status: request.visibility_status,
      },
      { merchant_id: MERCHANT_ID },
    );

    assert.equal(state.updates.length, 1);
    const written = state.updates[0].payload;
    assert.notEqual(written.is_published, true);
    assert.notEqual(written.visibility_status, "public");
    // The canonical target equals the already-private row, so no publication field is written.
    assert.equal(written.is_active, undefined);
  });
}

// C. updateProduct deactivation becomes exactly false / false / private.
test("updateProduct deactivation of a live product writes exactly false/false/private", async () => {
  const existing = readyProduct({ is_active: true, is_published: true, visibility_status: "public" });
  const { service, state } = makeService([existing]);

  await service.updateProduct("prod-1", { ...existing, is_active: false }, { merchant_id: MERCHANT_ID });

  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.is_active, false);
  assert.equal(state.updates[0].payload.is_published, false);
  assert.equal(state.updates[0].payload.visibility_status, "private");
});

// B. updateProductStatus(false) on a public product becomes exactly false / false / private.
test("updateProductStatus(false) writes exactly false/false/private", async () => {
  const { service, state } = makeService([
    readyProduct({ is_active: true, is_published: true, visibility_status: "public" }),
  ]);

  await service.updateProductStatus("prod-1", { is_active: false });

  assert.equal(state.updates.length, 1);
  assert.deepEqual(
    {
      is_active: state.updates[0].payload.is_active,
      is_published: state.updates[0].payload.is_published,
      visibility_status: state.updates[0].payload.visibility_status,
    },
    { is_active: false, is_published: false, visibility_status: "private" },
  );
});

// D. archive stays exactly false / false / archived (also covered per-path in section 2).
test("updateProduct archive request wins over a contradictory active/published payload", async () => {
  const existing = readyProduct({ is_active: true, is_published: true, visibility_status: "public" });
  const { service, state } = makeService([existing]);

  await service.updateProduct(
    "prod-1",
    { ...existing, is_active: true, is_published: true, visibility_status: "archived" },
    { merchant_id: MERCHANT_ID },
  );

  assert.deepEqual(
    {
      is_active: state.updates[0].payload.is_active,
      is_published: state.updates[0].payload.is_published,
      visibility_status: state.updates[0].payload.visibility_status,
    },
    { is_active: false, is_published: false, visibility_status: "archived" },
  );
});

test("deactivating an archived product through updateProduct keeps it archived", async () => {
  const existing = readyProduct({ is_active: false, is_published: false, visibility_status: "archived" });
  const { service, state } = makeService([existing]);

  await service.updateProduct(
    "prod-1",
    { ...existing, is_active: false, visibility_status: undefined },
    { merchant_id: MERCHANT_ID },
  );

  assert.equal(state.updates.length, 1);
  assert.equal(
    state.updates[0].payload.visibility_status,
    undefined,
    "archived row is left untouched, not restored to private",
  );
  assert.equal(state.updates[0].payload.is_active, undefined);
});

// E. legacy active + private/unpublished + missing readiness → publish/publicize is refused.
const LEGACY_EXPOSURE_ATTEMPTS = [
  { label: "is_published=true", patch: { is_published: true } },
  { label: "visibility_status=public", patch: { visibility_status: "public" } },
  { label: "both", patch: { is_published: true, visibility_status: "public" } },
];

for (const attempt of LEGACY_EXPOSURE_ATTEMPTS) {
  test(`REGRESSION: legacy active-but-unready product cannot be exposed via ${attempt.label}`, async () => {
    const existing = readyProduct({
      is_active: true,
      is_published: false,
      visibility_status: "private",
      images: [],
    });
    const { service, state } = makeService([existing]);

    await assert.rejects(
      () => service.updateProduct("prod-1", { ...existing, ...attempt.patch }, { merchant_id: MERCHANT_ID }),
      (error) => {
        isNotReady(error);
        assert.deepEqual(error.response.missing_checks.map((c) => c.key), ["image_present"]);
        return true;
      },
    );
    assert.equal(state.updates.length, 0);
  });
}

test("a legacy active-but-unready product stays editable so it can be repaired", async () => {
  const existing = readyProduct({ is_active: true, is_published: false, visibility_status: "private", images: [] });
  const { service, state } = makeService([existing]);

  await service.updateProduct("prod-1", { ...existing, stock: 42 }, { merchant_id: MERCHANT_ID });
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.stock, 42);
});

// F. legacy active + private/unpublished + fully ready → exposure transition succeeds.
test("a fully ready active-private product can be published and made public", async () => {
  const existing = readyProduct({ is_active: true, is_published: false, visibility_status: "private" });
  const { service, state } = makeService([existing]);

  await service.updateProduct(
    "prod-1",
    { ...existing, is_published: true, visibility_status: "public" },
    { merchant_id: MERCHANT_ID },
  );

  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.is_published, true);
  assert.equal(state.updates[0].payload.visibility_status, "public");
});

test("bulk deactivate writes the full private triple and leaves archived products archived", async () => {
  const live = readyProduct({ id: "prod-1", slug: "s1", is_active: true, is_published: true, visibility_status: "public" });
  const archived = readyProduct({ id: "prod-2", slug: "s2", is_active: false, is_published: false, visibility_status: "archived" });
  const { service, state } = makeService([live, archived]);

  await service.performBulkAction({ product_ids: ["prod-1", "prod-2"], action: "deactivate" }, ACTOR);

  assert.equal(state.updates.length, 2);
  const byVisibility = Object.fromEntries(state.updates.map((u) => [u.payload.visibility_status, u]));
  assert.deepEqual(byVisibility.private.inFilters[0][1], ["prod-1"]);
  assert.equal(byVisibility.private.payload.is_published, false);
  assert.deepEqual(byVisibility.archived.inFilters[0][1], ["prod-2"]);
  assert.equal(byVisibility.archived.payload.is_active, false);
});

test("updateProduct cannot silently un-archive a product; the restore path is updateProductStatus", async () => {
  const existing = readyProduct({ is_active: false, is_published: false, visibility_status: "archived" });
  const update = makeService([existing]);

  // Archive is sticky: an `is_active: true` payload without an explicit visibility change cannot
  // un-archive, and is refused explicitly rather than succeeding as a silent no-op.
  await assert.rejects(
    () =>
      update.service.updateProduct(
        "prod-1",
        { name: existing.name, slug: existing.slug, price: existing.price, is_active: true },
        { merchant_id: MERCHANT_ID },
      ),
    (error) => {
      assert.equal(error?.response?.code, "PRODUCT_ARCHIVED");
      return true;
    },
  );
  assert.equal(update.state.updates.length, 0);

  // A payload that echoes `visibility_status: "archived"` is an explicit archive request, so it
  // still succeeds and simply keeps the product archived.
  const echoed = makeService([existing]);
  await echoed.service.updateProduct("prod-1", { ...existing, is_active: true }, { merchant_id: MERCHANT_ID });
  assert.equal(echoed.state.updates.length, 1);
  assert.equal(echoed.state.updates[0].payload.is_active, undefined);
  assert.equal(echoed.state.updates[0].payload.visibility_status, undefined);

  // The explicit restore path still works and still runs the readiness gate.
  const restore = makeService([existing]);
  await restore.service.updateProductStatus("prod-1", { is_active: true });
  assert.deepEqual(
    {
      is_active: restore.state.updates[0].payload.is_active,
      is_published: restore.state.updates[0].payload.is_published,
      visibility_status: restore.state.updates[0].payload.visibility_status,
    },
    { is_active: true, is_published: true, visibility_status: "public" },
  );

  const unready = makeService([readyProduct({ is_active: false, visibility_status: "archived", images: [] })]);
  await assert.rejects(() => unready.service.updateProductStatus("prod-1", { is_active: true }), isNotReady);
  assert.equal(unready.state.updates.length, 0);
});

// ── 4. is_published / visibility_status are one coupled exposure decision ─────
//
// For an active product the two axes are never carried independently once the request touches
// either of them: exposure requires both, and an explicit request that disagrees with the other
// axis resolves to the LESS exposed combination. A request that touches neither leaves an
// existing (possibly legacy/contradictory) row untouched.

const { requestsMorePublicExposure } = await import("../dist/modules/products/product-readiness.js");

test("an active product cannot end up published-but-private or unpublished-but-public", () => {
  const activePublic = { is_active: true, is_published: true, visibility_status: "public" };
  assert.deepEqual(resolveUpdatePublicationState(activePublic, { is_published: false }), {
    is_active: true,
    is_published: false,
    visibility_status: "private",
  });
  assert.deepEqual(resolveUpdatePublicationState(activePublic, { visibility_status: "private" }), {
    is_active: true,
    is_published: false,
    visibility_status: "private",
  });
  assert.deepEqual(
    resolveUpdatePublicationState(
      { is_active: true, is_published: false, visibility_status: "private" },
      { is_published: true, visibility_status: "public" },
    ),
    { is_active: true, is_published: true, visibility_status: "public" },
  );
  // Contradictory request → the less exposed combination wins.
  assert.deepEqual(
    resolveUpdatePublicationState(
      { is_active: true, is_published: false, visibility_status: "private" },
      { is_published: true, visibility_status: "private" },
    ),
    { is_active: true, is_published: false, visibility_status: "private" },
  );
});

test("an ordinary edit leaves a legacy active-unpublished-public row exactly as it is", () => {
  const legacy = { is_active: true, is_published: false, visibility_status: "public" };
  assert.deepEqual(resolveUpdatePublicationState(legacy, { is_active: true }), legacy);
});

test("activation honors explicitly pinned axes and only defaults to published+public when omitted", () => {
  const draft = { is_active: false, is_published: false, visibility_status: "private" };
  assert.deepEqual(resolveUpdatePublicationState(draft, { is_active: true }), {
    is_active: true,
    is_published: true,
    visibility_status: "public",
  });
  assert.deepEqual(resolveUpdatePublicationState(draft, { is_active: true, visibility_status: "private" }), {
    is_active: true,
    is_published: false,
    visibility_status: "private",
  });
  assert.deepEqual(resolveUpdatePublicationState(draft, { is_active: true, is_published: false }), {
    is_active: true,
    is_published: false,
    visibility_status: "private",
  });
});

test("requestsMorePublicExposure catches an exposure ASK that canonicalization turns into a no-op", () => {
  const activePrivate = { is_active: true, is_published: false, visibility_status: "private" };
  // Coupled resolution keeps this private, but the caller still asked to publish.
  assert.deepEqual(resolveUpdatePublicationState(activePrivate, { is_published: true }), activePrivate);
  assert.equal(requestsMorePublicExposure(activePrivate, { is_published: true }), true);
  assert.equal(requestsMorePublicExposure(activePrivate, { visibility_status: "public" }), true);
  assert.equal(requestsMorePublicExposure(activePrivate, { is_published: false }), false);
  // An archive request is never an exposure increase.
  assert.equal(
    requestsMorePublicExposure(activePrivate, { is_active: true, visibility_status: "archived" }),
    false,
  );
});

test("REGRESSION: asking to publish an unready active product fails loudly instead of silently doing nothing", async () => {
  const existing = readyProduct({ is_active: true, is_published: false, visibility_status: "private", images: [] });
  const { service, state } = makeService([existing]);

  await assert.rejects(
    () => service.updateProduct("prod-1", { ...existing, is_published: true }, { merchant_id: MERCHANT_ID }),
    isNotReady,
  );
  assert.equal(state.updates.length, 0);
});

test("a ready active-private product asked to publish only one axis stays private, with no contradictory write", async () => {
  const existing = readyProduct({ is_active: true, is_published: false, visibility_status: "private" });
  const { service, state } = makeService([existing]);

  await service.updateProduct("prod-1", { ...existing, is_published: true }, { merchant_id: MERCHANT_ID });

  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.is_published, undefined);
  assert.equal(state.updates[0].payload.visibility_status, undefined);
});

// ── 5. Archive is sticky in both directions ──────────────────────────────────

test("a generic visibility update never takes a product out of the archive", () => {
  const archived = { is_active: false, is_published: false, visibility_status: "archived" };
  for (const requested of [
    { visibility_status: "private" },
    { visibility_status: "public" },
    { is_active: false, visibility_status: "private" },
    { is_active: false, visibility_status: "public" },
    { is_published: true, visibility_status: "public" },
  ]) {
    assert.deepEqual(resolveUpdatePublicationState(archived, requested), archived);
  }
});

test("un-archiving through updateProduct requires an explicit is_active=true", () => {
  const archived = { is_active: false, is_published: false, visibility_status: "archived" };
  assert.deepEqual(resolveUpdatePublicationState(archived, { is_active: true, visibility_status: "public" }), {
    is_active: true,
    is_published: true,
    visibility_status: "public",
  });
  assert.deepEqual(resolveUpdatePublicationState(archived, { is_active: true, visibility_status: "private" }), {
    is_active: true,
    is_published: false,
    visibility_status: "private",
  });
  // Without an explicit visibility the archive still wins in the pure resolver — the service
  // refuses that request outright rather than letting it succeed as a silent no-op (see the
  // PRODUCT_ARCHIVED test below).
  assert.deepEqual(resolveUpdatePublicationState(archived, { is_active: true }), archived);
});

test("REGRESSION: an archived product edited with visibility_status=private stays archived", async () => {
  const existing = readyProduct({ is_active: false, is_published: false, visibility_status: "archived" });
  const { service, state } = makeService([existing]);

  await service.updateProduct(
    "prod-1",
    { ...existing, visibility_status: "private" },
    { merchant_id: MERCHANT_ID },
  );

  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.visibility_status, undefined, "archived row untouched");
  assert.equal(state.updates[0].payload.is_active, undefined);
  assert.equal(state.updates[0].payload.is_published, undefined);
});

test("REGRESSION: an archived product edited with visibility_status=public stays archived and is not exposed", async () => {
  const existing = readyProduct({ is_active: false, is_published: false, visibility_status: "archived" });
  const { service, state } = makeService([existing]);

  await service.updateProduct(
    "prod-1",
    { ...existing, visibility_status: "public" },
    { merchant_id: MERCHANT_ID },
  );

  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].payload.visibility_status, undefined);
  assert.equal(state.updates[0].payload.is_published, undefined);
});

test("restoring an archived product through updateProduct still runs the readiness gate", async () => {
  const unready = readyProduct({ is_active: false, visibility_status: "archived", images: [] });
  const blocked = makeService([unready]);
  await assert.rejects(
    () =>
      blocked.service.updateProduct(
        "prod-1",
        { ...unready, is_active: true, visibility_status: "public" },
        { merchant_id: MERCHANT_ID },
      ),
    isNotReady,
  );
  assert.equal(blocked.state.updates.length, 0);

  // A restore that pins BOTH exposure axes goes back to published + public.
  const ready = readyProduct({ is_active: false, visibility_status: "archived" });
  const restored = makeService([ready]);
  await restored.service.updateProduct(
    "prod-1",
    { ...ready, is_active: true, is_published: true, visibility_status: "public" },
    { merchant_id: MERCHANT_ID },
  );
  assert.equal(restored.state.updates[0].payload.is_active, true);
  assert.equal(restored.state.updates[0].payload.is_published, true);
  assert.equal(restored.state.updates[0].payload.visibility_status, "public");

  // A restore whose payload still carries is_published=false resolves to the less exposed
  // active + private, never to a contradictory published/public mix.
  const partial = makeService([readyProduct({ is_active: false, visibility_status: "archived" })]);
  await partial.service.updateProduct(
    "prod-1",
    { ...ready, is_active: true, visibility_status: "public" },
    { merchant_id: MERCHANT_ID },
  );
  assert.equal(partial.state.updates[0].payload.is_active, true);
  assert.equal(partial.state.updates[0].payload.visibility_status, "private");
  assert.equal(partial.state.updates[0].payload.is_published, undefined);
});
