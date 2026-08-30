/**
 * Backoffice navigation matching (DilMart-STORE-BACKOFFICE-NAV-STATE-001).
 *
 * The layouts used to compare `location.pathname === item.href`, so every nested route lost its
 * parent navigation state. These cases pin the replacement rules: trailing-slash normalization,
 * section roots matching exactly, descendants matching only at a path boundary — the last of which
 * is what keeps `/admin/delivery-ops` off `/admin/delivery` and `/admin/merchant-plans` off
 * `/admin/merchants`.
 */
import { describe, it, expect } from "vitest";
import { findActiveBackofficeNavItem, isBackofficeNavPathActive } from "./backoffice-navigation";

const ADMIN_ROOT = "/admin";
const ADMIN_ORDERS = "/admin/orders";
const ADMIN_PRODUCTS = "/admin/products";
const ADMIN_MERCHANTS = "/admin/merchants";
const ADMIN_FINANCE = "/admin/finance";
const ADMIN_DELIVERY = "/admin/delivery";
const MERCHANT_ROOT = "/merchant/"; // the overview item's href really does carry a trailing slash
const MERCHANT_PRODUCTS = "/merchant/products";
const MERCHANT_ORDERS = "/merchant/orders";

describe("admin section root", () => {
  it("is active only for the dashboard itself", () => {
    expect(isBackofficeNavPathActive("/admin", ADMIN_ROOT)).toBe(true);
    expect(isBackofficeNavPathActive("/admin/", ADMIN_ROOT)).toBe(true);
  });

  it("is not active for any descendant route", () => {
    for (const path of ["/admin/orders", "/admin/products/new", "/admin/finance/events", "/admin/users"]) {
      expect(isBackofficeNavPathActive(path, ADMIN_ROOT)).toBe(false);
    }
  });
});

describe("admin nested routes keep the parent active", () => {
  it("orders", () => {
    expect(isBackofficeNavPathActive("/admin/orders", ADMIN_ORDERS)).toBe(true);
    expect(isBackofficeNavPathActive("/admin/orders/abc", ADMIN_ORDERS)).toBe(true);
    expect(isBackofficeNavPathActive("/admin/orders/", ADMIN_ORDERS)).toBe(true);
  });

  it("products", () => {
    expect(isBackofficeNavPathActive("/admin/products", ADMIN_PRODUCTS)).toBe(true);
    expect(isBackofficeNavPathActive("/admin/products/new", ADMIN_PRODUCTS)).toBe(true);
    expect(isBackofficeNavPathActive("/admin/products/abc/edit", ADMIN_PRODUCTS)).toBe(true);
  });

  it("merchants", () => {
    expect(isBackofficeNavPathActive("/admin/merchants", ADMIN_MERCHANTS)).toBe(true);
    expect(isBackofficeNavPathActive("/admin/merchants/new", ADMIN_MERCHANTS)).toBe(true);
    expect(isBackofficeNavPathActive("/admin/merchants/abc", ADMIN_MERCHANTS)).toBe(true);
    expect(isBackofficeNavPathActive("/admin/merchants/abc/commercial-agreement", ADMIN_MERCHANTS)).toBe(true);
  });

  it("finance — without the old hard-coded exception", () => {
    for (const path of [
      "/admin/finance",
      "/admin/finance/orders",
      "/admin/finance/merchants",
      "/admin/finance/couriers",
      "/admin/finance/payouts",
      "/admin/finance/adjustments",
      "/admin/finance/reversals",
      "/admin/finance/events",
    ]) {
      expect(isBackofficeNavPathActive(path, ADMIN_FINANCE)).toBe(true);
    }
  });
});

describe("sibling routes that share a prefix must not collide", () => {
  it("delivery does not swallow delivery-ops or delivery-intelligence", () => {
    expect(isBackofficeNavPathActive("/admin/delivery-ops", ADMIN_DELIVERY)).toBe(false);
    expect(isBackofficeNavPathActive("/admin/delivery-intelligence", ADMIN_DELIVERY)).toBe(false);
    expect(isBackofficeNavPathActive("/admin/delivery", ADMIN_DELIVERY)).toBe(true);
  });

  it("merchants does not swallow merchant-plans or merchant-plan-assignments", () => {
    expect(isBackofficeNavPathActive("/admin/merchant-plans", ADMIN_MERCHANTS)).toBe(false);
    expect(isBackofficeNavPathActive("/admin/merchant-plan-assignments", ADMIN_MERCHANTS)).toBe(false);
  });

  it("products does not swallow products-old", () => {
    expect(isBackofficeNavPathActive("/admin/products-old", ADMIN_PRODUCTS)).toBe(false);
  });

  it("finance does not swallow finance-reconciliation", () => {
    expect(isBackofficeNavPathActive("/admin/finance-reconciliation", ADMIN_FINANCE)).toBe(false);
  });
});

