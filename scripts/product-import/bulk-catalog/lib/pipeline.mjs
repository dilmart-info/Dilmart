/**
 * Source inventory + row validation / batch selection.
 */
import fs from "fs";
import path from "path";
import { readCsvFile, writeJson, sha256File } from "./csv.mjs";
import { buildDeterministicSlug, normalizeSku } from "./normalize.mjs";
import { indexLocalImages, resolveImageForSku, immutableStoragePath } from "./images.mjs";
import { DEFAULT_PRODUCT_STATE, TARGET_MERCHANT_ID } from "./constants.mjs";

export function loadCategoryMapping(filePath) {
  const rows = readCsvFile(filePath);
  /** @type {Map<string, {slug:string, name_ar:string, allowed:boolean}>} */
  const bySlug = new Map();
  /** @type {Map<string, string>} */
  const nameToSlug = new Map();
  for (const r of rows) {
    const slug = String(r.category_slug || r.final_slug || "").trim();
    const name = String(r.category_name_ar || r.final_category || "").trim();
    if (!slug) continue;
    const allowed = String(r.allowed || "YES").toUpperCase() !== "NO";
    bySlug.set(slug, { slug, name_ar: name, allowed });
    if (name) nameToSlug.set(name, slug);
  }
  return { bySlug, nameToSlug, rows };
}

export function loadExistingSkus(snapshotPath) {
  if (!snapshotPath || !fs.existsSync(snapshotPath)) return new Set();
  const raw = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const list = Array.isArray(raw) ? raw : raw.products || raw.data || [];
  const set = new Set();
  for (const p of list) {
    const sku = normalizeSku(p.merchant_sku || p.sku);
    if (sku) set.add(sku);
  }
  return set;
}

export function loadExistingSlugs(snapshotPath) {
  if (!snapshotPath || !fs.existsSync(snapshotPath)) return new Set();
  const raw = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const list = Array.isArray(raw) ? raw : raw.products || raw.data || [];
  return new Set(list.map((p) => String(p.slug || "").trim().toLowerCase()).filter(Boolean));
}

/**
 * Inventory the configured source corpus (no writes to production).
 */
