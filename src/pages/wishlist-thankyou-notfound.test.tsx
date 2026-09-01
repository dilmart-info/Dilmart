import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Wishlist from "@/pages/Wishlist";
import ThankYou from "@/pages/ThankYou";
import NotFound from "@/pages/NotFound";
import { apiClient } from "@/lib/api-client";
import { useWishlistStore } from "@/lib/wishlist-store";
import { useAuth } from "@/hooks/use-auth";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getMarketplaceProductsByIds: vi.fn(),
    getMarketplaceHome: vi.fn().mockResolvedValue({
      featuredProducts: [],
      newProducts: [],
      offerProducts: [],
    }),
  },
}));

vi.mock("@/lib/growth-hooks", () => ({
  trackGrowthHookEvent: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

describe("Phase 2F — Wishlist, ThankYou & NotFound Pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWishlistStore.setState({ items: [] });
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      authSource: "anon",
      profile: null,
      capabilities: null,
      authStatus: "unauthenticated",
    } as any);
  });

  describe("Wishlist (/wishlist)", () => {
    it("renders empty wishlist view when no items are saved", () => {
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/wishlist"]}>
            <Wishlist />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.getByText("قائمة المفضلة فارغة")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "تصفّح المنتجات" })).toHaveAttribute("href", "/products");
    });

    it("renders error state on API failure while preserving local wishlist IDs", async () => {
      useWishlistStore.setState({ items: ["p-1", "p-2"] });
      vi.mocked(apiClient.getMarketplaceProductsByIds).mockRejectedValue(new Error("Network Error"));

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/wishlist"]}>
            <Wishlist />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("تعذر تحميل عناصر المفضلة")).toBeInTheDocument();
      });

      // Assert items remain in storage (not wiped)
      expect(useWishlistStore.getState().items).toEqual(["p-1", "p-2"]);
      expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument();
    });

    it("displays unavailable notice and removes unavailable items in a single batch", async () => {
      useWishlistStore.setState({ items: ["p-1", "p-2", "p-3"] });
      // API returns only p-1 and p-3 (p-2 unavailable)
      vi.mocked(apiClient.getMarketplaceProductsByIds).mockResolvedValue([
        { id: "p-1", name: "منتج متاح 1", slug: "prod-1", price: 10000, category: "عام" } as any,
        { id: "p-3", name: "منتج متاح 3", slug: "prod-3", price: 20000, category: "عام" } as any,
      ]);

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/wishlist"]}>
            <Wishlist />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/بعض المنتجات المحفوظة لم تعد متاحة حالياً/)).toBeInTheDocument();
      });

      const removeUnavailableBtn = screen.getByRole("button", { name: /إزالة العناصر غير المتاحة/ });
      expect(removeUnavailableBtn).toBeInTheDocument();

      fireEvent.click(removeUnavailableBtn);

      // p-2 was removed, p-1 and p-3 preserved
      expect(useWishlistStore.getState().items).toEqual(["p-1", "p-3"]);
    });

    it("does not promise future personalization in recommendation subtitle", () => {
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/wishlist"]}>
            <Wishlist />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.queryByText(/سيتم تطويرها لاحقًا حسب تاريخ مشترياتك/)).not.toBeInTheDocument();
    });
  });

  describe("Thank You (/thank-you)", () => {
    it("renders order confirmation with order number and tracking link", () => {
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/thank-you?order=ORD-555"]}>
            <ThankYou />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.getByText("تم تسجيل طلبك بنجاح")).toBeInTheDocument();
      expect(screen.getByText("#ORD-555")).toBeInTheDocument();
      expect(screen.getAllByRole("link", { name: /تتبع حالة الطلب/ })[0]).toHaveAttribute(
        "href",
        "/track-order?order=ORD-555"
      );
      expect(screen.getAllByRole("link", { name: /عرض طلباتي/ })[0]).toHaveAttribute(
        "href",
        "/my-account/orders"
      );

      // Assert no unsupported contact promise
      expect(screen.queryByText(/سيتم التواصل معك قريباً لتأكيد الطلب/)).not.toBeInTheDocument();
    });

    it("hides account claim banner for normal authenticated customer", () => {
      vi.mocked(useAuth).mockReturnValue({
        user: { id: "cust-1", email: "user@example.com" },
        authSource: "supabase",
        profile: { claim_required: false, account_type: "standard_customer" },
        capabilities: { accountClaim: false },
        authStatus: "authenticated",
      } as any);

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/thank-you?order=ORD-555"]}>
            <ThankYou />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.queryByText("استلام الحساب وتأكيد الهاتف")).not.toBeInTheDocument();
    });

    it("shows account claim banner for provisional / claimable customer without exposing internal email", () => {
      vi.mocked(useAuth).mockReturnValue({
        user: { id: "cust-prov", email: "temp-9647801234567@provisional.dilmart.com" },
        authSource: "supabase",
        profile: { claim_required: true, account_type: "provisional_customer" },
        capabilities: { accountClaim: true },
        authStatus: "authenticated",
      } as any);

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/thank-you?order=ORD-555"]}>
            <ThankYou />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.getByText("تأكيد بيانات الحساب")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "استلام الحساب وتأكيد الهاتف" })).toHaveAttribute(
        "href",
        "/claim-account?orderNumber=ORD-555"
      );
      // No provisional email exposed
      expect(screen.queryByText(/@provisional\./)).not.toBeInTheDocument();
      // No loyalty points claims
      expect(screen.queryByText(/اكتساب النقاط/)).not.toBeInTheDocument();
    });

    it("renders safe missing order number state when opened without order param", () => {
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/thank-you"]}>
            <ThankYou />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.getByText("لا يوجد رقم طلب مرتبط بهذه الصفحة")).toBeInTheDocument();
      expect(screen.getAllByRole("link", { name: /عرض طلباتي/ })[0]).toHaveAttribute(
        "href",
        "/my-account/orders"
      );
    });
  });

  describe("Not Found (/404)", () => {
    it("renders Arabic 404 page with React Router SPA links and no console.error", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/non-existent-page"]}>
            <NotFound />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.getByText("404")).toBeInTheDocument();
      expect(screen.getByText("الصفحة غير موجودة")).toBeInTheDocument();
      expect(screen.getByText(/قد يكون الرابط غير صحيح/)).toBeInTheDocument();

      expect(screen.getByRole("link", { name: /العودة للرئيسية/ })).toHaveAttribute("href", "/");
      expect(screen.getByRole("link", { name: /تصفّح المنتجات/ })).toHaveAttribute("href", "/products");

      // Assert no English "Oops"
      expect(screen.queryByText(/Oops/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Page not found/i)).not.toBeInTheDocument();

      // Assert no console.error side effect
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});
