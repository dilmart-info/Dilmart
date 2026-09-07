import { describe, expect, it } from "vitest";
import {
  isBottomNavExcluded,
  isBottomNavItemActive,
  EXCLUDED_BOTTOM_NAV_PREFIXES,
} from "./bottom-nav-rules";

describe("bottom-nav-rules — Authoritative Mobile Navigation Contract", () => {
  describe("isBottomNavExcluded", () => {
    it("strictly isolates restricted surfaces", () => {
      const restricted = [
        "/checkout",
        "/checkout/payment",
        "/checkout/shipping",
        "/thank-you",
        "/thank-you/123",
        "/thank-you?order=123",
        "/admin",
        "/admin/products",
        "/admin/orders/456",
        "/merchant",
        "/merchant/dashboard",
        "/merchant/products",
        "/agent",
        "/agent/orders",
      ];

      restricted.forEach((path) => {
        expect(isBottomNavExcluded(path)).toBe(true);
      });
    });

    it("keeps BottomNav visible on all customer shopping, discovery, and auth routes", () => {
      const customerRoutes = [
        "/",
        "/products",
        "/products/featured",
        "/category/electronics",
        "/category/home-kitchen/appliances",
        "/product/smartphone-pro",
        "/cart",
        "/wishlist",
        "/profile",
        "/profile/security/phone",
        "/my-account/orders",
        "/my-account/addresses",
        "/auth",
        "/auth?mode=register",
        "/forgot-password",
        "/claim-account",
        "/stores",
        "/store/baghdad-electronics",
        "/brands",
        "/offers",
        "/track-order",
        "/about",
        "/contact",
        "/terms",
        "/returns",
        "/privacy",
        "/support",
      ];

      customerRoutes.forEach((path) => {
        expect(isBottomNavExcluded(path)).toBe(false);
      });
    });

    it("does not falsely exclude similar route names", () => {
      expect(isBottomNavExcluded("/administration-policy")).toBe(false);
      expect(isBottomNavExcluded("/merchant-program-info")).toBe(false);
      expect(isBottomNavExcluded("/agency-partners")).toBe(false);
      expect(isBottomNavExcluded("/checkout-guide")).toBe(false);
    });

    it("preserves exact canonical excluded prefix list", () => {
      expect(EXCLUDED_BOTTOM_NAV_PREFIXES).toEqual([
        "/checkout",
        "/thank-you",
        "/admin",
        "/merchant",
        "/agent",
      ]);
    });
  });

  describe("isBottomNavItemActive", () => {
    it("activates 'الرئيسية' (/) only on exact '/'", () => {
      expect(isBottomNavItemActive("/", "/")).toBe(true);
      expect(isBottomNavItemActive("/", "/products")).toBe(false);
      expect(isBottomNavItemActive("/", "/auth")).toBe(false);
      expect(isBottomNavItemActive("/", "/profile")).toBe(false);
    });

    it("activates 'الأقسام' (/products) on products, categories, and PDP", () => {
      expect(isBottomNavItemActive("/products", "/products")).toBe(true);
      expect(isBottomNavItemActive("/products", "/products/all")).toBe(true);
      expect(isBottomNavItemActive("/products", "/category/electronics")).toBe(true);
      expect(isBottomNavItemActive("/products", "/product/super-watch")).toBe(true);
      expect(isBottomNavItemActive("/products", "/")).toBe(false);
      expect(isBottomNavItemActive("/products", "/cart")).toBe(false);
    });

    it("activates 'المفضلة' (/wishlist) on wishlist routes", () => {
      expect(isBottomNavItemActive("/wishlist", "/wishlist")).toBe(true);
      expect(isBottomNavItemActive("/wishlist", "/products")).toBe(false);
    });

    it("activates 'حسابي' (/profile) on customer profile and my-account routes", () => {
      expect(isBottomNavItemActive("/profile", "/profile")).toBe(true);
      expect(isBottomNavItemActive("/profile", "/profile/security/phone")).toBe(true);
      expect(isBottomNavItemActive("/profile", "/my-account/orders")).toBe(true);
      expect(isBottomNavItemActive("/profile", "/my-account/addresses")).toBe(true);

      // Must NOT activate on auth or recovery routes
      expect(isBottomNavItemActive("/profile", "/auth")).toBe(false);
      expect(isBottomNavItemActive("/profile", "/forgot-password")).toBe(false);
      expect(isBottomNavItemActive("/profile", "/claim-account")).toBe(false);
    });

    it("activates 'السلة' (/cart) on cart routes", () => {
      expect(isBottomNavItemActive("/cart", "/cart")).toBe(true);
      expect(isBottomNavItemActive("/cart", "/checkout")).toBe(false);
    });

    it("does not activate any navigation item on auth or recovery routes", () => {
      const authRoutes = ["/auth", "/forgot-password", "/claim-account"];
      const items = ["/", "/products", "/wishlist", "/profile", "/cart"];

      authRoutes.forEach((route) => {
        items.forEach((item) => {
          expect(isBottomNavItemActive(item, route)).toBe(false);
        });
      });
    });

    it("does not activate any navigation item on discovery or info routes", () => {
      const discoveryRoutes = ["/stores", "/brands", "/offers", "/track-order", "/about", "/support"];
      const items = ["/", "/products", "/wishlist", "/profile", "/cart"];

      discoveryRoutes.forEach((route) => {
        items.forEach((item) => {
          expect(isBottomNavItemActive(item, route)).toBe(false);
        });
      });
    });
  });
});