export function runInventory(cfg) {
  const sourceRows = readCsvFile(cfg.source_file);
  const cats = loadCategoryMapping(cfg.category_mapping_file);
  const images = indexLocalImages(cfg.image_directories);
  const existing = loadExistingSkus(cfg.existing_catalog_snapshot);

  const skuCounts = new Map();
  for (const r of sourceRows) {
    const sku = normalizeSku(r.sku || r.merchant_sku);
    if (!sku) continue;
    skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1);
  }
  const duplicateSkus = [...skuCounts.entries()].filter(([, n]) => n > 1).map(([s]) => s);

  let rowsWithoutSku = 0;
  let rowsWithoutName = 0;
  let rowsWithoutCategory = 0;
  let rowsWithoutImage = 0;
  let rowsWithMultipleImages = 0;
  let rowsWithPrice = 0;
  let rowsWithStock = 0;
  let categoriesResolved = 0;
  let categoriesUnresolved = 0;
  const unsupportedFields = new Set();
  const known = new Set([
    "sku",
    "merchant_sku",
    "source_code",
    "raw_group",
    "original_name",
    "stage1_name",
    "final_name_ar",
    "name",
    "stage1_brand",
    "final_brand",
    "brand",
    "brand_resolution",
    "brand_source_url",
    "product_type",
    "final_category",
    "category",
    "category_confidence",
    "final_slug",
    "category_slug",
    "size",
    "sizes",
    "price",
    "original_description",
    "basic_description",
    "final_description",
    "description",
    "description_mode",
    "image_status",
    "stock",
    "is_active",
    "stage1_qa",
    "stage2_status",
    "stage2_notes",
    "duplicate_of_sku",
    "pilot_eligible",
    "import_status",
    "__source_row",
  ]);

  for (const r of sourceRows) {
    for (const k of Object.keys(r)) {
      if (!known.has(k)) unsupportedFields.add(k);
    }
    const sku = normalizeSku(r.sku || r.merchant_sku);
    const name = String(r.final_name_ar || r.name || r.stage1_name || r.original_name || "").trim();
    const catName = String(r.final_category || r.category || "").trim();
    const catSlug = String(r.final_slug || r.category_slug || cats.nameToSlug.get(catName) || "").trim();
    if (!sku) rowsWithoutSku += 1;
    if (!name) rowsWithoutName += 1;
    if (!catName && !catSlug) rowsWithoutCategory += 1;
    else if (catSlug && cats.bySlug.has(catSlug) && cats.bySlug.get(catSlug).allowed) categoriesResolved += 1;
    else if (catName && cats.nameToSlug.has(catName)) categoriesResolved += 1;
    else categoriesUnresolved += 1;

    const imgs = sku ? images.bySku.get(sku) || [] : [];
    if (!imgs.length) rowsWithoutImage += 1;
    if (imgs.length > 1) rowsWithMultipleImages += 1;
    if (String(r.price ?? "").trim() !== "") rowsWithPrice += 1;
    if (String(r.stock ?? "").trim() !== "") rowsWithStock += 1;
  }

  const orphanImages = [];
  for (const [sku, paths] of images.bySku.entries()) {
    if (!skuCounts.has(sku)) orphanImages.push({ sku, paths });
  }

  const report = {
    source_file: cfg.source_file,
    source_workbook: cfg.source_workbook,
    source_file_sha256: fs.existsSync(cfg.source_file) ? sha256File(cfg.source_file) : null,
    source_workbook_sha256_documented: "44064E6B38FED755A9A860111AFFD200C1A59B1A88877980C662C970C2B3A239",
    total_source_rows: sourceRows.length,
    total_unique_skus: skuCounts.size,
    duplicate_skus: duplicateSkus.length,
    duplicate_sku_list: duplicateSkus.slice(0, 50),
    rows_without_sku: rowsWithoutSku,
    rows_without_name: rowsWithoutName,
    rows_without_category: rowsWithoutCategory,
    rows_without_image: rowsWithoutImage,
    rows_with_multiple_images: rowsWithMultipleImages,
    rows_with_price: rowsWithPrice,
    rows_with_stock: rowsWithStock,
    unsupported_or_unknown_fields: [...unsupportedFields].sort(),
    image_files_found: images.totalFiles,
    image_skus_indexed: images.bySku.size,
    orphan_images: orphanImages.length,
    orphan_image_examples: orphanImages.slice(0, 20),
    missing_image_references: rowsWithoutImage,
    categories_resolved: categoriesResolved,
    categories_unresolved: categoriesUnresolved,
    existing_catalog_sku_count: existing.size,
    source_sku_collisions: [...skuCounts.keys()].filter((s) => existing.has(s)).length,
    production_storage_writes: false,
    production_db_writes: false,
  };

  return { report, sourceRows, cats, images, existing };
}

export function loadHistoricalExclusions(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return new Map();
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const map = new Map();
  const list = Array.isArray(raw) ? raw : raw.exclusions || [];
  for (const item of list) {
    const sku = normalizeSku(item.merchant_sku || item.sku);
    if (sku) {
      map.set(sku, {
        reason: String(item.reason || "HISTORICAL_EXCLUSION").trim(),
        status: String(item.status || "HOLD_REVIEW").trim(),
      });
    }
  }
  return map;
}

/**
 * Classify one source row (before batch selection cap).
 */
