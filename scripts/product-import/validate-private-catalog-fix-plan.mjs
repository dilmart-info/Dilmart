#!/usr/bin/env node
/**
 * Fail-closed validator for private-catalog FIX PLAN proposals.
 * Proposal-only — no production writes.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadCsv,
  validateFixPlan,
  scrubSecrets,
  assertNoProductionWriteSurface,
  P1_SKUS,
} from "./lib/private-catalog-fix-plan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/private-catalog-fix-plan");
const QA_DEFECT = path.join(ROOT, "docs/product-import/ard-al-khaleej/private-catalog-qa/09_DEFECT_REGISTER.csv");

try {
  const scripts = [
    "validate-private-catalog-fix-plan.mjs",
    "build-private-catalog-fix-plan.py",
    "lib/private-catalog-fix-plan.mjs",
    "private-catalog-fix-plan-readonly.test.mjs",
  ];
  for (const f of scripts) {
    const p = path.join(path.dirname(fileURLToPath(import.meta.url)), f);
    if (fs.existsSync(p)) assertNoProductionWriteSurface(fs.readFileSync(p, "utf8"), f);
  }

  const defect = loadCsv(QA_DEFECT);
  const patch = loadCsv(path.join(DOCS, "06_PROPOSED_DB_PATCH.csv"));
  const manifest = loadCsv(path.join(DOCS, "03_P1_IMAGE_REPLACEMENT_MANIFEST.csv"));
  const p2 = loadCsv(path.join(DOCS, "05_P2_CONTENT_PATCH_PROPOSAL.csv"));

  // Resolve relative asset paths
  for (const row of manifest) {
    if (row.local_asset_path && !path.isAbsolute(row.local_asset_path)) {
      row.local_asset_path = path.join(ROOT, row.local_asset_path);
    }
  }

  const summary = validateFixPlan({
    defectRegisterRows: defect,
    proposedPatchRows: patch,
    p1ManifestRows: manifest.filter((r) => P1_SKUS.includes(r.merchant_sku)),
    p2ContentRows: p2,
    assetDir: path.join(DOCS, "assets"),
  });

  const outPath = path.join(DOCS, "07_FIX_PLAN_VALIDATOR_OUTPUT.json");
  const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};
  const merged = {
    ...prev,
    validated_at: new Date().toISOString(),
    validator_ok: summary.ok,
    judgment: summary.judgment,
    errors: summary.errors,
    notes: [...(prev.notes || []), ...summary.notes],
    counts: summary.counts,
  };
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
  console.log(JSON.stringify(merged, null, 2));
  if (!summary.ok) process.exit(1);
} catch (e) {
  console.error(scrubSecrets(String(e?.stack || e)));
  process.exit(1);
}
