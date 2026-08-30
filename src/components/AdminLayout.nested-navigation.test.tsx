/**
 * AdminLayout must derive its sidebar state AND its header title from the shared backoffice
 * matching rule, so a nested route keeps its parent section highlighted and prefixed siblings never
 * steal it. Pinning it at render level, not only in the pure helper, is what proves the layout
 * actually uses the rule.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "admin-user" },
    profile: { email: "admin@example.com" },
    isAdmin: true,
    loading: false,
    logoutCurrentDevice: vi.fn(),
  }),
}));
vi.mock("@/components/admin/Notifications", () => ({ Notifications: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AdminLayout from "./AdminLayout";

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <AdminLayout>
        <div>page</div>
      </AdminLayout>
    </MemoryRouter>,
  );
}

/** The nav link (not the inner button) carries aria-current, so the active section is explicit. */
function navLink(label: string) {
  return screen.getByRole("link", { name: label });
}

function headerTitle() {
  return within(screen.getByRole("banner")).getByRole("heading", { level: 1 }).textContent;
}

describe("AdminLayout nested navigation state", () => {
  it("keeps الطلبات active on an order detail route", () => {
    renderAt("/admin/orders/test-order");

    expect(navLink("الطلبات")).toHaveAttribute("aria-current", "page");
    expect(headerTitle()).toBe("الطلبات");
    expect(navLink("نظرة عامة")).not.toHaveAttribute("aria-current");
  });

  it("keeps المنتجات active on the product form routes", () => {
    renderAt("/admin/products/abc/edit");

    expect(navLink("المنتجات")).toHaveAttribute("aria-current", "page");
    expect(headerTitle()).toBe("المنتجات");
  });

  it("keeps التجار active on a merchant commercial-agreement route", () => {
    renderAt("/admin/merchants/abc/commercial-agreement");

    expect(navLink("التجار")).toHaveAttribute("aria-current", "page");
    expect(headerTitle()).toBe("التجار");
  });

  it("does not let عمليات التوصيل activate التوصيل", () => {
    renderAt("/admin/delivery-ops");

    expect(navLink("عمليات التوصيل")).toHaveAttribute("aria-current", "page");
    expect(navLink("التوصيل")).not.toHaveAttribute("aria-current");
    expect(headerTitle()).toBe("عمليات التوصيل");
  });

  it("does not let خطط التجار activate التجار", () => {
    renderAt("/admin/merchant-plans");

    expect(navLink("خطط التجار")).toHaveAttribute("aria-current", "page");
    expect(navLink("التجار")).not.toHaveAttribute("aria-current");
    expect(headerTitle()).toBe("خطط التجار");
  });

  it("keeps التسوية المالية active on a finance sub-route (the old hard-coded exception)", () => {
    renderAt("/admin/finance/events");

    expect(navLink("التسوية المالية")).toHaveAttribute("aria-current", "page");
    expect(headerTitle()).toBe("التسوية المالية");
  });

  it("activates نظرة عامة only on the dashboard itself", () => {
    renderAt("/admin");
    expect(navLink("نظرة عامة")).toHaveAttribute("aria-current", "page");
    expect(headerTitle()).toBe("نظرة عامة");
  });

  it("leaves the dashboard inactive on a descendant route", () => {
    renderAt("/admin/users");
    expect(navLink("نظرة عامة")).not.toHaveAttribute("aria-current");
    expect(headerTitle()).toBe("المستخدمين");
  });

  it("falls back to لوحة التحكم for an unmapped route, with nothing marked current", () => {
    renderAt("/admin/unmapped-section");

    expect(headerTitle()).toBe("لوحة التحكم");
    expect(screen.queryByRole("link", { current: "page" })).toBeNull();
  });

  it("marks exactly one navigation link as current", () => {
    renderAt("/admin/finance/payouts");

    expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
  });
});
