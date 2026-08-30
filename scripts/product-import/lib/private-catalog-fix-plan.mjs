/**
 * Fail-closed helpers for Ard Al Khaleej private-catalog FIX PLAN (proposal-only).
 * No production write surface.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

export const TARGET_MERCHANT_ID = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
export const QA_MERGE_SHA = "eec32d0cc7400e90f68af82e5e87f544c6208f3b";
export const QA_HEAD_SHA = "2852b73ce2bcabdab3e451f2d7601efe48312b7d";

export const P1_SKUS = Object.freeze([
  "ARD-2793",
  "ARD-2797",
  "ARD-4300",
  "ARD-4564",
  "ARD-4750",
  "ARD-4751",
  "ARD-4752",
  "ARD-4807",
  "ARD-4792",
  "ARD-775",
  "ARD-823",
]);

export const P2_CONTENT_SKUS = Object.freeze([
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
]);

export const P2_IMAGE_SKUS = Object.freeze(["ARD-2932"]);
export const HOLD_KNOWN = Object.freeze(["ARD-1191"]);
export const SIZE_CONFIRM_SKU = "ARD-2511";

export const ALLOWED_DECISION_STATES = Object.freeze([
  "READY_FOR_EXECUTION_REVIEW",
  "HOLD_NO_VERIFIED_REPLACEMENT",
  "HOLD_IDENTITY_UNRESOLVED",
  "HOLD_SIZE_UNRESOLVED",
  "REJECTED_PROPOSAL",
]);

export const FORBIDDEN_FIELDS = Object.freeze([
  "merchant_id",
  "merchant_sku",
  "stock",
  "is_active",
  "is_published",
  "visibility_status",
  "discount_price",
  "price",
]);

export const ALLOWED_PATCH_FIELDS = Object.freeze([
  "image_url",
  "name",
  "brand",
  "sizes",
  "category_id",
  "category_slug",
  "short_description",
  "description",
  "slug",
]);

/** slug proposals are allowed only for this SKU */
export const SLUG_ALLOWED_SKU = "ARD-775";

export const P1_HOLD_SKUS = Object.freeze(["ARD-4300", "ARD-4750", "ARD-4751", "ARD-4807"]);

export const EXPECTED_EXECUTION = Object.freeze({
  replacement_assets: 9,
  affected_products: 30,
  field_changes: 38,
  field_breakdown: Object.freeze({
    image_url: 9,
    short_description: 22,
    name: 2,
    brand: 1,
    sizes: 2,
    category_slug: 1,
    slug: 1,
  }),
});

export function scrubSecrets(text) {
  return String(text || "")
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "REDACTED_JWT")
    .replace(/sb_secret_[A-Za-z0-9]+/g, "REDACTED_SECRET")
    .replace(/service_role[=:\s]+[A-Za-z0-9._-]+/gi, "REDACTED_SERVICE_ROLE");
}

export function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = "";
  let row = [];
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    if (row.length === 1 && row[0] === "" && rows.length === 0) return;
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (c === "\n") {
      pushField();
      pushRow();
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length || row.length) {
    pushField();
    pushRow();
  }
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).filter((r) => r.some((x) => String(x || "").trim())).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? "";
    });
    return obj;
  });
}

export function loadCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return parseCsv(text);
}

export function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex").toUpperCase();
}

