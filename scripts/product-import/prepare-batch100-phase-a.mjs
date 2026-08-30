#!/usr/bin/env node
/**
 * DilMart-ARD-AL-KHALEEJ-BATCH100-001 — Phase A preparation (no upload / no Preview).
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
// xlsx loaded dynamically only for legacy Phase A workbook path

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const WB = path.join(
  ROOT,
  ".tmp-product-import/ard-al-khaleej/Ard_Al_Khaleej_Catalog_Stage3_Pilot_Batches_AB_v4.xlsx",
);
const CLASS_CSV = path.join(
  ROOT,
  "docs/product-import/ard-al-khaleej/category-taxonomy/02_FULL_CATALOG_CLASSIFICATION.csv",
);
const OUT_DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/batch100");
const OUT_TMP = path.join(ROOT, ".tmp-product-import/ard-al-khaleej/batch100");
const MERCHANT_ID = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
const STORAGE_PREFIX =
  "https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/";

const PILOT = new Set([
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

/** Target counts — pro-hair-color-care has 0 ready leaves → redistributed below. */
const TARGET = {
  perfumes: 51, // was 50; +1 redistributed from pro-hair-color-care
  "body-mist-splash": 14,
  "home-linen-air": 12,
  "mini-travel-perfume": 6,
  "musk-oils-mukhammaria": 5,
  "incense-maamoul": 4,
  "body-bath-care": 3,
  "hair-care-fragrance": 3,
  "powder-makeup": 2,
  // pro-hair-color-care: 0 — no ready assignable candidates (all merchant_confirmation)
};

const CATEGORY_PATH = {
  perfumes: "العطور والمعطرات > العطور",
  "body-mist-splash": "العطور والمعطرات > معطرات الجسم والبودي مست",
  "home-linen-air": "العطور والمعطرات > معطرات المنزل والمفارش والجو",
  "mini-travel-perfume": "العطور والمعطرات > العطور الصغيرة والميني",
  "musk-oils-mukhammaria": "العطور والمعطرات > المسك والمخمريات والعطور الزيتية",
  "incense-maamoul": "العطور والمعطرات > البخور والمعمول",
  "body-bath-care": "العناية الشخصية والتجميل > العناية بالجسم والاستحمام",
  "hair-care-fragrance": "العناية الشخصية والتجميل > العناية بالشعر وعطور الشعر",
  "powder-makeup": "العناية الشخصية والتجميل > البودرة ومنتجات التجميل",
  "pro-hair-color-care": "صبغة ومستلزمات صالون للشعر",
};

const PREFERRED_BRANDS = [
  "Lattafa",
  "RAVE",
  "Asdaaf",
  "Ard Al Zaafaran",
  "Maison Alhambra",
  "Alhambra",
];

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

function parseCsvFile(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/);
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
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  }
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function codePoints(s) {
  return [...String(s || "")].length;
}

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function brandScore(brand) {
  const b = String(brand || "").trim();
  const i = PREFERRED_BRANDS.findIndex((x) => x.toLowerCase() === b.toLowerCase());
  return i >= 0 ? i : 50 + b.length;
}

