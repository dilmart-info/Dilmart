/**
 * `product_import_confirm_atomic` — Database Integration Suite.
 *
 * Covers the parts of the Gate 2 correction (DilMart-ARD-AL-KHALEEJ-VERTICAL-PILOT-10-001) that
 * can only be verified against a real Postgres transaction/lock manager, not an in-memory fake:
 *   1. Invalid rows block the whole confirm with zero product writes.
 *   2. Two concurrent confirms of the SAME import session: exactly one succeeds, the other gets
 *      IMPORT_SESSION_CLAIM_FAILED (one-time claim via `status='previewed' -> 'processing'`).
 *   3. The `pg_advisory_xact_lock` on (merchant_id, sku) serializes two DIFFERENT import sessions
 *      for the same merchant that both touch the same SKU — one create + one update, never two
 *      duplicate product rows.
 *   4. Second-review corrections: ambiguous-SKU guard, payload integrity pre-pass, and the
 *      constraint-specific slug-collision retry.
 *
 * IMPORTANT — this migration is intentionally NOT applied to any shared/remote database as part
 * of this change (see PR description / GATE1_REPORT.md: governance sign-off required first). If
 * `product_import_confirm_atomic` does not exist yet, every test below is skipped with a clear
 * message instead of failing the suite — this file becomes fully active the moment the migration
 * is applied to whichever DB `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` point at.
 *
 * SECOND-REVIEW ROOT CAUSE NOTE (test bug, not an RPC bug): the previous revision of the
 * "advisory lock serializes two DIFFERENT sessions" test built
 * `sharedSku = \`SHARED-${crypto.randomBytes(4).toString("hex")}\`` — `randomBytes(...).toString("hex")`
 * always produces LOWERCASE hex digits, so `sharedSku` was e.g. `"SHARED-a1b2c3d4"`. The RPC
 * stores `upper(btrim(sku))`, i.e. `"SHARED-A1B2C3D4"`. The test's final assertion queried
 * `.eq("merchant_sku", sharedSku)` using the ORIGINAL mixed-case string, which matched ZERO rows
 * even though the product was created/updated correctly — the test was asserting against the
 * wrong casing, not detecting a real persistence bug. Every SKU lookup/expectation in this file
 * now normalizes with `.toUpperCase()` exactly like the RPC does, and the affected test now
 * dumps full diagnostics (merchant id, normalized SKU, both RPC results, both session statuses,
 * and a service-role product read) so a future regression is immediately debuggable instead of
 * producing a bare "expected 1, got 0".
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { getTestClient } from "./db-client-helper.mjs";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/** Probes for the RPC's existence without ever writing anything. */
async function confirmRpcIsAvailable(supabase) {
  const { error } = await supabase.rpc("product_import_confirm_atomic", {
    p_import_id: NIL_UUID,
    p_merchant_id: NIL_UUID,
  });
  if (!error) return true;
  const message = String(error.message || "").toLowerCase();
  const missing =
    error.code === "PGRST202" ||
    error.code === "42883" ||
    message.includes("could not find the function") ||
    message.includes("does not exist");
  return !missing;
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Deterministic, contract-valid short_description shared by every fixture row.
// The product_import_confirm_atomic integrity pre-pass (and the products_short_description_len_chk
// CHECK) require a non-empty, HTML-free value of 40–280 chars after btrim — see
// supabase/migrations/20260802140100_product_import_confirm_short_description.sql (lines ~177-191).
// This constant is 40–280 chars and contains no HTML so every otherwise-valid row passes.
const VALID_SHORT_DESCRIPTION =
  "Deterministic valid short description for product import database integration test fixtures.";

function normalizedRow({
  name,
  sku,
  price = 10,
  categoryId = null,
  status = "valid",
  visibilityStatus = "private",
  shortDescription = VALID_SHORT_DESCRIPTION,
}) {
  // Always normalize exactly like ProductImportService/the RPC do — upper+trim — so every test
  // fixture's `normalized.sku` is already in the same casing the RPC will persist to
  // `products.merchant_sku`. Callers must still use `.toUpperCase()` on any RAW (pre-normalized)
  // SKU string of their own before querying `products`.
  const normalizedSku = String(sku).toUpperCase();
  return {
    status,
    normalized: {
      name,
      description: "",
      // short_description is a required, contract-validated field for import rows. Default to a
      // valid value so every otherwise-valid fixture reaches the behavior it was written to
      // exercise; only the dedicated required-field test overrides/omits it.
      // (Preserved from PR #72 over main's inline string — same contract, parameterized form.)
      short_description: shortDescription,
      category_id: categoryId,
      category_name: "",
      price,
      discount_price: null,
      stock: 0,
      sku: normalizedSku,
      brand: null,
      sizes: [],
      is_active: false,
      is_published: false,
      visibility_status: visibilityStatus,
      image_url: null,
      slug: `${slugify(name) || "product"}-${slugify(normalizedSku) || normalizedSku.toLowerCase()}`,
    },
    errors: status === "invalid" ? ["forced invalid for test"] : [],
    warnings: [],
  };
}

test("product_import_confirm_atomic (Database Integration Suite)", async (t) => {
  const supabase = getTestClient();
  const available = await confirmRpcIsAvailable(supabase);

  if (!available) {
    console.log(
      "SKIP: public.product_import_confirm_atomic does not exist on this database yet " +
        "(supabase/migrations/20260801190000_product_import_confirm_atomic.sql has not been applied). " +
        "This is expected pre-governance-approval — see GATE1_REPORT.md.",
    );
    t.skip("product_import_confirm_atomic not applied on this database yet");
    return;
  }

  const setupMerchant = async (status = "active") => {
    const merchantId = crypto.randomUUID();
    const { error } = await supabase.from("merchants").insert({
      id: merchantId,
      slug: `import-atomic-${crypto.randomBytes(6).toString("hex")}`,
      name_ar: "تاجر فحص الاستيراد",
      name_en: "Import Test Merchant",
      display_name: "Import Test Merchant",
      status,
    });
    if (error) throw error;
    return merchantId;
  };

  const setupCategory = async () => {
    const categoryId = crypto.randomUUID();
    const { error } = await supabase.from("categories").insert({
      id: categoryId,
      name: `Category-${crypto.randomBytes(4).toString("hex")}`,
      slug: `cat-${crypto.randomBytes(4).toString("hex")}`,
      is_active: true,
    });
    if (error) throw error;
    return categoryId;
  };

  const insertSession = async (merchantId, rows, overrides = {}) => {
    const importId = crypto.randomUUID();
    const invalidCount = rows.filter((r) => r.status === "invalid").length;
    const { error } = await supabase.from("product_import_sessions").insert({
      id: importId,
      merchant_id: merchantId,
      status: "previewed",
      original_filename: "db-integration.csv",
      total_rows: rows.length,
      valid_rows: rows.length - invalidCount,
      invalid_rows: invalidCount,
      preview_payload: {
        summary: { total_rows: rows.length, valid_rows: rows.length - invalidCount, invalid_rows: invalidCount, warnings_count: 0 },
        rows,
      },
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      ...overrides,
    });
    if (error) throw error;
    return importId;
  };

  const productsForSku = async (merchantId, normalizedSku) => {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, price, merchant_sku, slug, updated_at")
      .eq("merchant_id", merchantId)
      .eq("merchant_sku", normalizedSku);
    if (error) throw error;
    return data ?? [];
  };

  const sessionStatus = async (importId) => {
    const { data, error } = await supabase.from("product_import_sessions").select("status").eq("id", importId).single();
    if (error) throw error;
    return data.status;
  };

  await t.test("a session with an invalid row is rejected with zero product writes", async () => {
    const merchantId = await setupMerchant();
    const categoryId = await setupCategory();
    const sku = `INVROW-${crypto.randomBytes(4).toString("hex")}`;
    const rows = [
      { row_number: 2, ...normalizedRow({ name: "منتج صالح", sku: `OK-${crypto.randomBytes(4).toString("hex")}`, categoryId }) },
      { row_number: 3, ...normalizedRow({ name: "منتج غير صالح", sku, categoryId, status: "invalid" }) },
    ];
    const importId = await insertSession(merchantId, rows);

    const { data, error } = await supabase.rpc("product_import_confirm_atomic", {
      p_import_id: importId,
      p_merchant_id: merchantId,
    });

    assert.equal(data, null);
    assert.ok(error, "expected an error for a batch containing an invalid row");
    assert.match(String(error.message), /IMPORT_HAS_INVALID_ROWS/);

    const { data: products } = await supabase.from("products").select("id").eq("merchant_id", merchantId);
    assert.equal((products ?? []).length, 0, "zero product writes for a batch with any invalid row");
    assert.equal(await sessionStatus(importId), "previewed", "the whole transaction (including the claim) rolled back — safe to retry");
  });

  await t.test("two concurrent confirms of the SAME session: exactly one succeeds, the other is claim-rejected", async () => {
    const merchantId = await setupMerchant();
    const categoryId = await setupCategory();
    const rows = [
      { row_number: 2, ...normalizedRow({ name: "منتج التزامن", sku: `RACE-${crypto.randomBytes(4).toString("hex")}`, categoryId }) },
    ];
    const importId = await insertSession(merchantId, rows);

    const [callA, callB] = await Promise.all([
      supabase.rpc("product_import_confirm_atomic", { p_import_id: importId, p_merchant_id: merchantId }),
      supabase.rpc("product_import_confirm_atomic", { p_import_id: importId, p_merchant_id: merchantId }),
    ]);

    const successes = [callA, callB].filter((c) => !c.error);
    const failures = [callA, callB].filter((c) => c.error);

    assert.equal(successes.length, 1, "exactly one concurrent confirm call must succeed");
    assert.equal(failures.length, 1, "the other must fail");
    assert.match(String(failures[0].error.message), /IMPORT_SESSION_CLAIM_FAILED|IMPORT_SESSION_NOT_FOUND/);

    const { data: products } = await supabase.from("products").select("id").eq("merchant_id", merchantId);
    assert.equal((products ?? []).length, 1, "the SKU was inserted exactly once, never twice");
    assert.equal(await sessionStatus(importId), "confirmed");
  });

  await t.test("advisory lock serializes two DIFFERENT sessions touching the same (merchant, sku)", async () => {
    const merchantId = await setupMerchant();
    const categoryId = await setupCategory();
    const rawSku = `SHARED-${crypto.randomBytes(4).toString("hex")}`; // note: randomBytes hex is lowercase
    const normalizedSku = rawSku.toUpperCase(); // ALWAYS compare/query using this — matches upper(btrim(sku)) in the RPC

    const importIdA = await insertSession(merchantId, [
      { row_number: 2, ...normalizedRow({ name: "منتج مشترك أ", sku: rawSku, categoryId, price: 10 }) },
    ]);
    const importIdB = await insertSession(merchantId, [
      { row_number: 2, ...normalizedRow({ name: "منتج مشترك ب", sku: rawSku, categoryId, price: 20 }) },
    ]);

    const [callA, callB] = await Promise.all([
      supabase.rpc("product_import_confirm_atomic", { p_import_id: importIdA, p_merchant_id: merchantId }),
      supabase.rpc("product_import_confirm_atomic", { p_import_id: importIdB, p_merchant_id: merchantId }),
    ]);

    const [statusA, statusB] = await Promise.all([sessionStatus(importIdA), sessionStatus(importIdB)]);
    const productsAfter = await productsForSku(merchantId, normalizedSku);

    // Full diagnostic dump — always logged (not just on failure) per the second-review request,
    // since this exact test previously failed on a SKU-casing bug in the test itself, not the RPC.
    console.log(
      "[diagnostics] advisory-lock test:",
      JSON.stringify(
        {
          merchantId,
          rawSku,
          normalizedSku,
          callA: { data: callA.data, error: callA.error?.message ?? null },
          callB: { data: callB.data, error: callB.error?.message ?? null },
          sessionAStatus: statusA,
          sessionBStatus: statusB,
          productsAfter,
        },
        null,
        2,
      ),
    );

    assert.equal(callA.error, null, callA.error?.message);
    assert.equal(callB.error, null, callB.error?.message);
    assert.equal(statusA, "confirmed", "session A must reach 'confirmed'");
    assert.equal(statusB, "confirmed", "session B must reach 'confirmed'");

    // Together the two independent sessions must have produced exactly ONE create and ONE
    // update for the same SKU — never two separate product rows (that's what the advisory lock
    // + FOR UPDATE re-check exists to prevent, given there is no DB-level UNIQUE(merchant_id,
    // merchant_sku) constraint yet — see the preflight-blocked migration).
    const createdCount = [callA.data.created, callB.data.created].filter((n) => n === 1).length;
    assert.equal(createdCount, 1, "exactly one of the two confirms created the row");
    const updatedCount = [callA.data.updated, callB.data.updated].filter((n) => n === 1).length;
    assert.equal(updatedCount, 1, "exactly one of the two confirms updated the (by-then-existing) row");

    assert.equal(productsAfter.length, 1, "no duplicate product row for the shared SKU");
    assert.equal(productsAfter[0].merchant_sku, normalizedSku, "merchant_sku is stored upper+trimmed");

    // Stable product id: whichever RPC call created the row, its returned product_id must be the
    // SAME row that ends up in the table (the second, "update", call's product_id must match).
    const createdRow = (callA.data.created === 1 ? callA : callB).data.rows[0];
    const updatedRow = (callA.data.updated === 1 ? callA : callB).data.rows[0];
    assert.equal(createdRow.product_id, productsAfter[0].id, "the created row's product_id matches the final persisted row");
    assert.equal(updatedRow.product_id, productsAfter[0].id, "the update call resolved to the SAME product id the create call produced");
  });

  await t.test(
    "two pre-existing products already sharing the same (merchant_id, merchant_sku) make confirm fail with IMPORT_SKU_AMBIGUOUS and touch nothing",
    async () => {
      const merchantId = await setupMerchant();
      const categoryId = await setupCategory();
      const rawSku = `AMBIG-${crypto.randomBytes(4).toString("hex")}`;
      const normalizedSku = rawSku.toUpperCase();

      // Simulates the documented ~123-duplicate-group production data state: two products for
      // the SAME merchant already share the same merchant_sku (no DB-level unique constraint
      // exists to prevent this today). The RPC must refuse to silently pick one.
      const dupA = {
        id: crypto.randomUUID(),
        merchant_id: merchantId,
        slug: `ambig-a-${crypto.randomBytes(3).toString("hex")}`,
        name: "منتج غامض أ",
        merchant_sku: normalizedSku,
        price: 10,
        category_id: categoryId,
      };
      const dupB = {
        id: crypto.randomUUID(),
        merchant_id: merchantId,
        slug: `ambig-b-${crypto.randomBytes(3).toString("hex")}`,
        name: "منتج غامض ب",
        merchant_sku: normalizedSku,
        price: 20,
        category_id: categoryId,
      };
      const { error: seedError } = await supabase.from("products").insert([dupA, dupB]);
      if (seedError) throw seedError;

      const before = await productsForSku(merchantId, normalizedSku);
      assert.equal(before.length, 2, "test setup sanity: two pre-existing duplicate rows");

      const actorId = crypto.randomUUID();
      const rows = [{ row_number: 2, ...normalizedRow({ name: "منتج مستورد غامض", sku: rawSku, categoryId, price: 15 }) }];
      const importId = await insertSession(merchantId, rows);

      const { data, error } = await supabase.rpc("product_import_confirm_atomic", {
        p_import_id: importId,
        p_merchant_id: merchantId,
        p_actor_id: actorId,
        p_actor_role: "super_admin",
        p_write_audit: true, // exercise the "no audit row on rollback" guarantee too
      });

      const after = await productsForSku(merchantId, normalizedSku);
      const status = await sessionStatus(importId);
      const { data: auditRows } = await supabase.from("audit_logs").select("id").eq("resource_id", importId);

      console.log(
        "[diagnostics] IMPORT_SKU_AMBIGUOUS test:",
        JSON.stringify({ merchantId, normalizedSku, data, error: error?.message ?? null, status, before, after, auditRowCount: (auditRows ?? []).length }, null, 2),
      );

      assert.equal(data, null);
      assert.ok(error, "expected IMPORT_SKU_AMBIGUOUS");
      assert.match(String(error.message), /IMPORT_SKU_AMBIGUOUS/);

      assert.equal(after.length, 2, "no product was created or removed");
      const beforeById = new Map(before.map((p) => [p.id, p]));
      for (const row of after) {
        const prior = beforeById.get(row.id);
        assert.ok(prior, `product ${row.id} must still exist unmodified`);
        assert.equal(row.name, prior.name, "name must be unchanged — the whole transaction rolled back");
        assert.equal(Number(row.price), Number(prior.price), "price must be unchanged — the whole transaction rolled back");
      }

      assert.equal(status, "previewed", "rolled back — session stays previewed, safe to retry after resolving the duplicate SKUs");
      assert.equal((auditRows ?? []).length, 0, "no audit row survives a rolled-back transaction even with p_write_audit=true");
    },
  );

  await t.test("a tampered payload with a duplicate SKU within the same batch fails IMPORT_PAYLOAD_INTEGRITY_FAILED with zero writes", async () => {
    const merchantId = await setupMerchant();
    const categoryId = await setupCategory();
    const sku = `PDUP-${crypto.randomBytes(4).toString("hex")}`;

    // TS-side preview would normally flag the second occurrence as invalid (blocking earlier),
    // but this directly-inserted session simulates a tampered/stale payload reaching the RPC
    // with two 'valid' rows for the same SKU — the RPC's own integrity pre-pass must catch it.
    const rows = [
      { row_number: 2, ...normalizedRow({ name: "منتج مكرر أ", sku, categoryId, price: 10 }) },
      { row_number: 3, ...normalizedRow({ name: "منتج مكرر ب", sku, categoryId, price: 12 }) },
    ];
    const importId = await insertSession(merchantId, rows, { valid_rows: 2, invalid_rows: 0 });

    const { data, error } = await supabase.rpc("product_import_confirm_atomic", { p_import_id: importId, p_merchant_id: merchantId });

    assert.equal(data, null);
    assert.ok(error);
    assert.match(String(error.message), /IMPORT_PAYLOAD_INTEGRITY_FAILED/);

    const { data: products } = await supabase.from("products").select("id").eq("merchant_id", merchantId);
    assert.equal((products ?? []).length, 0, "zero product writes when the payload integrity pre-pass fails");
    assert.equal(await sessionStatus(importId), "previewed");
  });

  await t.test("a tampered payload row with an out-of-range price fails IMPORT_ROW_INVALID_PRICE with zero writes", async () => {
    const merchantId = await setupMerchant();
    const categoryId = await setupCategory();
    const sku = `BADPRICE-${crypto.randomBytes(4).toString("hex")}`;

    const row = normalizedRow({ name: "منتج سعر غير صالح", sku, categoryId, price: 10 });
    row.normalized.price = -5; // tampered: negative price, but status stayed 'valid'
    const rows = [{ row_number: 2, ...row }];
    const importId = await insertSession(merchantId, rows);

    const { data, error } = await supabase.rpc("product_import_confirm_atomic", { p_import_id: importId, p_merchant_id: merchantId });

    assert.equal(data, null);
    assert.ok(error);
    assert.match(String(error.message), /IMPORT_ROW_INVALID_PRICE/);

    const { data: products } = await supabase.from("products").select("id").eq("merchant_id", merchantId);
    assert.equal((products ?? []).length, 0);
    assert.equal(await sessionStatus(importId), "previewed");
  });

  await t.test("a tampered payload row with a non-existent category_id fails IMPORT_ROW_INVALID_CATEGORY with zero writes", async () => {
    const merchantId = await setupMerchant();
    const sku = `BADCAT-${crypto.randomBytes(4).toString("hex")}`;
    const row = normalizedRow({ name: "منتج قسم غير موجود", sku, categoryId: crypto.randomUUID() }); // random, non-existent category
    const rows = [{ row_number: 2, ...row }];
    const importId = await insertSession(merchantId, rows);

    const { data, error } = await supabase.rpc("product_import_confirm_atomic", { p_import_id: importId, p_merchant_id: merchantId });

    assert.equal(data, null);
    assert.ok(error);
    assert.match(String(error.message), /IMPORT_ROW_INVALID_CATEGORY/);

    const { data: products } = await supabase.from("products").select("id").eq("merchant_id", merchantId);
    assert.equal((products ?? []).length, 0);
    assert.equal(await sessionStatus(importId), "previewed");
  });

  await t.test(
    "a row that omits short_description fails IMPORT_ROW_SHORT_DESCRIPTION_REQUIRED with zero writes",
    async () => {
      const merchantId = await setupMerchant();
      const categoryId = await setupCategory();
      const sku = `NOSHORT-${crypto.randomBytes(4).toString("hex")}`;

      // Otherwise fully valid row (valid category, price, stock, sku) so it reaches the
      // short_description contract check specifically — then DELIBERATELY omit the field. The RPC's
      // integrity pre-pass treats a missing and an empty short_description identically.
      const row = normalizedRow({ name: "منتج بلا وصف قصير", sku, categoryId });
      delete row.normalized.short_description;
      const rows = [{ row_number: 2, ...row }];
      const importId = await insertSession(merchantId, rows);

      const { data, error } = await supabase.rpc("product_import_confirm_atomic", { p_import_id: importId, p_merchant_id: merchantId });

      assert.equal(data, null);
      assert.ok(error, "expected IMPORT_ROW_SHORT_DESCRIPTION_REQUIRED");
      assert.match(String(error.message), /IMPORT_ROW_SHORT_DESCRIPTION_REQUIRED/);

      const { data: products } = await supabase.from("products").select("id").eq("merchant_id", merchantId);
      assert.equal((products ?? []).length, 0, "zero product writes when a row is missing short_description");
      assert.equal(await sessionStatus(importId), "previewed", "rolled back — safe to retry after adding a short_description");
    },
  );

  await t.test(
    "a global slug collision with a DIFFERENT merchant's product retries once with a merchant-hash suffix and succeeds",
    async () => {
      const merchantA = await setupMerchant();
      const merchantB = await setupMerchant();
      const categoryId = await setupCategory();

      const sku = `SLUGCOL-${crypto.randomBytes(4).toString("hex")}`;
      const name = "منتج تعارض السلق";
      const collidingSlug = `${slugify(name)}-${slugify(sku.toUpperCase())}`;

      // Merchant B already owns a product with EXACTLY the slug merchant A's import will compute
      // (products.slug is a DB-wide UNIQUE column).
      const { error: seedError } = await supabase.from("products").insert({
        id: crypto.randomUUID(),
        merchant_id: merchantB,
        slug: collidingSlug,
        name: "منتج التاجر الآخر",
        merchant_sku: `OTHER-${crypto.randomBytes(4).toString("hex")}`,
        price: 5,
        category_id: categoryId,
      });
      if (seedError) throw seedError;

      const rows = [{ row_number: 2, ...normalizedRow({ name, sku, categoryId, price: 12 }) }];
      assert.equal(rows[0].normalized.slug, collidingSlug, "test sanity: the fixture computes the exact same slug as the seeded row");
      const importId = await insertSession(merchantA, rows);

      const { data, error } = await supabase.rpc("product_import_confirm_atomic", { p_import_id: importId, p_merchant_id: merchantA });
      assert.equal(error, null, error?.message);
      assert.equal(data.created, 1);

      const [createdForA] = await productsForSku(merchantA, sku.toUpperCase());
      assert.ok(createdForA, "merchant A's product must have been created despite the slug collision");
      assert.notEqual(createdForA.slug, collidingSlug, "the exact colliding slug must not have been reused");
      assert.ok(
        createdForA.slug.startsWith(`${collidingSlug}-`),
        `slug "${createdForA.slug}" should be the base slug plus a deterministic merchant-hash suffix`,
      );

      // Merchant B's original row must be completely untouched.
      const { data: merchantBRow } = await supabase.from("products").select("slug, name").eq("merchant_id", merchantB).single();
      assert.equal(merchantBRow.slug, collidingSlug);
      assert.equal(merchantBRow.name, "منتج التاجر الآخر");
    },
  );

  // Non-slug unique_violation (item B): retrying deterministically requires a SECOND unique
  // constraint on `public.products` besides `products_slug_key` to violate. There is currently
  // no such constraint (see the file header on the missing UNIQUE(merchant_id, merchant_sku) —
  // blocked by ~123 pre-existing duplicate groups), and this test harness has no generic raw-SQL
  // execution helper to create/drop a temporary one safely around a single test. The behavior is
  // instead covered by direct code reading of the migration: the INSERT's `EXCEPTION WHEN
  // unique_violation` handler calls `GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME`
  // and does `IF v_constraint_name IS DISTINCT FROM 'products_slug_key' THEN RAISE; END IF;`
  // BEFORE attempting the suffix-retry INSERT — any other constraint's violation propagates
  // unchanged and is never reinterpreted as a slug collision. See
  // supabase/migrations/20260801190000_product_import_confirm_atomic.sql for the exact code.
  t.todo(
    "non-slug unique_violation re-raises unchanged instead of retrying — verified by code review " +
      "of GET STACKED DIAGNOSTICS CONSTRAINT_NAME handling (no second unique constraint exists " +
      "on public.products today to exercise this live; see comment above)",
  );
});
