#!/usr/bin/env node
/**
 * Build Confirm DB postflight evidence from a SQL export JSON + final CSV.
 * Optionally accepts --products-json path with query result rows.
 * Primary path: reads stdin JSON array of product rows OR file arg.
 *
 * For this run we generate 24 from MCP-fetched data written to tmp.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/batch100");
const GOLDEN = new Set([
  "ARD-1015",
  "ARD-1042",
  "ARD-1065",
  "ARD-1172",
  "ARD-1173",
  "ARD-1191",
  "ARD-3270",
  "ARD-1826",
  "ARD-2800",
  "ARD-3723",
]);
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
  return lines.slice(1).map((line) => {
    const cols = splitCsv(line);
    const row = {};
    hdr.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
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

function cp(s) {
  return [...String(s || "").trim()].length;
}

const productsPath = process.argv[2];
if (!productsPath || !fs.existsSync(productsPath)) {
  console.error(JSON.stringify({ error: "usage: postflight-batch100-confirm.mjs <products.json>" }));
  process.exit(2);
}

const products = JSON.parse(fs.readFileSync(productsPath, "utf8"));
const finalRows = readCsv(path.join(DOCS, "18_BATCH100_FINAL_IMPORT.csv"));
const finalBySku = new Map(finalRows.map((r) => [r.merchant_sku, r]));
const approved = new Set(finalRows.map((r) => r.merchant_sku));

const batch = products.filter((p) => approved.has(p.merchant_sku));
const golden = products.filter((p) => GOLDEN.has(p.merchant_sku));
const dbSkus = new Set(products.map((p) => p.merchant_sku));
const batchSkus = new Set(batch.map((p) => p.merchant_sku));

const errors = [];
const missing = [...approved].filter((s) => !batchSkus.has(s));
const unexpected = [...batchSkus].filter((s) => !approved.has(s));
const allMerchant = products.length;

if (missing.length) errors.push(`missing=${missing.length}`);
if (unexpected.length) errors.push(`unexpected=${unexpected.length}`);
if (batch.length !== 100) errors.push(`batch_rows=${batch.length}`);
if (allMerchant !== 110) errors.push(`merchant_count=${allMerchant} want 110`);

const cat = {};
const postRows = [];
let shortOk = 0;
let detailed = 0;
let privateN = 0;
let inactiveN = 0;
let unpublishedN = 0;
let stock0 = 0;
let discountNull = 0;

for (const p of batch) {
  const f = finalBySku.get(p.merchant_sku);
  const issues = [];
  if (Number(p.stock) !== 0) issues.push("stock");
  else stock0 += 1;
  if (p.is_active !== false) issues.push("is_active");
  else inactiveN += 1;
  if (p.is_published !== false) issues.push("is_published");
  else unpublishedN += 1;
  if (p.visibility_status !== "private") issues.push("visibility");
  else privateN += 1;
  if (p.discount_price != null) issues.push("discount");
  else discountNull += 1;
  if (f) {
    if (String(p.name) !== String(f.name)) issues.push("name");
    if (String(p.slug) !== String(f.slug)) issues.push("slug");
    if (String(p.brand || "") !== String(f.brand || "")) issues.push("brand");
    if (Number(p.price) !== Number(f.price)) issues.push("price");
    if (String(p.image_url || "") !== String(f.image_url || "")) issues.push("image_url");
    if (String(p.short_description || "").trim() !== String(f.short_description || "").trim()) issues.push("short");
    const fd = String(f.description || "").trim();
    const pd = String(p.description || "").trim();
    if (fd !== pd) issues.push("description");
    if (String(p.category_slug || "") !== String(f.category_slug || "") && String(p.category_slug || "") !== "") {
      // category may be joined as slug
      if (p.category_slug && f.category_slug && p.category_slug !== f.category_slug) issues.push("category");
    }
    cat[f.category_slug] = (cat[f.category_slug] || 0) + 1;
  }
  const sn = cp(p.short_description);
  if (sn >= 40 && sn <= 280) shortOk += 1;
  if (String(p.description || "").trim()) detailed += 1;
  if (issues.length) errors.push(`${p.merchant_sku}:${issues.join("|")}`);

  postRows.push({
    merchant_sku: p.merchant_sku,
    product_id: p.id,
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    price: p.price,
    stock: p.stock,
    is_active: p.is_active,
    is_published: p.is_published,
    visibility_status: p.visibility_status,
    discount_price: p.discount_price == null ? "" : p.discount_price,
    category_slug: p.category_slug || "",
    image_url: p.image_url || "",
    short_char_count: sn,
    description_present: String(p.description || "").trim() ? "true" : "false",
    match_final_csv: issues.length === 0 ? "true" : "false",
    issues: issues.join("|"),
  });
}

for (const [k, v] of Object.entries(EXPECTED_CAT)) {
  if ((cat[k] || 0) !== v) errors.push(`cat_${k}=${cat[k] || 0}`);
}

const special = {
  "ARD-4138": batch.find((p) => p.merchant_sku === "ARD-4138")?.name,
  "ARD-2511": batch.find((p) => p.merchant_sku === "ARD-2511")?.name,
  mini: ["ARD-1318", "ARD-1319", "ARD-1320"].map((s) => ({
    sku: s,
    category_slug: batch.find((p) => p.merchant_sku === s)?.category_slug,
  })),
};

writeCsv(
  path.join(DOCS, "24_BATCH100_CONFIRM_DB_POSTFLIGHT.csv"),
  postRows.sort((a, b) => a.merchant_sku.localeCompare(b.merchant_sku)),
  [
    "merchant_sku",
    "product_id",
    "name",
    "slug",
    "brand",
    "price",
    "stock",
    "is_active",
    "is_published",
    "visibility_status",
    "discount_price",
    "category_slug",
    "image_url",
    "short_char_count",
    "description_present",
    "match_final_csv",
    "issues",
  ],
);

const summary = {
  ok: errors.length === 0,
  errors,
  merchant_product_count: allMerchant,
  approved_skus_found: batchSkus.size,
  missing_skus: missing,
  unexpected_skus: unexpected,
  private: privateN,
  inactive: inactiveN,
  unpublished: unpublishedN,
  stock_zero: stock0,
  discount_null: discountNull,
  short_ok: shortOk,
  detailed_descriptions: detailed,
  category_distribution: cat,
  golden10_count: golden.length,
  special,
};
fs.writeFileSync(path.join(DOCS, "24_BATCH100_CONFIRM_DB_POSTFLIGHT_SUMMARY.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exit(1);
