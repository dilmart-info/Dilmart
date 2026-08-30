/**
 * Product readiness — DATABASE-level gates (DilMart-STORE-PRODUCT-READINESS-INVARIANT-001).
 *
 * Covers the two gates that only exist inside Postgres and therefore cannot be proven by the
 * in-memory service fakes:
 *
 *   1. `product_import_confirm_atomic` (migration 20260819120000) — a preview payload whose row
 *      asks to be active/published/public must satisfy readiness (image + description, and never
 *      active+archived). A stale or tampered payload is rejected with `IMPORT_ROW_NOT_READY` and
 *      zero product writes.
 *   2. `product_content_bulk_update_atomic` (migration 20260819130000) — clearing the
 *      `description` of an active/published/public product is rejected with
 *      `CONTENT_BULK_PRODUCT_NOT_READY`, with the matched row locked FOR UPDATE inside the same
 *      transaction (so a concurrent activation cannot slip past the service pre-read), and with
 *      the RPC's own normalized `upper(btrim(merchant_sku))` matching.
 *
 * Plus the privilege contract: both functions are SECURITY DEFINER and executable by
 * `service_role` only.
 *
 * Every test skips cleanly (never fails) when the migrations are not applied to whichever
 * database `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` point at.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { getAnonClient, getTestClient } from "./db-client-helper.mjs";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const ALLOWED_IMAGE =
  "https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/db-gate.jpg";
const VALID_SHORT_DESCRIPTION =
  "Deterministic valid short description for product readiness database gate integration tests.";

function isMissingFunctionError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST202" ||
    error?.code === "42883" ||
    message.includes("could not find the function") ||
    message.includes("does not exist")
  );
}

async function rpcExists(supabase, name, params) {
  const { error } = await supabase.rpc(name, params);
  if (!error) return true;
  return !isMissingFunctionError(error);
}

/** True once the readiness gate of migration 20260819120000 is present in the DB. */
async function importReadinessGateApplied(supabase, seed) {
  const merchantId = await seed.merchant();
  const categoryId = await seed.category();
  const sku = `GATEPROBE-${crypto.randomBytes(4).toString("hex")}`;
  const importId = await seed.session(merchantId, [
    seed.row({ sku, categoryId, isActive: true, imageUrl: null, description: "" }),
  ]);
  const { error } = await supabase.rpc("product_import_confirm_atomic", {
    p_import_id: importId,
    p_merchant_id: merchantId,
    p_actor_id: null,
    p_actor_role: null,
    p_write_audit: false,
  });
  return String(error?.message || "").includes("IMPORT_ROW_NOT_READY");
}

