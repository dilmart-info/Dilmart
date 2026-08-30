#!/usr/bin/env node
import path from "path";
import { fileURLToPath } from "url";
import { loadProductsJson, runValidation, scrubSecrets } from "./lib/private-catalog-qa.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TMP = path.join(ROOT, ".tmp-product-import/ard-al-khaleej/private-catalog-qa");

try {
  const products = loadProductsJson(path.join(TMP, "products.json"));
  const summary = runValidation(products);
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok_guards) process.exit(1);
} catch (e) {
  console.error(scrubSecrets(String(e?.stack || e)));
  process.exit(1);
}
