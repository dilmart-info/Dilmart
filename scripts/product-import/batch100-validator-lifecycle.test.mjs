/**
 * Batch100 validator lifecycle tests — no network / no production calls.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import {
  EXPECTED_FINAL_CSV_SHA256,
  EXPECTED_IMPORT_ID,
  MERCHANT_ID,
  parsePhaseArg,
  validateBatch100,
  validateUploadStatuses,
} from "./lib/batch100-validator.mjs";

function shortFor(sku, idx) {
  if (idx === 0) {
    return "عطر شرقي خشبي للجنسين بحجم مئة مل من علامة موثوقة بتركيبة دافئة ومتوازنة للاستخدام اليومي.";
  }
  return "بخاخ منزلي معطر برائحة نظيفة ومنعشة مناسب لغرف المعيشة والمفارش دون ادعاءات طبية.";
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(file, headers, rows) {
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h] ?? "")).join(","));
  fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
}

function baseSku(i) {
  return `ARD-T${String(i).padStart(3, "0")}`;
}

function makeDocsDir({ n = 2, uploadStatus = "not_uploaded", includePostEvidence = false, mutate = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "batch100-val-"));
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const sku = baseSku(i);
    const sha = crypto.createHash("sha256").update(sku).digest("hex").toUpperCase();
    rows.push({ sku, sha });
  }

  const masterHeaders = [
    "merchant_sku",
    "name",
    "slug",
    "brand",
    "sizes",
    "category_path",
    "category_slug",
    "price",
    "image_url",
    "short_description",
    "description",
    "stock",
    "is_active",
    "is_published",
    "visibility_status",
    "discount_price",
    "official_product_name",
  ];
  writeCsv(
    path.join(dir, "02_BATCH100_MASTER.csv"),
    masterHeaders,
    rows.map((r, idx) => ({
      merchant_sku: r.sku,
      name: `منتج ${r.sku}`,
      slug: `product-${r.sku.toLowerCase()}`,
      brand: "Lattafa",
      sizes: "100 مل",
      category_path: "العطور والمعطرات > العطور",
      category_slug: idx === 0 ? "perfumes" : "home-linen-air",
      price: "10000",
      image_url: "",
      short_description: shortFor(r.sku, idx),
      description: "desc",
      stock: "0",
      is_active: "false",
      is_published: "false",
      visibility_status: "private",
      discount_price: "",
      official_product_name: `Official ${r.sku}`,
    })),
  );

  writeCsv(
    path.join(dir, "05_BATCH100_CATEGORY_DISTRIBUTION.csv"),
    ["category_slug", "category_path", "selected_count", "share_pct"],
    [
      { category_slug: "perfumes", category_path: "x", selected_count: String(Math.ceil(n / 2)), share_pct: "50" },
      {
        category_slug: "home-linen-air",
        category_path: "y",
        selected_count: String(Math.floor(n / 2)),
        share_pct: "50",
      },
    ],
  );

  writeCsv(
    path.join(dir, "06_BATCH100_IMPORT_READY.csv"),
    [
      "sku",
      "name",
      "slug",
      "brand",
      "sizes",
      "category_slug",
      "price",
      "image_url",
      "short_description",
      "description",
      "stock",
      "is_active",
      "is_published",
      "visibility_status",
      "discount_price",
      "merchant_id",
    ],
    rows.map((r, idx) => ({
      sku: r.sku,
      name: `منتج ${r.sku}`,
      slug: `product-${r.sku.toLowerCase()}`,
      brand: "Lattafa",
      sizes: "100 مل",
      category_slug: "perfumes",
      price: "10000",
      image_url: "",
      short_description: shortFor(r.sku, idx),
      description: "desc",
      stock: "0",
      is_active: "false",
      is_published: "false",
      visibility_status: "private",
      discount_price: "",
      merchant_id: MERCHANT_ID,
    })),
  );

  writeCsv(
    path.join(dir, "10_BATCH100_IDENTITY_REVIEW.csv"),
    [
      "merchant_sku",
      "identity_status",
      "catalog_name_ar",
      "official_product_name",
      "catalog_identity_match_status",
      "catalog_identity_match_notes",
    ],
    rows.map((r) => ({
      merchant_sku: r.sku,
      identity_status: "VERIFIED",
      catalog_name_ar: `منتج ${r.sku}`,
      official_product_name: `Official ${r.sku}`,
      catalog_identity_match_status: "EXACT_MATCH",
      catalog_identity_match_notes: "test fixture",
    })),
  );

  const imageHeaders = [
    "merchant_sku",
    "prepared_image_path",
    "mime",
    "width",
    "height",
    "file_size",
    "sha256",
    "identity_status",
    "duplicate_status",
    "storage_path",
    "public_url",
    "upload_status",
    "upload_http_status",
    "public_get_status",
    "remote_sha256",
    "sha_match",
    "verified_at",
  ];

  writeCsv(
    path.join(dir, "04_BATCH100_IMAGE_MANIFEST.csv"),
    imageHeaders,
    rows.map((r) => {
      const status = mutate.uploadStatusBySku?.[r.sku] || uploadStatus;
      const verified = status === "uploaded_verified" || status === "already_present_verified";
      return {
        merchant_sku: r.sku,
        prepared_image_path: "",
        mime: mutate.mime || "image/webp",
        width: "1200",
        height: "1200",
        file_size: "12345",
        sha256: r.sha,
        identity_status: "VERIFIED",
        duplicate_status: "unique",
        storage_path: `${MERCHANT_ID}/${r.sku}.webp`,
        public_url: verified
          ? `https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/${MERCHANT_ID}/${r.sku}.webp`
          : "",
        upload_status: status,
        upload_http_status: verified ? "201" : "",
        public_get_status: mutate.publicGet ?? (verified ? "200" : ""),
        remote_sha256: mutate.remoteSha ?? (verified ? (mutate.badSha ? "DEADBEEF" : r.sha) : ""),
        sha_match: mutate.shaMatch ?? (verified ? "true" : ""),
        verified_at: verified ? "2026-08-04T00:00:00.000Z" : "",
      };
    }),
  );

  if (includePostEvidence) {
    writeCsv(
      path.join(dir, "16_BATCH100_UPLOAD_RESULT.csv"),
      ["merchant_sku", "upload_status", "public_get_status", "sha_match"],
      rows.map((r) => ({
        merchant_sku: r.sku,
        upload_status: "uploaded_verified",
        public_get_status: "200",
        sha_match: "true",
      })),
    );

    const finalHeaders = [
      "merchant_sku",
      "name",
      "slug",
      "brand",
      "sizes",
      "category_path",
      "category_slug",
      "price",
      "image_url",
      "short_description",
      "description",
      "stock",
      "is_active",
      "is_published",
      "visibility_status",
      "discount_price",
    ];
    const finalRows = rows.map((r, idx) => ({
      merchant_sku: r.sku,
      name: `منتج ${r.sku}`,
      slug: `product-${r.sku.toLowerCase()}`,
      brand: "Lattafa",
      sizes: "100 مل",
      category_path: "العطور والمعطرات > العطور",
      category_slug: "perfumes",
      price: "10000",
      image_url: `https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/${MERCHANT_ID}/${r.sku}.webp`,
      short_description: shortFor(r.sku, idx),
      description: "desc",
      stock: "0",
      is_active: "false",
      is_published: "false",
      visibility_status: "private",
      discount_price: "",
    }));
    const finalPath = path.join(dir, "18_BATCH100_FINAL_IMPORT.csv");
    writeCsv(finalPath, finalHeaders, finalRows);

    const previewTotal = mutate.previewTotal ?? n;
    const previewValid = mutate.previewValid ?? n;
    const previewInvalid = mutate.previewInvalid ?? 0;
    const importId = mutate.importId ?? EXPECTED_IMPORT_ID;
    fs.writeFileSync(
      path.join(dir, "19_BATCH100_PREVIEW_RESPONSE_SAFE.json"),
      JSON.stringify({
        http_status: 201,
        import_id: importId,
        summary: {
          total_rows: previewTotal,
          valid_rows: previewValid,
          invalid_rows: previewInvalid,
          warnings_count: 0,
        },
        response: {
          import_id: importId,
          summary: {
            total_rows: previewTotal,
            valid_rows: previewValid,
            invalid_rows: previewInvalid,
            warnings_count: 0,
          },
        },
      }),
    );
    fs.writeFileSync(
      path.join(dir, "20_BATCH100_PREVIEW_DEEP_VERIFY.json"),
      JSON.stringify({
        ok: mutate.deepOk ?? true,
        import_id: importId,
        total: previewTotal,
        valid: previewValid,
        invalid: previewInvalid,
        status: mutate.deepStatus ?? "previewed",
        errors: [],
      }),
    );
  }

  return dir;
}

test("parsePhaseArg: missing phase fails closed", () => {
  const r = parsePhaseArg([]);
  assert.equal(r.ok, false);
  assert.match(r.error, /MISSING_PHASE/);
});

test("13. Unknown phase fails", () => {
  const r = parsePhaseArg(["--phase=weird"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /UNKNOWN_PHASE/);
});

test("1. PRE_UPLOAD accepts not_uploaded rows", () => {
  const images = [
    { merchant_sku: "A", upload_status: "not_uploaded" },
    { merchant_sku: "B", upload_status: "not_uploaded" },
  ];
  const r = validateUploadStatuses(images, "PRE_UPLOAD");
  assert.equal(r.errors.length, 0);
});

test("2. PRE_UPLOAD rejects uploaded_verified", () => {
  const images = [{ merchant_sku: "A", upload_status: "uploaded_verified" }];
  const r = validateUploadStatuses(images, "PRE_UPLOAD");
  assert.ok(r.errors.some((e) => e.includes("not not_uploaded")));
});

test("3. POST_UPLOAD accepts uploaded_verified", () => {
  const images = [
    {
      merchant_sku: "ARD-T001",
      upload_status: "uploaded_verified",
      public_get_status: "200",
      sha_match: "true",
      public_url: "https://x/y.webp",
      remote_sha256: "AAA",
      sha256: "AAA",
      storage_path: `${MERCHANT_ID}/ARD-T001.webp`,
      mime: "image/webp",
    },
  ];
  const r = validateUploadStatuses(images, "POST_UPLOAD_PREVIEWED");
  assert.equal(r.errors.length, 0);
  assert.equal(r.verifiedUpload, 1);
});

test("4. POST_UPLOAD accepts already_present_verified", () => {
  const images = [
    {
      merchant_sku: "ARD-T001",
      upload_status: "already_present_verified",
      public_get_status: "200",
      sha_match: "true",
      public_url: "https://x/y.webp",
      remote_sha256: "AAA",
      sha256: "AAA",
      storage_path: `${MERCHANT_ID}/ARD-T001.webp`,
      mime: "image/webp",
    },
  ];
  const r = validateUploadStatuses(images, "POST_UPLOAD_PREVIEWED");
  assert.equal(r.errors.length, 0);
  assert.equal(r.alreadyPresent, 1);
});

test("5. POST_UPLOAD rejects not_uploaded", () => {
  const images = [{ merchant_sku: "A", upload_status: "not_uploaded" }];
  const r = validateUploadStatuses(images, "POST_UPLOAD_PREVIEWED");
  assert.ok(r.errors.some((e) => e.includes("not_uploaded not allowed")));
});

test("6. POST_UPLOAD rejects failed", () => {
  const images = [{ merchant_sku: "A", upload_status: "failed" }];
  const r = validateUploadStatuses(images, "POST_UPLOAD_PREVIEWED");
  assert.ok(r.errors.some((e) => e.includes("failed")));
});

test("7. POST_UPLOAD rejects indeterminate", () => {
  const images = [{ merchant_sku: "A", upload_status: "indeterminate_mismatch" }];
  const r = validateUploadStatuses(images, "POST_UPLOAD_PREVIEWED");
  assert.ok(r.errors.some((e) => e.includes("indeterminate")));
});

test("8. POST_UPLOAD rejects missing public GET", () => {
  const images = [
    {
      merchant_sku: "ARD-T001",
      upload_status: "uploaded_verified",
      public_get_status: "",
      sha_match: "true",
      public_url: "https://x/y.webp",
      remote_sha256: "AAA",
      sha256: "AAA",
      storage_path: `${MERCHANT_ID}/ARD-T001.webp`,
      mime: "image/webp",
    },
  ];
  const r = validateUploadStatuses(images, "POST_UPLOAD_PREVIEWED");
  assert.ok(r.errors.some((e) => e.includes("public_get_status not 200")));
});

test("9. POST_UPLOAD rejects SHA mismatch", () => {
  const images = [
    {
      merchant_sku: "ARD-T001",
      upload_status: "uploaded_verified",
      public_get_status: "200",
      sha_match: "false",
      public_url: "https://x/y.webp",
      remote_sha256: "BBB",
      sha256: "AAA",
      storage_path: `${MERCHANT_ID}/ARD-T001.webp`,
      mime: "image/webp",
    },
  ];
  const r = validateUploadStatuses(images, "POST_UPLOAD_PREVIEWED");
  assert.ok(r.errors.some((e) => /sha/i.test(e)));
});

test("10. POST_UPLOAD rejects missing Preview evidence", () => {
  const dir = makeDocsDir({ n: 2, uploadStatus: "uploaded_verified", includePostEvidence: false });
  const report = validateBatch100({
    phase: "POST_UPLOAD_PREVIEWED",
    docsDir: dir,
    expectedRows: 2,
    requireLocalImages: false,
    expectedFinalSha: "IGNORE",
  });
  // Force SHA check skip by providing matching sha of missing file — evidence files absent
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((e) => e.includes("missing Preview evidence")));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("11. POST_UPLOAD rejects Preview 99/100 style mismatch", () => {
  const dir = makeDocsDir({
    n: 2,
    uploadStatus: "uploaded_verified",
    includePostEvidence: true,
    mutate: { previewTotal: 2, previewValid: 1, previewInvalid: 1 },
  });
  // Compute actual final sha so SHA gate does not mask preview gate
  const finalPath = path.join(dir, "18_BATCH100_FINAL_IMPORT.csv");
  const sha = crypto.createHash("sha256").update(fs.readFileSync(finalPath)).digest("hex").toUpperCase();
  const report = validateBatch100({
    phase: "POST_UPLOAD_PREVIEWED",
    docsDir: dir,
    expectedRows: 2,
    requireLocalImages: false,
    expectedFinalSha: sha,
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((e) => e.includes("Preview total/valid/invalid")));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("12. POST_UPLOAD rejects changed final CSV SHA", () => {
  const dir = makeDocsDir({
    n: 2,
    uploadStatus: "uploaded_verified",
    includePostEvidence: true,
  });
  const report = validateBatch100({
    phase: "POST_UPLOAD_PREVIEWED",
    docsDir: dir,
    expectedRows: 2,
    requireLocalImages: false,
    expectedFinalSha: EXPECTED_FINAL_CSV_SHA256, // production SHA; fixture differs
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((e) => e.includes("final CSV SHA-256 mismatch")));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("14. No production/network calls during CI validation helpers", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("network forbidden in validator tests");
  };
  try {
    const dir = makeDocsDir({ n: 2, uploadStatus: "not_uploaded" });
    const report = validateBatch100({
      phase: "PRE_UPLOAD",
      docsDir: dir,
      expectedRows: 2,
      requireLocalImages: false,
    });
    assert.equal(report.ok, true);
    assert.equal(fetchCalled, false);
    fs.rmSync(dir, { recursive: true, force: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PRE_UPLOAD fixture integration accepts not_uploaded", () => {
  const dir = makeDocsDir({ n: 2, uploadStatus: "not_uploaded" });
  const report = validateBatch100({
    phase: "PRE_UPLOAD",
    docsDir: dir,
    expectedRows: 2,
    requireLocalImages: false,
  });
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("PRE_UPLOAD fixture rejects uploaded_verified", () => {
  const dir = makeDocsDir({ n: 2, uploadStatus: "uploaded_verified" });
  const report = validateBatch100({
    phase: "PRE_UPLOAD",
    docsDir: dir,
    expectedRows: 2,
    requireLocalImages: false,
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((e) => e.includes("not not_uploaded")));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("POST_UPLOAD fixture accepts uploaded_verified with matching evidence", () => {
  const dir = makeDocsDir({
    n: 2,
    uploadStatus: "uploaded_verified",
    includePostEvidence: true,
  });
  const finalPath = path.join(dir, "18_BATCH100_FINAL_IMPORT.csv");
  const sha = crypto.createHash("sha256").update(fs.readFileSync(finalPath)).digest("hex").toUpperCase();
  const report = validateBatch100({
    phase: "POST_UPLOAD_PREVIEWED",
    docsDir: dir,
    expectedRows: 2,
    requireLocalImages: false,
    expectedFinalSha: sha,
    expectedImportId: EXPECTED_IMPORT_ID,
  });
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  fs.rmSync(dir, { recursive: true, force: true });
});
