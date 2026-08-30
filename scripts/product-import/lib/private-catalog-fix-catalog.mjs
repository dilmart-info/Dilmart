/**
 * Exact catalog resolution helpers for private-catalog FIX EXECUTION.
 * Never resolve SKUs via fuzzy name search.
 */
import crypto from "crypto";
import { TARGET_MERCHANT_ID, PERFUMES_CATEGORY_SLUG } from "./private-catalog-fix-gates.mjs";

export const BASELINE_FIELDS = Object.freeze([
  "id",
  "merchant_sku",
  "merchant_id",
  "name",
  "slug",
  "brand",
  "sizes",
  "price",
  "discount_price",
  "category_id",
  "category_slug",
  "images",
  "short_description",
  "description",
  "stock",
  "is_active",
  "is_published",
  "visibility_status",
  "purchase_price",
  "low_stock_threshold",
  "is_featured",
  "is_new",
  "is_best_seller",
  "loyalty_points_enabled",
  // Expanded full-catalog baseline (final safety patch): every field a POST could
  // collaterally touch must be part of the exact unaffected-80 / HOLD / ARD-1191
  // reconciliation, not just the narrow original whitelist.
  "colors",
  "dimensions",
  "weight_grams",
  "offer_ends_at",
  "target_audience",
  "business_type_tags",
  "product_use_cases",
  "visible_in",
  "purchase_mode",
  "is_b2b_offer",
  "requires_verified_salon",
  "min_order_qty",
  "max_order_qty",
  // Volatile / joined fields are recorded for visibility only — see stableJson callers,
  // which explicitly skip "updated_at" in every equality comparison. Joined objects
  // (categories/merchants) and computed "readiness" are never part of this whitelist,
  // so they can never spuriously fail baseline equality.
  "updated_at",
]);

/** Backend listProducts search filters name only (ilike). Documented for contract tests. */
export const PRODUCT_LIST_SEARCH_FIELD = "name";

/**
 * Simulate Backend listProducts search behavior: name ilike only.
 * Must NOT match merchant_sku.
 */
export function filterProductsByNameSearch(products, search) {
  if (!search) return [...products];
  const q = String(search).toLowerCase();
  return products.filter((p) => String(p.name || "").toLowerCase().includes(q));
}

/**
 * Build exact merchant_sku → product map. Cardinality tracked separately.
 */
export function buildExactSkuMap(products) {
  const map = new Map();
  const counts = new Map();
  for (const p of products || []) {
    const sku = p?.merchant_sku;
    if (sku == null || sku === "") continue;
    counts.set(sku, (counts.get(sku) || 0) + 1);
  }
  for (const p of products || []) {
    const sku = p?.merchant_sku;
    if (!sku) continue;
    if ((counts.get(sku) || 0) === 1) map.set(sku, p);
  }
  return { map, counts };
}

export function requireExactSku(skuMap, sku) {
  const n = skuMap.counts.get(sku) || 0;
  if (n === 0) return { ok: false, error: `SKU_CARDINALITY:${sku}:0` };
  if (n !== 1) return { ok: false, error: `SKU_CARDINALITY:${sku}:${n}` };
  return { ok: true, product: skuMap.map.get(sku) };
}

/**
 * Build category_id → identity from admin-list rows.
 * Computes has_active_children from parent_id links.
 */
export function buildCategoryIndex(categories) {
  const list = Array.isArray(categories) ? categories : [];
  const byId = new Map();
  for (const c of list) {
    if (!c?.id) continue;
    byId.set(c.id, {
      id: c.id,
      slug: c.slug ?? null,
      name: c.name ?? null,
      parent_id: c.parent_id ?? null,
      is_active: c.is_active !== false,
      has_active_children: false,
    });
  }
  for (const c of list) {
    if (!c?.parent_id || c.is_active === false) continue;
    const parent = byId.get(c.parent_id);
    if (parent) parent.has_active_children = true;
  }
  return byId;
}

export function enrichProductWithCategorySlug(product, categoryById) {
  if (!product) return product;
  const cat = product.category_id ? categoryById.get(product.category_id) : null;
  const slug = cat?.slug ?? null;
  return {
    ...product,
    category_slug: slug,
    _category: cat
      ? {
          id: cat.id,
          slug: cat.slug,
          name: cat.name,
          parent_id: cat.parent_id,
          is_active: cat.is_active,
          has_active_children: cat.has_active_children,
        }
      : null,
  };
}

