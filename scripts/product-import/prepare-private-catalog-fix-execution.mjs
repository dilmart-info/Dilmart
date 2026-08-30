#!/usr/bin/env node
/**
 * Prepare resolved execution manifest + evidence templates (no production writes).
 * Modes: --preflight (alias) | default prepare
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadPatchAndManifest,
  writeCsv,
  createJournalSkeleton,
  assertSafeMerchantState,
  assertNoHoldOrForbiddenSkus,
  matchFrozenCurrentValues,
  groupUpdatesBySku,
  scrubSecrets,
  TARGET_MERCHANT_ID,
  EXPECTED_EXECUTION,
  versionedStoragePath,
} from "./lib/private-catalog-fix-execution.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/private-catalog-fix-plan");
const TMP = path.join(ROOT, ".tmp-product-import/ard-al-khaleej/private-catalog-fix-plan");
const PRODUCTS_JSON =
  process.env.FIX_EXEC_PRODUCTS_JSON ||
  path.join(ROOT, ".tmp-product-import/ard-al-khaleej/private-catalog-qa/products.json");

function writeTemplates() {
  // Templates only — no invented execution results. Explicit NOT_EXECUTED markers.
  fs.writeFileSync(
    path.join(DOCS, "13_STORAGE_UPLOAD_RESULT.csv"),
    [
      "merchant_sku,storage_path,local_sha256,remote_sha256,sha_match,public_url,public_get_status,mime,upload_status,notes,execution_status,production_storage_writes,production_db_writes",
      ",,,,,,,,,,NOT_EXECUTED,NO,NO",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(DOCS, "14_DB_APPLY_RESULT.csv"),
    [
      "merchant_sku,fields,pre_match_ok,response_status,apply_status,notes,execution_status,production_storage_writes,production_db_writes",
      ",,,,,,NOT_EXECUTED,NO,NO",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(DOCS, "15_POSTFLIGHT_110.csv"),
    [
      "merchant_sku,cohort,image_url,name,brand,sizes,category_slug,slug,short_description,stock,is_active,is_published,visibility_status,match_proposed,execution_status,production_storage_writes,production_db_writes",
      ",,,,,,,,,,,,,,NOT_EXECUTED,NO,NO",
      "",
    ].join("\n"),
  );
}

function main() {
  fs.mkdirSync(TMP, { recursive: true });
  const resolved = loadPatchAndManifest(DOCS, ROOT);
  if (!resolved.ok) {
    console.error(JSON.stringify({ ok: false, errors: resolved.errors }, null, 2));
    process.exit(1);
  }

  writeCsv(
    path.join(DOCS, "11_EXECUTION_RESOLVED_MANIFEST.csv"),
    [
      "merchant_sku",
      "field",
      "current_value",
      "proposed_value",
      "severity",
      "issue_type",
      "local_asset_path",
      "storage_path",
      "approved_sha256",
      "public_image_url",
      "old_image_url",
      "decision_status",
      "production_apply_status",
      "expected_safe_state",
    ],
    resolved.fieldRows,
  );
  // Rewrite with exact bytes used for SHA
  fs.writeFileSync(path.join(DOCS, "11_EXECUTION_RESOLVED_MANIFEST.csv"), resolved.csvBody, "utf8");

  const holdCheck = assertNoHoldOrForbiddenSkus(resolved.skus);
  const preflight = {
    prepared_at: new Date().toISOString(),
    merchant_id: TARGET_MERCHANT_ID,
    mode: "prepare/preflight",
    production_writes: false,
    production_storage_writes: false,
    counts: resolved.counts,
    expected: EXPECTED_EXECUTION,
    field_breakdown: resolved.fieldCounts,
    hold_excluded: ["ARD-4300", "ARD-4750", "ARD-4751", "ARD-4807"],
    ard_1191_excluded: true,
    prices_excluded: true,
    replacement_assets: resolved.assets,
    versioned_paths: resolved.assets.map((a) => a.storage_path),
    resolved_manifest_sha256: resolved.manifestSha,
    hold_sku_check_ok: holdCheck.ok,
    hold_sku_errors: holdCheck.errors,
    live_product_check: null,
    current_value_match: null,
    target_paths_absent: null,
    judgment: "EXECUTION_PACKAGE_READY",
  };

  if (fs.existsSync(PRODUCTS_JSON)) {
    const products = JSON.parse(fs.readFileSync(PRODUCTS_JSON, "utf8"));
    const list = Array.isArray(products) ? products : products.products || [];
    const merchantMeta = Array.isArray(products) ? { status: "draft" } : { status: products.merchant_status || "draft" };
    const safe = assertSafeMerchantState(list, merchantMeta);
    preflight.live_product_check = {
      source: path.relative(ROOT, PRODUCTS_JSON).replace(/\\/g, "/"),
      count: list.length,
      ok: safe.ok,
      errors: safe.errors,
    };

    const bySku = new Map(list.map((p) => [p.merchant_sku, p]));
    const grouped = groupUpdatesBySku(resolved.fieldRows);
    const mismatches = [];
    for (const g of grouped) {
      const p = bySku.get(g.merchant_sku);
      if (!p) {
        mismatches.push({ merchant_sku: g.merchant_sku, error: "SKU_NOT_FOUND" });
        continue;
      }
      const m = matchFrozenCurrentValues(p, g.fields);
      if (!m.ok) mismatches.push({ merchant_sku: g.merchant_sku, mismatches: m.mismatches });
    }
    preflight.current_value_match = {
      ok: mismatches.length === 0,
      mismatch_count: mismatches.length,
      samples: mismatches.slice(0, 5),
    };
    if (!safe.ok || mismatches.length) {
      preflight.judgment = "NO-GO";
      preflight.blocker = !safe.ok ? "SAFE_STATE" : "CURRENT_VALUE_MISMATCH";
    }
  } else {
    preflight.live_product_check = {
      ok: false,
      error: "PRODUCTS_JSON_MISSING",
      hint: PRODUCTS_JSON,
    };
    // Package can still be READY as tooling; live match deferred to dry-run with export
    preflight.notes = ["Live current-value match deferred until products.json available for dry-run"];
  }

  // Target paths documented; live existence check deferred to execute/dry-run with Storage HEAD
  preflight.target_paths_absent = {
    policy: "fail if any versioned path already exists before upload",
    paths: resolved.assets.map((a) => a.storage_path),
    checked_live: false,
  };

  fs.writeFileSync(path.join(DOCS, "12_EXECUTION_PREFLIGHT.json"), JSON.stringify(preflight, null, 2));
  writeTemplates();

  const journal = createJournalSkeleton(resolved.skus);
  fs.writeFileSync(path.join(TMP, "execution-journal.json"), JSON.stringify(journal, null, 2));

  const report = `# Fix Execution Final Report

execution_status = NOT_EXECUTED  
production_storage_writes = NO  
production_db_writes = NO  

## Status

**EXECUTION_PACKAGE_READY** (prep / runtime package - not production execution)

This file does **not** record production uploads or DB applies.

## Resolved scope

| Metric | Value |
|---|---|
| Affected products | ${resolved.counts.affected_products} |
| Field changes | ${resolved.counts.field_changes} |
| Replacement images | ${resolved.counts.replacement_images} |
| Resolved manifest SHA-256 | \`${resolved.manifestSha}\` |
| HOLD excluded | ARD-4300, ARD-4750, ARD-4751, ARD-4807 |
| ARD-1191 | excluded |
| Production Storage writes | NO |
| Production DB writes | NO |

## Authorization gate

Execute/resume require env (never bare \`--auth\`):

- \`FIX_EXEC_AUTHORIZATION=PRIVATE_CATALOG_QA_FIX_EXECUTION_APPROVED\`
- \`FIX_EXEC_ALLOW_WRITES=1\`

## Evidence templates

- \`11_EXECUTION_RESOLVED_MANIFEST.csv\` — populated (proposal resolve)
- \`12_EXECUTION_PREFLIGHT.json\` — populated (prep/preflight)
- \`13_STORAGE_UPLOAD_RESULT.csv\` — NOT_EXECUTED template
- \`14_DB_APPLY_RESULT.csv\` — NOT_EXECUTED template
- \`15_POSTFLIGHT_110.csv\` — NOT_EXECUTED template
- \`17_RUNTIME_IMPLEMENTATION_TEST_REPORT.md\` — runtime implementation notes

## Hard stop

Do not upload, update, merge, activate, publish, or stock until execution authorization.
`;
  fs.writeFileSync(path.join(DOCS, "16_FIX_EXECUTION_FINAL_REPORT.md"), report, "utf8");

  console.log(
    scrubSecrets(
      JSON.stringify(
        {
          ok: true,
          judgment: preflight.judgment,
          resolved_manifest_sha256: resolved.manifestSha,
          counts: resolved.counts,
          field_breakdown: resolved.fieldCounts,
          production_writes: false,
        },
        null,
        2,
      ),
    ),
  );
}

try {
  main();
} catch (e) {
  console.error(scrubSecrets(String(e?.stack || e)));
  process.exit(1);
}
