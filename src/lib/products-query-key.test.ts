import { describe, expect, it } from "vitest";

import { buildProductsQueryKey, buildProductsQueryParams, type ProductsListFilters } from "./products-query-key";

const BASE: ProductsListFilters = {
  categorySlug: null,
  merchantId: null,
  filter: null,
  search: null,
  sort: "newest",
  minPrice: null,
  maxPrice: null,
  brand: null,
  color: null,
  size: null,
  minWeight: null,
  maxWeight: null,
  offset: 0,
  limit: 24,
};

/** Stable string form used only to compare cache identity in these tests. */
function keyString(f: ProductsListFilters): string {
  return JSON.stringify(buildProductsQueryKey(f));
}

describe("buildProductsQueryParams", () => {
  it("maps every filter into the exact getMarketplaceProducts payload shape", () => {
    const params = buildProductsQueryParams({
      ...BASE,
      categorySlug: "hair-tools",
      merchantId: "m-1",
      filter: "new",
      search: "clipper",
      sort: "price_asc",
      minPrice: "1000",
      maxPrice: "50000",
      brand: "Kemei",
      color: "black",
      size: "m",
      minWeight: "10",
      maxWeight: "500",
      offset: 24,
      limit: 24,
    });
    expect(params).toEqual({
      offset: 24,
      limit: 24,
      category_slug: "hair-tools",
      merchant_id: "m-1",
      filter: "new",
      search: "clipper",
      sort: "price_asc",
      min_price: 1000,
      max_price: 50000,
      brand: "Kemei",
      color: "black",
      size: "m",
      min_weight: 10,
      max_weight: 500,
    });
  });

  it("passes O'me'do through untouched", () => {
    expect(buildProductsQueryParams({ ...BASE, brand: "O'me'do" }).brand).toBe("O'me'do");
  });
});

describe("buildProductsQueryKey — cache identity", () => {
  it("changing brand alone changes the key (the reported bug)", () => {
    const gillette = keyString({ ...BASE, brand: "Gillette" });
    const kemei = keyString({ ...BASE, brand: "Kemei" });
    const lattafa = keyString({ ...BASE, brand: "Lattafa" });
    const omedo = keyString({ ...BASE, brand: "O'me'do" });
    const noBrand = keyString(BASE);
    const keys = [gillette, kemei, lattafa, omedo, noBrand];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("changing category alone changes the key", () => {
    expect(keyString({ ...BASE, categorySlug: "a" })).not.toBe(keyString({ ...BASE, categorySlug: "b" }));
  });

  it("changing search alone changes the key", () => {
    expect(keyString({ ...BASE, search: "a" })).not.toBe(keyString({ ...BASE, search: "b" }));
  });

  it("changing sort alone changes the key", () => {
    expect(keyString({ ...BASE, sort: "newest" })).not.toBe(keyString({ ...BASE, sort: "price_asc" }));
  });

  it("changing page (offset) alone changes the key", () => {
    expect(keyString({ ...BASE, offset: 0 })).not.toBe(keyString({ ...BASE, offset: 24 }));
  });

  it("changing merchant_id alone changes the key", () => {
    expect(keyString({ ...BASE, merchantId: "m-1" })).not.toBe(keyString({ ...BASE, merchantId: "m-2" }));
  });

  it("changing filter alone changes the key", () => {
    expect(keyString({ ...BASE, filter: "new" })).not.toBe(keyString({ ...BASE, filter: "sale" }));
  });

  it("changing min_price/max_price alone changes the key", () => {
    expect(keyString({ ...BASE, minPrice: "1000" })).not.toBe(keyString({ ...BASE, minPrice: "2000" }));
    expect(keyString({ ...BASE, maxPrice: "5000" })).not.toBe(keyString({ ...BASE, maxPrice: "9000" }));
  });

  it("changing color/size alone changes the key", () => {
    expect(keyString({ ...BASE, color: "black" })).not.toBe(keyString({ ...BASE, color: "gold" }));
    expect(keyString({ ...BASE, size: "s" })).not.toBe(keyString({ ...BASE, size: "l" }));
  });

  it("changing min_weight/max_weight alone changes the key", () => {
    expect(keyString({ ...BASE, minWeight: "10" })).not.toBe(keyString({ ...BASE, minWeight: "20" }));
    expect(keyString({ ...BASE, maxWeight: "100" })).not.toBe(keyString({ ...BASE, maxWeight: "200" }));
  });

  it("a brand + category combination is distinct from either alone", () => {
    const brandOnly = keyString({ ...BASE, brand: "Gillette" });
    const categoryOnly = keyString({ ...BASE, categorySlug: "razors" });
    const both = keyString({ ...BASE, brand: "Gillette", categorySlug: "razors" });
    expect(new Set([brandOnly, categoryOnly, both]).size).toBe(3);
  });

  it("the exact same semantic filters produce the exact same key", () => {
    const a = keyString({ ...BASE, brand: "Kemei", categorySlug: "clippers", offset: 24 });
    const b = keyString({ ...BASE, brand: "Kemei", categorySlug: "clippers", offset: 24 });
    expect(a).toBe(b);
  });

  it("always starts with the marketplace-products namespace", () => {
    const key = buildProductsQueryKey(BASE);
    expect(key[0]).toBe("marketplace-products");
    expect(key).toHaveLength(2);
  });
});
