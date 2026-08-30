import { describe, expect, it } from "vitest";

import { clampLogoScale, getBrandLogo, normalizeBrandName } from "./brand-logo-registry";

describe("normalizeBrandName", () => {
  it("trims outer whitespace and lowercases", () => {
    expect(normalizeBrandName("  Gavaro  ")).toBe("gavaro");
    expect(normalizeBrandName("RAVE")).toBe("rave");
  });

  it("collapses repeated internal whitespace", () => {
    expect(normalizeBrandName("Big   Roc")).toBe("big roc");
  });

  it("is case-insensitive across the real production brand set", () => {
    expect(normalizeBrandName("Big Roc")).toBe(normalizeBrandName("BIG ROC"));
    expect(normalizeBrandName("SAWENSITO")).toBe(normalizeBrandName("sawensito"));
  });

  it("preserves apostrophes verbatim (O'me'do must not be mangled)", () => {
    expect(normalizeBrandName("O'me'do")).toBe("o'me'do");
    expect(normalizeBrandName("  O'me'do  ")).toBe("o'me'do");
    expect(normalizeBrandName("O'ME'DO")).toBe("o'me'do");
  });
});

describe("getBrandLogo", () => {
  it("returns null for every current production brand without a verified logo source", () => {
    // See governance/BRAND_LOGO_SOURCE_REGISTER.md (CURRENT PRODUCTION STATE section) —
    // these 21 of the 29 live brands stay on the text fallback: either no confident
    // identity was established, or the only located logo file is unusable (white-only).
    const productionBrandsWithoutLogos = [
      "Big Roc",
      "Cecilia",
      "Dingling",
      "Enzo",
      "Falcon",
      "Gavaro",
      "JRL",
      "Kemei",
      "Lumafofo",
      "Malian",
      "Mixueer",
      "Nishman",
      "O'me'do",
      "O3",
      "Philips",
      "RAVE",
      "SAWENSITO",
      "Velvet",
      "Wahl",
      "Wokali",
    ];
    for (const name of productionBrandsWithoutLogos) {
      expect(getBrandLogo(name)).toBeNull();
    }
  });

  it("returns the verified logo entry for Lattafa, case/whitespace-insensitively", () => {
    expect(getBrandLogo("Lattafa")?.logoUrl).toBeTruthy();
    expect(getBrandLogo("LATTAFA")?.logoUrl).toBe(getBrandLogo("Lattafa")?.logoUrl);
    expect(getBrandLogo("  lattafa  ")?.logoUrl).toBe(getBrandLogo("Lattafa")?.logoUrl);
  });

  it("returns a verified logo entry for every Task 037 brand newly wired into the registry", () => {
    // See governance/BRAND_LOGO_SOURCE_REGISTER.md — all VERIFIED_OFFICIAL/VERIFIED_MANUFACTURER rows.
    const newlyWiredBrands = ["Gillette", "Dorco", "Derby", "Beesline", "Omega", "Lord", "VGR"];
    for (const name of newlyWiredBrands) {
      expect(getBrandLogo(name)?.logoUrl).toBeTruthy();
      // Case/whitespace-insensitive, same contract as Lattafa above.
      expect(getBrandLogo(name.toUpperCase())?.logoUrl).toBe(getBrandLogo(name)?.logoUrl);
    }
  });

  it("returns null for an unknown/unregistered brand name", () => {
    expect(getBrandLogo("Some Unregistered Brand")).toBeNull();
  });

  it("returns null for an empty or whitespace-only name", () => {
    expect(getBrandLogo("")).toBeNull();
    expect(getBrandLogo("   ")).toBeNull();
  });

  it("does not fuzzy-match a near-miss spelling to an unrelated key", () => {
    // "BigRock" (no space, extra letter) must never silently resolve as "Big Roc".
    expect(getBrandLogo("BigRock")).toBeNull();
  });
});

describe("clampLogoScale", () => {
  it("defaults to 1 when no scale is given", () => {
    expect(clampLogoScale(undefined)).toBe(1);
  });

  it("clamps within the 0.80–1.00 optical-normalization range", () => {
    expect(clampLogoScale(0.5)).toBe(0.8);
    expect(clampLogoScale(1.5)).toBe(1);
    expect(clampLogoScale(0.88)).toBe(0.88);
  });

  it("falls back to 1 for a non-numeric value", () => {
    expect(clampLogoScale(Number.NaN)).toBe(1);
  });
});
