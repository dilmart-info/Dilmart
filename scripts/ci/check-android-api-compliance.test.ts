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
 * - Real built-artifact integration tests (using it.runIf to report explicit skips if unbuilt)
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  checkVariablesGradle,
  checkAppBuildGradle,
  findAapt2,
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
const debugApkPath = path.join(rootDir, "android/app/build/outputs/apk/debug/app-debug.apk");
const releaseAabPath = path.join(rootDir, "android/app/build/outputs/bundle/release/app-release.aab");

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
      expect(config.applicationId).toBe("com.DilMart.store");
      expect(Number.isInteger(config.versionCode)).toBe(true);
      expect(config.versionCode).toBeGreaterThan(0);
      expect(config.versionName.length).toBeGreaterThan(0);
      expect(config.versionCode).toBe(1);
      expect(config.versionName).toBe("1.0");
    });

    it("accepts future release versions (does not permanently freeze versionCode=1)", () => {
      const tempPath = path.join(rootDir, "node_modules/.temp-build-future.gradle");
      fs.writeFileSync(
        tempPath,
        `android {
          compileSdk = rootProject.ext.compileSdkVersion
          defaultConfig {
            applicationId = "com.DilMart.store"
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
            applicationId = "com.DilMart.store"
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
            applicationId = "com.DilMart.store"
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
        expect(() => checkAppBuildGradle(tempPath)).toThrow(/applicationId must be 'com.DilMart.store'/);
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

    it("fails closed if .so libraries exist but no buffer reader is provided", () => {
      const entries = ["lib/arm64-v8a/libfoo.so"];
      expect(() => inspectNativeLibraries(entries, null)).toThrow(
        /authoritative ELF buffer reader was not provided/,
      );
    });

    it("fails closed if 32-bit armeabi-v7a has no 64-bit arm64-v8a counterpart", () => {
      const entries = ["lib/armeabi-v7a/libfoo.so"];
      const dummyReader = () => Buffer.alloc(120);
      expect(() => inspectNativeLibraries(entries, dummyReader)).toThrow(
        /64-bit requirement violation: 'libfoo.so' has 32-bit armeabi-v7a but missing arm64-v8a/,
      );
    });

    it("fails closed if 32-bit x86 has no 64-bit x86_64 counterpart", () => {
      const entries = ["lib/x86/libfoo.so"];
      const dummyReader = () => Buffer.alloc(120);
      expect(() => inspectNativeLibraries(entries, dummyReader)).toThrow(
        /64-bit requirement violation: 'libfoo.so' has 32-bit x86 but missing x86_64/,
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

  describe("Real Artifact Verification (Integration)", () => {
    it("locates authoritative aapt2 binary", () => {
      const aapt2 = findAapt2();
      expect(aapt2).not.toBeNull();
      expect(fs.existsSync(aapt2!)).toBe(true);
    });

    it.runIf(fs.existsSync(debugApkPath))("inspects built Debug APK binary badging", () => {
      const report = inspectApkBinary(debugApkPath);
      expect(report.packageName).toBe("com.DilMart.store");
      expect(report.compileSdkVersion).toBeGreaterThanOrEqual(36);
      expect(report.targetSdkVersion).toBeGreaterThanOrEqual(36);
      expect(report.minSdkVersion).toBe(24);
      expect(report.versionCode).toBe(1);
      expect(report.versionName).toBe("1.0");
      expect(report.nativeLibrariesCount).toBe(0);
      expect(report.requirement64Bit).toBe("NOT APPLICABLE");
      expect(report.requirement16Kb).toBe("NOT APPLICABLE");
      expect(report.signingState).toContain("debug-signed");
      expect(report.sha256).toHaveLength(64);
      expect(report.sizeBytes).toBeGreaterThan(0);
    });

    it.runIf(fs.existsSync(releaseAabPath))("inspects built Release AAB with Bundletool", () => {
      const report = inspectAabWithBundletool(releaseAabPath);
      expect(report.packageName).toBe("com.DilMart.store");
      expect(report.compileSdkVersion).toBeGreaterThanOrEqual(36);
      expect(report.targetSdkVersion).toBeGreaterThanOrEqual(36);
      expect(report.minSdkVersion).toBe(24);
      expect(report.versionCode).toBe(1);
      expect(report.versionName).toBe("1.0");
      expect(report.nativeLibrariesCount).toBe(0);
      expect(report.requirement64Bit).toBe("NOT APPLICABLE");
      expect(report.requirement16Kb).toBe("NOT APPLICABLE");
      expect(report.bundletoolValidation).toContain("VALIDATED");
      expect(report.signingState).toContain("unsigned");
      expect(report.productionPlaySigning).toBe("not configured");
      expect(report.sha256).toHaveLength(64);
      expect(report.sizeBytes).toBeGreaterThan(0);
    });
  });
});
