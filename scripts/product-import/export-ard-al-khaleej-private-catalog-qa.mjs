#!/usr/bin/env node
/**
 * Read-only export entry for private catalog QA.
 * Expects products.json produced from production SELECT (MCP/SQL) — never writes to DB.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadProductsJson,
  TARGET_MERCHANT_ID,
  EXPECTED_PRODUCT_COUNT,
  scrubSecrets,
} from "./lib/private-catalog-qa.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TMP = path.join(ROOT, ".tmp-product-import/ard-al-khaleej/private-catalog-qa");
const DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/private-catalog-qa");

const productsPath = process.argv[2] || path.join(TMP, "products.json");
if (!fs.existsSync(productsPath)) {
  console.error(
    scrubSecrets(
      JSON.stringify({
        error: "PRODUCTS_JSON_REQUIRED",
        hint: "Provide read-only SQL export at .tmp-product-import/.../products.json",
        path: productsPath,
      }),
    ),
  );
  process.exit(2);
}

const products = loadProductsJson(productsPath);
for (const p of products) {
  if (p.merchant_id && p.merchant_id !== TARGET_MERCHANT_ID) {
    console.error(JSON.stringify({ error: "WRONG_MERCHANT", merchant_id: p.merchant_id }));
    process.exit(2);
  }
}
if (products.length !== EXPECTED_PRODUCT_COUNT) {
  console.error(JSON.stringify({ error: "COUNT_MISMATCH", n: products.length }));
  process.exit(2);
}

fs.mkdirSync(DOCS, { recursive: true });
fs.copyFileSync(productsPath, path.join(TMP, "products.json"));
console.log(
  JSON.stringify({
    ok: true,
    mode: "read_only_export_validated",
    merchant_id: TARGET_MERCHANT_ID,
    count: products.length,
    out: path.join(TMP, "products.json"),
  }),
);
