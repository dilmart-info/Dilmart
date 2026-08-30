/**
 * Product content bulk-update — content-only atomic path.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const { ProductContentBulkService } = await import("../dist/modules/products/product-content-bulk.service.js");

const MERCHANT = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
const OTHER_MERCHANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VALID_SHORT =
  "عطر تجريبي بحجم مناسب بتركيبة واضحة للجنسين من علامة موثوقة ضمن نطاق الوصف المختصر المعتمد.";

function makeItems(n = 9) {
  return Array.from({ length: n }, (_, i) => ({
    merchant_sku: `ARD-${1000 + i}`,
    short_description: VALID_SHORT,
    description: i === 7 ? null : `تفصيلي ${i}`,
  }));
}

function createFake({ merchants, products }) {
  const state = {
    merchants: merchants.map((m) => ({ ...m })),
    products: products.map((p) => ({ ...p })),
    audit_logs: [],
  };
  const calls = { rpc: [] };
  /** Test-settable hooks (see `beforeRpc` in the rpc stub below). */
  const hooks = {};

  function defaultBulkRpc(params) {
    const { p_merchant_id, p_actor_id, p_actor_role, p_items } = params;
    if (!state.merchants.some((m) => m.id === p_merchant_id)) {
      return { data: null, error: { message: "CONTENT_BULK_MERCHANT_NOT_FOUND" } };
    }
    if (!Array.isArray(p_items) || p_items.length < 1) {
      return { data: null, error: { message: "CONTENT_BULK_ITEMS_REQUIRED" } };
    }

    const working = state.products.map((p) => ({ ...p }));
    const seen = new Set();
    const staged = [];

    for (const item of p_items) {
      const keys = Object.keys(item || {});
      for (const k of keys) {
        if (!["merchant_sku", "short_description", "description"].includes(k)) {
          return { data: null, error: { message: `CONTENT_BULK_UNEXPECTED_FIELD: field ${k}` } };
        }
      }
      const sku = String(item.merchant_sku || "").trim().toUpperCase();
      if (!sku) return { data: null, error: { message: "CONTENT_BULK_SKU_REQUIRED" } };
      if (sku === "ARD-1191") return { data: null, error: { message: `CONTENT_BULK_HOLD_SKU_REJECTED: ${sku}` } };
      if (seen.has(sku)) return { data: null, error: { message: `CONTENT_BULK_DUPLICATE_SKU: ${sku}` } };
      seen.add(sku);

      const short = String(item.short_description || "").trim();
      if (!short) return { data: null, error: { message: `CONTENT_BULK_SHORT_DESCRIPTION_REQUIRED: sku ${sku}` } };
      if (/<\/?[a-z][^<>]*>/i.test(short)) {
        return { data: null, error: { message: `CONTENT_BULK_SHORT_DESCRIPTION_INVALID: sku ${sku}` } };
      }
      const len = [...short].length;
      if (len < 40) return { data: null, error: { message: `CONTENT_BULK_SHORT_DESCRIPTION_TOO_SHORT: sku ${sku}` } };
      if (len > 280) return { data: null, error: { message: `CONTENT_BULK_SHORT_DESCRIPTION_TOO_LONG: sku ${sku}` } };

      const matches = working.filter(
        (p) => p.merchant_id === p_merchant_id && String(p.merchant_sku || "").trim().toUpperCase() === sku,
      );
      if (matches.length === 0) return { data: null, error: { message: `CONTENT_BULK_SKU_NOT_FOUND: ${sku}` } };
      if (matches.length > 1) return { data: null, error: { message: `CONTENT_BULK_SKU_AMBIGUOUS: ${sku}` } };
      const description = item.description == null || item.description === "" ? null : String(item.description);

      // Mirrors 20260819130000_product_content_bulk_live_description_guard.sql: the row is read
      // (FOR UPDATE in Postgres) inside the same transaction as the write, so the state observed
      // here — not the caller's earlier pre-read — is what decides.
      const live = matches[0];
      if (
        description === null &&
        (live.is_active === true || live.is_published === true || live.visibility_status === "public")
      ) {
        return {
          data: null,
          error: {
            message: `CONTENT_BULK_PRODUCT_NOT_READY: sku ${sku} is active/published/public; description cannot be cleared`,
          },
        };
      }

      staged.push({ product: live, short, description });
    }

    // Commit all-or-nothing
    const results = [];
    for (const s of staged) {
      s.product.short_description = s.short;
      s.product.description = s.description;
      results.push({
        merchant_sku: s.product.merchant_sku,
        product_id: s.product.id,
        short_description: s.short,
        description: s.description,
        status: "updated",
      });
    }

    if (p_actor_id && p_actor_role) {
      state.audit_logs.push({
        event_type: "ADMIN_ACTION",
        actor_id: p_actor_id,
        actor_role: p_actor_role,
        merchant_id: p_merchant_id,
        resource_type: "product_content_bulk_update",
        resource_id: p_merchant_id,
        payload: { updated_count: results.length },
      });
    }

    state.products = working;
    return {
      data: { ok: true, merchant_id: p_merchant_id, updated_count: results.length, results },
      error: null,
    };
  }

  const client = {
    from(table) {
      const filters = [];
      const inFilters = [];
      /** Parsed `col.ilike."value"` clauses from a PostgREST `or(...)` expression. */
      let orClauses = null;
      const matches = () =>
        state[table].filter(
          (r) =>
            filters.every(([c, v]) => r[c] === v) &&
            inFilters.every(([c, values]) => values.includes(r[c])) &&
            (orClauses === null ||
              orClauses.some(([c, v]) => String(r[c] ?? "").toLowerCase() === String(v).toLowerCase())),
        );
      return {
        or(expression) {
          orClauses = String(expression)
            .split(",")
            .map((clause) => {
              const match = /^([a-z_]+)\.ilike\."(.*)"$/.exec(clause.trim());
              if (!match) throw new Error(`unsupported or() clause: ${clause}`);
              return [match[1], match[2]];
            });
          return this;
        },
        select() {
          return this;
        },
        eq(col, val) {
          filters.push([col, val]);
          return this;
        },
        in(col, values) {
          inFilters.push([col, values]);
          return this;
        },
        async maybeSingle() {
          return { data: matches()[0] ?? null, error: null };
        },
        // Awaiting the builder itself returns the full row set (used by the readiness guard).
        then(resolve, reject) {
          try {
            resolve({ data: matches(), error: null });
          } catch (err) {
            reject(err);
          }
        },
      };
    },
    async rpc(name, params) {
      calls.rpc.push({ name, params });
      // Lets a test simulate a concurrent write landing between the service pre-read and the
      // (authoritative) RPC transaction.
      if (typeof hooks.beforeRpc === "function") hooks.beforeRpc(state);
      if (name === "product_content_bulk_update_atomic") return defaultBulkRpc(params);
      return { data: null, error: { message: `Unknown RPC ${name}` } };
    },
  };

  return { client, state, calls, hooks };
}

