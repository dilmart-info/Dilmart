#!/usr/bin/env node
/**
 * BATCH100 Confirm — exactly one Confirm for the approved Preview import_id.
 * Never prints JWT. No retry on indeterminate/timeout.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/batch100");
const TMP = path.join(ROOT, ".tmp-product-import/ard-al-khaleej/batch100");
const MERCHANT_ID = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
const IMPORT_ID = "ff3274c4-7f65-455b-8bda-549c4ecd3fad";
const API = "https://DilMart-store-backend.onrender.com/api";
const EXPECTED_HEAD = "501c9ef9c2c553763d55886ebb0d67e0855b44aa";
const EXPECTED_CSV_SHA = "A4378AAFC3121C880230C960563F9DB7E148CA567B79CEAEE5930A873E4BA181";
const LOCK = path.join(TMP, "confirm.lock.json");
const JWT_ENV = path.join(TMP, ".admin-jwt.env");

function scrub(obj) {
  const s = JSON.stringify(obj);
  return JSON.parse(s.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]"));
}

function loadJwt() {
  let token = process.env.ADMIN_JWT || process.env.BATCH100_ADMIN_JWT || "";
  let source = process.env.ADMIN_JWT ? "env:ADMIN_JWT" : process.env.BATCH100_ADMIN_JWT ? "env:BATCH100_ADMIN_JWT" : null;
  if (!token && fs.existsSync(JWT_ENV)) {
    const m = fs.readFileSync(JWT_ENV, "utf8").match(/^ADMIN_JWT=(.+)$/m);
    if (m) {
      token = m[1].trim();
      source = "file:.admin-jwt.env";
    }
  }
  if (!token) return { ok: false, error: "ADMIN_JWT_MISSING" };
  let payload;
  try {
    payload = JSON.parse(Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return { ok: false, error: "ADMIN_JWT_MALFORMED" };
  }
  const role = payload.role || payload.app_metadata?.role || null;
  if (role === "anon" || role === "service_role") return { ok: false, error: `API_KEY_REJECTED:${role}` };
  if (!payload.sub) return { ok: false, error: "MISSING_SUB" };
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return { ok: false, error: "JWT_EXPIRED" };
  return {
    ok: true,
    token,
    source,
    meta: { role, sub_prefix: String(payload.sub).slice(0, 8), len: token.length, secs_left: payload.exp ? payload.exp - now : null },
  };
}

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").toUpperCase();
}

async function main() {
  if (fs.existsSync(LOCK)) {
    console.error(JSON.stringify({ error: "CONFIRM_ALREADY_ATTEMPTED", lock: scrub(JSON.parse(fs.readFileSync(LOCK, "utf8"))) }));
    process.exit(2);
  }

  const { execSync } = await import("child_process");
  const head = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  if (head !== EXPECTED_HEAD) {
    console.error(JSON.stringify({ error: "HEAD_MISMATCH", head, expected: EXPECTED_HEAD }));
    process.exit(2);
  }
  const csvSha = sha256File(path.join(DOCS, "18_BATCH100_FINAL_IMPORT.csv"));
  if (csvSha !== EXPECTED_CSV_SHA) {
    console.error(JSON.stringify({ error: "CSV_SHA_MISMATCH", csvSha, expected: EXPECTED_CSV_SHA }));
    process.exit(2);
  }

  const jwt = loadJwt();
  if (!jwt.ok) {
    console.error(JSON.stringify({ error: jwt.error }));
    process.exit(2);
  }

  const startedAt = new Date().toISOString();
  const url = `${API}/admin/merchants/${MERCHANT_ID}/products/import/confirm`;

  // Write lock BEFORE request to prevent accidental double-send from parallel runners.
  const pending = scrub({
    phase: "confirm_pending",
    started_at: startedAt,
    import_id: IMPORT_ID,
    merchant_id: MERCHANT_ID,
    head,
    csv_sha256: csvSha,
    jwt_source: jwt.source,
    jwt_len: jwt.meta.len,
    jwt_role_claim: jwt.meta.role,
    actor_sub_prefix: jwt.meta.sub_prefix,
  });
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify(pending, null, 2));

  let res;
  let text;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 180_000);
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ import_id: IMPORT_ID }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    text = await res.text();
  } catch (e) {
    const indeterminate = scrub({
      ...pending,
      phase: "CONFIRM_INDETERMINATE_REQUIRES_DB_VERIFICATION",
      error: String(e?.message || e),
      http_status: null,
    });
    fs.writeFileSync(LOCK, JSON.stringify(indeterminate, null, 2));
    fs.writeFileSync(path.join(DOCS, "23_BATCH100_CONFIRM_RESPONSE_SAFE.json"), JSON.stringify(indeterminate, null, 2));
    console.error(JSON.stringify(indeterminate, null, 2));
    process.exit(3);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 800) };
  }

  const safe = scrub({
    http_status: res.status,
    created_at: startedAt,
    merchant_id: MERCHANT_ID,
    import_id: IMPORT_ID,
    head,
    csv_sha256: csvSha,
    jwt_source: jwt.source,
    jwt_len: jwt.meta.len,
    jwt_role_claim: jwt.meta.role,
    actor_sub_prefix: jwt.meta.sub_prefix,
    response_keys: body && typeof body === "object" ? Object.keys(body) : [],
    response: body,
  });
  fs.writeFileSync(LOCK, JSON.stringify({ ...safe, phase: res.ok ? "confirm_http_ok" : "confirm_http_failed" }, null, 2));
  fs.writeFileSync(path.join(DOCS, "23_BATCH100_CONFIRM_RESPONSE_SAFE.json"), JSON.stringify(safe, null, 2));
  console.log(JSON.stringify(safe, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(String(e?.stack || e).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]"));
  process.exit(1);
});
