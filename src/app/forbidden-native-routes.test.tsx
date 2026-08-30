import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes } from "react-router-dom";
import { getCustomerMobileRouteElements } from "@/app/CustomerRoutes";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: null,
    session: null,
    isAdmin: false,
    isMerchantUser: false,
    isMerchantApplicant: false,
    isAgent: false,
    authStatus: "unauthenticated",
    bootstrapDelayed: false,
    contextLoading: false,
    context: null,
    storageError: null,
    isOffline: false,
    retryStorageBootstrap: vi.fn(),
    logoutCurrentDevice: vi.fn(),
  }),
}));

vi.mock("@/components/NotificationHub", () => ({
  NotificationHub: () => null,
}));

vi.mock("@/components/ReentryTrackingHub", () => ({
  default: () => null,
  ReentryTrackingHub: () => null,
}));

vi.mock("@/components/FlyingCartAnimation", () => ({
  default: () => null,
}));

vi.mock("@/components/BottomNav", () => ({
  default: () => null,
}));

vi.mock("@/components/CapacitorAppWrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function renderCustomerMobileSurface(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>{getCustomerMobileRouteElements()}</Routes>
    </MemoryRouter>,
  );
}

describe("Forbidden native routes (shared mobile route factory)", () => {
  it("does not render AdminLogin for /admin/login", () => {
    renderCustomerMobileSurface("/admin/login");
    expect(screen.queryByText(/لوحة التحكم|Admin Login|تسجيل دخول الإدارة/i)).not.toBeInTheDocument();
    expect(document.body.textContent || "").not.toMatch(/RequirePlatformAdmin/);
  });

  it("does not render MerchantLogin for /merchant/login", () => {
    renderCustomerMobileSurface("/merchant/login");
    expect(screen.queryByRole("heading", { name: /تاجر|Merchant/i })).not.toBeInTheDocument();
  });

  it("does not render AgentOrders for /agent/orders", () => {
    renderCustomerMobileSurface("/agent/orders");
    expect(screen.queryByText(/طلبات المندوب|AgentOrders/i)).not.toBeInTheDocument();
  });

  it("uses the same factory paths as CustomerMobileApp (no duplicated backoffice route list)", () => {
    const els = getCustomerMobileRouteElements();
    const paths = els.map((el) => el.props.path as string);
    expect(paths).toEqual(
      expect.arrayContaining(["/admin", "/admin/*", "/merchant", "/merchant/*", "/agent", "/agent/*", "*"]),
    );
  });

  it("does not expose backoffice login entry UI text on forbidden paths", () => {
    for (const path of ["/admin/login", "/merchant/login", "/agent/orders"]) {
      const { unmount } = renderCustomerMobileSurface(path);
      const html = document.body.innerHTML;
      expect(html).not.toMatch(/href=["']\/admin/i);
      expect(html).not.toMatch(/href=["']\/merchant/i);
      expect(html).not.toMatch(/href=["']\/agent/i);
      unmount();
    }
  });
});
