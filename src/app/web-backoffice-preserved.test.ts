import { describe, expect, it } from "vitest";
import { getWebBackofficeRouteElements } from "@/app/WebBackofficeRoutes";

describe("WebApp backoffice registration", () => {
  it("includes admin, merchant, and agent route elements", () => {
    const els = getWebBackofficeRouteElements();
    const paths = els.map((el) => el.props.path as string);
    expect(paths).toContain("/admin/login");
    expect(paths).toContain("/admin");
    expect(paths).toContain("/merchant/login");
    expect(paths).toContain("/merchant");
    expect(paths).toContain("/agent/orders");
  });
});
