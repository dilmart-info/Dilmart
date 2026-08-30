/**
 * STORE-PR6 §34 — deterministic native static validation: Android App Link intent-filter, iOS Associated
 * Domains entitlement + wiring, and the preserved AppDelegate Universal-Link forwarding.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("Android App Links (AndroidManifest.xml)", () => {
  const m = read("android/app/src/main/AndroidManifest.xml");
  it("declares a verified App Link intent-filter for /open on both Store hosts", () => {
    expect(m).toContain('android:autoVerify="true"');
    expect(m).toContain("android.intent.action.VIEW");
    expect(m).toContain("android.intent.category.BROWSABLE");
    expect(m).toContain("android.intent.category.DEFAULT");
    expect(m).toContain('android:host="store.DilMart.org"');
    expect(m).toContain('android:host="staging-store.DilMart.org"');
    expect(m).toContain('android:path="/open"');
  });
  it("preserves launchMode=singleTask (warm app-link routing)", () => {
    expect(m).toContain('android:launchMode="singleTask"');
  });
});

describe("iOS Universal Links", () => {
  it("entitlements declare Associated Domains for both Store hosts", () => {
    const e = read("ios/App/App/App.entitlements");
    expect(e).toContain("com.apple.developer.associated-domains");
    expect(e).toContain("applinks:store.DilMart.org");
    expect(e).toContain("applinks:staging-store.DilMart.org");
  });
  it("App target references CODE_SIGN_ENTITLEMENTS (both configs)", () => {
    const pb = read("ios/App/App.xcodeproj/project.pbxproj");
    const count = (pb.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || []).length;
    expect(count).toBe(2);
  });
  it("preserves the bundle id com.DilMart.store", () => {
    expect(read("ios/App/App.xcodeproj/project.pbxproj")).toContain("PRODUCT_BUNDLE_IDENTIFIER = com.DilMart.store;");
  });
  it("AppDelegate still forwards continue userActivity (Universal Links)", () => {
    const d = read("ios/App/App/AppDelegate.swift");
    expect(d).toContain("continue userActivity");
    expect(d).toContain("ApplicationDelegateProxy.shared.application");
  });
});
