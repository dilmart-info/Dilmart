/**
 * STORE-PR6 §6/§7 — DEPLOY-OUTPUT proof. Runs the real `npm run build:deploy` and asserts what actually
 * lands in `dist/.well-known`:
 *   §6  with TEST signing identity → assetlinks.json + apple-app-site-association are produced, correctly
 *       scoped (package com.DilMart.store, appID TEAM.bundle, components → /open ONLY).
 *   §7  with NO identity + PRESEEDED stale files → the deploy output contains NO association files (stale is
 *       scrubbed before the bundler copies publicDir).
 *
 * TEST fixtures only — never real fingerprints/Team IDs. All generated artifacts are cleaned afterwards and
 * `public/.well-known/*` association files are git-ignored (§19), so nothing can be committed.
 */
import { afterAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DIST_WK = join(ROOT, "dist", ".well-known");
const PUBLIC_WK = join(ROOT, "public", ".well-known");
const ASSOC = ["assetlinks.json", "apple-app-site-association"];

// TEST fixtures — NOT production identities.
const TEST_FP = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
const TEST_TEAM = "ABCDE12345";
const BUILD_TIMEOUT = 240_000;

function buildDeploy(env: Record<string, string>) {
  execSync("npm run build:deploy", {
    cwd: ROOT,
    env: { ...process.env, STORE_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS: "", STORE_IOS_TEAM_ID: "", ...env },
    stdio: "pipe",
    timeout: BUILD_TIMEOUT,
  });
}
function cleanup() {
  rmSync(join(ROOT, "dist"), { recursive: true, force: true });
  for (const f of ASSOC) rmSync(join(PUBLIC_WK, f), { force: true });
}
afterAll(cleanup);

describe("build:deploy → dist/.well-known (§6/§7)", () => {
  it("§6 with TEST identity, produces correctly-scoped association files in the DEPLOY output", () => {
    cleanup();
    buildDeploy({ STORE_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS: TEST_FP, STORE_IOS_TEAM_ID: TEST_TEAM });

    expect(existsSync(join(DIST_WK, "assetlinks.json"))).toBe(true);
    expect(existsSync(join(DIST_WK, "apple-app-site-association"))).toBe(true);

    const assetlinks = JSON.parse(readFileSync(join(DIST_WK, "assetlinks.json"), "utf8"));
    expect(assetlinks[0].target.package_name).toBe("com.DilMart.store");
    expect(assetlinks[0].target.sha256_cert_fingerprints).toEqual([TEST_FP]);

    const aasa = JSON.parse(readFileSync(join(DIST_WK, "apple-app-site-association"), "utf8"));
    expect(aasa.applinks.details[0].appIDs).toEqual([`${TEST_TEAM}.com.DilMart.store`]);
    expect(aasa.applinks.details[0].components).toEqual([{ "/": "/open", comment: "DilMart customer handoff" }]);
  }, BUILD_TIMEOUT);

  it("§7 with NO identity + preseeded stale files, the DEPLOY output contains NO association files", () => {
    cleanup();
    // Preseed stale association artifacts into publicDir (as a prior rollout build would have left them).
    mkdirSync(PUBLIC_WK, { recursive: true });
    for (const f of ASSOC) writeFileSync(join(PUBLIC_WK, f), '{"stale":true}');

    buildDeploy({}); // neither identity → app-links:prepare scrubs stale, build copies a clean publicDir

    for (const f of ASSOC) {
      expect(existsSync(join(DIST_WK, f)), `dist must not contain ${f}`).toBe(false);
      expect(existsSync(join(PUBLIC_WK, f)), `stale ${f} must be scrubbed from publicDir`).toBe(false);
    }
  }, BUILD_TIMEOUT);
});
