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
 *   STORE_ANDROID_PACKAGE_ID                         optional (default com.dilmart.store)
 *   STORE_IOS_BUNDLE_ID                              optional (default com.DilMart.store)
 *   STORE_ASSOCIATION_OUT_DIR                        optional (default public/.well-known)
 *
 * Usage: node scripts/mobile/generate-app-link-associations.mjs
 * Normal Store builds do NOT invoke this — a missing/invalid identity here is a hard error, on purpose.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_ANDROID_PACKAGE_ID = "com.dilmart.store";
export const DEFAULT_IOS_BUNDLE_ID = "com.DilMart.store";

export const ANDROID_PACKAGE_REGEX = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
export const IOS_BUNDLE_REGEX = /^[a-zA-Z0-9.-]+$/;

export function validateAndroidPackageId(pkg) {
  return typeof pkg === "string" && ANDROID_PACKAGE_REGEX.test(pkg.trim());
}

export function validateIosBundleId(bundle) {
  return typeof bundle === "string" && IOS_BUNDLE_REGEX.test(bundle.trim());
}

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

export function buildAssetlinks(packageName, fingerprints) {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fingerprints },
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
  const androidPackageId = String(process.env.STORE_ANDROID_PACKAGE_ID || DEFAULT_ANDROID_PACKAGE_ID).trim();
  const iosBundleId = String(process.env.STORE_IOS_BUNDLE_ID || DEFAULT_IOS_BUNDLE_ID).trim();

  if (fingerprints.length === 0) fail("STORE_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS is empty — refusing to write fake Android identity.");
  if (bad.length > 0) fail(`invalid Android SHA-256 fingerprint(s): ${bad.join(", ")}`);
  if (!TEAM_ID.test(teamId)) fail("STORE_IOS_TEAM_ID missing/invalid (expected 10 alphanumeric) — refusing to write fake Apple identity.");
  if (!validateAndroidPackageId(androidPackageId)) {
    fail(`STORE_ANDROID_PACKAGE_ID missing/invalid: '${androidPackageId}' — expected lowercase reverse-domain format (e.g. com.dilmart.store)`);
  }
  if (!validateIosBundleId(iosBundleId)) {
    fail(`STORE_IOS_BUNDLE_ID missing/invalid: '${iosBundleId}' — expected bundle ID format (e.g. com.DilMart.store)`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "assetlinks.json"), JSON.stringify(buildAssetlinks(androidPackageId, fingerprints), null, 2) + "\n");
  writeFileSync(join(OUT_DIR, "apple-app-site-association"), JSON.stringify(buildAasa(teamId, iosBundleId), null, 2) + "\n");
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
