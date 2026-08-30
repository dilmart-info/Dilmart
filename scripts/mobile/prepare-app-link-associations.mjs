#!/usr/bin/env node
/**
 * STORE-PR6 §7 — deploy-time gate for App-Link association generation. Wired into the deploy build
 * (build:deploy) so `.well-known` files are produced ONLY from real, complete signing identity:
 *
 *   A) neither identity configured  → SKIP (normal non-rollout build succeeds; no fake files) AND remove any
 *      STALE generated association artifacts so they can never survive into the deploy output.
 *   B) exactly one configured       → FAIL CLOSED (partial identity is never deployed)
 *   C) both configured              → generate + validate (the generator itself re-validates formats)
 *
 * A normal developer `npm run build` never runs this — devs build without signing identity.
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const fp = String(process.env.STORE_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS || "").trim();
const team = String(process.env.STORE_IOS_TEAM_ID || "").trim();
const hasAndroid = fp.length > 0;
const hasApple = team.length > 0;

const outDir = process.env.STORE_ASSOCIATION_OUT_DIR || "public/.well-known";
const ASSOCIATION_FILES = ["assetlinks.json", "apple-app-site-association"];

if (!hasAndroid && !hasApple) {
  // §7 — no identity: this is a normal non-rollout build. Any previously generated association file in the
  // publicDir would otherwise be copied into dist by the bundler and served against a now-unknown identity.
  // Delete stale artifacts BEFORE skipping so the deploy output can never contain association files here.
  let removed = 0;
  for (const f of ASSOCIATION_FILES) {
    const p = join(outDir, f);
    if (existsSync(p)) {
      rmSync(p, { force: true });
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[app-links:prepare] no signing identity configured — removed ${removed} stale association file(s) from ${outDir}.`);
  }
  console.log("[app-links:prepare] no signing identity configured — skipping association generation (non-rollout build).");
  process.exit(0);
}

if (hasAndroid !== hasApple) {
  console.error("[app-links:prepare] FAIL CLOSED: exactly one of STORE_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS / STORE_IOS_TEAM_ID is set. Both are required to deploy App Links.");
  process.exit(1);
}

// Both present → delegate to the generator (which validates formats and fails closed on malformed values).
const generator = join("scripts", "mobile", "generate-app-link-associations.mjs");
const res = spawnSync(process.execPath, [generator], { stdio: "inherit", env: process.env });
if (res.status !== 0) process.exit(res.status ?? 1);

for (const f of ASSOCIATION_FILES) {
  if (!existsSync(join(outDir, f))) {
    console.error(`[app-links:prepare] FAIL: expected ${join(outDir, f)} was not produced.`);
    process.exit(1);
  }
}
console.log("[app-links:prepare] association documents generated + verified.");
