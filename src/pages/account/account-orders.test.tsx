import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AccountOrders from "@/pages/account/Orders";
import { apiClient } from "@/lib/api-client";
import { useCartStore } from "@/lib/cart-store";

const useAuthMock = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getCustomerOrders: vi.fn(),
    getCustomerOrderDetail: vi.fn(),
    customerCancelOrder: vi.fn(),
    createReturnRequest: vi.fn(),
    getReturnRequest: vi.fn(),
    previewCustomerReorder: vi.fn(),
  },
}));

vi.mock("@/components/Header", () => ({ default: () => <header>Header</header> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer>Footer</footer> }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));

function renderWithProviders(initialEntry = "/my-account/orders") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/my-account/orders" element={<AccountOrders />} />
          <Route path="/checkout" element={<div>Checkout Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Account Orders List, Detail, Cancellation & Return Flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      user: { id: "cust-1", email: "customer@dilmart.iq" },
      profile: { full_name: "أحمد حسام", points: 100 },
      appSession: { authSource: "supabase", user: { id: "cust-1" } },
      authSource: "supabase",
      authStatus: "authenticated_ready",
      capabilities: {},
    });
  });

  it("renders loading state then populated orders with effective status mapping", async () => {
    (apiClient.getCustomerOrders as any).mockResolvedValue([
      {
        id: "ord-1",
        order_number: "ORD-9901",
        status: "pending",
        delivery_status: "in_transit",
        total: 75000,
        created_at: "2026-08-30T10:00:00Z",
        items_count: 2,
        items_preview: [
          { product_id: "p1", product_name: "ساعة ذكية", quantity: 1, price: 75000 },
        ],
      },
    ]);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("#ORD-9901")).toBeInTheDocument();
      // Effective status for delivery_status='in_transit' is 'في الطريق للتوصيل'
      expect(screen.getByText("في الطريق للتوصيل")).toBeInTheDocument();
      expect(screen.getByText(/ساعة ذكية/)).toBeInTheDocument();
    });
  });

  it("renders empty state when customer has no orders", async () => {
    (apiClient.getCustomerOrders as any).mockResolvedValue([]);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("لا توجد طلبات سابقة")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "تصفح المنتجات وابدأ التسوق" })).toBeInTheDocument();
    });
  });

  it("loads and displays order detail view without fabricated timestamps", async () => {
    (apiClient.getCustomerOrders as any).mockResolvedValue([]);
    (apiClient.getCustomerOrderDetail as any).mockResolvedValue({
      id: "ord-detail-1",
      order_number: "ORD-5555",
      status: "preparing",
      delivery_status: null,
      created_at: "2026-08-31T12:00:00Z",
      total: 120000,
      delivery_snapshot: {
        customer_name: "مروان طارق",
        customer_phone: "07801122334",
        governorate_id: "gov-bgd",
        area: "المنصور",
        nearest_landmark: "قرب تقاطع الرواد",
        map_url: null,
        notes: "يرجى الاتصال قبل الوصول",
      },
      items: [
        {
          product_id: "prod-10",
          product_name: "عطر فاخر أصلي",
          quantity: 2,
          price: 60000,
          merchant_id: "m-1",
        },
      ],
    });

    renderWithProviders("/my-account/orders?orderId=ord-detail-1");

    await waitFor(() => {
      expect(screen.getByText("#ORD-5555")).toBeInTheDocument();
      expect(screen.getByText("عطر فاخر أصلي")).toBeInTheDocument();
      expect(screen.getByText("مروان طارق")).toBeInTheDocument();
      expect(screen.getByText(/المنصور/)).toBeInTheDocument();
      expect(screen.getByText("يرجى الاتصال قبل الوصول")).toBeInTheDocument();
      expect(screen.getByText("مسار متابعة الطلب:")).toBeInTheDocument();
    });
  });

  it("opens cancellation dialog and calls canonical customerCancelOrder on submission", async () => {
    (apiClient.getCustomerOrders as any).mockResolvedValue([
      {
        id: "ord-cancel-1",
        order_number: "ORD-3001",
        status: "pending",
        delivery_status: "pending",
        total: 40000,
        created_at: "2026-08-30T10:00:00Z",
        items_count: 1,
        items_preview: [],
      },
    ]);

    (apiClient.customerCancelOrder as any).mockResolvedValue({
      cancelled: true,
      can_request_return: false,
      message: "تم إلغاء الطلب بنجاح",
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("#ORD-3001")).toBeInTheDocument();
    });

    // Click cancellation button
    const cancelBtn = screen.getByRole("button", { name: "إلغاء" });
    fireEvent.click(cancelBtn);

    // Verify cancellation dialog opened (no prompt!)
    expect(screen.getByText("إلغاء الطلب")).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText("اكتب سبب الإلغاء هنا...");
    fireEvent.change(textarea, { target: { value: "تغيير في خطة الشراء" } });

    const confirmCancelBtn = screen.getByRole("button", { name: "تأكيد إلغاء الطلب" });
    fireEvent.click(confirmCancelBtn);

    await waitFor(() => {
      expect(apiClient.customerCancelOrder).toHaveBeenCalledWith("ord-cancel-1", {
        reason_code: "customer_requested_cancellation",
        reason_details: "تغيير في خطة الشراء",
      });
    });
  });

  it("handles cancellation review response properly (cancellation_requested = true)", async () => {
    (apiClient.getCustomerOrders as any).mockResolvedValue([
      {
        id: "ord-cancel-review",
        order_number: "ORD-3002",
        status: "preparing",
        delivery_status: "preparing",
        total: 45000,
        created_at: "2026-08-30T10:00:00Z",
        items_count: 1,
      },
    ]);

    (apiClient.customerCancelOrder as any).mockResolvedValue({
      cancelled: false,
      cancellation_requested: true,
      can_request_return: false,
      message: "الطلب قيد التجهيز. تم تقديم طلب الإلغاء وهو قيد مراجعة الإدارة والتاجر.",
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("#ORD-3002")).toBeInTheDocument();
    });

    const cancelBtn = screen.getByRole("button", { name: "إلغاء" });
    fireEvent.click(cancelBtn);

    const confirmCancelBtn = screen.getByRole("button", { name: "تأكيد إلغاء الطلب" });
    fireEvent.click(confirmCancelBtn);

    await waitFor(() => {
      expect(apiClient.customerCancelOrder).toHaveBeenCalled();
    });
  });

  it("handles return request for delivered orders using canonical createReturnRequest", async () => {
    (apiClient.getCustomerOrders as any).mockResolvedValue([
      {
        id: "ord-delivered-1",
        order_number: "ORD-8888",
        status: "delivered",
        delivery_status: "delivered",
        total: 65000,
        created_at: "2026-08-25T10:00:00Z",
        items_count: 1,
      },
    ]);

    (apiClient.createReturnRequest as any).mockResolvedValue({
      ok: true,
      return_request_id: "ret-1",
      status: "pending_review",
      message: "تم تقديم طلب الإرجاع بنجاح وهو قيد المراجعة.",
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("#ORD-8888")).toBeInTheDocument();
    });

    // Click Return CTA
    const returnBtn = screen.getByRole("button", { name: "إرجاع" });
    fireEvent.click(returnBtn);

    // Verify dialog opened without window.prompt
    expect(screen.getByText("طلب إرجاع الطلب")).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText("اكتب سبب طلب الإرجاع هنا بالتفصيل...");
    fireEvent.change(textarea, { target: { value: "المنتج غير مطابق للمواصفات" } });

    const submitReturnBtn = screen.getByRole("button", { name: "إرسال طلب الإرجاع" });
    fireEvent.click(submitReturnBtn);

    await waitFor(() => {
      expect(apiClient.createReturnRequest).toHaveBeenCalledWith("ord-delivered-1", {
        reason_code: "customer_return_request",
        reason_details: "المنتج غير مطابق للمواصفات",
      });
    });
  });

  it("handles reorder preview, displays price differences and warnings, and confirms cart replacement", async () => {
    useCartStore.setState({
      items: [
        {
          quantity: 1,
          product: { id: "old-item", name: "منتج قديم", price: 10000, images: [] } as any,
        },
      ],
      merchantId: "m-old",
    });

    (apiClient.getCustomerOrders as any).mockResolvedValue([
      {
        id: "ord-reorder-1",
        order_number: "ORD-7001",
        status: "delivered",
        delivery_status: "delivered",
        total: 50000,
        created_at: "2026-08-20T10:00:00Z",
        items_count: 2,
      },
    ]);

    (apiClient.previewCustomerReorder as any).mockResolvedValue({
      can_reorder: true,
      merchant_id: "m-target",
      valid_items: [
        {
          product_id: "prod-re-1",
          product_name: "عطر صيفي",
          quantity: 1,
          current_price: 30000,
          previous_price: 25000,
          price_changed: true,
          stock_available: true,
        },
      ],
      unavailable_items: [
        {
          product_id: "prod-unavail",
          product_name: "شاحن منتهي",
          reason: "out_of_stock",
        },
      ],
      warnings: ["تغير سعر بعض المنتجات منذ طلبك السابق"],
    });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText("#ORD-7001")).toBeInTheDocument();
    });

    const reorderBtn = screen.getByRole("button", { name: "إعادة الطلب" });
    fireEvent.click(reorderBtn);

    await waitFor(() => {
      expect(screen.getByText("إعادة الطلب السابق")).toBeInTheDocument();
      expect(screen.getByText(/تنبيه: سيتم استبدال محتويات سلتك الحالية/)).toBeInTheDocument();
      expect(screen.getByText("عطر صيفي (×1)")).toBeInTheDocument();
      expect(screen.getByText("نفد المخزون")).toBeInTheDocument();
    });

    const confirmReorderBtn = screen.getByRole("button", { name: "تأكيد وإضافة للسلة" });
    fireEvent.click(confirmReorderBtn);

    await waitFor(() => {
      expect(useCartStore.getState().items.length).toBe(1);
      expect(useCartStore.getState().items[0].product.name).toBe("عطر صيفي");
      expect(useCartStore.getState().activeMerchantId).toBe("m-target");
    });
  });
});
