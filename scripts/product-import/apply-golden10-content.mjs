#!/usr/bin/env node
/**
 * DilMart-PRODUCT-SHORT-DESCRIPTION-001-CORRECTIONS
 * Safe Golden 10 content updater via content-only bulk endpoint.
 *
 * Default: --dry-run
 * Execute: --execute (requires DilMart_API_BASE_URL + ADMIN_ACCESS_TOKEN + confirm phrase)
 */

import fs from "fs";
import path from "path";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

export const MERCHANT_ID = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
export const HOLD_SKU = "ARD-1191";
export const EXPECTED_READY_COUNT = 9;
export const CONFIRM_PHRASE = "APPLY GOLDEN10 CONTENT";
export const READY_CSV = path.join(
  REPO_ROOT,
  "docs/product-import/ard-al-khaleej/content/03_GOLDEN10_READY.csv",
);
export const HOLD_CSV = path.join(
  REPO_ROOT,
  "docs/product-import/ard-al-khaleej/content/04_GOLDEN10_HOLD.csv",
);
export const LOCK_PATH = path.join(
  REPO_ROOT,
  ".tmp-product-import/ard-al-khaleej/apply-golden10-content.lock",
);
export const REPORT_DIR = path.join(
  REPO_ROOT,
  ".tmp-product-import/ard-al-khaleej/golden10-apply-reports",
);

const FORBIDDEN_ITEM_KEYS = new Set([
  "name",
  "price",
  "discount_price",
  "category_id",
  "brand",
  "sizes",
  "size",
  "images",
  "stock",
  "is_active",
  "is_published",
  "visibility_status",
  "merchant_id",
]);

export function parseArgs(argv = process.argv) {
  const flags = new Set(argv.slice(2));
  const execute = flags.has("--execute") && !flags.has("--dry-run");
  return { execute, dryRun: !execute };
}

export function requireApiBase(env = process.env) {
  const raw = String(env.DilMart_API_BASE_URL || "").trim();
  if (!raw) {
    throw new Error("DilMart_API_BASE_URL is required (example: https://DilMart-store-backend.onrender.com/api)");
  }
  if (/DilMart-store-api\.onrender\.com/i.test(raw)) {
    throw new Error("Refusing silent/legacy API host DilMart-store-api.onrender.com — set DilMart_API_BASE_URL explicitly.");
  }
  return raw.replace(/\/$/, "");
}

export function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = "";
  let row = [];
  let inQuotes = false;
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
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((x) => String(x).length > 0)) rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((x) => String(x).length > 0)) rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((cols) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ?? "";
    });
    return obj;
  });
}

export function loadReadyRows(csvPath = READY_CSV) {
  if (!fs.existsSync(csvPath)) throw new Error(`Missing ready CSV: ${csvPath}`);
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  if (rows.length !== EXPECTED_READY_COUNT) {
    throw new Error(`Expected ${EXPECTED_READY_COUNT} ready rows, got ${rows.length}`);
  }
  const seen = new Set();
  for (const r of rows) {
    const sku = String(r.merchant_sku || "").trim().toUpperCase();
    const status = String(r.approval_status || r.decision || "").trim().toUpperCase();
    if (!sku) throw new Error("Ready row missing merchant_sku");
    if (sku === HOLD_SKU || status === "HOLD") {
      throw new Error(`HOLD row refused in ready fixture: ${sku}`);
    }
    if (seen.has(sku)) throw new Error(`Duplicate SKU in ready fixture: ${sku}`);
    seen.add(sku);
    if (!String(r.short_description || "").trim()) {
      throw new Error(`Ready row missing short_description: ${sku}`);
    }
  }
  return rows;
}

export function assertHoldFixture(holdPath = HOLD_CSV) {
  const hold = parseCsv(fs.readFileSync(holdPath, "utf8"));
  if (hold.length !== 1) throw new Error(`Expected HOLD count 1, got ${hold.length}`);
  if (String(hold[0].merchant_sku).trim().toUpperCase() !== HOLD_SKU) {
    throw new Error(`HOLD fixture must be ${HOLD_SKU}`);
  }
}

export function buildBulkPayload(rows) {
  const items = rows.map((r) => {
    const item = {
      merchant_sku: String(r.merchant_sku).trim().toUpperCase(),
      short_description: String(r.short_description || "").trim(),
      description: String(r.description || "").trim() || null,
    };
    for (const key of Object.keys(item)) {
      if (FORBIDDEN_ITEM_KEYS.has(key)) {
        throw new Error(`Forbidden field in content payload: ${key}`);
      }
    }
    return item;
  });
  return { items };
}

export function lockStatus(lockPath = LOCK_PATH) {
  if (!fs.existsSync(lockPath)) return null;
  return JSON.parse(fs.readFileSync(lockPath, "utf8"));
}

export function acquireLock(lockPath = LOCK_PATH) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  if (fs.existsSync(lockPath)) {
    const existing = lockStatus(lockPath);
    if (existing?.status === "INDETERMINATE_REQUIRES_DB_VERIFICATION") {
      throw new Error(`Indeterminate lock present — verify DB before rerun: ${lockPath}`);
    }
    throw new Error(`Lock file exists: ${lockPath}`);
  }
  const body = { pid: process.pid, at: new Date().toISOString(), status: "LOCKED" };
  fs.writeFileSync(lockPath, JSON.stringify(body, null, 2), { flag: "wx" });
  return body;
}

export function writeLockStatus(status, extra = {}, lockPath = LOCK_PATH) {
  const prev = lockStatus(lockPath) || {};
  fs.writeFileSync(lockPath, JSON.stringify({ ...prev, ...extra, status, updated_at: new Date().toISOString() }, null, 2));
}

