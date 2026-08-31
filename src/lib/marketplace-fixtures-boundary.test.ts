import { describe, it, expect, vi, beforeEach } from "vitest";
import { marketplaceApi } from "@/lib/api/marketplace";
import * as apiCore from "@/lib/api-core";
import * as fixtures from "@/lib/marketplace-fixtures";

describe("Marketplace Visual Fixtures Boundary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Production Mode (fixtures disabled)", () => {
    beforeEach(() => {
      vi.spyOn(fixtures, "isMarketplaceVisualFixturesEnabled").mockReturnValue(false);
    });

    it("propagates API error for getMarketplaceHome and does NOT return fake fixtures", async () => {
      vi.spyOn(apiCore, "request").mockRejectedValueOnce(new Error("Production 500 Network Error"));

      await expect(marketplaceApi.getMarketplaceHome()).rejects.toThrow("Production 500 Network Error");
    });

    it("propagates API error for getMarketplaceCategories and does NOT return fake fixtures", async () => {
      vi.spyOn(apiCore, "request").mockRejectedValueOnce(new Error("Production categories fetch failed"));

      await expect(marketplaceApi.getMarketplaceCategories()).rejects.toThrow("Production categories fetch failed");
    });

    it("propagates API error for getMarketplaceBrands and does NOT return fake fixtures", async () => {
      vi.spyOn(apiCore, "request").mockRejectedValueOnce(new Error("Production brands fetch failed"));

      await expect(marketplaceApi.getMarketplaceBrands()).rejects.toThrow("Production brands fetch failed");
    });

    it("propagates API error for getMarketplaceProducts and does NOT return fake fixtures", async () => {
      vi.spyOn(apiCore, "request").mockRejectedValueOnce(new Error("Production products fetch failed"));

      await expect(marketplaceApi.getMarketplaceProducts({})).rejects.toThrow("Production products fetch failed");
    });

    it("returns real empty response as empty without replacing with fake inventory", async () => {
      vi.spyOn(apiCore, "request").mockResolvedValueOnce({
        categories: [],
        featuredProducts: [],
        newProducts: [],
        offerProducts: [],
        featuredMerchants: [],
      });

      const res = await marketplaceApi.getMarketplaceHome();
      expect(res.categories).toEqual([]);
      expect(res.featuredProducts).toEqual([]);
    });
  });

  describe("Development Visual Fixture Mode (fixtures enabled)", () => {
    beforeEach(() => {
      vi.spyOn(fixtures, "isMarketplaceVisualFixturesEnabled").mockReturnValue(true);
    });

    it("returns rich visual fixtures when backend is offline in development", async () => {
      vi.spyOn(apiCore, "request").mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const home = await marketplaceApi.getMarketplaceHome();
      expect(home.categories.length).toBeGreaterThan(0);
      expect(home.featuredProducts.length).toBeGreaterThan(0);
      expect(home.offerProducts.length).toBeGreaterThan(0);
    });

    it("returns categories fixtures when backend is offline in development", async () => {
      vi.spyOn(apiCore, "request").mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const categories = await marketplaceApi.getMarketplaceCategories();
      expect(categories.length).toBeGreaterThan(0);
      expect(categories[0].name).toBeDefined();
    });

    it("returns brands fixtures when backend is offline in development", async () => {
      vi.spyOn(apiCore, "request").mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const brands = await marketplaceApi.getMarketplaceBrands();
      expect(brands.brands.length).toBeGreaterThan(0);
    });

    it("returns discovery products fixtures when backend is offline in development", async () => {
      vi.spyOn(apiCore, "request").mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const products = await marketplaceApi.getMarketplaceProducts({});
      expect(products.items.length).toBeGreaterThan(0);
    });
  });
});
