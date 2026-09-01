import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Stores from "@/pages/Stores";
import Storefront from "@/pages/Storefront";
import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-core";
import * as whatsappAssisted from "@/lib/whatsapp-assisted";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getMarketplaceMerchantsList: vi.fn(),
    getMarketplaceMerchantBySlug: vi.fn(),
    getMarketplaceProducts: vi.fn(),
  },
}));

vi.mock("@/lib/growth-hooks", () => ({
  trackGrowthHookEvent: vi.fn(),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

describe("Phase 2F — Stores Directory & Merchant Storefront", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Stores Directory (/stores)", () => {
    it("renders loading skeleton initially", () => {
      vi.mocked(apiClient.getMarketplaceMerchantsList).mockReturnValue(new Promise(() => {}));
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/stores"]}>
            <Stores />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.getByRole("heading", { name: "المتاجر", level: 1 })).toBeInTheDocument();
      expect(screen.getByLabelText("جاري التحميل")).toBeInTheDocument();
    });

    it("renders error state with retry button when API fails (does not claim empty)", async () => {
      vi.mocked(apiClient.getMarketplaceMerchantsList).mockRejectedValue(new Error("Network Error"));
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/stores"]}>
            <Stores />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("تعذر تحميل المتاجر")).toBeInTheDocument();
      });

      expect(screen.queryByText("لا توجد متاجر معروضة حالياً.")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument();

      // Test retry action
      vi.mocked(apiClient.getMarketplaceMerchantsList).mockResolvedValueOnce({
        items: [
          {
            id: "m-1",
            slug: "store-one",
            display_name: "متجر بغداد",
            logo_url: "https://example.com/logo.jpg",
            is_featured: true,
          },
        ],
        total: 1,
      });

      fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));

      await waitFor(() => {
        expect(screen.getByText("متجر بغداد")).toBeInTheDocument();
      });
      expect(screen.getByText("مميز")).toBeInTheDocument();
    });

    it("renders distinct empty state on successful empty list", async () => {
      vi.mocked(apiClient.getMarketplaceMerchantsList).mockResolvedValue({
        items: [],
        total: 0,
      });
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/stores"]}>
            <Stores />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("لا توجد متاجر معروضة حالياً.")).toBeInTheDocument();
      });
      expect(screen.getByRole("link", { name: "تصفّح المنتجات" })).toHaveAttribute("href", "/products");
    });

    it("renders populated merchant cards with canonical fields and no legacy gold", async () => {
      vi.mocked(apiClient.getMarketplaceMerchantsList).mockResolvedValue({
        items: [
          {
            id: "m-1",
            slug: "store-alpha",
            display_name: "متجر ألفا",
            logo_url: null,
            is_featured: false,
          },
        ],
        total: 1,
      });
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/stores"]}>
            <Stores />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("متجر ألفا")).toBeInTheDocument();
      });
      expect(screen.getByText("زيارة المتجر")).toBeInTheDocument();
      // No unproven badges
      expect(screen.queryByText("موثق")).not.toBeInTheDocument();
      expect(screen.queryByText("معتمد")).not.toBeInTheDocument();
    });
  });

  describe("Merchant Storefront (/store/:slug)", () => {
    it("renders loading skeleton while fetching merchant", () => {
      vi.mocked(apiClient.getMarketplaceMerchantBySlug).mockReturnValue(new Promise(() => {}));
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/store/test-store"]}>
            <Routes>
              <Route path="/store/:slug" element={<Storefront />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.getByLabelText("جاري التحميل")).toBeInTheDocument();
    });

    it("distinguishes canonical 404 (not found) from network error", async () => {
      vi.mocked(apiClient.getMarketplaceMerchantBySlug).mockRejectedValue(
        new ApiError("Merchant not found", 404)
      );
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/store/non-existent"]}>
            <Routes>
              <Route path="/store/:slug" element={<Storefront />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("المتجر غير موجود أو غير متاح")).toBeInTheDocument();
      });
      expect(screen.queryByText("تعذر تحميل المتجر")).not.toBeInTheDocument();
    });

    it("renders network error with retry button on 500/network failure", async () => {
      vi.mocked(apiClient.getMarketplaceMerchantBySlug).mockRejectedValue(
        new ApiError("Internal server error", 500)
      );
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/store/my-store"]}>
            <Routes>
              <Route path="/store/:slug" element={<Storefront />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("تعذر تحميل المتجر")).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument();
    });

    it("handles products API failure without destroying merchant header", async () => {
      vi.mocked(apiClient.getMarketplaceMerchantBySlug).mockResolvedValue({
        id: "m-123",
        slug: "my-store",
        display_name: "متجر النور",
        description: "أفضل المنتجات المنزلية",
        logo_url: null,
        banner_url: null,
        is_featured: false,
      });
      vi.mocked(apiClient.getMarketplaceProducts).mockRejectedValue(new Error("Products error"));

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/store/my-store"]}>
            <Routes>
              <Route path="/store/:slug" element={<Storefront />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("متجر النور")).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText("تعذر تحميل منتجات المتجر")).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument();
    });

    it("renders clean WhatsApp button without customer-facing 'Tracked' text while preserving tracking call", async () => {
      const startWhatsAppSpy = vi.spyOn(whatsappAssisted, "startTrackedWhatsAppIntent").mockResolvedValue(undefined as any);

      vi.mocked(apiClient.getMarketplaceMerchantBySlug).mockResolvedValue({
        id: "m-123",
        slug: "my-store",
        display_name: "متجر النور",
        description: "أفضل المنتجات",
        logo_url: null,
        banner_url: null,
        is_featured: false,
      });
      vi.mocked(apiClient.getMarketplaceProducts).mockResolvedValue({
        items: [],
        total: 0,
      });

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/store/my-store"]}>
            <Routes>
              <Route path="/store/:slug" element={<Storefront />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("متجر النور")).toBeInTheDocument();
      });

      // Assert NO "Tracked" customer text
      expect(screen.queryByText(/Tracked/i)).not.toBeInTheDocument();
      const whatsappBtn = screen.getByRole("button", { name: "استفسار عبر واتساب" });
      expect(whatsappBtn).toBeInTheDocument();

      fireEvent.click(whatsappBtn);

      expect(startWhatsAppSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: "m-123",
          merchantName: "متجر النور",
          sourceSurface: "store",
        })
      );
    });
  });
});
