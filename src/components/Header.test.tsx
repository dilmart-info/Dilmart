import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Header from "@/components/Header";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: () => ({
      data: [],
      isLoading: false,
    }),
  };
});

let mockItemCount = 0;
vi.mock("@/lib/cart-store", () => ({
  useCartStore: () => ({
    items: [],
    getItemCount: () => mockItemCount,
    getTotal: () => 0,
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
  }),
}));

describe("Header — Route-Aware Mobile Header System", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    mockItemCount = 0;
  });

  it("renders MobileTopPromoBlock on the homepage ('/')", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("mobile-top-promo-block")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-inner-header")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-checkout-header")).not.toBeInTheDocument();
  });

  it("renders MobileCheckoutHeader on '/checkout'", () => {
    render(
      <MemoryRouter initialEntries={["/checkout"]}>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("mobile-checkout-header")).toBeInTheDocument();
    expect(screen.getByText("إتمام الطلب والدفع")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-top-promo-block")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-inner-header")).not.toBeInTheDocument();

    // Clicking back on checkout navigates to /cart
    const backBtn = screen.getByRole("button", { name: "الرجوع إلى السلة" });
    fireEvent.click(backBtn);
    expect(navigateMock).toHaveBeenCalledWith("/cart");
  });

  it("renders MobileInnerHeader on PDP with title 'تفاصيل المنتج' and cart badge", () => {
    mockItemCount = 3;
    render(
      <MemoryRouter initialEntries={["/product/awesome-laptop"]}>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("mobile-inner-header")).toBeInTheDocument();
    expect(screen.getByText("تفاصيل المنتج")).toBeInTheDocument();
    expect(screen.getByTestId("header-cart-badge")).toHaveTextContent("3");
    expect(screen.queryByTestId("mobile-top-promo-block")).not.toBeInTheDocument();
  });

  it("renders MobileInnerHeader on Cart with title 'سلة التسوق'", () => {
    render(
      <MemoryRouter initialEntries={["/cart"]}>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("mobile-inner-header")).toBeInTheDocument();
    expect(screen.getByText("سلة التسوق")).toBeInTheDocument();
  });

  it("renders MobileInnerHeader on category query with title 'الأقسام'", () => {
    render(
      <MemoryRouter initialEntries={["/products?category=electronics"]}>
        <Header />
      </MemoryRouter>,
    );
    const innerHeader = screen.getByTestId("mobile-inner-header");
    expect(innerHeader).toBeInTheDocument();
    expect(within(innerHeader).getByText("الأقسام")).toBeInTheDocument();
  });

  it("navigates back (-1) when history index > 0 on inner header back button", () => {
    // Simulate navigation within app
    window.history.replaceState({ idx: 2 }, "");
    render(
      <MemoryRouter initialEntries={["/product/some-item"]}>
        <Header />
      </MemoryRouter>,
    );
    const backBtn = screen.getByRole("button", { name: "الرجوع للخلف" });
    fireEvent.click(backBtn);
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it("falls back to '/products' on deep-link direct entry to PDP when history index is 0", () => {
    window.history.replaceState({ idx: 0 }, "");
    render(
      <MemoryRouter initialEntries={["/product/some-item"]}>
        <Header />
      </MemoryRouter>,
    );
    const backBtn = screen.getByRole("button", { name: "الرجوع للخلف" });
    fireEvent.click(backBtn);
    expect(navigateMock).toHaveBeenCalledWith("/products");
  });

  describe("Header Ownership Boundary — Non-Customer Routes Exclusion", () => {
    const excludedRoutes = [
      "/auth",
      "/forgot-password",
      "/claim-account",
      "/admin",
      "/admin/products",
      "/admin/orders",
      "/merchant",
      "/merchant/products",
      "/merchant/orders",
      "/agent",
      "/agent/orders",
      "/thank-you",
      "/thank-you?order=ORD-12345",
    ];

    excludedRoutes.forEach((route) => {
      it(`strictly excludes Header on route: ${route}`, () => {
        const { container } = render(
          <MemoryRouter initialEntries={[route]}>
            <Header />
          </MemoryRouter>,
        );
        expect(container.firstChild).toBeNull();
        expect(screen.queryByTestId("mobile-inner-header")).not.toBeInTheDocument();
        expect(screen.queryByTestId("mobile-top-promo-block")).not.toBeInTheDocument();
        expect(screen.queryByTestId("mobile-checkout-header")).not.toBeInTheDocument();
      });
    });
  });
});
