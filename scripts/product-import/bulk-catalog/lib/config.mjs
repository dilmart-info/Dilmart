/**
 * Config loader for bulk-catalog pipeline.
 */
import fs from "fs";
import path from "path";
import { DEFAULT_PRODUCT_STATE, TARGET_MERCHANT_ID, TARGET_MERCHANT_SLUG } from "./constants.mjs";

export function loadConfig(configPath, { root = process.cwd() } = {}) {
  const abs = path.isAbsolute(configPath) ? configPath : path.join(root, configPath);
  if (!fs.existsSync(abs)) throw new Error(`CONFIG_NOT_FOUND:${abs}`);
  const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  const cfg = {
    merchant_id: raw.merchant_id || TARGET_MERCHANT_ID,
    merchant_slug: raw.merchant_slug || TARGET_MERCHANT_SLUG,
    source_file: resolvePath(raw.source_file, root),
    source_workbook: raw.source_workbook ? resolvePath(raw.source_workbook, root) : null,
    image_directories: (raw.image_directories || []).map((p) => resolvePath(p, root)),
    batch_size: Number(raw.batch_size || 200),
    batch_selection_rule: raw.batch_selection_rule || "stable_source_order_valid_complete_image",
    default_product_state: { ...DEFAULT_PRODUCT_STATE, ...(raw.default_product_state || {}) },
    category_mapping_file: resolvePath(raw.category_mapping_file, root),
    existing_catalog_snapshot: raw.existing_catalog_snapshot
      ? resolvePath(raw.existing_catalog_snapshot, root)
      : null,
    docs_dir: resolvePath(raw.docs_dir || "docs/product-import/bulk2200", root),
    tmp_dir: resolvePath(raw.tmp_dir || ".tmp-product-import/ard-al-khaleej/bulk2200", root),
    batch_id: raw.batch_id || null,
    allow_metadata_staging: Boolean(raw.allow_metadata_staging),
    config_path: abs,
  };
  if (!cfg.source_file) throw new Error("CONFIG_MISSING_SOURCE_FILE");
  if (!cfg.category_mapping_file) throw new Error("CONFIG_MISSING_CATEGORY_MAPPING");
  if (!Number.isFinite(cfg.batch_size) || cfg.batch_size < 1) throw new Error("CONFIG_INVALID_BATCH_SIZE");
  assertSafeDefaults(cfg.default_product_state);
  return cfg;
}

function resolvePath(p, root) {
  if (p == null || p === "") return null;
  return path.isAbsolute(p) ? p : path.join(root, p);
}

export function assertSafeDefaults(state) {
  if (state.visibility_status !== "private") throw new Error("UNSAFE_DEFAULT:visibility_status_must_be_private");
  if (state.is_active !== false) throw new Error("UNSAFE_DEFAULT:is_active_must_be_false");
  if (state.is_published !== false) throw new Error("UNSAFE_DEFAULT:is_published_must_be_false");
  if (Number(state.stock) !== 0) throw new Error("UNSAFE_DEFAULT:stock_must_be_zero");
}
