/**
 * Authoritative Provisioner for Pinned Bundletool CLI.
 *
 * Downloads and verifies official Google bundletool-all jar with strict SHA-256 pinning.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export const BUNDLETOOL_VERSION = "1.18.1";
export const BUNDLETOOL_URL = `https://github.com/google/bundletool/releases/download/${BUNDLETOOL_VERSION}/bundletool-all-${BUNDLETOOL_VERSION}.jar`;
export const BUNDLETOOL_SHA256 = "675786493983787ffa11550bdb7c0715679a44e1643f3ff980a529e9c822595c";

export function computeFileSha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex").toLowerCase();
}

export function getDefaultBundletoolPath() {
  const rootDir = path.resolve(import.meta.dirname, "../..");
  return path.join(rootDir, "node_modules/.cache/bundletool/bundletool-all.jar");
}

export function getOrProvisionBundletool(destinationPath = null) {
  const targetPath = destinationPath || process.env.BUNDLETOOL_JAR || getDefaultBundletoolPath();

  if (fs.existsSync(targetPath)) {
    const existingHash = computeFileSha256(targetPath);
    if (existingHash === BUNDLETOOL_SHA256) {
      return targetPath;
    }
    // Checksum mismatch, remove corrupt file
    fs.unlinkSync(targetPath);
  }

  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log(`Provisioning bundletool ${BUNDLETOOL_VERSION} to ${targetPath}...`);

  // Download using curl for speed and streaming reliability across platforms
  try {
    execFileSync("curl", ["-fSL", "-o", targetPath, BUNDLETOOL_URL], {
      stdio: "inherit",
    });
  } catch (err) {
    throw new Error(`Failed to download bundletool from ${BUNDLETOOL_URL}: ${err.message}`);
  }

  if (!fs.existsSync(targetPath)) {
    throw new Error(`bundletool was not saved to ${targetPath}`);
  }

  const downloadedHash = computeFileSha256(targetPath);
  if (downloadedHash !== BUNDLETOOL_SHA256) {
    fs.unlinkSync(targetPath);
    throw new Error(
      `Bundletool SHA-256 verification failed!\nExpected: ${BUNDLETOOL_SHA256}\nReceived: ${downloadedHash}`,
    );
  }

  console.log(`Bundletool ${BUNDLETOOL_VERSION} provisioned and verified (SHA-256: ${downloadedHash}).`);
  return targetPath;
}

if (process.argv[1] && process.argv[1].endsWith("provision-bundletool.mjs")) {
  try {
    const p = getOrProvisionBundletool();
    console.log(`BUNDLETOOL_READY: ${p}`);
  } catch (err) {
    console.error(`PROVISION_FAILED: ${err.message}`);
    process.exit(1);
  }
}
