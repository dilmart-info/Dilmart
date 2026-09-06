import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProductDetail from "@/pages/ProductDetail";
import { apiClient } from "@/lib/api-client";
import * as sonner from "sonner";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

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
    useQuery: (options: any) => {
      if (options.queryKey[0] === "marketplace-product") {
        return {
          data: {
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

describe("ProductDetail Navigation & Post-Add Flow", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    attemptAddMock.mockReset();
    vi.spyOn(sonner.toast, "success");
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
});
