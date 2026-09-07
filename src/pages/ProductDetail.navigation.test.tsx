import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";
import ProductDetail from "@/pages/ProductDetail";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { useCartStore } from "@/lib/cart-store";
import * as sonner from "sonner";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => {
      const realNavigate = actual.useNavigate();
      return (...args: Parameters<typeof realNavigate>) => {
        navigateMock(...args);
        return realNavigate(...args);
      };
    },
  };
});

const mockProduct = {
  id: "prod-nav-1",
  slug: "nav-test-product",
  name: "هاتف ديلمارت الذكي",
  price: 500000,
  discount_price: 450000,
  stock: 10,
  merchant_id: "merch-1",
  images: ["/test.jpg"],
  category_id: "cat-1",
  description: "وصف المنتج التجريبي",
  merchants: { display_name: "متجر ديلمارت", slug: "dilmart-store" },
};

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getMarketplaceProductBySlug: vi.fn(),
    getMarketplaceSuggested: vi.fn().mockResolvedValue({ items: [] }),
    getMarketplaceCategories: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) => {
      if (options.queryKey[0] === "marketplace-product") {
        const slug = (options.queryKey[1] as string) || "nav-test-product";
        return {
          data: {
            ...mockProduct,
            id: `prod-${slug}`,
            slug,
            name: `منتج ${slug}`,
          },
          isLoading: false,
          isError: false,
        };
      }
      return {
        data: [],
        isLoading: false,
      };
    },
  };
});

const attemptAddMock = vi.fn();
vi.mock("@/components/MerchantSwitchCartDialog", () => ({
  useMerchantSwitchCart: () => ({
    attemptAdd: attemptAddMock,
    dialogNode: null,
  }),
}));

