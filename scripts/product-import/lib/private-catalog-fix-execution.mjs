/**
 * Guarded private-catalog FIX EXECUTION helpers.
 * Writes are gated behind PRIVATE_CATALOG_QA_FIX_EXECUTION_APPROVED.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import {
  TARGET_MERCHANT_ID,
  P1_HOLD_SKUS,
  HOLD_KNOWN,
  FORBIDDEN_FIELDS,
  EXPECTED_EXECUTION,
  SLUG_ALLOWED_SKU,
  loadCsv,
  sha256File,
  scrubSecrets,
} from "./private-catalog-fix-plan.mjs";

export const EXECUTION_AUTH_TOKEN = "PRIVATE_CATALOG_QA_FIX_EXECUTION_APPROVED";
export const REMEDIATION_PREFIX = "remediation-20260804";
export const BUCKET = "products";
export const PUBLIC_BASE =
  "https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products";
export const EXPECTED_PRODUCT_COUNT = 110;

export function assertExecutionAuthorized(token) {
  if (!token || token !== EXECUTION_AUTH_TOKEN) {
    const err = new Error(
      token
        ? "WRONG_AUTHORIZATION: execute requires PRIVATE_CATALOG_QA_FIX_EXECUTION_APPROVED"
        : "MISSING_AUTHORIZATION: execute requires PRIVATE_CATALOG_QA_FIX_EXECUTION_APPROVED",
    );
    err.code = token ? "WRONG_AUTHORIZATION" : "MISSING_AUTHORIZATION";
    throw err;
  }
}

export function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex").toUpperCase();
}

/**
 * Actual Git HEAD of the working tree — the single source of truth for execution head
 * binding. Never trust an env var or a frozen QA constant for this; always ask git.
 * Returns null (never throws) when git is unavailable, so callers can fail closed.
 */
