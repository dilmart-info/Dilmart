import { describe, expect, it } from "vitest";
import { CUSTOMER_ROUTE_PATHS } from "@/app/CustomerRoutes";
import { WEB_BACKOFFICE_ROUTE_PATHS } from "@/app/WebBackofficeRoutes";

describe("Customer route surface", () => {
  it("registers core customer marketplace paths", () => {
    const required = [
      "/",
      "/products",
      "/product/:slug",
      "/cart",
      "/checkout",
      "/auth",
      "/profile",
      "/my-account/orders",
    ];
    for (const path of required) {
      expect(CUSTOMER_ROUTE_PATHS).toContain(path);
    }
  });

  it("does not register admin/merchant/agent paths on the customer surface", () => {
    const forbidden = ["/admin", "/admin/login", "/merchant", "/merchant/login", "/agent/orders"];
    for (const path of forbidden) {
      expect(CUSTOMER_ROUTE_PATHS).not.toContain(path);
    }
  });
});

describe("Web backoffice surface", () => {
  it("preserves admin/merchant/agent entry paths for web", () => {
    for (const path of ["/admin/login", "/admin", "/merchant/login", "/merchant", "/agent/orders"]) {
      expect(WEB_BACKOFFICE_ROUTE_PATHS).toContain(path);
    }
  });
});