describe("merchant section root", () => {
  it("is active for both the slashed and unslashed overview route", () => {
    expect(isBackofficeNavPathActive("/merchant", MERCHANT_ROOT)).toBe(true);
    expect(isBackofficeNavPathActive("/merchant/", MERCHANT_ROOT)).toBe(true);
  });

  it("is not active for a merchant sub-section", () => {
    for (const path of ["/merchant/products", "/merchant/orders/abc", "/merchant/settings"]) {
      expect(isBackofficeNavPathActive(path, MERCHANT_ROOT)).toBe(false);
    }
  });
});

describe("merchant nested routes keep the parent active", () => {
  it("products", () => {
    for (const path of [
      "/merchant/products",
      "/merchant/products/import",
      "/merchant/products/new",
      "/merchant/products/abc/edit",
    ]) {
      expect(isBackofficeNavPathActive(path, MERCHANT_PRODUCTS)).toBe(true);
    }
  });

  it("orders", () => {
    expect(isBackofficeNavPathActive("/merchant/orders", MERCHANT_ORDERS)).toBe(true);
    expect(isBackofficeNavPathActive("/merchant/orders/abc", MERCHANT_ORDERS)).toBe(true);
  });

  it("does not collide with prefixed siblings", () => {
    expect(isBackofficeNavPathActive("/merchant/products-old", MERCHANT_PRODUCTS)).toBe(false);
    expect(isBackofficeNavPathActive("/merchant/orders-old", MERCHANT_ORDERS)).toBe(false);
  });
});

describe("findActiveBackofficeNavItem", () => {
  const adminNav = [
    { label: "نظرة عامة", href: "/admin" },
    { label: "التسوية المالية", href: "/admin/finance" },
    { label: "الطلبات", href: "/admin/orders" },
    { label: "المنتجات", href: "/admin/products" },
    { label: "التوصيل", href: "/admin/delivery" },
    { label: "عمليات التوصيل", href: "/admin/delivery-ops" },
    { label: "التجار", href: "/admin/merchants" },
    { label: "خطط التجار", href: "/admin/merchant-plans" },
  ];
  const merchantNav = [
    { label: "نظرة عامة", href: "/merchant/" },
    { label: "المنتجات", href: "/merchant/products" },
    { label: "الطلبات", href: "/merchant/orders" },
    { label: "الإعدادات", href: "/merchant/settings" },
  ];

  it.each([
    ["/admin", "نظرة عامة"],
    ["/admin/orders/abc", "الطلبات"],
    ["/admin/products/new", "المنتجات"],
    ["/admin/products/abc/edit", "المنتجات"],
    ["/admin/merchants/abc/commercial-agreement", "التجار"],
    ["/admin/finance/events", "التسوية المالية"],
    ["/admin/delivery-ops", "عمليات التوصيل"],
    ["/admin/merchant-plans", "خطط التجار"],
  ])("admin %s resolves to %s", (pathname, label) => {
    expect(findActiveBackofficeNavItem(adminNav, pathname)?.label).toBe(label);
  });

  it.each([
    ["/merchant", "نظرة عامة"],
    ["/merchant/", "نظرة عامة"],
    ["/merchant/products/import", "المنتجات"],
    ["/merchant/orders/abc", "الطلبات"],
    ["/merchant/settings", "الإعدادات"],
  ])("merchant %s resolves to %s", (pathname, label) => {
    expect(findActiveBackofficeNavItem(merchantNav, pathname)?.label).toBe(label);
  });

  it("returns undefined for an unmapped route so the caller keeps its fallback title", () => {
    expect(findActiveBackofficeNavItem(adminNav, "/admin/unmapped-section")).toBeUndefined();
    expect(findActiveBackofficeNavItem(merchantNav, "/merchant/unmapped-section")).toBeUndefined();
  });
});