export function enrichCatalogProducts(products, categoryById) {
  return (products || []).map((p) => enrichProductWithCategorySlug(p, categoryById));
}

/**
 * Exactly one active Leaf with slug perfumes (no active children).
 */
export function resolveActivePerfumesLeaf(categoryById) {
  const matches = [];
  for (const cat of categoryById.values()) {
    if (
      cat.slug === PERFUMES_CATEGORY_SLUG &&
      cat.is_active &&
      cat.has_active_children === false
    ) {
      matches.push(cat);
    }
  }
  if (matches.length !== 1) {
    return {
      ok: false,
      error: `PERFUMES_LEAF_CARDINALITY:${matches.length}`,
      category: null,
    };
  }
  return { ok: true, category: matches[0] };
}

export function snapshotProductBaseline(product) {
  const out = {};
  for (const f of BASELINE_FIELDS) {
    let v = product[f];
    if (f === "images") {
      v = Array.isArray(product.images)
        ? [...product.images]
        : product.image_url
          ? [product.image_url]
          : [];
    }
    if (f === "sizes" && Array.isArray(v)) v = v.map(String).join(", ");
    out[f] = v === undefined ? null : v;
  }
  return out;
}

export function computeFullCatalogBaselineSha(products) {
  const snaps = (products || [])
    .map(snapshotProductBaseline)
    .sort((a, b) => String(a.merchant_sku).localeCompare(String(b.merchant_sku)));
  const canonical = JSON.stringify(snaps);
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex").toUpperCase();
}

/** Full-catalog fields classified as merchant-segmentation surface (final preflight evidence). */
export const SEGMENTATION_FIELDS = Object.freeze([
  "target_audience",
  "business_type_tags",
  "product_use_cases",
  "visible_in",
  "purchase_mode",
  "is_b2b_offer",
  "requires_verified_salon",
  "min_order_qty",
  "max_order_qty",
]);

/** Full-catalog fields classified as merchandising surface (final preflight evidence). */
export const MERCHANDISING_FIELDS = Object.freeze([
  "is_featured",
  "is_new",
  "is_best_seller",
  "loyalty_points_enabled",
  "colors",
  "dimensions",
  "weight_grams",
  "offer_ends_at",
]);

/**
 * Exact safe-state counts across the live catalog (final preflight evidence). Mirrors the
 * per-product checks in `assertSafeMerchantState` but returns counts rather than errors, so
 * the read-only preflight report can show `private_count === product_count`, etc., rather
 * than only pass/fail.
 */
export function computeCatalogSafetyCounts(products) {
  let privateCount = 0;
  let inactiveCount = 0;
  let unpublishedCount = 0;
  let stockZeroCount = 0;
  let publicLeakageCount = 0;
  for (const p of products || []) {
    if (String(p.visibility_status || "") === "private") privateCount += 1;
    const isActive = p.is_active === true || p.is_active === "true" || p.is_active === 1;
    if (!isActive) inactiveCount += 1;
    const isPublished = p.is_published === true || p.is_published === "true" || p.is_published === 1;
    if (!isPublished) unpublishedCount += 1;
    if (Number(p.stock ?? 0) === 0) stockZeroCount += 1;
    if (isPublished && String(p.visibility_status || "") === "public") publicLeakageCount += 1;
  }
  return {
    private_count: privateCount,
    inactive_count: inactiveCount,
    unpublished_count: unpublishedCount,
    stock_zero_count: stockZeroCount,
    public_leakage_count: publicLeakageCount,
  };
}

/** Category-slug distribution across a set of (already category-enriched) products. */
export function computeCategoryDistribution(products) {
  const dist = {};
  for (const p of products || []) {
    const slug = p.category_slug || "unknown";
    dist[slug] = (dist[slug] || 0) + 1;
  }
  return dist;
}

export function createEmptyWriteAccounting() {
  return {
    storage_upload_attempted: 0,
    storage_upload_succeeded: 0,
    storage_verified: 0,
    db_update_attempted: 0,
    db_update_succeeded: 0,
    db_update_verified: 0,
    indeterminate: 0,
    conflicts: 0,
  };
}

export function summarizeWriteAccounting(acct = {}) {
  const a = { ...createEmptyWriteAccounting(), ...acct };
  return {
    ...a,
    production_storage_writes:
      a.storage_upload_attempted > 0 || a.storage_upload_succeeded > 0 || a.storage_verified > 0,
    production_db_writes:
      a.db_update_attempted > 0 || a.db_update_succeeded > 0 || a.db_update_verified > 0,
  };
}

