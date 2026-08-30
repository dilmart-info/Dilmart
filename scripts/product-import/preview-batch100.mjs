#!/usr/bin/env node
/**
 * Create exactly ONE Batch100 production Preview session.
 * Admin JWT loaded from local terminal extract file — never printed.
 * Does NOT confirm.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const TMP = path.join(ROOT, ".tmp-product-import/ard-al-khaleej/batch100");
const DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/batch100");
const MERCHANT_ID = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
const API = "https://DilMart-store-backend.onrender.com/api";
const PREVIEW_CSV = path.join(TMP, "18_BATCH100_PREVIEW_UPLOAD.csv");
const JWT_ENV = path.join(TMP, ".admin-jwt.env");
const TERMS = path.join(
  process.env.USERPROFILE || "",
  ".cursor/projects/e-Project-DilMart-Store/terminals",
);

function decodeJwtPayload(token) {
  try {
    const part = String(token).split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Reject anon/service_role API keys; require a user access token. */
function classifyUserAccessToken(token) {
  const payload = decodeJwtPayload(token);
  if (!payload) return { ok: false, reason: "malformed_jwt" };
  const role = payload.role || payload.app_metadata?.role || null;
  if (role === "anon" || role === "service_role") {
    return { ok: false, reason: `api_key_role_${role}` };
  }
  if (!payload.sub) return { ok: false, reason: "missing_sub" };
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return { ok: false, reason: "expired" };
  return { ok: true, reason: null, role, sub_prefix: String(payload.sub).slice(0, 8) };
}

function loadJwt() {
  const candidates = [];
  if (process.env.ADMIN_JWT) candidates.push({ token: process.env.ADMIN_JWT.trim(), source: "env:ADMIN_JWT" });
  if (process.env.BATCH100_ADMIN_JWT) {
    candidates.push({ token: process.env.BATCH100_ADMIN_JWT.trim(), source: "env:BATCH100_ADMIN_JWT" });
  }
  if (fs.existsSync(JWT_ENV)) {
    const t = fs.readFileSync(JWT_ENV, "utf8");
    const m = t.match(/^ADMIN_JWT=(.+)$/m);
    if (m) candidates.push({ token: m[1].trim(), source: "file:.admin-jwt.env" });
  }
  // Terminals often contain anon/service_role API keys — classify and skip those.
  if (fs.existsSync(TERMS)) {
    const files = fs.readdirSync(TERMS).filter((f) => f.endsWith(".txt"));
    for (const name of files) {
      const text = fs.readFileSync(path.join(TERMS, name), "utf8");
      const matches = text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
      for (const token of matches) candidates.push({ token, source: `terminal:${name}` });
    }
  }

  const rejected = [];
  for (const c of candidates) {
    const cls = classifyUserAccessToken(c.token);
    if (!cls.ok) {
      rejected.push({ source: c.source, reason: cls.reason, len: c.token.length });
      continue;
    }
    fs.mkdirSync(TMP, { recursive: true });
    fs.writeFileSync(JWT_ENV, `ADMIN_JWT=${c.token}\n`, "utf8");
    return {
      token: c.token,
      source: c.source,
      meta: { role: cls.role, sub_prefix: cls.sub_prefix, len: c.token.length },
    };
  }
  return { token: null, rejected };
}

function scrub(obj) {
  const s = JSON.stringify(obj);
  return JSON.parse(s.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]"));
}

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").toUpperCase();
}

async function main() {
  const lockPath = path.join(TMP, "preview.lock.json");
  if (fs.existsSync(lockPath)) {
    const prev = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    console.error(JSON.stringify({ error: "PREVIEW_ALREADY_CREATED", existing: scrub(prev) }));
    process.exit(2);
  }
  if (!fs.existsSync(PREVIEW_CSV)) throw new Error("preview CSV missing — run finalize first");

  const jwt = loadJwt();
  if (!jwt?.token) {
    console.error(
      JSON.stringify({
        error: "ADMIN_USER_JWT_REQUIRED",
        hint: "Set $env:ADMIN_JWT to a logged-in admin access token (not anon/service_role API keys).",
        rejected: jwt?.rejected || [],
      }),
    );
    process.exit(2);
  }

  const csvBuf = fs.readFileSync(PREVIEW_CSV);
  const csvSha = sha256File(PREVIEW_CSV);
  const form = new FormData();
  form.append("file", new Blob([csvBuf], { type: "text/csv" }), "18_BATCH100_PREVIEW_UPLOAD.csv");

  const url = `${API}/admin/merchants/${MERCHANT_ID}/products/import/preview`;
  const startedAt = new Date().toISOString();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt.token}` },
    body: form,
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }

  const safe = scrub({
    http_status: res.status,
    created_at: startedAt,
    merchant_id: MERCHANT_ID,
    csv_sha256: csvSha,
    jwt_source: jwt.source,
    jwt_len: jwt.meta?.len || jwt.token.length,
    jwt_role_claim: jwt.meta?.role || null,
    import_id: body?.import_id || body?.session_id || body?.id || null,
    status: body?.status || body?.session_status || null,
    summary: body?.summary || body?.preview?.summary || null,
    response_keys: body && typeof body === "object" ? Object.keys(body) : [],
  });

  // Persist lock ONLY on HTTP success to prevent accidental second Preview
  if (res.ok) {
    fs.writeFileSync(lockPath, JSON.stringify(safe, null, 2));
  }

  // Safe response evidence (strip any token-like strings recursively already done)
  const evidencePath = path.join(DOCS, "19_BATCH100_PREVIEW_RESPONSE_SAFE.json");
  const evidence = scrub({
    ...safe,
    response: body,
  });
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  fs.writeFileSync(path.join(TMP, "preview-response.json"), JSON.stringify(evidence, null, 2));

  console.log(JSON.stringify({ ok: res.ok, ...safe }, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(String(e?.stack || e).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]"));
  process.exit(1);
});
