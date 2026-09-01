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
import { trackGrowthHookEvent } from "@/lib/growth-hooks";
import type { AuthStatus } from "@/lib/auth/auth-types";

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

function mockAuthState({
  authStatus = "unauthenticated" as AuthStatus,
  accountType = "standard_customer",
  claimRequired = false,
  accountClaimCapability = false,
  email = "user@example.com",
} = {}) {
  vi.mocked(useAuth).mockReturnValue({
    user: authStatus.startsWith("authenticated") ? ({ id: "cust-1", email } as any) : null,
    session: null,
    authSource: authStatus.startsWith("authenticated") ? "supabase" : "anon",
    profile: {
      account_type: accountType,
      claim_required: claimRequired,
    } as any,
    capabilities: {
      accountClaim: accountClaimCapability,
    } as any,
    authStatus,
    bootstrapDelayed: false,
    contextLoading: authStatus === "authenticated_loading_context",
    context: null,
    storageError: null,
    isOffline: authStatus === "authenticated_offline",
    isAdmin: false,
    isMerchantUser: false,
    isMerchantApplicant: false,
    isAgent: false,
    retryStorageBootstrap: vi.fn(),
    logoutCurrentDevice: vi.fn(),
  });
}

describe("Phase 2F — Wishlist, ThankYou & NotFound Pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWishlistStore.setState({ items: [] });
    mockAuthState({ authStatus: "unauthenticated" });
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

    it("emits individual analytics event per removed product on batch removal (never concatenated IDs)", () => {
      useWishlistStore.setState({ items: ["p-1", "p-2", "p-3"] });
      useWishlistStore.getState().removeItems(["p-1", "p-2"], { sourceSurface: "wishlist_cleanup" });

      expect(useWishlistStore.getState().items).toEqual(["p-3"]);
      expect(trackGrowthHookEvent).toHaveBeenCalledWith("wishlist.removed", {
        productId: "p-1",
        sourceSurface: "wishlist_cleanup",
      });
      expect(trackGrowthHookEvent).toHaveBeenCalledWith("wishlist.removed", {
        productId: "p-2",
        sourceSurface: "wishlist_cleanup",
      });
      expect(trackGrowthHookEvent).not.toHaveBeenCalledWith(
        "wishlist.removed",
        expect.objectContaining({
          productId: "p-1,p-2",
        })
      );
    });

    it("renders all-unavailable copy neutrally when all saved products are missing", async () => {
      useWishlistStore.setState({ items: ["p-old-1", "p-old-2"] });
      vi.mocked(apiClient.getMarketplaceProductsByIds).mockResolvedValue([]);

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/wishlist"]}>
            <Wishlist />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("جميع المنتجات المحفوظة لم تعد متاحة حالياً.")).toBeInTheDocument();
      });

      // Does not infer out-of-stock
      expect(screen.queryByText(/في المخزون/)).not.toBeInTheDocument();
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
    it("renders neutral order confirmation with order number and tracking link", () => {
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/thank-you?order=ORD-555"]}>
            <ThankYou />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.getByText("تم تسجيل طلبك بنجاح")).toBeInTheDocument();
      expect(screen.getByText("تم تسجيل الطلب بنجاح، ويمكنك متابعة تحديثات حالته أدناه.")).toBeInTheDocument();
      expect(screen.getByText("#ORD-555")).toBeInTheDocument();
      expect(screen.getAllByRole("link", { name: /تتبع حالة الطلب/ })[0]).toHaveAttribute(
        "href",
        "/track-order?order=ORD-555"
      );
      expect(screen.getAllByRole("link", { name: /عرض طلباتي/ })[0]).toHaveAttribute(
        "href",
        "/my-account/orders"
      );

      // Assert no unsupported contact or preparation promises
      expect(screen.queryByText(/سيتم التواصل معك قريباً لتأكيد الطلب/)).not.toBeInTheDocument();
      expect(screen.queryByText(/وجاري إعداده/)).not.toBeInTheDocument();
    });

    it("shows account claim banner for provisional / claimable customer when authStatus is authenticated_ready", () => {
      mockAuthState({
        authStatus: "authenticated_ready",
        accountType: "provisional_customer",
        claimRequired: true,
        accountClaimCapability: true,
        email: "temp-9647801234567@provisional.dilmart.com",
      });

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

    it("hides account claim banner for standard authenticated customer on authenticated_ready", () => {
      mockAuthState({
        authStatus: "authenticated_ready",
        accountType: "standard_customer",
        claimRequired: false,
        accountClaimCapability: false,
        email: "user@example.com",
      });

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/thank-you?order=ORD-555"]}>
            <ThankYou />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.queryByText("استلام الحساب وتأكيد الهاتف")).not.toBeInTheDocument();
      expect(screen.queryByText("تأكيد بيانات الحساب")).not.toBeInTheDocument();
    });

    it.each([
      "bootstrapping" as AuthStatus,
      "authenticated_loading_context" as AuthStatus,
      "authenticated_offline" as AuthStatus,
      "storage_error" as AuthStatus,
      "unauthenticated" as AuthStatus,
    ])("hides account claim banner when authStatus is %s even for provisional customer", (status) => {
      mockAuthState({
        authStatus: status,
        accountType: "provisional_customer",
        claimRequired: true,
        accountClaimCapability: true,
      });

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/thank-you?order=ORD-555"]}>
            <ThankYou />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.queryByText("استلام الحساب وتأكيد الهاتف")).not.toBeInTheDocument();
      expect(screen.queryByText("تأكيد بيانات الحساب")).not.toBeInTheDocument();
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
