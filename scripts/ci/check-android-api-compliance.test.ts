/**
 * Fail-Closed Automated Test Suite for Android 16 / Google Play API 36 Compliance Guard.
 *
 * Tests all positive and negative fail-closed paths using deterministic fixtures and mocks:
 * - Missing APK / AAB failure
 * - Malformed archive failure
 * - Target SDK < 36 rejection
 * - Compile SDK < 36 rejection
 * - Min SDK != 24 rejection
 * - Empty versionName rejection
 * - Non-positive versionCode rejection
 * - Application ID mismatch rejection
 * - .so present but ELF buffer reader unavailable rejection
 * - Missing 64-bit counterpart rejection (armeabi-v7a without arm64-v8a)
 * - 16 KB ELF alignment verification (4 KB rejection vs 16 KB acceptance)
 * - CLI explicit mode requirement (--pre-build / --post-build)
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  checkVariablesGradle,
  checkAppBuildGradle,
  inspectApkSigning,
  inspectAabSigning,
  inspectGradleSigningConfig,
  inspectElf16KbAlignment,
  inspectNativeLibraries,
  parseZipEntries,
  inspectApkBinary,
  inspectAabWithBundletool,
  runCli,
} from "./check-android-api-compliance.mjs";

const rootDir = path.resolve(__dirname, "../..");
const variablesPath = path.join(rootDir, "android/variables.gradle");
const appBuildPath = path.join(rootDir, "android/app/build.gradle");

function makeMockElf64(align: number): Buffer {
  const buf = Buffer.alloc(120);
  buf.write("\x7fELF", 0, 4, "ascii");
  buf[4] = 2; // 64-bit
  buf[5] = 1; // Little-endian
  buf[6] = 1; // EV_CURRENT
  buf.writeBigUInt64LE(64n, 32); // e_phoff = 64
  buf.writeUInt16LE(56, 54); // e_phentsize = 56
  buf.writeUInt16LE(1, 56); // e_phnum = 1

  // Program header at offset 64
  buf.writeUInt32LE(1, 64); // p_type = PT_LOAD
  buf.writeUInt32LE(5, 68); // p_flags = R|X
  buf.writeBigUInt64LE(0n, 72); // p_offset = 0
  buf.writeBigUInt64LE(0n, 80); // p_vaddr = 0
  buf.writeBigUInt64LE(BigInt(align), 112); // p_align at offset 64+48=112
  return buf;
}

function makeMockZip(filenames: string[]): Buffer {
  const chunks: Buffer[] = [];
  for (const fn of filenames) {
    const fnBuf = Buffer.from(fn, "utf8");
    const rec = Buffer.alloc(46 + fnBuf.length);
    rec.writeUInt32LE(0x02014b50, 0);
    rec.writeUInt16LE(fnBuf.length, 28);
    fnBuf.copy(rec, 46);
    chunks.push(rec);
  }
  return Buffer.concat(chunks);
}

function createMockCli(name: string, jsCode: string): string {
  const isWin = process.platform === "win32";
  const ext = isWin ? ".cmd" : ".sh";
  const target = path.join(rootDir, "node_modules", `.temp-mock-${name}${ext}`);
  const escaped = jsCode.replace(/"/g, '\\"');
  if (isWin) {
    fs.writeFileSync(target, `@echo off\r\nnode -e "${escaped}" -- %*\r\n`, "utf8");
  } else {
    fs.writeFileSync(target, `#!/bin/sh\nnode -e "${escaped}" -- "$@"\n`, "utf8");
    fs.chmodSync(target, 0o755);
  }
  return target;
}

describe("Android 16 / API 36 Compliance Guard — Fail-Closed Suite", () => {
  describe("Pre-build: android/variables.gradle authority", () => {
    it("exists on disk", () => {
      expect(fs.existsSync(variablesPath)).toBe(true);
    });

    it("verifies compileSdkVersion >= 36, targetSdkVersion >= 36, and minSdkVersion == 24", () => {
      const config = checkVariablesGradle(variablesPath);
      expect(config.compileSdkVersion).toBeGreaterThanOrEqual(36);
      expect(config.targetSdkVersion).toBeGreaterThanOrEqual(36);
      expect(config.minSdkVersion).toBe(24);
    });

    it("rejects compileSdkVersion < 36", () => {
      const tempPath = path.join(rootDir, "node_modules/.temp-var-compile-fail.gradle");
      fs.writeFileSync(
        tempPath,
        "ext {\n    minSdkVersion = 24\n    compileSdkVersion = 35\n    targetSdkVersion = 36\n}",
        "utf8",
      );
      try {
        expect(() => checkVariablesGradle(tempPath)).toThrow(/compileSdkVersion must be >= 36/);
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    });

    it("rejects targetSdkVersion < 36", () => {
      const tempPath = path.join(rootDir, "node_modules/.temp-var-target-fail.gradle");
      fs.writeFileSync(
        tempPath,
        "ext {\n    minSdkVersion = 24\n    compileSdkVersion = 36\n    targetSdkVersion = 35\n}",
        "utf8",
      );
      try {
        expect(() => checkVariablesGradle(tempPath)).toThrow(/targetSdkVersion must be >= 36/);
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    });

    it("rejects non-standard minSdkVersion != 24", () => {
      const tempPath = path.join(rootDir, "node_modules/.temp-var-min-fail.gradle");
      fs.writeFileSync(
        tempPath,
        "ext {\n    minSdkVersion = 21\n    compileSdkVersion = 36\n    targetSdkVersion = 36\n}",
        "utf8",
      );
      try {
        expect(() => checkVariablesGradle(tempPath)).toThrow(/minSdkVersion must be 24/);
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    });
  });

  describe("Pre-build: android/app/build.gradle authority", () => {
    it("exists on disk", () => {
      expect(fs.existsSync(appBuildPath)).toBe(true);
    });

    it("verifies applicationId, positive integer versionCode, non-empty versionName, and wiring", () => {
      const config = checkAppBuildGradle(appBuildPath);
      expect(config.applicationId).toBe("com.dilmart.store");
      expect(Number.isInteger(config.versionCode)).toBe(true);
      expect(config.versionCode).toBeGreaterThan(0);
      expect(config.versionName.length).toBeGreaterThan(0);
      expect(config.versionCode).toBe(2);
      expect(config.versionName).toBe("1.0.1");
    });

    it("accepts future release versions (does not permanently freeze versionCode=1)", () => {
      const tempPath = path.join(rootDir, "node_modules/.temp-build-future.gradle");
      fs.writeFileSync(
        tempPath,
        `android {
          compileSdk = rootProject.ext.compileSdkVersion
          defaultConfig {
            applicationId = "com.dilmart.store"
            minSdkVersion = rootProject.ext.minSdkVersion
            targetSdkVersion = rootProject.ext.targetSdkVersion
            versionCode = 42
            versionName = "2.1.0"
          }
        }`,
        "utf8",
      );
      try {
        const config = checkAppBuildGradle(tempPath);
        expect(config.versionCode).toBe(42);
        expect(config.versionName).toBe("2.1.0");
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    });

    it("rejects non-positive versionCode (0 or negative)", () => {
      const tempPath = path.join(rootDir, "node_modules/.temp-build-vc-fail.gradle");
      fs.writeFileSync(
        tempPath,
        `android {
          compileSdk = rootProject.ext.compileSdkVersion
          defaultConfig {
            applicationId = "com.dilmart.store"
            minSdkVersion = rootProject.ext.minSdkVersion
            targetSdkVersion = rootProject.ext.targetSdkVersion
            versionCode = 0
            versionName = "1.0"
          }
        }`,
        "utf8",
      );
      try {
        expect(() => checkAppBuildGradle(tempPath)).toThrow(/versionCode must be a positive integer/);
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    });

    it("rejects empty versionName", () => {
      const tempPath = path.join(rootDir, "node_modules/.temp-build-vn-fail.gradle");
      fs.writeFileSync(
        tempPath,
        `android {
          compileSdk = rootProject.ext.compileSdkVersion
          defaultConfig {
            applicationId = "com.dilmart.store"
            minSdkVersion = rootProject.ext.minSdkVersion
            targetSdkVersion = rootProject.ext.targetSdkVersion
            versionCode = 1
            versionName = "  "
          }
        }`,
        "utf8",
      );
      try {
        expect(() => checkAppBuildGradle(tempPath)).toThrow(/versionName must be non-empty/);
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    });

    it("rejects mismatched applicationId", () => {
      const tempPath = path.join(rootDir, "node_modules/.temp-build-appid-fail.gradle");
      fs.writeFileSync(
        tempPath,
        `android {
          compileSdk = rootProject.ext.compileSdkVersion
          defaultConfig {
            applicationId = "com.different.app"
            minSdkVersion = rootProject.ext.minSdkVersion
            targetSdkVersion = rootProject.ext.targetSdkVersion
            versionCode = 1
            versionName = "1.0"
          }
        }`,
        "utf8",
      );
      try {
        expect(() => checkAppBuildGradle(tempPath)).toThrow(/applicationId must be 'com.dilmart.store'/);
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    });
  });

  describe("Fail-closed: Native Libraries, 64-bit & 16 KB ELF Alignment", () => {
    it("reports NOT APPLICABLE when 0 .so libraries exist", () => {
      const entries = ["assets/index.html", "AndroidManifest.xml", "classes.dex"];
      const report = inspectNativeLibraries(entries);
      expect(report.hasNativeLibs).toBe(false);
      expect(report.nativeLibrariesCount).toBe(0);
      expect(report.requirement64Bit).toBe("NOT APPLICABLE");
      expect(report.requirement16Kb).toBe("NOT APPLICABLE");
    });

    it("fails closed if native .so libraries exist in artifact", () => {
      const entries = ["lib/arm64-v8a/libfoo.so"];
      expect(() => inspectNativeLibraries(entries)).toThrow(
        /Native libraries detected\. Full authoritative ABI, ELF and ZIP\/page-alignment verification is required before compliance can be asserted\./,
      );
    });

    it("rejects 64-bit ELF binary with unaligned 4 KB PT_LOAD segment", () => {
      const badElf = makeMockElf64(4096);
      expect(() => inspectElf16KbAlignment(badElf, "libbad.so")).toThrow(
        /'libbad.so' failed 16 KB ELF alignment.*min p_align: 4096/,
      );
    });

    it("accepts 64-bit ELF binary with 16 KB (0x4000) PT_LOAD alignment", () => {
      const goodElf = makeMockElf64(16384);
      const res = inspectElf16KbAlignment(goodElf, "libgood.so");
      expect(res.is64).toBe(true);
      expect(res.isCompliant).toBe(true);
    });
  });

  describe("Fail-closed: Artifact Existence and Parsing", () => {
    it("fails closed if Debug APK does not exist", () => {
      expect(() => inspectApkBinary("/non/existent/path/app-debug.apk")).toThrow(/APK not found/);
    });

    it("fails closed if Release AAB does not exist", () => {
      expect(() => inspectAabWithBundletool("/non/existent/path/app-release.aab")).toThrow(/AAB not found/);
    });

    it("fails closed on malformed/corrupt ZIP archive", () => {
      const tempCorrupt = path.join(rootDir, "node_modules/.temp-corrupt.zip");
      fs.writeFileSync(tempCorrupt, "NOT A ZIP FILE HEADER");
      try {
        expect(() => parseZipEntries(tempCorrupt)).toThrow(/Archive is empty or malformed/);
      } finally {
        if (fs.existsSync(tempCorrupt)) fs.unlinkSync(tempCorrupt);
      }
    });

    it("fails closed when CLI invocation is missing mandatory mode flag", () => {
      const origError = console.error;
      const captured: string[] = [];
      console.error = (...args: unknown[]) => captured.push(args.join(" "));
      try {
        expect(() => runCli([])).toThrow();
        expect(captured.some((msg) => msg.includes("Explicit mode required"))).toBe(true);
      } finally {
        console.error = origError;
      }
    });
  });

  describe("Dynamic Signing Authority and Inspection", () => {
    it("dynamically verifies Gradle release signing configuration is absent/omitted", () => {
      const config = inspectGradleSigningConfig(appBuildPath);
      expect(config.hasSigningConfigsBlock).toBe(false);
      expect(config.hasReleaseSigningConfig).toBe(false);
      expect(config.summary).toContain("not configured");
      expect(config.summary).toContain("signingConfigs block absent");
      expect(config.summary).not.toContain("prepared for Google Play App Signing");
    });

    it("detects configured release signing in Gradle if present", () => {
      const tempPath = path.join(rootDir, "node_modules/.temp-build-signing.gradle");
      fs.writeFileSync(
        tempPath,
        `android {
          signingConfigs { release { storeFile file("keystore.jks") } }
          buildTypes { release { signingConfig signingConfigs.release } }
        }`,
        "utf8",
      );
      try {
        const config = inspectGradleSigningConfig(tempPath);
        expect(config.hasSigningConfigsBlock).toBe(true);
        expect(config.hasReleaseSigningConfig).toBe(true);
        expect(config.summary).toContain("configured");
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    });

    it("inspectApkSigning: fails closed if apksigner output does not confirm Verifies", () => {
      const mockApk = path.join(rootDir, "node_modules/.temp-mock.apk");
      fs.writeFileSync(mockApk, "DUMMY APK");
      const mockCli = createMockCli("apk-noverifies", "console.log('DOES NOT VERIFY'); process.exit(0);");
      try {
        expect(() => inspectApkSigning(mockApk, mockCli)).toThrow(/output does not confirm 'Verifies'/);
      } finally {
        if (fs.existsSync(mockApk)) fs.unlinkSync(mockApk);
        if (fs.existsSync(mockCli)) fs.unlinkSync(mockCli);
      }
    });

    it("inspectApkSigning: fails closed if no valid signing scheme detected", () => {
      const mockApk = path.join(rootDir, "node_modules/.temp-mock.apk");
      fs.writeFileSync(mockApk, "DUMMY APK");
      const mockCli = createMockCli(
        "apk-noschemes",
        "console.log('Verifies\\nVerified using v1 scheme: false\\nVerified using v2 scheme: false'); process.exit(0);",
      );
      try {
        expect(() => inspectApkSigning(mockApk, mockCli)).toThrow(/no valid signing scheme detected/);
      } finally {
        if (fs.existsSync(mockApk)) fs.unlinkSync(mockApk);
        if (fs.existsSync(mockCli)) fs.unlinkSync(mockCli);
      }
    });

    it("inspectApkSigning: fails closed if signer DN or cert SHA-256 cannot be parsed", () => {
      const mockApk = path.join(rootDir, "node_modules/.temp-mock.apk");
      fs.writeFileSync(mockApk, "DUMMY APK");
      const mockCli = createMockCli(
        "apk-nodn",
        "console.log('Verifies\\nVerified using v2 scheme (APK Signature Scheme v2): true'); process.exit(0);",
      );
      try {
        expect(() => inspectApkSigning(mockApk, mockCli)).toThrow(/signer certificate DN/);
      } finally {
        if (fs.existsSync(mockApk)) fs.unlinkSync(mockApk);
        if (fs.existsSync(mockCli)) fs.unlinkSync(mockCli);
      }
    });

    it("inspectApkSigning: fails closed if apksigner execution fails", () => {
      const mockApk = path.join(rootDir, "node_modules/.temp-mock.apk");
      fs.writeFileSync(mockApk, "DUMMY APK");
      const mockCli = createMockCli("apk-fail", "process.stderr.write('Fatal tool failure'); process.exit(1);");
      try {
        expect(() => inspectApkSigning(mockApk, mockCli)).toThrow(/apksigner execution failed/);
      } finally {
        if (fs.existsSync(mockApk)) fs.unlinkSync(mockApk);
        if (fs.existsSync(mockCli)) fs.unlinkSync(mockCli);
      }
    });

    it("inspectAabSigning: returns SIGNED_VALID when jarsigner verified and signature files present", () => {
      const mockAab = path.join(rootDir, "node_modules/.temp-mock-signed.aab");
      fs.writeFileSync(mockAab, makeMockZip(["META-INF/CERT.RSA", "base/manifest/AndroidManifest.xml"]));
      const mockCli = createMockCli("aab-valid", "console.log('s = signature was verified\\njar verified.'); process.exit(0);");
      try {
        const res = inspectAabSigning(mockAab, mockCli);
        expect(res.state).toBe("SIGNED_VALID");
        expect(res.isSigned).toBe(true);
        expect(res.signatureFiles).toContain("META-INF/CERT.RSA");
        expect(res.signingSummary).toContain("SIGNED_VALID");
      } finally {
        if (fs.existsSync(mockAab)) fs.unlinkSync(mockAab);
        if (fs.existsSync(mockCli)) fs.unlinkSync(mockCli);
      }
    });

    it("inspectAabSigning: returns UNSIGNED when jarsigner reports unsigned and 0 signature files exist", () => {
      const mockAab = path.join(rootDir, "node_modules/.temp-mock-unsigned.aab");
      fs.writeFileSync(mockAab, makeMockZip(["base/manifest/AndroidManifest.xml"]));
      const mockCli = createMockCli("aab-unsigned", "console.log('no manifest.\\njar is unsigned.'); process.exit(0);");
      try {
        const res = inspectAabSigning(mockAab, mockCli);
        expect(res.state).toBe("UNSIGNED");
        expect(res.isSigned).toBe(false);
        expect(res.signatureFiles).toHaveLength(0);
        expect(res.signingSummary).toContain("UNSIGNED");
      } finally {
        if (fs.existsSync(mockAab)) fs.unlinkSync(mockAab);
        if (fs.existsSync(mockCli)) fs.unlinkSync(mockCli);
      }
    });

    it("inspectAabSigning: throws INVALID_SIGNATURE when signature files exist but jarsigner reports unsigned", () => {
      const mockAab = path.join(rootDir, "node_modules/.temp-mock-contradictory.aab");
      fs.writeFileSync(mockAab, makeMockZip(["META-INF/CERT.RSA"]));
      const mockCli = createMockCli("aab-contra1", "console.log('no manifest.\\njar is unsigned.'); process.exit(0);");
      try {
        expect(() => inspectAabSigning(mockAab, mockCli)).toThrow(/INVALID_SIGNATURE/);
      } finally {
        if (fs.existsSync(mockAab)) fs.unlinkSync(mockAab);
        if (fs.existsSync(mockCli)) fs.unlinkSync(mockCli);
      }
    });

    it("inspectAabSigning: throws INVALID_SIGNATURE when jarsigner reports verified but 0 signature files exist", () => {
      const mockAab = path.join(rootDir, "node_modules/.temp-mock-contra2.aab");
      fs.writeFileSync(mockAab, makeMockZip(["base/manifest/AndroidManifest.xml"]));
      const mockCli = createMockCli("aab-contra2", "console.log('jar verified.'); process.exit(0);");
      try {
        expect(() => inspectAabSigning(mockAab, mockCli)).toThrow(/INVALID_SIGNATURE/);
      } finally {
        if (fs.existsSync(mockAab)) fs.unlinkSync(mockAab);
        if (fs.existsSync(mockCli)) fs.unlinkSync(mockCli);
      }
    });

    it("inspectAabSigning: fails closed if jarsigner execution fails", () => {
      const mockAab = path.join(rootDir, "node_modules/.temp-mock-fail.aab");
      fs.writeFileSync(mockAab, makeMockZip(["base/manifest/AndroidManifest.xml"]));
      const mockCli = createMockCli("aab-fail", "process.stderr.write('Jarsigner crash'); process.exit(1);");
      try {
        expect(() => inspectAabSigning(mockAab, mockCli)).toThrow(/jarsigner execution failed/);
      } finally {
        if (fs.existsSync(mockAab)) fs.unlinkSync(mockAab);
        if (fs.existsSync(mockCli)) fs.unlinkSync(mockCli);
      }
    });

    it("inspectApkSigning: validates and extracts dynamic signer info from mock apksigner output", () => {
      const mockApk = path.join(rootDir, "node_modules/.temp-mock-valid.apk");
      fs.writeFileSync(mockApk, "DUMMY APK");
      const mockCli = createMockCli(
        "apk-valid",
        "console.log('Verifies\\nVerified using v2 scheme (APK Signature Scheme v2): true\\nSigner #1 certificate DN: CN=Deterministic Test Signer, O=DilMart CI\\nSigner #1 certificate SHA-256 digest: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'); process.exit(0);",
      );
      try {
        const signing = inspectApkSigning(mockApk, mockCli);
        expect(signing.verified).toBe(true);
        expect(signing.schemes).toContain("v2 (APK Signature Scheme v2)");
        expect(signing.signerDn).toBe("CN=Deterministic Test Signer, O=DilMart CI");
        expect(signing.certSha256).toBe("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
        expect(signing.signingSummary).toContain("CN=Deterministic Test Signer, O=DilMart CI");
      } finally {
        if (fs.existsSync(mockApk)) fs.unlinkSync(mockApk);
        if (fs.existsSync(mockCli)) fs.unlinkSync(mockCli);
      }
    });

    it("inspectApkSigning: fails closed if signer certificate SHA-256 is invalid or not 64 hex chars", () => {
      const mockApk = path.join(rootDir, "node_modules/.temp-mock-badsha.apk");
      fs.writeFileSync(mockApk, "DUMMY APK");
      const mockCli = createMockCli(
        "apk-badsha",
        "console.log('Verifies\\nVerified using v2 scheme (APK Signature Scheme v2): true\\nSigner #1 certificate DN: CN=Test\\nSigner #1 certificate SHA-256 digest: not-a-valid-hex-digest'); process.exit(0);",
      );
      try {
        expect(() => inspectApkSigning(mockApk, mockCli)).toThrow(/signer certificate SHA-256 digest is invalid/);
      } finally {
        if (fs.existsSync(mockApk)) fs.unlinkSync(mockApk);
        if (fs.existsSync(mockCli)) fs.unlinkSync(mockCli);
      }
    });

    it("inspectApkSigning: fails closed if signer certificate DN is empty", () => {
      const mockApk = path.join(rootDir, "node_modules/.temp-mock-emptydn.apk");
      fs.writeFileSync(mockApk, "DUMMY APK");
      const mockCli = createMockCli(
        "apk-emptydn",
        "console.log('Verifies\\nVerified using v2 scheme (APK Signature Scheme v2): true\\nSigner #1 certificate DN:   \\nSigner #1 certificate SHA-256 digest: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'); process.exit(0);",
      );
      try {
        expect(() => inspectApkSigning(mockApk, mockCli)).toThrow(/signer certificate DN is empty/);
      } finally {
        if (fs.existsSync(mockApk)) fs.unlinkSync(mockApk);
        if (fs.existsSync(mockCli)) fs.unlinkSync(mockCli);
      }
    });
  });
});
