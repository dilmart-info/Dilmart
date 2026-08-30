/**
 * Product CSV import safety — DilMart-ARD-AL-KHALEEJ-VERTICAL-PILOT-10-001 (Gate 1, corrected
 * in Gate 2 to move Confirm behind the atomic `product_import_confirm_atomic` Postgres RPC).
 *
 * No network. The Supabase client, scope resolver, and audit sink are fakes, following the
 * same shape as `phone-identity-linking.test.mjs`: a minimal in-memory stand-in for the tables
 * `ProductImportService` actually touches (merchants, categories, products,
 * product_import_sessions, audit_logs).
 *
 * Preview/parsing/validation still run in real TS (`ProductImportService`) against this fake.
 * Confirm now delegates to `.rpc("product_import_confirm_atomic", ...)`; the fake Supabase
 * client's default `rpc()` implementation re-implements the same claim/validate/upsert/finalize
 * contract as the SQL migration (including "roll back to previewed on error", never "failed") so
 * that `ProductImportService`'s orchestration (defense-in-depth checks, error-code mapping, call
 * count) is exercised realistically. Genuine Postgres transaction/concurrency guarantees for the
 * real RPC are covered separately in `tests/db-integration/product-import-confirm-atomic.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const { ProductImportService } = await import("../dist/modules/products/product-import.service.js");
const { CategoriesService } = await import("../dist/modules/categories/categories.service.js");
const { isPubliclyListableProduct } = await import("../dist/modules/marketplace/public-product-visibility.js");
const { CategoryAssignErrors } = await import("../dist/modules/categories/category-assignability.js");

const MERCHANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MERCHANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CATEGORY_ID = "fc662e9f-ea22-454e-bb29-cdb7bf5ea90c";
const ALLOWED_IMAGE = "https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/oil.jpg";

const HEADER =
  "name,short_description,description,category,price,discount_price,stock,sku,brand,size,is_active,is_published,visibility_status,image_url";

/** Valid Arabic short description (≥40 chars) used as default in fixture rows. */
const VALID_SHORT =
  "عطر تجريبي بحجم مناسب بتركيبة واضحة للجنسين من علامة موثوقة ضمن نطاق الوصف المختصر المعتمد.";

