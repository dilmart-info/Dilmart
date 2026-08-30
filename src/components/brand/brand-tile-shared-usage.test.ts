import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The home `BrandRail` and the `/brands` page must render brand cards through the
 * SAME `BrandTileVisual` component — one logo/fallback/normalization implementation,
 * not two. This is a source-level invariant check rather than a full network-backed
 * render test, since `Brands.tsx` fetches over react-query.
 */
describe("brand tile is shared between home and the all-brands page", () => {
  const railSource = readFileSync(resolve(__dirname, "../BrandRail.tsx"), "utf8");
  const pageSource = readFileSync(resolve(__dirname, "../../pages/Brands.tsx"), "utf8");

  it("BrandRail imports the shared BrandTileVisual", () => {
    expect(railSource).toContain('from "@/components/brand/BrandTileVisual"');
    expect(railSource).toContain("<BrandTileVisual");
  });

  it("the /brands page imports the same shared BrandTileVisual", () => {
    expect(pageSource).toContain('from "@/components/brand/BrandTileVisual"');
    expect(pageSource).toContain("<BrandTileVisual");
  });

  it("neither surface defines its own competing brand-tile component", () => {
    expect(railSource).not.toMatch(/function\s+Brand(Card|Tile|Logo)/);
    expect(pageSource).not.toMatch(/function\s+Brand(Card|Tile|Logo)/);
  });

  it("neither surface reuses a merchant logo field (logo_url) for brand presentation", () => {
    expect(railSource).not.toContain("logo_url");
    expect(pageSource).not.toContain("logo_url");
  });
});
