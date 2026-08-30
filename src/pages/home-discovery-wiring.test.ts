import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Source-level regression guard for the Home commerce discovery feed (DilMart-STORE-HOME-DISCOVERY-FEED-043).
 * Mirrors the repo's existing source-guard style (see auth-guard-strip-comments.test.ts). Mounting the
 * full Index page is heavy (hero, many marketplace queries, cart/wishlist chrome); these assertions lock
 * in the two structural decisions without that cost.
 */
const indexSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Index.tsx"), "utf8");

describe("Home page discovery wiring", () => {
  it("no longer renders the duplicate 'الأكثر تداولاً' bucket (it aliased is_best_seller twice)", () => {
    expect(indexSource).not.toContain("الأكثر تداولاً");
  });

  it("keeps a single 'الأكثر مبيعاً' best-seller section", () => {
    const matches = indexSource.match(/الأكثر مبيعاً/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("mounts the HomeDiscoveryFeed and feeds it curated ids for dedupe", () => {
    expect(indexSource).toContain("import HomeDiscoveryFeed");
    expect(indexSource).toContain("<HomeDiscoveryFeed curatedProductIds={curatedProductIds}");
  });
});