function csvField(value) {
  const v = String(value ?? "");
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** Row fields, in HEADER order. Missing trailing fields default to "". */
function row({
  name = "",
  short_description = VALID_SHORT,
  description = "",
  category = "",
  price = "",
  discount_price = "",
  stock = "",
  sku = "",
  brand = "",
  size = "",
  is_active = "",
  is_published = "",
  visibility_status = "",
  image_url = "",
} = {}) {
  return [
    name,
    short_description,
    description,
    category,
    price,
    discount_price,
    stock,
    sku,
    brand,
    size,
    is_active,
    is_published,
    visibility_status,
    image_url,
  ]
    .map(csvField)
    .join(",");
}

function csv(rows, { bom = false, header = HEADER } = {}) {
  const text = [header, ...rows].join("\n");
  return Buffer.from((bom ? "\uFEFF" : "") + text, "utf-8");
}

// ── Fake Supabase (tables + a simulated product_import_confirm_atomic RPC) ─

function matchesFilters(record, filters) {
  return filters.every(([col, op, val]) => (op === "neq" ? record[col] !== val : record[col] === val));
}

/**
 * Default fake `.rpc("product_import_confirm_atomic", params)` — mirrors the contract of
 * `supabase/migrations/20260801190000_product_import_confirm_atomic.sql`:
 *  - one-time claim (previewed -> processing), else IMPORT_SESSION_CLAIM_FAILED / _NOT_FOUND / _EXPIRED
 *  - IMPORT_HAS_INVALID_ROWS blocks with zero writes
 *  - upserts every valid/warning row by (merchant_id, merchant_sku)
 *  - "transaction": all product/session/audit mutations are staged and only committed to `state`
 *    on success; any thrown error (including a test-injected `hooks.rpcBeforeRow` failure)
 *    discards the staged changes entirely — this is what makes "rolls back to previewed, not
 *    failed" observable in a plain in-memory fake, matching the real Postgres behavior.
 */
function defaultConfirmRpc(state, hooks, params) {
  const { p_import_id, p_merchant_id, p_actor_id, p_actor_role, p_write_audit } = params;
  const session = state.product_import_sessions.find((s) => s.id === p_import_id && s.merchant_id === p_merchant_id);

  if (!session) {
    return { data: null, error: { message: "IMPORT_SESSION_NOT_FOUND" } };
  }
  if (session.status !== "previewed") {
    return { data: null, error: { message: "IMPORT_SESSION_CLAIM_FAILED" } };
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return { data: null, error: { message: "IMPORT_SESSION_EXPIRED" } };
  }

  const payload = session.preview_payload ?? {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const hasInvalid = Number(session.invalid_rows ?? 0) > 0 || rows.some((r) => r.status === "invalid");
  if (hasInvalid) {
    return { data: null, error: { message: "IMPORT_HAS_INVALID_ROWS" } };
  }

  // Phase 2.5 defense-in-depth (mirrors SQL): validate every normalized row before writes.
  const seenSkus = new Set();
  const categories = state.categories || [];
  for (const r of rows) {
    const status = r.status ?? "";
    if (status !== "valid" && status !== "warning") {
      return { data: null, error: { message: `IMPORT_PAYLOAD_INTEGRITY_FAILED: row ${r.row_number} has unknown status ${status}` } };
    }
    const n = r.normalized ?? {};
    const sku = String(n.sku ?? "").trim().toUpperCase();
    if (!sku) return { data: null, error: { message: `IMPORT_PAYLOAD_INTEGRITY_FAILED: row ${r.row_number} has an empty sku` } };
    if (seenSkus.has(sku)) {
      return { data: null, error: { message: `IMPORT_PAYLOAD_INTEGRITY_FAILED: duplicate sku ${sku}` } };
    }
    seenSkus.add(sku);

    const short = String(n.short_description ?? "").trim();
    if (!short) {
      return { data: null, error: { message: `IMPORT_ROW_SHORT_DESCRIPTION_REQUIRED: row ${r.row_number} sku ${sku}` } };
    }
    if (/<\/?[a-z][^<>]*>/i.test(short)) {
      return { data: null, error: { message: `IMPORT_ROW_SHORT_DESCRIPTION_INVALID: row ${r.row_number} sku ${sku}` } };
    }
    const shortLen = [...short].length;
    if (shortLen < 40) {
      return { data: null, error: { message: `IMPORT_ROW_SHORT_DESCRIPTION_TOO_SHORT: row ${r.row_number} sku ${sku}` } };
    }
    if (shortLen > 280) {
      return { data: null, error: { message: `IMPORT_ROW_SHORT_DESCRIPTION_TOO_LONG: row ${r.row_number} sku ${sku}` } };
    }

    const categoryId = n.category_id || null;
    if (!categoryId) {
      return { data: null, error: { message: `IMPORT_ROW_INVALID_CATEGORY: row ${r.row_number} sku ${sku} has no category_id` } };
    }
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) {
      return { data: null, error: { message: `IMPORT_ROW_INVALID_CATEGORY: row ${r.row_number} sku ${sku} category_id ${categoryId} does not exist` } };
    }
    if (cat.is_active !== true) {
      return { data: null, error: { message: `IMPORT_ROW_INVALID_CATEGORY: row ${r.row_number} sku ${sku} category_id ${categoryId} is inactive` } };
    }
    const activeChildren = categories.filter((c) => c.parent_id === categoryId && c.is_active === true).length;
    if (activeChildren > 0) {
      return {
        data: null,
        error: {
          message: `IMPORT_ROW_INVALID_CATEGORY: row ${r.row_number} sku ${sku} category_id ${categoryId} is a parent with active children`,
        },
      };
    }
  }

  // Stage changes on working copies; only commit to `state` if the whole batch succeeds.
  const workingProducts = state.products.map((p) => ({ ...p }));
  const validRows = rows.filter((r) => r.status === "valid" || r.status === "warning");
  const report = { total: rows.length, created: 0, updated: 0, skipped: rows.length - validRows.length, failed: 0, errors: [], rows: [] };

  try {
    for (const r of validRows) {
      if (hooks.rpcBeforeRow) hooks.rpcBeforeRow(r, workingProducts);
      const n = r.normalized;
      const sku = String(n.sku ?? "").toUpperCase();
      const existingIdx = workingProducts.findIndex((p) => p.merchant_id === p_merchant_id && p.merchant_sku === sku);
      const fields = {
        name: n.name,
        short_description: n.short_description ?? null,
        description: n.description ?? "",
        category_id: n.category_id || null,
        price: Number(n.price ?? 0),
        discount_price: n.discount_price ?? null,
        stock: Number.isInteger(Number(n.stock)) ? Number(n.stock) : 0,
        brand: n.brand ?? null,
        sizes: Array.isArray(n.sizes) ? n.sizes : [],
        is_active: Boolean(n.is_active),
        is_published: Boolean(n.is_published),
        visibility_status: n.visibility_status ?? "private",
        images: n.image_url ? [n.image_url] : [],
        merchant_sku: sku,
      };
      if (existingIdx !== -1) {
        // Never touch slug on update.
        workingProducts[existingIdx] = { ...workingProducts[existingIdx], ...fields };
        report.updated += 1;
        report.rows.push({ row_number: r.row_number, sku, action: "updated", product_id: workingProducts[existingIdx].id });
      } else {
        const id = randomUUID();
        workingProducts.push({
          id,
          merchant_id: p_merchant_id,
          slug: n.slug,
          purchase_price: 0,
          low_stock_threshold: 5,
          is_featured: false,
          is_new: false,
          is_best_seller: false,
          loyalty_points_enabled: false,
          ...fields,
        });
        report.created += 1;
        report.rows.push({ row_number: r.row_number, sku, action: "created", product_id: id });
      }
    }
  } catch (error) {
    // Simulated ROLLBACK: nothing staged survives, including the claim — session stays
    // 'previewed' (matches the real migration's documented design; never 'failed').
    return { data: null, error: { message: error?.message ?? "IMPORT_ROW_FAILED" } };
  }

  // Commit.
  state.products.length = 0;
  state.products.push(...workingProducts);
  session.status = "confirmed";
  session.confirmed_at = new Date().toISOString();
  session.preview_payload = { ...payload, confirm_result: report };

  if (p_write_audit && p_actor_id && p_actor_role) {
    state.audit_logs = state.audit_logs || [];
    state.audit_logs.push({
      event_type: "ADMIN_ACTION",
      actor_id: p_actor_id,
      actor_role: p_actor_role,
      merchant_id: p_merchant_id,
      resource_type: "product_import_session",
      resource_id: p_import_id,
      payload: {
        merchant_id: p_merchant_id,
        import_session_id: p_import_id,
        totals: { total: report.total, created: report.created, updated: report.updated, skipped: report.skipped, failed: report.failed },
      },
    });
  }

  return { data: report, error: null };
}

function createFakeSupabase(seed = {}) {
  const state = {
    merchants: (seed.merchants ?? []).map((r) => ({ ...r })),
    categories: (seed.categories ?? []).map((r) => ({ ...r })),
    products: (seed.products ?? []).map((r) => ({ ...r })),
    product_import_sessions: (seed.product_import_sessions ?? []).map((r) => ({ ...r })),
    audit_logs: [],
  };

  const hooks = { beforeInsert: null, beforeUpdate: null, beforeDelete: null, rpcBeforeRow: null, rpcOverride: null };
  const calls = { inserts: [], updates: [], deletes: [], rpc: [] };

  function builder(table) {
    if (!state[table]) state[table] = [];
    const filters = [];
    let pendingOp = null;
    let wantSingle = false;
    let wantMaybeSingle = false;
    let wantCount = false;

    async function execute() {
      if (pendingOp?.type === "insert") {
        calls.inserts.push({ table, payload: pendingOp.payload });
        if (hooks.beforeInsert) {
          const override = hooks.beforeInsert(table, pendingOp.payload, calls.inserts.filter((c) => c.table === table).length);
          if (override) return override;
        }
        const record = { id: pendingOp.payload.id ?? randomUUID(), created_at: new Date().toISOString(), ...pendingOp.payload };
        state[table].push(record);
        return { data: wantSingle || wantMaybeSingle ? { ...record } : [{ ...record }], error: null };
      }

      if (pendingOp?.type === "update") {
        const matched = state[table].filter((r) => matchesFilters(r, filters));
        calls.updates.push({ table, payload: pendingOp.payload, matchedIds: matched.map((r) => r.id) });
        if (hooks.beforeUpdate) {
          const override = hooks.beforeUpdate(table, pendingOp.payload, matched, calls.updates.filter((c) => c.table === table).length);
          if (override) return override;
        }
        for (const r of matched) Object.assign(r, pendingOp.payload);
        return { data: null, error: null };
      }

      if (pendingOp?.type === "delete") {
        calls.deletes.push({ table, filters: [...filters] });
        if (hooks.beforeDelete) {
          const override = hooks.beforeDelete(table, filters, calls.deletes.filter((c) => c.table === table).length);
          if (override) return override;
        }
        state[table] = state[table].filter((r) => !matchesFilters(r, filters));
        return { data: null, error: null };
      }

      // select
      const matched = state[table].filter((r) => matchesFilters(r, filters));
      if (wantCount) {
        return { data: null, error: null, count: matched.length };
      }
      if (wantSingle) {
        return matched.length ? { data: { ...matched[0] }, error: null } : { data: null, error: { message: "no rows found" } };
      }
      if (wantMaybeSingle) {
        return { data: matched[0] ? { ...matched[0] } : null, error: null };
      }
      return { data: matched.map((r) => ({ ...r })), error: null };
    }

    const api = {
      select(_cols, opts) {
        if (opts?.count === "exact" && opts?.head) wantCount = true;
        return api;
      },
      eq(col, val) {
        filters.push([col, "eq", val]);
        return api;
      },
      neq(col, val) {
        filters.push([col, "neq", val]);
        return api;
      },
      insert(payload) {
        pendingOp = { type: "insert", payload };
        return api;
      },
      update(payload) {
        pendingOp = { type: "update", payload };
        return api;
      },
      delete() {
        pendingOp = { type: "delete" };
        return api;
      },
      maybeSingle() {
        wantMaybeSingle = true;
        return execute();
      },
      single() {
        wantSingle = true;
        return execute();
      },
      then(resolve, reject) {
        return execute().then(resolve, reject);
      },
    };
    return api;
  }

  async function rpc(name, params) {
    calls.rpc.push({ name, params });
    if (hooks.rpcOverride) return hooks.rpcOverride(name, params, state);
    if (name === "product_import_confirm_atomic") return defaultConfirmRpc(state, hooks, params);
    return { data: null, error: { message: `Unknown RPC: ${name}` } };
  }

  return { client: { from: (table) => builder(table), rpc }, state, hooks, calls };
}

function fakeScopeResolver(merchantId) {
  return {
    async resolveMerchantScope(requestedMerchantId, actorRole) {
      if (actorRole === "super_admin" || actorRole === "admin") return requestedMerchantId;
      return merchantId;
    },
  };
}

function makeService({ merchants = [], categories = [], products = [], sessions = [], merchantId = MERCHANT_A } = {}) {
  const fake = createFakeSupabase({ merchants, categories, products, product_import_sessions: sessions });
  const supabaseAdmin = { client: fake.client };
  const scopeResolver = fakeScopeResolver(merchantId);
  const auditEntries = [];
  const auditService = { log: async (entry) => auditEntries.push(entry) };
  const categoriesService = new CategoriesService(supabaseAdmin);
  const service = new ProductImportService(supabaseAdmin, scopeResolver, auditService, categoriesService);
  return { service, fake, auditEntries, categoriesService };
}

const defaultCategories = [{ id: CATEGORY_ID, name: "Hair Care", slug: "hair-care", parent_id: null, is_active: true }];
const FRAG_ROOT = CATEGORY_ID;
const PERFUMES_LEAF = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const hierarchicalCategories = [
  { id: FRAG_ROOT, name: "العطور والمعطرات", slug: "fragrances-and-scents", parent_id: null, is_active: true },
  { id: PERFUMES_LEAF, name: "العطور", slug: "perfumes", parent_id: FRAG_ROOT, is_active: true },
];
const activeMerchant = (id = MERCHANT_A) => ({ id, status: "active" });
const draftMerchant = (id = MERCHANT_A) => ({ id, status: "draft" });

const merchantActor = { actor_role: "merchant_owner", actor_id: "merchant-user-1" };
const adminActor = { actor_role: "super_admin", actor_id: ADMIN_ID };

// ── 1. BOM header ────────────────────────────────────────────────────────

test("a UTF-8 BOM before the header does not break parsing", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([row({ name: "زيت أرغان", category: "Hair Care", price: "10", sku: "OIL-1" })], { bom: true });

  const preview = await service.previewForMerchant(file, "products.csv", merchantActor);
  assert.equal(preview.summary.total_rows, 1);
  assert.equal(preview.summary.valid_rows, 1);
  assert.equal(preview.summary.invalid_rows, 0);
});

