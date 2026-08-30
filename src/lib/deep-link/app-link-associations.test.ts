/**
 * STORE-PR6 §18/§19 — association generator validated with TEST fixtures (never real identities), and
 * proven to FAIL CLOSED when invoked without valid signing values.
 */
import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { parseFingerprints, buildAssetlinks, buildAasa } from "../../../scripts/mobile/generate-app-link-associations.mjs";

// TEST fixtures only — NOT production identities.
const TEST_FP = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
const TEST_TEAM = "ABCDE12345";
// Paths are relative to the repo root (vitest cwd).
const SCRIPT = "scripts/mobile/generate-app-link-associations.mjs";
const PREPARE = "scripts/mobile/prepare-app-link-associations.mjs";
const TMP = ".tmp-assoc-test";
function runPrepare(env: Record<string, string>) {
  return execFileSync(process.execPath, [PREPARE], { env: { ...process.env, STORE_ASSOCIATION_OUT_DIR: TMP, ...env }, stdio: "pipe" });
}
afterAll(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch { /* */ } });

describe("assetlinks.json", () => {
  it("has the delegate relation, package, and validated fingerprints", () => {
    const doc = buildAssetlinks("com.DilMart.store", [TEST_FP]);
    expect(doc[0].relation).toContain("delegate_permission/common.handle_all_urls");
    expect(doc[0].target.namespace).toBe("android_app");
    expect(doc[0].target.package_name).toBe("com.DilMart.store");
    expect(doc[0].target.sha256_cert_fingerprints).toEqual([TEST_FP]);
  });
});

describe("apple-app-site-association", () => {
  it("scopes appIDs to TeamID.bundle and components to /open only", () => {
    const doc = buildAasa(TEST_TEAM, "com.DilMart.store");
    expect(doc.applinks.details[0].appIDs).toEqual(["ABCDE12345.com.DilMart.store"]);
    expect(doc.applinks.details[0].components).toEqual([{ "/": "/open", comment: "DilMart customer handoff" }]);
  });
});

describe("parseFingerprints", () => {
  it("accepts a valid uppercase colon-separated SHA-256 and rejects malformed", () => {
    expect(parseFingerprints(TEST_FP).bad).toEqual([]);
    expect(parseFingerprints("not-a-fingerprint").bad.length).toBe(1);
    expect(parseFingerprints("").list).toEqual([]);
  });
});

describe("generator fails closed", () => {
  it("exits non-zero when invoked WITHOUT valid signing identity (never writes fake files)", () => {
    expect(() =>
      execFileSync(process.execPath, [SCRIPT], {
        env: { ...process.env, STORE_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS: "", STORE_IOS_TEAM_ID: "" },
        stdio: "pipe",
      }),
    ).toThrow();
  });

  it("succeeds with TEST fixtures written to a temp dir (structure only, not deployed)", () => {
    execFileSync(process.execPath, [SCRIPT], {
      env: { ...process.env, STORE_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS: TEST_FP, STORE_IOS_TEAM_ID: TEST_TEAM, STORE_ASSOCIATION_OUT_DIR: TMP },
      stdio: "pipe",
    });
    expect(existsSync(`${TMP}/assetlinks.json`)).toBe(true);
    expect(existsSync(`${TMP}/apple-app-site-association`)).toBe(true);
  });
});

describe("deploy gate (app-links:prepare, §7)", () => {
  it("A) neither identity → SKIPS (exit 0), writes no files (normal non-rollout build)", () => {
    rmSync(TMP, { recursive: true, force: true });
    expect(() => runPrepare({ STORE_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS: "", STORE_IOS_TEAM_ID: "" })).not.toThrow();
    expect(existsSync(`${TMP}/assetlinks.json`)).toBe(false);
  });

  it("B) only Android → FAILS CLOSED (exit non-zero)", () => {
    expect(() => runPrepare({ STORE_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS: TEST_FP, STORE_IOS_TEAM_ID: "" })).toThrow();
  });

  it("B) only Apple → FAILS CLOSED (exit non-zero)", () => {
    expect(() => runPrepare({ STORE_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS: "", STORE_IOS_TEAM_ID: TEST_TEAM })).toThrow();
  });

  it("C) both identities → generates + verifies BOTH association files", () => {
    rmSync(TMP, { recursive: true, force: true });
    runPrepare({ STORE_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS: TEST_FP, STORE_IOS_TEAM_ID: TEST_TEAM });
    expect(existsSync(`${TMP}/assetlinks.json`)).toBe(true);
    expect(existsSync(`${TMP}/apple-app-site-association`)).toBe(true);
  });
});
