#!/usr/bin/env node
/**
 * Phase B finalize after successful Batch100 upload (do not re-upload).
 * - Verify 16_BATCH100_UPLOAD_RESULT.csv
 * - Update 04_BATCH100_IMAGE_MANIFEST.csv
 * - Generate 18_BATCH100_FINAL_IMPORT.csv (+ API preview CSV)
 * - SHA-256 + local validation gates
 * Never prints secrets.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/batch100");
const TMP = path.join(ROOT, ".tmp-product-import/ard-al-khaleej/batch100");
const MERCHANT_ID = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
const PUBLIC_PREFIX =
  "https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/";

const EXPECTED_CAT = {
  perfumes: 87,
  "home-linen-air": 8,
  "mini-travel-perfume": 3,
  "musk-oils-mukhammaria": 2,
};

function splitCsv(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
  const lines = text.split(/\r?\n/);
  const hdr = splitCsv(lines[0]);
  return {
    header: hdr,
    rows: lines.slice(1).map((line) => {
      const cols = splitCsv(line);
      const row = {};
      hdr.forEach((h, i) => {
        row[h] = cols[i] ?? "";
      });
      return row;
    }),
  };
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath, rows, headers) {
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h] ?? "")).join(","));
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex").toUpperCase();
}

function cp(s) {
  return [...String(s || "")].length;
}

async function headPublic(url) {
  const res = await fetch(url, { method: "GET" });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    contentType: res.headers.get("content-type") || "",
    sha: crypto.createHash("sha256").update(buf).digest("hex").toUpperCase(),
    bytes: buf.length,
  };
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function main() {
  const upload = readCsv(path.join(DOCS, "16_BATCH100_UPLOAD_RESULT.csv"));
  const manifest = readCsv(path.join(DOCS, "04_BATCH100_IMAGE_MANIFEST.csv"));
  const master = readCsv(path.join(DOCS, "02_BATCH100_MASTER.csv"));
  const ready = readCsv(path.join(DOCS, "06_BATCH100_IMPORT_READY.csv"));

  const errors = [];
  if (upload.rows.length !== 100) errors.push(`upload_rows=${upload.rows.length}`);
  if (manifest.rows.length !== 100) errors.push(`manifest_rows=${manifest.rows.length}`);
  if (master.rows.length !== 100) errors.push(`master_rows=${master.rows.length}`);

  const bySkuUpload = new Map(upload.rows.map((r) => [r.merchant_sku, r]));
  const bySkuMaster = new Map(master.rows.map((r) => [r.merchant_sku, r]));
  const bySkuReady = new Map(ready.rows.map((r) => [r.sku || r.merchant_sku, r]));

  const skus = manifest.rows.map((r) => r.merchant_sku);
  if (new Set(skus).size !== 100) errors.push("duplicate_sku_in_manifest");

  let uploadedVerified = 0;
  let alreadyPresent = 0;
  let shaMatch = 0;
  let public200 = 0;
  for (const m of manifest.rows) {
    const u = bySkuUpload.get(m.merchant_sku);
    if (!u) {
      errors.push(`missing_upload_row:${m.merchant_sku}`);
      continue;
    }
    if (!["uploaded_verified", "already_present_verified"].includes(u.upload_status)) {
      errors.push(`bad_upload_status:${m.merchant_sku}:${u.upload_status}`);
    }
    if (u.upload_status === "uploaded_verified") uploadedVerified++;
    if (u.upload_status === "already_present_verified") alreadyPresent++;
    if (u.sha_match === "true") shaMatch++;
    if (String(u.public_get_status) === "200") public200++;
    if (u.local_sha256 && m.sha256 && u.local_sha256.toUpperCase() !== m.sha256.toUpperCase()) {
      errors.push(`manifest_local_sha_mismatch:${m.merchant_sku}`);
    }
    if (u.remote_sha256 && u.local_sha256 && u.remote_sha256.toUpperCase() !== u.local_sha256.toUpperCase()) {
      errors.push(`remote_local_sha_mismatch:${m.merchant_sku}`);
    }
    const expectedPath = `${MERCHANT_ID}/${m.merchant_sku}.webp`;
    if (u.storage_path !== expectedPath) errors.push(`bad_storage_path:${m.merchant_sku}`);
    const expectedUrl = `${PUBLIC_PREFIX}${expectedPath}`;
    if (u.public_url !== expectedUrl) errors.push(`bad_public_url:${m.merchant_sku}`);
  }

  if (uploadedVerified + alreadyPresent !== 100) errors.push("verified_images_ne_100");
  if (shaMatch !== 100) errors.push("sha_match_ne_100");
  if (public200 !== 100) errors.push("public_get_ne_100");

  // Update manifest with final upload evidence
  const manifestHeaders = [
    "merchant_sku",
    "source_type",
    "identity_source_type",
    "image_source_type",
    "source_page_url",
    "source_image_url",
    "prepared_image_path",
    "mime",
    "width",
    "height",
    "file_size",
    "sha256",
    "perceptual_hash",
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

  const updatedManifest = manifest.rows.map((m) => {
    const u = bySkuUpload.get(m.merchant_sku);
    return {
      ...m,
      storage_path: u.storage_path,
      public_url: u.public_url,
      upload_status: u.upload_status,
      upload_http_status: u.upload_http_status || "",
      public_get_status: u.public_get_status || "",
      remote_sha256: u.remote_sha256 || "",
      sha_match: u.sha_match || "",
      verified_at: u.verified_at || "",
    };
  });
  writeCsv(path.join(DOCS, "04_BATCH100_IMAGE_MANIFEST.csv"), updatedManifest, manifestHeaders);

  // Final evidence CSV (task fields)
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

  const finalRows = [];
  const catCounts = {};
  for (const m of updatedManifest) {
    const masterRow = bySkuMaster.get(m.merchant_sku);
    const readyRow = bySkuReady.get(m.merchant_sku);
    if (!masterRow) {
      errors.push(`missing_master:${m.merchant_sku}`);
      continue;
    }
    const imageUrl = m.public_url;
    const short = masterRow.short_description || readyRow?.short_description || "";
    const desc = masterRow.description || readyRow?.description || "";
    const n = cp(short);
    if (n < 40 || n > 280) errors.push(`short_len:${m.merchant_sku}:${n}`);
    if (String(masterRow.stock) !== "0" && String(readyRow?.stock ?? "0") !== "0") {
      // force fixed values below
    }
    const slug = masterRow.category_slug;
    catCounts[slug] = (catCounts[slug] || 0) + 1;

    finalRows.push({
      merchant_sku: m.merchant_sku,
      name: masterRow.name,
      slug: masterRow.slug,
      brand: masterRow.brand,
      sizes: masterRow.sizes,
      category_path: masterRow.category_path,
      category_slug: masterRow.category_slug,
      price: masterRow.price,
      image_url: imageUrl,
      short_description: short,
      description: desc,
      stock: "0",
      is_active: "false",
      is_published: "false",
      visibility_status: "private",
      discount_price: "",
    });
  }

  for (const [k, v] of Object.entries(EXPECTED_CAT)) {
    if (catCounts[k] !== v) errors.push(`cat_dist:${k}=${catCounts[k]} expected ${v}`);
  }

  writeCsv(path.join(DOCS, "18_BATCH100_FINAL_IMPORT.csv"), finalRows, finalHeaders);
  const finalSha = sha256File(path.join(DOCS, "18_BATCH100_FINAL_IMPORT.csv"));

  // API-compatible preview CSV (KNOWN_CSV_COLUMNS only)
  const previewHeaders = [
    "name",
    "short_description",
    "description",
    "category",
    "price",
    "discount_price",
    "stock",
    "sku",
    "brand",
    "size",
    "is_active",
    "is_published",
    "visibility_status",
    "image_url",
  ];
  const previewRows = finalRows.map((r) => ({
    name: r.name,
    short_description: r.short_description,
    description: r.description,
    category: r.category_slug, // leaf slug; hierarchy also accepted via path if needed
    price: r.price,
    discount_price: "",
    stock: "0",
    sku: r.merchant_sku,
    brand: r.brand,
    size: r.sizes,
    is_active: "false",
    is_published: "false",
    visibility_status: "private",
    image_url: r.image_url,
  }));
  fs.mkdirSync(TMP, { recursive: true });
  const previewPath = path.join(TMP, "18_BATCH100_PREVIEW_UPLOAD.csv");
  writeCsv(previewPath, previewRows, previewHeaders);
  const previewSha = sha256File(previewPath);

  // Spot-check ALL image URLs (required)
  console.log(JSON.stringify({ phase: "image_url_validation_start", n: finalRows.length }));
  const urlChecks = await mapPool(finalRows, 8, async (r) => {
    const got = await headPublic(r.image_url);
    const expectedSha = bySkuUpload.get(r.merchant_sku)?.local_sha256?.toUpperCase();
    return {
      sku: r.merchant_sku,
      status: got.status,
      contentType: got.contentType,
      sha_match: expectedSha && got.sha === expectedSha,
      mime_ok: /webp|octet-stream/i.test(got.contentType),
    };
  });
  const urlFail = urlChecks.filter((c) => c.status !== 200 || !c.sha_match || !c.mime_ok);
  if (urlFail.length) {
    errors.push(`image_url_fail_count=${urlFail.length}`);
    for (const f of urlFail.slice(0, 5)) errors.push(`image_url_fail:${f.sku}:${f.status}`);
  }

  const report = {
    ok: errors.length === 0,
    errors,
    upload_summary: {
      uploaded_verified: uploadedVerified,
      already_present_verified: alreadyPresent,
      sha_match: shaMatch,
      public_get_200: public200,
    },
    category_distribution: catCounts,
    final_csv: "docs/product-import/ard-al-khaleej/batch100/18_BATCH100_FINAL_IMPORT.csv",
    final_csv_sha256: finalSha,
    preview_upload_csv: previewPath,
    preview_upload_sha256: previewSha,
    image_url_validation: {
      checked: urlChecks.length,
      pass: urlChecks.length - urlFail.length,
      fail: urlFail.length,
    },
  };
  fs.writeFileSync(path.join(TMP, "phase-b-finalize.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});