// ── 2. Missing SKU invalid ───────────────────────────────────────────────

test("a blank SKU makes the row invalid", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([row({ name: "منتج بدون SKU", category: "Hair Care", price: "10", sku: "" })]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "invalid");
  assert.ok(preview.rows[0].errors.some((e) => e.toLowerCase().includes("sku")));
});

// ── 3. Duplicate SKU in file invalid ─────────────────────────────────────

test("a SKU repeated within the same file is invalid on the second occurrence", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([
    row({ name: "منتج أول", category: "Hair Care", price: "10", sku: "DUP-1" }),
    row({ name: "منتج ثاني", category: "Hair Care", price: "12", sku: "dup-1" }), // same after normalization
  ]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "valid");
  assert.equal(preview.rows[1].status, "invalid");
  assert.ok(preview.rows[1].errors.some((e) => e.toLowerCase().includes("duplicate")));
});

// ── 4. Re-import same SKU → update, not create ──────────────────────────

test("importing the same SKU twice updates the existing product instead of creating a duplicate", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });

  const file1 = csv([row({ name: "شامبو الأرغان", category: "Hair Care", price: "10", stock: "5", sku: "SH-1" })]);
  const preview1 = await service.previewForMerchant(file1, "f.csv", merchantActor);
  const confirm1 = await service.confirmForMerchant(preview1.import_id, merchantActor);
  assert.equal(confirm1.created, 1);
  assert.equal(confirm1.updated, 0);
  assert.equal(fake.state.products.length, 1);
  const firstId = fake.state.products[0].id;
  const firstSlug = fake.state.products[0].slug;

  const file2 = csv([row({ name: "شامبو الأرغان", category: "Hair Care", price: "15", stock: "9", sku: "sh-1" })]);
  const preview2 = await service.previewForMerchant(file2, "f.csv", merchantActor);
  const confirm2 = await service.confirmForMerchant(preview2.import_id, merchantActor);

  assert.equal(confirm2.created, 0);
  assert.equal(confirm2.updated, 1);
  assert.equal(fake.state.products.length, 1, "no duplicate product row was created");
  assert.equal(fake.state.products[0].id, firstId);
  assert.equal(fake.state.products[0].slug, firstSlug, "slug never changes on re-import of the same SKU");
  assert.equal(Number(fake.state.products[0].price), 15);
  assert.equal(Number(fake.state.products[0].stock), 9);
  assert.equal(fake.calls.rpc.length, 2, "confirm calls the atomic RPC exactly once per confirm");
});

// ── 5. Defaults: inactive / unpublished / private / stock 0 ─────────────

test("blank is_active/is_published/visibility_status/stock default to false/false/private/0", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([row({ name: "منتج افتراضي", category: "Hair Care", price: "20", sku: "DEF-1" })]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  const normalized = preview.rows[0].normalized;
  assert.equal(normalized.is_active, false);
  assert.equal(normalized.is_published, false);
  assert.equal(normalized.visibility_status, "private");
  assert.equal(normalized.stock, 0);

  await service.confirmForMerchant(preview.import_id, merchantActor);
  const created = fake.state.products[0];
  assert.equal(created.is_active, false);
  assert.equal(created.is_published, false);
  assert.equal(created.visibility_status, "private");
  assert.equal(created.stock, 0);
});

// ── 6. Brand + size import ───────────────────────────────────────────────

test("brand maps to products.brand and size maps to a products.sizes array", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([
    row({ name: "زيت الشعر", category: "Hair Care", price: "10", sku: "SIZE-1", brand: "Loreal", size: "100 مل, 200 مل" }),
  ]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.deepEqual(preview.rows[0].normalized.sizes, ["100 مل", "200 مل"]);
  assert.equal(preview.rows[0].normalized.brand, "Loreal");

  await service.confirmForMerchant(preview.import_id, merchantActor);
  const created = fake.state.products[0];
  assert.equal(created.brand, "Loreal");
  assert.deepEqual(created.sizes, ["100 مل", "200 مل"]);
});

// ── 7. Invalid category ───────────────────────────────────────────────────

test("a category that does not match any known category/name/slug/id is invalid", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([row({ name: "منتج بقسم خاطئ", category: "Not A Real Category", price: "10", sku: "CAT-1" })]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "invalid");
  assert.ok(preview.rows[0].errors.some((e) => e.toLowerCase().includes("category")));
});

// ── 8. Invalid image domain ───────────────────────────────────────────────

test("an image_url outside the allowed Supabase Storage prefix is rejected", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([
    row({
      name: "منتج بصورة خاطئة",
      category: "Hair Care",
      price: "10",
      sku: "IMG-1",
      image_url: "https://res.cloudinary.com/nooncdn/image/upload/oil.jpg",
    }),
  ]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "invalid");
  assert.ok(preview.rows[0].errors.some((e) => e.includes("image_url")));
});