export function classifyRow(row, ctx) {
  const { cats, images, existing, seenSkus, seenSlugs, merchantId, defaults, exclusions } = ctx;
  const sourceRow = row.__source_row;
  const sku = normalizeSku(row.sku || row.merchant_sku);
  const name = String(row.final_name_ar || row.name || row.stage1_name || row.original_name || "").trim();
  const brand = String(row.final_brand || row.brand || row.stage1_brand || "").trim();
  const size = String(row.size || row.sizes || "").trim();
  const catName = String(row.final_category || row.category || "").trim();
  const catSlugRaw = String(row.final_slug || row.category_slug || cats.nameToSlug.get(catName) || "").trim();
  const stage2 = String(row.stage2_status || "").trim();
  const priceRaw = String(row.price ?? "").trim();
  const priceStatus = priceRaw === "" ? "ABSENT" : Number.isFinite(Number(priceRaw)) ? "VALID" : "INVALID";

  const base = {
    source_row: sourceRow,
    merchant_sku: sku,
    normalized_name: name,
    brand,
    size,
    category_slug: catSlugRaw,
    category_name_ar: catName,
    price_source_status: priceStatus,
    price_source_value: priceStatus === "VALID" ? Number(priceRaw) : null,
    stage2_status: stage2,
    defaults: { ...defaults },
    source_identity: {
      source_code: String(row.source_code || ""),
      original_name: String(row.original_name || ""),
      product_type: String(row.product_type || ""),
      duplicate_of_sku: String(row.duplicate_of_sku || ""),
    },
  };

  if (!sku || !name) {
    return {
      ...base,
      status: "REJECT_REQUIRED_FIELD",
      rejection_reason: !sku ? "MISSING_SKU" : "MISSING_NAME",
    };
  }

  if (seenSkus.has(sku)) {
    return { ...base, status: "REJECT_DUPLICATE", rejection_reason: "DUPLICATE_SKU_IN_SOURCE" };
  }
  seenSkus.add(sku);

  if (existing.has(sku)) {
    return { ...base, status: "SKIP_EXISTING_SKU", rejection_reason: "SKU_ALREADY_IN_CATALOG" };
  }

  if (sku && exclusions?.has(sku)) {
    const excl = exclusions.get(sku);
    return {
      ...base,
      status: excl.status || "HOLD_REVIEW",
      rejection_reason: `HISTORICAL_EXCLUSION:${excl.reason}`,
    };
  }

  if (stage2 === "merchant_confirmation" || stage2 === "duplicate_hold") {
    return { ...base, status: "HOLD_REVIEW", rejection_reason: `STAGE2:${stage2 || "empty"}` };
  }

  const cat = cats.bySlug.get(catSlugRaw);
  if (!catSlugRaw || !cat || !cat.allowed) {
    return { ...base, status: "REJECT_CATEGORY", rejection_reason: catSlugRaw ? "CATEGORY_NOT_ALLOWED" : "CATEGORY_UNRESOLVED" };
  }

  let slug;
  try {
    slug = buildDeterministicSlug(name, sku);
  } catch {
    return { ...base, status: "REJECT_REQUIRED_FIELD", rejection_reason: "SLUG_BUILD_FAILED" };
  }
  if (seenSlugs.has(slug) || ctx.existingSlugs.has(slug)) {
    return { ...base, slug, status: "REJECT_DUPLICATE", rejection_reason: "DUPLICATE_SLUG" };
  }
  seenSlugs.add(slug);

  const img = resolveImageForSku(images.bySku, sku);
  const allowMetadataStaging = ctx.cfg ? ctx.cfg.allow_metadata_staging === true : false;

  if (!img.ok) {
    if (allowMetadataStaging) {
      return {
        ...base,
        slug,
        status: "READY",
        image_readiness_status: "IMAGE_PENDING",
        rejection_reason: "",
        image_source: null,
        normalized_image_path: null,
        image_sha256: null,
      };
    }
    return {
      ...base,
      slug,
      status: "REJECT_IMAGE",
      image_readiness_status: "IMAGE_PENDING",
      rejection_reason: img.code,
      image_source: null,
      normalized_image_path: null,
      image_sha256: null,
    };
  }

  if (ctx.identityAudit || ctx.provenanceMap) {
    const audit = ctx.identityAudit ? ctx.identityAudit.get(sku) : null;
    const prov = ctx.provenanceMap ? ctx.provenanceMap.get(sku) : null;

    if (!audit) {
      return { ...base, slug, status: "HOLD_REVIEW", rejection_reason: "IDENTITY_AUDIT_MISSING" };
    }
    if (audit.identity_decision !== "EXACT_MATCH") {
      return { ...base, slug, status: "HOLD_REVIEW", rejection_reason: `IDENTITY_NOT_EXACT:${audit.decision_reason || "audit_hold"}` };
    }
    if (audit.image_sha256 && audit.image_sha256 !== img.sha256) {
      return { ...base, slug, status: "HOLD_REVIEW", rejection_reason: "IDENTITY_SHA_MISMATCH" };
    }
    if (audit.shared_sha_group_size > 1 && !audit.shared_sha_reviewed) {
      return { ...base, slug, status: "HOLD_REVIEW", rejection_reason: "UNREVIEWED_SHARED_SHA" };
    }

    if (!prov) {
      return { ...base, slug, status: "HOLD_REVIEW", rejection_reason: "PROVENANCE_MISSING" };
    }
    if (String(prov.review_status || "").toUpperCase() !== "APPROVED") {
      return { ...base, slug, status: "HOLD_REVIEW", rejection_reason: "PROVENANCE_NOT_APPROVED" };
    }
    if (String(prov.identity_match || "").toUpperCase() !== "YES") {
      return { ...base, slug, status: "HOLD_REVIEW", rejection_reason: "PROVENANCE_IDENTITY_NOT_CONFIRMED" };
    }
    if (prov.sha256 && String(prov.sha256).toUpperCase() !== String(img.sha256).toUpperCase()) {
      return { ...base, slug, status: "HOLD_REVIEW", rejection_reason: "PROVENANCE_SHA_MISMATCH" };
    }

    const sourceType = String(audit.source_type || prov.source_type || "").trim();
    const prodUrl = String(audit.source_product_url || prov.source_product_url || "").trim();
    const imgUrl = String(audit.image_source_url || prov.image_source_url || "").trim();
    const pageId = String(audit.source_page_identity || prov.notes || "").trim();
    const pageBrand = String(audit.source_page_brand || audit.catalog_brand || "").trim();

    let isTraceable = false;
    if (sourceType === "local_file") {
      if (prodUrl.length > 0 && imgUrl.length > 0 && audit.decision_reason) {
        isTraceable = true;
      }
    } else {
      if (prodUrl.length > 0 && imgUrl.length > 0 && pageId.length > 0 && pageBrand.length > 0) {
        isTraceable = true;
      }
    }

    if (!isTraceable) {
      if (!prodUrl) return { ...base, slug, status: "HOLD_REVIEW", rejection_reason: "IDENTITY_SOURCE_MISSING" };
      if (!imgUrl) return { ...base, slug, status: "HOLD_REVIEW", rejection_reason: "PROVENANCE_SOURCE_MISSING" };
      if (!pageId) return { ...base, slug, status: "HOLD_REVIEW", rejection_reason: "IDENTITY_PAGE_IDENTITY_MISSING" };
      return { ...base, slug, status: "HOLD_REVIEW", rejection_reason: "IDENTITY_EVIDENCE_INSUFFICIENT" };
    }
  }

  const storagePath = immutableStoragePath(merchantId, sku, img.sha256, ".webp");
  return {
    ...base,
    slug,
    status: "READY",
    image_readiness_status: "IMAGE_VERIFIED",
    rejection_reason: "",
    image_source: img.path,
    normalized_image_path: storagePath,
    image_sha256: img.sha256,
    image_mime: img.mime,
  };
}

