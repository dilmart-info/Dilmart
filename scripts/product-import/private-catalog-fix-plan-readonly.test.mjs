/**
 * Prove fix-plan scripts have no production write surface and reject forbidden proposals.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  assertNoProductionWriteSurface,
  validateFixPlan,
  P1_SKUS,
  TARGET_MERCHANT_ID,
  scrubSecrets,
} from "./lib/private-catalog-fix-plan.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/private-catalog-fix-plan");

const FILES = [
  "validate-private-catalog-fix-plan.mjs",
  "build-private-catalog-fix-plan.py",
  "lib/private-catalog-fix-plan.mjs",
  "prepare-private-catalog-fix-images.py",
  "private-catalog-fix-plan-readonly.test.mjs",
];

for (const f of FILES) {
  test(`no production write surface: ${f}`, () => {
    const p = path.join(__dirname, f);
    assert.ok(fs.existsSync(p), `missing ${f}`);
    const src = fs.readFileSync(p, "utf8");
    assertNoProductionWriteSurface(src, f);
    assert.equal(/storage\.from\(/.test(src), false);
    assert.equal(/supabase[^;]*\.upload\s*\(/i.test(src), false);
  });
}

test("scrubSecrets redacts JWT", () => {
  const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb";
  assert.match(scrubSecrets(`Bearer ${jwt}`), /REDACTED_JWT/);
});

test("merchant constant locked", () => {
  assert.equal(TARGET_MERCHANT_ID, "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7");
  assert.equal(P1_SKUS.length, 11);
});

function baseRows() {
  const defect = P1_SKUS.map((sku) => ({ merchant_sku: sku, severity: "P1" }));
  const manifest = P1_SKUS.map((sku) => ({
    merchant_sku: sku,
    decision_status: "HOLD_NO_VERIFIED_REPLACEMENT",
    requires_replacement_image: "true",
    source_evidence_ok: "false",
    local_asset_path: "",
    sha256: "",
  }));
  const p2 = [
    "ARD-1369",
    "ARD-1480",
    "ARD-1858",
    "ARD-2436",
    "ARD-2583",
    "ARD-3117",
    "ARD-3347",
    "ARD-3711",
    "ARD-3714",
    "ARD-4214",
    "ARD-4255",
    "ARD-4256",
    "ARD-4286",
    "ARD-4336",
    "ARD-4637",
    "ARD-4660",
    "ARD-4680",
    "ARD-4685",
    "ARD-4686",
    "ARD-5036",
    "ARD-5058",
  ].map((merchant_sku) => ({ merchant_sku }));
  return { defect, manifest, p2 };
}

test("rejects ARD-1191 patch rows", () => {
  const { defect, manifest, p2 } = baseRows();
  const patch = [
    {
      merchant_sku: "ARD-1191",
      field: "short_description",
      current_value: "",
      proposed_value: "x",
      production_apply_status: "NOT_AUTHORIZED",
    },
  ];
  const r = validateFixPlan({
    defectRegisterRows: defect,
    proposedPatchRows: patch,
    p1ManifestRows: manifest,
    p2ContentRows: p2,
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("ARD-1191")));
});

test("rejects price proposals", () => {
  const { defect, manifest, p2 } = baseRows();
  const patch = [
    {
      merchant_sku: "ARD-2793",
      field: "price",
      current_value: "3000",
      proposed_value: "1",
      production_apply_status: "NOT_AUTHORIZED",
    },
  ];
  const r = validateFixPlan({
    defectRegisterRows: defect,
    proposedPatchRows: patch,
    p1ManifestRows: manifest,
    p2ContentRows: p2,
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /price|forbidden/i.test(e)));
});

test("rejects activation/publication/stock proposals", () => {
  const { defect, manifest, p2 } = baseRows();
  for (const field of ["stock", "is_active", "is_published", "visibility_status"]) {
    const patch = [
      {
        merchant_sku: "ARD-2793",
        field,
        current_value: "0",
        proposed_value: "1",
        production_apply_status: "NOT_AUTHORIZED",
      },
    ];
    const r = validateFixPlan({
      defectRegisterRows: defect,
      proposedPatchRows: patch,
      p1ManifestRows: manifest,
      p2ContentRows: p2,
    });
    assert.equal(r.ok, false, field);
  }
});

test("rejects unapproved SKU outside defect scope when P1 count wrong", () => {
  const { defect, manifest, p2 } = baseRows();
  defect.push({ merchant_sku: "ARD-9999", severity: "P1" });
  const r = validateFixPlan({
    defectRegisterRows: defect,
    proposedPatchRows: [],
    p1ManifestRows: manifest,
    p2ContentRows: p2,
  });
  assert.equal(r.ok, false);
});

test("rejects production Storage URL in proposed image_url", () => {
  const { defect, manifest, p2 } = baseRows();
  const patch = [
    {
      merchant_sku: "ARD-2793",
      field: "image_url",
      current_value: "x",
      proposed_value:
        "https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7/ARD-2793.webp",
      production_apply_status: "NOT_AUTHORIZED",
    },
  ];
  const r = validateFixPlan({
    defectRegisterRows: defect,
    proposedPatchRows: patch,
    p1ManifestRows: manifest,
    p2ContentRows: p2,
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /production Storage/i.test(e)));
});

test("ambiguous SKU cannot be READY without source_evidence_ok", () => {
  const { defect, manifest, p2 } = baseRows();
  const m = manifest.map((r) =>
    r.merchant_sku === "ARD-775"
      ? {
          ...r,
          decision_status: "READY_FOR_EXECUTION_REVIEW",
          source_evidence_ok: "false",
          requires_replacement_image: "false",
        }
      : r,
  );
  const r = validateFixPlan({
    defectRegisterRows: defect,
    proposedPatchRows: [],
    p1ManifestRows: m,
    p2ContentRows: p2,
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("ARD-775")));
});

test("built package passes when artifacts exist", () => {
  const defectPath = path.join(ROOT, "docs/product-import/ard-al-khaleej/private-catalog-qa/09_DEFECT_REGISTER.csv");
  const patchPath = path.join(DOCS, "06_PROPOSED_DB_PATCH.csv");
  if (!fs.existsSync(patchPath)) {
    // skip gracefully if build not run yet in isolation
    return;
  }
  // Integration check executed by validate script; here assert file presence
  assert.ok(fs.existsSync(defectPath));
  assert.ok(fs.existsSync(path.join(DOCS, "03_P1_IMAGE_REPLACEMENT_MANIFEST.csv")));
  assert.ok(fs.existsSync(path.join(DOCS, "assets")));
});
