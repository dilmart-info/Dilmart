/**
 * Automated CI Test Suite for Android 16 / Google Play API 36 Compliance Guard.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  checkVariablesGradle,
  checkAppBuildGradle,
  findAapt2,
  inspectApkBinary,
  inspectAabArchive,
  parseZipEntries,
} from "./check-android-api-compliance.mjs";

const rootDir = path.resolve(__dirname, "../..");
const variablesPath = path.join(rootDir, "android/variables.gradle");
const appBuildPath = path.join(rootDir, "android/app/build.gradle");
const debugApkPath = path.join(rootDir, "android/app/build/outputs/apk/debug/app-debug.apk");
const releaseAabPath = path.join(rootDir, "android/app/build/outputs/bundle/release/app-release.aab");

describe("Android 16 / API 36 Compliance Guard", () => {
  describe("android/variables.gradle authority", () => {
    it("exists on disk", () => {
      expect(fs.existsSync(variablesPath)).toBe(true);
    });

    it("verifies compileSdkVersion >= 36, targetSdkVersion >= 36, and minSdkVersion == 24", () => {
      const config = checkVariablesGradle(variablesPath);
      expect(config.compileSdkVersion).toBeGreaterThanOrEqual(36);
      expect(config.targetSdkVersion).toBeGreaterThanOrEqual(36);
      expect(config.minSdkVersion).toBe(24);
    });

    it("rejects outdated compileSdk < 36", () => {
      const tempPath = path.join(rootDir, "node_modules/.temp-variables-test.gradle");
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

    it("rejects outdated targetSdk < 36", () => {
      const tempPath = path.join(rootDir, "node_modules/.temp-variables-test.gradle");
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
      const tempPath = path.join(rootDir, "node_modules/.temp-variables-test.gradle");
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

  describe("android/app/build.gradle authority", () => {
    it("exists on disk", () => {
      expect(fs.existsSync(appBuildPath)).toBe(true);
    });

    it("verifies applicationId, positive integer versionCode, non-empty versionName, and wiring", () => {
      const config = checkAppBuildGradle(appBuildPath);
      expect(config.applicationId).toBe("com.DilMart.store");
      expect(Number.isInteger(config.versionCode)).toBe(true);
      expect(config.versionCode).toBeGreaterThan(0);
      expect(config.versionName.length).toBeGreaterThan(0);
      // Observed baseline values for first release
      expect(config.versionCode).toBe(1);
      expect(config.versionName).toBe("1.0");
    });

    it("accepts future release versions (does not freeze versionCode=1 or versionName=1.0)", () => {
      const tempPath = path.join(rootDir, "node_modules/.temp-build-test.gradle");
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

    it("rejects invalid non-positive versionCode", () => {
      const tempPath = path.join(rootDir, "node_modules/.temp-build-test.gradle");
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

    it("rejects mismatched applicationId", () => {
      const tempPath = path.join(rootDir, "node_modules/.temp-build-test.gradle");
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

  describe("Packaged Android Artifacts Inspection (if built)", () => {
    it("locates aapt2 in Android build-tools", () => {
      const aapt2 = findAapt2();
      expect(aapt2).not.toBeNull();
      expect(fs.existsSync(aapt2!)).toBe(true);
    });

    it("inspects Debug APK binary badging and archive", () => {
      if (!fs.existsSync(debugApkPath)) {
        return; // Skip if APK not generated in current environment
      }

      const report = inspectApkBinary(debugApkPath);
      expect(report.packageName).toBe("com.DilMart.store");
      expect(report.compileSdkVersion).toBeGreaterThanOrEqual(36);
      expect(report.targetSdkVersion).toBeGreaterThanOrEqual(36);
      expect(report.minSdkVersion).toBe(24);
      expect(report.versionCode).toBe(1);
      expect(report.versionName).toBe("1.0");

      // 64-bit and 16 KB page-size compliance
      expect(report.nativeLibrariesCount).toBe(0);
      expect(report.requirement64Bit).toBe("NOT APPLICABLE");
      expect(report.requirement16Kb).toBe("NOT APPLICABLE");
    });

    it("inspects Release AAB archive structure", () => {
      if (!fs.existsSync(releaseAabPath)) {
        return; // Skip if AAB not generated in current environment
      }

      const report = inspectAabArchive(releaseAabPath);
      expect(report.totalEntries).toBeGreaterThan(0);
      expect(report.nativeLibrariesCount).toBe(0);
      expect(report.requirement64Bit).toBe("NOT APPLICABLE");
      expect(report.requirement16Kb).toBe("NOT APPLICABLE");
    });

    it("confirms 0 .so native libraries in APK and AAB archive inventories", () => {
      if (fs.existsSync(debugApkPath)) {
        const apkEntries = parseZipEntries(debugApkPath);
        const apkSo = apkEntries.filter((e) => e.endsWith(".so"));
        expect(apkSo).toHaveLength(0);
      }
      if (fs.existsSync(releaseAabPath)) {
        const aabEntries = parseZipEntries(releaseAabPath);
        const aabSo = aabEntries.filter((e) => e.endsWith(".so"));
        expect(aabSo).toHaveLength(0);
      }
    });
  });
});
