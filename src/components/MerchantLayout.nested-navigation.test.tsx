/**
 * MerchantLayout must use the same backoffice matching rule for the sidebar and the header title.
 * Its overview href carries a trailing slash (`/merchant/`) while the route may be `/merchant`, so
 * before this change the overview item was inactive on its own page, and every nested products or
 * orders route fell back to the generic "بوابة التاجر" title.
 *
 * Only external behaviour is mocked; the layout's own authorization branch is untouched.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "merchant-user" },
    profile: { email: "merchant@example.com" },
    isMerchantUser: true,
    loading: false,
    logoutCurrentDevice: vi.fn(),
  }),
}));

const setActiveMerchantId = vi.fn(() => true);
vi.mock("@/hooks/use-current-merchant", () => ({
  useCurrentMerchant: () => ({
    data: { merchant_id: "merchant-1", merchants: { display_name: "متجر تجريبي", status: "active" } },
    memberships: [{ merchant_id: "merchant-1", merchants: { display_name: "متجر تجريبي" } }],
    activeMemberships: [{ merchant_id: "merchant-1", merchants: { display_name: "متجر تجريبي" } }],
    hasNoActiveMerchant: false,
    setActiveMerchantId,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-pending-orders", () => ({
  usePendingOrders: () => ({
    pendingOrders: [],
    count: 0,
    currentOrderId: null,
    refetch: vi.fn().mockResolvedValue(undefined),
    merchantId: "merchant-1",
  }),
}));

vi.mock("@/components/merchant/MerchantNotifications", () => ({ MerchantNotifications: () => null }));
vi.mock("@/components/merchant/MerchantNewOrderAlertBanner", () => ({ MerchantNewOrderAlertBanner: () => null }));
vi.mock("@/components/merchant/MerchantPwaBootstrap", () => ({ MerchantPwaBootstrap: () => null }));
vi.mock("@/components/merchant/MerchantDecisionModal", () => ({ default: () => null }));
vi.mock("@/lib/merchant-push", () => ({ getOrCreateMerchantDeviceId: () => "device-1" }));
vi.mock("@/lib/notifications", () => ({ stopMerchantOrderAlertLoop: vi.fn() }));
vi.mock("@/lib/api/merchant", () => ({ merchantApi: { acknowledgeMerchantNotification: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import MerchantLayout from "./MerchantLayout";

function renderAt(pathname: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[pathname]}>
        <MerchantLayout>
          <div>page</div>
        </MerchantLayout>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The desktop sidebar and the mobile Sheet render the same navigation, so scope the query. */
function sidebarLink(label: string) {
  const [sidebar] = screen.getAllByRole("navigation");
  return within(sidebar).getByRole("link", { name: label });
}

function headerTitle() {
  return within(screen.getByRole("banner")).getByRole("heading", { level: 1 }).textContent;
}

describe("MerchantLayout nested navigation state", () => {
  it("activates نظرة عامة on the unslashed overview route", () => {
    renderAt("/merchant");

    expect(sidebarLink("نظرة عامة")).toHaveAttribute("aria-current", "page");
    expect(headerTitle()).toBe("نظرة عامة");
  });

  it("activates نظرة عامة on the slashed overview route", () => {
    renderAt("/merchant/");

    expect(sidebarLink("نظرة عامة")).toHaveAttribute("aria-current", "page");
    expect(headerTitle()).toBe("نظرة عامة");
  });

  it("keeps المنتجات active on the import route", () => {
    renderAt("/merchant/products/import");

    expect(sidebarLink("المنتجات")).toHaveAttribute("aria-current", "page");
    expect(sidebarLink("نظرة عامة")).not.toHaveAttribute("aria-current");
    expect(headerTitle()).toBe("المنتجات");
  });

  it("keeps المنتجات active on the product edit route", () => {
    renderAt("/merchant/products/abc/edit");

    expect(sidebarLink("المنتجات")).toHaveAttribute("aria-current", "page");
    expect(headerTitle()).toBe("المنتجات");
  });

  it("keeps الطلبات active on an order detail route", () => {
    renderAt("/merchant/orders/test-order");

    expect(sidebarLink("الطلبات")).toHaveAttribute("aria-current", "page");
    expect(headerTitle()).toBe("الطلبات");
  });

  it("keeps the exact-only sections exact", () => {
    renderAt("/merchant/settings");

    expect(sidebarLink("الإعدادات")).toHaveAttribute("aria-current", "page");
    expect(headerTitle()).toBe("الإعدادات");
  });

  it("falls back to بوابة التاجر for an unmapped route", () => {
    renderAt("/merchant/unmapped-section");

    expect(headerTitle()).toBe("بوابة التاجر");
    const [sidebar] = screen.getAllByRole("navigation");
    expect(within(sidebar).queryByRole("link", { current: "page" })).toBeNull();
  });

  it("marks exactly one sidebar link as current", () => {
    renderAt("/merchant/orders/abc");

    const [sidebar] = screen.getAllByRole("navigation");
    expect(within(sidebar).getAllByRole("link", { current: "page" })).toHaveLength(1);
  });
});
