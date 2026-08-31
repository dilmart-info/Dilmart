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

describe("ProductDetail Page (Phase 2B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCartStore.setState({ items: [], activeMerchantId: null, coupon: null });
    useWishlistStore.setState({ items: [] });
  });

  it("renders product identity, brand, store link, and prices accurately", async () => {
    vi.mocked(apiClient.getMarketplaceProductBySlug).mockResolvedValueOnce(mockProduct as any);
    vi.mocked(apiClient.getMarketplaceSuggested).mockResolvedValueOnce({ items: [], total: 0, offset: 0, limit: 0 });

    renderProductDetailPage();

    expect(await screen.findByRole("heading", { level: 1, name: mockProduct.name })).toBeInTheDocument();
    expect(screen.getAllByText("Sony").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("متجر سوني المعتمد").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("وفر %30")).toBeInTheDocument();
    expect(screen.getByText("متوفر في المخزون")).toBeInTheDocument();
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

  it("handles quantity stepper and adds selected quantity to cart", async () => {
    vi.mocked(apiClient.getMarketplaceProductBySlug).mockResolvedValueOnce(mockProduct as any);
    vi.mocked(apiClient.getMarketplaceSuggested).mockResolvedValueOnce({ items: [], total: 0, offset: 0, limit: 0 });

    renderProductDetailPage();

    await screen.findByRole("heading", { level: 1, name: mockProduct.name });

    const increaseBtn = screen.getByRole("button", { name: "زيادة الكمية" });
    fireEvent.click(increaseBtn);
    fireEvent.click(increaseBtn);

    expect(screen.getByTestId("product-quantity-display")).toHaveTextContent("3");

    const addButtons = screen.getAllByRole("button", { name: /أضف إلى السلة/i });
    fireEvent.click(addButtons[0]);

    const cartItems = useCartStore.getState().items;
    expect(cartItems).toHaveLength(1);
    expect(cartItems[0].quantity).toBe(3);
    expect(cartItems[0].product.id).toBe(mockProduct.id);
  });

  it("renders informational colors and sizes without requiring selection", async () => {
    vi.mocked(apiClient.getMarketplaceProductBySlug).mockResolvedValueOnce(mockProduct as any);
    vi.mocked(apiClient.getMarketplaceSuggested).mockResolvedValueOnce({ items: [], total: 0, offset: 0, limit: 0 });

    renderProductDetailPage();

    await screen.findByRole("heading", { level: 1, name: mockProduct.name });

    expect(screen.getByText("الألوان المتوفرة:")).toBeInTheDocument();
    expect(screen.getAllByText("أسود").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("أبيض").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("المقاسات المتوفرة:")).toBeInTheDocument();
    expect(screen.getAllByText("قياسي").length).toBeGreaterThanOrEqual(1);
  });

  it("renders neutral delivery information and no fake loyalty formulas", async () => {
    vi.mocked(apiClient.getMarketplaceProductBySlug).mockResolvedValueOnce(mockProduct as any);
    vi.mocked(apiClient.getMarketplaceSuggested).mockResolvedValueOnce({ items: [], total: 0, offset: 0, limit: 0 });

    renderProductDetailPage();

    await screen.findByRole("heading", { level: 1, name: mockProduct.name });

    expect(screen.getByText("توصيل موثوق — تفاصيل التوصيل تظهر أثناء إتمام الطلب")).toBeInTheDocument();
    expect(screen.getByText("خيارات دفع متاحة عند إتمام الطلب")).toBeInTheDocument();
    expect(screen.getByText("قد تحصل على نقاط مكافآت عند إتمام الشراء")).toBeInTheDocument();
    // Verify no fake exact points string like "350 نقطة" or "500 نقطة"
    expect(screen.queryByText(/نقطة/i)).toBeNull();
  });

  it("renders error state when product is not found or API fails", async () => {
    vi.mocked(apiClient.getMarketplaceProductBySlug).mockRejectedValueOnce(new Error("Not found"));

    renderProductDetailPage("unknown-product");

    expect(await screen.findByText("المنتج غير موجود")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "العودة للمنتجات" })).toBeInTheDocument();
  });

  it("renders suggested products rail when suggested items are returned", async () => {
    const suggestedItem = {
      id: "prod-200",
      name: "ساعة ذكية رياضية",
      slug: "smart-watch",
      price: 45000,
      discount_price: null,
      stock: 5,
      images: ["https://example.com/watch.jpg"],
      brand: "Apple",
      short_description: "ساعة رياضية",
      is_active: true,
      merchants: { id: "m1", slug: "sony-store", display_name: "متجر سوني المعتمد" },
    };

    vi.mocked(apiClient.getMarketplaceProductBySlug).mockResolvedValueOnce(mockProduct as any);
    vi.mocked(apiClient.getMarketplaceSuggested).mockResolvedValueOnce({
      items: [suggestedItem as any],
      total: 1,
      offset: 0,
      limit: 1,
    });

    renderProductDetailPage();

    expect(await screen.findByText("منتجات قد تعجبك")).toBeInTheDocument();
    expect(screen.getByText("ساعة ذكية رياضية")).toBeInTheDocument();
  });
});
