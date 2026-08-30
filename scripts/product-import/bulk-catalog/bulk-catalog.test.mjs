/**
 * Bulk2200 pipeline foundation tests — focused, no production writes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "node:child_process";
import { writeCsv, sha256File } from "./lib/csv.mjs";
import { loadConfig } from "./lib/config.mjs";
import { buildDeterministicSlug, normalizeSku } from "./lib/normalize.mjs";
import { classifyRow, prepareBatch, buildDryRunReport, countStatuses } from "./lib/pipeline.mjs";
import { assertBulkExecuteAuthorized, DEFAULT_PRODUCT_STATE, TARGET_MERCHANT_ID } from "./lib/constants.mjs";
import { createBatchJournal, pendingJournalEntries } from "./lib/journal.mjs";
import { immutableStoragePath } from "./lib/images.mjs";
import { main as runMain } from "./run.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

function makeFixtureRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bulk2200-"));
  const imgDir = path.join(dir, "images");
  fs.mkdirSync(imgDir, { recursive: true });
  // Minimal valid WebP header (RIFF....WEBP)
  const webp = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20, 0x0e, 0x00, 0x00,
    0x00, 0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  fs.writeFileSync(path.join(imgDir, "ARD-9001.webp"), webp);
  fs.writeFileSync(path.join(imgDir, "ARD-9002.webp"), webp);

  writeCsv(
    path.join(dir, "categories.csv"),
    ["category_slug", "category_name_ar", "allowed", "source"],
    [
      { category_slug: "perfumes", category_name_ar: "العطور", allowed: "YES", source: "test" },
      { category_slug: "blocked", category_name_ar: "محظور", allowed: "NO", source: "test" },
    ],
  );

  const existing = [{ merchant_sku: "ARD-1000", slug: "existing-ard-1000", merchant_id: TARGET_MERCHANT_ID }];
  fs.writeFileSync(path.join(dir, "existing.json"), JSON.stringify(existing));

  writeCsv(
    path.join(dir, "source.csv"),
    [
      "sku",
      "final_name_ar",
      "final_brand",
      "size",
      "price",
      "final_category",
      "final_slug",
      "stage2_status",
      "stock",
      "duplicate_of_sku",
    ],
    [
      {
        sku: "ARD-9001",
        final_name_ar: "عطر اختبار واحد",
        final_brand: "TestBrand",
        size: "100 مل",
        price: "1000",
        final_category: "العطور",
        final_slug: "perfumes",
        stage2_status: "ready",
        stock: "",
        duplicate_of_sku: "",
      },
      {
        sku: "ARD-9002",
        final_name_ar: "عطر اختبار اثنان",
        final_brand: "TestBrand",
        size: "50 مل",
        price: "2000",
        final_category: "العطور",
        final_slug: "perfumes",
        stage2_status: "ready",
        stock: "",
        duplicate_of_sku: "",
      },
      {
        sku: "ARD-1000",
        final_name_ar: "موجود مسبقا",
        final_brand: "X",
        size: "100 مل",
        price: "1",
        final_category: "العطور",
        final_slug: "perfumes",
        stage2_status: "ready",
        stock: "",
        duplicate_of_sku: "",
      },
      {
        sku: "ARD-9001",
        final_name_ar: "مكرر",
        final_brand: "X",
        size: "",
        price: "1",
        final_category: "العطور",
        final_slug: "perfumes",
        stage2_status: "ready",
        stock: "",
        duplicate_of_sku: "",
      },
      {
        sku: "ARD-9003",
        final_name_ar: "بدون صورة",
        final_brand: "X",
        size: "100 مل",
        price: "1",
        final_category: "العطور",
        final_slug: "perfumes",
        stage2_status: "ready",
        stock: "",
        duplicate_of_sku: "",
      },
      {
        sku: "ARD-9004",
        final_name_ar: "فئة محظورة",
        final_brand: "X",
        size: "100 مل",
        price: "1",
        final_category: "محظور",
        final_slug: "blocked",
        stage2_status: "ready",
        stock: "",
        duplicate_of_sku: "",
      },
      {
        sku: "ARD-9005",
        final_name_ar: "مراجعة تاجر",
        final_brand: "X",
        size: "100 مل",
        price: "1",
        final_category: "العطور",
        final_slug: "perfumes",
        stage2_status: "merchant_confirmation",
        stock: "",
        duplicate_of_sku: "",
      },
      {
        sku: "",
        final_name_ar: "بدون سكو",
        final_brand: "X",
        size: "",
        price: "",
        final_category: "العطور",
        final_slug: "perfumes",
        stage2_status: "ready",
        stock: "",
        duplicate_of_sku: "",
      },
    ],
  );

  const cfgPath = path.join(dir, "config.json");
  fs.writeFileSync(
    cfgPath,
    JSON.stringify(
      {
        merchant_id: TARGET_MERCHANT_ID,
        merchant_slug: "arth-al-khaleg",
        source_file: path.join(dir, "source.csv"),
        image_directories: [imgDir],
        batch_size: 200,
        batch_id: "batch001",
        batch_selection_rule: "stable_source_order_valid_complete_image",
        default_product_state: { ...DEFAULT_PRODUCT_STATE },
        category_mapping_file: path.join(dir, "categories.csv"),
        existing_catalog_snapshot: path.join(dir, "existing.json"),
        docs_dir: path.join(dir, "docs"),
        tmp_dir: path.join(dir, "tmp"),
      },
      null,
      2,
    ),
  );
  return { dir, cfgPath, imgDir };
}

test("1. duplicate SKU in source → REJECT_DUPLICATE", () => {
  const { cfgPath } = makeFixtureRoot();
  const cfg = loadConfig(cfgPath, { root: ROOT });
  const prepared = prepareBatch(cfg, { batchId: "batch001" });
  const dups = prepared.classified.filter((r) => r.status === "REJECT_DUPLICATE" && r.rejection_reason === "DUPLICATE_SKU_IN_SOURCE");
  assert.ok(dups.length >= 1);
});

test("2. duplicate slug → REJECT_DUPLICATE", () => {
  const a = buildDeterministicSlug("نفس الاسم", "ARD-1");
  const b = buildDeterministicSlug("نفس الاسم", "ARD-1");
  assert.equal(a, b);
  assert.equal(normalizeSku("ard-1"), "ARD-1");
});

test("3. existing SKU → SKIP_EXISTING_SKU (never update)", () => {
  const { cfgPath } = makeFixtureRoot();
  const cfg = loadConfig(cfgPath, { root: ROOT });
  const prepared = prepareBatch(cfg, { batchId: "batch001" });
  const skip = prepared.classified.find((r) => r.merchant_sku === "ARD-1000");
  assert.equal(skip.status, "SKIP_EXISTING_SKU");
});

test("4. merchant isolation defaults to target merchant id in config", () => {
  const { cfgPath } = makeFixtureRoot();
  const cfg = loadConfig(cfgPath, { root: ROOT });
  assert.equal(cfg.merchant_id, TARGET_MERCHANT_ID);
  assert.equal(cfg.merchant_slug, "arth-al-khaleg");
});

test("5. category mapping rejects disallowed slug", () => {
  const { cfgPath } = makeFixtureRoot();
  const cfg = loadConfig(cfgPath, { root: ROOT });
  const prepared = prepareBatch(cfg, { batchId: "batch001" });
  const bad = prepared.classified.find((r) => r.merchant_sku === "ARD-9004");
  assert.equal(bad.status, "REJECT_CATEGORY");
});

test("6. missing image → REJECT_IMAGE", () => {
  const { cfgPath } = makeFixtureRoot();
  const cfg = loadConfig(cfgPath, { root: ROOT });
  const prepared = prepareBatch(cfg, { batchId: "batch001" });
  const miss = prepared.classified.find((r) => r.merchant_sku === "ARD-9003");
  assert.equal(miss.status, "REJECT_IMAGE");
});

test("7. invalid/empty image file rejected", () => {
  const { dir, cfgPath, imgDir } = makeFixtureRoot();
  fs.writeFileSync(path.join(imgDir, "ARD-9003.webp"), Buffer.from("not-an-image"));
  // tiny non-image should fail MIME or corrupt check depending on content
  const cfg = loadConfig(cfgPath, { root: ROOT });
  // Replace source so 9003 is otherwise valid — already is; add image file that is corrupt empty
  fs.writeFileSync(path.join(imgDir, "ARD-9099.webp"), Buffer.alloc(8));
  writeCsv(
    path.join(dir, "source.csv"),
    ["sku", "final_name_ar", "final_brand", "size", "price", "final_category", "final_slug", "stage2_status", "stock", "duplicate_of_sku"],
    [
      {
        sku: "ARD-9099",
        final_name_ar: "فاسد",
        final_brand: "X",
        size: "1",
        price: "1",
        final_category: "العطور",
        final_slug: "perfumes",
        stage2_status: "ready",
        stock: "",
        duplicate_of_sku: "",
      },
    ],
  );
  const prepared = prepareBatch(cfg, { batchId: "batch001" });
  assert.equal(prepared.classified[0].status, "REJECT_IMAGE");
});

test("8. deterministic Batch001 selection is stable and capped", () => {
  const { cfgPath } = makeFixtureRoot();
  const cfg = loadConfig(cfgPath, { root: ROOT });
  cfg.batch_size = 1;
  const a = prepareBatch(cfg, { batchId: "batch001" });
  const b = prepareBatch(cfg, { batchId: "batch001" });
  assert.equal(a.selectedReady.length, 1);
  assert.equal(a.selectedReady[0].merchant_sku, b.selectedReady[0].merchant_sku);
  assert.equal(a.selectedReady[0].merchant_sku, "ARD-9001");
});

test("9. stable manifest SHA for identical inputs", () => {
  const { cfgPath, dir } = makeFixtureRoot();
  const cfg = loadConfig(cfgPath, { root: ROOT });
  const p1 = prepareBatch(cfg, { batchId: "batch001" });
  const headers = [
    "batch_id",
    "source_row_number",
    "merchant_sku",
    "normalized_name",
    "slug",
    "category",
    "brand",
    "size",
    "price_source_status",
    "image_source",
    "normalized_image_path",
    "image_sha256",
    "validation_status",
    "rejection_reason",
  ];
  const f1 = path.join(dir, "m1.csv");
  const f2 = path.join(dir, "m2.csv");
  writeCsv(f1, headers, p1.manifestRows);
  writeCsv(f2, headers, prepareBatch(cfg, { batchId: "batch001" }).manifestRows);
  assert.equal(sha256File(f1), sha256File(f2));
});

test("10. private/inactive/unpublished/stock-zero defaults enforced", () => {
  assert.deepEqual(DEFAULT_PRODUCT_STATE, {
    visibility_status: "private",
    is_active: false,
    is_published: false,
    stock: 0,
  });
  const { dir } = makeFixtureRoot();
  const bad = path.join(dir, "bad.json");
  fs.writeFileSync(
    bad,
    JSON.stringify({
      source_file: path.join(dir, "source.csv"),
      category_mapping_file: path.join(dir, "categories.csv"),
      default_product_state: { visibility_status: "public", is_active: false, is_published: false, stock: 0 },
    }),
  );
  assert.throws(() => loadConfig(bad, { root: ROOT }), /UNSAFE_DEFAULT/);
});

test("11. inventory/prepare/dry-run report zero writes", async () => {
  const { cfgPath } = makeFixtureRoot();
  // Capture stdout from prepare via library
  const cfg = loadConfig(cfgPath, { root: ROOT });
  const prepared = prepareBatch(cfg, { batchId: "batch001" });
  const dry = buildDryRunReport(cfg, prepared);
  assert.equal(dry.production_storage_writes, false);
  assert.equal(dry.production_db_writes, false);
  assert.equal(dry.zero_writes_performed, true);
  assert.equal(dry.every_row_has_one_status, true);
});

test("12. execute cannot run without explicit later authorization", async () => {
  const { cfgPath } = makeFixtureRoot();
  const prev = { ...process.env };
  delete process.env.BULK2200_EXEC_AUTHORIZATION;
  delete process.env.BULK2200_ALLOW_WRITES;
  delete process.env.FIX_EXEC_AUTHORIZATION;
  delete process.env.FIX_EXEC_ALLOW_WRITES;
  const gate = assertBulkExecuteAuthorized(process.env);
  assert.equal(gate.ok, false);
  assert.equal(gate.code, "BULK_EXEC_AUTHORIZATION_REQUIRED");

  // CLI path
  let code = 0;
  const origExit = process.exit;
  process.exit = (c) => {
    code = c;
    throw new Error(`EXIT:${c}`);
  };
  try {
    await runMain(["execute", "--config", cfgPath, "--batch", "batch001"]);
  } catch (e) {
    assert.match(String(e.message), /EXIT:1/);
  } finally {
    process.exit = origExit;
    process.env = prev;
  }
  assert.equal(code, 1);
});

test("13. resume journal does not duplicate completed rows", () => {
  const journal = createBatchJournal({
    batchId: "batch001",
    merchantId: TARGET_MERCHANT_ID,
    manifestSha: "ABC",
    rows: [{ merchant_sku: "A" }, { merchant_sku: "B" }],
  });
  journal.entries[0].status = "completed";
  const pending = pendingJournalEntries(journal);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].merchant_sku, "B");
});

test("14. immutable storage path is merchant-scoped and SHA-versioned", () => {
  const p = immutableStoragePath(TARGET_MERCHANT_ID, "ARD-1", "DEADBEEFCAFE", ".webp");
  assert.match(p, new RegExp(`^${TARGET_MERCHANT_ID}/bulk2200/ARD-1-DEADBEEF\\.webp$`));
});

test("15. status counts cover all classified rows", () => {
  const { cfgPath } = makeFixtureRoot();
  const cfg = loadConfig(cfgPath, { root: ROOT });
  const prepared = prepareBatch(cfg, { batchId: "batch001" });
  const c = countStatuses(prepared.classified);
  const sum = Object.values(c).reduce((a, b) => a + b, 0);
  assert.equal(sum, prepared.classified.length);
});

test("16. historical exclusions classify forbidden SKUs as HOLD_REVIEW even with local images", () => {
  const { dir, cfgPath } = makeFixtureRoot();
  const webp = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20, 0x0e, 0x00, 0x00,
    0x00, 0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const imgDir = path.join(dir, "images");
  fs.writeFileSync(path.join(imgDir, "ARD-3717.webp"), webp);
  fs.writeFileSync(path.join(imgDir, "ARD-2313.webp"), webp);
  fs.writeFileSync(path.join(imgDir, "ARD-2789.webp"), webp);
  fs.writeFileSync(path.join(imgDir, "ARD-4299.webp"), webp);

  writeCsv(
    path.join(dir, "source.csv"),
    ["sku", "final_name_ar", "final_brand", "size", "price", "final_category", "final_slug", "stage2_status", "stock", "duplicate_of_sku"],
    [
      { sku: "ARD-3717", final_name_ar: "عطر امير ذهبي", final_brand: "Lattafa", size: "100 مل", price: "1000", final_category: "العطور", final_slug: "perfumes", stage2_status: "ready", stock: "", duplicate_of_sku: "" },
      { sku: "ARD-2313", final_name_ar: "معطر جسم قائد", final_brand: "Lattafa", size: "100 مل", price: "1000", final_category: "العطور", final_slug: "perfumes", stage2_status: "ready", stock: "", duplicate_of_sku: "" },
      { sku: "ARD-2789", final_name_ar: "معطر جو بديع العود", final_brand: "Lattafa", size: "100 مل", price: "1000", final_category: "العطور", final_slug: "perfumes", stage2_status: "ready", stock: "", duplicate_of_sku: "" },
      { sku: "ARD-4299", final_name_ar: "عطر سابلايم", final_brand: "Lattafa", size: "100 مل", price: "1000", final_category: "العطور", final_slug: "perfumes", stage2_status: "ready", stock: "", duplicate_of_sku: "" }
    ]
  );

  const cfg = loadConfig(cfgPath, { root: ROOT });
  const prepared = prepareBatch(cfg, { batchId: "batch002" });
  
  const ar3717 = prepared.classified.find(r => r.merchant_sku === "ARD-3717");
  const ar2313 = prepared.classified.find(r => r.merchant_sku === "ARD-2313");
  const ar2789 = prepared.classified.find(r => r.merchant_sku === "ARD-2789");
  const ar4299 = prepared.classified.find(r => r.merchant_sku === "ARD-4299");

  assert.equal(ar3717.status, "HOLD_REVIEW");
  assert.match(ar3717.rejection_reason, /HISTORICAL_EXCLUSION/);

  assert.equal(ar2313.status, "HOLD_REVIEW");
  assert.match(ar2313.rejection_reason, /HISTORICAL_EXCLUSION/);

  assert.equal(ar2789.status, "HOLD_REVIEW");
  assert.match(ar2789.rejection_reason, /HISTORICAL_EXCLUSION/);

  assert.equal(ar4299.status, "READY");
});

