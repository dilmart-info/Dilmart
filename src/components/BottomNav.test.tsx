import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BottomNav from "@/components/BottomNav";

const isNativeMock = vi.fn();
let mockItemCount = 0;

vi.mock("@/lib/capacitor", () => ({
  isNative: () => isNativeMock(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: null,
    session: null,
    isMerchantUser: false,
    isAdmin: false,
    isAgent: false,
    authStatus: "unauthenticated",
  }),
}));

vi.mock("@/lib/cart-store", () => ({
  useCartStore: (selector?: (state: { getItemCount: () => number }) => number) => {
    const state = {
      getItemCount: () => mockItemCount,
    };
    return typeof selector === "function" ? selector(state) : state;
  },
}));

describe("BottomNav — Persistent Storefront Navigation Contract", () => {
  beforeEach(() => {
    isNativeMock.mockReset();
    isNativeMock.mockReturnValue(true);
    mockItemCount = 0;
  });

  describe("Route Visibility", () => {
    const visibleRoutes = [
      "/",
      "/products",
      "/products?category=electronics",
      "/product/sample-slug-123",
      "/cart",
      "/wishlist",
      "/profile",
      "/my-account/orders",
      "/my-account/addresses",
      "/stores",
      "/brands",
      "/offers",
      "/track-order",
    ];

    visibleRoutes.forEach((route) => {
      it(`renders persistent bottom navigation on customer route: ${route}`, () => {
        render(
          <MemoryRouter initialEntries={[route]}>
            <BottomNav />
          </MemoryRouter>,
        );
        expect(screen.getByTestId("mobile-bottom-nav")).toBeInTheDocument();
        expect(screen.getByRole("navigation", { name: "شريط التنقل الرئيسي" })).toBeInTheDocument();
      });
    });

    const hiddenRoutes = [
      "/checkout",
      "/checkout/payment",
      "/thank-you",
      "/thank-you?order=123",
      "/auth",
      "/forgot-password",
      "/claim-account",
      "/admin",
      "/admin/products",
      "/merchant",
      "/merchant/dashboard",
      "/agent",
    ];

    hiddenRoutes.forEach((route) => {
      it(`strictly hides bottom navigation on restricted route: ${route}`, () => {
        render(
          <MemoryRouter initialEntries={[route]}>
            <BottomNav />
          </MemoryRouter>,
        );
        expect(screen.queryByTestId("mobile-bottom-nav")).not.toBeInTheDocument();
      });
    });
  });

  describe("Active Item Destination Highlighting", () => {
    it("highlights 'الرئيسية' on '/'", () => {
      render(
        <MemoryRouter initialEntries={["/"]}>
          <BottomNav />
        </MemoryRouter>,
      );
      const homeLink = screen.getByRole("link", { name: "الرئيسية" });
      expect(homeLink).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("link", { name: "الأقسام" })).not.toHaveAttribute("aria-current");
    });

    it("highlights 'الأقسام' on '/products'", () => {
      render(
        <MemoryRouter initialEntries={["/products"]}>
          <BottomNav />
        </MemoryRouter>,
      );
      expect(screen.getByRole("link", { name: "الأقسام" })).toHaveAttribute("aria-current", "page");
    });

    it("highlights 'الأقسام' on category browsing '/products?category=home'", () => {
      render(
        <MemoryRouter initialEntries={["/products?category=home"]}>
          <BottomNav />
        </MemoryRouter>,
      );
      expect(screen.getByRole("link", { name: "الأقسام" })).toHaveAttribute("aria-current", "page");
    });

    it("highlights 'الأقسام' on PDP '/product/my-item'", () => {
      render(
        <MemoryRouter initialEntries={["/product/my-item"]}>
          <BottomNav />
        </MemoryRouter>,
      );
      expect(screen.getByRole("link", { name: "الأقسام" })).toHaveAttribute("aria-current", "page");
    });

    it("highlights 'المفضلة' on '/wishlist'", () => {
      render(
        <MemoryRouter initialEntries={["/wishlist"]}>
          <BottomNav />
        </MemoryRouter>,
      );
      expect(screen.getByRole("link", { name: "المفضلة" })).toHaveAttribute("aria-current", "page");
    });

    it("highlights 'حسابي' on '/profile'", () => {
      render(
        <MemoryRouter initialEntries={["/profile"]}>
          <BottomNav />
        </MemoryRouter>,
      );
      expect(screen.getByRole("link", { name: "حسابي" })).toHaveAttribute("aria-current", "page");
    });

    it("highlights 'حسابي' on '/my-account/orders'", () => {
      render(
        <MemoryRouter initialEntries={["/my-account/orders"]}>
          <BottomNav />
        </MemoryRouter>,
      );
      expect(screen.getByRole("link", { name: "حسابي" })).toHaveAttribute("aria-current", "page");
    });

    it("highlights 'السلة' on '/cart'", () => {
      render(
        <MemoryRouter initialEntries={["/cart"]}>
          <BottomNav />
        </MemoryRouter>,
      );
      expect(screen.getByRole("link", { name: "السلة" })).toHaveAttribute("aria-current", "page");
    });

    it("does NOT highlight any item on discovery routes like '/stores' or '/track-order'", () => {
      render(
        <MemoryRouter initialEntries={["/stores"]}>
          <BottomNav />
        </MemoryRouter>,
      );
      const links = screen.getAllByRole("link");
      links.forEach((l) => {
        expect(l).not.toHaveAttribute("aria-current");
      });
    });
  });

  describe("Cart Badge Reactivity & Touch Targets", () => {
    it("renders cart badge with correct reactive count when > 0", () => {
      mockItemCount = 5;
      render(
        <MemoryRouter initialEntries={["/"]}>
          <BottomNav />
        </MemoryRouter>,
      );
      const badge = screen.getByTestId("bottom-nav-cart-badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("5");
    });

    it("hides cart badge when count is 0", () => {
      mockItemCount = 0;
      render(
        <MemoryRouter initialEntries={["/"]}>
          <BottomNav />
        </MemoryRouter>,
      );
      expect(screen.queryByTestId("bottom-nav-cart-badge")).not.toBeInTheDocument();
    });

    it("ensures all navigation items have at least 44x44px touch-target classes", () => {
      render(
        <MemoryRouter initialEntries={["/"]}>
          <BottomNav />
        </MemoryRouter>,
      );
      const links = screen.getAllByRole("link");
      expect(links.length).toBe(5);
      links.forEach((l) => {
        expect(l.className).toContain("min-h-[44px]");
        expect(l.className).toContain("min-w-[44px]");
      });
    });
  });
});
