import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { readCsvFile, sha256File, writeJson } from "./csv.mjs";
import { assertSafeDefaults } from "./config.mjs";
import { decodeImageMetadata, immutableStoragePath, sniffMime } from "./images.mjs";
import { loadCategoryMapping } from "./pipeline.mjs";
import { isProductionReadOnlyRuntimeAdapter } from "./runtime-adapters.mjs";
import {
  BULK_CANARY_COUNT,
  EXPECTED_POSTFLIGHT_PRODUCT_COUNT,
  EXPECTED_PREFLIGHT_PRODUCT_COUNT,
  FROZEN_BATCH_ID,
  FROZEN_MANIFEST_SHA256,
  FROZEN_SOURCE_SHA256,
  FROZEN_SELECTED_COUNT,
  PUBLIC_BASE,
  TARGET_MERCHANT_ID,
  TARGET_MERCHANT_SLUG,
  assertBulkExecuteAuthorized,
  resolveBatchContract,
} from "./constants.mjs";
import {
  assertJournalBinding,
  createBatchJournal,
  loadJournal,
  saveJournal,
  transitionJournalEntry,
} from "./journal.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_FIELDS = Object.freeze({
  visibility_status: "private",
  is_active: false,
  is_published: false,
  stock: 0,
});

function runtimeContract(overrides = {}, env = process.env) {
  const batchId = overrides.batchId || FROZEN_BATCH_ID;
  const base = resolveBatchContract(batchId);
  const allowOverrides = env.NODE_ENV === "test" && env.BULK2200_TEST_MODE === "1";
  if (!allowOverrides) {
    return base;
  }
  return {
    batchId: base.batchId,
    manifestSha: overrides.manifestSha || base.manifestSha,
    sourceSha: overrides.sourceSha || base.sourceSha,
    selectedCount: overrides.selectedCount || base.selectedCount,
    currentProductCount: overrides.currentProductCount ?? base.currentProductCount,
    postflightProductCount: overrides.postflightProductCount ?? base.postflightProductCount,
    canaryCount: overrides.canaryCount || base.canaryCount,
    expectedMerchantStatus: overrides.expectedMerchantStatus ?? base.expectedMerchantStatus,
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256Json(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex").toUpperCase();
}

export function getGitState({ root, env = process.env } = {}) {
  let actualHead = null;
  let status = null;
  try {
    actualHead = execSync("git rev-parse HEAD", {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    status = execSync("git status --porcelain --untracked-files=all", {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return { ok: false, actualHead, approvedHead: null, headMatch: false, clean: false, errors: ["GIT_STATE_UNAVAILABLE"] };
  }
  const dirty = String(status)
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => {
      const raw = line.slice(3).split(" -> ").pop().replace(/^"|"$/g, "").replace(/\\/g, "/");
      return !raw.startsWith(".tmp-product-import/");
    });
  const approvedHead = env.BULK2200_APPROVED_HEAD_SHA || null;
  const errors = [];
  if (dirty.length) errors.push("WORKTREE_NOT_CLEAN");
  if (!approvedHead) errors.push("APPROVED_HEAD_REQUIRED");
  else if (approvedHead !== actualHead) errors.push("APPROVED_HEAD_MISMATCH");
  return {
    ok: errors.length === 0,
    actualHead,
    approvedHead,
    headMatch: Boolean(approvedHead && approvedHead === actualHead),
    clean: dirty.length === 0,
    errors,
  };
}

function manifestPath(cfg, batchId) {
  return path.join(cfg.docs_dir, batchId, `01_${batchId.toUpperCase()}_MANIFEST.csv`);
}

function flattenCategories(categories) {
  const out = [];
  const visit = (row, parentId = null) => {
    if (!row || typeof row !== "object") return;
    const copy = { ...row, parent_id: row.parent_id ?? parentId };
    delete copy.children;
    out.push(copy);
    for (const child of row.children || []) visit(child, row.id);
  };
  for (const row of categories || []) visit(row);
  return out;
}

export function buildCategoryIndex(categories) {
  const flat = flattenCategories(categories);
  const activeChildren = new Set(
    flat.filter((row) => row.parent_id && row.is_active !== false).map((row) => row.parent_id),
  );
  const bySlug = new Map();
  for (const row of flat) {
    if (!row.slug || row.is_active === false || activeChildren.has(row.id)) continue;
    const slug = String(row.slug).trim();
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(row);
  }
  return bySlug;
}

function sourceRowsByNumber(cfg) {
  const rows = readCsvFile(cfg.source_file);
  return {
    byRow: new Map(rows.map((row) => [String(row.__source_row), row])),
  };
}

function productPublicUrl(storagePath) {
  return `${PUBLIC_BASE}/${storagePath}`;
}

function shortDescription(source) {
  return String(source.basic_description || source.final_description || source.description || "").trim();
}

function description(source) {
  return String(source.final_description || source.basic_description || source.description || "").trim();
}

function buildWirePayload({ manifest, source, categoryId }) {
  return {
    name: String(manifest.normalized_name).trim(),
    slug: String(manifest.slug).trim(),
    description: description(source),
    short_description: shortDescription(source),
    price: Number(source.price),
    discount_price: null,
    category_id: categoryId,
    stock: 0,
    purchase_price: 0,
    low_stock_threshold: 5,
    is_active: false,
    is_published: false,
    visibility_status: "private",
    is_featured: false,
    is_new: false,
    is_best_seller: false,
    offer_ends_at: null,
    images:
      String(manifest.image_readiness_status || "").toUpperCase() === "IMAGE_PENDING" || !manifest.normalized_image_path
        ? []
        : [productPublicUrl(manifest.normalized_image_path)],
    loyalty_points_enabled: false,
    merchant_id: TARGET_MERCHANT_ID,
    merchant_sku: String(manifest.merchant_sku).trim().toUpperCase(),
    brand: String(manifest.brand || "").trim() || null,
    colors: [],
    sizes: String(manifest.size || "").trim() ? [String(manifest.size).trim()] : [],
    dimensions: null,
    weight_grams: null,
  };
}

export function validateProductPayload(payload) {
  const errors = [];
  if (!payload.name || payload.name.length < 2 || payload.name.length > 180) errors.push("INVALID_NAME");
  if (!payload.slug) errors.push("INVALID_SLUG");
  if (!payload.merchant_sku) errors.push("INVALID_SKU");
  if (!UUID_RE.test(String(payload.merchant_id))) errors.push("INVALID_MERCHANT_ID");
  if (!UUID_RE.test(String(payload.category_id))) errors.push("INVALID_CATEGORY_ID");
  if (!Number.isFinite(payload.price) || payload.price <= 0) errors.push("INVALID_PRICE");
  if (payload.discount_price != null) errors.push("DISCOUNT_FORBIDDEN");
  const shortLength = [...String(payload.short_description || "")].length;
  if (shortLength < 40 || shortLength > 280 || /<[^>]+>/.test(payload.short_description || "")) {
    errors.push("INVALID_SHORT_DESCRIPTION");
  }
  if (
    payload.stock !== 0 ||
    payload.is_active !== false ||
    payload.is_published !== false ||
    payload.visibility_status !== "private"
  ) {
    errors.push("UNSAFE_WRITE_PAYLOAD");
  }
  if (!Array.isArray(payload.images)) {
    errors.push("INVALID_IMAGE_URL");
  } else if (payload.images.length > 0) {
    if (payload.images.length !== 1 || !payload.images[0].startsWith(PUBLIC_BASE)) {
      errors.push("INVALID_IMAGE_URL");
    }
  }
  return { ok: errors.length === 0, errors };
}

function proposedPayload(payload) {
  return { ...payload, ...SAFE_FIELDS };
}

function canonicalExistingProduct(product) {
  const copy = { ...product };
  for (const key of ["readiness", "categories", "merchants", "updated_at"]) delete copy[key];
  return stableValue(copy);
}

function productMatchesPayload(product, payload) {
  if (!product) return { ok: false, mismatches: ["MISSING_PRODUCT"] };
  const expected = proposedPayload(payload);
  const checks = {
    merchant_id: product.merchant_id,
    merchant_sku: String(product.merchant_sku || "").toUpperCase(),
    name: product.name,
    slug: product.slug,
    description: product.description ?? null,
    short_description: product.short_description ?? null,
    price: Number(product.price),
    discount_price: product.discount_price ?? null,
    category_id: product.category_id,
    stock: Number(product.stock),
    purchase_price: Number(product.purchase_price),
    low_stock_threshold: Number(product.low_stock_threshold),
    is_active: product.is_active,
    is_published: product.is_published,
    visibility_status: product.visibility_status,
    is_featured: product.is_featured,
    is_new: product.is_new,
    is_best_seller: product.is_best_seller,
    offer_ends_at: product.offer_ends_at ?? null,
    images: Array.isArray(product.images) ? product.images : [],
    loyalty_points_enabled: product.loyalty_points_enabled,
    brand: product.brand ?? null,
    colors: Array.isArray(product.colors) ? product.colors : [],
    sizes: Array.isArray(product.sizes) ? product.sizes : product.sizes ? [product.sizes] : [],
    dimensions: product.dimensions ?? null,
    weight_grams: product.weight_grams == null ? null : Number(product.weight_grams),
  };
  const wanted = {
    merchant_id: expected.merchant_id,
    merchant_sku: expected.merchant_sku,
    name: expected.name,
    slug: expected.slug,
    description: expected.description,
    short_description: expected.short_description,
    price: expected.price,
    discount_price: expected.discount_price,
    category_id: expected.category_id,
    stock: expected.stock,
    purchase_price: expected.purchase_price,
    low_stock_threshold: expected.low_stock_threshold,
    is_active: expected.is_active,
    is_published: expected.is_published,
    visibility_status: expected.visibility_status,
    is_featured: expected.is_featured,
    is_new: expected.is_new,
    is_best_seller: expected.is_best_seller,
    offer_ends_at: expected.offer_ends_at,
    images: expected.images,
    loyalty_points_enabled: expected.loyalty_points_enabled,
    brand: expected.brand,
    colors: expected.colors,
    sizes: expected.sizes,
    dimensions: expected.dimensions,
    weight_grams: expected.weight_grams,
  };
  const mismatches = Object.keys(wanted).filter((key) => stableJson(checks[key]) !== stableJson(wanted[key]));
  return { ok: mismatches.length === 0, mismatches };
}

function loadProvenance(cfg, batchId) {
  const p = path.join(cfg.docs_dir, batchId, "05_IMAGE_PROVENANCE.csv");
  return fs.existsSync(p) ? readCsvFile(p) : [];
}

export function resolveFrozenBatch(
  cfg,
  { batchId = FROZEN_BATCH_ID, root = process.cwd(), categories = [], contract: contractOverrides = {} } = {},
) {
  const contract = runtimeContract(contractOverrides);
  const errors = [];
  if (batchId !== contract.batchId) errors.push("FROZEN_BATCH_MISMATCH");
  if (cfg.merchant_id !== TARGET_MERCHANT_ID) errors.push("CONFIG_MERCHANT_ID_MISMATCH");
  if (cfg.merchant_slug !== TARGET_MERCHANT_SLUG) errors.push("CONFIG_MERCHANT_SLUG_MISMATCH");
  try {
    assertSafeDefaults(cfg.default_product_state);
  } catch (error) {
    errors.push(String(error.message || error));
  }

  const file = manifestPath(cfg, batchId);
  const manifestSha = fs.existsSync(file) ? sha256File(file) : null;
  if (manifestSha !== contract.manifestSha) errors.push("MANIFEST_SHA_MISMATCH");
  const sourceSha = fs.existsSync(cfg.source_file) ? sha256File(cfg.source_file) : null;
  if (sourceSha !== contract.sourceSha) errors.push("SOURCE_SHA_MISMATCH");
  const manifestRows = fs.existsSync(file) ? readCsvFile(file) : [];
  if (manifestRows.length !== contract.selectedCount) errors.push(`MANIFEST_ROWS:${manifestRows.length}`);

  const sources = sourceRowsByNumber(cfg);
  const categoryIndex = buildCategoryIndex(categories);
  const categoryMapping = loadCategoryMapping(cfg.category_mapping_file);
  const provenance = loadProvenance(cfg, batchId);
  const provenanceBySku = new Map(provenance.map((row) => [String(row.merchant_sku).toUpperCase(), row]));
  const rows = [];
  const skuCounts = new Map();
  const slugCounts = new Map();
  const storageCounts = new Map();
  const shaGroups = new Map();

  const counts = {
    selected_rows: manifestRows.length,
    payloads_resolved: 0,
    unique_skus: 0,
    unique_slugs: 0,
    categories_resolved: 0,
    categories_unresolved: 0,
    prices_valid: 0,
    prices_invalid: 0,
    required_names_present: 0,
    payload_schema_pass: 0,
    payload_schema_fail: 0,
    images_found: 0,
    images_decoded: 0,
    image_mime_valid: 0,
    image_sha_matches: 0,
    image_sha_mismatches: 0,
    immutable_storage_paths: 0,
    duplicate_storage_paths: 0,
  };

  const auditFile = path.join(cfg.docs_dir, batchId, "06_IDENTITY_AUDIT.json");
  const hasAuditFile = fs.existsSync(auditFile);
  const auditList = hasAuditFile ? JSON.parse(fs.readFileSync(auditFile, "utf8")) : [];
  const auditBySku = new Map((Array.isArray(auditList) ? auditList : []).map((row) => [String(row.merchant_sku || "").toUpperCase(), row]));

  for (const manifest of manifestRows) {
    const sku = String(manifest.merchant_sku || "").trim().toUpperCase();
    const slug = String(manifest.slug || "").trim();
    const isPending = String(manifest.image_readiness_status || "").toUpperCase() === "IMAGE_PENDING";
    skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1);
    slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1);

    if (hasAuditFile) {
      const audit = auditBySku.get(sku);
      if (!audit) {
        errors.push(`IDENTITY_AUDIT_MISSING:${sku}`);
      } else {
        if (!isPending && audit.identity_decision !== "EXACT_MATCH") {
          errors.push(`IDENTITY_NOT_EXACT:${sku}`);
        }
        if (!isPending && audit.image_sha256 && String(audit.image_sha256).toUpperCase() !== String(manifest.image_sha256 || "").toUpperCase()) {
          errors.push(`IDENTITY_SHA_MISMATCH:${sku}`);
        }
        if (!isPending && audit.shared_sha_group_size > 1 && !audit.shared_sha_reviewed) {
          errors.push(`UNREVIEWED_SHARED_SHA:${sku}`);
        }
      }
    }

    const provPath = path.join(cfg.docs_dir, batchId, "05_IMAGE_PROVENANCE.csv");
    const hasProvFile = fs.existsSync(provPath);

    if (!isPending && hasProvFile) {
      const prov = provenanceBySku.get(sku);
      if (!prov) {
        errors.push(`PROVENANCE_MISSING:${sku}`);
      } else {
        if (String(prov.review_status || "").toUpperCase() !== "APPROVED") {
          errors.push(`PROVENANCE_NOT_APPROVED:${sku}`);
        }
        if (String(prov.identity_match || "").toUpperCase() !== "YES") {
          errors.push(`PROVENANCE_IDENTITY_NOT_CONFIRMED:${sku}`);
        }
        if (prov.sha256 && String(prov.sha256).toUpperCase() !== String(manifest.image_sha256 || "").toUpperCase()) {
          errors.push(`PROVENANCE_SHA_MISMATCH:${sku}`);
        }
      }
    }

    if (!isPending && hasAuditFile && hasProvFile) {
      const audit = auditBySku.get(sku);
      const prov = provenanceBySku.get(sku);
      if (audit && prov) {
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
          if (!prodUrl) errors.push(`IDENTITY_SOURCE_MISSING:${sku}`);
          if (!imgUrl) errors.push(`PROVENANCE_SOURCE_MISSING:${sku}`);
          if (!pageId) errors.push(`IDENTITY_PAGE_IDENTITY_MISSING:${sku}`);
        }
      }
    }

    const source = sources.byRow.get(String(manifest.source_row_number));
    if (!source) {
      errors.push(`SOURCE_ROW_MISSING:${sku}`);
      continue;
    }
    const sourceSku = String(source.sku || source.merchant_sku || "").trim().toUpperCase();
    if (sourceSku !== sku) {
      errors.push(`SOURCE_ROW_SKU_MISMATCH:${sku}:${sourceSku || "EMPTY"}`);
      continue;
    }
    const categorySlug = String(manifest.category || "").trim();
    const mappedCategory = categoryMapping.bySlug.get(categorySlug);
    const categoryMatches =
      mappedCategory?.allowed === true ? categoryIndex.get(categorySlug) || [] : [];
    const category = categoryMatches.length === 1 ? categoryMatches[0] : null;
    category ? (counts.categories_resolved += 1) : (counts.categories_unresolved += 1);
    if (!mappedCategory?.allowed) errors.push(`CATEGORY_NOT_ALLOWED:${sku}`);
    else if (!category) errors.push(`CATEGORY_UNRESOLVED:${sku}`);

    let imagePath = null;
    let body = null;
    let mime = "";
    let decoded = { ok: true };
    let localSha = "";
    let storagePath = null;

    if (!isPending) {
      imagePath = path.isAbsolute(manifest.image_source)
        ? manifest.image_source
        : path.join(root, manifest.image_source);
      if (fs.existsSync(imagePath)) {
        counts.images_found += 1;
        body = fs.readFileSync(imagePath);
        mime = sniffMime(body, imagePath);
        if (["image/webp", "image/jpeg", "image/png", "image/avif"].includes(mime)) counts.image_mime_valid += 1;
        decoded = decodeImageMetadata(body, mime);
        if (decoded.ok) counts.images_decoded += 1;
        localSha = crypto.createHash("sha256").update(body).digest("hex").toUpperCase();
        if (localSha === String(manifest.image_sha256).toUpperCase()) counts.image_sha_matches += 1;
        else {
          counts.image_sha_mismatches += 1;
          errors.push(`IMAGE_SHA_MISMATCH:${sku}`);
        }
      } else {
        errors.push(`IMAGE_MISSING:${sku}`);
      }
      if (!decoded.ok) errors.push(`IMAGE_DECODE_FAILED:${sku}`);
      if (!["image/webp", "image/jpeg", "image/png", "image/avif"].includes(mime)) {
        errors.push(`IMAGE_MIME_INVALID:${sku}`);
      }

      const expectedPath = immutableStoragePath(
        TARGET_MERCHANT_ID,
        sku,
        manifest.image_sha256,
        ".webp",
      );
      if (expectedPath === manifest.normalized_image_path) counts.immutable_storage_paths += 1;
      else errors.push(`STORAGE_PATH_NOT_IMMUTABLE:${sku}`);
      storageCounts.set(manifest.normalized_image_path, (storageCounts.get(manifest.normalized_image_path) || 0) + 1);
      const sha = String(manifest.image_sha256 || "").toUpperCase();
      if (!shaGroups.has(sha)) shaGroups.set(sha, []);
      shaGroups.get(sha).push(sku);
      storagePath = manifest.normalized_image_path;
    }

    const payload = category ? buildWirePayload({ manifest, source, categoryId: category.id }) : null;
    if (payload) {
      counts.payloads_resolved += 1;
      if (payload.name) counts.required_names_present += 1;
      if (Number.isFinite(payload.price) && payload.price > 0) counts.prices_valid += 1;
      else counts.prices_invalid += 1;
      const schema = validateProductPayload(payload);
      schema.ok ? (counts.payload_schema_pass += 1) : (counts.payload_schema_fail += 1);
      if (!schema.ok) errors.push(`PAYLOAD_SCHEMA:${sku}:${schema.errors.join(",")}`);
    } else {
      counts.prices_invalid += 1;
      counts.payload_schema_fail += 1;
    }

    rows.push({
      manifest,
      source,
      merchant_sku: sku,
      slug,
      image_readiness_status: isPending ? "IMAGE_PENDING" : "IMAGE_VERIFIED",
      local_image_path: imagePath,
      image_body: body,
      image_mime: mime,
      image_sha256: isPending ? null : String(manifest.image_sha256 || "").toUpperCase(),
      storage_path: storagePath,
      public_url: storagePath ? productPublicUrl(storagePath) : null,
      payload,
      proposed_payload: payload ? proposedPayload(payload) : null,
      payload_sha256: payload ? sha256Json(proposedPayload(payload)) : null,
    });
  }

  counts.unique_skus = [...skuCounts.values()].filter((n) => n === 1).length;
  counts.unique_slugs = [...slugCounts.values()].filter((n) => n === 1).length;
  counts.duplicate_storage_paths = [...storageCounts.values()].filter((n) => n > 1).length;
  if (counts.unique_skus !== contract.selectedCount) errors.push("DUPLICATE_SELECTED_SKU");
  if (counts.unique_slugs !== contract.selectedCount) errors.push("DUPLICATE_SELECTED_SLUG");
  if (counts.duplicate_storage_paths) errors.push("DUPLICATE_STORAGE_PATH");

  const sharedShaGroups = [...shaGroups.entries()]
    .filter(([sha, skus]) => sha && skus.length > 1)
    .map(([sha256, skus]) => ({
      sha256,
      skus,
      reviewed: skus.every((sku) => {
        const row = provenanceBySku.get(sku);
        return row && String(row.review_status || "").toUpperCase() === "APPROVED";
      }),
    }));
  const sharedUnreviewed = sharedShaGroups.filter((group) => !group.reviewed).length;
  if (sharedUnreviewed) errors.push("UNREVIEWED_SHARED_IMAGE_SHA");

  return {
    ok: errors.length === 0,
    errors,
    manifest_path: file,
    manifest_sha256: manifestSha,
    source_path: cfg.source_file,
    source_sha256: sourceSha,
    rows,
    counts,
    shared_sha_groups: sharedShaGroups,
    shared_sha_groups_unreviewed: sharedUnreviewed,
  };
}

export async function runPreflight({
  cfg,
  batchId = FROZEN_BATCH_ID,
  root = process.cwd(),
  adapters,
  env = process.env,
  gitState = null,
  contract: contractOverrides = {},
} = {}) {
  const contract = runtimeContract({ batchId, ...contractOverrides });
  const git = gitState || getGitState({ root, env });
  const errors = [...(git.errors || [])];
  if (!adapters?.fetchLiveCatalog || !adapters?.storage?.pathExists) errors.push("LIVE_ADAPTERS_REQUIRED");

  let live = { merchant: {}, products: [], allProducts: [], categories: [] };
  if (adapters?.fetchLiveCatalog) {
    try {
      live = await adapters.fetchLiveCatalog();
    } catch (error) {
      errors.push(`LIVE_CATALOG_FAILED:${error.message || error}`);
    }
  }
  const resolved = resolveFrozenBatch(cfg, { batchId, root, categories: live.categories, contract });
  errors.push(...resolved.errors);

  const selectedSkus = new Set(resolved.rows.map((row) => row.merchant_sku));
  const selectedSlugs = new Set(resolved.rows.map((row) => row.slug));
  const merchantProducts = live.products || [];
  const allProducts = live.allProducts?.length ? live.allProducts : merchantProducts;
  const skuCollisions = merchantProducts.filter((p) =>
    selectedSkus.has(String(p.merchant_sku || "").toUpperCase()),
  );
  const slugCollisions = allProducts.filter((p) => selectedSlugs.has(String(p.slug || "")));
  if (skuCollisions.length) errors.push("SELECTED_SKU_COLLISION");
  if (slugCollisions.length) errors.push("SELECTED_SLUG_COLLISION");
  if (merchantProducts.length !== contract.currentProductCount) {
    errors.push(`CURRENT_PRODUCT_COUNT:${merchantProducts.length}`);
  }
  const merchant = live.merchant || {};
  if (merchant.id !== TARGET_MERCHANT_ID) errors.push("WRONG_MERCHANT_ID");
  if (merchant.slug !== TARGET_MERCHANT_SLUG) errors.push("WRONG_MERCHANT_SLUG");
  if (merchant.status !== contract.expectedMerchantStatus) errors.push("WRONG_MERCHANT_STATUS");

  let authMeta = {};
  const storageResults = [];
  if (adapters?.ensureStorageAuth) {
    try {
      await adapters.ensureStorageAuth();
      authMeta = adapters.storageAuthMeta?.() || {};
      for (const row of resolved.rows) {
        if (row.storage_path) {
          const exists = await adapters.storage.pathExists(row.storage_path);
          storageResults.push({ merchant_sku: row.merchant_sku, storage_path: row.storage_path, exists });
          if (exists) errors.push(`STORAGE_PATH_EXISTS:${row.merchant_sku}`);
        }
      }
    } catch (error) {
      authMeta = adapters.storageAuthMeta?.() || {};
      errors.push(`STORAGE_PREFLIGHT_FAILED:${error.code || error.message || error}`);
    }
  }

  const imageVerifiedRows = resolved.rows.filter((r) => r.image_readiness_status === "IMAGE_VERIFIED" || r.storage_path).length;
  const imagePendingRows = resolved.rows.length - imageVerifiedRows;
  const storageExisting = storageResults.filter((row) => row.exists).length;
  const existingBaselines = Object.fromEntries(
    merchantProducts.map((product) => [
      String(product.merchant_sku || product.id),
      { id: product.id, sha256: sha256Json(canonicalExistingProduct(product)), product: canonicalExistingProduct(product) },
    ]),
  );
  const c = resolved.counts;
  const ok = errors.length === 0;
  const adapterKind = adapters?.kind || null;
  const checkedLive = isProductionReadOnlyRuntimeAdapter(adapters);
  return {
    ok,
    judgment: ok ? (checkedLive ? "LIVE_PREFLIGHT_PASS" : "TEST_PREFLIGHT_PASS") : "NO-GO",
    errors,
    adapter_kind: adapterKind,
    checked_live: checkedLive,
    actual_git_head: git.actualHead,
    approved_head_sha: git.approvedHead,
    head_match: git.headMatch,
    clean_worktree: git.clean,
    manifest_sha: resolved.manifest_sha256,
    manifest_match: resolved.manifest_sha256 === contract.manifestSha,
    source_sha: resolved.source_sha256,
    source_match: resolved.source_sha256 === contract.sourceSha,
    merchant_id: merchant.id ?? null,
    merchant_slug: merchant.slug ?? null,
    merchant_status: merchant.status ?? null,
    current_product_count: merchantProducts.length,
    selected_rows: c.selected_rows,
    image_verified_rows: imageVerifiedRows,
    image_pending_rows: imagePendingRows,
    expected_product_creates: contract.selectedCount,
    expected_storage_uploads: imageVerifiedRows,
    selected_sku_collisions: skuCollisions.length,
    selected_slug_collisions: slugCollisions.length,
    payloads_resolved: c.payloads_resolved,
    unique_skus: c.unique_skus,
    unique_slugs: c.unique_slugs,
    payload_schema_pass: c.payload_schema_pass,
    payload_schema_fail: c.payload_schema_fail,
    prices_valid: c.prices_valid,
    prices_invalid: c.prices_invalid,
    categories_resolved: c.categories_resolved,
    categories_unresolved: c.categories_unresolved,
    required_names_present: c.required_names_present,
    images_found: c.images_found,
    images_decoded: c.images_decoded,
    image_mime_valid: c.image_mime_valid,
    image_sha_matches: c.image_sha_matches,
    image_sha_mismatches: c.image_sha_mismatches,
    immutable_storage_paths: c.immutable_storage_paths,
    duplicate_storage_paths: c.duplicate_storage_paths,
    shared_sha_groups: resolved.shared_sha_groups,
    shared_sha_groups_unreviewed: resolved.shared_sha_groups_unreviewed,
    storage_key_probe: authMeta.storage_key_probe || null,
    storage_auth_flow: authMeta.storage_auth_flow || null,
    storage_paths_total: imageVerifiedRows,
    storage_paths_absent: imageVerifiedRows - storageExisting,
    storage_paths_existing: storageExisting,
    private_defaults: resolved.rows.filter((row) => row.payload?.visibility_status === "private").length,
    inactive_defaults: resolved.rows.filter((row) => row.payload?.is_active === false).length,
    unpublished_defaults: resolved.rows.filter((row) => row.payload?.is_published === false).length,
    stock_zero_defaults: resolved.rows.filter((row) => row.payload?.stock === 0).length,
    production_storage_writes: false,
    production_db_writes: false,
    execution_status: "NOT_EXECUTED",
    storage_results: storageResults,
    existing_baselines: existingBaselines,
    resolved,
  };
}

function safeReport(report) {
  const copy = { ...report };
  delete copy.resolved;
  delete copy.existing_baselines;
  return copy;
}

export function writePreflightEvidence(report, { cfg, batchId = FROZEN_BATCH_ID } = {}) {
  const p = path.join(cfg.tmp_dir, batchId, "production-readonly-preflight.json");
  writeJson(p, safeReport(report));
  return { path: p, sha256: sha256File(p) };
}

export function buildCatalogIndexes(live = {}) {
  const merchantSkuIndex = new Map();
  const globalSlugIndex = new Map();

  function indexProduct(p) {
    if (!p) return;
    const sku = p.merchant_sku;
    const slug = p.slug;
    if (sku) {
      const k = String(sku).trim().toUpperCase();
      if (!merchantSkuIndex.has(k)) merchantSkuIndex.set(k, []);
      if (!merchantSkuIndex.get(k).some((item) => item.id && item.id === p.id)) {
        merchantSkuIndex.get(k).push(p);
      }
    }
    if (slug) {
      const k = String(slug).trim();
      if (!globalSlugIndex.has(k)) globalSlugIndex.set(k, []);
      if (!globalSlugIndex.get(k).some((item) => item.id && item.id === p.id)) {
        globalSlugIndex.get(k).push(p);
      }
    }
  }

  for (const p of (live.products || [])) {
    indexProduct(p);
  }
  for (const p of (live.allProducts || [])) {
    indexProduct(p);
  }

  return {
    merchantSkuIndex,
    globalSlugIndex,
    indexProduct,
    lookupProductBySku(sku) {
      const k = String(sku || "").trim().toUpperCase();
      const matches = merchantSkuIndex.get(k) || [];
      return {
        count: matches.length,
        product: matches.length === 1 ? matches[0] : null,
        ambiguous: matches.length > 1,
        products: matches,
      };
    },
    getProductBySku(sku) {
      const lookup = this.lookupProductBySku(sku);
      if (lookup.ambiguous) {
        const error = new Error("SKU_AMBIGUOUS");
        error.code = "SKU_AMBIGUOUS";
        error.count = lookup.count;
        throw error;
      }
      return lookup.product;
    },
    getProductBySlug(slug) {
      const k = String(slug || "").trim();
      const matches = globalSlugIndex.get(k) || [];
      if (matches.length > 1) {
        const error = new Error("SLUG_AMBIGUOUS");
        error.code = "SLUG_AMBIGUOUS";
        error.count = matches.length;
        throw error;
      }
      return matches[0] || null;
    },
  };
}

async function processCreateRow({ row, entry, adapters, journal, catalogIndex = null }) {
  const accounting = journal.write_accounting;
  const isPending = row.image_readiness_status === "IMAGE_PENDING" || !row.storage_path;

  if (entry.status === "pending") {
    if (isPending) {
      entry.storage_status = "NOT_REQUIRED";
      transitionJournalEntry(entry, "image_verified");
    } else {
      if (await adapters.storage.pathExists(row.storage_path)) {
        transitionJournalEntry(entry, "conflict", { error: "STORAGE_PATH_EXISTS_BEFORE_UPLOAD" });
        accounting.conflict += 1;
        return false;
      }
      accounting.storage_upload_attempted += 1;
      const uploaded = await adapters.storage.upload({
        path: row.storage_path,
        body: row.image_body,
        contentType: row.image_mime,
        upsert: false,
      });
      if (!uploaded.ok) {
        const alreadyExists =
          String(uploaded.error || "").includes("ALREADY_EXISTS") ||
          String(uploaded.error || "").includes("already exists") ||
          String(uploaded.error || "").includes("Duplicate");
        const status = alreadyExists ? "conflict" : "failed";
        transitionJournalEntry(entry, status, { error: uploaded.error || "UPLOAD_FAILED" });
        accounting[status] += 1;
        return false;
      }
      accounting.storage_upload_succeeded += 1;
      transitionJournalEntry(entry, "image_uploaded");
    }
  }
  if (entry.status === "image_uploaded") {
    if (isPending) {
      transitionJournalEntry(entry, "image_verified");
    } else {
      const verified = await adapters.storage.verifyObject(row.storage_path, row.image_sha256, row.image_mime);
      if (!verified.ok) {
        transitionJournalEntry(entry, "indeterminate", { error: "IMAGE_VERIFY_FAILED" });
        accounting.indeterminate += 1;
        return false;
      }
      accounting.storage_verified += 1;
      transitionJournalEntry(entry, "image_verified");
    }
  }
  if (entry.status === "image_verified") {
    let existing = null;
    try {
      existing = catalogIndex
        ? catalogIndex.getProductBySku(row.merchant_sku)
        : await adapters.admin.getProductBySku(row.merchant_sku);
    } catch (error) {
      if (error?.code === "SKU_AMBIGUOUS") {
        transitionJournalEntry(entry, "conflict", { error: "SKU_AMBIGUOUS" });
        accounting.conflict += 1;
        return false;
      }
      throw error;
    }
    if (existing) {
      transitionJournalEntry(entry, "conflict", { error: "SKU_EXISTS_BEFORE_CREATE", product_id: existing.id });
      accounting.conflict += 1;
      return false;
    }
    let slugOwner = null;
    try {
      slugOwner = catalogIndex
        ? catalogIndex.getProductBySlug(row.slug)
        : await adapters.admin.getProductBySlug?.(row.slug);
    } catch (error) {
      if (error?.code === "SLUG_AMBIGUOUS") {
        transitionJournalEntry(entry, "conflict", { error: "SLUG_AMBIGUOUS" });
        accounting.conflict += 1;
        return false;
      }
      throw error;
    }
    if (slugOwner) {
      transitionJournalEntry(entry, "conflict", { error: "SLUG_EXISTS_BEFORE_CREATE", product_id: slugOwner.id });
      accounting.conflict += 1;
      return false;
    }
    accounting.api_create_attempted += 1;
    transitionJournalEntry(entry, "api_create_attempted");
    try {
      const created = await adapters.admin.createProduct(row.payload);
      entry.product_id = created?.id || null;
      if (catalogIndex && created) {
        catalogIndex.indexProduct({ ...row.payload, ...created });
      }
      accounting.product_create_succeeded += 1;
      transitionJournalEntry(entry, "product_created", { product_id: entry.product_id });
    } catch (error) {
      const backendCode = String(error?.backendCode || error?.code || "");
      const createConflict =
        error?.status === 409 &&
        ["PRODUCT_MERCHANT_SKU_EXISTS", "PRODUCT_SLUG_EXISTS"].includes(backendCode);
      const status = createConflict ? "conflict" : error.indeterminate ? "indeterminate" : "failed";
      transitionJournalEntry(entry, status, {
        error: createConflict ? backendCode : String(error.message || error),
        ...(backendCode ? { backend_code: backendCode } : {}),
      });
      accounting[status] += 1;
      return false;
    }
  }
  if (entry.status === "product_created") {
    const product = entry.product_id
      ? await adapters.admin.getProductById(entry.product_id)
      : await adapters.admin.getProductBySku(row.merchant_sku);
    const match = productMatchesPayload(product, row.payload);
    if (!match.ok) {
      transitionJournalEntry(entry, "indeterminate", { error: `PRODUCT_VERIFY:${match.mismatches.join(",")}` });
      accounting.indeterminate += 1;
      return false;
    }
    accounting.product_verified += 1;
    transitionJournalEntry(entry, "product_verified", { product_id: product.id });
  }
  if (entry.status === "product_verified") transitionJournalEntry(entry, "completed");
  return entry.status === "completed";
}

export async function runExecute({
  cfg,
  batchId = FROZEN_BATCH_ID,
  root = process.cwd(),
  adapters,
  env = process.env,
  gitState = null,
  contract: contractOverrides = {},
} = {}) {
  const authorization = assertBulkExecuteAuthorized(env);
  if (!authorization.ok) {
    return {
      ok: false,
      judgment: "EXECUTION_BLOCKED",
      execution_status: "BLOCKED_AUTHORIZATION",
      error: authorization.code,
      errors: [authorization.code],
      message: authorization.message,
      production_storage_writes: false,
      production_db_writes: false,
    };
  }
  const contract = runtimeContract({ batchId, ...contractOverrides });
  const preflight = await runPreflight({ cfg, batchId, root, adapters, env, gitState, contract });
  if (!preflight.ok) return { ...safeReport(preflight), execution_status: "BLOCKED_PREFLIGHT" };
  const resolved = preflight.resolved;
  const live = await adapters.fetchLiveCatalog();
  const catalogIndex = buildCatalogIndexes(live);

  const journal = createBatchJournal({
    batchId,
    merchantId: TARGET_MERCHANT_ID,
    manifestSha: resolved.manifest_sha256,
    sourceSha: resolved.source_sha256,
    executionHeadSha: preflight.actual_git_head,
    rows: resolved.rows.map((row) => ({
      merchant_sku: row.merchant_sku,
      image_readiness_status: row.image_readiness_status,
      normalized_image_path: row.storage_path,
      image_sha256: row.image_sha256,
      payload_sha256: row.payload_sha256,
    })),
  });
  journal.existing_baselines = preflight.existing_baselines;
  saveJournal(cfg.tmp_dir, journal);

  const canary = resolved.rows.slice(0, contract.canaryCount);
  let canaryAttempted = 0;
  for (const row of canary) {
    canaryAttempted += 1;
    const entry = journal.entries.find((item) => item.merchant_sku === row.merchant_sku);
    const ok = await processCreateRow({ row, entry, adapters, journal, catalogIndex });
    saveJournal(cfg.tmp_dir, journal);
    if (!ok) {
      const canaryCompleted = journal.entries.slice(0, contract.canaryCount).filter((e) => e.status === "completed").length;
      const remainingPending = journal.entries.filter((e) => e.status === "pending").length;
      return {
        ok: false,
        judgment: "EXECUTION_STOPPED",
        execution_status: "CANARY_FAILED",
        canary_attempted: canaryAttempted,
        canary_completed: canaryCompleted,
        remaining_pending: remainingPending,
        remaining_attempted: 0,
        write_accounting: journal.write_accounting,
      };
    }
  }

  const canaryCompleted = journal.entries.slice(0, contract.canaryCount).filter((e) => e.status === "completed").length;
  const remainingPending = journal.entries.filter((e) => e.status === "pending").length;

  return {
    ok: true,
    judgment: "CANARY_PASS",
    execution_status: "CANARY_COMPLETE",
    canary_attempted: contract.canaryCount,
    canary_completed: canaryCompleted,
    remaining_pending: remainingPending,
    write_accounting: journal.write_accounting,
  };
}

export async function runResume({
  cfg,
  batchId = FROZEN_BATCH_ID,
  root = process.cwd(),
  adapters,
  env = process.env,
  gitState = null,
  contract: contractOverrides = {},
} = {}) {
  const authorization = assertBulkExecuteAuthorized(env);
  if (!authorization.ok) {
    return {
      ok: false,
      judgment: "RESUME_BLOCKED",
      execution_status: "BLOCKED_AUTHORIZATION",
      error: authorization.code,
      errors: [authorization.code],
      message: authorization.message,
      production_storage_writes: false,
      production_db_writes: false,
    };
  }
  const contract = runtimeContract({ batchId, ...contractOverrides });
  const git = gitState || getGitState({ root, env });
  if (!git.ok) return { ok: false, judgment: "RESUME_BLOCKED", errors: git.errors };
  const journal = loadJournal(cfg.tmp_dir, batchId);
  const binding = assertJournalBinding(journal, {
    batchId,
    merchantId: TARGET_MERCHANT_ID,
    manifestSha: contract.manifestSha,
    sourceSha: contract.sourceSha,
    executionHeadSha: git.actualHead,
  });
  if (!binding.ok) return { ok: false, judgment: "RESUME_BLOCKED", errors: binding.errors };

  const live = await adapters.fetchLiveCatalog();
  const merchantErrors = [];
  if (live.merchant?.id !== TARGET_MERCHANT_ID) merchantErrors.push("WRONG_MERCHANT_ID");
  if (live.merchant?.slug !== TARGET_MERCHANT_SLUG) merchantErrors.push("WRONG_MERCHANT_SLUG");
  if (live.merchant?.status !== contract.expectedMerchantStatus) merchantErrors.push("WRONG_MERCHANT_STATUS");
  if (merchantErrors.length) {
    return { ok: false, judgment: "RESUME_BLOCKED", errors: merchantErrors };
  }
  const resolved = resolveFrozenBatch(cfg, { batchId, root, categories: live.categories, contract });
  if (!resolved.ok) return { ok: false, judgment: "RESUME_BLOCKED", errors: resolved.errors };
  const bySku = new Map(resolved.rows.map((row) => [row.merchant_sku, row]));
  const catalogIndex = buildCatalogIndexes(live);
  const errors = [];

  for (const entry of journal.entries) {
    const row = bySku.get(entry.merchant_sku);
    if (!row || entry.expected_payload_sha256 !== row.payload_sha256) {
      transitionJournalEntry(entry, "conflict", { error: "RESUME_PAYLOAD_MISMATCH" });
      errors.push(`RESUME_PAYLOAD_MISMATCH:${entry.merchant_sku}`);
      continue;
    }

    const rowReadiness = row.image_readiness_status || (row.storage_path ? "IMAGE_VERIFIED" : "IMAGE_PENDING");
    const entryReadiness = entry.image_readiness_status || (entry.expected_storage_path ? "IMAGE_VERIFIED" : "IMAGE_PENDING");
    if (entryReadiness !== rowReadiness) {
      transitionJournalEntry(entry, "conflict", { error: `JOURNAL_IMAGE_STATE_MISMATCH:${entry.merchant_sku}` });
      errors.push(`JOURNAL_IMAGE_STATE_MISMATCH:${entry.merchant_sku}`);
      continue;
    }

    const isPending = rowReadiness === "IMAGE_PENDING" || !row.storage_path;

    if (isPending) {
      entry.storage_status = "NOT_REQUIRED";
      if (entry.status === "pending" || entry.status === "image_uploaded") {
        transitionJournalEntry(entry, "image_verified");
      }
    } else {
      const objectExists = await adapters.storage.pathExists(row.storage_path);
      if (objectExists) {
        const verified = await adapters.storage.verifyObject(row.storage_path, row.image_sha256, row.image_mime);
        if (!verified.ok) {
          transitionJournalEntry(entry, "conflict", { error: "RESUME_STORAGE_SHA_MISMATCH" });
          errors.push(`RESUME_STORAGE_SHA_MISMATCH:${entry.merchant_sku}`);
          continue;
        }
        if (entry.status === "pending" || entry.status === "image_uploaded") transitionJournalEntry(entry, "image_verified");
      } else if (entry.status !== "pending") {
        transitionJournalEntry(entry, "conflict", { error: "RESUME_STORAGE_OBJECT_MISSING" });
        errors.push(`RESUME_STORAGE_OBJECT_MISSING:${entry.merchant_sku}`);
        continue;
      }
    }

    let product = null;
    try {
      product = catalogIndex
        ? catalogIndex.getProductBySku(row.merchant_sku)
        : await adapters.admin.getProductBySku(row.merchant_sku);
    } catch (error) {
      if (error?.code === "SKU_AMBIGUOUS") {
        transitionJournalEntry(entry, "conflict", { error: "SKU_AMBIGUOUS" });
        errors.push(`SKU_AMBIGUOUS:${entry.merchant_sku}`);
        continue;
      }
      throw error;
    }
    if (product) {
      const match = productMatchesPayload(product, row.payload);
      if (!match.ok) {
        transitionJournalEntry(entry, "conflict", { error: `RESUME_PRODUCT_CONFLICT:${match.mismatches.join(",")}` });
        errors.push(`RESUME_PRODUCT_CONFLICT:${entry.merchant_sku}`);
      } else {
        transitionJournalEntry(entry, "completed", { product_id: product.id, reconciled_via: "exact_live_read" });
      }
    } else if (["api_create_attempted", "indeterminate"].includes(entry.status)) {
      transitionJournalEntry(entry, "image_verified", { reconciled_via: "confirmed_absent_live_read" });
    } else if (entry.status === "completed" || entry.status === "product_created" || entry.status === "product_verified") {
      transitionJournalEntry(entry, "conflict", { error: "RESUME_PRODUCT_MISSING" });
      errors.push(`RESUME_PRODUCT_MISSING:${entry.merchant_sku}`);
    }
  }
  saveJournal(cfg.tmp_dir, journal);
  if (errors.length) return { ok: false, judgment: "RESUME_CONFLICT", errors };

  for (const entry of journal.entries) {
    if (entry.status === "completed") continue;
    if (entry.status === "failed" || entry.status === "conflict") {
      return { ok: false, judgment: "RESUME_BLOCKED", errors: [`NON_RETRYABLE_STATUS:${entry.merchant_sku}:${entry.status}`] };
    }
    const ok = await processCreateRow({ row: bySku.get(entry.merchant_sku), entry, adapters, journal, catalogIndex });
    saveJournal(cfg.tmp_dir, journal);
    if (!ok) return { ok: false, judgment: "RESUME_STOPPED", write_accounting: journal.write_accounting };
  }
  return { ok: true, judgment: "RESUME_COMPLETE", write_accounting: journal.write_accounting };
}

export async function runPostflight({
  cfg,
  batchId = FROZEN_BATCH_ID,
  root = process.cwd(),
  adapters,
  env = process.env,
  gitState = null,
  contract: contractOverrides = {},
} = {}) {
  const contract = runtimeContract({ batchId, ...contractOverrides });
  const git = gitState || getGitState({ root, env });
  const journal = loadJournal(cfg.tmp_dir, batchId);
  const binding = assertJournalBinding(journal, {
    batchId,
    merchantId: TARGET_MERCHANT_ID,
    manifestSha: contract.manifestSha,
    sourceSha: contract.sourceSha,
    executionHeadSha: journal?.execution_head_sha,
  });
  const errors = [...(git.errors || []), ...(binding.errors || [])];
  const live = await adapters.fetchLiveCatalog();
  const resolved = resolveFrozenBatch(cfg, { batchId, root, categories: live.categories, contract });
  errors.push(...resolved.errors);
  const bySku = new Map((live.products || []).map((product) => [String(product.merchant_sku || "").toUpperCase(), product]));

  let created = 0;
  let imageVerifiedCount = 0;
  let imagePendingCount = 0;
  let privateCount = 0;
  let inactiveCount = 0;
  let unpublishedCount = 0;
  let stockZeroCount = 0;
  let pricesMatch = 0;
  for (const row of resolved.rows) {
    const product = bySku.get(row.merchant_sku);
    const match = productMatchesPayload(product, row.payload);
    if (match.ok) created += 1;
    else errors.push(`POSTFLIGHT_PRODUCT:${row.merchant_sku}:${match.mismatches.join(",")}`);
    if (product?.visibility_status === "private") privateCount += 1;
    if (product?.is_active === false) inactiveCount += 1;
    if (product?.is_published === false) unpublishedCount += 1;
    if (Number(product?.stock) === 0) stockZeroCount += 1;

    if (product && Number(product.price) === row.payload.price) {
      pricesMatch += 1;
    } else {
      errors.push(`POSTFLIGHT_PRICE_MISMATCH:${row.merchant_sku}`);
    }

    const journalEntry = journal?.entries?.find((e) => e.merchant_sku === row.merchant_sku);
    const rowReadiness = row.image_readiness_status || (row.storage_path ? "IMAGE_VERIFIED" : "IMAGE_PENDING");
    if (journalEntry) {
      const entryReadiness = journalEntry.image_readiness_status || (journalEntry.expected_storage_path ? "IMAGE_VERIFIED" : "IMAGE_PENDING");
      if (entryReadiness !== rowReadiness) {
        errors.push(`JOURNAL_IMAGE_STATE_MISMATCH:${row.merchant_sku}`);
      }
    }

    if (rowReadiness === "IMAGE_PENDING" || !row.storage_path) {
      if (Array.isArray(product?.images) && product.images.length === 0) {
        imagePendingCount += 1;
      } else {
        errors.push(`POSTFLIGHT_IMAGE_PENDING_NOT_EMPTY:${row.merchant_sku}`);
      }
    } else {
      const image = await adapters.storage.verifyObject(row.storage_path, row.image_sha256, row.image_mime);
      const liveImageExact = Array.isArray(product?.images) && product.images.length === 1 && product.images[0] === row.public_url;
      if (image.ok && liveImageExact) {
        imageVerifiedCount += 1;
      } else {
        errors.push(`POSTFLIGHT_IMAGE:${row.merchant_sku}`);
      }
    }
  }

  const imageStateValidTotal = imageVerifiedCount + imagePendingCount;

  let existingUnchanged = 0;
  for (const baseline of Object.values(journal?.existing_baselines || {})) {
    const current = (live.products || []).find((product) => product.id === baseline.id);
    if (current && sha256Json(canonicalExistingProduct(current)) === baseline.sha256) existingUnchanged += 1;
    else errors.push(`EXISTING_PRODUCT_CHANGED:${baseline.id}`);
  }
  const statuses = journal?.entries || [];
  const journalCompleted = statuses.filter((entry) => entry.status === "completed").length;
  const journalNonterminal = statuses.length - journalCompleted;
  const failed = statuses.filter((entry) => entry.status === "failed").length;
  const indeterminate = statuses.filter((entry) => entry.status === "indeterminate").length;
  const conflict = statuses.filter((entry) => entry.status === "conflict").length;
  const publicLeakage = resolved.rows.filter((row) => {
    const p = bySku.get(row.merchant_sku);
    return p && (p.visibility_status !== "private" || p.is_active === true || p.is_published === true);
  }).length;
  if ((live.products || []).length !== contract.postflightProductCount) errors.push("POSTFLIGHT_MERCHANT_TOTAL");
  if (existingUnchanged !== contract.currentProductCount) errors.push("POSTFLIGHT_EXISTING_BASELINE");
  if (created !== contract.selectedCount || imageStateValidTotal !== contract.selectedCount) errors.push("POSTFLIGHT_INCOMPLETE");
  if (pricesMatch !== contract.selectedCount) errors.push("POSTFLIGHT_PRICE_MISMATCH");
  if (journalCompleted !== contract.selectedCount || journalNonterminal !== 0) {
    errors.push("POSTFLIGHT_JOURNAL_INCOMPLETE");
  }
  if (failed || indeterminate || conflict || publicLeakage) errors.push("POSTFLIGHT_UNSAFE_STATUS");

  return {
    ok: errors.length === 0,
    judgment: errors.length ? "POSTFLIGHT_FAIL" : "POSTFLIGHT_PASS",
    errors,
    adapter_kind: adapters?.kind || null,
    actual_git_head: git.actualHead || null,
    verifier_head_sha: git.actualHead || null,
    approved_head_sha: git.approvedHead || null,
    historical_execution_head_sha: journal?.execution_head_sha || null,
    created_products: created,
    image_verified_count: imageVerifiedCount,
    image_pending_count: imagePendingCount,
    image_state_valid_total: imageStateValidTotal,
    images_verified: imageVerifiedCount,
    merchant_total: (live.products || []).length,
    new_products_private: privateCount,
    new_products_inactive: inactiveCount,
    new_products_unpublished: unpublishedCount,
    new_products_stock_zero: stockZeroCount,
    existing_unchanged: existingUnchanged,
    prices_match_manifest: pricesMatch,
    journal_completed: journalCompleted,
    journal_nonterminal: journalNonterminal,
    public_leakage: publicLeakage,
    failed,
    indeterminate,
    conflict,
  };
}

export { productMatchesPayload, canonicalExistingProduct };
