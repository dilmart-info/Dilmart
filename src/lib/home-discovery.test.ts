import { describe, expect, it } from "vitest";

import type { MarketplaceStorefrontProduct, MarketplaceStorefrontProductsResult } from "@/lib/marketplace-storefront.types";
import {
  HOME_DISCOVERY_PAGE_SIZE,
  buildDiscoveryList,
  buildHomeDiscoveryQueryKey,
  diversifyByMerchant,
  getNextDiscoveryOffset,
} from "./home-discovery";

function product(id: string, merchantId: string | null = null): MarketplaceStorefrontProduct {
  return {
    id,
    merchants: merchantId ? { id: merchantId, slug: merchantId, display_name: merchantId } : null,
  } as unknown as MarketplaceStorefrontProduct;
}

function page(
  items: MarketplaceStorefrontProduct[],
  offset: number,
  total: number,
  limit = HOME_DISCOVERY_PAGE_SIZE,
): MarketplaceStorefrontProductsResult {
  return { items, offset, limit, total };
}

/** Longest run of consecutive identical merchant ids in the list. */
function longestMerchantRun(items: MarketplaceStorefrontProduct[]): number {
  let max = 0;
  let run = 0;
  let last: string | null | undefined;
  for (const it of items) {
    const m = it.merchants?.id ?? null;
    if (m === last) run += 1;
    else {
      last = m;
      run = 1;
    }
    if (run > max) max = run;
  }
  return max;
}

describe("buildHomeDiscoveryQueryKey", () => {
  it("is stable, serializable, and marketplace-prefixed (inherits marketplace cache policy)", () => {
    const a = buildHomeDiscoveryQueryKey();
    const b = buildHomeDiscoveryQueryKey();
    expect(a[0]).toBe("marketplace-home-discovery");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // No functions in the key.
    expect(a.every((part) => typeof part !== "function")).toBe(true);
  });
});

describe("getNextDiscoveryOffset", () => {
  it("returns the next offset while more products remain", () => {
    expect(getNextDiscoveryOffset(page([], 0, 100))).toBe(24);
    expect(getNextDiscoveryOffset(page([], 24, 100))).toBe(48);
  });

  it("returns undefined once the last page reaches the catalog end", () => {
    expect(getNextDiscoveryOffset(page([], 96, 100))).toBe(undefined); // 96+24=120 >= 100
    expect(getNextDiscoveryOffset(page([], 0, 10))).toBe(undefined);
    expect(getNextDiscoveryOffset(page([], 0, 24))).toBe(undefined);
  });
});

describe("diversifyByMerchant", () => {
  it("keeps 2-or-fewer item pages untouched", () => {
    const items = [product("a", "m1"), product("b", "m1")];
    expect(diversifyByMerchant(items).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("breaks up runs longer than 2 from the same merchant when alternatives exist", () => {
    const items = [
      product("a", "m1"),
      product("b", "m1"),
      product("c", "m1"),
      product("d", "m2"),
      product("e", "m3"),
    ];
    const out = diversifyByMerchant(items);
    expect(longestMerchantRun(out)).toBeLessThanOrEqual(2);
    expect(out.map((p) => p.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("is deterministic — same input yields same output", () => {
    const items = [
      product("a", "m1"),
      product("b", "m1"),
      product("c", "m1"),
      product("d", "m2"),
      product("e", "m2"),
      product("f", "m3"),
    ];
    const first = diversifyByMerchant(items).map((p) => p.id);
    const second = diversifyByMerchant(items).map((p) => p.id);
    expect(first).toEqual(second);
  });

  it("accepts an unavoidable run when only one merchant is present", () => {
    const items = [product("a", "m1"), product("b", "m1"), product("c", "m1"), product("d", "m1")];
    const out = diversifyByMerchant(items);
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("avoids continuing the carry-in merchant at the page boundary when possible", () => {
    const items = [product("a", "m1"), product("b", "m2")];
    // carry-in is m1, so the first emitted item should prefer m2.
    const out = diversifyByMerchant([...items, product("c", "m3")], "m1");
    expect(out[0].merchants?.id).not.toBe("m1");
  });
});

describe("buildDiscoveryList", () => {
  it("deduplicates products that repeat across pages", () => {
    const p1 = page([product("a", "m1"), product("b", "m2")], 0, 100);
    const p2 = page([product("b", "m2"), product("c", "m3")], 24, 100);
    const out = buildDiscoveryList([p1, p2]);
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("deduplicates the feed against curated home ids", () => {
    const p1 = page([product("a", "m1"), product("curated-1", "m2"), product("c", "m3")], 0, 100);
    const out = buildDiscoveryList([p1], ["curated-1"]);
    expect(out.map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("skips a page that fully dedupes away without error", () => {
    const p1 = page([product("a", "m1")], 0, 100);
    const p2 = page([product("a", "m1")], 24, 100); // entirely duplicate
    const out = buildDiscoveryList([p1, p2]);
    expect(out.map((p) => p.id)).toEqual(["a"]);
  });

  it("is append-stable: adding a later page never reorders earlier pages' output", () => {
    const p1 = page([product("a", "m1"), product("b", "m2"), product("c", "m1")], 0, 100);
    const firstOnly = buildDiscoveryList([p1]).map((p) => p.id);
    const p2 = page([product("d", "m2"), product("e", "m3")], 24, 100);
    const both = buildDiscoveryList([p1, p2]).map((p) => p.id);
    expect(both.slice(0, firstOnly.length)).toEqual(firstOnly);
  });

  it("produces no duplicate ids across the accumulated list", () => {
    const p1 = page([product("a", "m1"), product("b", "m1"), product("c", "m2")], 0, 100);
    const p2 = page([product("c", "m2"), product("d", "m3"), product("a", "m1")], 24, 100);
    const out = buildDiscoveryList([p1, p2]);
    const ids = out.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