test("product readiness database gates", async (t) => {
  const supabase = getTestClient();

  const seed = {
    async merchant(status = "active") {
      const id = crypto.randomUUID();
      const { error } = await supabase.from("merchants").insert({
        id,
        slug: `readiness-gate-${crypto.randomBytes(6).toString("hex")}`,
        name_ar: "تاجر فحص الجاهزية",
        name_en: "Readiness Gate Merchant",
        display_name: "Readiness Gate Merchant",
        status,
      });
      if (error) throw error;
      return id;
    },
    async category() {
      const id = crypto.randomUUID();
      const { error } = await supabase.from("categories").insert({
        id,
        name: `ReadinessCat-${crypto.randomBytes(4).toString("hex")}`,
        slug: `readiness-cat-${crypto.randomBytes(4).toString("hex")}`,
        is_active: true,
      });
      if (error) throw error;
      return id;
    },
    row({
      sku,
      categoryId,
      isActive = false,
      isPublished = false,
      visibilityStatus = "private",
      imageUrl = null,
      description = "",
      name = "Readiness Gate Product",
    }) {
      const normalizedSku = String(sku).toUpperCase();
      return {
        status: "valid",
        normalized: {
          name,
          description,
          short_description: VALID_SHORT_DESCRIPTION,
          category_id: categoryId,
          category_name: "",
          price: 25,
          discount_price: null,
          stock: 3,
          sku: normalizedSku,
          brand: null,
          sizes: [],
          is_active: isActive,
          is_published: isPublished,
          visibility_status: visibilityStatus,
          image_url: imageUrl,
          slug: `readiness-gate-${normalizedSku.toLowerCase()}`,
        },
        errors: [],
        warnings: [],
      };
    },
    async session(merchantId, rows) {
      const importId = crypto.randomUUID();
      const { error } = await supabase.from("product_import_sessions").insert({
        id: importId,
        merchant_id: merchantId,
        status: "previewed",
        original_filename: "readiness-gate.csv",
        total_rows: rows.length,
        valid_rows: rows.length,
        invalid_rows: 0,
        preview_payload: {
          summary: { total_rows: rows.length, valid_rows: rows.length, invalid_rows: 0, warnings_count: 0 },
          rows,
        },
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      });
      if (error) throw error;
      return importId;
    },
    async product(merchantId, categoryId, overrides = {}) {
      const id = crypto.randomUUID();
      const suffix = crypto.randomBytes(4).toString("hex");
      const { error } = await supabase.from("products").insert({
        id,
        merchant_id: merchantId,
        category_id: categoryId,
        name: "Readiness Gate Product",
        slug: `readiness-gate-product-${suffix}`,
        merchant_sku: `RG-${suffix.toUpperCase()}`,
        description: "Existing detailed description.",
        short_description: VALID_SHORT_DESCRIPTION,
        price: 25,
        stock: 3,
        images: [ALLOWED_IMAGE],
        is_active: false,
        is_published: false,
        visibility_status: "private",
        ...overrides,
      });
      if (error) throw error;
      const { data, error: readErr } = await supabase.from("products").select("*").eq("id", id).single();
      if (readErr) throw readErr;
      return data;
    },
  };

  // PostgREST resolves an overload by the EXACT named-argument set, so every probe must pass the
  // same five arguments the real call sites use — a short argument list comes back as PGRST202
  // ("function not found") and would skip the whole suite on a correctly migrated database.
  const importRpcAvailable = await rpcExists(supabase, "product_import_confirm_atomic", {
    p_import_id: NIL_UUID,
    p_merchant_id: NIL_UUID,
    p_actor_id: null,
    p_actor_role: null,
    p_write_audit: false,
  });
  const contentRpcAvailable = await rpcExists(supabase, "product_content_bulk_update_atomic", {
    p_merchant_id: NIL_UUID,
    p_actor_id: null,
    p_actor_role: null,
    p_items: [],
  });

  if (!importRpcAvailable || !contentRpcAvailable) {
    console.log(
      "SKIP: product_import_confirm_atomic / product_content_bulk_update_atomic are not present " +
        "on this database; apply supabase/migrations first.",
    );
    t.skip("product readiness RPCs not applied on this database");
    return;
  }

  const importGateApplied = await importReadinessGateApplied(supabase, seed);

  // ── 1. Import confirm readiness gate ───────────────────────────────────────

  await t.test("confirm rejects a publish row with no image and no description", async (tt) => {
    if (!importGateApplied) {
      tt.skip("migration 20260819120000_product_import_confirm_readiness.sql is not applied here");
      return;
    }
    const merchantId = await seed.merchant();
    const categoryId = await seed.category();
    const sku = `NOIMG-${crypto.randomBytes(4).toString("hex")}`;
    const importId = await seed.session(merchantId, [
      seed.row({ sku, categoryId, isActive: true, isPublished: true, visibilityStatus: "public" }),
    ]);

    const { error } = await supabase.rpc("product_import_confirm_atomic", {
      p_import_id: importId,
      p_merchant_id: merchantId,
      p_actor_id: null,
      p_actor_role: null,
      p_write_audit: false,
    });

    assert.ok(error, "confirm must fail");
    assert.match(String(error.message), /IMPORT_ROW_NOT_READY/);

    const { data: products } = await supabase.from("products").select("id").eq("merchant_id", merchantId);
    assert.equal((products ?? []).length, 0, "zero product writes");
    const { data: session } = await supabase
      .from("product_import_sessions")
      .select("status")
      .eq("id", importId)
      .single();
    assert.equal(session.status, "previewed", "the whole transaction rolled back, claim included");
  });

  await t.test("confirm rejects an active + archived row", async (tt) => {
    if (!importGateApplied) {
      tt.skip("migration 20260819120000_product_import_confirm_readiness.sql is not applied here");
      return;
    }
    const merchantId = await seed.merchant();
    const categoryId = await seed.category();
    const sku = `ACTARCH-${crypto.randomBytes(4).toString("hex")}`;
    const importId = await seed.session(merchantId, [
      seed.row({
        sku,
        categoryId,
        isActive: true,
        visibilityStatus: "archived",
        imageUrl: ALLOWED_IMAGE,
        description: "Detailed description.",
      }),
    ]);

    const { error } = await supabase.rpc("product_import_confirm_atomic", {
      p_import_id: importId,
      p_merchant_id: merchantId,
      p_actor_id: null,
      p_actor_role: null,
      p_write_audit: false,
    });

    assert.ok(error, "confirm must fail");
    assert.match(String(error.message), /IMPORT_ROW_NOT_READY/);
    const { data: products } = await supabase.from("products").select("id").eq("merchant_id", merchantId);
    assert.equal((products ?? []).length, 0);
  });

  await t.test("confirm accepts a fully ready publish row", async () => {
    const merchantId = await seed.merchant();
    const categoryId = await seed.category();
    const sku = `READY-${crypto.randomBytes(4).toString("hex")}`;
    const importId = await seed.session(merchantId, [
      seed.row({
        sku,
        categoryId,
        isActive: true,
        isPublished: true,
        visibilityStatus: "public",
        imageUrl: ALLOWED_IMAGE,
        description: "Detailed description.",
      }),
    ]);

    const { error } = await supabase.rpc("product_import_confirm_atomic", {
      p_import_id: importId,
      p_merchant_id: merchantId,
      p_actor_id: null,
      p_actor_role: null,
      p_write_audit: false,
    });
    assert.equal(error, null, `ready row must import: ${error?.message ?? ""}`);

    const { data: products } = await supabase
      .from("products")
      .select("is_active,is_published,visibility_status")
      .eq("merchant_id", merchantId)
      .eq("merchant_sku", sku.toUpperCase());
    assert.equal(products.length, 1);
    assert.deepEqual(products[0], { is_active: true, is_published: true, visibility_status: "public" });
  });

  // ── 2. Content-bulk live-description guard ────────────────────────────────

  const contentItems = (sku) => [
    { merchant_sku: sku, short_description: VALID_SHORT_DESCRIPTION, description: null },
  ];

  const contentGuardApplied = await (async () => {
    const merchantId = await seed.merchant();
    const categoryId = await seed.category();
    const product = await seed.product(merchantId, categoryId, {
      is_active: true,
      is_published: true,
      visibility_status: "public",
    });
    const { error } = await supabase.rpc("product_content_bulk_update_atomic", {
      p_merchant_id: merchantId,
      p_actor_id: null,
      p_actor_role: null,
      p_items: contentItems(product.merchant_sku),
    });
    return String(error?.message || "").includes("CONTENT_BULK_PRODUCT_NOT_READY");
  })();

  await t.test("content bulk cannot clear the description of a live product", async (tt) => {
    if (!contentGuardApplied) {
      tt.skip("migration 20260819130000_product_content_bulk_live_description_guard.sql is not applied here");
      return;
    }
    const merchantId = await seed.merchant();
    const categoryId = await seed.category();
    const product = await seed.product(merchantId, categoryId, {
      is_active: true,
      is_published: true,
      visibility_status: "public",
    });

    const { error } = await supabase.rpc("product_content_bulk_update_atomic", {
      p_merchant_id: merchantId,
      p_actor_id: null,
      p_actor_role: null,
      p_items: contentItems(product.merchant_sku),
    });

    assert.ok(error, "clearing the description of a live product must fail");
    assert.match(String(error.message), /CONTENT_BULK_PRODUCT_NOT_READY/);

    const { data: after } = await supabase.from("products").select("description").eq("id", product.id).single();
    assert.equal(after.description, "Existing detailed description.", "no write happened");
  });

  await t.test("content bulk matches SKUs with the RPC's normalized casing", async (tt) => {
    if (!contentGuardApplied) {
      tt.skip("migration 20260819130000_product_content_bulk_live_description_guard.sql is not applied here");
      return;
    }
    const merchantId = await seed.merchant();
    const categoryId = await seed.category();
    const suffix = crypto.randomBytes(4).toString("hex");
    const product = await seed.product(merchantId, categoryId, {
      // Stored lower-case; the payload sends the normalized upper-case SKU.
      merchant_sku: `lc-${suffix}`,
      is_active: true,
      is_published: true,
      visibility_status: "public",
    });

    const { error } = await supabase.rpc("product_content_bulk_update_atomic", {
      p_merchant_id: merchantId,
      p_actor_id: null,
      p_actor_role: null,
      p_items: contentItems(`LC-${suffix.toUpperCase()}`),
    });

    assert.ok(error, "a lower-case stored SKU must still be matched and refused");
    assert.match(String(error.message), /CONTENT_BULK_PRODUCT_NOT_READY/);

    const { data: after } = await supabase.from("products").select("description").eq("id", product.id).single();
    assert.equal(after.description, "Existing detailed description.");
  });

  await t.test("content bulk still clears the description of a DRAFT product", async () => {
    const merchantId = await seed.merchant();
    const categoryId = await seed.category();
    const product = await seed.product(merchantId, categoryId);

    const { error } = await supabase.rpc("product_content_bulk_update_atomic", {
      p_merchant_id: merchantId,
      p_actor_id: null,
      p_actor_role: null,
      p_items: contentItems(product.merchant_sku),
    });
    assert.equal(error, null, `draft product must stay editable: ${error?.message ?? ""}`);

    const { data: after } = await supabase.from("products").select("description").eq("id", product.id).single();
    assert.equal(after.description, null);
  });

  // ── 3. Privilege contract ─────────────────────────────────────────────────

  await t.test("both readiness RPCs are service_role only", async (tt) => {
    const anon = getAnonClient();
    if (!anon) {
      tt.skip("no anon key resolved for this database");
      return;
    }

    // Full argument sets again: a short list would fail with PGRST202 and "prove" the privilege
    // contract for the wrong reason. A real denial is 42501 / "permission denied".
    const denied = (error, label) => {
      assert.ok(error, `anon must not be able to execute ${label}`);
      const code = String(error.code ?? "");
      const message = String(error.message ?? "").toLowerCase();
      assert.ok(
        code === "42501" || code === "PGRST301" || message.includes("permission denied"),
        `${label} must fail with a permission error, got ${code}: ${error.message}`,
      );
    };

    const { error: importErr } = await anon.rpc("product_import_confirm_atomic", {
      p_import_id: NIL_UUID,
      p_merchant_id: NIL_UUID,
      p_actor_id: null,
      p_actor_role: null,
      p_write_audit: false,
    });
    denied(importErr, "product_import_confirm_atomic");

    const { error: contentErr } = await anon.rpc("product_content_bulk_update_atomic", {
      p_merchant_id: NIL_UUID,
      p_actor_id: null,
      p_actor_role: null,
      p_items: [],
    });
    denied(contentErr, "product_content_bulk_update_atomic");
  });
});