describe("ProductDetail Navigation, Reactivity & UX Suite", () => {
  beforeEach(() => {
    vi.useRealTimers();
    navigateMock.mockReset();
    attemptAddMock.mockReset();
    vi.spyOn(sonner.toast, "success");
    useCartStore.getState().clearCart();
  });

  afterEach(() => {
    useCartStore.getState().clearCart();
  });

  it("anchors the mobile sticky purchase bar using var(--mobile-bottom-nav-total)", () => {
    render(
      <MemoryRouter initialEntries={["/product/nav-test-product"]}>
        <Routes>
          <Route path="/product/:slug" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    const purchaseBar = screen.getByTestId("pdp-sticky-purchase-bar");
    expect(purchaseBar).toBeInTheDocument();
    expect(purchaseBar.className).toContain("bottom-[var(--mobile-bottom-nav-total)]");
  });

  it("renders single PostAddToCartConfirmation on successful add without duplicate toast", () => {
    attemptAddMock.mockImplementation((_product, _trigger, onSuccess) => {
      onSuccess();
      return true;
    });

    render(
      <MemoryRouter initialEntries={["/product/nav-test-product"]}>
        <Routes>
          <Route path="/product/:slug" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    const addBtn = screen.getAllByRole("button", { name: /أضف إلى السلة/i })[0];
    fireEvent.click(addBtn);

    const confirmation = screen.getByTestId("post-add-to-cart-confirmation");
    expect(confirmation).toBeInTheDocument();
    expect(screen.getByText("تمت الإضافة إلى السلة بنجاح")).toBeInTheDocument();

    // Proves NO duplicate sonner toast was triggered
    expect(sonner.toast.success).not.toHaveBeenCalled();

    // Verify both action buttons are rendered
    expect(screen.getByRole("button", { name: /عرض السلة/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /متابعة التسوق/i })).toBeInTheDocument();
  });

  it("clicking 'عرض السلة' navigates to /cart and closes confirmation", () => {
    attemptAddMock.mockImplementation((_product, _trigger, onSuccess) => {
      onSuccess();
      return true;
    });

    render(
      <MemoryRouter initialEntries={["/product/nav-test-product"]}>
        <Routes>
          <Route path="/product/:slug" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    const addBtn = screen.getAllByRole("button", { name: /أضف إلى السلة/i })[0];
    fireEvent.click(addBtn);

    const viewCartBtn = screen.getByRole("button", { name: /عرض السلة/i });
    fireEvent.click(viewCartBtn);

    expect(navigateMock).toHaveBeenCalledWith("/cart");
    expect(screen.queryByTestId("post-add-to-cart-confirmation")).not.toBeInTheDocument();
  });

  it("clicking 'متابعة التسوق' closes confirmation and stays on PDP", () => {
    attemptAddMock.mockImplementation((_product, _trigger, onSuccess) => {
      onSuccess();
      return true;
    });

    render(
      <MemoryRouter initialEntries={["/product/nav-test-product"]}>
        <Routes>
          <Route path="/product/:slug" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    const addBtn = screen.getAllByRole("button", { name: /أضف إلى السلة/i })[0];
    fireEvent.click(addBtn);

    const continueBtn = screen.getByRole("button", { name: /متابعة التسوق/i });
    fireEvent.click(continueBtn);

    expect(screen.queryByTestId("post-add-to-cart-confirmation")).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("blocks duplicate taps during the protected debounce interval (isAddingToCart)", () => {
    attemptAddMock.mockImplementation((_product, _trigger, onSuccess) => {
      onSuccess();
      return true;
    });

    render(
      <MemoryRouter initialEntries={["/product/nav-test-product"]}>
        <Routes>
          <Route path="/product/:slug" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    const stickyAddBtn = screen.getAllByRole("button", { name: /أضف إلى السلة/i })[1] || screen.getAllByRole("button", { name: /أضف إلى السلة/i })[0];

    // First click initiates add
    fireEvent.click(stickyAddBtn);
    expect(attemptAddMock).toHaveBeenCalledTimes(1);

    // Immediate second click must be blocked
    fireEvent.click(stickyAddBtn);
    expect(attemptAddMock).toHaveBeenCalledTimes(1);
  });

  it("cleans up debounce timer cleanly on unmount without state warnings", () => {
    attemptAddMock.mockImplementation((_product, _trigger, onSuccess) => {
      onSuccess();
      return true;
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={["/product/nav-test-product"]}>
        <Routes>
          <Route path="/product/:slug" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    const addBtn = screen.getAllByRole("button", { name: /أضف إلى السلة/i })[0];
    fireEvent.click(addBtn);

    // Unmount while debounce timer is still pending
    expect(() => unmount()).not.toThrow();
  });

  it("real cart reactivity: adding from PDP updates Header badge and BottomNav badge without page reload", () => {
    // Connect attemptAddMock to real useCartStore
    attemptAddMock.mockImplementation((product, _trigger, onSuccess, quantity = 1) => {
      useCartStore.getState().addItem(product, quantity);
      onSuccess();
      return true;
    });

    render(
      <MemoryRouter initialEntries={["/product/nav-test-product"]}>
        <Routes>
          <Route path="/product/:slug" element={<ProductDetail />} />
        </Routes>
        <BottomNav />
      </MemoryRouter>,
    );

    // 1. Initial State: cart is empty, badges absent
    expect(screen.queryByTestId("header-cart-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bottom-nav-cart-badge")).not.toBeInTheDocument();

    // 2. Add product (quantity = 1) from PDP
    const addBtn = screen.getAllByRole("button", { name: /أضف إلى السلة/i })[0];
    act(() => {
      fireEvent.click(addBtn);
    });

    // 3. Reactively updates Header badge to 1 and BottomNav badge to 1
    const headerBadge = screen.getByTestId("header-cart-badge");
    const bottomNavBadge = screen.getByTestId("bottom-nav-cart-badge");

    expect(headerBadge).toBeInTheDocument();
    expect(headerBadge).toHaveTextContent("1");
    expect(bottomNavBadge).toBeInTheDocument();
    expect(bottomNavBadge).toHaveTextContent("1");

    // 4. Add product with quantity > 1 (e.g. 2 more items)
    act(() => {
      useCartStore.getState().addItem(mockProduct, 2);
    });

    // 5. Reactively updates Header badge to 3 and BottomNav badge to 3
    expect(screen.getByTestId("header-cart-badge")).toHaveTextContent("3");
    expect(screen.getByTestId("bottom-nav-cart-badge")).toHaveTextContent("3");
  });

  describe("Product Detail Scroll Reset Contract", () => {
    it("resets scroll position to (0, 0) with behavior: 'auto' exactly ONCE upon opening PDP", () => {
      const scrollToSpy = vi.fn();
      window.scrollTo = scrollToSpy;

      render(
        <MemoryRouter initialEntries={["/product/nav-test-product"]}>
          <Routes>
            <Route path="/product/:slug" element={<ProductDetail />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(scrollToSpy).toHaveBeenCalledTimes(1);
      expect(scrollToSpy).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: "auto",
      });
    });

    it("resets scroll position again when navigating to a different product slug", () => {
      const scrollToSpy = vi.fn();
      window.scrollTo = scrollToSpy;

      render(
        <MemoryRouter initialEntries={["/product/product-alpha"]}>
          <Routes>
            <Route
              path="/product/:slug"
              element={
                <>
                  <ProductDetail />
                  <Link to="/product/product-beta">Go to Beta</Link>
                </>
              }
            />
          </Routes>
        </MemoryRouter>,
      );

      expect(scrollToSpy).toHaveBeenCalledTimes(1);
      expect(scrollToSpy).toHaveBeenLastCalledWith({
        top: 0,
        left: 0,
        behavior: "auto",
      });

      // Navigate to another product slug via link inside router
      const betaLink = screen.getByRole("link", { name: "Go to Beta" });
      act(() => {
        fireEvent.click(betaLink);
      });

      expect(scrollToSpy).toHaveBeenCalledTimes(2);
      expect(scrollToSpy).toHaveBeenLastCalledWith({
        top: 0,
        left: 0,
        behavior: "auto",
      });
    });

    it("does NOT repeat scrollTo when state updates, items add, or rerenders happen on the same product", () => {
      const scrollToSpy = vi.fn();
      window.scrollTo = scrollToSpy;

      render(
        <MemoryRouter initialEntries={["/product/nav-test-product"]}>
          <Routes>
            <Route path="/product/:slug" element={<ProductDetail />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(scrollToSpy).toHaveBeenCalledTimes(1);

      // Trigger add to cart on same product
      const addBtn = screen.getAllByRole("button", { name: /أضف إلى السلة/i })[0];
      act(() => {
        fireEvent.click(addBtn);
      });

      // Cart store change
      act(() => {
        useCartStore.getState().addItem(mockProduct, 1);
      });

      // Must remain exactly 1 — no unwanted scroll jumps
      expect(scrollToSpy).toHaveBeenCalledTimes(1);
    });
  });
});
