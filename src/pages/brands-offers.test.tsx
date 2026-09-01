import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Brands from "@/pages/Brands";
import Offers from "@/pages/Offers";
import { apiClient } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getMarketplaceBrands: vi.fn(),
    getMarketplaceOffers: vi.fn(),
  },
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

describe("Phase 2F — Brands & Offers Customer Pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Brands (/brands)", () => {
    it("renders loading skeleton initially", () => {
      vi.mocked(apiClient.getMarketplaceBrands).mockReturnValue(new Promise(() => {}));
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/brands"]}>
            <Brands />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.getByRole("heading", { name: "العلامات التجارية", level: 1 })).toBeInTheDocument();
      expect(screen.getByLabelText("جاري التحميل")).toBeInTheDocument();
    });

    it("renders error state with retry when brands API fails", async () => {
      vi.mocked(apiClient.getMarketplaceBrands).mockRejectedValue(new Error("API failure"));
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/brands"]}>
            <Brands />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("تعذر تحميل العلامات التجارية")).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument();

      vi.mocked(apiClient.getMarketplaceBrands).mockResolvedValueOnce({
        brands: [{ name: "Samsung", imageUrl: "https://example.com/samsung.png" }],
      });

      fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));

      await waitFor(() => {
        expect(screen.getByRole("link", { name: "Samsung" })).toBeInTheDocument();
      });
    });

    it("renders populated brand list with correct product URLs", async () => {
      vi.mocked(apiClient.getMarketplaceBrands).mockResolvedValue({
        brands: [
          { name: "Apple", imageUrl: "https://example.com/apple.png" },
          { name: "Xiaomi", imageUrl: null },
        ],
      });
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/brands"]}>
            <Brands />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("Apple")).toBeInTheDocument();
        expect(screen.getByText("Xiaomi")).toBeInTheDocument();
      });

      expect(screen.getByRole("link", { name: "Apple" })).toHaveAttribute(
        "href",
        "/products?brand=Apple"
      );
    });
  });

  describe("Offers (/offers)", () => {
    it("renders clean marketplace copy without legacy luxury text", async () => {
      vi.mocked(apiClient.getMarketplaceOffers).mockResolvedValue({
        items: [],
        total: 0,
      });
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/offers"]}>
            <Offers />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "عروض وتخفيضات", level: 1 })).toBeInTheDocument();
      });

      expect(screen.getByText("عروض مميزة")).toBeInTheDocument();
      expect(screen.getByText(/اكتشف العروض المتاحة حالياً/)).toBeInTheDocument();

      // Assert no legacy luxury text
      expect(screen.queryByText(/قيمة بلا صخب/)).not.toBeInTheDocument();
      expect(screen.queryByText(/خصومات مدروسة/)).not.toBeInTheDocument();
    });

    it("handles offers API error with retry action", async () => {
      vi.mocked(apiClient.getMarketplaceOffers).mockRejectedValue(new Error("Network Error"));
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/offers"]}>
            <Offers />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("تعذر تحميل العروض")).toBeInTheDocument();
      });

      // Crucial: do NOT show empty state on API failure
      expect(screen.queryByText("لا توجد عروض نشطة حالياً.")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument();
    });

    it("renders populated offers using ProductCard", async () => {
      vi.mocked(apiClient.getMarketplaceOffers).mockResolvedValue({
        items: [
          {
            id: "prod-offer-1",
            name: "عطر رجالي مميز",
            slug: "mens-perfume-1",
            price: 45000,
            discount_price: 35000,
            images: ["https://example.com/perfume.jpg"],
            category: "العطور",
            merchant_id: "m-1",
            stock: 10,
          } as any,
        ],
        total: 1,
      });
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/offers"]}>
            <Offers />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("عطر رجالي مميز")).toBeInTheDocument();
      });
    });
  });
});
