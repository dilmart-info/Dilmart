#!/usr/bin/env node
/**
 * Postflight verifier — fails closed without live catalog + journal.
 * No template ok:true when inputs missing. Accepts fake adapters (any env) or
 * production adapters built read-only (no FIX_EXEC_AUTHORIZATION/ALLOW_WRITES required).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadResolvedFromDocs,
  runPostflight,
  scrubSecrets,
  EXPECTED_MANIFEST_SHA,
} from "./lib/private-catalog-fix-runtime.mjs";
import {
  createFakeAdapters,
  createProductionAdapters,
  resolveProductionAdapterEnv,
  canBuildProductionAdapters,
} from "./lib/private-catalog-fix-adapters.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/private-catalog-fix-plan");
const TMP = path.join(ROOT, ".tmp-product-import/ard-al-khaleej/private-catalog-fix-plan");

function fail(payload) {
  console.error(scrubSecrets(JSON.stringify({ ok: false, mode: "postflight", ...payload })));
  process.exit(1);
}

function resolveReadOnlyAdapters(env) {
  if (env.FIX_EXEC_FAKE_ADAPTERS_JSON) {
    return createFakeAdapters(JSON.parse(fs.readFileSync(env.FIX_EXEC_FAKE_ADAPTERS_JSON, "utf8")));
  }
  if (canBuildProductionAdapters(env)) {
    const cfg = resolveProductionAdapterEnv(env);
    return createProductionAdapters({
      supabaseUrl: cfg.supabaseUrl,
      serverKey: cfg.key.key,
      adminJwt: cfg.adminJwt,
      backendApi: cfg.backendApi,
      readOnly: true,
    });
  }
  return null;
}

async function main() {
  const resolved = loadResolvedFromDocs(DOCS, ROOT);
  if (!resolved.ok) fail({ errors: resolved.errors });
  if (resolved.manifestSha !== EXPECTED_MANIFEST_SHA) {
    fail({ error: "MANIFEST_SHA_MISMATCH", got: resolved.manifestSha });
  }

  const journalPath = path.join(TMP, "execution-journal.json");
  if (!fs.existsSync(journalPath)) {
    fail({ judgment: "POSTFLIGHT_FAIL", error: "JOURNAL_MISSING" });
  }
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));

  const adapters = resolveReadOnlyAdapters(process.env);
  if (!adapters) {
    fail({ judgment: "POSTFLIGHT_FAIL", error: "LIVE_INPUT_REQUIRED" });
  }

  const post = await runPostflight({ resolved, adapters, journal });
  console.log(scrubSecrets(JSON.stringify({ mode: "postflight", ...post }, null, 2)));
  process.exit(post.ok ? 0 : 1);
}

main().catch((e) => fail({ error: scrubSecrets(String(e?.message || e)) }));
