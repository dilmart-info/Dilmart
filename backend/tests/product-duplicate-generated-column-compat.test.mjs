/**
 * Duplicate-product compatibility with the generated readiness column.
 *
 * `duplicateProduct` reads the source row with `select("*")` and spreads it into the INSERT
 * payload. Once `products.is_ready` exists (a STORED GENERATED column), sending that field back
 * makes Postgres reject the insert:
 *
 *   cannot insert a non-DEFAULT value into column "is_ready"
 *
 * This suite pins the compatibility contract in BOTH directions, so the schema change and the
 * readiness-filtering release can be deployed independently:
 *   A. a source row WITHOUT `is_ready` (today's Production schema) duplicates exactly as before;
 *   B. a source row WITH `is_ready` (after the migration) never sends the column on INSERT.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ProductsService } from "../dist/modules/products/products.service.js";

const MERCHANT_ID = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
const OTHER_MERCHANT_ID = "1689ae4a-41f5-425b-bebe-c99c74880008";
const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE = "https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/img.png";

/** Columns Postgres refuses to accept an explicit value for. */
const GENERATED_COLUMNS = ["is_ready"];

function makeService(products = []) {
  const state = { products: structuredClone(products), inserts: [], rejected: [] };

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
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
      return this;
    }
    neq(field, value) {
      this.neqFilters.push([field, value]);
      return this;
    }
    insert(payload) {
      this.insertPayload = payload;
      state.inserts.push(payload);
      return this;
    }
    #match() {
      return state.products.filter(
        (row) =>
          this.filters.every(([f, v]) => row[f] === v) && this.neqFilters.every(([f, v]) => row[f] !== v),
      );
    }
    async single() {
      if (this.table === "merchants") return { data: { id: MERCHANT_ID, status: "active" }, error: null };
      if (this.insertPayload) {
        // Postgres behaviour: an explicit value for a GENERATED column is an error. `undefined`
        // keys are dropped by the client before the request, so only own+defined keys count.
        const offending = GENERATED_COLUMNS.filter(
          (column) => Object.prototype.hasOwnProperty.call(this.insertPayload, column) && this.insertPayload[column] !== undefined,
        );
        if (offending.length > 0) {
          state.rejected.push(offending);
          return {
            data: null,
            error: { message: `cannot insert a non-DEFAULT value into column "${offending[0]}"`, code: "428C9" },
          };
        }
        // The database assigns the identity, so it wins over the `id: undefined` in the payload.
        return { data: { ...this.insertPayload, id: "new-product-id" }, error: null };
      }
      return { data: this.#match()[0] ?? null, error: null };
    }
    async maybeSingle() {
      if (this.table === "merchants") return { data: { id: MERCHANT_ID, status: "active" }, error: null };
      return { data: this.#match()[0] ?? null, error: null };
    }
    then(resolve) {
      return resolve({ data: this.#match(), error: null });
    }
  }

  const service = new ProductsService(
    { client: { from: (table) => new Query(table) } },
    {
      resolveMerchantScope: async (merchantId, actorRole) => {
        // server-authoritative: a merchant actor is always pinned to their own merchant
        if (actorRole && actorRole.startsWith("merchant_")) return MERCHANT_ID;
        return merchantId ?? null;
      },
    },
    { assertAssignableCategoryId: async () => undefined },
  );
  /** Runs an INSERT straight through the same fake, to prove the rejection path is real. */
  const rawInsert = async (payload) => new Query("products").insert(payload).single();

  return { service, state, rawInsert };
}

function sourceProduct(overrides = {}) {
  return {
    id: "prod-source",
    merchant_id: MERCHANT_ID,
    name: "منتج أصلي",
    slug: "original-product",
    description: "وصف تفصيلي",
    short_description: "وصف قصير صالح يحتوي على ما يكفي من التفاصيل الكافية.",
    price: 1000,
    discount_price: null,
    category_id: CATEGORY_ID,
    images: [IMAGE],
    stock: 7,
    merchant_sku: "SKU-1",
    is_active: true,
    is_published: true,
    visibility_status: "public",
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-02T10:00:00.000Z",
    ...overrides,
  };
}

const ACTOR = { actor_role: "merchant_owner", actor_id: "owner-1" };

test("duplicate never sends the generated readiness column when the source row carries it", async () => {
  // Source row as `select("*")` returns it AFTER the migration adds the generated column.
  const { service, state } = makeService([sourceProduct({ is_ready: true })]);

  const copy = await service.duplicateProduct("prod-source", MERCHANT_ID, ACTOR);

  assert.equal(state.rejected.length, 0, "Postgres must not have rejected the insert");
  assert.equal(state.inserts.length, 1);
  const payload = state.inserts[0];
  assert.equal(
    Object.prototype.hasOwnProperty.call(payload, "is_ready") && payload.is_ready !== undefined,
    false,
    "is_ready must never carry a value into the INSERT payload",
  );
  assert.ok(copy?.id, "the duplicate is still created");
});

test("duplicate still works when the source row has no generated column yet", async () => {
  // Today's Production schema: `products.is_ready` does not exist at all.
  const { service, state } = makeService([sourceProduct()]);

  const copy = await service.duplicateProduct("prod-source", MERCHANT_ID, ACTOR);

  assert.equal(state.inserts.length, 1);
  assert.equal(state.inserts[0].is_ready, undefined);
  assert.ok(copy?.id);
});

test("duplicate preserves its existing contract: draft copy, new identity, merchant scope", async () => {
  const { service, state } = makeService([sourceProduct({ is_ready: true })]);

  const copy = await service.duplicateProduct("prod-source", MERCHANT_ID, ACTOR);
  const payload = state.inserts[0];

  // draft publication state (unchanged behaviour)
  assert.equal(payload.is_active, false);
  assert.equal(payload.is_published, false);
  assert.equal(payload.visibility_status, "private");

  // new identity, no id/timestamp carry-over, SKU cleared
  assert.equal(payload.id, undefined);
  assert.equal(payload.created_at, undefined);
  assert.equal(payload.updated_at, undefined);
  assert.equal(payload.merchant_sku, null);
  assert.equal(payload.name, "منتج أصلي (Copy)");
  assert.notEqual(payload.slug, "original-product");
  assert.ok(String(payload.slug).length > 0);

  // catalogue content is still copied
  assert.equal(payload.price, 1000);
  assert.equal(payload.category_id, CATEGORY_ID);
  assert.deepEqual(payload.images, [IMAGE]);
  assert.equal(payload.stock, 7);

  // merchant scope unchanged
  assert.equal(payload.merchant_id, MERCHANT_ID);
  assert.equal(copy.is_active, false);
});

test("duplicate still refuses a product outside the actor's merchant scope", async () => {
  const { service, state } = makeService([
    sourceProduct({ id: "prod-other", merchant_id: OTHER_MERCHANT_ID, is_ready: true }),
  ]);

  await assert.rejects(
    () => service.duplicateProduct("prod-other", MERCHANT_ID, ACTOR),
    (error) => error.status === 403 || /not found in merchant scope/i.test(String(error.message)),
  );
  assert.equal(state.inserts.length, 0);
});

test("harness validity: an INSERT that still carries is_ready is rejected like Postgres does", async () => {
  // Without the guard, `duplicateProduct` would spread `is_ready` from the source row into the
  // payload. Pushing exactly that shape through the same fake proves the passing tests above are
  // meaningful rather than vacuous.
  const { rawInsert, state } = makeService([]);

  const { data, error } = await rawInsert({ ...sourceProduct({ is_ready: true }), id: undefined });

  assert.equal(data, null);
  assert.match(String(error?.message), /cannot insert a non-DEFAULT value into column "is_ready"/);
  assert.deepEqual(state.rejected, [["is_ready"]]);
});