/** Map frozen field names → payload keys that may differ. */
export const FIELD_TO_PAYLOAD_KEYS = Object.freeze({
  image_url: ["images"],
  sizes: ["sizes"],
  category_slug: ["category_id"],
  short_description: ["short_description"],
  name: ["name"],
  slug: ["slug"],
  brand: ["brand"],
});

export function allowedPayloadDiffKeys(fieldMap) {
  const keys = new Set();
  for (const field of Object.keys(fieldMap || {})) {
    for (const k of FIELD_TO_PAYLOAD_KEYS[field] || []) keys.add(k);
  }
  return keys;
}

export function stableJson(value) {
  return JSON.stringify(value, (_k, v) => (v === undefined ? null : v));
}

export function diffPayloadKeys(beforePayload, afterPayload) {
  const keys = new Set([...Object.keys(beforePayload || {}), ...Object.keys(afterPayload || {})]);
  const diffs = [];
  for (const k of keys) {
    if (stableJson(beforePayload?.[k]) !== stableJson(afterPayload?.[k])) diffs.push(k);
  }
  return diffs;
}

export function assertOnlyAllowedPayloadDiffs(beforePayload, afterPayload, fieldMap) {
  const allowed = allowedPayloadDiffKeys(fieldMap);
  const diffs = diffPayloadKeys(beforePayload, afterPayload);
  const unexpected = diffs.filter((k) => !allowed.has(k));
  if (unexpected.length) {
    return { ok: false, unexpected, diffs };
  }
  return { ok: true, unexpected: [], diffs };
}

/**
 * Compare non-target baseline fields between two product snapshots.
 */