export function getActualGitHead(cwd = process.cwd()) {
  try {
    const out = execSync("git rev-parse HEAD", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const sha = String(out || "").trim();
    return sha || null;
  } catch {
    return null;
  }
}

export function sha8(sha256) {
  return String(sha256 || "").slice(0, 8).toUpperCase();
}

export function versionedStoragePath(sku, sha256) {
  return `${TARGET_MERCHANT_ID}/${REMEDIATION_PREFIX}/${sku}-${sha8(sha256)}.webp`;
}

export function publicUrlForPath(storagePath) {
  return `${PUBLIC_BASE}/${storagePath}`;
}

export function localAssetPathFromProposal(proposedValue, root) {
  const raw = String(proposedValue || "");
  if (!raw.startsWith("local:")) return null;
  return path.join(root, raw.slice("local:".length));
}

/**
 * Build resolved execution rows from frozen patch + local assets.
 * Does not write to production.
 */
export function resolveExecutionManifest({ patchRows, root, imageManifestRows = [] }) {
  const errors = [];
  const bySku = new Map();
  const imageMeta = new Map(
    imageManifestRows
      .filter((r) => r.sha256 && r.local_asset_path)
      .map((r) => [r.merchant_sku, r]),
  );

  for (const row of patchRows) {
    const sku = row.merchant_sku;
    if (HOLD_KNOWN.includes(sku)) {
      errors.push(`ARD-1191 excluded but found patch: ${sku}`);
      continue;
    }
    if (P1_HOLD_SKUS.includes(sku)) {
      errors.push(`HOLD SKU in patch: ${sku}`);
      continue;
    }
    if (FORBIDDEN_FIELDS.includes(row.field)) {
      errors.push(`forbidden field ${sku}/${row.field}`);
      continue;
    }
    if (row.field === "slug" && sku !== SLUG_ALLOWED_SKU) {
      errors.push(`slug not allowed for ${sku}`);
      continue;
    }
    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku).push(row);
  }

  const assets = [];
  const fieldRows = [];
  for (const [sku, rows] of [...bySku.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const grouped = {};
    for (const r of rows) {
      if (grouped[r.field]) errors.push(`duplicate field ${sku}/${r.field}`);
      grouped[r.field] = r;
    }

    let storagePath = "";
    let publicUrl = "";
    let localPath = "";
    let sha = "";
    if (grouped.image_url) {
      localPath = localAssetPathFromProposal(grouped.image_url.proposed_value, root);
      const meta = imageMeta.get(sku);
      if (localPath && fs.existsSync(localPath)) {
        sha = sha256File(localPath);
      } else if (meta?.sha256) {
        sha = String(meta.sha256).toUpperCase();
        localPath = path.isAbsolute(meta.local_asset_path)
          ? meta.local_asset_path
          : path.join(root, meta.local_asset_path);
      } else {
        errors.push(`missing local asset for ${sku}`);
      }
      if (sha) {
        storagePath = versionedStoragePath(sku, sha);
        publicUrl = publicUrlForPath(storagePath);
        assets.push({
          merchant_sku: sku,
          local_asset_path: path.relative(root, localPath).replace(/\\/g, "/"),
          sha256: sha,
          storage_path: storagePath,
          public_url: publicUrl,
          old_image_url: grouped.image_url.current_value,
        });
      }
    }

    for (const r of rows) {
      let proposed = r.proposed_value;
      if (r.field === "image_url" && publicUrl) proposed = publicUrl;
      fieldRows.push({
        merchant_sku: sku,
        field: r.field,
        current_value: r.current_value,
        proposed_value: proposed,
        severity: r.severity,
        issue_type: r.issue_type,
        local_asset_path: r.field === "image_url" ? path.relative(root, localPath || "").replace(/\\/g, "/") : "",
        storage_path: r.field === "image_url" ? storagePath : "",
        approved_sha256: r.field === "image_url" ? sha : "",
        public_image_url: r.field === "image_url" ? publicUrl : "",
        old_image_url: r.field === "image_url" ? r.current_value : "",
        decision_status: r.decision_status,
        production_apply_status: "NOT_AUTHORIZED",
        expected_safe_state:
          "private/inactive/unpublished/stock=0; merchant draft; no public leakage",
      });
    }
  }

  const fieldCounts = {};
  for (const r of fieldRows) fieldCounts[r.field] = (fieldCounts[r.field] || 0) + 1;

  if (bySku.size !== EXPECTED_EXECUTION.affected_products) {
    errors.push(`affected_products=${bySku.size} expected ${EXPECTED_EXECUTION.affected_products}`);
  }
  if (fieldRows.length !== EXPECTED_EXECUTION.field_changes) {
    errors.push(`field_changes=${fieldRows.length} expected ${EXPECTED_EXECUTION.field_changes}`);
  }
  if (assets.length !== EXPECTED_EXECUTION.replacement_assets) {
    errors.push(`replacement_assets=${assets.length} expected ${EXPECTED_EXECUTION.replacement_assets}`);
  }
  for (const [f, n] of Object.entries(EXPECTED_EXECUTION.field_breakdown)) {
    if ((fieldCounts[f] || 0) !== n) errors.push(`breakdown ${f}=${fieldCounts[f] || 0} want ${n}`);
  }

  const csvBody = toCsv(
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
    fieldRows,
  );
  const manifestSha = sha256Hex(Buffer.from(csvBody, "utf8"));

  return {
    ok: errors.length === 0,
    errors,
    skus: [...bySku.keys()].sort(),
    fieldRows,
    assets,
    fieldCounts,
    csvBody,
    manifestSha,
    counts: {
      affected_products: bySku.size,
      field_changes: fieldRows.length,
      replacement_images: assets.length,
    },
  };
}

export function groupUpdatesBySku(fieldRows) {
  const map = new Map();
  for (const r of fieldRows) {
    if (!map.has(r.merchant_sku)) map.set(r.merchant_sku, { merchant_sku: r.merchant_sku, fields: {} });
    map.get(r.merchant_sku).fields[r.field] = {
      current_value: r.current_value,
      proposed_value: r.proposed_value,
    };
  }
  return [...map.values()].sort((a, b) => a.merchant_sku.localeCompare(b.merchant_sku));
}

/**
 * Optimistic concurrency: product must match every frozen current_value exactly.
 */
export function matchFrozenCurrentValues(product, fieldMap) {
  const mismatches = [];
  for (const [field, spec] of Object.entries(fieldMap)) {
    const actual = product[field] == null ? "" : String(product[field]);
    const expected = spec.current_value == null ? "" : String(spec.current_value);
    if (actual !== expected) {
      mismatches.push({ field, expected, actual });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

export function assertSafeMerchantState(products, merchantMeta = {}) {
  const errors = [];
  if (products.length !== EXPECTED_PRODUCT_COUNT) {
    errors.push(`merchant_count=${products.length} expected ${EXPECTED_PRODUCT_COUNT}`);
  }
  if (merchantMeta.status && merchantMeta.status !== "draft") {
    errors.push(`merchant_status=${merchantMeta.status} expected draft`);
  }
  let publicVisible = 0;
  for (const p of products) {
    if (p.merchant_id && p.merchant_id !== TARGET_MERCHANT_ID) {
      errors.push(`merchant_mismatch product=${p.merchant_sku}`);
    }
    const stock = Number(p.stock ?? 0);
    if (p.is_active === true || p.is_active === "true" || p.is_active === 1) {
      errors.push(`is_active true: ${p.merchant_sku}`);
    }
    if (p.is_published === true || p.is_published === "true" || p.is_published === 1) {
      errors.push(`is_published true: ${p.merchant_sku}`);
    }
    if (String(p.visibility_status || "") !== "private") {
      errors.push(`visibility_status!=private: ${p.merchant_sku}`);
    }
    if (stock !== 0) errors.push(`stock!=0: ${p.merchant_sku}`);
    if (
      (p.is_published === true || p.is_published === "true") &&
      String(p.visibility_status) === "public"
    ) {
      publicVisible += 1;
    }
  }
  if (publicVisible !== 0) errors.push(`target_publicly_visible=${publicVisible}`);
  return { ok: errors.length === 0, errors, publicVisible };
}

export function assertNoHoldOrForbiddenSkus(skus) {
  const errors = [];
  for (const sku of skus) {
    if (P1_HOLD_SKUS.includes(sku)) errors.push(`HOLD included: ${sku}`);
    if (HOLD_KNOWN.includes(sku)) errors.push(`ARD-1191 included`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Pure gate: dry-run / missing auth must never call write adapters.
 */
export function planExecutionActions({ mode, authToken, grouped, journal = null }) {
  const actions = { storageUploads: [], dbUpdates: [], skipped: [], errors: [] };

  if (mode === "dry-run" || mode === "preflight" || mode === "postflight") {
    actions.readOnly = true;
    return actions;
  }

  if (mode === "execute" || mode === "resume") {
    try {
      assertExecutionAuthorized(authToken);
    } catch (e) {
      actions.errors.push(e.message);
      actions.blocked = true;
      return actions;
    }
  } else {
    actions.errors.push(`UNKNOWN_MODE:${mode}`);
    actions.blocked = true;
    return actions;
  }

  const completed = new Set(
    (journal?.entries || [])
      .filter((e) => e.status === "completed")
      .map((e) => e.merchant_sku),
  );
  const indeterminate = (journal?.entries || []).filter((e) => e.status === "indeterminate");

  if (indeterminate.length && mode === "execute") {
    actions.errors.push("INDETERMINATE_PRESENT: inspect DB then use --resume");
    actions.blocked = true;
    return actions;
  }

  for (const g of grouped) {
    if (mode === "resume") {
      const entry = (journal?.entries || []).find((e) => e.merchant_sku === g.merchant_sku);
      if (!entry || entry.status !== "pending") {
        actions.skipped.push({ merchant_sku: g.merchant_sku, reason: "not_pending" });
        continue;
      }
      if (entry.frozen_current_verified !== true) {
        actions.errors.push(`RESUME_REQUIRES_VERIFIED_PENDING:${g.merchant_sku}`);
        continue;
      }
    }
    if (completed.has(g.merchant_sku) && mode === "execute") {
      actions.errors.push(`DUPLICATE_EXECUTION:${g.merchant_sku}`);
      continue;
    }
    if (g.fields.image_url) {
      actions.storageUploads.push({
        merchant_sku: g.merchant_sku,
        upsert: false,
        overwrite: false,
      });
    }
    actions.dbUpdates.push({
      merchant_sku: g.merchant_sku,
      fields: Object.keys(g.fields),
      grouped: true,
    });
  }

  // Hard forbid upsert/overwrite flags
  for (const u of actions.storageUploads) {
    if (u.upsert !== false || u.overwrite !== false) {
      actions.errors.push("OVERWRITE_OR_UPSERT_FORBIDDEN");
      actions.blocked = true;
    }
  }
  return actions;
}

export function createJournalSkeleton(skus) {
  return {
    created_at: new Date().toISOString(),
    merchant_id: TARGET_MERCHANT_ID,
    entries: skus.map((merchant_sku) => ({
      merchant_sku,
      preflight_state: null,
      requested_fields: [],
      response_status: null,
      postflight_state: null,
      status: "pending",
      frozen_current_verified: false,
      timestamp: null,
    })),
  };
}

export function resumeCandidates(journal) {
  return (journal?.entries || []).filter(
    (e) => e.status === "pending" && e.frozen_current_verified === true,
  );
}

export function toCsv(headers, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => esc(r[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

export function writeCsv(filePath, headers, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, toCsv(headers, rows), "utf8");
}

export function loadPatchAndManifest(docsDir, root) {
  const patch = loadCsv(path.join(docsDir, "06_PROPOSED_DB_PATCH.csv"));
  const imageManifest = loadCsv(path.join(docsDir, "03_P1_IMAGE_REPLACEMENT_MANIFEST.csv"));
  return resolveExecutionManifest({ patchRows: patch, root, imageManifestRows: imageManifest });
}

/**
 * Simulated storage adapter checks used by tests.
 */
export function assertTargetPathAbsent(existingPaths, targetPath) {
  if ((existingPaths || []).includes(targetPath)) {
    const err = new Error(`TARGET_PATH_EXISTS:${targetPath}`);
    err.code = "TARGET_PATH_EXISTS";
    throw err;
  }
}

export function assertUploadOptionsForbidOverwrite(opts) {
  if (!opts || opts.upsert !== false) {
    const err = new Error("OVERWRITE_OR_UPSERT_FORBIDDEN");
    err.code = "OVERWRITE_OR_UPSERT_FORBIDDEN";
    throw err;
  }
}

export { scrubSecrets, TARGET_MERCHANT_ID, P1_HOLD_SKUS, HOLD_KNOWN, EXPECTED_EXECUTION };
