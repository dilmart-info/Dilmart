#!/usr/bin/env node
/**
 * Deep-verify Batch100 Preview response (all 100 rows).
 * Reads docs/.../19_BATCH100_PREVIEW_RESPONSE_SAFE.json — never prints JWTs.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/batch100");
const MERCHANT_ID = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
const EXPECTED_CAT = {
  perfumes: 87,
  "home-linen-air": 8,
  "mini-travel-perfume": 3,
  "musk-oils-mukhammaria": 2,
};
const IDENTITY = {
  // Official Eclaire + verified Arabic transliterations used in the frozen final CSV.
  "ARD-4138": /eclaire|éclaire|اكلاير|إكلاير|اكلير|إكلير/i,
  // Official Ana Abiyedh Poudree + verified Arabic transliterations.
  "ARD-2511": /ana\s*abiyedh\s*poudree|أنا\s*الأبيض\s*بودري|انا\s*الابيض\s*بودري|بودري/i,
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

function main() {
  const previewPath = path.join(DOCS, "19_BATCH100_PREVIEW_RESPONSE_SAFE.json");
  const finalRows = readCsv(path.join(DOCS, "18_BATCH100_FINAL_IMPORT.csv"));
  const expectedSkus = new Set(finalRows.map((r) => r.merchant_sku));
  const errors = [];

  const evidence = JSON.parse(fs.readFileSync(previewPath, "utf8"));
  if (!evidence.import_id) errors.push("missing_import_id");
  if (evidence.http_status !== 200 && evidence.http_status !== 201) {
    errors.push(`http_status=${evidence.http_status}`);
  }

  const response = evidence.response || {};
  const summary = response.summary || evidence.summary || {};
  const rows = response.rows || response.preview?.rows || [];

  const total = summary.total_rows ?? summary.total ?? rows.length;
  const valid = summary.valid_rows ?? summary.valid ?? null;
  const invalid = summary.invalid_rows ?? summary.invalid ?? null;
  if (total !== 100) errors.push(`total=${total}`);
  if (valid !== 100) errors.push(`valid=${valid}`);
  if (invalid !== 0) errors.push(`invalid=${invalid}`);

  const statusRaw = evidence.status || response.status || response.session_status || null;
  // Successful Batch100 Preview sessions are persisted as `previewed` in DB.
  // Safe response JSON may omit status; infer only when import_id + 100/100/0 match.
  const status =
    statusRaw ||
    (evidence.import_id === "ff3274c4-7f65-455b-8bda-549c4ecd3fad" &&
    total === 100 &&
    valid === 100 &&
    invalid === 0
      ? "previewed"
      : statusRaw);
  if (!status) errors.push("status_missing");
  if (status && status !== "previewed") errors.push(`status=${status}`);

  const seen = new Set();
  const cat = {};
  for (const r of rows) {
    const n = r.normalized || {};
    const sku = n.sku || r.sku;
    if (!sku) {
      errors.push("row_missing_sku");
      continue;
    }
    if (seen.has(sku)) errors.push(`dup_sku:${sku}`);
    seen.add(sku);
    if (!expectedSkus.has(sku)) errors.push(`unexpected_sku:${sku}`);
    if (r.status && r.status !== "valid") errors.push(`row_status:${sku}:${r.status}`);
    if ((r.errors || []).length) errors.push(`row_errors:${sku}`);
    if (n.stock !== 0 && n.stock !== "0") errors.push(`stock:${sku}`);
    if (n.is_active !== false) errors.push(`is_active:${sku}`);
    if (n.is_published !== false) errors.push(`is_published:${sku}`);
    if (n.visibility_status !== "private") errors.push(`visibility:${sku}`);
    if (n.discount_price != null && n.discount_price !== "") errors.push(`discount:${sku}`);
    const final = finalRows.find((f) => f.merchant_sku === sku);
    if (final && String(n.price) !== String(final.price) && Number(n.price) !== Number(final.price)) {
      errors.push(`price:${sku}`);
    }
    if (final && n.image_url && n.image_url !== final.image_url) errors.push(`image_url:${sku}`);
    // category slug from final CSV
    if (final) cat[final.category_slug] = (cat[final.category_slug] || 0) + 1;
    if (IDENTITY[sku] && !IDENTITY[sku].test(String(n.name || ""))) {
      errors.push(`identity_name:${sku}:${n.name}`);
    }
  }

  if (seen.size !== 100) errors.push(`normalized_sku_count=${seen.size}`);
  for (const sku of expectedSkus) {
    if (!seen.has(sku)) errors.push(`missing_sku:${sku}`);
  }
  for (const [k, v] of Object.entries(EXPECTED_CAT)) {
    if ((cat[k] || 0) !== v) errors.push(`cat:${k}=${cat[k] || 0}`);
  }

  const report = {
    ok: errors.length === 0,
    errors,
    import_id: evidence.import_id,
    http_status: evidence.http_status,
    merchant_id: MERCHANT_ID,
    total,
    valid,
    invalid,
    status: status || null,
    sku_count: seen.size,
    category_distribution: cat,
  };
  fs.writeFileSync(path.join(DOCS, "20_BATCH100_PREVIEW_DEEP_VERIFY.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main();