test("an image_url under the allowed Supabase Storage prefix is accepted", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([row({ name: "منتج بصورة صحيحة", category: "Hair Care", price: "10", sku: "IMG-2", image_url: ALLOWED_IMAGE })]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "valid");
  assert.equal(preview.rows[0].normalized.image_url, ALLOWED_IMAGE);
});

// ── 9. Discount semantics ─────────────────────────────────────────────────

test("compare_at_price is parsed for back-compat but never written into discount_price", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const header =
    "name,short_description,description,category,price,compare_at_price,stock,sku,brand,size,is_active,is_published,visibility_status,image_url";
  const file = csv(
    [
      [
        csvField("منتج قديم القالب"),
        csvField(VALID_SHORT),
        csvField(""),
        csvField("Hair Care"),
        csvField("50"),
        csvField("40"), // legacy compare_at_price column — must be ignored for discount_price
        csvField(""),
        csvField("LEGACY-1"),
        csvField(""),
        csvField(""),
        csvField(""),
        csvField(""),
        csvField(""),
        csvField(""),
      ].join(","),
    ],
    { header },
  );

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "warning");
  assert.equal(preview.rows[0].normalized.discount_price, null, "discount_price must stay null when only compare_at_price is present");
  assert.equal(preview.rows[0].normalized.legacy_compare_at_price, 40);

  await service.confirmForMerchant(preview.import_id, merchantActor);
  assert.equal(fake.state.products[0].discount_price, null);
});

test("discount_price must be > 0 and strictly less than price", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([
    row({ name: "خصم غير صالح", category: "Hair Care", price: "10", discount_price: "10", sku: "DISC-1" }),
    row({ name: "خصم صالح", category: "Hair Care", price: "10", discount_price: "8", sku: "DISC-2" }),
  ]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "invalid");
  assert.ok(preview.rows[0].errors.some((e) => e.includes("discount_price")));
  assert.equal(preview.rows[1].status, "valid");
  assert.equal(preview.rows[1].normalized.discount_price, 8);
});

// ── 10. Stable slug ends with sku ────────────────────────────────────────

test("the generated slug is stable, computed at preview time, and ends with the normalized SKU", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([row({ name: "زيت الأركان الفاخر", category: "Hair Care", price: "30", sku: "OIL-100" })]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.ok(preview.rows[0].normalized.slug.endsWith("oil-100"), "slug is already computed in the preview payload");

  await service.confirmForMerchant(preview.import_id, merchantActor);
  const created = fake.state.products[0];
  assert.ok(created.slug.endsWith("oil-100"), `slug "${created.slug}" should end with the sku`);
});

// ── 11. No cross-merchant updates ────────────────────────────────────────

test("a matching SKU on a different merchant is never updated by another merchant's import", async () => {
  const otherMerchantProduct = {
    id: randomUUID(),
    merchant_id: MERCHANT_B,
    merchant_sku: "SHARED-1",
    name: "منتج التاجر الآخر",
    slug: "other-merchant-shared-1",
    price: 99,
    stock: 3,
  };
  const { service, fake } = makeService({
    merchants: [activeMerchant(MERCHANT_A), activeMerchant(MERCHANT_B)],
    categories: defaultCategories,
    products: [otherMerchantProduct],
    merchantId: MERCHANT_A,
  });

  const file = csv([row({ name: "منتج التاجر أ", category: "Hair Care", price: "20", sku: "shared-1" })]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  const report = await service.confirmForMerchant(preview.import_id, merchantActor);

  assert.equal(report.created, 1, "creates a new row for merchant A instead of touching merchant B's row");
  assert.equal(fake.state.products.length, 2);

  const merchantBRow = fake.state.products.find((p) => p.merchant_id === MERCHANT_B);
  assert.deepEqual(merchantBRow, otherMerchantProduct, "merchant B's product is completely untouched");

  const merchantARow = fake.state.products.find((p) => p.merchant_id === MERCHANT_A);
  assert.ok(merchantARow);
  assert.equal(merchantARow.id !== otherMerchantProduct.id, true);
});

// ── 12. Atomic rollback on mid-batch failure (RPC transaction semantics) ─

test("a failure partway through confirm rolls back every write in that batch, and the session stays retryable", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([
    row({ name: "منتج ناجح أول", category: "Hair Care", price: "10", sku: "ROW-1" }),
    row({ name: "منتج يفشل", category: "Hair Care", price: "10", sku: "ROW-2" }),
    row({ name: "منتج لن يصل إليه الدور", category: "Hair Care", price: "10", sku: "ROW-3" }),
  ]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.summary.valid_rows, 3);

  let rowsProcessed = 0;
  fake.hooks.rpcBeforeRow = () => {
    rowsProcessed += 1;
    if (rowsProcessed === 2) {
      throw new Error("SIMULATED_ROW_FAILURE");
    }
  };

  await assert.rejects(() => service.confirmForMerchant(preview.import_id, merchantActor));
  assert.equal(fake.state.products.length, 0, "no product survives a rolled-back batch — not even row 1's");

  const session = fake.state.product_import_sessions.find((s) => s.id === preview.import_id);
  assert.equal(
    session.status,
    "previewed",
    "design choice: Postgres cannot durably mark 'failed' AND roll back writes in the same " +
      "transaction, so a failed confirm leaves the session exactly as it was — 'previewed' — safe to retry",
  );

  // Retry after "fixing" the transient failure must succeed cleanly (this is the entire point
  // of leaving the session retryable instead of poisoning it as 'failed').
  fake.hooks.rpcBeforeRow = null;
  const retryReport = await service.confirmForMerchant(preview.import_id, merchantActor);
  assert.equal(retryReport.created, 3);
  assert.equal(fake.state.products.length, 3);
});

// ── 13. Admin path: merchant need not be active, and is never activated ─

test("admin import works for a draft merchant, never changes merchant status, and audits inside the same RPC", async () => {
  const { service, fake, auditEntries } = makeService({ merchants: [draftMerchant(MERCHANT_A)], categories: defaultCategories });

  const file = csv([row({ name: "منتج تجريبي", category: "Hair Care", price: "10", sku: "PILOT-1" })]);
  const preview = await service.previewForAdmin(MERCHANT_A, file, "f.csv", adminActor);
  assert.equal(preview.summary.valid_rows, 1);

  const report = await service.confirmForAdmin(MERCHANT_A, preview.import_id, adminActor);
  assert.equal(report.created, 1);

  const merchant = fake.state.merchants.find((m) => m.id === MERCHANT_A);
  assert.equal(merchant.status, "draft", "importing a catalog must never activate the merchant");

  // Audit now happens INSIDE the atomic RPC transaction (p_write_audit=true for admin confirms),
  // not via a separate TS-side AuditService.log() call — so the old audit sink stays empty...
  assert.equal(auditEntries.length, 0, "confirm no longer calls AuditService directly — the RPC writes the audit row itself");
  // ...and the fake's simulated audit_logs table (written by the RPC-equivalent) has exactly one row.
  assert.equal(fake.state.audit_logs.length, 1);
  assert.equal(fake.state.audit_logs[0].event_type, "ADMIN_ACTION");
  assert.equal(fake.state.audit_logs[0].resource_type, "product_import_session");
  assert.equal(fake.state.audit_logs[0].merchant_id, MERCHANT_A);
  assert.equal(fake.state.audit_logs[0].actor_id, ADMIN_ID);

  const rpcCall = fake.calls.rpc.find((c) => c.name === "product_import_confirm_atomic");
  assert.equal(rpcCall.params.p_write_audit, true, "admin confirm passes p_write_audit=true");
});

