import { describe, it, expect } from "vitest";
import { resolveInternalRouteFromUrl } from "./native-url-handler";

describe("Native URL Handler", () => {
  it("resolves valid product URL from dilmart.store", () => {
    expect(resolveInternalRouteFromUrl("https://dilmart.store/product/mens-shaver-pro")).toBe(
      "/product/mens-shaver-pro",
    );
    expect(resolveInternalRouteFromUrl("https://www.dilmart.store/product/item-123")).toBe(
      "/product/item-123",
    );
  });

  it("resolves valid category URL", () => {
    expect(resolveInternalRouteFromUrl("https://dilmart.store/category/electronics")).toBe(
      "/category/electronics",
    );
  });

  it("resolves valid store URL", () => {
    expect(resolveInternalRouteFromUrl("https://dilmart.store/store/baghdad-merchant")).toBe(
      "/merchants/baghdad-merchant",
    );
    expect(resolveInternalRouteFromUrl("https://dilmart.store/merchants/baghdad-merchant")).toBe(
      "/merchants/baghdad-merchant",
    );
  });

  it("resolves valid marketplace routes (/products, /offers, /cart, /profile)", () => {
    expect(resolveInternalRouteFromUrl("https://dilmart.store/products")).toBe("/products");
    expect(resolveInternalRouteFromUrl("https://dilmart.store/products?brand=sony")).toBe(
      "/products?brand=sony",
    );
    expect(resolveInternalRouteFromUrl("https://dilmart.store/offers")).toBe("/offers");
    expect(resolveInternalRouteFromUrl("https://dilmart.store/cart")).toBe("/cart");
    expect(resolveInternalRouteFromUrl("https://dilmart.store/profile")).toBe("/profile");
  });

  it("resolves custom scheme dilmart:// URLs", () => {
    expect(resolveInternalRouteFromUrl("dilmart://product/shaver-pro")).toBe(
      "/product/shaver-pro",
    );
    expect(resolveInternalRouteFromUrl("dilmart://category/hair-care")).toBe(
      "/category/hair-care",
    );
    expect(resolveInternalRouteFromUrl("dilmart://cart")).toBe("/cart");
  });

  it("rejects foreign origins (fails closed)", () => {
    expect(resolveInternalRouteFromUrl("https://malicious-site.com/product/item-1")).toBeNull();
    expect(resolveInternalRouteFromUrl("https://evil-dilmart.com/category/test")).toBeNull();
  });

  it("rejects unsupported internal paths (admin, internal API, unknown paths)", () => {
    expect(resolveInternalRouteFromUrl("https://dilmart.store/admin/settings")).toBeNull();
    expect(resolveInternalRouteFromUrl("https://dilmart.store/merchant/dashboard")).toBeNull();
    expect(resolveInternalRouteFromUrl("https://dilmart.store/api/v1/secret")).toBeNull();
    expect(resolveInternalRouteFromUrl("https://dilmart.store/unknown/route/here")).toBeNull();
  });

  it("rejects malformed URLs, XSS payloads, and path traversal", () => {
    expect(resolveInternalRouteFromUrl("not a url")).toBeNull();
    expect(resolveInternalRouteFromUrl("https://dilmart.store/product/../etc/passwd")).toBeNull();
    expect(resolveInternalRouteFromUrl("https://dilmart.store/product/<script>alert(1)</script>")).toBeNull();
    expect(resolveInternalRouteFromUrl("javascript:alert(1)")).toBeNull();
    expect(resolveInternalRouteFromUrl(null)).toBeNull();
    expect(resolveInternalRouteFromUrl(undefined)).toBeNull();
    expect(resolveInternalRouteFromUrl("")).toBeNull();
  });
});