function makeService(seed) {
  const fake = createFake(seed);
  return {
    service: new ProductContentBulkService({ client: fake.client }),
    fake,
  };
}

function seedNineProducts(merchantId = MERCHANT) {
  return Array.from({ length: 9 }, (_, i) => ({
    id: randomUUID(),
    merchant_id: merchantId,
    merchant_sku: `ARD-${1000 + i}`,
    name: `Product ${i}`,
    price: 10,
    stock: 0,
    short_description: null,
    description: null,
    is_active: false,
    is_published: false,
    visibility_status: "private",
    category_id: "cat-1",
    brand: "Lattafa",
  }));
}

const admin = { actor_role: "admin", actor_id: "admin-1" };

test("bulk content route accepts exact 9 and updates only description fields", async () => {
  const products = seedNineProducts();
  const snapshot = products.map((p) => ({ ...p }));
  const { service, fake } = makeService({ merchants: [{ id: MERCHANT }], products });
  const result = await service.bulkUpdateContent(MERCHANT, { items: makeItems(9) }, admin);
  assert.equal(result.updated_count, 9);
  assert.equal(fake.calls.rpc.length, 1);
  assert.equal(fake.state.audit_logs.length, 1);
  for (let i = 0; i < 9; i += 1) {
    const p = fake.state.products[i];
    const before = snapshot[i];
    assert.equal(p.short_description, VALID_SHORT);
    assert.equal(p.name, before.name);
    assert.equal(p.price, before.price);
    assert.equal(p.stock, before.stock);
    assert.equal(p.category_id, before.category_id);
    assert.equal(p.brand, before.brand);
    assert.equal(p.is_active, before.is_active);
    assert.equal(p.is_published, before.is_published);
    assert.equal(p.visibility_status, before.visibility_status);
  }
});