test("merchant self-service confirm passes p_write_audit=false", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([row({ name: "منتج", category: "Hair Care", price: "10", sku: "NOAUDIT-1" })]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  await service.confirmForMerchant(preview.import_id, merchantActor);

  const rpcCall = fake.calls.rpc.find((c) => c.name === "product_import_confirm_atomic");
  assert.equal(rpcCall.params.p_write_audit, false);
  assert.equal(fake.state.audit_logs.length, 0);
});

test("a non-admin actor cannot use the admin import path", async () => {
  const { service } = makeService({ merchants: [draftMerchant(MERCHANT_A)], categories: defaultCategories });
  const file = csv([row({ name: "x", category: "Hair Care", price: "10", sku: "X-1" })]);
  await assert.rejects(
    () => service.previewForAdmin(MERCHANT_A, file, "f.csv", merchantActor),
    (err) => err.getStatus() === 403,
  );
});

// ── 13.x Second-review: strict CSV parsing (column count, headers) ──────

test("a data row with MORE fields than the header is rejected", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const okRow = row({ name: "منتج بأعمدة زائدة", category: "Hair Care", price: "10", sku: "EXTRACOL-1" });
  const file = Buffer.from(`${HEADER}\n${okRow},unexpected-extra-value\n`, "utf-8");

  await assert.rejects(
    () => service.previewForMerchant(file, "f.csv", merchantActor),
    // Rejected directly by csv-parse itself (relax_column_count: false) before our own explicit
    // row-length check ever runs — both are strict, this just documents which one fires first.
    (err) => err.getStatus() === 400 && /record length|column/i.test(err.message),
  );
});

test("a data row with FEWER fields than the header is rejected", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  // HEADER has 14 columns; this row only supplies 4.
  const file = Buffer.from(`${HEADER}\nمنتج ناقص,,Hair Care,10\n`, "utf-8");

  await assert.rejects(
    () => service.previewForMerchant(file, "f.csv", merchantActor),
    (err) => err.getStatus() === 400 && /record length|column/i.test(err.message),
  );
});

test("a header row with a duplicate column name is rejected", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const dupHeader =
    "name,short_description,description,category,price,discount_price,stock,sku,brand,size,is_active,is_published,visibility_status,name";
  const file = csv([row({ name: "منتج", category: "Hair Care", price: "10", sku: "DUPH-1" })], { header: dupHeader });

  await assert.rejects(
    () => service.previewForMerchant(file, "f.csv", merchantActor),
    (err) => err.getStatus() === 400 && /duplicate/i.test(err.message) && /name/.test(err.message),
  );
});

test("a header row with a blank column name is rejected", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const blankHeader =
    "name,short_description,description,category,price,discount_price,stock,sku,brand,size,is_active,is_published,visibility_status,";
  const file = csv([row({ name: "منتج", category: "Hair Care", price: "10", sku: "BLANKH-1" })], { header: blankHeader });

  await assert.rejects(
    () => service.previewForMerchant(file, "f.csv", merchantActor),
    (err) => err.getStatus() === 400 && /blank/i.test(err.message),
  );
});

test("a header row with an unrecognized (not in the known-columns allowlist) column name is rejected", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const unknownHeader =
    "name,short_description,description,category,price,discount_price,stock,sku,brand,size,is_active,is_published,visibility_status,weight_kg";
  const file = csv([row({ name: "منتج", category: "Hair Care", price: "10", sku: "UNKH-1" })], { header: unknownHeader });

  await assert.rejects(
    () => service.previewForMerchant(file, "f.csv", merchantActor),
    (err) => err.getStatus() === 400 && /unknown column/i.test(err.message) && /weight_kg/.test(err.message),
  );
});

test("compare_at_price remains an accepted legacy-optional header (not rejected by the strict allowlist)", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const header =
    "name,short_description,description,category,price,compare_at_price,stock,sku,brand,size,is_active,is_published,visibility_status,image_url";
  // Row aligned to this header (no discount_price column; compare_at_price instead).
  const legacyRow = [
    csvField("منتج قديم القالب"),
    csvField(VALID_SHORT),
    csvField(""),
    csvField("Hair Care"),
    csvField("10"),
    csvField(""),
    csvField(""),
    csvField("LEGACY-2"),
    csvField(""),
    csvField(""),
    csvField(""),
    csvField(""),
    csvField(""),
    csvField(""),
  ].join(",");
  const file = csv([legacyRow], { header });

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "valid");
});

// ── 13.y Second-review: draft-merchant admin import cannot sneak publish flags ──

test("admin import for a DRAFT merchant rejects (as invalid) a row that tries is_active=true", async () => {
  const { service } = makeService({ merchants: [draftMerchant(MERCHANT_A)], categories: defaultCategories });
  const file = csv([row({ name: "منتج نشط في تاجر مسودة", category: "Hair Care", price: "10", sku: "DRAFT-ACT-1", is_active: "true" })]);

  const preview = await service.previewForAdmin(MERCHANT_A, file, "f.csv", adminActor);
  assert.equal(preview.rows[0].status, "invalid");
  assert.ok(preview.rows[0].errors.some((e) => e.toLowerCase().includes("not active")));
});

test("admin import for a DRAFT merchant rejects (as invalid) a row that tries is_published=true", async () => {
  const { service } = makeService({ merchants: [draftMerchant(MERCHANT_A)], categories: defaultCategories });
  const file = csv([
    row({ name: "منتج منشور في تاجر مسودة", category: "Hair Care", price: "10", sku: "DRAFT-PUB-1", is_published: "true" }),
  ]);

  const preview = await service.previewForAdmin(MERCHANT_A, file, "f.csv", adminActor);
  assert.equal(preview.rows[0].status, "invalid");
  assert.ok(preview.rows[0].errors.some((e) => e.toLowerCase().includes("not active")));
});

test("admin import for a DRAFT merchant rejects (as invalid) a row that tries visibility_status=public", async () => {
  const { service } = makeService({ merchants: [draftMerchant(MERCHANT_A)], categories: defaultCategories });
  const file = csv([
    row({ name: "منتج عام في تاجر مسودة", category: "Hair Care", price: "10", sku: "DRAFT-VIS-1", visibility_status: "public" }),
  ]);

  const preview = await service.previewForAdmin(MERCHANT_A, file, "f.csv", adminActor);
  assert.equal(preview.rows[0].status, "invalid");
  assert.ok(preview.rows[0].errors.some((e) => e.toLowerCase().includes("not active")));
});

test("admin import for a DRAFT merchant still accepts a row that keeps the safe private/unpublished/inactive defaults", async () => {
  const { service, fake } = makeService({ merchants: [draftMerchant(MERCHANT_A)], categories: defaultCategories });
  const file = csv([row({ name: "منتج آمن في تاجر مسودة", category: "Hair Care", price: "10", sku: "DRAFT-OK-1" })]);

  const preview = await service.previewForAdmin(MERCHANT_A, file, "f.csv", adminActor);
  assert.equal(preview.rows[0].status, "valid");

  const report = await service.confirmForAdmin(MERCHANT_A, preview.import_id, adminActor);
  assert.equal(report.created, 1);
  assert.equal(fake.state.products[0].is_active, false);
  assert.equal(fake.state.products[0].is_published, false);
  assert.equal(fake.state.products[0].visibility_status, "private");
});

