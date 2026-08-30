import { describe, expect, it } from "vitest";
import {
  NEUTRAL_CATEGORY_PLACEHOLDER,
  filterRootStorefrontCategories,
  productsCategoryHref,
  resolveCategoryImageUrl,
  sortStorefrontCategories,
  type StorefrontCategory,
} from "./category-hierarchy";

const ROOT_A: StorefrontCategory = {
  id: "r1",
  name: "العطور والمعطرات",
  slug: "fragrances-and-scents",
  parent_id: null,
  is_active: true,
  is_featured: true,
  sort_order: 10,
  image_url: "https://example.com/frag.jpg",
};

const ROOT_B: StorefrontCategory = {
  id: "r2",
  name: "العناية الشخصية والتجميل",
  slug: "personal-care-beauty",
  parent_id: null,
  is_active: true,
  is_featured: false,
  sort_order: 11,
  image_url: "https://example.com/care.jpg",
};

const CHILD_PERFUMES: StorefrontCategory = {
  id: "c1",
  name: "العطور",
  slug: "perfumes",
  parent_id: "r1",
  is_active: true,
  sort_order: 1,
  image_url: null,
  icon_url: null,
};

const CHILD_EMPTY: StorefrontCategory = {
  id: "c2",
  name: "العطور الصغيرة والميني",
  slug: "mini-travel-perfume",
  parent_id: "r1",
  is_active: true,
  sort_order: 2,
};

const INACTIVE_ROOT: StorefrontCategory = {
  id: "ir",
  name: "مخفي",
  slug: "hidden",
  parent_id: null,
  is_active: false,
  sort_order: 1,
};

describe("filterRootStorefrontCategories", () => {
  it("returns roots only and excludes children", () => {
    const roots = filterRootStorefrontCategories([ROOT_A, ROOT_B, CHILD_PERFUMES, CHILD_EMPTY]);
    expect(roots.map((c) => c.slug)).toEqual(["fragrances-and-scents", "personal-care-beauty"]);
    expect(roots.every((c) => !c.parent_id)).toBe(true);
  });

  it("excludes inactive roots", () => {
    const roots = filterRootStorefrontCategories([ROOT_A, INACTIVE_ROOT, CHILD_PERFUMES]);
    expect(roots.map((c) => c.slug)).toEqual(["fragrances-and-scents"]);
  });
});

describe("sortStorefrontCategories", () => {
  it("orders featured then sort_order", () => {
    const sorted = sortStorefrontCategories([ROOT_B, ROOT_A]);
    expect(sorted[0].slug).toBe("fragrances-and-scents");
  });
});

describe("resolveCategoryImageUrl", () => {
  it("uses own image when present", () => {
    expect(resolveCategoryImageUrl(ROOT_A)).toBe("https://example.com/frag.jpg");
  });

  it("falls back to parent image before neutral placeholder", () => {
    expect(resolveCategoryImageUrl(CHILD_PERFUMES, ROOT_A)).toBe("https://example.com/frag.jpg");
  });

  it("uses neutral placeholder when no image/icon/parent", () => {
    expect(resolveCategoryImageUrl(CHILD_EMPTY, null)).toBe(NEUTRAL_CATEGORY_PLACEHOLDER);
    expect(NEUTRAL_CATEGORY_PLACEHOLDER.startsWith("data:image/svg+xml")).toBe(true);
  });

  it("prefers own icon over parent image", () => {
    const withIcon = { ...CHILD_PERFUMES, icon_url: "https://example.com/icon.svg" };
    expect(resolveCategoryImageUrl(withIcon, ROOT_A)).toBe("https://example.com/icon.svg");
  });
});

describe("productsCategoryHref", () => {
  it("builds canonical /products?category= slug URL", () => {
    expect(productsCategoryHref("perfumes")).toBe("/products?category=perfumes");
    expect(productsCategoryHref("a b")).toBe("/products?category=a%20b");
  });
});
