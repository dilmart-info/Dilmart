import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TrackOrder from "@/pages/TrackOrder";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { getEffectiveOrderStatus } from "@/components/account/OrderStatusBadge";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    trackOrder: vi.fn(),
    getCustomerOrders: vi.fn(),
    getCustomerOrderDetail: vi.fn(),
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

describe("Phase 2F — Track Order (/track-order)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      authSource: "anon",
      profile: null,
      capabilities: null,
      authStatus: "unauthenticated",
    } as any);
  });

  describe("Guest Order Tracking Flow", () => {
    it("validates empty inputs with toast error", async () => {
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/track-order"]}>
            <TrackOrder />
          </MemoryRouter>
        </QueryClientProvider>
      );

      fireEvent.click(screen.getByRole("button", { name: "تتبع الطلب" }));

      expect(toast.error).toHaveBeenCalledWith("يرجى إدخال رقم الطلب ورقم الهاتف");
      expect(apiClient.trackOrder).not.toHaveBeenCalled();
    });

    it("rejects invalid phone numbers with proper Arabic feedback", async () => {
      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/track-order"]}>
            <TrackOrder />
          </MemoryRouter>
        </QueryClientProvider>
      );

      fireEvent.change(screen.getByLabelText("رقم الطلب"), { target: { value: "ORD-999" } });
      fireEvent.change(screen.getByLabelText("رقم الهاتف"), { target: { value: "123456" } });
      fireEvent.click(screen.getByRole("button", { name: "تتبع الطلب" }));

      expect(toast.error).toHaveBeenCalledWith("يرجى إدخال رقم هاتف عراقي صحيح");
      expect(screen.getByText("يرجى إدخال رقم هاتف عراقي صحيح")).toBeInTheDocument();
      expect(apiClient.trackOrder).not.toHaveBeenCalled();
    });

    it.each([
      ["07701234567", "07701234567"],
      ["+9647701234567", "07701234567"],
      ["9647701234567", "07701234567"],
      ["009647701234567", "07701234567"],
    ])("normalizes phone %s to canonical local form %s before API call", async (inputPhone, expectedPhone) => {
      vi.mocked(apiClient.trackOrder).mockResolvedValue({
        found: true,
        order_number: "ORD-100",
        status: "preparing",
        delivery_status: "preparing",
        total: 25000,
        created_at: "2026-08-30T10:00:00Z",
        delivery_company: "شركة ديلمارت إكسبرس",
      });

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/track-order"]}>
            <TrackOrder />
          </MemoryRouter>
        </QueryClientProvider>
      );

      fireEvent.change(screen.getByLabelText("رقم الطلب"), { target: { value: "ORD-100" } });
      fireEvent.change(screen.getByLabelText("رقم الهاتف"), { target: { value: inputPhone } });
      fireEvent.click(screen.getByRole("button", { name: "تتبع الطلب" }));

      await waitFor(() => {
        expect(apiClient.trackOrder).toHaveBeenCalledWith({
          order_number: "ORD-100",
          phone: expectedPhone,
        });
      });

      expect(screen.getByText("#ORD-100")).toBeInTheDocument();
      expect(screen.getByText("شركة ديلمارت إكسبرس")).toBeInTheDocument();
    });

    it("handles guest not found response cleanly", async () => {
      vi.mocked(apiClient.trackOrder).mockResolvedValue({
        found: false,
        message: "لم يتم العثور على طلب مطابق للبيانات المدخلة",
      });

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/track-order"]}>
            <TrackOrder />
          </MemoryRouter>
        </QueryClientProvider>
      );

      fireEvent.change(screen.getByLabelText("رقم الطلب"), { target: { value: "ORD-000" } });
      fireEvent.change(screen.getByLabelText("رقم الهاتف"), { target: { value: "07801234567" } });
      fireEvent.click(screen.getByRole("button", { name: "تتبع الطلب" }));

      await waitFor(() => {
        expect(screen.getByText("لم يتم العثور على طلب مطابق للبيانات المدخلة")).toBeInTheDocument();
      });
    });
  });

  describe("Authenticated Tracking Flow", () => {
    it("handles getCustomerOrders API failure with retry (does not claim no orders)", async () => {
      vi.mocked(useAuth).mockReturnValue({
        user: { id: "user-1" },
        authSource: "supabase",
        profile: null,
        capabilities: null,
        authStatus: "authenticated",
      } as any);

      vi.mocked(apiClient.getCustomerOrders).mockRejectedValue(new Error("Database error"));

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/track-order"]}>
            <TrackOrder />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("تعذر تحميل سجل الطلبات")).toBeInTheDocument();
      });

      expect(screen.queryByText("لا توجد طلبات في حسابك حالياً")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument();
    });

    it("renders authenticated orders list and allows selecting an order", async () => {
      vi.mocked(useAuth).mockReturnValue({
        user: { id: "user-1" },
        authSource: "supabase",
        profile: null,
        capabilities: null,
        authStatus: "authenticated",
      } as any);

      vi.mocked(apiClient.getCustomerOrders).mockResolvedValue([
        {
          id: "order-1",
          order_number: "ORD-AUTH-1",
          status: "confirmed",
          delivery_status: "confirmed",
          total: 50000,
          created_at: "2026-08-31T12:00:00Z",
          items_count: 2,
        } as any,
        {
          id: "order-2",
          order_number: "ORD-AUTH-2",
          status: "delivered",
          delivery_status: "delivered",
          total: 30000,
          created_at: "2026-08-30T12:00:00Z",
          items_count: 1,
        } as any,
      ]);

      vi.mocked(apiClient.getCustomerOrderDetail).mockResolvedValue({
        id: "order-1",
        order_number: "ORD-AUTH-1",
        status: "confirmed",
        delivery_status: "confirmed",
        total: 50000,
        created_at: "2026-08-31T12:00:00Z",
        items: [{ product_id: "p-1", product_name: "ساعة ذكية", quantity: 1, price: 50000 }],
      } as any);

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/track-order"]}>
            <TrackOrder />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("#ORD-AUTH-1")).toBeInTheDocument();
        expect(screen.getByText("#ORD-AUTH-2")).toBeInTheDocument();
      });

      // Click order 1
      fireEvent.click(screen.getByText("#ORD-AUTH-1"));

      await waitFor(() => {
        expect(screen.getByText("ساعة ذكية")).toBeInTheDocument();
      });
    });
  });

  describe("Shared Status Authority & Unknown Status Fallback", () => {
    it("maps unknown raw backend status to safe Arabic text rather than exposing raw code", () => {
      const unknownResult = getEffectiveOrderStatus({
        status: "custom_internal_code_xyz",
      });

      expect(unknownResult.label).toBe("حالة الطلب قيد التحديث");
      expect(unknownResult.label).not.toBe("custom_internal_code_xyz");
    });
  });
});