export function assertNonTargetFieldsUnchanged(before, after, targetFields) {
  const target = new Set(targetFields || []);
  if (target.has("image_url")) {
    target.add("images");
    target.add("image_url");
  }
  if (target.has("category_slug")) {
    target.add("category_id");
    target.add("category_slug");
  }
  const mismatches = [];
  const beforeSnap = snapshotProductBaseline(before);
  const afterSnap = snapshotProductBaseline(after);
  for (const f of BASELINE_FIELDS) {
    if (target.has(f)) continue;
    if (f === "updated_at") continue;
    if (stableJson(beforeSnap[f]) !== stableJson(afterSnap[f])) {
      mismatches.push({ field: f, before: beforeSnap[f], after: afterSnap[f] });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

export function assertMerchantId(product) {
  return product?.merchant_id === TARGET_MERCHANT_ID;
}

/**
 * Classify indeterminate SKU against live enriched product.
 * A: all proposed → completed
 * B: all frozen → verified pending
 * C: mixed → conflict
 */
export function classifyIndeterminateProduct(product, fieldMap, extras = {}) {
  // Import matchers lazily via params to avoid circular deps — callers pass matchers.
  return { needsMatchers: true, product, fieldMap, extras };
}

// ---------------------------------------------------------------------------
// Pre-POST semantic collateral protection.
//
// Comparing the outgoing payload against a payload rebuilt from the live product
// (basePayload → nextPayload) is not sufficient: both sides pass through the same
// coercions (e.g. `description ?? ""`), which can hide a genuine semantic change
// between what is *currently stored* and what the POST would *actually write*
// (null vs "", null vs 0, null vs false, null vs [], sizes representation, trimmed
// brand/colors/dimensions). `assertNoPreWriteCollateral` compares the payload
// directly against the raw live product using semantic equivalence classes, so a
// real collateral change can never be masked by the payload builder's own coercion.
// ---------------------------------------------------------------------------

const SEMANTIC_EMPTY_STRING_FIELDS = new Set([
  "name",
  "slug",
  "description",
  "short_description",
  "brand",
  "offer_ends_at",
]);
const SEMANTIC_ZERO_NUMBER_FIELDS = new Set(["purchase_price", "low_stock_threshold", "weight_grams"]);
const SEMANTIC_FALSE_BOOL_FIELDS = new Set([
  "is_active",
  "is_featured",
  "is_new",
  "is_best_seller",
  "loyalty_points_enabled",
]);
const SEMANTIC_EMPTY_ARRAY_FIELDS = new Set(["images", "colors"]);
const SEMANTIC_TRIMMED_FIELDS = new Set(["brand"]);

/** Payload keys checked for pre-write collateral (mirrors productToAdminPayload's shape). */
export const PRE_WRITE_COLLATERAL_CHECKED_KEYS = Object.freeze([
  "name",
  "slug",
  "description",
  "short_description",
  "category_id",
  "purchase_price",
  "low_stock_threshold",
  "is_active",
  "is_featured",
  "is_new",
  "is_best_seller",
  "offer_ends_at",
  "images",
  "loyalty_points_enabled",
  "brand",
  "colors",
  "sizes",
  "dimensions",
  "weight_grams",
]);

export function normalizeSemanticFieldValue(field, value) {
  if (SEMANTIC_EMPTY_STRING_FIELDS.has(field)) {
    let v = value == null ? "" : String(value);
    if (SEMANTIC_TRIMMED_FIELDS.has(field)) v = v.trim();
    return v;
  }
  if (SEMANTIC_ZERO_NUMBER_FIELDS.has(field)) {
    return value == null || value === "" ? 0 : Number(value);
  }
  if (SEMANTIC_FALSE_BOOL_FIELDS.has(field)) {
    return Boolean(value);
  }
  if (field === "sizes") {
    if (value == null) return "";
    if (Array.isArray(value)) return value.map((s) => String(s).trim()).join(", ");
    return String(value).trim();
  }
  if (SEMANTIC_EMPTY_ARRAY_FIELDS.has(field)) {
    const arr = Array.isArray(value) ? value : value == null ? [] : [value];
    return stableJson(arr.map((x) => (typeof x === "string" ? x.trim() : x)));
  }
  if (field === "dimensions") {
    if (value == null) return "";
    if (typeof value === "string") return value.trim();
    return stableJson(value);
  }
  return stableJson(value);
}

function liveValueForPayloadKey(liveProduct, key) {
  if (key === "images") {
    if (Array.isArray(liveProduct.images) && liveProduct.images.length) return liveProduct.images;
    return liveProduct.image_url ? [liveProduct.image_url] : [];
  }
  return liveProduct[key];
}

/**
 * Compare the *actual* semantic effect of `payload` against the raw live product for
 * every field NOT explicitly targeted by `fieldMap`. Any real semantic difference
 * (never a mere representation difference) is a collateral diff and must block the
 * write for that SKU before any POST is attempted.
 */
export function assertNoPreWriteCollateral(liveProduct, payload, fieldMap) {
  const targetKeys = allowedPayloadDiffKeys(fieldMap);
  const collateral = [];
  for (const key of PRE_WRITE_COLLATERAL_CHECKED_KEYS) {
    if (targetKeys.has(key)) continue;
    if (!(key in (payload || {}))) continue;
    const liveRaw = liveValueForPayloadKey(liveProduct, key);
    const a = normalizeSemanticFieldValue(key, liveRaw);
    const b = normalizeSemanticFieldValue(key, payload[key]);
    if (stableJson(a) !== stableJson(b)) {
      collateral.push({ field: key, live: liveRaw, payload: payload[key] });
    }
  }
  return { ok: collateral.length === 0, collateral };
}

/**
 * Canonical journal completion accounting. `grouped` is the 30-SKU field grouping
 * (source of truth for expected field counts per SKU); `journal.entries` carries the
 * durable per-SKU status. `skipped_completed` entries from a prior run remain
 * `status: "completed"` on the journal, so they count toward completion here with no
 * special-casing required.
 */
export function summarizeJournalCompletion(journal, grouped) {
  const bySku = new Map((grouped || []).map((g) => [g.merchant_sku, g]));
  let completed = 0;
  let pending = 0;
  let failed = 0;
  let indeterminate = 0;
  let fieldsVerified = 0;
  let imagesVerified = 0;
  for (const entry of journal?.entries || []) {
    const g = bySku.get(entry.merchant_sku);
    if (!g) continue;
    if (entry.status === "completed") {
      completed += 1;
      fieldsVerified += Object.keys(g.fields).length;
      if (g.fields.image_url && entry.upload_status === "uploaded_verified") imagesVerified += 1;
    } else if (entry.status === "pending") {
      pending += 1;
    } else if (entry.status === "failed") {
      failed += 1;
    } else if (entry.status === "indeterminate") {
      indeterminate += 1;
    }
  }
  const conflict = journal?.write_accounting?.conflicts || 0;
  return {
    completed,
    pending,
    failed,
    indeterminate,
    conflict,
    fields_verified: fieldsVerified,
    images_verified: imagesVerified,
  };
}