test("admin import for an ACTIVE merchant is unaffected by the draft-merchant safety check", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant(MERCHANT_A)], categories: defaultCategories });
  // description + image_url are present because a row that asks to be published must satisfy the
  // same readiness rules as any other activation path (see the readiness section below); this
  // test is about the draft-merchant check, not readiness.
  const file = csv([
    row({ name: "منتج نشط في تاجر فعّال", description: "وصف تفصيلي للمنتج", image_url: ALLOWED_IMAGE, category: "Hair Care", price: "10", sku: "ADMIN-ACTIVE-1", is_active: "true", is_published: "true", visibility_status: "public" }),
  ]);

  const preview = await service.previewForAdmin(MERCHANT_A, file, "f.csv", adminActor);
  assert.equal(preview.rows[0].status, "valid", "an active merchant's CSV rows are not subject to the draft-safety rejection");

  const report = await service.confirmForAdmin(MERCHANT_A, preview.import_id, adminActor);
  assert.equal(report.created, 1);
  assert.equal(fake.state.products[0].is_active, true);
  assert.equal(fake.state.products[0].is_published, true);
  assert.equal(fake.state.products[0].visibility_status, "public");
});

// ── 13.z Readiness invariant: import cannot publish an unready row ──────
//
// DilMart-STORE-PRODUCT-READINESS-INVARIANT-001 — a CSV row that asks to be
// active/published/public must satisfy exactly the same readiness rules ProductsService
// enforces on create/update/status/quick-add/bulk-activate. Rows that stay at the safe
// inactive/unpublished/private defaults are unaffected.

test("REGRESSION: an active-merchant row asking is_active=true without an image is invalid", async () => {
  const { service } = makeService({ merchants: [activeMerchant(MERCHANT_A)], categories: defaultCategories });
  const file = csv([
    row({ name: "منتج بلا صورة", description: "وصف تفصيلي للمنتج", category: "Hair Care", price: "10", sku: "READY-NOIMG-1", is_active: "true" }),
  ]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "invalid");
  assert.ok(preview.rows[0].errors.some((e) => e.includes("PRODUCT_NOT_READY") && e.includes("image_present")));
});

test("REGRESSION: an active-merchant row asking is_active=true without a description is invalid", async () => {
  const { service } = makeService({ merchants: [activeMerchant(MERCHANT_A)], categories: defaultCategories });
  const file = csv([
    row({ name: "منتج بلا وصف", image_url: ALLOWED_IMAGE, category: "Hair Care", price: "10", sku: "READY-NODESC-1", is_active: "true" }),
  ]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "invalid");
  assert.ok(preview.rows[0].errors.some((e) => e.includes("PRODUCT_NOT_READY") && e.includes("description_present")));
});

test("REGRESSION: is_published=true / visibility_status=public without is_active=true is invalid", async () => {
  const { service } = makeService({ merchants: [activeMerchant(MERCHANT_A)], categories: defaultCategories });
  const file = csv([
    row({
      name: "منتج منشور غير مفعل",
      description: "وصف تفصيلي للمنتج",
      image_url: ALLOWED_IMAGE,
      category: "Hair Care",
      price: "10",
      sku: "READY-INCONSISTENT-1",
      is_published: "true",
      visibility_status: "public",
    }),
  ]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "invalid");
  assert.ok(preview.rows[0].errors.some((e) => e.includes("require is_active=true")));
});

test("an unready row that keeps the safe inactive/private defaults stays valid and imports as a draft", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant(MERCHANT_A)], categories: defaultCategories });
  const file = csv([row({ name: "منتج مسودة", category: "Hair Care", price: "10", sku: "READY-DRAFT-1" })]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "valid");

  const report = await service.confirmForMerchant(preview.import_id, merchantActor);
  assert.equal(report.created, 1);
  assert.equal(fake.state.products[0].is_active, false);
  assert.equal(fake.state.products[0].is_published, false);
  assert.equal(fake.state.products[0].visibility_status, "private");
});

test("a fully ready row may import as active/published/public", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant(MERCHANT_A)], categories: defaultCategories });
  const file = csv([
    row({
      name: "منتج جاهز بالكامل",
      description: "وصف تفصيلي للمنتج الجاهز",
      image_url: ALLOWED_IMAGE,
      category: "Hair Care",
      price: "10",
      stock: "4",
      sku: "READY-FULL-1",
      is_active: "true",
      is_published: "true",
      visibility_status: "public",
    }),
  ]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "valid");

  const report = await service.confirmForMerchant(preview.import_id, merchantActor);
  assert.equal(report.created, 1);
  assert.equal(fake.state.products[0].is_active, true);
  assert.equal(fake.state.products[0].is_published, true);
  assert.equal(fake.state.products[0].visibility_status, "public");
});

test("REGRESSION: an active row with visibility_status=archived is invalid at preview (matches the confirm RPC)", async () => {
  const { service } = makeService({ merchants: [activeMerchant(MERCHANT_A)], categories: defaultCategories });
  const file = csv([
    row({
      name: "منتج مؤرشف ومفعل",
      description: "وصف تفصيلي للمنتج",
      image_url: ALLOWED_IMAGE,
      category: "Hair Care",
      price: "10",
      sku: "READY-ARCHIVED-1",
      is_active: "true",
      visibility_status: "archived",
    }),
  ]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "invalid");
  assert.ok(preview.rows[0].errors.some((e) => e.includes("archived")));
  // The confirm RPC raises IMPORT_ROW_NOT_READY for the same combination, so preview and confirm
  // now agree instead of a "valid" preview that can never be confirmed.
  await assert.rejects(
    () => service.confirmForMerchant(preview.import_id, merchantActor),
    (err) => /invalid rows/i.test(String(err.message ?? err.response?.message)),
  );
});

test("an inactive archived row still previews as valid and imports as archived", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant(MERCHANT_A)], categories: defaultCategories });
  const file = csv([
    row({
      name: "منتج مؤرشف",
      category: "Hair Care",
      price: "10",
      sku: "READY-ARCHIVED-2",
      visibility_status: "archived",
    }),
  ]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "valid");

  const report = await service.confirmForMerchant(preview.import_id, merchantActor);
  assert.equal(report.created, 1);
  assert.equal(fake.state.products[0].is_active, false);
  assert.equal(fake.state.products[0].is_published, false);
  assert.equal(fake.state.products[0].visibility_status, "archived");
});

// ── 14. Helper: triple-state public visibility ──────────────────────────

test("isPubliclyListableProduct requires active + published + public, nothing less", () => {
  assert.equal(
    isPubliclyListableProduct({ is_active: false, is_published: false, visibility_status: "private" }),
    false,
    "the Gate 1 import default (private/unpublished/inactive) must never be publicly listable",
  );
  assert.equal(isPubliclyListableProduct({ is_active: true, is_published: true, visibility_status: "public" }), true);
  assert.equal(isPubliclyListableProduct({ is_active: true, is_published: false, visibility_status: "public" }), false);
  assert.equal(isPubliclyListableProduct({ is_active: true, is_published: true, visibility_status: "private" }), false);
  assert.equal(isPubliclyListableProduct({ is_active: true, is_published: true, visibility_status: "archived" }), false);
  assert.equal(isPubliclyListableProduct({}), false);
});