export function assertNoProductionWriteSurface(sourceText, label) {
  // Patterns built at runtime so this file itself does not self-match.
  const FORBIDDEN = [
    String.raw`\.from\([^)]*\)\s*\.\s*insert\s*\(`,
    String.raw`\.from\([^)]*\)\s*\.\s*update\s*\(`,
    String.raw`\.from\([^)]*\)\s*\.\s*delete\s*\(`,
    String.raw`\.from\([^)]*\)\s*\.\s*upsert\s*\(`,
    String.raw`\.rpc\s*\(`,
    String.raw`storage\.from\(`,
    String.raw`supabase[^;]*\.upload\s*\(`,
    ["apply", "_migration"].join(""),
    String.raw`CREATE\s+TABLE`,
    String.raw`UPDATE\s+public\.products`,
    String.raw`DELETE\s+FROM\s+public\.products`,
    String.raw`INSERT\s+INTO\s+public\.products`,
  ].map((p) => new RegExp(p, p.startsWith("CREATE") || p.includes("UPDATE") || p.includes("DELETE") || p.includes("INSERT") || p.includes("upload") ? "i" : undefined));
  for (const re of FORBIDDEN) {
    if (re.test(sourceText)) {
      throw new Error(`${label} matched forbidden write surface ${re}`);
    }
  }
}

/**
 * Validate fix-plan proposal artifacts. Fail-closed.
 */
