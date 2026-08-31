import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProductDetail from "@/pages/ProductDetail";
import { apiClient } from "@/lib/api-client";
import { useCartStore } from "@/lib/cart-store";
import { useWishlistStore } from "@/lib/wishlist-store";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getMarketplaceProductBySlug: vi.fn(),
    getMarketplaceSuggested: vi.fn(),
    getMarketplaceCategories: vi.fn().mockResolvedValue([]),
    getMarketplaceBrands: vi.fn().mockResolvedValue({ brands: [] }),
  },
}));

const mockProduct = {
  id: "prod-100",
  name: "سماعات لاسلكية عازلة للضوضاء",
  slug: "wireless-headphones",
  price: 50000,
  discount_price: 35000,
  stock: 10,
  images: [
    "https://example.com/img1.jpg",
    "https://example.com/img2.jpg",
  ],
  brand: "Sony",
  short_description: "سماعات فاخرة بصوت نقي وعزل قوي",
  description: "وصف تفصيلي كامل للسماعات اللاسلكية مع بطارية تدوم 30 ساعة.",
  dimensions: "20 × 15 × 8 سم",
  weight_grams: 250,
  colors: ["أسود", "أبيض"],
  sizes: ["قياسي"],
  category_id: "cat-1",
  merchant_id: "m1",
  loyalty_points_enabled: true,
  merchants: {
    id: "m1",
    slug: "sony-store",
    display_name: "متجر سوني المعتمد",
  },
};