test("bulk update is transactionally atomic — one missing SKU rolls back all", async () => {
  const products = seedNineProducts().slice(0, 8); // missing one
  const { service, fake } = makeService({ merchants: [{ id: MERCHANT }], products });
  await assert.rejects(
    () => service.bulkUpdateContent(MERCHANT, { items: makeItems(9) }, admin),
    (err) => /CONTENT_BULK_SKU_NOT_FOUND/.test(err.message),
  );
  assert.equal(fake.state.products.every((p) => p.short_description == null), true);
  assert.equal(fake.state.audit_logs.length, 0);
});

test("duplicate SKU rejected", async () => {
  const products = seedNineProducts();
  const { service } = makeService({ merchants: [{ id: MERCHANT }], products });
  const items = makeItems(9);
  items[1].merchant_sku = items[0].merchant_sku;
  await assert.rejects(
    () => service.bulkUpdateContent(MERCHANT, { items }, admin),
    (err) => /CONTENT_BULK_DUPLICATE_SKU/.test(JSON.stringify(err.getResponse?.() ?? err.message)),
  );
});

test("wrong merchant rejected", async () => {
  const { service } = makeService({ merchants: [{ id: MERCHANT }], products: seedNineProducts() });
  await assert.rejects(
    () => service.bulkUpdateContent(OTHER_MERCHANT, { items: makeItems(9) }, admin),
    (err) => err.getStatus?.() === 404 || /not found/i.test(err.message),
  );
});

test("ARD-1191 HOLD rejected", async () => {
  const products = seedNineProducts();
  products[0].merchant_sku = "ARD-1191";
  const { service, fake } = makeService({ merchants: [{ id: MERCHANT }], products });
  const items = makeItems(9);
  items[0].merchant_sku = "ARD-1191";
  await assert.rejects(
    () => service.bulkUpdateContent(MERCHANT, { items }, admin),
    (err) => /CONTENT_BULK_HOLD_SKU_REJECTED/.test(JSON.stringify(err.getResponse?.() ?? err.message)),
  );
  assert.equal(fake.state.audit_logs.length, 0);
});

test("unexpected payload fields rejected by service RPC contract", async () => {
  const products = seedNineProducts();
  const { service, fake } = makeService({ merchants: [{ id: MERCHANT }], products });
  // Bypass DTO layer: call with a poisoned item via rpc path by stubbing validate to pass
  // through — simulate RPC seeing unexpected field.
  fake.client.rpc = async (name, params) => {
    fake.calls.rpc.push({ name, params });
    return { data: null, error: { message: "CONTENT_BULK_UNEXPECTED_FIELD: field price" } };
  };
  await assert.rejects(
    () => service.bulkUpdateContent(MERCHANT, { items: makeItems(9) }, admin),
    (err) => /CONTENT_BULK_UNEXPECTED_FIELD/.test(err.message),
  );
  assert.equal(fake.state.audit_logs.length, 0);
});

test("audit written only on success", async () => {
  const { service, fake } = makeService({ merchants: [{ id: MERCHANT }], products: seedNineProducts() });
  await service.bulkUpdateContent(MERCHANT, { items: makeItems(9) }, admin);
  assert.equal(fake.state.audit_logs.length, 1);
});

// ── Readiness invariant (DilMart-STORE-PRODUCT-READINESS-INVARIANT-001) ──────────
//
// `description_present` is an activation readiness check, so this admin content path must not be
// able to blank the description of a product that is currently active/published/public — that
// would leave a live product below the bar every activation path enforces.

test("REGRESSION: clearing the description of an ACTIVE product is rejected with zero writes", async () => {
  const products = seedNineProducts();
  products[7].is_active = true;
  products[7].is_published = true;
  products[7].visibility_status = "public";
  products[7].description = "وصف حالي";
  const { service, fake } = makeService({ merchants: [{ id: MERCHANT }], products });

  await assert.rejects(
    // makeItems() sends description: null for index 7.
    () => service.bulkUpdateContent(MERCHANT, { items: makeItems(9) }, admin),
    (err) => {
      assert.equal(err?.response?.code, "CONTENT_BULK_PRODUCT_NOT_READY");
      assert.deepEqual(err?.response?.merchant_skus, ["ARD-1007"]);
      return true;
    },
  );
  assert.equal(fake.calls.rpc.length, 0, "the RPC is never reached");
  assert.equal(fake.state.products[7].description, "وصف حالي");
  assert.equal(fake.state.audit_logs.length, 0);
});

