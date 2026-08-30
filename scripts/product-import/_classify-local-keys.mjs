#!/usr/bin/env node
/** Classify local Batch100/Storage keys without printing values. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvFile(p, into) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (into[m[1]]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    into[m[1]] = v;
  }
}

function classify(v) {
  if (!v) return "empty";
  if (v.startsWith("sb_secret_")) return "CURRENT_SERVER_SECRET";
  if (v.startsWith("sb_publishable_")) return "REJECT_PUBLISHABLE";
  if (v.startsWith("eyJ")) return "LEGACY_SERVICE_ROLE";
  if (v.startsWith("sb_")) return "REJECT_UNKNOWN_SB";
  return "REJECT_UNSUPPORTED";
}

const env = { ...process.env };
loadEnvFile(path.join(ROOT, "backend/.env"), env);
loadEnvFile(path.join(ROOT, ".env"), env);

const order = [
  "BATCH100_SUPABASE_SECRET_KEY",
  "SUPABASE_SECRET_KEY",
  "BATCH100_SUPABASE_SERVICE_ROLE_JWT",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const rows = order.map((name) => {
  const present = Boolean(env[name]);
  return {
    name,
    present,
    len: present ? String(env[name]).length : 0,
    classification: present ? classify(env[name]) : "MISSING",
  };
});

let urlHost = null;
try {
  urlHost = env.SUPABASE_URL ? new URL(env.SUPABASE_URL).hostname : null;
} catch {
  urlHost = "invalid";
}

const preferred = rows.find((r) =>
  ["CURRENT_SERVER_SECRET", "LEGACY_SERVICE_ROLE"].includes(r.classification),
);

console.log(
  JSON.stringify(
    {
      supabase_url_host: urlHost,
      preferred_source: preferred?.name || null,
      preferred_kind: preferred?.classification || null,
      keys: rows,
    },
    null,
    2,
  ),
);
