#!/usr/bin/env node
/**
 * Batch100 lifecycle validator (Phase A / Phase B post-upload Preview).
 *
 * Required:
 *   --phase=pre-upload
 *   --phase=post-upload-previewed
 *
 * Fail-closed if phase is missing or unknown. No network.
 */
import path from "path";
import { fileURLToPath } from "url";
import { parsePhaseArg, validateBatch100 } from "./lib/batch100-validator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DIR = path.join(ROOT, "docs/product-import/ard-al-khaleej/batch100");
const IMG_DIR = path.join(ROOT, ".tmp-product-import/ard-al-khaleej/batch100/images");

const parsed = parsePhaseArg(process.argv.slice(2));
if (!parsed.ok) {
  console.error(JSON.stringify({ ok: false, errors: [parsed.error] }, null, 2));
  process.exit(2);
}

const report = validateBatch100({
  phase: parsed.phase,
  docsDir: DIR,
  imgDir: IMG_DIR,
});

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
