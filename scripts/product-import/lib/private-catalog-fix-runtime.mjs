/**
 * Private-catalog FIX EXECUTION runtime (orchestration).
 * Adapters injected for Storage + Admin API; production writes only when gates pass.
 *
 * Contract corrections vs prior runtime (see docs 18_RUNTIME_CONTRACT_CORRECTION_REPORT.md):
 *  - Product resolution during DB updates uses GET-by-id only (never name search).
 *    Product ids are resolved once, during first-execute preflight, from the exact
 *    merchant_sku map built off the full live catalog, and persisted to the journal.
 *  - First-execute vs resume preflight are separate, explicit functions.
 *  - Write accounting (storage + DB) is tracked on the journal at every step so CLI
 *    failure/success output is always derived from what actually happened.
 *  - Postflight performs exact (not approximate) baseline comparison for every
 *    unaffected product, plus explicit HOLD / ARD-1191 checks.
 */
import fs from "fs";
import path from "path";
import {
  P1_HOLD_SKUS,
  HOLD_KNOWN,
  EXPECTED_EXECUTION,
  QA_HEAD_SHA,
  loadCsv,
  sha256File,
  scrubSecrets,
} from "./private-catalog-fix-plan.mjs";
import {
  assertWriteAuthorization,
  assertProductionConnection,
  EXPECTED_MANIFEST_SHA,
  EXPECTED_PRODUCT_COUNT,
  EXPECTED_BACKEND_API,
  EXPECTED_SUPABASE_HOST,
  EXPECTED_CATEGORY_DISTRIBUTION,
  PERFUMES_CATEGORY_SLUG,
  TARGET_MERCHANT_ID,
  TARGET_MERCHANT_SLUG,
  EXPECTED_MERCHANT_STATUS,
} from "./private-catalog-fix-gates.mjs";
import {
  resolveExecutionManifest,
  groupUpdatesBySku,
  assertSafeMerchantState,
  createJournalSkeleton,
  sha256Hex,
  toCsv,
  BUCKET,
  REMEDIATION_PREFIX,
  getActualGitHead,
} from "./private-catalog-fix-execution.mjs";
import {
  BASELINE_FIELDS,
  SEGMENTATION_FIELDS,
  MERCHANDISING_FIELDS,
  buildExactSkuMap,
  requireExactSku,
  buildCategoryIndex,
  enrichCatalogProducts,
  enrichProductWithCategorySlug,
  resolveActivePerfumesLeaf,
  snapshotProductBaseline,
  computeFullCatalogBaselineSha,
  computeCatalogSafetyCounts,
  computeCategoryDistribution,
  createEmptyWriteAccounting,
  summarizeWriteAccounting,
  assertOnlyAllowedPayloadDiffs,
  assertNonTargetFieldsUnchanged,
  assertMerchantId,
  assertNoPreWriteCollateral,
  summarizeJournalCompletion,
  stableJson,
} from "./private-catalog-fix-catalog.mjs";

export const CANARY_SKU = "ARD-2793";

/** Normalize product field for frozen/proposed CSV comparison (representation only). */
export function normalizeFieldForMatch(field, value) {
  if (value == null) return "";
  if (field === "sizes") {
    if (Array.isArray(value)) return value.map(String).join(", ");
    return String(value);
  }
  if (field === "image_url") {
    if (Array.isArray(value)) return String(value[0] || "");
    if (typeof value === "object" && value.images) return String(value.images[0] || "");
    return String(value);
  }
  return String(value);
}

export function productFieldValue(product, field) {
  if (field === "image_url") {
    if (product.image_url != null && product.image_url !== "") return product.image_url;
    if (Array.isArray(product.images) && product.images.length) return product.images[0];
    return "";
  }
  if (field === "category_slug") {
    return product.category_slug ?? product.categories?.slug ?? "";
  }
  if (field === "category_id") {
    return product.category_id ?? "";
  }
  return product[field];
}

/**
 * Every live field must equal the frozen `current_value` (optimistic concurrency).
 */