// ── Bonus: merchant scoping / expiry guards ──────────────────────────────

test("a merchant actor cannot preview/confirm import for an inactive merchant", async () => {
  const { service } = makeService({ merchants: [{ id: MERCHANT_A, status: "pending_review" }], categories: defaultCategories });
  const file = csv([row({ name: "x", category: "Hair Care", price: "10", sku: "X-1" })]);
  await assert.rejects(() => service.previewForMerchant(file, "f.csv", merchantActor), (err) => err.getStatus() === 403);
});

test("an expired session cannot be confirmed, and is labelled 'expired' by the caller after the RPC rejects it", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([row({ name: "منتج منتهي الصلاحية", category: "Hair Care", price: "10", sku: "EXP-1" })]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);

  const session = fake.state.product_import_sessions.find((s) => s.id === preview.import_id);
  session.expires_at = new Date(Date.now() - 1000).toISOString();

  await assert.rejects(() => service.confirmForMerchant(preview.import_id, merchantActor), (err) => err.getStatus() === 400);
  // The RPC transaction itself would have rolled back any 'expired' mark it made internally; the
  // TS caller does a small best-effort follow-up UPDATE after seeing IMPORT_SESSION_EXPIRED.
  assert.equal(session.status, "expired");
  assert.equal(fake.state.products.length, 0);
});

// ── E.1: invalid row among a batch blocks confirm with ZERO writes ──────

test("a batch containing even one invalid row is blocked before the RPC is ever called — zero product writes", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([
    row({ name: "منتج صالح", category: "Hair Care", price: "10", sku: "OK-1" }),
    row({ name: "منتج بدون سعر", category: "Hair Care", price: "", sku: "BAD-1" }), // invalid: price required
  ]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.summary.invalid_rows, 1);
  assert.equal(preview.summary.valid_rows, 1);

  await assert.rejects(() => service.confirmForMerchant(preview.import_id, merchantActor), (err) => err.getStatus() === 400);

  assert.equal(fake.calls.rpc.length, 0, "the atomic RPC must never be invoked for a batch known to contain an invalid row");
  assert.equal(fake.state.products.length, 0, "zero product writes for a batch with any invalid row");

  const session = fake.state.product_import_sessions.find((s) => s.id === preview.import_id);
  assert.equal(session.status, "previewed", "rejecting before the RPC leaves the session untouched, still retryable after a fix");
});

// ── E.1: concurrent claim failure maps correctly ─────────────────────────

test("IMPORT_SESSION_CLAIM_FAILED from the RPC maps to a 400 (already processing / processed)", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([row({ name: "منتج", category: "Hair Care", price: "10", sku: "CLAIM-1" })]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);

  // Simulate a concurrent confirm already holding the claim (status flipped to 'processing').
  const session = fake.state.product_import_sessions.find((s) => s.id === preview.import_id);
  session.status = "processing";

  await assert.rejects(() => service.confirmForMerchant(preview.import_id, merchantActor), (err) => err.getStatus() === 400);
  assert.equal(fake.calls.rpc.length, 1, "the RPC is still called exactly once — the claim-failure is a normal RPC response, not a TS pre-check");
});

test("confirming an already-confirmed session maps IMPORT_SESSION_CLAIM_FAILED to a 400", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([row({ name: "منتج", category: "Hair Care", price: "10", sku: "ONCE-1" })]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);

  await service.confirmForMerchant(preview.import_id, merchantActor);
  await assert.rejects(() => service.confirmForMerchant(preview.import_id, merchantActor), (err) => err.getStatus() === 400);
  assert.equal(fake.state.products.length, 1, "the second (rejected) confirm attempt creates no duplicate");
});

// ── E: CSV parser hardening (csv-parse) ──────────────────────────────────

test("a multiline quoted description is parsed as a single field, not split into extra rows", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const description = "السطر الأول\nالسطر الثاني";
  const file = csv([row({ name: "منتج وصف متعدد الأسطر", description, category: "Hair Care", price: "10", sku: "MULTI-1" })]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.summary.total_rows, 1, "the embedded newline must not be mistaken for a new CSV row");
  assert.equal(preview.rows[0].normalized.description, description);
});

test("an Arabic description containing commas is parsed as a single field", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const description = "عبارة، تحتوي، على فواصل متعددة";
  const file = csv([row({ name: "منتج بفواصل عربية", description, category: "Hair Care", price: "10", sku: "COMMA-1" })]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.summary.total_rows, 1);
  assert.equal(preview.rows[0].normalized.description, description);
});

test("escaped double quotes inside a quoted field round-trip correctly", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const description = 'قال البائع: "منتج ممتاز"';
  const file = csv([row({ name: "منتج بعبارة مقتبسة", description, category: "Hair Care", price: "10", sku: "QUOTE-1" })]);

  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.summary.total_rows, 1);
  assert.equal(preview.rows[0].normalized.description, description);
});

test("a file larger than MAX_UPLOAD_BYTES (1MB) is rejected before parsing", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const hugeDescription = "س".repeat(1_100_000);
  const file = csv([row({ name: "منتج ضخم", description: hugeDescription, category: "Hair Care", price: "10", sku: "HUGE-1" })]);
  assert.ok(file.length > 1_000_000);

  await assert.rejects(
    () => service.previewForMerchant(file, "f.csv", merchantActor),
    (err) => err.getStatus() === 400 && /size/i.test(err.message),
  );
});

test("a file with more than MAX_ROWS (500) data rows is rejected", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const rows = Array.from({ length: 501 }, (_, i) => row({ name: `منتج ${i}`, category: "Hair Care", price: "10", sku: `ROW-${i}` }));
  const file = csv(rows);

  await assert.rejects(
    () => service.previewForMerchant(file, "f.csv", merchantActor),
    (err) => err.getStatus() === 400 && /rows/i.test(err.message),
  );
});

test("malformed CSV (unterminated quote) is rejected with a clear 400 instead of throwing an unhandled parser error", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const malformed = Buffer.from(`${HEADER}\n"منتج بدون علامة اقتباس مغلقة,Hair Care,10,,,,BAD-1,,,,,\n`, "utf-8");

  await assert.rejects(
    () => service.previewForMerchant(malformed, "f.csv", merchantActor),
    (err) => err.getStatus() === 400,
  );
});

// ── L5 / L6 hierarchical category paths ───────────────────────────────────

test("L5: import preview of parent-only category fails when active children exist", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: hierarchicalCategories });
  const file = csv([
    row({ name: "عطر تجريبي", category: "العطور والمعطرات", price: "10", sku: "PATH-PARENT-1" }),
  ]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "invalid");
  assert.ok(
    preview.rows[0].errors.some(
      (e) => e.includes(CategoryAssignErrors.CATEGORY_PARENT_NOT_ASSIGNABLE) || /Parent > Child|assignable/i.test(e),
    ),
  );
});

