import { describe, expect, it } from "vitest";
import { sanitizeCustomerDestination } from "@/lib/auth/safe-redirect";

describe("sanitizeCustomerDestination — Safe Customer Destination Validation", () => {
  it("defaults to /profile for empty, null, or undefined values", () => {
    expect(sanitizeCustomerDestination()).toBe("/profile");
    expect(sanitizeCustomerDestination(null)).toBe("/profile");
    expect(sanitizeCustomerDestination("")).toBe("/profile");
    expect(sanitizeCustomerDestination("   ")).toBe("/profile");
  });

  it("permits allowlisted exact customer destinations", () => {
    expect(sanitizeCustomerDestination("/")).toBe("/");
    expect(sanitizeCustomerDestination("/products")).toBe("/products");
    expect(sanitizeCustomerDestination("/cart")).toBe("/cart");
    expect(sanitizeCustomerDestination("/checkout")).toBe("/checkout");
    expect(sanitizeCustomerDestination("/thank-you")).toBe("/thank-you");
    expect(sanitizeCustomerDestination("/profile")).toBe("/profile");
    expect(sanitizeCustomerDestination("/wishlist")).toBe("/wishlist");
    expect(sanitizeCustomerDestination("/track-order")).toBe("/track-order");
    expect(sanitizeCustomerDestination("/my-account/orders")).toBe("/my-account/orders");
    expect(sanitizeCustomerDestination("/my-account/addresses")).toBe("/my-account/addresses");
  });

  it("permits allowlisted dynamic routes with valid slugs and preserves pathname casing", () => {
    expect(sanitizeCustomerDestination("/store/vendor-one")).toBe("/store/vendor-one");
    expect(sanitizeCustomerDestination("/product/iPhone-15-Pro-Max")).toBe("/product/iPhone-15-Pro-Max");
    expect(sanitizeCustomerDestination("/category/Smart-Watches")).toBe("/category/Smart-Watches");
  });

  it("preserves both query parameters and hash fragments without truncation", () => {
    expect(sanitizeCustomerDestination("/products?category=home#latest")).toBe("/products?category=home#latest");
    expect(sanitizeCustomerDestination("/track-order?order=ORD-123#status")).toBe("/track-order?order=ORD-123#status");
    expect(sanitizeCustomerDestination("/store/vendor-one?tab=reviews#top")).toBe("/store/vendor-one?tab=reviews#top");
  });

  it("rejects empty dynamic routes without slugs", () => {
    expect(sanitizeCustomerDestination("/product/")).toBe("/profile");
    expect(sanitizeCustomerDestination("/store/")).toBe("/profile");
    expect(sanitizeCustomerDestination("/category/")).toBe("/profile");
  });

  it("rejects false prefix matches and unregistered routes", () => {
    expect(sanitizeCustomerDestination("/storefront/test")).toBe("/profile");
    expect(sanitizeCustomerDestination("/storefront-sample")).toBe("/profile");
    expect(sanitizeCustomerDestination("/productx/123")).toBe("/profile");
    expect(sanitizeCustomerDestination("/unknown-secret-page")).toBe("/profile");
    expect(sanitizeCustomerDestination("/admin-example")).toBe("/profile");
  });

  it("rejects backoffice portals, API routes, and auth loop pages", () => {
    expect(sanitizeCustomerDestination("/admin")).toBe("/profile");
    expect(sanitizeCustomerDestination("/admin/merchants")).toBe("/profile");
    expect(sanitizeCustomerDestination("/merchant")).toBe("/profile");
    expect(sanitizeCustomerDestination("/merchant/settings")).toBe("/profile");
    expect(sanitizeCustomerDestination("/agent")).toBe("/profile");
    expect(sanitizeCustomerDestination("/agent/deliveries")).toBe("/profile");
    expect(sanitizeCustomerDestination("/api/auth/hook")).toBe("/profile");
    expect(sanitizeCustomerDestination("/auth")).toBe("/profile");
    expect(sanitizeCustomerDestination("/forgot-password")).toBe("/profile");
  });

  it("rejects external URLs, protocol-relative URLs, and scheme injection", () => {
    expect(sanitizeCustomerDestination("https://attacker.com")).toBe("/profile");
    expect(sanitizeCustomerDestination("http://evil.com/products")).toBe("/profile");
    expect(sanitizeCustomerDestination("//evil.com/cart")).toBe("/profile");
    expect(sanitizeCustomerDestination("javascript:alert(1)")).toBe("/profile");
    expect(sanitizeCustomerDestination("data:text/html,evil")).toBe("/profile");
  });

  it("rejects backslashes, control characters, and ambiguous encoded path separators", () => {
    expect(sanitizeCustomerDestination("/\\evil.com")).toBe("/profile");
    expect(sanitizeCustomerDestination("/products\\test")).toBe("/profile");
    expect(sanitizeCustomerDestination("/products\x00extra")).toBe("/profile");
    expect(sanitizeCustomerDestination("/%2fadmin")).toBe("/profile");
    expect(sanitizeCustomerDestination("/%5cadmin")).toBe("/profile");
    expect(sanitizeCustomerDestination("/products%00test")).toBe("/profile");
  });
});