export function loadIdentityAudit(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const list = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const map = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    const sku = normalizeSku(item.merchant_sku || item.sku);
    if (sku) map.set(sku, item);
  }
  return map;
}

export function loadProvenanceMap(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const list = readCsvFile(filePath);
  const map = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    const sku = normalizeSku(item.merchant_sku || item.sku);
    if (sku) map.set(sku, item);
  }
  return map;
}

/**
 * Deterministic Batch selection: stable source order, first N READY rows.
 * Non-READY rows before the cap are still recorded in the full classification;
 * the batch manifest includes all evaluated rows up to the point the READY cap
 * is filled (plus trailing rejects encountered while scanning), or the whole
 * corpus classification summary for dry-run.
 */
export function prepareBatch(cfg, { batchId, root = process.cwd() }) {
  const inv = runInventory(cfg);
  const { sourceRows, cats, images, existing } = inv;
  const existingSlugs = loadExistingSlugs(cfg.existing_catalog_snapshot);
  const primaryExclusions = cfg.historical_exclusions_file || path.join(cfg.docs_dir || "docs/product-import/bulk2200", "06_HISTORICAL_EXCLUSIONS.json");
  const fallbackExclusions = path.join(root, "docs/product-import/bulk2200", "06_HISTORICAL_EXCLUSIONS.json");
  const exclusionsFile = fs.existsSync(primaryExclusions) ? primaryExclusions : fallbackExclusions;
  const exclusions = loadHistoricalExclusions(exclusionsFile);

  const auditPath = path.join(cfg.docs_dir || "docs/product-import/bulk2200", batchId, "06_IDENTITY_AUDIT.json");
  const identityAudit = loadIdentityAudit(auditPath);

  const provPath = path.join(cfg.docs_dir || "docs/product-import/bulk2200", batchId, "05_IMAGE_PROVENANCE.csv");
  const provenanceMap = loadProvenanceMap(provPath);

  const seenSkus = new Set();
  const seenSlugs = new Set();
  const ctx = {
    cats,
    images,
    existing,
    existingSlugs,
    exclusions,
    identityAudit,
    provenanceMap,
    seenSkus,
    seenSlugs,
    merchantId: cfg.merchant_id || TARGET_MERCHANT_ID,
    defaults: cfg.default_product_state || DEFAULT_PRODUCT_STATE,
    cfg,
  };

  const classified = [];
  for (const row of sourceRows) {
    classified.push(classifyRow(row, ctx));
  }

  const readyAll = classified.filter((r) => r.status === "READY");
  const selectedReady = readyAll.slice(0, cfg.batch_size);
  const selectedSkuSet = new Set(selectedReady.map((r) => r.merchant_sku));

  const toRel = (p) => {
    if (!p) return "";
    const absRoot = String(root).replace(/\\/g, "/");
    const absP = String(p).replace(/\\/g, "/");
    if (absP.toLowerCase().startsWith(absRoot.toLowerCase() + "/")) {
      return absP.slice(absRoot.length + 1);
    }
    return p;
  };

  const manifestRows = selectedReady.map((r) => ({
    batch_id: batchId,
    source_row_number: r.source_row,
    merchant_sku: r.merchant_sku,
    normalized_name: r.normalized_name,
    slug: r.slug,
    category: r.category_slug,
    brand: r.brand,
    size: r.size,
    price_source_status: r.price_source_status,
    image_readiness_status: r.image_readiness_status || (r.normalized_image_path ? "IMAGE_VERIFIED" : "IMAGE_PENDING"),
    image_source: toRel(r.image_source),
    normalized_image_path: r.normalized_image_path || "",
    image_sha256: r.image_sha256 || "",
    validation_status: r.status,
    rejection_reason: r.rejection_reason || "",
  }));

  const counts = countStatuses(classified);
  return {
    batchId,
    classified,
    manifestRows,
    selectedReady,
    selectedSkuSet,
    counts,
    inventory: inv.report,
    cats,
    images,
    existing,
  };
}