test("L6: import preview of Parent > Child hierarchical path succeeds", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: hierarchicalCategories });
  const file = csv([
    row({ name: "عطر تجريبي", category: "العطور والمعطرات > العطور", price: "10", sku: "PATH-CHILD-1" }),
  ]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "valid");
  assert.equal(preview.rows[0].normalized.category_id, PERFUMES_LEAF);
});

test("import preview slug path fragrances-and-scents > perfumes succeeds", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: hierarchicalCategories });
  const file = csv([
    row({ name: "عطر تجريبي", category: "fragrances-and-scents > perfumes", price: "10", sku: "PATH-SLUG-1" }),
  ]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "valid");
  assert.equal(preview.rows[0].normalized.category_id, PERFUMES_LEAF);
});

// ── short_description ─────────────────────────────────────────────────────

test("import preview missing short_description fails SHORT_DESCRIPTION_REQUIRED", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([row({ name: "منتج", short_description: "", category: "Hair Care", price: "10", sku: "SD-1" })]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "invalid");
  assert.ok(preview.rows[0].errors.some((e) => e.includes("SHORT_DESCRIPTION_REQUIRED")));
});

test("import preview short_description too short fails", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([row({ name: "منتج", short_description: "قصير جدا", category: "Hair Care", price: "10", sku: "SD-2" })]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "invalid");
  assert.ok(preview.rows[0].errors.some((e) => e.includes("SHORT_DESCRIPTION_TOO_SHORT")));
});

test("import preview short_description too long fails", async () => {
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const long = "س".repeat(281);
  const file = csv([row({ name: "منتج", short_description: long, category: "Hair Care", price: "10", sku: "SD-3" })]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "invalid");
  assert.ok(preview.rows[0].errors.some((e) => e.includes("SHORT_DESCRIPTION_TOO_LONG")));
});

test("import preview valid short-only row passes and confirms short_description", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([
    row({ name: "منتج", short_description: VALID_SHORT, description: "", category: "Hair Care", price: "10", sku: "SD-4" }),
  ]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "valid");
  assert.equal(preview.rows[0].normalized.short_description, VALID_SHORT);
  assert.equal(preview.rows[0].normalized.short_description_char_count, VALID_SHORT.length);

  const confirm = await service.confirmForMerchant(preview.import_id, merchantActor);
  assert.equal(confirm.created, 1);
  assert.equal(fake.state.products[0].short_description, VALID_SHORT);
});

test("import preview valid short + detailed passes", async () => {
  const detailed = "نوتات موثقة: افتتاحية وتوسط وقاعدة من المصدر الرسمي فقط دون ادعاءات أداء.";
  const { service } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([
    row({
      name: "منتج",
      short_description: VALID_SHORT,
      description: detailed,
      category: "Hair Care",
      price: "10",
      sku: "SD-5",
    }),
  ]);
  const preview = await service.previewForMerchant(file, "ok.csv", merchantActor);
  assert.equal(preview.rows[0].status, "valid");
  assert.equal(preview.rows[0].normalized.description, detailed);
  assert.equal(preview.rows[0].normalized.short_description, VALID_SHORT);
});

test("Golden Ready fixture has exactly 9 rows and no HOLD", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const readyPath = path.join(process.cwd(), "..", "docs", "product-import", "ard-al-khaleej", "content", "03_GOLDEN10_READY.csv");
  const holdPath = path.join(process.cwd(), "..", "docs", "product-import", "ard-al-khaleej", "content", "04_GOLDEN10_HOLD.csv");
  const ready = fs.readFileSync(readyPath, "utf8").trim().split(/\r?\n/).slice(1);
  const hold = fs.readFileSync(holdPath, "utf8").trim().split(/\r?\n/).slice(1);
  assert.equal(ready.length, 9);
  assert.equal(hold.length, 1);
  assert.ok(hold[0].startsWith("ARD-1191"));
  assert.ok(!ready.some((line) => line.includes(",HOLD,") || line.startsWith("ARD-1191,")));
});
test("tampered preview missing short_description fails closed with zero product writes", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([row({ name: "منتج", category: "Hair Care", price: "10", sku: "TAMP-1" })]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  const session = fake.state.product_import_sessions.find((s) => s.id === preview.import_id);
  session.preview_payload.rows[0].normalized.short_description = "";
  const beforeCount = fake.state.products.length;
  await assert.rejects(() => service.confirmForMerchant(preview.import_id, merchantActor), (err) => {
    return err.getStatus() === 400 && /IMPORT_ROW_SHORT_DESCRIPTION_REQUIRED/.test(err.message);
  });
  assert.equal(fake.state.products.length, beforeCount);
  assert.equal(session.status, "previewed");
});

test("tampered preview short short_description fails closed", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([row({ name: "منتج", category: "Hair Care", price: "10", sku: "TAMP-2" })]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  const session = fake.state.product_import_sessions.find((s) => s.id === preview.import_id);
  session.preview_payload.rows[0].normalized.short_description = "قصير";
  await assert.rejects(() => service.confirmForMerchant(preview.import_id, merchantActor), (err) => {
    return /IMPORT_ROW_SHORT_DESCRIPTION_TOO_SHORT/.test(err.message);
  });
  assert.equal(fake.state.products.length, 0);
  assert.equal(session.status, "previewed");
});

test("tampered preview long short_description fails closed", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([row({ name: "منتج", category: "Hair Care", price: "10", sku: "TAMP-3" })]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  const session = fake.state.product_import_sessions.find((s) => s.id === preview.import_id);
  session.preview_payload.rows[0].normalized.short_description = "م".repeat(281);
  await assert.rejects(() => service.confirmForMerchant(preview.import_id, merchantActor), (err) => {
    return /IMPORT_ROW_SHORT_DESCRIPTION_TOO_LONG/.test(err.message);
  });
  assert.equal(fake.state.products.length, 0);
  assert.equal(session.status, "previewed");
});

test("tampered preview HTML short_description fails closed", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: defaultCategories });
  const file = csv([row({ name: "منتج", category: "Hair Care", price: "10", sku: "TAMP-4" })]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  const session = fake.state.product_import_sessions.find((s) => s.id === preview.import_id);
  session.preview_payload.rows[0].normalized.short_description = `${VALID_SHORT}<b>x</b>`;
  await assert.rejects(() => service.confirmForMerchant(preview.import_id, merchantActor), (err) => {
    return /IMPORT_ROW_SHORT_DESCRIPTION_INVALID/.test(err.message);
  });
  assert.equal(fake.state.products.length, 0);
  assert.equal(session.status, "previewed");
});

test("tampered preview parent category assignment fails closed", async () => {
  const { service, fake } = makeService({ merchants: [activeMerchant()], categories: hierarchicalCategories });
  const file = csv([row({ name: "منتج", category: "fragrances-and-scents > perfumes", price: "10", sku: "TAMP-5" })]);
  const preview = await service.previewForMerchant(file, "f.csv", merchantActor);
  assert.equal(preview.rows[0].status, "valid");
  const session = fake.state.product_import_sessions.find((s) => s.id === preview.import_id);
  session.preview_payload.rows[0].normalized.category_id = FRAG_ROOT;
  await assert.rejects(() => service.confirmForMerchant(preview.import_id, merchantActor), (err) => {
    return /IMPORT_ROW_INVALID_CATEGORY/.test(err.message) && /parent with active children/.test(err.message);
  });
  assert.equal(fake.state.products.length, 0);
  assert.equal(session.status, "previewed");
});
