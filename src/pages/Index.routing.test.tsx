import { describe, expect, it, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HeroSlider from "@/components/HeroSlider";
import { HOMEPAGE_HERO_SLIDES, HOMEPAGE_SIDE_CARDS } from "@/config/homepage-hero";
import {
  CANONICAL_ROOT_CATEGORY_SLUGS,
  productsCategoryHref,
} from "@/lib/category-hierarchy";
import CategoryGrid from "@/components/CategoryGrid";

// embla measures real layout, which jsdom does not provide.
vi.mock("embla-carousel-react", () => {
  const api = {
    scrollSnapList: () => [0, 1, 2],
    selectedScrollSnap: () => 0,
    scrollPrev: vi.fn(),
    scrollNext: vi.fn(),
    scrollTo: vi.fn(),
    canScrollPrev: () => true,
    canScrollNext: () => true,
    on: vi.fn(),
    off: vi.fn(),
  };
  return { default: () => [vi.fn(), api] };
});

beforeAll(() => {
  class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});


describe("Phase 3N — Homepage Category Routing Contract (Boundary A)", () => {
  describe("Hero Slides Static Route Configuration", () => {
    it("configures the electronics CTA with the canonical category slug", () => {
      const electronicsSlide = HOMEPAGE_HERO_SLIDES.find(
        (s) => s.id === "hero-electronics",
      );
      expect(electronicsSlide).toBeDefined();
      expect(electronicsSlide?.ctaLabel).toBe("استكشف الأجهزة");
      expect(electronicsSlide?.href).toBe(
        "/products?category=electronics-accessories",
      );
      expect(electronicsSlide?.href).not.toBe("/products?category=electronics");
    });

    it("configures the home & kitchen CTA with the canonical category slug", () => {
      const homeSlide = HOMEPAGE_HERO_SLIDES.find(
        (s) => s.id === "hero-home-living",
      );
      expect(homeSlide).toBeDefined();
      expect(homeSlide?.ctaLabel).toBe("تصفح مستلزمات المنزل");
      expect(homeSlide?.href).toBe("/products?category=home-kitchen");
      expect(homeSlide?.href).not.toBe("/products?category=home");
    });

    it("configures the grand offers CTA with /offers", () => {
      const dealsSlide = HOMEPAGE_HERO_SLIDES.find(
        (s) => s.id === "hero-deals",
      );
      expect(dealsSlide).toBeDefined();
      expect(dealsSlide?.ctaLabel).toBe("تسوق العروض الآن");
      expect(dealsSlide?.href).toBe("/offers");
    });

    it("ensures every category CTA in hero slides references a canonical root category slug", () => {
      HOMEPAGE_HERO_SLIDES.forEach((slide) => {
        if (slide.href.startsWith("/products?category=")) {
          const url = new URL(slide.href, "https://dilmart.store");
          const categorySlug = url.searchParams.get("category");
          expect(categorySlug).toBeTruthy();
          expect(CANONICAL_ROOT_CATEGORY_SLUGS).toContain(categorySlug);
        }
      });
    });

    it("ensures neither 'electronics' nor 'home' shorthand slugs exist in hero slides", () => {
      HOMEPAGE_HERO_SLIDES.forEach((slide) => {
        expect(slide.href).not.toBe("/products?category=electronics");
        expect(slide.href).not.toBe("/products?category=home");
        expect(slide.href).not.toContain("category=electronics&");
        expect(slide.href).not.toContain("category=home&");
      });
    });

    it("ensures side cards route to valid storefront paths", () => {
      const expectedPaths = ["/offers", "/stores"];
      HOMEPAGE_SIDE_CARDS.forEach((card) => {
        expect(expectedPaths).toContain(card.href);
      });
    });
  });

  describe("HeroSlider Component Render Verification", () => {
    it("renders actual clickable navigation links with canonical hrefs", () => {
      render(
        <MemoryRouter>
          <HeroSlider
            slides={HOMEPAGE_HERO_SLIDES}
            sideCards={HOMEPAGE_SIDE_CARDS}
          />
        </MemoryRouter>,
      );

      // Verify electronics CTA link
      const electronicsLink = screen.getByRole("link", {
        name: /استكشف الأجهزة/i,
      });
      expect(electronicsLink).toHaveAttribute(
        "href",
        "/products?category=electronics-accessories",
      );

      // Verify home & kitchen CTA link
      const homeLink = screen.getByRole("link", {
        name: /تصفح مستلزمات المنزل/i,
      });
      expect(homeLink).toHaveAttribute(
        "href",
        "/products?category=home-kitchen",
      );

      // Verify offers CTA link
      const offersLink = screen.getByRole("link", {
        name: /تسوق العروض الآن/i,
      });
      expect(offersLink).toHaveAttribute("href", "/offers");
    });
  });

  describe("CategoryGrid Launch Taxonomy Contract", () => {
    it("generates canonical category URLs for all 7 launch root categories", () => {
      CANONICAL_ROOT_CATEGORY_SLUGS.forEach((slug) => {
        const href = productsCategoryHref(slug);
        expect(href).toBe(`/products?category=${encodeURIComponent(slug)}`);
      });
    });

    it("renders CategoryGrid items with canonical /products?category= links", () => {
      const mockItems = CANONICAL_ROOT_CATEGORY_SLUGS.map((slug, idx) => ({
        id: `cat-${idx}`,
        name: `قسم ${slug}`,
        slug,
        image_url: null,
      }));

      render(
        <MemoryRouter>
          <CategoryGrid
            items={mockItems}
            fallbackImage="data:image/svg+xml,placeholder"
            viewAllHref="/products"
            viewAllLabel="عرض كل الأقسام"
          />
        </MemoryRouter>,
      );

      // Verify view-all link
      const viewAllLink = screen.getByRole("link", {
        name: /عرض كل الأقسام/i,
      });
      expect(viewAllLink).toHaveAttribute("href", "/products");

      // Verify canonical links for electronics and home
      const renderedElectronicsLinks = screen.getAllByRole("link", {
        name: /قسم electronics-accessories/i,
      });
      expect(renderedElectronicsLinks.length).toBeGreaterThanOrEqual(1);
      renderedElectronicsLinks.forEach((link) => {
        expect(link).toHaveAttribute(
          "href",
          "/products?category=electronics-accessories",
        );
      });

      const renderedHomeLinks = screen.getAllByRole("link", {
        name: /قسم home-kitchen/i,
      });
      expect(renderedHomeLinks.length).toBeGreaterThanOrEqual(1);
      renderedHomeLinks.forEach((link) => {
        expect(link).toHaveAttribute(
          "href",
          "/products?category=home-kitchen",
        );
      });
    });
  });
});
