import { describe, it, expect } from "vitest";
import {
  parseFingerprints,
  buildAssetlinks,
  buildAasa,
} from "./generate-app-link-associations.mjs";

describe("App-Link Associations Generator", () => {
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

  it("builds valid Android assetlinks document", () => {
    const fps = ["14:6D:E9:01:02:03:04:05:06:07:08:09:0A:0B:0C:0D:0E:0F:10:11:12:13:14:15:16:17:18:19:1A:1B:1C:1D"];
    const doc = buildAssetlinks("com.DilMart.store", fps);
    expect(doc).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.DilMart.store",
          sha256_cert_fingerprints: fps,
        },
      },
    ]);
  });

  it("builds valid iOS apple-app-site-association with marketplace components", () => {
    const doc = buildAasa("ABC1234567", "com.DilMart.store");
    expect(doc.applinks.details[0].appIDs).toEqual(["ABC1234567.com.DilMart.store"]);
    const paths = doc.applinks.details[0].components.map((c: any) => c["/"]);
    expect(paths).toContain("/product/*");
    expect(paths).toContain("/category/*");
    expect(paths).toContain("/store/*");
    expect(paths).toContain("/products*");
    expect(paths).toContain("/offers*");
  });
});
