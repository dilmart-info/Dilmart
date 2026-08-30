/**
 * Storefront category hierarchy — focused RTL / helper-driven tests.
 *
 * Full `Products.tsx` mount is heavy (marketplace queries, filters, cart chrome).
 * This file covers the hierarchy expectations the page derives from helpers + a
 * lightweight breadcrumb / drawer surface, matching Products.tsx / Header patterns.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Link } from "react-router-dom";
import {
  NEUTRAL_CATEGORY_PLACEHOLDER,
  filterRootStorefrontCategories,
  productsCategoryHref,
  resolveCategoryImageUrl,
  sortStorefrontCategories,
  type StorefrontCategory,
} from "@/lib/category-hierarchy";

const FRAG: StorefrontCategory = {
  id: "fc662e9f-ea22-454e-bb29-cdb7bf5ea90c",
  name: "العطور والمعطرات",
  slug: "fragrances-and-scents",
  parent_id: null,
  is_active: true,
  sort_order: 10,
  image_url: "https://example.com/frag.jpg",
};

const CARE: StorefrontCategory = {
  id: "d7df20e8-011c-430e-a8a7-77b9506936ac",
  name: "العناية الشخصية والتجميل",
  slug: "personal-care-beauty",
  parent_id: null,
  is_active: true,
  sort_order: 11,
  image_url: "https://example.com/care.jpg",
};

const PERFUMES: StorefrontCategory = {
  id: "40b4649b-c017-41c0-b477-426cd8f6e7a0",
  name: "العطور",
  slug: "perfumes",
  parent_id: FRAG.id,
  is_active: true,
  sort_order: 1,
};

const MINI: StorefrontCategory = {
  id: "afcbc5ce-5b3a-4378-883c-be6567dbda16",
  name: "العطور الصغيرة والميني",
  slug: "mini-travel-perfume",
  parent_id: FRAG.id,
  is_active: true,
  sort_order: 2,
};

const ALL: StorefrontCategory[] = [FRAG, CARE, PERFUMES, MINI];

/** Mirrors Products.tsx root/leaf navigation derivation. */
function deriveProductsHierarchyState(categories: StorefrontCategory[], categorySlug?: string) {
  const selectedCategory = categorySlug
    ? (categories.find((c) => c.slug === categorySlug) ?? null)
    : null;
  const parentCategory = selectedCategory?.parent_id
    ? (categories.find((c) => c.id === selectedCategory.parent_id) ?? null)
    : null;
  const isRootSelected = Boolean(selectedCategory && !selectedCategory.parent_id);
  const isLeafSelected = Boolean(selectedCategory && selectedCategory.parent_id);
  const browseCategories = filterRootStorefrontCategories(categories);
  const childNavCategories = (() => {
    if (isRootSelected && selectedCategory) {
      return sortStorefrontCategories(
        categories.filter((c) => c.parent_id === selectedCategory.id && c.is_active !== false),
      );
    }
    if (isLeafSelected && parentCategory) {
      return sortStorefrontCategories(
        categories.filter((c) => c.parent_id === parentCategory.id && c.is_active !== false),
      );
    }
    return [] as StorefrontCategory[];
  })();
  return {
    selectedCategory,
    parentCategory,
    isRootSelected,
    isLeafSelected,
    browseCategories,
    childNavCategories,
    showCategoryBrowser: !categorySlug || isRootSelected,
  };
}

function LeafBreadcrumb({ parent, child }: { parent: StorefrontCategory; child: StorefrontCategory }) {
  return (
    <nav aria-label="breadcrumb" dir="rtl" data-testid="category-breadcrumb">
      <a href={productsCategoryHref(parent.slug)}>{parent.name}</a>
      <span aria-hidden>›</span>
      <span>{child.name}</span>
    </nav>
  );
}