export function validateFixPlan({
  defectRegisterRows,
  proposedPatchRows,
  p1ManifestRows,
  p2ContentRows,
  assetDir,
}) {
  const errors = [];
  const notes = [];

  const defectP1 = defectRegisterRows.filter((r) => r.severity === "P1").map((r) => r.merchant_sku);
  const defectP1Set = new Set(defectP1);
  if (defectP1.length !== 11) errors.push(`P1 count in defect register=${defectP1.length}, expected 11`);
  for (const sku of P1_SKUS) {
    if (!defectP1Set.has(sku)) errors.push(`Frozen P1 ${sku} missing from defect register`);
  }
  for (const sku of defectP1) {
    if (!P1_SKUS.includes(sku)) errors.push(`Unexpected P1 ${sku} not in frozen scope`);
  }

  const ard1191 = proposedPatchRows.filter((r) => r.merchant_sku === "ARD-1191");
  if (ard1191.length) errors.push(`ARD-1191 must remain unchanged; found ${ard1191.length} patch rows`);

  for (const row of proposedPatchRows) {
    if (row.production_apply_status !== "NOT_AUTHORIZED") {
      errors.push(`${row.merchant_sku}/${row.field} production_apply_status=${row.production_apply_status}`);
    }
    if (FORBIDDEN_FIELDS.includes(row.field)) {
      errors.push(`${row.merchant_sku} forbidden field ${row.field}`);
    }
    if (!ALLOWED_PATCH_FIELDS.includes(row.field)) {
      errors.push(`${row.merchant_sku} field not allowed: ${row.field}`);
    }
    if (row.field === "slug" && row.merchant_sku !== SLUG_ALLOWED_SKU) {
      errors.push(`${row.merchant_sku} slug change forbidden (only ${SLUG_ALLOWED_SKU} allowed)`);
    }
    if (P1_HOLD_SKUS.includes(row.merchant_sku)) {
      errors.push(`${row.merchant_sku} is P1 HOLD — no proposals allowed`);
    }
    if (/ztplxqlthuqkuktbznbo\.supabase\.co\/storage/i.test(String(row.proposed_value || ""))) {
      errors.push(`${row.merchant_sku} proposed_value must not set production Storage URL`);
    }
    if (String(row.proposed_value || "").includes(TARGET_MERCHANT_ID) && row.field === "image_url") {
      // local refs may mention merchant id in future path templates — allow only PENDING_LOCAL
      if (!String(row.proposed_value || "").startsWith("local:")) {
        errors.push(`${row.merchant_sku} image_url must remain local: proposal`);
      }
    }
  }

  const fieldCounts = {};
  for (const row of proposedPatchRows) {
    fieldCounts[row.field] = (fieldCounts[row.field] || 0) + 1;
  }
  if (proposedPatchRows.length !== EXPECTED_EXECUTION.field_changes) {
    errors.push(
      `field_changes=${proposedPatchRows.length} expected ${EXPECTED_EXECUTION.field_changes}`,
    );
  }
  for (const [field, n] of Object.entries(EXPECTED_EXECUTION.field_breakdown)) {
    if ((fieldCounts[field] || 0) !== n) {
      errors.push(`field_breakdown ${field}=${fieldCounts[field] || 0} expected ${n}`);
    }
  }
  const affected = new Set(proposedPatchRows.map((r) => r.merchant_sku));
  if (affected.size !== EXPECTED_EXECUTION.affected_products) {
    errors.push(`affected_products=${affected.size} expected ${EXPECTED_EXECUTION.affected_products}`);
  }

  const p1BySku = Object.fromEntries(p1ManifestRows.map((r) => [r.merchant_sku, r]));
  for (const sku of P1_SKUS) {
    const row = p1BySku[sku];
    if (!row) {
      errors.push(`P1 manifest missing ${sku}`);
      continue;
    }
    if (!ALLOWED_DECISION_STATES.includes(row.decision_status)) {
      errors.push(`${sku} invalid decision_status=${row.decision_status}`);
    }
    if (row.decision_status === "READY_FOR_EXECUTION_REVIEW") {
      if (!row.local_asset_path || !fs.existsSync(row.local_asset_path)) {
        // allow relative from repo
        const rel = path.resolve(process.cwd(), row.local_asset_path || "");
        if (!fs.existsSync(rel) && !fs.existsSync(row.local_asset_path)) {
          errors.push(`${sku} READY but asset missing: ${row.local_asset_path}`);
        }
      }
      if (!row.sha256 || !/^[0-9A-F]{64}$/i.test(row.sha256)) {
        // size-only READY may not need new image (ARD-823/2511 may reuse)
        if (row.requires_replacement_image === "true") {
          errors.push(`${sku} READY requires sha256`);
        }
      }
    }
    if (
      ["ARD-775", "ARD-823", "ARD-2511"].includes(sku) &&
      row.decision_status === "READY_FOR_EXECUTION_REVIEW" &&
      row.source_evidence_ok !== "true"
    ) {
      errors.push(`${sku} ambiguous SKU READY without source_evidence_ok=true`);
    }
  }

  const p2Skus = new Set(p2ContentRows.map((r) => r.merchant_sku));
  for (const sku of P2_CONTENT_SKUS) {
    if (!p2Skus.has(sku)) errors.push(`P2 content missing ${sku}`);
  }

  // Asset uniqueness among prepared files
  if (assetDir && fs.existsSync(assetDir)) {
    const files = fs.readdirSync(assetDir).filter((f) => f.endsWith(".webp"));
    const bySha = new Map();
    for (const f of files) {
      const full = path.join(assetDir, f);
      const sha = sha256File(full);
      if (!bySha.has(sha)) bySha.set(sha, []);
      bySha.get(sha).push(f);
    }
    for (const [sha, list] of bySha) {
      if (list.length > 1) errors.push(`Exact duplicate replacement SHA ${sha}: ${list.join(",")}`);
    }
    notes.push(`replacement_assets=${files.length}`);
    if (files.length !== EXPECTED_EXECUTION.replacement_assets) {
      errors.push(`replacement_assets=${files.length} expected ${EXPECTED_EXECUTION.replacement_assets}`);
    }
  }

  const ready = p1ManifestRows.filter((r) => r.decision_status === "READY_FOR_EXECUTION_REVIEW").length;
  const holds = p1ManifestRows.filter((r) => String(r.decision_status || "").startsWith("HOLD_")).length;
  let judgment = "FIX_PLAN_READY";
  if (errors.length) judgment = "NO_GO_SCOPE_VIOLATION";
  else if (holds > 0) judgment = "FIX_PLAN_PARTIAL_HOLDS";

  return {
    ok: errors.length === 0,
    judgment,
    errors,
    notes,
    counts: {
      p1_total: P1_SKUS.length,
      p1_ready: ready,
      p1_hold: holds,
      p2_content: p2ContentRows.length,
      patch_rows: proposedPatchRows.length,
    },
  };
}