export function releaseLockAfterDocumentedFailure(lockPath = LOCK_PATH) {
  if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
}

export async function apiFetch(apiBase, method, pathname, { token, body, timeoutMs = 30000, fetchImpl = fetch } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${apiBase}${pathname}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

export async function checkHealth(apiBase, fetchImpl = fetch) {
  const health = await apiFetch(apiBase, "GET", "/health", { timeoutMs: 15000, fetchImpl });
  if (!health.ok) {
    throw new Error(`Health check failed HTTP ${health.status}`);
  }
  return health.json;
}

async function promptConfirm() {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`Type exactly: ${CONFIRM_PHRASE}\n> `);
    return answer.trim() === CONFIRM_PHRASE;
  } finally {
    rl.close();
  }
}

export async function runApplyGolden10(options = {}) {
  const argv = options.argv || process.argv;
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const { execute } = parseArgs(argv);

  assertHoldFixture(options.holdCsvPath || HOLD_CSV);
  const rows = loadReadyRows(options.readyCsvPath || READY_CSV);
  const payload = buildBulkPayload(rows);

  if (!execute) {
    return {
      mode: "dry-run",
      merchant_id: MERCHANT_ID,
      ready_count: rows.length,
      skus: rows.map((r) => String(r.merchant_sku).trim().toUpperCase()),
      payload_item_keys: Object.keys(payload.items[0] || {}),
      note: "No API requests. Pass --execute with DilMart_API_BASE_URL + ADMIN_ACCESS_TOKEN.",
      after: rows.map((r) => ({
        merchant_sku: String(r.merchant_sku).trim().toUpperCase(),
        short_description: String(r.short_description || "").trim(),
        description: String(r.description || "").trim() || null,
      })),
    };
  }

  const apiBase = requireApiBase(env);
  console.log(`API base: ${apiBase}`);
  await checkHealth(apiBase, fetchImpl);

  const token = String(env.ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw new Error("ADMIN_ACCESS_TOKEN is required for --execute");

  let beforeAfter = options.beforeAfter || null;
  if (!beforeAfter) {
    // Before/After preview via admin product list (read-only).
    const list = await apiFetch(apiBase, "GET", `/products?merchant_id=${encodeURIComponent(MERCHANT_ID)}`, {
      token,
      fetchImpl,
    });
    if (!list.ok) throw new Error(`Failed to list products for Before/After: HTTP ${list.status}`);
    const products = Array.isArray(list.json) ? list.json : [];
    const bySku = new Map();
    for (const p of products) {
      const sku = String(p.merchant_sku || "").trim().toUpperCase();
      if (!sku) continue;
      if (!bySku.has(sku)) bySku.set(sku, []);
      bySku.get(sku).push(p);
    }
    beforeAfter = [];
    for (const item of payload.items) {
      const hits = bySku.get(item.merchant_sku) || [];
      if (hits.length !== 1) {
        throw new Error(`SKU ${item.merchant_sku}: expected exactly 1 product, found ${hits.length}`);
      }
      beforeAfter.push({
        merchant_sku: item.merchant_sku,
        before: {
          short_description: hits[0].short_description ?? null,
          description: hits[0].description ?? null,
        },
        after: {
          short_description: item.short_description,
          description: item.description,
        },
      });
    }
  }
  console.log(JSON.stringify({ merchant_id: MERCHANT_ID, beforeAfter }, null, 2));

  if (!options.skipConfirm) {
    const ok = await promptConfirm();
    if (!ok) {
      throw new Error("Confirm phrase mismatch — aborting.");
    }
  }

  const lockPath = options.lockPath || LOCK_PATH;
  acquireLock(lockPath);
  const reportDir = options.reportDir || REPORT_DIR;
  fs.mkdirSync(reportDir, { recursive: true });

  let writeCount = 0;
  try {
    let update;
    try {
      writeCount = 1;
      update = await apiFetch(
        apiBase,
        "POST",
        `/admin/merchants/${encodeURIComponent(MERCHANT_ID)}/products/content/bulk-update`,
        { token, body: payload, timeoutMs: 60000, fetchImpl },
      );
    } catch (err) {
      writeLockStatus(
        "INDETERMINATE_REQUIRES_DB_VERIFICATION",
        { error: String(err?.message || err), write_requests: writeCount },
        lockPath,
      );
      throw new Error(
        `Timeout/network/unknown during bulk write. Lock kept as INDETERMINATE_REQUIRES_DB_VERIFICATION. No automatic retry. ${err?.message || err}`,
      );
    }

    if (!update.ok) {
      writeLockStatus("FAILED_SAFE", { http_status: update.status, response: update.json, write_requests: writeCount }, lockPath);
      // Explicit HTTP failure before acceptance — may release after documented proof.
      releaseLockAfterDocumentedFailure(lockPath);
      throw new Error(`Bulk content update failed HTTP ${update.status}: ${JSON.stringify(update.json)}`);
    }

    const report = {
      at: new Date().toISOString(),
      status: "SUCCESS",
      merchant_id: MERCHANT_ID,
      api_base: apiBase,
      write_requests: writeCount,
      result: update.json,
      beforeAfter,
    };
    const reportPath = path.join(reportDir, `apply-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    writeLockStatus("COMPLETE", { report_path: reportPath, write_requests: writeCount }, lockPath);
    // Do not auto-remove lock on success — archive/remove only after DB verification.
    return { mode: "execute", report_path: reportPath, write_requests: writeCount, result: update.json };
  } catch (err) {
    throw err;
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  runApplyGolden10()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error(err?.stack || err?.message || err);
      process.exitCode = 1;
    });
}
