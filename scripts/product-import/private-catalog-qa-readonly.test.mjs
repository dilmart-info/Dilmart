/**
 * Prove private-catalog QA scripts are read-only (no production write surface).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { scrubSecrets, TARGET_MERCHANT_ID, EXPECTED_PRODUCT_COUNT } from "./lib/private-catalog-qa.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const files = [
  "export-ard-al-khaleej-private-catalog-qa.mjs",
  "validate-ard-al-khaleej-private-catalog-qa.mjs",
  "check-private-catalog-images.mjs",
  "lib/private-catalog-qa.mjs",
  "generate-private-catalog-contact-sheets.py",
];

const FORBIDDEN = [
  /\.insert\s*\(/,
  /\.from\([^)]*\)\s*\.\s*update\s*\(/,
  /\.delete\s*\(/,
  /\.upsert\s*\(/,
  /\.rpc\s*\(/,
  /storage\.from\(/,
  /supabase[^;]*\.upload\s*\(/i,
  /apply_migration/,
  /CREATE\s+TABLE/i,
  /UPDATE\s+public\.products/i,
  /DELETE\s+FROM\s+public\.products/i,
  /INSERT\s+INTO\s+public\.products/i,
];

for (const f of files) {
  test(`read-only source guard: ${f}`, () => {
    const p = path.join(__dirname, f);
    assert.ok(fs.existsSync(p), `missing ${f}`);
    const src = fs.readFileSync(p, "utf8");
    for (const re of FORBIDDEN) {
      assert.equal(re.test(src), false, `${f} matched forbidden ${re}`);
    }
  });
}

test("scrubSecrets redacts JWT-like tokens", () => {
  const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb";
  assert.match(scrubSecrets(`Bearer ${jwt}`), /REDACTED_JWT/);
});

test("merchant/count constants are locked", () => {
  assert.equal(TARGET_MERCHANT_ID, "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7");
  assert.equal(EXPECTED_PRODUCT_COUNT, 110);
});
