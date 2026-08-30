#!/usr/bin/env node
/**
 * STORE-PR6 §17–§20 — generate the deployable App-Link association documents from deployment-time signing
 * identity. FAILS CLOSED when invoked without valid values — it never writes fabricated fingerprints/Team IDs.
 *
 *   public/.well-known/assetlinks.json               (Android verified App Links)
 *   public/.well-known/apple-app-site-association    (iOS Universal Links; components-scoped to /open)
 *
 * Env:
 *   STORE_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS  comma-separated SHA-256 cert fingerprints
 *                                                    (uppercase hex, colon-separated, 32 bytes)
 *   STORE_IOS_TEAM_ID                                Apple Team ID (10 alphanumeric chars)
 *   STORE_APP_BUNDLE_ID                              optional (default com.DilMart.store)
 *   STORE_ASSOCIATION_OUT_DIR                        optional (default public/.well-known)
 *
 * Usage: node scripts/mobile/generate-app-link-associations.mjs
 * Normal Store builds do NOT invoke this — a missing/invalid identity here is a hard error, on purpose.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BUNDLE_ID = process.env.STORE_APP_BUNDLE_ID || "com.DilMart.store";
const OUT_DIR = process.env.STORE_ASSOCIATION_OUT_DIR || "public/.well-known";

const SHA256_FP = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/; // 32 uppercase hex bytes, colon-separated
const TEAM_ID = /^[0-9A-Z]{10}$/;

export function parseFingerprints(raw) {
  const list = String(raw || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const bad = list.filter((fp) => !SHA256_FP.test(fp));
  return { list, bad };
}

export function buildAssetlinks(bundleId, fingerprints) {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: bundleId, sha256_cert_fingerprints: fingerprints },
    },
  ];
}

export function buildAasa(teamId, bundleId) {
  const appId = `${teamId}.${bundleId}`;
  return {
    applinks: {
      details: [
        {
          appIDs: [appId],
          // Modern components matching, scoped to public marketplace discovery paths.
          components: [
            { "/": "/product/*", comment: "DilMart product detail" },
            { "/": "/category/*", comment: "DilMart category page" },
            { "/": "/store/*", comment: "DilMart merchant store page" },
            { "/": "/products*", comment: "DilMart product catalog" },
            { "/": "/offers*", comment: "DilMart offers" },
          ],
        },
      ],
    },
  };
}

function fail(msg) {
  console.error(`[app-link-associations] FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const { list: fingerprints, bad } = parseFingerprints(process.env.STORE_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS);
  const teamId = String(process.env.STORE_IOS_TEAM_ID || "").trim().toUpperCase();

  if (fingerprints.length === 0) fail("STORE_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS is empty — refusing to write fake Android identity.");
  if (bad.length > 0) fail(`invalid Android SHA-256 fingerprint(s): ${bad.join(", ")}`);
  if (!TEAM_ID.test(teamId)) fail("STORE_IOS_TEAM_ID missing/invalid (expected 10 alphanumeric) — refusing to write fake Apple identity.");

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "assetlinks.json"), JSON.stringify(buildAssetlinks(BUNDLE_ID, fingerprints), null, 2) + "\n");
  writeFileSync(join(OUT_DIR, "apple-app-site-association"), JSON.stringify(buildAasa(teamId, BUNDLE_ID), null, 2) + "\n");
  console.log(`[app-link-associations] wrote assetlinks.json (${fingerprints.length} fingerprint(s)) + apple-app-site-association to ${OUT_DIR}`);
}

// Only run when executed directly (importable for tests). Guarded so a bundler importing this for its
// exported functions (import.meta.url may not be a file: URL under Vite) never triggers main().
import { fileURLToPath } from "node:url";
try {
  if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
} catch {
  /* imported, not executed directly */
}