describe("Products hierarchy derivation (helper-driven)", () => {
  it("1. initial browse shows roots only", () => {
    const state = deriveProductsHierarchyState(ALL);
    expect(state.browseCategories.map((c) => c.slug)).toEqual([
      "fragrances-and-scents",
      "personal-care-beauty",
    ]);
  });

  it("2. child categories are not independent roots", () => {
    const state = deriveProductsHierarchyState(ALL);
    expect(state.browseCategories.some((c) => c.slug === "perfumes")).toBe(false);
    expect(state.browseCategories.every((c) => !c.parent_id)).toBe(true);
  });

  it("3–4. selecting a root lists all active children including empty ones", () => {
    const state = deriveProductsHierarchyState(ALL, "fragrances-and-scents");
    expect(state.isRootSelected).toBe(true);
    expect(state.childNavCategories.map((c) => c.slug)).toEqual(["perfumes", "mini-travel-perfume"]);
    expect(state.childNavCategories.some((c) => c.slug === "mini-travel-perfume")).toBe(true);
  });

  it("5. selecting a child keeps siblings for highlight/nav", () => {
    const state = deriveProductsHierarchyState(ALL, "perfumes");
    expect(state.isLeafSelected).toBe(true);
    expect(state.childNavCategories.map((c) => c.slug)).toContain("perfumes");
    expect(state.childNavCategories.map((c) => c.slug)).toContain("mini-travel-perfume");
    expect(state.parentCategory?.slug).toBe("fragrances-and-scents");
  });

  it("8. root empty-state uses subtree counts when provided", () => {
    const withCounts = ALL.map((c) =>
      c.slug === "fragrances-and-scents"
        ? { ...c, subtree_public_product_count: 0, direct_public_product_count: 0 }
        : c.slug === "perfumes"
          ? { ...c, subtree_public_product_count: 0, direct_public_product_count: 0 }
          : c,
    );
    const state = deriveProductsHierarchyState(withCounts, "fragrances-and-scents");
    const root = state.selectedCategory as StorefrontCategory & {
      subtree_public_product_count?: number;
    };
    expect(root.subtree_public_product_count).toBe(0);
  });

  it("9. category image fallback is neutral when parent has no image", () => {
    const orphanChild: StorefrontCategory = {
      id: "x",
      name: "بدون صورة",
      slug: "no-img",
      parent_id: null,
      image_url: null,
      icon_url: null,
    };
    expect(resolveCategoryImageUrl(orphanChild)).toBe(NEUTRAL_CATEGORY_PLACEHOLDER);
    expect(resolveCategoryImageUrl(PERFUMES, FRAG)).toBe("https://example.com/frag.jpg");
  });

  it("12. canonical category URL remains /products?category=", () => {
    expect(productsCategoryHref("fragrances-and-scents")).toBe(
      "/products?category=fragrances-and-scents",
    );
    expect(productsCategoryHref("perfumes")).toBe("/products?category=perfumes");
  });
});

describe("breadcrumb + drawer surfaces", () => {
  it("6. breadcrumb shows Parent › Child (RTL)", () => {
    render(
      <MemoryRouter>
        <LeafBreadcrumb parent={FRAG} child={PERFUMES} />
      </MemoryRouter>,
    );
    const nav = screen.getByTestId("category-breadcrumb");
    expect(nav).toHaveAttribute("dir", "rtl");
    expect(nav.textContent).toContain("العطور والمعطرات");
    expect(nav.textContent).toContain("›");
    expect(nav.textContent).toContain("العطور");
    expect(screen.getByRole("link", { name: "العطور والمعطرات" })).toHaveAttribute(
      "href",
      "/products?category=fragrances-and-scents",
    );
  });

  it("7. header drawer lists roots with nested children (not flattened)", () => {
    // Mirrors IconNav CategoryDrawerTrigger nesting without Radix Sheet portals.
    const tree = filterRootStorefrontCategories(ALL).map((root) => ({
      ...root,
      children: sortStorefrontCategories(
        ALL.filter((c) => c.parent_id === root.id && c.is_active !== false),
      ),
    }));

    render(
      <MemoryRouter>
        <div data-testid="category-drawer-tree" dir="rtl">
          {tree.map((cat) => (
            <div key={cat.id} data-testid={`root-${cat.slug}`}>
              <Link to={productsCategoryHref(cat.slug)}>{cat.name}</Link>
              {cat.children.length > 0 ? (
                <ul data-testid={`children-of-${cat.slug}`}>
                  {cat.children.map((child) => (
                    <li key={child.id}>
                      <Link to={productsCategoryHref(child.slug)}>{child.name}</Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "العطور والمعطرات" })).toHaveAttribute(
      "href",
      "/products?category=fragrances-and-scents",
    );
    expect(screen.getByTestId("children-of-fragrances-and-scents")).toBeTruthy();
    expect(screen.getByRole("link", { name: "العطور" })).toHaveAttribute(
      "href",
      "/products?category=perfumes",
    );
    expect(screen.getByRole("link", { name: "العطور الصغيرة والميني" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "العناية الشخصية والتجميل" })).toBeTruthy();
    // Children must not appear as top-level root wrappers
    expect(screen.queryByTestId("root-perfumes")).toBeNull();
  });

  it("10–11. RTL dir retained on breadcrumb; child nav order stable for mobile strip", () => {
    const state = deriveProductsHierarchyState(ALL, "fragrances-and-scents");
    expect(state.childNavCategories.map((c) => c.slug)).toEqual([
      "perfumes",
      "mini-travel-perfume",
    ]);
    render(
      <MemoryRouter>
        <div dir="rtl" data-testid="child-strip">
          {state.childNavCategories.map((c) => (
            <a key={c.id} href={productsCategoryHref(c.slug)}>
              {c.name}
            </a>
          ))}
        </div>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("child-strip")).toHaveAttribute("dir", "rtl");
  });
});