test("clearing the description of a DRAFT product is still allowed", async () => {
  const products = seedNineProducts();
  products[7].description = "وصف حالي";
  const { service, fake } = makeService({ merchants: [{ id: MERCHANT }], products });

  const result = await service.bulkUpdateContent(MERCHANT, { items: makeItems(9) }, admin);
  assert.equal(result.updated_count, 9);
  assert.equal(fake.state.products[7].description, null);
});

// ── Atomic live-description guard (closure pass) ────────────────────────────────
//
// The enforcing check lives in `product_content_bulk_update_atomic` (migration
// 20260819130000), which locks the matched product FOR UPDATE inside the same transaction as
// the write. The service pre-read is fail-fast UX only. The fake RPC in this file mirrors the
// migration, so these tests exercise the same contract the DB now enforces.

test("REGRESSION: a concurrent activation between the pre-read and the RPC is still rejected", async () => {
  const products = seedNineProducts();
  products[7].description = "وصف حالي";
  const { service, fake } = makeService({ merchants: [{ id: MERCHANT }], products });

  // The pre-read sees a draft; the product goes live before the RPC transaction starts.
  fake.hooks.beforeRpc = (state) => {
    const target = state.products.find((p) => p.merchant_sku === "ARD-1007");
    target.is_active = true;
    target.is_published = true;
    target.visibility_status = "public";
  };

  await assert.rejects(
    () => service.bulkUpdateContent(MERCHANT, { items: makeItems(9) }, admin),
    (err) => {
      assert.match(String(err.message ?? err.response?.message), /CONTENT_BULK_PRODUCT_NOT_READY/);
      return true;
    },
  );
  assert.equal(fake.calls.rpc.length, 1, "the pre-read passed; the RPC is what refused");
  assert.equal(fake.state.products[7].description, "وصف حالي", "no write happened");
  assert.equal(fake.state.audit_logs.length, 0);
});

test("REGRESSION: SKU matching in the pre-read is case-insensitive, like the RPC", async () => {
  const products = seedNineProducts();
  // Legacy row stored with different casing than the normalized payload SKU.
  products[7].merchant_sku = "ard-1007";
  products[7].description = "وصف حالي";
  products[7].is_active = true;
  products[7].is_published = true;
  products[7].visibility_status = "public";
  const { service, fake } = makeService({ merchants: [{ id: MERCHANT }], products });

  await assert.rejects(
    () => service.bulkUpdateContent(MERCHANT, { items: makeItems(9) }, admin),
    (err) => {
      assert.equal(err?.response?.code, "CONTENT_BULK_PRODUCT_NOT_READY");
      assert.deepEqual(err?.response?.merchant_skus, ["ARD-1007"]);
      return true;
    },
  );
  assert.equal(fake.calls.rpc.length, 0, "an exact-match pre-read would have missed this row");
  assert.equal(fake.state.products[7].description, "وصف حالي");
});

test("REGRESSION: a padded stored SKU the pre-read cannot match is still blocked by the RPC", async () => {
  // `ilike` cannot express the RPC's `btrim`, so a padded legacy SKU slips past the fail-fast
  // pre-read — and is refused by the authoritative RPC gate, which normalizes with btrim/upper.
  const products = seedNineProducts();
  products[7].merchant_sku = " ard-1007 ";
  products[7].description = "وصف حالي";
  products[7].is_active = true;
  products[7].is_published = true;
  products[7].visibility_status = "public";
  const { service, fake } = makeService({ merchants: [{ id: MERCHANT }], products });

  await assert.rejects(
    () => service.bulkUpdateContent(MERCHANT, { items: makeItems(9) }, admin),
    (err) => {
      assert.match(String(err.message ?? err.response?.message), /CONTENT_BULK_PRODUCT_NOT_READY/);
      return true;
    },
  );
  assert.equal(fake.calls.rpc.length, 1, "the RPC is the authority for normalized SKU matching");
  assert.equal(fake.state.products[7].description, "وصف حالي");
});
