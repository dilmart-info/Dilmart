#!/usr/bin/env node
/**
 * DilMart-BATCH100-STORAGE-AUTH-COMPATIBILITY-001
 * + DilMart-ARD-AL-KHALEEJ-BATCH100-UPLOAD-PREVIEW-001 resume
 *
 * Accepts sb_secret_ (current) and eyJ (legacy service_role).
 * Canary-first upload; bounded concurrency for remaining 99.
 * Secrets never printed.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import {
  assertProductionSupabaseUrl,
  classifyAuthFailure,
  createBatch100StorageClient,
  probeServerKeyAcceptance,
  resolveServerKey,
  safeAuthLog,
  scrubSecrets,
} from "./lib/batch100-storage-auth.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const MERCHANT_ID = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
const BUCKET = "products";
const IMG_DIR = path.join(ROOT, ".tmp-product-import/ard-al-khaleej/batch100/images");
const MANIFEST = path.join(ROOT, "docs/product-import/ard-al-khaleej/batch100/04_BATCH100_IMAGE_MANIFEST.csv");
const OUT_DIR = path.join(ROOT, ".tmp-product-import/ard-al-khaleej/batch100");
const DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/batch100");
const CONCURRENCY = 4;
const PUBLIC_BASE = `https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/${BUCKET}`;
const CANARY_SKU = "ARD-1318"; // first frozen row; part of approved 100

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

function splitCsv(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
  const lines = text.split(/\r?\n/);
  const hdr = splitCsv(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsv(line);
    const row = {};
    hdr.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath, rows, headers) {
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex").toUpperCase();
}

async function mapPool(items, limit, fn, { abortOnAuth = true, secrets = [] } = {}) {
  const results = new Array(items.length);
  let i = 0;
  let aborted = null;
  async function worker() {
    while (i < items.length) {
      if (aborted) return;
      const idx = i++;
      try {
        results[idx] = await fn(items[idx], idx);
        if (abortOnAuth && results[idx]?.auth_abort) {
          aborted = results[idx];
          return;
        }
      } catch (e) {
        const msg = scrubSecrets(String(e?.message || e), secrets);
        const classified = classifyAuthFailure(null, msg);
        results[idx] = {
          merchant_sku: items[idx]?.merchant_sku,
          upload_status: "failed",
          error: msg,
          auth_abort: classified.isAuth,
          auth_code: classified.code,
        };
        if (abortOnAuth && classified.isAuth) {
          aborted = results[idx];
          return;
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return { results, aborted };
}

async function listAllUnderPrefix(supabase, prefix) {
  const out = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix.replace(/\/$/, ""), {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

async function downloadObject(supabase, objectPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(objectPath);
  if (error) return { ok: false, error: error.message, status: error.statusCode || error.status || null };
  const buf = Buffer.from(await data.arrayBuffer());
  return { ok: true, buf };
}

async function publicGet(url) {
  const res = await fetch(url, { method: "GET" });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, contentType: res.headers.get("content-type") || "", buf };
}

function authAbortResult(sku, objectPath, errorMsg, secrets) {
  const scrubbed = scrubSecrets(errorMsg, secrets);
  const classified = classifyAuthFailure(null, scrubbed);
  return {
    merchant_sku: sku,
    storage_path: objectPath,
    upload_status: "failed",
    error: scrubbed,
    auth_abort: classified.isAuth,
    auth_code: classified.code,
  };
}

async function processOneRow(supabase, row, secrets) {
  const sku = row.merchant_sku;
  const objectPath = `${MERCHANT_ID}/${sku}.webp`;
  const localPath = path.join(IMG_DIR, `${sku}.webp`);
  if (!fs.existsSync(localPath)) {
    return {
      merchant_sku: sku,
      storage_path: objectPath,
      upload_status: "failed",
      error: "local_missing",
    };
  }
  const localBuf = fs.readFileSync(localPath);
  const localSha = sha256(localBuf);
  if (row.sha256 && row.sha256.toUpperCase() !== localSha) {
    return {
      merchant_sku: sku,
      storage_path: objectPath,
      upload_status: "failed",
      error: "local_sha_mismatch_vs_manifest",
      local_sha256: localSha,
      manifest_sha256: row.sha256,
    };
  }

  const existing = await downloadObject(supabase, objectPath);
  if (existing.ok) {
    const remoteSha = sha256(existing.buf);
    if (remoteSha === localSha) {
      return {
        merchant_sku: sku,
        storage_path: objectPath,
        public_url: `${PUBLIC_BASE}/${objectPath}`,
        upload_status: "already_present_verified",
        upload_http_status: 200,
        local_sha256: localSha,
        remote_sha256: remoteSha,
        sha_match: "true",
        file_size: localBuf.length,
      };
    }
    return {
      merchant_sku: sku,
      storage_path: objectPath,
      upload_status: "stop_mismatch_existing",
      error: "existing_object_sha_mismatch_no_overwrite",
      local_sha256: localSha,
      remote_sha256: remoteSha,
      sha_match: "false",
    };
  }

  if (existing.error) {
    const classified = classifyAuthFailure(existing.status, existing.error);
    if (classified.isAuth) {
      return authAbortResult(sku, objectPath, existing.error, secrets);
    }
  }

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectPath, localBuf, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false,
  });

  if (upErr) {
    const classified = classifyAuthFailure(upErr.statusCode || upErr.status, upErr.message);
    if (classified.isAuth) {
      return authAbortResult(sku, objectPath, upErr.message, secrets);
    }

    const again = await downloadObject(supabase, objectPath);
    if (again.ok) {
      const remoteSha = sha256(again.buf);
      if (remoteSha === localSha) {
        return {
          merchant_sku: sku,
          storage_path: objectPath,
          public_url: `${PUBLIC_BASE}/${objectPath}`,
          upload_status: "uploaded_verified",
          upload_http_status: "recovered_after_error",
          error: scrubSecrets(upErr.message, secrets),
          local_sha256: localSha,
          remote_sha256: remoteSha,
          sha_match: "true",
          file_size: localBuf.length,
        };
      }
      return {
        merchant_sku: sku,
        storage_path: objectPath,
        upload_status: "indeterminate_mismatch",
        error: scrubSecrets(upErr.message, secrets),
        local_sha256: localSha,
        remote_sha256: remoteSha,
        sha_match: "false",
      };
    }
    return {
      merchant_sku: sku,
      storage_path: objectPath,
      upload_status: "not_uploaded",
      error: scrubSecrets(upErr.message, secrets),
      local_sha256: localSha,
    };
  }

  const verify = await downloadObject(supabase, objectPath);
  if (!verify.ok) {
    return {
      merchant_sku: sku,
      storage_path: objectPath,
      upload_status: "indeterminate_mismatch",
      error: `upload_ok_but_download_failed:${scrubSecrets(verify.error, secrets)}`,
      local_sha256: localSha,
    };
  }
  const remoteSha = sha256(verify.buf);
  if (remoteSha !== localSha) {
    return {
      merchant_sku: sku,
      storage_path: objectPath,
      public_url: `${PUBLIC_BASE}/${objectPath}`,
      upload_status: "indeterminate_mismatch",
      local_sha256: localSha,
      remote_sha256: remoteSha,
      sha_match: "false",
    };
  }
  return {
    merchant_sku: sku,
    storage_path: objectPath,
    public_url: `${PUBLIC_BASE}/${objectPath}`,
    upload_status: "uploaded_verified",
    upload_http_status: 201,
    local_sha256: localSha,
    remote_sha256: remoteSha,
    sha_match: "true",
    file_size: localBuf.length,
  };
}

async function verifyPublic(r) {
  const verifiedStatuses = new Set(["uploaded_verified", "already_present_verified"]);
  if (!verifiedStatuses.has(r.upload_status) || !r.public_url) return r;
  const pub = await publicGet(r.public_url);
  const remoteSha = sha256(pub.buf);
  return {
    ...r,
    public_get_status: pub.status,
    public_content_type: pub.contentType,
    public_sha256: remoteSha,
    sha_match: remoteSha === r.local_sha256 && pub.status === 200 ? "true" : "false",
    mime_ok: String(pub.contentType).includes("webp") || String(pub.contentType).includes("octet-stream"),
    verified_at: new Date().toISOString(),
  };
}

function summarize(post) {
  return {
    total: post.length,
    uploaded_verified: post.filter((r) => r.upload_status === "uploaded_verified").length,
    already_present_verified: post.filter((r) => r.upload_status === "already_present_verified").length,
    failed: post.filter((r) => ["failed", "not_uploaded", "stop_mismatch_existing"].includes(r.upload_status)).length,
    indeterminate: post.filter((r) => r.upload_status === "indeterminate_mismatch").length,
    sha_mismatches: post.filter((r) => r.sha_match === "false").length,
    public_get_200: post.filter((r) => r.public_get_status === 200).length,
    stop: post.some((r) => r.upload_status === "stop_mismatch_existing"),
    auth_aborted: post.some((r) => r.auth_abort),
  };
}

function writeResults(post) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "upload-results.json"), JSON.stringify({ summary: summarize(post), results: post }, null, 2));
  writeCsv(
    path.join(DOCS, "16_BATCH100_UPLOAD_RESULT.csv"),
    post.map((r) => ({
      merchant_sku: r.merchant_sku,
      storage_path: r.storage_path,
      public_url: r.public_url || "",
      upload_status: r.upload_status,
      upload_http_status: r.upload_http_status || "",
      public_get_status: r.public_get_status || "",
      local_sha256: r.local_sha256 || "",
      remote_sha256: r.remote_sha256 || r.public_sha256 || "",
      sha_match: r.sha_match || "",
      error: scrubSecrets(r.error || ""),
      verified_at: r.verified_at || "",
    })),
    [
      "merchant_sku",
      "storage_path",
      "public_url",
      "upload_status",
      "upload_http_status",
      "public_get_status",
      "local_sha256",
      "remote_sha256",
      "sha_match",
      "error",
      "verified_at",
    ],
  );
}

async function main() {
  loadEnvFile(path.join(ROOT, "backend/.env"));
  loadEnvFile(path.join(ROOT, ".env"));

  const url = process.env.SUPABASE_URL;
  const projectGuard = assertProductionSupabaseUrl(url);
  if (!projectGuard.ok) {
    console.error(JSON.stringify({ error: "WRONG_SUPABASE_PROJECT", hostname: projectGuard.hostname }));
    process.exit(2);
  }

  const resolved = resolveServerKey(process.env);
  if (!resolved.ok) {
    console.error(
      JSON.stringify({
        error: resolved.code || "UNSUPPORTED_SERVER_KEY",
        key_kind: resolved.kind,
        source: resolved.source,
      }),
    );
    process.exit(2);
  }

  // Freeze selected key for this run — no later fallback.
  const frozen = { source: resolved.source, kind: resolved.kind, key: resolved.key };
  const secrets = [frozen.key];

  console.log(
    JSON.stringify(
      safeAuthLog(
        {
          phase: "auth_resolve",
          key_source: frozen.source,
          key_kind: frozen.kind,
          project_host: projectGuard.hostname,
        },
        secrets,
      ),
    ),
  );

  const probe = await probeServerKeyAcceptance({
    url,
    key: frozen.key,
    kind: frozen.kind,
  });
  console.log(
    JSON.stringify(
      safeAuthLog(
        {
          phase: "auth_probe",
          ok: probe.ok,
          status: probe.status,
          code: probe.code,
          key_kind: frozen.kind,
        },
        secrets,
      ),
    ),
  );
  if (!probe.ok) {
    console.error(JSON.stringify({ error: "AUTH_PROBE_FAILED", code: probe.code, status: probe.status }));
    process.exit(2);
  }

  const supabase = createBatch100StorageClient({ createClient }, url, frozen.key, frozen.kind);
  const rows = readCsv(MANIFEST);
  if (rows.length !== 100) throw new Error(`manifest rows=${rows.length}`);

  let merchantObjects = [];
  try {
    merchantObjects = await listAllUnderPrefix(supabase, MERCHANT_ID);
  } catch (e) {
    const msg = scrubSecrets(String(e.message || e), secrets);
    const classified = classifyAuthFailure(null, msg);
    if (classified.isAuth) {
      console.error(JSON.stringify({ error: "AUTH_LIST_FAILED", code: classified.code }));
      process.exit(2);
    }
    console.error(JSON.stringify({ warning: "list_merchant_prefix_failed", detail: msg }));
  }

  const targetPaths = rows.map((r) => `${MERCHANT_ID}/${r.merchant_sku}.webp`);
  const existingNames = new Set(merchantObjects.map((o) => o.name));
  const existingTargets = targetPaths.filter((p) => existingNames.has(path.posix.basename(p)));

  const preflight = {
    merchant_prefix_object_count: merchantObjects.length,
    existing_target_path_count: existingTargets.length,
    key_kind: frozen.kind,
    key_source: frozen.source,
    canary_sku: CANARY_SKU,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "upload-preflight.json"), JSON.stringify(preflight, null, 2));
  console.log(JSON.stringify({ phase: "preflight", ...preflight }));

  const canaryRow = rows.find((r) => r.merchant_sku === CANARY_SKU);
  if (!canaryRow) throw new Error(`canary SKU ${CANARY_SKU} missing from manifest`);

  const canaryRaw = await processOneRow(supabase, canaryRow, secrets);
  const canary = await verifyPublic(canaryRaw);
  console.log(
    JSON.stringify(
      safeAuthLog(
        {
          phase: "canary",
          sku: CANARY_SKU,
          upload_status: canary.upload_status,
          sha_match: canary.sha_match,
          public_get_status: canary.public_get_status,
          mime_ok: canary.mime_ok,
          auth_abort: Boolean(canary.auth_abort),
          auth_code: canary.auth_code || null,
        },
        secrets,
      ),
    ),
  );

  if (canary.auth_abort) {
    writeResults([canary]);
    console.error(JSON.stringify({ error: "CANARY_AUTH_FAILED", code: canary.auth_code }));
    process.exit(2);
  }

  const canaryPass =
    ["uploaded_verified", "already_present_verified"].includes(canary.upload_status) &&
    canary.sha_match === "true" &&
    canary.public_get_status === 200 &&
    canary.mime_ok;

  if (!canaryPass) {
    writeResults([canary]);
    console.error(
      JSON.stringify({
        error: "CANARY_FAILED",
        upload_status: canary.upload_status,
        sha_match: canary.sha_match,
        public_get_status: canary.public_get_status,
      }),
    );
    process.exit(1);
  }

  const remaining = rows.filter((r) => r.merchant_sku !== CANARY_SKU);
  const { results: remainingResults, aborted } = await mapPool(
    remaining,
    CONCURRENCY,
    async (row) => processOneRow(supabase, row, secrets),
    { abortOnAuth: true, secrets },
  );

  if (aborted) {
    const post = [canary, ...remainingResults.filter(Boolean)];
    writeResults(post);
    console.error(JSON.stringify({ error: "BULK_AUTH_ABORT", code: aborted.auth_code, sku: aborted.merchant_sku }));
    process.exit(2);
  }

  const verifiedPool = await mapPool(remainingResults, CONCURRENCY, async (r) => verifyPublic(r), {
    abortOnAuth: false,
    secrets,
  });
  const post = [canary, ...verifiedPool.results];
  const summary = summarize(post);
  writeResults(post);

  console.log(
    JSON.stringify(
      safeAuthLog(
        {
          phase: "postflight",
          summary,
          key_kind: frozen.kind,
          canary_sku: CANARY_SKU,
          remaining_attempted: remaining.length,
        },
        secrets,
      ),
    ),
  );

  if (
    summary.stop ||
    summary.failed ||
    summary.indeterminate ||
    summary.sha_mismatches ||
    summary.public_get_200 !== 100 ||
    summary.uploaded_verified + summary.already_present_verified !== 100
  ) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(scrubSecrets(String(e?.stack || e)));
  process.exit(1);
});