export function countStatuses(rows) {
  const counts = {
    READY: 0,
    SKIP_EXISTING_SKU: 0,
    REJECT_DUPLICATE: 0,
    REJECT_REQUIRED_FIELD: 0,
    REJECT_CATEGORY: 0,
    REJECT_IMAGE: 0,
    HOLD_REVIEW: 0,
  };
  for (const r of rows) {
    if (counts[r.status] != null) counts[r.status] += 1;
  }
  return counts;
}

export function buildDryRunReport(cfg, prepared) {
  const { counts, selectedReady, classified, batchId } = prepared;
  const wouldCreate = selectedReady.length;
  const imageVerifiedCount = selectedReady.filter(
    (r) => r.image_readiness_status === "IMAGE_VERIFIED" || Boolean(r.normalized_image_path),
  ).length;
  const imagePendingCount = wouldCreate - imageVerifiedCount;

  return {
    batch_id: batchId,
    mode: "dry-run",
    merchant_id: cfg.merchant_id,
    merchant_slug: cfg.merchant_slug,
    batch_size_cap: cfg.batch_size,
    selected_rows: wouldCreate,
    would_create: wouldCreate,
    image_verified_rows: imageVerifiedCount,
    image_pending_rows: imagePendingCount,
    existing_sku_skips: counts.SKIP_EXISTING_SKU,
    invalid_rejects:
      counts.REJECT_REQUIRED_FIELD + counts.REJECT_CATEGORY + counts.REJECT_IMAGE + counts.REJECT_DUPLICATE,
    duplicate_rejects: counts.REJECT_DUPLICATE,
    category_mapping_failures: counts.REJECT_CATEGORY,
    missing_image_failures: classified.filter((r) => r.status === "REJECT_IMAGE" && r.rejection_reason === "MISSING_IMAGE")
      .length,
    image_normalization_failures: classified.filter(
      (r) => r.status === "REJECT_IMAGE" && r.rejection_reason !== "MISSING_IMAGE",
    ).length,
    hold_review: counts.HOLD_REVIEW,
    status_counts: counts,
    public_state_defaults: cfg.default_product_state,
    expected_storage_object_count: imageVerifiedCount,
    expected_db_insert_count: wouldCreate,
    production_storage_writes: false,
    production_db_writes: false,
    zero_writes_performed: true,
    every_row_has_one_status: classified.every((r) =>
      ["READY", "SKIP_EXISTING_SKU", "REJECT_DUPLICATE", "REJECT_REQUIRED_FIELD", "REJECT_CATEGORY", "REJECT_IMAGE", "HOLD_REVIEW"].includes(
        r.status,
      ),
    ),
  };
}