function renderProductDetailPage(slug = "wireless-headphones") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/product/${slug}`]}>
        <Routes>
          <Route path="/product/:slug" element={<ProductDetail />} />
          <Route path="/products" element={<div>قائمة المنتجات</div>} />
          <Route path="/store/:slug" element={<div>صفحة المتجر</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProductDetail Page (Phase 2B Micro-Closure)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCartStore.setState({ items: [], activeMerchantId: null, coupon: null });
    useWishlistStore.setState({ items: [] });
  });

  it("renders neutral merchant link and trust wording (no unverified claims)", async () => {
    vi.mocked(apiClient.getMarketplaceProductBySlug).mockResolvedValueOnce(mockProduct as any);
    vi.mocked(apiClient.getMarketplaceSuggested).mockResolvedValueOnce({ items: [], total: 0, offset: 0, limit: 0 });

    renderProductDetailPage();

    expect(await screen.findByRole("heading", { level: 1, name: mockProduct.name })).toBeInTheDocument();
    // Neutral seller wording
    expect(screen.getByText("يُباع بواسطة:")).toBeInTheDocument();
    expect(screen.queryByText("يُباع ويُشحن بواسطة:")).toBeNull();
    // Neutral trust wording
    expect(screen.getByText("تسوق بثقة عبر ديل مارت")).toBeInTheDocument();
    expect(screen.queryByText("المتجر المعتمد")).toBeNull();
  });

  it("renders out-of-stock badge and disables Add to Cart when stock is 0", async () => {
    const outOfStockProduct = { ...mockProduct, stock: 0 };
    vi.mocked(apiClient.getMarketplaceProductBySlug).mockResolvedValueOnce(outOfStockProduct as any);
    vi.mocked(apiClient.getMarketplaceSuggested).mockResolvedValueOnce({ items: [], total: 0, offset: 0, limit: 0 });

    renderProductDetailPage();

    await screen.findByRole("heading", { level: 1, name: mockProduct.name });
    expect(screen.getAllByText("نفد من المخزون").length).toBeGreaterThanOrEqual(1);
    const addButtons = screen.getAllByRole("button", { name: /نفد من المخزون/i });
    expect(addButtons[0]).toBeDisabled();
  });

  it("handles quantity stepper and bounds by remaining available stock (stock 5, existing cart 4 -> max additional 1)", async () => {
    const stockProduct = { ...mockProduct, stock: 5 };
    // Pre-populate cart with 4 items of this product
    useCartStore.setState({
      items: [{ product: stockProduct as any, quantity: 4 }],
      activeMerchantId: "m1",
    });

    vi.mocked(apiClient.getMarketplaceProductBySlug).mockResolvedValueOnce(stockProduct as any);
    vi.mocked(apiClient.getMarketplaceSuggested).mockResolvedValueOnce({ items: [], total: 0, offset: 0, limit: 0 });

    renderProductDetailPage();

    await screen.findByRole("heading", { level: 1, name: mockProduct.name });

    // Displays existing in-cart info
    expect(screen.getByText("(لديك 4 في السلة)")).toBeInTheDocument();
    expect(screen.getByTestId("product-quantity-display")).toHaveTextContent("1");

    // Increasing beyond remaining 1 should be disabled
    const increaseBtn = screen.getByRole("button", { name: "زيادة الكمية" });
    expect(increaseBtn).toBeDisabled();

    // Adding the 1 additional item to cart
    const addButtons = screen.getAllByRole("button", { name: /أضف إلى السلة/i });
    fireEvent.click(addButtons[0]);

    // Cart total must now be exactly 5 (4 existing + 1 added)
    const cartItems = useCartStore.getState().items;
    expect(cartItems[0].quantity).toBe(5);
  });

  it("blocks adding when cart already holds all available stock (stock 5, existing cart 5)", async () => {
    const stockProduct = { ...mockProduct, stock: 5 };
    useCartStore.setState({
      items: [{ product: stockProduct as any, quantity: 5 }],
      activeMerchantId: "m1",
    });

    vi.mocked(apiClient.getMarketplaceProductBySlug).mockResolvedValueOnce(stockProduct as any);
    vi.mocked(apiClient.getMarketplaceSuggested).mockResolvedValueOnce({ items: [], total: 0, offset: 0, limit: 0 });

    renderProductDetailPage();

    await screen.findByRole("heading", { level: 1, name: mockProduct.name });

    expect(screen.getAllByText("الكمية المتاحة بالكامل في السلة").length).toBeGreaterThanOrEqual(1);
    const addButtons = screen.getAllByRole("button", { name: /الكمية المتاحة بالكامل في السلة/i });
    expect(addButtons[0]).toBeDisabled();
  });

  it("distinguishes 404 NOT FOUND from generic API network failure", async () => {
    // 1. 404 error
    const notFoundError = new Error("Product not found");
    (notFoundError as any).status = 404;
    vi.mocked(apiClient.getMarketplaceProductBySlug).mockRejectedValueOnce(notFoundError);

    const { unmount } = renderProductDetailPage("unknown-product");
    expect(await screen.findByText("المنتج غير موجود")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "العودة للمنتجات" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /حاول مرة أخرى/i })).toBeNull();
    unmount();

    // 2. Generic 500 / Network outage
    const serverError = new Error("Network offline or 500 Internal Server Error");
    (serverError as any).status = 500;
    vi.mocked(apiClient.getMarketplaceProductBySlug).mockRejectedValueOnce(serverError);

    renderProductDetailPage("some-product");
    expect(await screen.findByText("تعذر تحميل المنتج")).toBeInTheDocument();
    expect(screen.getByText("حدث خطأ أثناء الاتصال بالخادم، يرجى المحاولة مرة أخرى.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /حاول مرة أخرى/i })).toBeInTheDocument();
  });

  it("handles merchant switch when adding items from a different merchant", async () => {
    // Initial cart with merchant m2
    useCartStore.setState({
      items: [
        {
          product: {
            id: "other-prod",
            name: "منتج من متجر آخر",
            merchant_id: "m2",
            price: 10000,
            stock: 5,
            slug: "other",
          } as any,
          quantity: 2,
        },
      ],
      activeMerchantId: "m2",
    });

    vi.mocked(apiClient.getMarketplaceProductBySlug).mockResolvedValueOnce(mockProduct as any);
    vi.mocked(apiClient.getMarketplaceSuggested).mockResolvedValueOnce({ items: [], total: 0, offset: 0, limit: 0 });

    renderProductDetailPage();

    await screen.findByRole("heading", { level: 1, name: mockProduct.name });

    const addButtons = screen.getAllByRole("button", { name: /أضف إلى السلة/i });
    fireEvent.click(addButtons[0]);

    // Opens merchant switch dialog
    expect(await screen.findByText("لديك منتجات من متجر آخر في السلة")).toBeInTheDocument();

    // Confirm switch
    const confirmBtn = screen.getByRole("button", { name: /تفريغ السلة وإضافة المنتج/i });
    fireEvent.click(confirmBtn);

    // Cart is now switched to new merchant m1 with 1 item
    const cartState = useCartStore.getState();
    expect(cartState.activeMerchantId).toBe("m1");
    expect(cartState.items).toHaveLength(1);
    expect(cartState.items[0].product.id).toBe(mockProduct.id);
  });
});
