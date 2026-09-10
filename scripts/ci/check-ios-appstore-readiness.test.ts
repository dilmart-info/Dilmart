import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("iOS App Store Readiness Guard", () => {
  const pbxprojPath = path.join(root, "ios/App/App.xcodeproj/project.pbxproj");
  const infoPlistPath = path.join(root, "ios/App/App/Info.plist");
  const privacyManifestPath = path.join(root, "ios/App/App/PrivacyInfo.xcprivacy");
  const entitlementsPath = path.join(root, "ios/App/App/App.entitlements");
  const capacitorConfigPath = path.join(root, "capacitor.config.ts");

  it("ensures all iOS project configuration files exist", () => {
    expect(fs.existsSync(pbxprojPath)).toBe(true);
    expect(fs.existsSync(infoPlistPath)).toBe(true);
    expect(fs.existsSync(privacyManifestPath)).toBe(true);
    expect(fs.existsSync(entitlementsPath)).toBe(true);
    expect(fs.existsSync(capacitorConfigPath)).toBe(true);
  });

  it("enforces Bundle ID is com.dilmart.store in Debug and Release in project.pbxproj", () => {
    const content = fs.readFileSync(pbxprojPath, "utf8");
    const bundleMatches = content.match(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g);
    expect(bundleMatches).not.toBeNull();
    expect(bundleMatches?.length).toBeGreaterThanOrEqual(2);
    for (const m of bundleMatches!) {
      expect(m).toBe("PRODUCT_BUNDLE_IDENTIFIER = com.dilmart.store;");
    }
  });

  it("enforces no stale com.DilMart.store exists in project configuration files", () => {
    const pbxproj = fs.readFileSync(pbxprojPath, "utf8");
    const infoPlist = fs.readFileSync(infoPlistPath, "utf8");
    const capConfig = fs.readFileSync(capacitorConfigPath, "utf8");
    const genScript = fs.readFileSync(path.join(root, "scripts/mobile/generate-app-link-associations.mjs"), "utf8");

    expect(pbxproj).not.toContain("com.DilMart.store");
    expect(infoPlist).not.toContain("com.DilMart.store");
    expect(capConfig).not.toContain("com.DilMart.store");
    expect(genScript).not.toContain("com.DilMart.store");
  });

  it("enforces version 1.0.1 and build 1 in Debug and Release", () => {
    const content = fs.readFileSync(pbxprojPath, "utf8");
    const mktVersions = content.match(/MARKETING_VERSION = ([^;]+);/g);
    expect(mktVersions).not.toBeNull();
    for (const mv of mktVersions!) {
      expect(mv).toBe("MARKETING_VERSION = 1.0.1;");
    }

    const projVersions = content.match(/CURRENT_PROJECT_VERSION = ([^;]+);/g);
    expect(projVersions).not.toBeNull();
    for (const pv of projVersions!) {
      expect(pv).toBe("CURRENT_PROJECT_VERSION = 1;");
    }
  });

  it("enforces TARGETED_DEVICE_FAMILY is 1 (iPhone only)", () => {
    const content = fs.readFileSync(pbxprojPath, "utf8");
    const targetFamilies = content.match(/TARGETED_DEVICE_FAMILY = ([^;]+);/g);
    expect(targetFamilies).not.toBeNull();
    for (const tf of targetFamilies!) {
      expect(tf).toBe("TARGETED_DEVICE_FAMILY = 1;");
    }
  });

  it("enforces IPHONEOS_DEPLOYMENT_TARGET is 15.0", () => {
    const content = fs.readFileSync(pbxprojPath, "utf8");
    const targets = content.match(/IPHONEOS_DEPLOYMENT_TARGET = ([^;]+);/g);
    expect(targets).not.toBeNull();
    for (const t of targets!) {
      expect(t).toBe("IPHONEOS_DEPLOYMENT_TARGET = 15.0;");
    }
  });

  it("enforces CFBundleDisplayName is DilMart in Info.plist", () => {
    const content = fs.readFileSync(infoPlistPath, "utf8");
    expect(content).toContain("<key>CFBundleDisplayName</key>\n\t<string>DilMart</string>");
  });

  it("enforces NSLocationWhenInUseUsageDescription exists and is non-empty in Info.plist", () => {
    const content = fs.readFileSync(infoPlistPath, "utf8");
    expect(content).toContain("<key>NSLocationWhenInUseUsageDescription</key>");
    expect(content).toContain("<string>يُستخدم موقعك لتحديد عنوان التوصيل بدقة وتسهيل استلام طلبك.</string>");
  });

  it("enforces ITSAppUsesNonExemptEncryption is false in Info.plist", () => {
    const content = fs.readFileSync(infoPlistPath, "utf8");
    expect(content).toContain("<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>");
  });

  it("enforces App Transport Security has no NSAllowsArbitraryLoads", () => {
    const content = fs.readFileSync(infoPlistPath, "utf8");
    expect(content).not.toContain("NSAllowsArbitraryLoads");
  });

  it("validates PrivacyInfo.xcprivacy contains required declarations and no tracking", () => {
    const content = fs.readFileSync(privacyManifestPath, "utf8");
    expect(content).toContain("<key>NSPrivacyTracking</key>\n\t<false/>");
    expect(content).toContain("<key>NSPrivacyTrackingDomains</key>\n\t<array/>");
    expect(content).toContain("NSPrivacyAccessedAPICategoryUserDefaults");
    expect(content).toContain("CA92.1");
    expect(content).toContain("NSPrivacyCollectedDataTypeName");
    expect(content).toContain("NSPrivacyCollectedDataTypePhoneNumber");
    expect(content).toContain("NSPrivacyCollectedDataTypePhysicalAddress");
    expect(content).toContain("NSPrivacyCollectedDataTypeUserID");
    expect(content).toContain("NSPrivacyCollectedDataTypePurchaseHistory");
    expect(content).not.toContain("<key>NSPrivacyTracking</key>\n\t<true/>");
  });

  it("ensures PrivacyInfo.xcprivacy is registered in project.pbxproj build file and resources", () => {
    const pbxproj = fs.readFileSync(pbxprojPath, "utf8");
    expect(pbxproj).toContain("PrivacyInfo.xcprivacy in Resources");
    expect(pbxproj).toContain("/* PrivacyInfo.xcprivacy */");
  });

  it("ensures iOS App Icon is 1024x1024, square, and carries NO alpha channel", () => {
    const iconPath = path.join(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");
    expect(fs.existsSync(iconPath)).toBe(true);

    const fd = fs.openSync(iconPath, "r");
    try {
      const head = Buffer.alloc(26);
      fs.readSync(fd, head, 0, 26, 0);
      const width = head.readUInt32BE(16);
      const height = head.readUInt32BE(20);
      const colorType = head[25];

      expect(width).toBe(1024);
      expect(height).toBe(1024);
      // Colour types 4 (grey+alpha) and 6 (RGBA) carry alpha
      expect(colorType).not.toBe(4);
      expect(colorType).not.toBe(6);
    } finally {
      fs.closeSync(fd);
    }
  });

  it("ensures reviewer email/password authentication and account deletion remain intact", () => {
    const authCode = fs.readFileSync(path.join(root, "src/pages/Auth.tsx"), "utf8");
    const profileCode = fs.readFileSync(path.join(root, "src/pages/Profile.tsx"), "utf8");
    const routesCode = fs.readFileSync(path.join(root, "src/app/CustomerRoutes.tsx"), "utf8");

    // Reviewer login via email + password
    expect(authCode).toContain("passwordIdentifier");
    expect(authCode).toContain("looksLikeEmail");
    expect(authCode).toContain("data-testid=\"password-form\"");

    // In-app account deletion
    expect(profileCode).toContain("handleDeleteAccount");
    expect(profileCode).toContain("data-testid=\"delete-account-button\"");

    // Routes
    expect(routesCode).toContain("path=\"/privacy\"");
    expect(routesCode).toContain("path=\"/account-deletion\"");
  });
});
