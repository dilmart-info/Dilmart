import { describe, it, expect } from "vitest";
import {
  parseFingerprints,
  buildAssetlinks,
  buildAasa,
  validateAndroidPackageId,
  validateIosBundleId,
  DEFAULT_ANDROID_PACKAGE_ID,
  DEFAULT_IOS_BUNDLE_ID,
} from "./generate-app-link-associations.mjs";

describe("App-Link Associations Generator", () => {
  it("defines canonical Android package and lowercase iOS bundle ID defaults", () => {
    expect(DEFAULT_ANDROID_PACKAGE_ID).toBe("com.dilmart.store");
    expect(DEFAULT_IOS_BUNDLE_ID).toBe("com.dilmart.store");
    expect(DEFAULT_ANDROID_PACKAGE_ID).toBe(DEFAULT_IOS_BUNDLE_ID);
  });

  it("validates Android package identifier format strictly (lowercase)", () => {
    expect(validateAndroidPackageId("com.dilmart.store")).toBe(true);
    expect(validateAndroidPackageId("com.DilMart.store")).toBe(false); // uppercase rejected for Android
    expect(validateAndroidPackageId("com.dilmart")).toBe(true);
    expect(validateAndroidPackageId("invalid package")).toBe(false);
    expect(validateAndroidPackageId("")).toBe(false);
  });

  it("validates iOS bundle identifier format", () => {
    expect(validateIosBundleId("com.DilMart.store")).toBe(true);
    expect(validateIosBundleId("com.dilmart.store")).toBe(true);
    expect(validateIosBundleId("com.DilMart.store-app")).toBe(true);
    expect(validateIosBundleId("invalid bundle id")).toBe(false);
    expect(validateIosBundleId("")).toBe(false);
  });

  it("parses valid SHA-256 fingerprints correctly", () => {
    const validFp = "14:6D:E9:01:02:03:04:05:06:07:08:09:0A:0B:0C:0D:0E:0F:10:11:12:13:14:15:16:17:18:19:1A:1B:1C:1D";
    const { list, bad } = parseFingerprints(validFp);
    expect(bad).toEqual([]);
    expect(list).toEqual([validFp]);
  });

  it("detects invalid SHA-256 fingerprints", () => {
    const { list, bad } = parseFingerprints("invalid-fp, 12:34");
    expect(bad.length).toBe(2);
  });

  it("builds valid Android assetlinks document with canonical package", () => {
    const fps = ["14:6D:E9:01:02:03:04:05:06:07:08:09:0A:0B:0C:0D:0E:0F:10:11:12:13:14:15:16:17:18:19:1A:1B:1C:1D"];
    const doc = buildAssetlinks(DEFAULT_ANDROID_PACKAGE_ID, fps);
    expect(doc).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.dilmart.store",
          sha256_cert_fingerprints: fps,
        },
      },
    ]);
  });

  it("builds valid iOS apple-app-site-association with canonical iOS bundle ID", () => {
    const doc = buildAasa("ABC1234567", DEFAULT_IOS_BUNDLE_ID);
    expect(doc.applinks.details[0].appIDs).toEqual(["ABC1234567.com.dilmart.store"]);
    const paths = doc.applinks.details[0].components.map((c: any) => c["/"]);
    expect(paths).toContain("/product/*");
    expect(paths).toContain("/category/*");
    expect(paths).toContain("/store/*");
    expect(paths).toContain("/products*");
    expect(paths).toContain("/offers*");
  });
});