export function matchFrozenAgainstProduct(product, fieldMap) {
  const mismatches = [];
  for (const [field, spec] of Object.entries(fieldMap)) {
    const actual = normalizeFieldForMatch(field, productFieldValue(product, field));
    const expected = normalizeFieldForMatch(field, spec.current_value);
    if (actual !== expected) mismatches.push({ field, expected, actual });
  }
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * Every live field must equal the frozen `proposed_value` (post-write / resume completed check).
 */
export function matchProposedAgainstProduct(product, fieldMap, extras = {}) {
  const mismatches = [];
  for (const [field, spec] of Object.entries(fieldMap)) {
    if (field === "category_slug") {
      // The frozen manifest only ever proposes a `category_slug` field (never a
      // `category_id` key) — the category_id corroboration must therefore be checked
      // alongside `category_slug` itself, not behind an unreachable separate field key.
      // This closes a real gap: two categories could share the same slug (e.g. after a
      // future category split), and slug-only verification would silently accept the
      // wrong category id.
      const slug = normalizeFieldForMatch("category_slug", productFieldValue(product, "category_slug"));
      if (slug !== String(spec.proposed_value)) {
        mismatches.push({ field, expected: spec.proposed_value, actual: slug });
      }
      if (extras.category_id) {
        const id = String(product.category_id || "");
        if (id !== String(extras.category_id)) {
          mismatches.push({ field: "category_id", expected: extras.category_id, actual: id });
        }
      }
      continue;
    }
    const actual = normalizeFieldForMatch(field, productFieldValue(product, field));
    const expected = normalizeFieldForMatch(field, spec.proposed_value);
    if (actual !== expected) mismatches.push({ field, expected, actual });
  }
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * Field-by-field classification of a live product against frozen vs proposed values.
 * A: every field equals proposed → treat as completed.
 * B: every field equals frozen → treat as still-pending (safe to retry).
 * C: any field equals neither, or fields disagree (some proposed, some frozen) → conflict,
 *    requires manual resolution before resuming.
 */
export function classifyIndeterminateLive(product, fieldMap, extras = {}) {
  const perField = [];
  for (const [field, spec] of Object.entries(fieldMap)) {
    let actual;
    let proposedExpected;
    let frozenExpected;
    if (field === "category_slug" || field === "category_id") {
      actual = normalizeFieldForMatch("category_slug", productFieldValue(product, "category_slug"));
      proposedExpected = field === "category_slug" ? String(spec.proposed_value) : actual;
      frozenExpected = field === "category_slug" ? String(spec.current_value) : actual;
    } else {
      actual = normalizeFieldForMatch(field, productFieldValue(product, field));
      proposedExpected = normalizeFieldForMatch(field, spec.proposed_value);
      frozenExpected = normalizeFieldForMatch(field, spec.current_value);
    }
    let state;
    if (actual === proposedExpected) state = "proposed";
    else if (actual === frozenExpected) state = "frozen";
    else state = "neither";
    perField.push({ field, state, actual, proposedExpected, frozenExpected });
  }

  const states = new Set(perField.map((p) => p.state));
  let classification;
  let status;
  if (states.has("neither") || (states.has("proposed") && states.has("frozen"))) {
    classification = "C";
    status = "conflict";
  } else if (states.size === 1 && states.has("proposed")) {
    classification = "A";
    status = "completed";
  } else if (states.size === 1 && states.has("frozen")) {
    classification = "B";
    status = "pending";
  } else {
    classification = "C";
    status = "conflict";
  }

  return {
    classification,
    status,
    perField,
    proposed: matchProposedAgainstProduct(product, fieldMap, extras),
    frozen: matchFrozenAgainstProduct(product, fieldMap),
  };
}

const FORBIDDEN_WRITE_FIELDS = new Set([
  "price",
  "stock",
  "is_active",
  "is_published",
  "visibility_status",
  "discount_price",
  "merchant_id",
  "merchant_sku",
]);

function productToAdminPayload(liveProduct) {
  const images =
    Array.isArray(liveProduct.images) && liveProduct.images.length
      ? [...liveProduct.images]
      : liveProduct.image_url
        ? [liveProduct.image_url]
        : [];

  let sizes = liveProduct.sizes;
  if (typeof sizes === "string") sizes = sizes ? [sizes] : [];
  if (!Array.isArray(sizes)) sizes = [];

  return {
    name: liveProduct.name,
    slug: liveProduct.slug,
    description: liveProduct.description ?? "",
    short_description: liveProduct.short_description ?? null,
    price: Number(liveProduct.price),
    discount_price: liveProduct.discount_price ?? null,
    category_id: liveProduct.category_id ?? null,
    stock: Number(liveProduct.stock ?? 0),
    purchase_price: Number(liveProduct.purchase_price ?? 0),
    low_stock_threshold: Number(liveProduct.low_stock_threshold ?? 5),
    is_active: Boolean(liveProduct.is_active),
    is_featured: Boolean(liveProduct.is_featured),
    is_new: Boolean(liveProduct.is_new),
    is_best_seller: Boolean(liveProduct.is_best_seller),
    offer_ends_at: liveProduct.offer_ends_at ?? null,
    images,
    loyalty_points_enabled: Boolean(liveProduct.loyalty_points_enabled),
    merchant_id: TARGET_MERCHANT_ID,
    brand: liveProduct.brand ?? null,
    colors: Array.isArray(liveProduct.colors) ? liveProduct.colors : [],
    sizes,
    dimensions: liveProduct.dimensions ?? null,
    weight_grams: liveProduct.weight_grams ?? null,
  };
}

/**
 * Build the full Admin update payload for one grouped SKU update, and assert that the
 * only payload keys that differ from the live product's unmodified payload are the keys
 * explicitly allowed by the requested field map (no collateral diffs).
 */
export function buildAdminUpdatePayload(liveProduct, fieldMap, { perfumesCategoryId } = {}) {
  for (const field of Object.keys(fieldMap || {})) {
    if (FORBIDDEN_WRITE_FIELDS.has(field)) {
      throw new Error(`FORBIDDEN_FIELD_IN_PAYLOAD:${field}`);
    }
  }

  const basePayload = productToAdminPayload(liveProduct);
  const nextPayload = { ...basePayload };

  for (const [field, spec] of Object.entries(fieldMap)) {
    if (field === "image_url") {
      nextPayload.images = [spec.proposed_value];
    } else if (field === "sizes") {
      nextPayload.sizes = [String(spec.proposed_value)];
    } else if (field === "category_slug") {
      if (!perfumesCategoryId) throw new Error("PERFUMES_CATEGORY_ID_REQUIRED");
      nextPayload.category_id = perfumesCategoryId;
    } else if (field === "short_description") {
      nextPayload.short_description = spec.proposed_value;
    } else if (field === "name" || field === "slug" || field === "brand") {
      nextPayload[field] = spec.proposed_value;
    }
  }

  const diffCheck = assertOnlyAllowedPayloadDiffs(basePayload, nextPayload, fieldMap);
  if (!diffCheck.ok) {
    const err = new Error(`COLLATERAL_PAYLOAD_DIFF:${diffCheck.unexpected.join(",")}`);
    err.code = "COLLATERAL_PAYLOAD_DIFF";
    err.unexpected = diffCheck.unexpected;
    throw err;
  }

  return nextPayload;
}

export function assertManifestSha(resolved) {
  if (resolved.manifestSha !== EXPECTED_MANIFEST_SHA) {
    return { ok: false, error: `MANIFEST_SHA_MISMATCH:${resolved.manifestSha}` };
  }
  return { ok: true };
}

/**
 * Execution head binding (final safety patch).
 *
 * QA_HEAD_SHA is a frozen historical constant and must never gate execution — the only
 * thing that may authorize a first --execute is an explicit human-approved SHA
 * (`FIX_EXEC_APPROVED_HEAD_SHA`) that matches the *actual* current Git HEAD of the
 * working tree at execution time. That approved+actual SHA is then persisted onto the
 * journal (`journal.execution_head_sha`) and re-verified on every --resume.
 */
export function assertFirstExecuteHeadBinding({
  env = process.env,
  cwd = process.cwd(),
  getActualHeadShaFn = getActualGitHead,
} = {}) {
  const approved = env?.FIX_EXEC_APPROVED_HEAD_SHA;
  const actual = getActualHeadShaFn(cwd);
  if (!approved || String(approved).trim() === "") {
    return { ok: false, errors: ["APPROVED_HEAD_REQUIRED"], headSha: actual };
  }
  if (!actual) {
    return { ok: false, errors: ["APPROVED_HEAD_REQUIRED:GIT_HEAD_UNAVAILABLE"], headSha: actual };
  }
  if (String(approved) !== String(actual)) {
    return { ok: false, errors: [`APPROVED_HEAD_MISMATCH:${approved}!=${actual}`], headSha: actual };
  }
  return { ok: true, errors: [], headSha: actual };
}

export function assertResumeHeadBinding({
  journal,
  env = process.env,
  cwd = process.cwd(),
  getActualHeadShaFn = getActualGitHead,
} = {}) {
  const approved = env?.FIX_EXEC_APPROVED_HEAD_SHA;
  const actual = getActualHeadShaFn(cwd);
  const journalHead = journal?.execution_head_sha;
  const errors = [];
  if (!journalHead) {
    errors.push("RESUME_HEAD_MISMATCH:JOURNAL_MISSING_EXECUTION_HEAD_SHA");
  } else if (String(actual) !== String(journalHead)) {
    errors.push(`RESUME_HEAD_MISMATCH:actual=${actual}!=journal=${journalHead}`);
  }
  if (!approved || String(approved).trim() === "") {
    errors.push("APPROVED_HEAD_REQUIRED");
  } else if (journalHead && String(approved) !== String(journalHead)) {
    errors.push(`APPROVED_HEAD_MISMATCH:${approved}!=${journalHead}`);
  }
  return { ok: errors.length === 0, errors, headSha: actual };
}

/**
 * First-execute preflight. Requires live adapters. Mutates `journal` (when supplied and the
 * gate passes) to persist resolved product ids + frozen baselines + full-catalog baseline SHA
 * BEFORE any writes happen, so failure/resume paths always have exact evidence to compare against.
 */
export async function runFirstExecutePreflight({
  resolved,
  adapters,
  connection,
  journal,
  env = process.env,
  cwd = process.cwd(),
  getActualHeadShaFn = getActualGitHead,
  enforceHeadBinding = false,
}) {
  const errors = [];
  if (!adapters?.fetchLiveCatalog || !adapters?.storage?.pathExists) {
    return {
      ok: false,
      judgment: "LIVE_PREFLIGHT_UNAVAILABLE",
      errors: ["LIVE_ADAPTERS_REQUIRED"],
      checked_live: false,
    };
  }

  const conn = assertProductionConnection(connection);
  if (!conn.ok) {
    return { ok: false, judgment: "LIVE_PREFLIGHT_FAIL", errors: conn.errors, checked_live: false };
  }

  const shaGate = assertManifestSha(resolved);
  if (!shaGate.ok) {
    return { ok: false, judgment: "LIVE_PREFLIGHT_FAIL", errors: [shaGate.error], checked_live: false };
  }

  let headSha = null;
  let approvedHeadSha = null;
  let headMatch = null;
  if (enforceHeadBinding) {
    approvedHeadSha = env?.FIX_EXEC_APPROVED_HEAD_SHA || null;
    const headGate = assertFirstExecuteHeadBinding({ env, cwd, getActualHeadShaFn });
    headSha = headGate.headSha;
    if (!headGate.ok) {
      return {
        ok: false,
        judgment: "LIVE_PREFLIGHT_FAIL",
        errors: headGate.errors,
        checked_live: false,
        actual_git_head: headSha,
        approved_head_sha: approvedHeadSha,
        head_match: false,
      };
    }
    headMatch = true;
  }

  if (journal?.entries?.some((e) => e.status === "completed")) {
    return {
      ok: false,
      judgment: "LIVE_PREFLIGHT_FAIL",
      errors: ["JOURNAL_ALREADY_HAS_COMPLETED_ENTRIES:use --resume"],
      checked_live: false,
    };
  }

  let catalog;
  try {
    catalog = await adapters.fetchLiveCatalog();
  } catch (e) {
    return {
      ok: false,
      judgment: "LIVE_PREFLIGHT_UNAVAILABLE",
      errors: [`FETCH_FAILED:${e.message || e}`],
      checked_live: false,
    };
  }

  const products = catalog.products || [];
  const merchant = catalog.merchant || {};
  const categoryById = catalog.categoryById || buildCategoryIndex(catalog.categories || []);
  const skuMap = catalog.skuMap || buildExactSkuMap(products);

  const safe = assertSafeMerchantState(products, { status: merchant.status });
  if (!safe.ok) errors.push(...safe.errors);
  if (merchant.slug && merchant.slug !== TARGET_MERCHANT_SLUG) {
    errors.push(`WRONG_MERCHANT_SLUG:${merchant.slug}`);
  }
  if (merchant.status !== EXPECTED_MERCHANT_STATUS) {
    errors.push(`WRONG_MERCHANT_STATUS:${merchant.status}`);
  }
  if (products.length !== EXPECTED_PRODUCT_COUNT) {
    errors.push(`PRODUCT_COUNT:${products.length}`);
  }

  // Exact SKU map cardinality 1 + frozen match for the 30 affected SKUs; resolve ids + baselines.
  const grouped = groupUpdatesBySku(resolved.fieldRows);
  const resolvedProducts = {};
  const liveBySku = {};
  let frozenCurrentMatches = 0;
  let frozenCurrentMismatches = 0;
  for (const g of grouped) {
    const r = requireExactSku(skuMap, g.merchant_sku);
    if (!r.ok) {
      errors.push(r.error);
      continue;
    }
    if (!assertMerchantId(r.product)) {
      errors.push(`WRONG_MERCHANT_ID:${g.merchant_sku}`);
      continue;
    }
    const m = matchFrozenAgainstProduct(r.product, g.fields);
    if (!m.ok) {
      errors.push(`CURRENT_MISMATCH:${g.merchant_sku}:${m.mismatches.map((x) => x.field).join(",")}`);
      frozenCurrentMismatches += 1;
    } else {
      frozenCurrentMatches += 1;
    }
    resolvedProducts[g.merchant_sku] = {
      id: r.product.id,
      frozen_baseline: snapshotProductBaseline(r.product),
    };
    liveBySku[g.merchant_sku] = r.product;
  }
  if (Object.keys(resolvedProducts).length !== EXPECTED_EXECUTION.affected_products) {
    errors.push(`RESOLVED_PRODUCTS:${Object.keys(resolvedProducts).length}/${EXPECTED_EXECUTION.affected_products}`);
  }

  // HOLD / ARD-1191 must never appear in scope.
  for (const sku of [...P1_HOLD_SKUS, ...HOLD_KNOWN]) {
    if (grouped.some((g) => g.merchant_sku === sku)) {
      errors.push(`FORBIDDEN_SKU_IN_SCOPE:${sku}`);
    }
  }

  // Category enrichment: exactly one active perfumes Leaf (no active children).
  const leaf = resolveActivePerfumesLeaf(categoryById);
  if (!leaf.ok) errors.push(leaf.error);
  const perfumesCategoryIdForSemanticCheck = leaf.ok ? leaf.category.id : null;

  // Pre-write semantic collateral check for every resolved SKU — builds the exact Admin
  // update payload and runs the same collateral gate `runDbUpdates` runs immediately
  // before POST, but here strictly read-only (never calls adapters.admin.updateProduct).
  // A payload build or collateral failure here means a live --execute would stop that SKU
  // before any write, so the read-only preflight must surface it as a FAIL, not a PASS.
  let payloadSemanticChecks = 0;
  let payloadSemanticPass = 0;
  const payloadSemanticFailures = [];
  for (const g of grouped) {
    const live = liveBySku[g.merchant_sku];
    if (!live) continue;
    payloadSemanticChecks += 1;
    try {
      const payload = buildAdminUpdatePayload(live, g.fields, {
        perfumesCategoryId: perfumesCategoryIdForSemanticCheck,
      });
      const collateral = assertNoPreWriteCollateral(live, payload, g.fields);
      if (collateral.ok) {
        payloadSemanticPass += 1;
      } else {
        payloadSemanticFailures.push(
          `${g.merchant_sku}:${collateral.collateral.map((c) => c.field).join(",")}`,
        );
      }
    } catch (e) {
      payloadSemanticFailures.push(`${g.merchant_sku}:${e.message || e}`);
    }
  }
  const payloadSemanticFail = payloadSemanticChecks - payloadSemanticPass;
  if (payloadSemanticFail > 0) {
    errors.push(`PAYLOAD_SEMANTIC_COLLATERAL:${payloadSemanticFailures.join("|")}`);
  }

  // Storage server-key acceptance probe (read-only) — the gateway must accept the frozen
  // server key BEFORE any of the nine path probes runs. Without this gate an unusable key
  // surfaces mid-probe as a raw upstream "Invalid Compact JWS", which is both unclassified
  // and indistinguishable from a genuine path problem.
  let storageAuthMeta = {
    storage_key_kind: null,
    storage_key_source: null,
    storage_server_key_probe: null,
    storage_server_key_probe_status: null,
    storage_auth_flow: null,
  };
  const readStorageAuthMeta = () =>
    typeof adapters.storageAuthMeta === "function"
      ? { ...storageAuthMeta, ...adapters.storageAuthMeta() }
      : storageAuthMeta;

  if (typeof adapters.ensureStorageAuth === "function") {
    try {
      await adapters.ensureStorageAuth();
      storageAuthMeta = readStorageAuthMeta();
    } catch (e) {
      storageAuthMeta = readStorageAuthMeta();
      return {
        ok: false,
        judgment: "LIVE_PREFLIGHT_UNAVAILABLE",
        errors: [
          `STORAGE_SERVER_KEY_PROBE_FAILED:${e.storage_auth_code || "KEY_INVALID_DISABLED_OR_WRONG_PROJECT"}`,
        ],
        checked_live: false,
        ...storageAuthMeta,
        storage_paths_total: (resolved.assets || []).length,
        storage_paths_absent: 0,
        storage_paths_existing: 0,
        path_results: [],
        pathResults: [],
        production_storage_writes: false,
        production_db_writes: false,
      };
    }
  }

  // Storage: target paths must be absent (LIST only — no upload/remove/move/copy/sign).
  const pathResults = [];
  for (const asset of resolved.assets) {
    let exists;
    try {
      exists = await adapters.storage.pathExists(asset.storage_path);
    } catch (e) {
      // Stop immediately on the first Storage failure — remaining paths are never probed.
      return {
        ok: false,
        judgment: "LIVE_PREFLIGHT_UNAVAILABLE",
        errors: [
          `STORAGE_PROBE_FAILED:${asset.merchant_sku}:${e.storage_auth_code || e.code || "STORAGE_PROBE_FAILED"}`,
        ],
        checked_live: false,
        ...storageAuthMeta,
        storage_paths_total: resolved.assets.length,
        storage_paths_absent: pathResults.filter((p) => !p.exists).length,
        storage_paths_existing: pathResults.filter((p) => p.exists).length,
        path_results: pathResults,
        pathResults,
        production_storage_writes: false,
        production_db_writes: false,
      };
    }
    pathResults.push({
      merchant_sku: asset.merchant_sku,
      storage_path: asset.storage_path,
      path: asset.storage_path,
      exists: Boolean(exists),
      probe_status: exists ? "exists" : "absent",
    });
    if (exists) errors.push(`TARGET_PATH_EXISTS:${asset.storage_path}`);
  }

  if (
    storageAuthMeta.storage_server_key_probe != null &&
    storageAuthMeta.storage_server_key_probe !== "PASS"
  ) {
    errors.push(`STORAGE_SERVER_KEY_PROBE_NOT_PASS:${storageAuthMeta.storage_server_key_probe}`);
  }

  // FULL_CATALOG_BASELINE_SHA256 for all products currently live (exact reconciliation anchor).
  const fullCatalogBaselineSha256 = computeFullCatalogBaselineSha(products);
  const frozenBaselines = {};
  for (const p of products) {
    frozenBaselines[p.merchant_sku] = snapshotProductBaseline(p);
  }

  // A successful PASS can never be reported without the reconciliation anchors that every
  // downstream postflight check depends on.
  if (!fullCatalogBaselineSha256) errors.push("MISSING_BASELINE_SHA");
  if (!pathResults.length) errors.push("MISSING_PATH_RESULTS");

  const safetyCounts = computeCatalogSafetyCounts(products);
  const categoryDistributionBefore = computeCategoryDistribution(products);
  const storagePathsExisting = pathResults.filter((p) => p.exists).length;
  const segmentationFieldsCovered = SEGMENTATION_FIELDS.filter((f) => BASELINE_FIELDS.includes(f)).length;
  const merchandisingFieldsCovered = MERCHANDISING_FIELDS.filter((f) => BASELINE_FIELDS.includes(f)).length;

  const ok = errors.length === 0;

  if (ok && journal) {
    journal.resolved_products = resolvedProducts;
    journal.frozen_baselines = frozenBaselines;
    journal.full_catalog_baseline_sha256 = fullCatalogBaselineSha256;
    journal.perfumes_category_id = leaf.ok ? leaf.category.id : null;
    journal.preflight_mode = "first_execute";
    if (enforceHeadBinding) journal.execution_head_sha = headSha;
  }

  return {
    ok,
    judgment: ok ? "LIVE_PREFLIGHT_PASS" : "LIVE_PREFLIGHT_FAIL",
    errors,
    checked_live: true,
    actual_git_head: headSha,
    approved_head_sha: approvedHeadSha,
    head_match: headMatch,
    resolved_manifest_sha256: resolved.manifestSha,
    merchant_id: merchant.id ?? null,
    merchant_slug: merchant.slug ?? null,
    merchant_status: merchant.status ?? null,
    product_count: products.length,
    ...safetyCounts,
    affected: grouped.length,
    affected_products: grouped.length,
    affected_skus_resolved: Object.keys(resolvedProducts).length,
    frozen_current_matches: frozenCurrentMatches,
    frozen_current_mismatches: frozenCurrentMismatches,
    payload_semantic_checks: payloadSemanticChecks,
    payload_semantic_pass: payloadSemanticPass,
    payload_semantic_fail: payloadSemanticFail,
    pathResults,
    path_results: pathResults,
    storage_paths_total: resolved.assets.length,
    storage_paths_absent: pathResults.length - storagePathsExisting,
    storage_paths_existing: storagePathsExisting,
    ...storageAuthMeta,
    full_catalog_baseline_sha256: fullCatalogBaselineSha256,
    baseline_field_count: BASELINE_FIELDS.length,
    segmentation_fields_covered: segmentationFieldsCovered,
    merchandising_fields_covered: merchandisingFieldsCovered,
    category_distribution_before: categoryDistributionBefore,
    production_storage_writes: false,
    production_db_writes: false,
    resolved_products: resolvedProducts,
    perfumes_category_id: leaf.ok ? leaf.category.id : null,
  };
}

/**
 * Resume preflight. Journal is mandatory. Reconciles `indeterminate` entries via GET-by-id
 * (never search) and classifies them A/B/C. Refuses to proceed on any C (conflict) or on
 * storage/DB corroboration mismatches for image-bearing SKUs.
 */
export async function runResumePreflight({
  resolved,
  adapters,
  connection,
  journal,
  env = process.env,
  cwd = process.cwd(),
  getActualHeadShaFn = getActualGitHead,
  enforceHeadBinding = false,
}) {
  const errors = [];

  if (!journal || !journal.entries?.length) {
    return {
      ok: false,
      judgment: "LIVE_PREFLIGHT_FAIL",
      errors: ["JOURNAL_MANDATORY_FOR_RESUME"],
      checked_live: false,
    };
  }
  if (!adapters?.fetchLiveCatalog || !adapters?.storage?.pathExists) {
    return {
      ok: false,
      judgment: "LIVE_PREFLIGHT_UNAVAILABLE",
      errors: ["LIVE_ADAPTERS_REQUIRED"],
      checked_live: false,
    };
  }

  const conn = assertProductionConnection(connection);
  if (!conn.ok) {
    return { ok: false, judgment: "LIVE_PREFLIGHT_FAIL", errors: conn.errors, checked_live: false };
  }

  const shaGate = assertManifestSha(resolved);
  if (!shaGate.ok) errors.push(shaGate.error);
  if (journal.manifest_sha256 !== resolved.manifestSha) {
    errors.push(`JOURNAL_MANIFEST_SHA_MISMATCH:${journal.manifest_sha256 || "MISSING"}`);
  }
  // NOTE: QA_HEAD_SHA is historical QA metadata only and must never gate resume — see
  // assertResumeHeadBinding, which binds resume to the actual Git HEAD recorded on the
  // journal by the first --execute (journal.execution_head_sha), not a frozen constant.
  if (enforceHeadBinding) {
    const headGate = assertResumeHeadBinding({ journal, env, cwd, getActualHeadShaFn });
    if (!headGate.ok) errors.push(...headGate.errors);
  }
  if (!journal.resolved_products) {
    errors.push("JOURNAL_MISSING_RESOLVED_PRODUCTS");
  }

  let catalog;
  try {
    catalog = await adapters.fetchLiveCatalog();
  } catch (e) {
    return {
      ok: false,
      judgment: "LIVE_PREFLIGHT_UNAVAILABLE",
      errors: [`FETCH_FAILED:${e.message || e}`],
      checked_live: false,
    };
  }

  const products = catalog.products || [];
  const merchant = catalog.merchant || {};
  const safe = assertSafeMerchantState(products, { status: merchant.status });
  if (!safe.ok) errors.push(...safe.errors);

  journal.write_accounting = journal.write_accounting || createEmptyWriteAccounting();
  const acct = journal.write_accounting;

  const grouped = groupUpdatesBySku(resolved.fieldRows);
  const bySkuFields = new Map(grouped.map((g) => [g.merchant_sku, g.fields]));
  const bySkuAsset = new Map((resolved.assets || []).map((a) => [a.merchant_sku, a]));
  const classifications = {};
  const pendingVerifiedSkus = new Set();

  for (const entry of journal.entries) {
    const fields = bySkuFields.get(entry.merchant_sku);
    if (!fields) continue;

    const resolvedMeta = journal.resolved_products?.[entry.merchant_sku];
    if (!resolvedMeta?.id) {
      errors.push(`RESUME_MISSING_RESOLVED_ID:${entry.merchant_sku}`);
      continue;
    }

    let live;
    try {
      live = await adapters.admin.getProductById(resolvedMeta.id);
    } catch (e) {
      errors.push(`RESUME_FETCH_FAILED:${entry.merchant_sku}:${e.message || e}`);
      continue;
    }

    if (entry.status === "completed") {
      const m = matchProposedAgainstProduct(live, fields);
      if (!m.ok) {
        errors.push(`RESUME_COMPLETED_MISMATCH:${entry.merchant_sku}:${m.mismatches.map((x) => x.field).join(",")}`);
      }
    } else if (entry.status === "pending") {
      const m = matchFrozenAgainstProduct(live, fields);
      if (!m.ok) {
        errors.push(`RESUME_PENDING_MISMATCH:${entry.merchant_sku}:${m.mismatches.map((x) => x.field).join(",")}`);
      } else {
        // Still-pending SKUs (never touched, or untouched after a stop-early) are safe to
        // retry on this resume once re-verified against the live frozen state.
        pendingVerifiedSkus.add(entry.merchant_sku);
      }
    } else if (entry.status === "indeterminate") {
      const cls = classifyIndeterminateLive(live, fields);
      classifications[entry.merchant_sku] = cls;
      if (cls.classification === "C") {
        acct.conflicts += 1;
        errors.push(`INDETERMINATE_CONFLICT:${entry.merchant_sku}`);
      } else if (fields.image_url) {
        // Storage/DB corroboration for image-bearing SKUs.
        //  A (DB shows proposed): the journal must show uploaded_verified AND the Storage
        //    object must independently exist with a matching SHA — never trust the journal
        //    flag alone.
        //  B (DB still frozen): the Storage object may or may not exist/verify; that is not
        //    a conflict. Resume must retry the DB write only and must never re-upload.
        if (cls.classification === "A") {
          let storageOk = entry.upload_status === "uploaded_verified";
          if (storageOk) {
            const asset = bySkuAsset.get(entry.merchant_sku);
            if (asset && adapters.storage.verifyObject) {
              const v = await adapters.storage.verifyObject(asset.storage_path, asset.sha256);
              storageOk = Boolean(v.ok);
            }
          }
          if (!storageOk) {
            errors.push(
              `STORAGE_JOURNAL_CORROBORATION_FAILED:${entry.merchant_sku}:db_shows_proposed_but_upload_not_verified`,
            );
          }
        }
        // Classification B: no Storage corroboration required — DB frozen means DB frozen,
        // regardless of what Storage independently shows.
      }
    }
  }

  const ok = errors.length === 0;
  if (ok) {
    for (const sku of pendingVerifiedSkus) {
      const entry = journal.entries.find((e) => e.merchant_sku === sku);
      if (entry) entry.frozen_current_verified = true;
    }
    for (const [sku, cls] of Object.entries(classifications)) {
      const entry = journal.entries.find((e) => e.merchant_sku === sku);
      if (!entry) continue;
      if (cls.classification === "A") {
        entry.status = "completed";
        entry.frozen_current_verified = true;
        entry.reconciled_via = "resume_get_by_id";
      } else if (cls.classification === "B") {
        entry.status = "pending";
        entry.frozen_current_verified = true;
        entry.reconciled_via = "resume_get_by_id";
      }
    }
  }

  return {
    ok,
    judgment: ok ? "LIVE_PREFLIGHT_PASS" : "LIVE_PREFLIGHT_FAIL",
    errors,
    checked_live: true,
    classifications,
    product_count: products.length,
    affected: grouped.length,
  };
}

/**
 * Live preflight — delegates to first-execute or resume preflight based on mode.
 * Offline/stale products.json alone must never return LIVE_PREFLIGHT_PASS.
 */
export async function runLivePreflight({
  resolved,
  adapters,
  connection,
  journal,
  mode = "execute",
  env = process.env,
  cwd = process.cwd(),
  getActualHeadShaFn = getActualGitHead,
  enforceHeadBinding = false,
}) {
  if (mode === "resume") {
    return runResumePreflight({ resolved, adapters, connection, journal, env, cwd, getActualHeadShaFn, enforceHeadBinding });
  }
  return runFirstExecutePreflight({ resolved, adapters, connection, journal, env, cwd, getActualHeadShaFn, enforceHeadBinding });
}

/**
 * Execute Storage uploads (canary then rest). Tracks write accounting on the journal.
 * Resume never re-uploads assets already verified — it only re-verifies by SHA.
 */
export async function runStorageUploads({ resolved, adapters, journal, mode = "execute", root }) {
  journal.write_accounting = journal.write_accounting || createEmptyWriteAccounting();
  const acct = journal.write_accounting;

  const results = [];
  const bySkuAsset = new Map(resolved.assets.map((a) => [a.merchant_sku, a]));
  const ordered = [
    CANARY_SKU,
    ...resolved.assets.map((a) => a.merchant_sku).filter((s) => s !== CANARY_SKU),
  ];

  async function uploadOne(sku) {
    const asset = bySkuAsset.get(sku);
    const entry = journal.entries.find((e) => e.merchant_sku === sku) || null;

    // Canonical journal write. A resume-only verify (no re-upload) must NEVER overwrite
    // the durable "uploaded_verified" canonical status recorded by the original
    // successful upload — the command result may say "already_verified_resume", but the
    // journal's canonical upload_status stays exactly as it was.
    function record(uploadStatus, extra = {}) {
      if (entry) {
        if (uploadStatus !== "already_verified_resume") {
          entry.upload_status = uploadStatus;
        }
        entry.timestamp = new Date().toISOString();
        if (String(uploadStatus).includes("indeterminate")) entry.status = "indeterminate";
      }
      results.push({ merchant_sku: sku, storage_path: asset?.storage_path, upload_status: uploadStatus, ...extra });
    }

    if (mode === "resume" && entry?.upload_status === "uploaded_verified") {
      const verified = await adapters.storage.verifyObject(asset.storage_path, asset.sha256);
      if (verified.ok) acct.storage_verified += 1;
      record(verified.ok ? "already_verified_resume" : "resume_verify_failed", verified);
      return verified.ok;
    }

    if (mode === "execute") {
      const exists = await adapters.storage.pathExists(asset.storage_path);
      if (exists) {
        record("failed_exists_on_first_execute");
        return false;
      }
    }

    const localPath = path.isAbsolute(asset.local_asset_path)
      ? asset.local_asset_path
      : path.join(root, asset.local_asset_path);
    const buf = fs.readFileSync(localPath);
    const localSha = sha256Hex(buf);
    if (localSha !== asset.sha256) {
      record("failed_local_sha_mismatch", { local_sha256: localSha, approved_sha256: asset.sha256 });
      return false;
    }

    acct.storage_upload_attempted += 1;
    const up = await adapters.storage.upload({
      path: asset.storage_path,
      body: buf,
      contentType: "image/webp",
      upsert: false,
    });
    if (!up.ok) {
      if (up.indeterminate) acct.indeterminate += 1;
      record(up.indeterminate ? "indeterminate" : "failed", { error: scrubSecrets(up.error || "") });
      return false;
    }
    acct.storage_upload_succeeded += 1;

    const verified = await adapters.storage.verifyObject(asset.storage_path, asset.sha256);
    if (verified.ok) acct.storage_verified += 1;
    else acct.indeterminate += 1;
    record(verified.ok ? "uploaded_verified" : "indeterminate_mismatch", {
      public_url: asset.public_url,
      local_sha256: localSha,
      remote_sha256: verified.remoteSha,
      public_get_status: verified.publicGetStatus,
      mime: verified.mime,
    });
    return verified.ok;
  }

  const canaryOk = await uploadOne(CANARY_SKU);
  if (!canaryOk) {
    return {
      ok: false,
      canary_ok: false,
      verified_count: results.filter((r) =>
        ["uploaded_verified", "already_verified_resume"].includes(r.upload_status),
      ).length,
      results,
      allow_db: false,
      stop_reason: "CANARY_FAILED",
      write_accounting: summarizeWriteAccounting(acct),
    };
  }

  for (const sku of ordered.slice(1)) {
    await uploadOne(sku);
  }

  const verifiedCount = results.filter((r) =>
    ["uploaded_verified", "already_verified_resume"].includes(r.upload_status),
  ).length;
  const allowDb = verifiedCount === EXPECTED_EXECUTION.replacement_assets;
  return {
    ok: allowDb,
    canary_ok: true,
    verified_count: verifiedCount,
    results,
    allow_db: allowDb,
    stop_reason: allowDb ? null : `UPLOADS_INCOMPLETE:${verifiedCount}/${EXPECTED_EXECUTION.replacement_assets}`,
    write_accounting: summarizeWriteAccounting(acct),
  };
}

/**
 * Apply grouped Admin updates. Resolves products by persisted id only (never search).
 * Stops processing further SKUs as soon as an indeterminate outcome or a 4xx HTTP
 * response is observed, so an operator can inspect state before any --resume.
 */
export async function runDbUpdates({ resolved, adapters, journal, mode = "execute", allowDb }) {
  if (!allowDb) {
    return {
      ok: false,
      updates: 0,
      results: [],
      stop_reason: "DB_BLOCKED_UNTIL_STORAGE_VERIFIED",
    };
  }

  journal.write_accounting = journal.write_accounting || createEmptyWriteAccounting();
  const acct = journal.write_accounting;

  const grouped = groupUpdatesBySku(resolved.fieldRows);
  const completedBeforeResume = (journal.entries || []).filter((e) => e.status === "completed").length;
  const results = [];
  let updates = 0;
  let stoppedEarly = false;
  let stopReason = null;

  const categories = await adapters.admin.listCategories();
  const categoryById = buildCategoryIndex(categories);

  let perfumesCategoryId = journal.perfumes_category_id || null;
  const needsCategory = grouped.some((g) => g.fields.category_slug);
  if (needsCategory && !perfumesCategoryId) {
    const leaf = resolveActivePerfumesLeaf(categoryById);
    if (!leaf.ok) return { ok: false, updates: 0, results: [], stop_reason: "PERFUMES_CATEGORY_NOT_FOUND" };
    perfumesCategoryId = leaf.category.id;
  }

  for (const g of grouped) {
    if (stoppedEarly) {
      results.push({ merchant_sku: g.merchant_sku, apply_status: "skipped_stopped_early" });
      continue;
    }

    const entry = journal.entries.find((e) => e.merchant_sku === g.merchant_sku);
    if (mode === "resume" && entry?.status === "completed") {
      results.push({ merchant_sku: g.merchant_sku, apply_status: "skipped_completed" });
      continue;
    }
    if (mode === "resume" && entry?.status === "pending" && entry.frozen_current_verified !== true) {
      results.push({ merchant_sku: g.merchant_sku, apply_status: "skipped_unverified_pending" });
      continue;
    }

    const resolvedMeta = journal.resolved_products?.[g.merchant_sku];
    if (!resolvedMeta?.id) {
      results.push({ merchant_sku: g.merchant_sku, apply_status: "failed_missing_resolved_id" });
      if (entry) {
        entry.status = "failed";
        entry.timestamp = new Date().toISOString();
      }
      continue;
    }

    let live;
    try {
      live = await adapters.admin.getProductById(resolvedMeta.id);
    } catch (e) {
      const indeterminate = Boolean(e.indeterminate);
      const is4xx = Number(e.status) >= 400 && Number(e.status) < 500;
      results.push({
        merchant_sku: g.merchant_sku,
        apply_status: indeterminate ? "indeterminate" : "failed_fetch",
        status: e.status ?? null,
        error: scrubSecrets(String(e.message || e)),
      });
      if (entry) {
        entry.status = indeterminate ? "indeterminate" : "failed";
        entry.response_status = "fetch_error";
        entry.timestamp = new Date().toISOString();
      }
      if (indeterminate) acct.indeterminate += 1;
      if (indeterminate || is4xx) {
        stoppedEarly = true;
        stopReason = `STOPPED_AFTER_${indeterminate ? "INDETERMINATE" : "4XX"}:${g.merchant_sku}`;
      }
      continue;
    }

    if (!live || !assertMerchantId(live)) {
      results.push({ merchant_sku: g.merchant_sku, apply_status: "failed_merchant_mismatch" });
      if (entry) {
        entry.status = "failed";
        entry.timestamp = new Date().toISOString();
      }
      continue;
    }

    const frozen = matchFrozenAgainstProduct(live, g.fields);
    if (!frozen.ok) {
      results.push({
        merchant_sku: g.merchant_sku,
        apply_status: "failed_current_mismatch",
        mismatches: frozen.mismatches,
      });
      if (entry) {
        entry.status = "failed";
        entry.timestamp = new Date().toISOString();
      }
      continue;
    }

    let payload;
    try {
      payload = buildAdminUpdatePayload(live, g.fields, { perfumesCategoryId });
    } catch (e) {
      results.push({
        merchant_sku: g.merchant_sku,
        apply_status: "failed_payload_build",
        error: scrubSecrets(String(e.message || e)),
      });
      if (entry) {
        entry.status = "failed";
        entry.timestamp = new Date().toISOString();
      }
      continue;
    }

    // Pre-POST semantic collateral gate: compare the actual DB effect of `payload`
    // against the raw live product directly (never just basePayload↔nextPayload, which
    // can share the same coercions and mask a real semantic change). Any non-target
    // semantic difference STOPs this SKU before any POST is attempted.
    const collateral = assertNoPreWriteCollateral(live, payload, g.fields);
    if (!collateral.ok) {
      results.push({
        merchant_sku: g.merchant_sku,
        apply_status: "failed_pre_write_collateral_diff",
        error: `PRE_WRITE_COLLATERAL_DIFF:${collateral.collateral.map((c) => c.field).join(",")}`,
        collateral: collateral.collateral,
      });
      if (entry) {
        entry.status = "failed";
        entry.timestamp = new Date().toISOString();
      }
      continue;
    }

    acct.db_update_attempted += 1;
    let updateRes;
    try {
      updateRes = await adapters.admin.updateProduct(live.id, payload);
      acct.db_update_succeeded += 1;
      updates += 1;
    } catch (e) {
      const indeterminate = Boolean(e.indeterminate || e.code === "ETIMEDOUT" || e.code === "ECONNRESET");
      const is4xx = Number(e.status) >= 400 && Number(e.status) < 500;
      results.push({
        merchant_sku: g.merchant_sku,
        apply_status: indeterminate ? "indeterminate" : "failed_update",
        status: e.status ?? null,
        error: scrubSecrets(String(e.message || e)),
      });
      if (entry) {
        entry.status = indeterminate ? "indeterminate" : "failed";
        entry.response_status = indeterminate ? "timeout_or_unknown" : "update_error";
        entry.timestamp = new Date().toISOString();
      }
      if (indeterminate) acct.indeterminate += 1;
      if (indeterminate || is4xx) {
        stoppedEarly = true;
        stopReason = `STOPPED_AFTER_${indeterminate ? "INDETERMINATE" : "4XX"}:${g.merchant_sku}`;
      }
      continue;
    }

    // Reconcile via a fresh GET-by-id (never search); enrich category_slug explicitly.
    let post;
    try {
      post = await adapters.admin.getProductById(live.id);
    } catch (e) {
      results.push({
        merchant_sku: g.merchant_sku,
        apply_status: "indeterminate",
        error: scrubSecrets(`post_read_failed:${e.message || e}`),
      });
      if (entry) {
        entry.status = "indeterminate";
        entry.response_status = "post_read_failed";
        entry.timestamp = new Date().toISOString();
      }
      acct.indeterminate += 1;
      stoppedEarly = true;
      stopReason = `STOPPED_AFTER_INDETERMINATE:${g.merchant_sku}`;
      continue;
    }
    post = enrichProductWithCategorySlug(post, categoryById);

    const proposed = matchProposedAgainstProduct(post, g.fields, { category_id: perfumesCategoryId });
    if (!proposed.ok) {
      results.push({
        merchant_sku: g.merchant_sku,
        apply_status: "failed_post_verify",
        mismatches: proposed.mismatches,
      });
      if (entry) {
        entry.status = "failed";
        entry.postflight_state = proposed;
        entry.timestamp = new Date().toISOString();
      }
      continue;
    }

    const nontarget = assertNonTargetFieldsUnchanged(live, post, Object.keys(g.fields));
    if (!nontarget.ok) {
      results.push({
        merchant_sku: g.merchant_sku,
        apply_status: "failed_nontarget_field_changed",
        mismatches: nontarget.mismatches,
      });
      if (entry) {
        entry.status = "failed";
        entry.timestamp = new Date().toISOString();
      }
      continue;
    }

    acct.db_update_verified += 1;
    results.push({
      merchant_sku: g.merchant_sku,
      apply_status: "completed",
      fields: Object.keys(g.fields),
      api_ok: updateRes?.ok !== false,
    });
    if (entry) {
      entry.status = "completed";
      entry.requested_fields = Object.keys(g.fields);
      entry.response_status = "ok";
      entry.postflight_state = { proposed_ok: true };
      entry.timestamp = new Date().toISOString();
    }
  }

  // Final ok is a canonical journal-completion check, not a this-run-only tally: a
  // `skipped_completed` SKU from a prior run counts toward completion exactly the same
  // as one completed in this run, because `entry.status` is the durable source of truth.
  const completionSummary = summarizeJournalCompletion(journal, grouped);
  const completedAfterResume = completionSummary.completed;
  const fullyComplete =
    completionSummary.completed === EXPECTED_EXECUTION.affected_products &&
    completionSummary.pending === 0 &&
    completionSummary.failed === 0 &&
    completionSummary.indeterminate === 0 &&
    completionSummary.conflict === 0 &&
    completionSummary.fields_verified === EXPECTED_EXECUTION.field_changes &&
    completionSummary.images_verified === EXPECTED_EXECUTION.replacement_assets;

  return {
    ok: fullyComplete,
    updates,
    results,
    expected_updates: grouped.length,
    stopped_early: stoppedEarly,
    stop_reason: stoppedEarly ? stopReason : null,
    write_accounting: summarizeWriteAccounting(acct),
    completion_summary: completionSummary,
    metrics: {
      db_updates_this_run: updates,
      db_updates_total_verified: acct.db_update_verified,
      completed_before_resume: completedBeforeResume,
      completed_after_resume: completedAfterResume,
    },
  };
}

/**
 * Postflight — exact (never approximate) reconciliation:
 *  - All 30 affected SKUs must exactly match proposed values, with non-target fields
 *    unchanged from their frozen baseline.
 *  - All remaining unaffected SKUs (80, including the 4 HOLD SKUs and ARD-1191) must be
 *    byte-for-byte identical to their frozen baseline.
 *  - Category distribution must match exactly.
 */
export async function runPostflight({ resolved, adapters, journal }) {
  if (!adapters?.fetchLiveCatalog || !adapters?.storage?.verifyObject) {
    return { ok: false, judgment: "POSTFLIGHT_FAIL", errors: ["LIVE_INPUT_REQUIRED"] };
  }
  if (!journal?.entries?.length) {
    return { ok: false, judgment: "POSTFLIGHT_FAIL", errors: ["JOURNAL_MISSING"] };
  }
  if (!journal.frozen_baselines) {
    return { ok: false, judgment: "POSTFLIGHT_FAIL", errors: ["JOURNAL_MISSING_FROZEN_BASELINES"] };
  }

  let catalog;
  try {
    catalog = await adapters.fetchLiveCatalog();
  } catch (e) {
    return { ok: false, judgment: "POSTFLIGHT_FAIL", errors: [`FETCH_FAILED:${e.message || e}`] };
  }

  const products = catalog.products || [];
  const errors = [];
  const safe = assertSafeMerchantState(products, { status: catalog.merchant?.status });
  if (!safe.ok) errors.push(...safe.errors);

  const bySku = new Map(products.map((p) => [p.merchant_sku, p]));
  const grouped = groupUpdatesBySku(resolved.fieldRows);
  const affectedSkus = new Set(grouped.map((g) => g.merchant_sku));

  function exactBaselineMismatches(frozenBaseline, currentProduct) {
    const currentBaseline = snapshotProductBaseline(currentProduct);
    return BASELINE_FIELDS.filter(
      (f) => f !== "updated_at" && stableJson(frozenBaseline[f]) !== stableJson(currentBaseline[f]),
    );
  }

  // 30 affected SKUs: target fields must equal proposed; non-target fields must be unchanged.
  let proposedMatches = 0;
  let fieldVerified = 0;
  for (const g of grouped) {
    const p = bySku.get(g.merchant_sku);
    if (!p) {
      errors.push(`MISSING_SKU:${g.merchant_sku}`);
      continue;
    }
    // ARD-775 (and any other category_slug reassignment) must be verified against the
    // exact category_id resolved during first-execute preflight — slug alone is not
    // sufficient, since two categories could share a slug.
    const m = matchProposedAgainstProduct(p, g.fields, { category_id: journal.perfumes_category_id });
    if (m.ok) {
      proposedMatches += 1;
      fieldVerified += Object.keys(g.fields).length;
    } else {
      errors.push(`PROPOSED_MISMATCH:${g.merchant_sku}:${m.mismatches.map((x) => x.field).join(",")}`);
    }

    const frozenBaseline = journal.frozen_baselines[g.merchant_sku];
    if (!frozenBaseline) {
      errors.push(`MISSING_FROZEN_BASELINE:${g.merchant_sku}`);
      continue;
    }
    const nontarget = assertNonTargetFieldsUnchanged(frozenBaseline, p, Object.keys(g.fields));
    if (!nontarget.ok) {
      errors.push(`NONTARGET_FIELD_CHANGED:${g.merchant_sku}:${nontarget.mismatches.map((x) => x.field).join(",")}`);
    }
  }
  if (proposedMatches !== EXPECTED_EXECUTION.affected_products) {
    errors.push(`PROPOSED_MATCHES:${proposedMatches}/${EXPECTED_EXECUTION.affected_products}`);
  }
  if (fieldVerified !== EXPECTED_EXECUTION.field_changes) {
    errors.push(`FIELD_VERIFIED:${fieldVerified}/${EXPECTED_EXECUTION.field_changes}`);
  }

  // Unaffected products: exact baseline comparison (no approximation).
  let unaffectedChecked = 0;
  let unaffectedExactMatches = 0;
  for (const [sku, frozenBaseline] of Object.entries(journal.frozen_baselines)) {
    if (affectedSkus.has(sku)) continue;
    unaffectedChecked += 1;
    const p = bySku.get(sku);
    if (!p) {
      errors.push(`UNAFFECTED_MISSING_SKU:${sku}`);
      continue;
    }
    const mismatches = exactBaselineMismatches(frozenBaseline, p);
    if (mismatches.length === 0) unaffectedExactMatches += 1;
    else errors.push(`UNAFFECTED_BASELINE_MISMATCH:${sku}:${mismatches.join(",")}`);
  }
  const expectedUnaffected = EXPECTED_PRODUCT_COUNT - EXPECTED_EXECUTION.affected_products;
  if (unaffectedChecked !== expectedUnaffected) {
    errors.push(`UNAFFECTED_COUNT:${unaffectedChecked}/${expectedUnaffected}`);
  }

  // Explicit HOLD SKU checks (exact, no approximation).
  let holdUnchanged = 0;
  for (const sku of P1_HOLD_SKUS) {
    const frozenBaseline = journal.frozen_baselines[sku];
    const p = bySku.get(sku);
    if (!frozenBaseline || !p) {
      errors.push(`HOLD_MISSING:${sku}`);
      continue;
    }
    const mismatches = exactBaselineMismatches(frozenBaseline, p);
    if (mismatches.length === 0) holdUnchanged += 1;
    else errors.push(`HOLD_MUTATED:${sku}:${mismatches.join(",")}`);
  }
  if (holdUnchanged !== P1_HOLD_SKUS.length) {
    errors.push(`HOLD_UNCHANGED:${holdUnchanged}/${P1_HOLD_SKUS.length}`);
  }

  // Explicit ARD-1191 check (exact, no approximation).
  let ard1191Unchanged = false;
  for (const sku of HOLD_KNOWN) {
    const frozenBaseline = journal.frozen_baselines[sku];
    const p = bySku.get(sku);
    if (!frozenBaseline || !p) {
      errors.push(`ARD_1191_MISSING:${sku}`);
      continue;
    }
    const mismatches = exactBaselineMismatches(frozenBaseline, p);
    ard1191Unchanged = mismatches.length === 0;
    if (!ard1191Unchanged) errors.push(`ARD_1191_MUTATED:${sku}:${mismatches.join(",")}`);
  }

  // Storage: all 9 replacement assets exactly verified.
  let imagesOk = 0;
  for (const asset of resolved.assets) {
    const v = await adapters.storage.verifyObject(asset.storage_path, asset.sha256);
    if (v.ok) imagesOk += 1;
    else errors.push(`STORAGE_VERIFY_FAIL:${asset.merchant_sku}`);
  }
  if (imagesOk !== EXPECTED_EXECUTION.replacement_assets) {
    errors.push(`IMAGES_VERIFIED:${imagesOk}/${EXPECTED_EXECUTION.replacement_assets}`);
  }

  const objectCount = await adapters.storage.countObjects?.(TARGET_MERCHANT_ID);
  if (objectCount != null && objectCount !== 109) {
    errors.push(`OBJECT_COUNT:${objectCount}/109`);
  }

  // Category distribution — exact match, both directions.
  const dist = computeCategoryDistribution(products);
  for (const [k, n] of Object.entries(EXPECTED_CATEGORY_DISTRIBUTION)) {
    if ((dist[k] || 0) !== n) errors.push(`CATEGORY_DIST:${k}=${dist[k] || 0}_want_${n}`);
  }
  for (const k of Object.keys(dist)) {
    if (!(k in EXPECTED_CATEGORY_DISTRIBUTION)) errors.push(`CATEGORY_DIST_UNEXPECTED:${k}=${dist[k]}`);
  }

  const ok = errors.length === 0;
  return {
    ok,
    judgment: ok ? "POSTFLIGHT_PASS" : "POSTFLIGHT_FAIL",
    errors,
    proposed_matches: proposedMatches,
    field_verified: fieldVerified,
    images_verified: imagesOk,
    unaffected_checked: unaffectedChecked,
    unaffected_exact_matches: unaffectedExactMatches,
    hold_unchanged: holdUnchanged,
    ard_1191_unchanged: ard1191Unchanged,
    distribution: dist,
  };
}

export function loadResolvedFromDocs(docsDir, root) {
  const patch = loadCsv(path.join(docsDir, "06_PROPOSED_DB_PATCH.csv"));
  const imageManifest = loadCsv(path.join(docsDir, "03_P1_IMAGE_REPLACEMENT_MANIFEST.csv"));
  return resolveExecutionManifest({ patchRows: patch, root, imageManifestRows: imageManifest });
}

export {
  assertWriteAuthorization,
  assertProductionConnection,
  EXPECTED_MANIFEST_SHA,
  EXPECTED_PRODUCT_COUNT,
  EXPECTED_CATEGORY_DISTRIBUTION,
  PERFUMES_CATEGORY_SLUG,
  scrubSecrets,
  groupUpdatesBySku,
  createJournalSkeleton,
  TARGET_MERCHANT_ID,
  EXPECTED_BACKEND_API,
  EXPECTED_SUPABASE_HOST,
  BUCKET,
  REMEDIATION_PREFIX,
  toCsv,
  sha256File,
  P1_HOLD_SKUS,
  HOLD_KNOWN,
  EXPECTED_EXECUTION,
  QA_HEAD_SHA,
  BASELINE_FIELDS,
  buildExactSkuMap,
  requireExactSku,
  buildCategoryIndex,
  enrichCatalogProducts,
  enrichProductWithCategorySlug,
  resolveActivePerfumesLeaf,
  snapshotProductBaseline,
  computeFullCatalogBaselineSha,
  createEmptyWriteAccounting,
  summarizeWriteAccounting,
  assertOnlyAllowedPayloadDiffs,
  assertNonTargetFieldsUnchanged,
  assertMerchantId,
  assertNoPreWriteCollateral,
  summarizeJournalCompletion,
  getActualGitHead,
  SEGMENTATION_FIELDS,
  MERCHANDISING_FIELDS,
  computeCatalogSafetyCounts,
  computeCategoryDistribution,
};