function slugifySku(name, sku) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "product"}-${String(sku).toLowerCase()}`.replace(/-+/g, "-");
}

/** Safe short description — no longevity/projection/origin claims. Unique per SKU via name. */
function buildShortDescription(row) {
  const brand = String(row.brand || "").trim() || "علامة موثّقة";
  const size = String(row.size || "").trim();
  const type = String(row.product_type || "منتج").trim();
  const name = String(row.name || "").trim();
  const sizePart = size ? ` بحجم ${size}` : "";
  const nameBit = name ? ` «${name}»` : "";
  let text =
    `${type}${nameBit} من ${brand}${sizePart} ضمن دفعة أرض الخليج الخاصة، ` +
    `بوصف يعتمد هوية المنتج والعلامة والحجم فقط دون ادعاءات غير موثّقة.`;
  text = text.replace(/\s+/g, " ").trim();
  if (codePoints(text) > 280) {
    text = [...text].slice(0, 278).join("").trim();
  }
  if (codePoints(text) < 40) {
    text = `${type} من ${brand}${sizePart} لمنتجات أرض الخليج — بيانات هوية أساسية فقط للعرض الخاص قبل النشر.`;
  }
  return text;
}

function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

function loadImageUrlMap(wb, xlsx) {
  const map = new Map();
  for (const sheetName of ["17_STAGE3_BATCH_A", "19_STAGE3_BATCH_B", "18_IMAGE_UPLOAD_MANIFEST"]) {
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
    for (const r of rows) {
      const sku = String(r.sku || "").trim().toUpperCase();
      const url = String(r.image_candidate_url || r.candidate_url || "").trim();
      if (sku && url) map.set(sku, { url, sheet: sheetName, confidence: r.image_confidence || "" });
    }
  }
  return map;
}

async function main() {
  if (!fs.existsSync(WB)) throw new Error(`Workbook missing: ${WB}`);
  fs.mkdirSync(OUT_DOCS, { recursive: true });
  fs.mkdirSync(path.join(OUT_TMP, "images"), { recursive: true });

  // Phase A2: if final identity + local images exist, regenerate docs via enrich pipeline
  // instead of recreating forbidden Phase-A placeholder short descriptions.
  const finalIdentity = path.join(OUT_TMP, "final-100-identity.json");
  const enrichPy = path.join(__dirname, "enrich-batch100-phase-a2.py");
  if (fs.existsSync(finalIdentity) && fs.existsSync(enrichPy)) {
    console.log(
      JSON.stringify({
        mode: "phase_a2_enrich",
        note: "Delegating to enrich-batch100-phase-a2.py (identity/assets enrichment).",
        final_identity: finalIdentity,
      }),
    );
    const r = spawnSync("python", [enrichPy], { cwd: ROOT, encoding: "utf8", env: process.env });
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.status) process.exit(r.status);
    return;
  }

  const wbHash = sha256File(WB);
  const wbSize = fs.statSync(WB).size;
  const xlsx = (await import("xlsx")).default;
  const wb = xlsx.readFile(WB);
  const sheetNames = wb.SheetNames;
  const master = xlsx.utils.sheet_to_json(wb.Sheets["11_STAGE2_MASTER"], { defval: "" });
  const masterBySku = new Map(
    master.map((r) => [String(r.sku || "").trim().toUpperCase(), r]),
  );
  const statusCounts = {};
  for (const r of master) {
    const k = String(r.stage2_status || "");
    statusCounts[k] = (statusCounts[k] || 0) + 1;
  }

  const classRows = parseCsvFile(CLASS_CSV);
  const imageMap = loadImageUrlMap(wb, xlsx);

  const rejected = [];
  const pools = Object.fromEntries(Object.keys(TARGET).map((k) => [k, []]));

  for (const c of classRows) {
    const sku = String(c.sku || "").trim().toUpperCase();
    const m = masterBySku.get(sku) || {};
    const price = Number(c.price || m.price || 0);
    const slug = String(c.final_slug || "").trim();
    const brand = String(m.final_brand || c.brand || "").trim();
    const brandRes = String(m.brand_resolution || "").trim();
    const size = String(c.size || m.size || "").trim();
    const name = String(m.final_name_ar || c.name || "").trim();
    const productType = String(c.product_type || m.product_type || "").trim();
    const stage2 = String(c.stage2_status || m.stage2_status || "").trim();
    const confidence = String(c.confidence || "").trim();
    const img = imageMap.get(sku);

    const base = {
      merchant_sku: sku,
      name,
      brand,
      size,
      price,
      product_type: productType,
      final_slug: slug,
      final_category: c.final_category,
      stage2_status: stage2,
      confidence,
      brand_resolution: brandRes,
      category_path: CATEGORY_PATH[slug] || c.final_category,
      image_candidate_url: img?.url || "",
      image_source_sheet: img?.sheet || "",
    };

    const reject = (reason) => rejected.push({ ...base, reject_reason: reason });

    if (PILOT.has(sku)) {
      reject("existing_golden_pilot");
      continue;
    }
    if (stage2 === "merchant_confirmation") {
      reject("merchant_confirmation");
      continue;
    }
    if (stage2 === "duplicate_primary" || stage2 === "duplicate_hold") {
      reject(`status_${stage2}`);
      continue;
    }
    if (stage2 !== "ready") {
      reject(`status_${stage2 || "unknown"}`);
      continue;
    }
    if (!(price > 0)) {
      reject("missing_or_invalid_price");
      continue;
    }
    if (!brand || brandRes === "needs_review") {
      reject("unresolved_brand");
      continue;
    }
    if (!slug || !CATEGORY_PATH[slug]) {
      if (slug === "pro-hair-color-care") reject("pro_hair_not_ready_redistributed");
      else reject("unresolved_or_non_target_category");
      continue;
    }
    if (confidence !== "high") {
      reject("taxonomy_confidence_not_high");
      continue;
    }
    // Image gate tracked separately — catalog-wide missing except Stage3.
    pools[slug].push(base);
  }

  // Deterministic rank: preferred brands first, then has size, then sku
  for (const slug of Object.keys(pools)) {
    pools[slug].sort((a, b) => {
      const ba = brandScore(a.brand) - brandScore(b.brand);
      if (ba !== 0) return ba;
      const sa = (a.size ? 0 : 1) - (b.size ? 0 : 1);
      if (sa !== 0) return sa;
      const ia = (a.image_candidate_url ? 0 : 1) - (b.image_candidate_url ? 0 : 1);
      if (ia !== 0) return ia;
      return a.merchant_sku.localeCompare(b.merchant_sku);
    });
  }

  const selected = [];
  const usedSkus = new Set();
  for (const [slug, need] of Object.entries(TARGET)) {
    const pool = pools[slug] || [];
    let took = 0;
    for (const row of pool) {
      if (took >= need) break;
      if (usedSkus.has(row.merchant_sku)) continue;
      usedSkus.add(row.merchant_sku);
      selected.push({ ...row, selected_slug: slug });
      took += 1;
    }
    if (took < need) {
      throw new Error(`Insufficient candidates for ${slug}: need ${need}, got ${took}`);
    }
  }

  // Mark non-selected pool members as rejected for report sample
  for (const slug of Object.keys(pools)) {
    for (const row of pools[slug]) {
      if (!usedSkus.has(row.merchant_sku)) {
        rejected.push({ ...row, reject_reason: "not_selected_quota_filled" });
      }
    }
  }

  const stage3BySku = new Map();
  for (const sheetName of ["17_STAGE3_BATCH_A", "19_STAGE3_BATCH_B"]) {
    for (const r of xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" })) {
      const sku = String(r.sku || "").trim().toUpperCase();
      if (sku) stage3BySku.set(sku, r);
    }
  }

  // Enrich content
  const shortSeen = new Map();
  const masterRows = [];
  const evidenceRows = [];
  const imageRows = [];
  const importRows = [];
  let fullOfficial = 0;
  let shortOnly = 0;
  let secondary = 0;
  let withImageCandidate = 0;

  for (const row of selected) {
    let short = buildShortDescription(row);
    // Ensure exact uniqueness
    let n = 1;
    while (shortSeen.has(short)) {
      short = `${[...buildShortDescription(row)].slice(0, 160).join("")} · ${row.merchant_sku}`.replace(/\s+/g, " ").trim();
      n += 1;
      if (n > 8) break;
    }
    shortSeen.set(short, row.merchant_sku);

    let description = "";
    let sourceType = "catalog_identity_only";
    let sourceUrl = "";
    let contentStatus = "SHORT_ONLY";
    const stage3 = stage3BySku.get(row.merchant_sku);
    if (
      stage3 &&
      String(stage3.verified_description || "").trim() &&
      String(stage3.description_source_type || "").toLowerCase() === "official"
    ) {
      description = String(stage3.verified_description).trim();
      sourceType = "Official manufacturer";
      sourceUrl = String(stage3.description_source_url || "").trim();
      contentStatus = "FULL_OFFICIAL";
      fullOfficial += 1;
    } else {
      description = "";
      shortOnly += 1;
    }

    const plannedPath = `${MERCHANT_ID}/${row.merchant_sku}.webp`;
    const plannedUrl = `${STORAGE_PREFIX}${plannedPath}`;
    const hasImg = Boolean(row.image_candidate_url);
    if (hasImg) withImageCandidate += 1;

    const shortCount = codePoints(short);
    masterRows.push({
      merchant_sku: row.merchant_sku,
      name: row.name,
      slug: slugifySku(row.name, row.merchant_sku),
      brand: row.brand,
      sizes: row.size || "",
      category_path: row.category_path,
      category_slug: row.selected_slug,
      price: row.price,
      image_url: plannedUrl,
      short_description: short,
      description,
      stock: 0,
      is_active: false,
      is_published: false,
      visibility_status: "private",
      discount_price: "",
      short_char_count: shortCount,
      content_status: contentStatus,
      image_status: hasImg ? "candidate_url_known_not_downloaded" : "missing",
      brand_resolution: row.brand_resolution,
    });

    evidenceRows.push({
      merchant_sku: row.merchant_sku,
      official_product_name: row.name,
      brand: row.brand,
      size: row.size || "",
      short_description: short,
      description,
      source_type: sourceType,
      source_url: sourceUrl,
      identity_confidence: row.confidence,
      content_status: contentStatus,
      review_notes: hasImg
        ? "Stage3 candidate image URL recorded; Phase A did not download/upload."
        : "Catalog image_status=missing; no verified candidate URL in workbook.",
    });

    imageRows.push({
      merchant_sku: row.merchant_sku,
      source_image: row.image_candidate_url || "",
      prepared_image: "",
      mime: "",
      width: "",
      height: "",
      file_size: "",
      sha256: "",
      identity_status: hasImg ? "candidate_pending_review" : "missing",
      storage_path: plannedPath,
      upload_status: "not_uploaded",
    });

    importRows.push({
      name: row.name,
      short_description: short,
      description,
      category: row.category_path,
      price: row.price,
      discount_price: "",
      stock: 0,
      sku: row.merchant_sku,
      brand: row.brand,
      size: row.size || "",
      is_active: false,
      is_published: false,
      visibility_status: "private",
      image_url: plannedUrl,
    });
  }

  // Duplicate analysis
  const shortMap = new Map();
  for (const r of masterRows) {
    const k = r.short_description;
    shortMap.set(k, (shortMap.get(k) || 0) + 1);
  }
  const exactDupes = [...shortMap.values()].filter((n) => n > 1).length;

  // Similarity (prefix 40 code points)
  let highlySimilar = 0;
  const prefixes = masterRows.map((r) => [...r.short_description].slice(0, 40).join(""));
  for (let i = 0; i < prefixes.length; i++) {
    for (let j = i + 1; j < prefixes.length; j++) {
      if (prefixes[i] && prefixes[i] === prefixes[j]) highlySimilar += 1;
    }
  }

  const distRows = Object.entries(TARGET).map(([slug, count]) => ({
    category_slug: slug,
    category_path: CATEGORY_PATH[slug],
    target_count: count,
    selected_count: masterRows.filter((r) => r.category_slug === slug).length,
    pool_size: (pools[slug] || []).length,
  }));
  distRows.push({
    category_slug: "pro-hair-color-care",
    category_path: CATEGORY_PATH["pro-hair-color-care"],
    target_count: 0,
    selected_count: 0,
    pool_size: 0,
  });

  writeCsv(
    path.join(OUT_DOCS, "02_BATCH100_MASTER.csv"),
    masterRows,
    [
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
      "short_char_count",
      "content_status",
      "image_status",
      "brand_resolution",
    ],
  );
  writeCsv(
    path.join(OUT_DOCS, "03_BATCH100_CONTENT_EVIDENCE.csv"),
    evidenceRows,
    [
      "merchant_sku",
      "official_product_name",
      "brand",
      "size",
      "short_description",
      "description",
      "source_type",
      "source_url",
      "identity_confidence",
      "content_status",
      "review_notes",
    ],
  );
  writeCsv(
    path.join(OUT_DOCS, "04_BATCH100_IMAGE_MANIFEST.csv"),
    imageRows,
    [
      "merchant_sku",
      "source_image",
      "prepared_image",
      "mime",
      "width",
      "height",
      "file_size",
      "sha256",
      "identity_status",
      "storage_path",
      "upload_status",
    ],
  );
  writeCsv(path.join(OUT_DOCS, "05_BATCH100_CATEGORY_DISTRIBUTION.csv"), distRows, [
    "category_slug",
    "category_path",
    "target_count",
    "selected_count",
    "pool_size",
  ]);
  writeCsv(
    path.join(OUT_DOCS, "06_BATCH100_IMPORT_READY.csv"),
    importRows,
    [
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
    ],
  );

  // Cap rejected export to keep file useful (all rejection reasons, max 5000)
  const rejectedExport = rejected.slice(0, 5000).map((r) => ({
    merchant_sku: r.merchant_sku,
    name: r.name,
    brand: r.brand,
    category_slug: r.final_slug || "",
    stage2_status: r.stage2_status,
    price: r.price,
    reject_reason: r.reject_reason,
  }));
  writeCsv(path.join(OUT_DOCS, "07_BATCH100_REJECTED_CANDIDATES.csv"), rejectedExport, [
    "merchant_sku",
    "name",
    "brand",
    "category_slug",
    "stage2_status",
    "price",
    "reject_reason",
  ]);

  const importSha = sha256File(path.join(OUT_DOCS, "06_BATCH100_IMPORT_READY.csv"));
  const missingImages = imageRows.filter((r) => r.identity_status === "missing").length;
  const invalidShort = masterRows.filter((r) => r.short_char_count < 40 || r.short_char_count > 280).length;

  const summary = {
    workbook: {
      path: WB,
      sha256: wbHash,
      size: wbSize,
      sheets: sheetNames,
      catalog_total: master.length,
      status_counts: statusCounts,
    },
    redistribution: {
      from: "pro-hair-color-care",
      to: "perfumes",
      count: 1,
      reason:
        "No ready high-confidence assignable leaf candidates for pro-hair-color-care (rows are merchant_confirmation only).",
    },
    selected: masterRows.length,
    rejected_recorded: rejected.length,
    distribution: Object.fromEntries(distRows.map((d) => [d.category_slug, d.selected_count])),
    content: {
      full_official: fullOfficial,
      short_only: shortOnly,
      secondary: secondary,
      exact_duplicate_shorts: exactDupes,
      highly_similar_prefix40_pairs: highlySimilar,
      invalid_short_length: invalidShort,
    },
    images: {
      missing: missingImages,
      candidate_url_known: withImageCandidate,
      prepared_local: 0,
      note: "Workbook image_status=missing for all 2204 catalog rows; only Stage3 A/B/manifest hold a few candidate URLs (mostly Golden).",
    },
    gates: {
      batch_rows: masterRows.length,
      unique_skus: new Set(masterRows.map((r) => r.merchant_sku)).size,
      hold: 0,
      confirmation_in_batch: 0,
      duplicate_skus: 0,
      missing_short: masterRows.filter((r) => !r.short_description).length,
      invalid_short_length: invalidShort,
      missing_images: missingImages,
    },
    import_ready_csv: path.join(OUT_DOCS, "06_BATCH100_IMPORT_READY.csv"),
    import_ready_sha256: importSha,
    phase_a_judgment: missingImages === 0 && exactDupes === 0 && invalidShort === 0 ? "PASS" : "NO-GO",
  };

  fs.writeFileSync(path.join(OUT_TMP, "phase-a-summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DOCS, "_phase_a_summary.json"), JSON.stringify(summary, null, 2));

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
