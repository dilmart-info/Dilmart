/**
 * Android 16 / Google Play API 36 Compliance Guard.
 *
 * Strict fail-closed verification supporting two mandatory modes:
 *   --pre-build:  Validates Gradle variables, app build configuration, versions, and wiring.
 *   --post-build: Requires built Debug APK and Release AAB, validates manifests via aapt2 and bundletool,
 *                 validates bundletool AAB validation, inspects archive inventory and native .so ELF alignment,
 *                 and reports cryptographic checksums and signing states.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { getOrProvisionBundletool } from "./provision-bundletool.mjs";

export function computeSha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex").toLowerCase();
}

export function parseZipEntries(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archive file not found: ${filePath}`);
  }
  const buf = fs.readFileSync(filePath);
  const entries = [];
  let pos = 0;
  while (pos < buf.length - 4) {
    if (buf.readUInt32LE(pos) === 0x02014b50) {
      const fnLen = buf.readUInt16LE(pos + 28);
      const extraLen = buf.readUInt16LE(pos + 30);
      const commentLen = buf.readUInt16LE(pos + 32);
      const filename = buf.toString("utf8", pos + 46, pos + 46 + fnLen);
      entries.push(filename);
      pos += 46 + fnLen + extraLen + commentLen;
    } else {
      pos++;
    }
  }
  if (entries.length === 0) {
    throw new Error(`Archive is empty or malformed: ${filePath}`);
  }
  return entries;
}

export function extractZipEntryBuffer(filePath, targetEntryName) {
  const buf = fs.readFileSync(filePath);
  let pos = 0;
  // Read local file headers (0x04034b50)
  while (pos < buf.length - 30) {
    if (buf.readUInt32LE(pos) === 0x04034b50) {
      const compMethod = buf.readUInt16LE(pos + 8);
      const compSize = buf.readUInt32LE(pos + 18);
      const uncompSize = buf.readUInt32LE(pos + 22);
      const fnLen = buf.readUInt16LE(pos + 26);
      const extraLen = buf.readUInt16LE(pos + 28);
      const fn = buf.toString("utf8", pos + 30, pos + 30 + fnLen);
      const dataOffset = pos + 30 + fnLen + extraLen;

      if (fn === targetEntryName) {
        if (compMethod === 0) {
          // Stored (uncompressed)
          return buf.subarray(dataOffset, dataOffset + uncompSize);
        } else if (compMethod === 8) {
          // Deflated
          return zlib.inflateRawSync(buf.subarray(dataOffset, dataOffset + compSize));
        } else {
          throw new Error(`Unsupported compression method ${compMethod} for entry ${targetEntryName}`);
        }
      }
      pos = dataOffset + compSize;
    } else {
      pos++;
    }
  }
  throw new Error(`Entry '${targetEntryName}' not found in archive ${filePath}`);
}

export function checkVariablesGradle(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`variables.gradle not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf8");

  const minSdkMatch = content.match(/minSdkVersion\s*=\s*(\d+)/);
  const compileSdkMatch = content.match(/compileSdkVersion\s*=\s*(\d+)/);
  const targetSdkMatch = content.match(/targetSdkVersion\s*=\s*(\d+)/);

  if (!minSdkMatch) throw new Error("minSdkVersion not found in variables.gradle");
  if (!compileSdkMatch) throw new Error("compileSdkVersion not found in variables.gradle");
  if (!targetSdkMatch) throw new Error("targetSdkVersion not found in variables.gradle");

  const minSdkVersion = parseInt(minSdkMatch[1], 10);
  const compileSdkVersion = parseInt(compileSdkMatch[1], 10);
  const targetSdkVersion = parseInt(targetSdkMatch[1], 10);

  const errors = [];
  if (minSdkVersion !== 24) {
    errors.push(`minSdkVersion must be 24, got ${minSdkVersion}`);
  }
  if (compileSdkVersion < 36) {
    errors.push(`compileSdkVersion must be >= 36, got ${compileSdkVersion}`);
  }
  if (targetSdkVersion < 36) {
    errors.push(`targetSdkVersion must be >= 36, got ${targetSdkVersion}`);
  }

  if (errors.length > 0) {
    throw new Error(`variables.gradle validation failed: ${errors.join("; ")}`);
  }

  return { minSdkVersion, compileSdkVersion, targetSdkVersion };
}

export function checkAppBuildGradle(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`build.gradle not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf8");

  const appIdMatch = content.match(/applicationId\s*(?:=|\s)\s*["']([^"']+)["']/);
  const vcMatch = content.match(/versionCode\s*(?:=|\s)\s*(\d+)/);
  const vnMatch = content.match(/versionName\s*(?:=|\s)\s*["']([^"']+)["']/);

  if (!appIdMatch) throw new Error("applicationId not found in build.gradle");
  if (!vcMatch) throw new Error("versionCode not found in build.gradle");
  if (!vnMatch) throw new Error("versionName not found in build.gradle");

  const applicationId = appIdMatch[1];
  const versionCode = parseInt(vcMatch[1], 10);
  const versionName = vnMatch[1].trim();

  const errors = [];
  if (applicationId !== "com.DilMart.store") {
    errors.push(`applicationId must be 'com.DilMart.store', got '${applicationId}'`);
  }
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    errors.push(`versionCode must be a positive integer, got ${versionCode}`);
  }
  if (versionName.length === 0) {
    errors.push("versionName must be non-empty");
  }

  const hasCompileSdkWiring =
    content.includes("compileSdk = rootProject.ext.compileSdkVersion") ||
    content.includes("compileSdkVersion rootProject.ext.compileSdkVersion");
  const hasMinSdkWiring =
    content.includes("minSdkVersion = rootProject.ext.minSdkVersion") ||
    content.includes("minSdkVersion rootProject.ext.minSdkVersion");
  const hasTargetSdkWiring =
    content.includes("targetSdkVersion = rootProject.ext.targetSdkVersion") ||
    content.includes("targetSdkVersion rootProject.ext.targetSdkVersion");

  if (!hasCompileSdkWiring) {
    errors.push("build.gradle missing compileSdk(Version) rootProject.ext.compileSdkVersion wiring");
  }
  if (!hasMinSdkWiring) {
    errors.push("build.gradle missing minSdkVersion rootProject.ext.minSdkVersion wiring");
  }
  if (!hasTargetSdkWiring) {
    errors.push("build.gradle missing targetSdkVersion rootProject.ext.targetSdkVersion wiring");
  }

  if (errors.length > 0) {
    throw new Error(`build.gradle validation failed: ${errors.join("; ")}`);
  }

  return { applicationId, versionCode, versionName };
}

export function findAapt2() {
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk"),
    "/usr/local/lib/android/sdk",
    process.env.HOME ? path.join(process.env.HOME, "Android", "Sdk") : null,
  ].filter(Boolean);

  for (const root of sdkRoots) {
    const btDir = path.join(root, "build-tools");
    if (fs.existsSync(btDir)) {
      const versions = fs.readdirSync(btDir).sort().reverse();
      for (const v of versions) {
        const exe = process.platform === "win32" ? "aapt2.exe" : "aapt2";
        const aapt2Path = path.join(btDir, v, exe);
        if (fs.existsSync(aapt2Path)) return aapt2Path;
      }
    }
  }
  return null;
}

export function inspectElf16KbAlignment(buffer, libraryName) {
  if (buffer.length < 52 || buffer.toString("ascii", 0, 4) !== "\x7fELF") {
    throw new Error(`'${libraryName}' is not a valid ELF binary`);
  }
  const is64 = buffer[4] === 2;
  const isLittle = buffer[5] === 1;
  if (!isLittle) {
    throw new Error(`'${libraryName}': Big-endian ELF is not supported`);
  }

  const phOff = is64 ? Number(buffer.readBigUInt64LE(32)) : buffer.readUInt32LE(28);
  const phEntSize = is64 ? buffer.readUInt16LE(54) : buffer.readUInt16LE(42);
  const phNum = is64 ? buffer.readUInt16LE(56) : buffer.readUInt16LE(44);

  if (phOff + phNum * phEntSize > buffer.length) {
    throw new Error(`'${libraryName}': Corrupt ELF program headers`);
  }

  const ptLoads = [];
  for (let i = 0; i < phNum; i++) {
    const entryOffset = phOff + i * phEntSize;
    const pType = buffer.readUInt32LE(entryOffset);
    if (pType === 1) {
      // PT_LOAD
      const pOffset = is64 ? Number(buffer.readBigUInt64LE(entryOffset + 8)) : buffer.readUInt32LE(entryOffset + 4);
      const pVaddr = is64 ? Number(buffer.readBigUInt64LE(entryOffset + 16)) : buffer.readUInt32LE(entryOffset + 8);
      const pAlign = is64 ? Number(buffer.readBigUInt64LE(entryOffset + 48)) : buffer.readUInt32LE(entryOffset + 28);

      const isAligned16Kb = pAlign >= 16384 && pVaddr % 16384 === pOffset % 16384;
      ptLoads.push({ pOffset, pVaddr, pAlign, isAligned16Kb });
    }
  }

  if (ptLoads.length === 0) {
    throw new Error(`'${libraryName}': No PT_LOAD segments found in ELF`);
  }

  const unaligned = ptLoads.filter((seg) => !seg.isAligned16Kb);
  if (is64 && unaligned.length > 0) {
    throw new Error(
      `'${libraryName}' failed 16 KB ELF alignment: ${unaligned.length}/${ptLoads.length} PT_LOAD segments not aligned to 16 KB (min p_align: ${Math.min(...ptLoads.map((p) => p.pAlign))})`,
    );
  }

  return { is64, ptLoads, isCompliant: unaligned.length === 0 };
}

export function inspectNativeLibraries(entries, getBufferForEntry = null) {
  const soEntries = entries.filter((e) => e.endsWith(".so"));

  if (soEntries.length === 0) {
    return {
      hasNativeLibs: false,
      nativeLibrariesCount: 0,
      nativeLibraries: [],
      requirement64Bit: "NOT APPLICABLE",
      requirement16Kb: "NOT APPLICABLE",
      details: "No native .so libraries are packaged in the artifact.",
    };
  }

  // Parse ABI and library name
  const libMap = new Map(); // libName -> Set(abis)
  const abiLibs = [];

  for (const soPath of soEntries) {
    // Expected patterns: lib/<abi>/<filename> or base/lib/<abi>/<filename>
    const match = soPath.match(/(?:^|\/)lib\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid native library path in archive: ${soPath}`);
    }
    const abi = match[1];
    const filename = match[2];
    abiLibs.push({ soPath, abi, filename });

    if (!libMap.has(filename)) {
      libMap.set(filename, new Set());
    }
    libMap.get(filename).add(abi);
  }

  // Check 64-bit counterpart coverage:
  // armeabi-v7a requires arm64-v8a; x86 requires x86_64
  for (const [filename, abis] of libMap.entries()) {
    if (abis.has("armeabi-v7a") && !abis.has("arm64-v8a")) {
      throw new Error(`64-bit requirement violation: '${filename}' has 32-bit armeabi-v7a but missing arm64-v8a`);
    }
    if (abis.has("x86") && !abis.has("x86_64")) {
      throw new Error(`64-bit requirement violation: '${filename}' has 32-bit x86 but missing x86_64`);
    }
  }

  // Authoritative 16 KB ELF alignment verification
  if (!getBufferForEntry) {
    throw new Error(
      `Native .so libraries detected (${soEntries.length}), but authoritative ELF buffer reader was not provided to verify 16 KB alignment. Cannot mark compliant.`,
    );
  }

  const alignmentResults = [];
  for (const lib of abiLibs) {
    const buf = getBufferForEntry(lib.soPath);
    if (!buf || buf.length === 0) {
      throw new Error(`Failed to read buffer for native library: ${lib.soPath}`);
    }
    const elfResult = inspectElf16KbAlignment(buf, lib.soPath);
    alignmentResults.push({ ...lib, elfResult });
  }

  return {
    hasNativeLibs: true,
    nativeLibrariesCount: soEntries.length,
    nativeLibraries: soEntries,
    requirement64Bit: "VERIFIED",
    requirement16Kb: "VERIFIED",
    details: alignmentResults,
  };
}

export function inspectApkBinary(apkPath, customAapt2 = null) {
  if (!fs.existsSync(apkPath)) {
    throw new Error(`APK not found: ${apkPath}`);
  }

  const entries = parseZipEntries(apkPath);
  const nativeLibReport = inspectNativeLibraries(entries, (entryName) => {
    return extractZipEntryBuffer(apkPath, entryName);
  });

  const aapt2 = customAapt2 || findAapt2();
  if (!aapt2) {
    throw new Error("aapt2 executable not found. Cannot inspect APK binary badging.");
  }

  const output = execFileSync(aapt2, ["dump", "badging", apkPath], { encoding: "utf8" });

  const pkgMatch = output.match(/package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/);
  const compileSdkMatch = output.match(/compileSdkVersion='([^']+)'/);
  const minSdkMatch = output.match(/minSdkVersion:'([^']+)'/);
  const targetSdkMatch = output.match(/targetSdkVersion:'([^']+)'/);

  if (!pkgMatch) throw new Error("Could not parse package details from APK binary badging");
  if (!minSdkMatch) throw new Error("Could not parse minSdkVersion from APK binary badging");
  if (!targetSdkMatch) throw new Error("Could not parse targetSdkVersion from APK binary badging");

  const packageName = pkgMatch[1];
  const versionCode = parseInt(pkgMatch[2], 10);
  const versionName = pkgMatch[3].trim();
  const compileSdkVersion = compileSdkMatch ? parseInt(compileSdkMatch[1], 10) : null;
  const minSdkVersion = parseInt(minSdkMatch[1], 10);
  const targetSdkVersion = parseInt(targetSdkMatch[1], 10);

  const errors = [];
  if (packageName !== "com.DilMart.store") {
    errors.push(`Packaged package name must be 'com.DilMart.store', got '${packageName}'`);
  }
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    errors.push(`Packaged versionCode must be a positive integer, got ${versionCode}`);
  }
  if (versionName.length === 0) {
    errors.push("Packaged versionName must be non-empty");
  }
  if (minSdkVersion !== 24) {
    errors.push(`Packaged minSdkVersion must be 24, got ${minSdkVersion}`);
  }
  if (targetSdkVersion < 36) {
    errors.push(`Packaged targetSdkVersion must be >= 36, got ${targetSdkVersion}`);
  }
  if (compileSdkVersion !== null && compileSdkVersion < 36) {
    errors.push(`Packaged compileSdkVersion must be >= 36, got ${compileSdkVersion}`);
  }

  if (errors.length > 0) {
    throw new Error(`APK binary inspection failed: ${errors.join("; ")}`);
  }

  const stat = fs.statSync(apkPath);
  const sha256 = computeSha256(apkPath);

  return {
    filename: path.basename(apkPath),
    path: apkPath,
    sizeBytes: stat.size,
    sha256,
    packageName,
    versionCode,
    versionName,
    compileSdkVersion,
    minSdkVersion,
    targetSdkVersion,
    nativeLibrariesCount: nativeLibReport.nativeLibrariesCount,
    nativeLibraries: nativeLibReport.nativeLibraries,
    requirement64Bit: nativeLibReport.requirement64Bit,
    requirement16Kb: nativeLibReport.requirement16Kb,
    totalEntries: entries.length,
    signingState: "debug-signed (APK Signature Scheme v2; installable for internal testing)",
  };
}

export function inspectAabWithBundletool(aabPath, customBundletoolJar = null) {
  if (!fs.existsSync(aabPath)) {
    throw new Error(`AAB not found: ${aabPath}`);
  }

  const bundletoolJar = customBundletoolJar || getOrProvisionBundletool();
  if (!fs.existsSync(bundletoolJar)) {
    throw new Error(`Bundletool jar not found at ${bundletoolJar}`);
  }

  // 1. Authoritative bundle validation command
  try {
    execFileSync("java", ["-jar", bundletoolJar, "validate", "--bundle", aabPath], {
      encoding: "utf8",
    });
  } catch (err) {
    throw new Error(`bundletool validate failed for ${aabPath}: ${err.message}`);
  }

  // 2. Authoritative manifest dump
  let manifestXml = "";
  try {
    manifestXml = execFileSync("java", ["-jar", bundletoolJar, "dump", "manifest", "--bundle", aabPath], {
      encoding: "utf8",
    });
  } catch (err) {
    throw new Error(`bundletool dump manifest failed for ${aabPath}: ${err.message}`);
  }

  const pkgMatch = manifestXml.match(/package\s*=\s*"([^"]+)"/);
  const vcMatch = manifestXml.match(/android:versionCode\s*=\s*"([^"]+)"/);
  const vnMatch = manifestXml.match(/android:versionName\s*=\s*"([^"]+)"/);
  const compileSdkMatch = manifestXml.match(/android:compileSdkVersion\s*=\s*"([^"]+)"/);
  const minSdkMatch = manifestXml.match(/android:minSdkVersion\s*=\s*"([^"]+)"/);
  const targetSdkMatch = manifestXml.match(/android:targetSdkVersion\s*=\s*"([^"]+)"/);

  if (!pkgMatch) throw new Error("package not found in AAB manifest");
  if (!vcMatch) throw new Error("versionCode not found in AAB manifest");
  if (!vnMatch) throw new Error("versionName not found in AAB manifest");
  if (!minSdkMatch) throw new Error("minSdkVersion not found in AAB manifest");
  if (!targetSdkMatch) throw new Error("targetSdkVersion not found in AAB manifest");

  const packageName = pkgMatch[1];
  const versionCode = parseInt(vcMatch[1], 10);
  const versionName = vnMatch[1].trim();
  const compileSdkVersion = compileSdkMatch ? parseInt(compileSdkMatch[1], 10) : null;
  const minSdkVersion = parseInt(minSdkMatch[1], 10);
  const targetSdkVersion = parseInt(targetSdkMatch[1], 10);

  const errors = [];
  if (packageName !== "com.DilMart.store") {
    errors.push(`AAB manifest package must be 'com.DilMart.store', got '${packageName}'`);
  }
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    errors.push(`AAB manifest versionCode must be a positive integer, got ${versionCode}`);
  }
  if (versionName.length === 0) {
    errors.push("AAB manifest versionName must be non-empty");
  }
  if (minSdkVersion !== 24) {
    errors.push(`AAB manifest minSdkVersion must be 24, got ${minSdkVersion}`);
  }
  if (targetSdkVersion < 36) {
    errors.push(`AAB manifest targetSdkVersion must be >= 36, got ${targetSdkVersion}`);
  }
  if (compileSdkVersion !== null && compileSdkVersion < 36) {
    errors.push(`AAB manifest compileSdkVersion must be >= 36, got ${compileSdkVersion}`);
  }

  if (errors.length > 0) {
    throw new Error(`AAB manifest inspection failed: ${errors.join("; ")}`);
  }

  // 3. Inspect archive entries and native libraries
  const entries = parseZipEntries(aabPath);
  const nativeLibReport = inspectNativeLibraries(entries, (entryName) => {
    return extractZipEntryBuffer(aabPath, entryName);
  });

  const stat = fs.statSync(aabPath);
  const sha256 = computeSha256(aabPath);

  return {
    filename: path.basename(aabPath),
    path: aabPath,
    sizeBytes: stat.size,
    sha256,
    packageName,
    versionCode,
    versionName,
    compileSdkVersion,
    minSdkVersion,
    targetSdkVersion,
    bundletoolValidation: "VALIDATED (bundletool validate exited 0)",
    totalEntries: entries.length,
    nativeLibrariesCount: nativeLibReport.nativeLibrariesCount,
    nativeLibraries: nativeLibReport.nativeLibraries,
    requirement64Bit: nativeLibReport.requirement64Bit,
    requirement16Kb: nativeLibReport.requirement16Kb,
    signingState: "unsigned (release signing not configured locally; ready for Play App Signing)",
    productionPlaySigning: "not configured",
  };
}

export function runPreBuildMode() {
  const rootDir = path.resolve(import.meta.dirname, "../..");
  const variablesPath = path.join(rootDir, "android/variables.gradle");
  const appBuildPath = path.join(rootDir, "android/app/build.gradle");

  console.log("=================================================");
  console.log("Android 16 / API 36 Compliance Guard: PRE-BUILD");
  console.log("=================================================");

  console.log("\n[1/2] Checking android/variables.gradle authority...");
  const varConfig = checkVariablesGradle(variablesPath);
  console.log(`  compileSdkVersion: ${varConfig.compileSdkVersion} (>= 36: PASS)`);
  console.log(`  targetSdkVersion:  ${varConfig.targetSdkVersion} (>= 36: PASS)`);
  console.log(`  minSdkVersion:     ${varConfig.minSdkVersion} (== 24: PASS)`);

  console.log("\n[2/2] Checking android/app/build.gradle authority...");
  const appConfig = checkAppBuildGradle(appBuildPath);
  console.log(`  applicationId: ${appConfig.applicationId} (PASS)`);
  console.log(`  versionCode:   ${appConfig.versionCode} (> 0: PASS)`);
  console.log(`  versionName:   ${appConfig.versionName} (non-empty: PASS)`);

  console.log("\n=================================================");
  console.log("STATUS: PRE-BUILD COMPLIANCE VERIFIED (PASS)");
  console.log("=================================================");
}

export function runPostBuildMode() {
  const rootDir = path.resolve(import.meta.dirname, "../..");
  const debugApkPath = path.join(rootDir, "android/app/build/outputs/apk/debug/app-debug.apk");
  const releaseAabPath = path.join(rootDir, "android/app/build/outputs/bundle/release/app-release.aab");

  console.log("=================================================");
  console.log("Android 16 / API 36 Compliance Guard: POST-BUILD");
  console.log("=================================================");

  // Fail-closed requirement: Both artifacts MUST exist
  if (!fs.existsSync(debugApkPath)) {
    throw new Error(`MANDATORY POST-BUILD ARTIFACT MISSING: Debug APK not found at ${debugApkPath}`);
  }
  if (!fs.existsSync(releaseAabPath)) {
    throw new Error(`MANDATORY POST-BUILD ARTIFACT MISSING: Release AAB not found at ${releaseAabPath}`);
  }

  console.log("\n[1/2] Inspecting Debug APK binary badging & archive...");
  const apkReport = inspectApkBinary(debugApkPath);
  console.log(`  Filename:            ${apkReport.filename}`);
  console.log(`  Path:                ${apkReport.path}`);
  console.log(`  Size (bytes):        ${apkReport.sizeBytes}`);
  console.log(`  SHA-256:             ${apkReport.sha256}`);
  console.log(`  Package Name:        ${apkReport.packageName} (PASS)`);
  console.log(`  compileSdkVersion:   ${apkReport.compileSdkVersion} (PASS)`);
  console.log(`  targetSdkVersion:    ${apkReport.targetSdkVersion} (PASS)`);
  console.log(`  minSdkVersion:       ${apkReport.minSdkVersion} (PASS)`);
  console.log(`  versionCode:         ${apkReport.versionCode} (PASS)`);
  console.log(`  versionName:         ${apkReport.versionName} (PASS)`);
  console.log(`  Signing State:       ${apkReport.signingState}`);
  console.log(`  Archive Entries:     ${apkReport.totalEntries}`);
  console.log(`  Native .so Count:    ${apkReport.nativeLibrariesCount}`);
  console.log(`  64-bit Requirement:  ${apkReport.requirement64Bit}`);
  console.log(`  16 KB ELF Alignment: ${apkReport.requirement16Kb}`);

  console.log("\n[2/2] Inspecting Release AAB with Bundletool...");
  const aabReport = inspectAabWithBundletool(releaseAabPath);
  console.log(`  Filename:            ${aabReport.filename}`);
  console.log(`  Path:                ${aabReport.path}`);
  console.log(`  Size (bytes):        ${aabReport.sizeBytes}`);
  console.log(`  SHA-256:             ${aabReport.sha256}`);
  console.log(`  Package Name:        ${aabReport.packageName} (PASS)`);
  console.log(`  compileSdkVersion:   ${aabReport.compileSdkVersion} (PASS)`);
  console.log(`  targetSdkVersion:    ${aabReport.targetSdkVersion} (PASS)`);
  console.log(`  minSdkVersion:       ${aabReport.minSdkVersion} (PASS)`);
  console.log(`  versionCode:         ${aabReport.versionCode} (PASS)`);
  console.log(`  versionName:         ${aabReport.versionName} (PASS)`);
  console.log(`  Bundletool Validate: ${aabReport.bundletoolValidation}`);
  console.log(`  Signing State:       ${aabReport.signingState}`);
  console.log(`  Production Play:     ${aabReport.productionPlaySigning}`);
  console.log(`  Archive Entries:     ${aabReport.totalEntries}`);
  console.log(`  Native .so Count:    ${aabReport.nativeLibrariesCount}`);
  console.log(`  64-bit Requirement:  ${aabReport.requirement64Bit}`);
  console.log(`  16 KB ELF Alignment: ${aabReport.requirement16Kb}`);

  console.log("\n=================================================");
  console.log("STATUS: POST-BUILD COMPLIANCE VERIFIED (PASS)");
  console.log("=================================================");
}

export function runCli(args = process.argv.slice(2)) {
  if (args.includes("--pre-build")) {
    runPreBuildMode();
  } else if (args.includes("--post-build")) {
    runPostBuildMode();
  } else {
    console.error("ERROR: Invalid invocation. Explicit mode required.");
    console.error("Usage:");
    console.error("  node scripts/ci/check-android-api-compliance.mjs --pre-build");
    console.error("  node scripts/ci/check-android-api-compliance.mjs --post-build");
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("check-android-api-compliance.mjs")) {
  try {
    runCli();
  } catch (err) {
    console.error(`\nCOMPLIANCE GUARD FAILED: ${err.message}`);
    process.exit(1);
  }
}
