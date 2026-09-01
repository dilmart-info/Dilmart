import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OrdersPage from "./OrdersPage";

const { mockGetScopedOrders, mockUpdateScopedOrderStatus, mockGetActiveMerchants } = vi.hoisted(() => ({
  mockGetScopedOrders: vi.fn(),
  mockUpdateScopedOrderStatus: vi.fn(),
  mockGetActiveMerchants: vi.fn(),
}));

vi.mock("@/lib/scoped-queries", () => ({
  getScopedOrders: (...args: unknown[]) => mockGetScopedOrders(...args),
  updateScopedOrderStatus: (...args: unknown[]) => mockUpdateScopedOrderStatus(...args),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getActiveMerchants: (...args: unknown[]) => mockGetActiveMerchants(...args),
  },
}));

vi.mock("@/components/admin/ManualOrderModal", () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="manual-order-modal">Manual Order Modal</div> : null),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const merchantContext = { scope: "merchant" as const, merchantId: "m-100" };
const platformContext = { scope: "platform" as const };

function renderOrdersPage(context = merchantContext, detailBasePath = "/merchant/orders") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/merchant/orders"]}>
        <OrdersPage context={context} detailBasePath={detailBasePath} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const mockOrdersList = [
  {
    id: "ord-1",
    order_number: "ORD-101",
    customer_name: "علي حسن",
    merchants: { display_name: "متجر بغداد" },
    total: 35000,
    status: "new",
    merchant_decision_status: "pending",
    created_at: "2026-09-01T09:00:00Z",
  },
  {
    id: "ord-2",
    order_number: "ORD-102",
    customer_name: "زينب مهدي",
    merchants: { display_name: "متجر بغداد" },
    total: 80000,
    status: "shipped",
    merchant_decision_status: "accepted",
    created_at: "2026-09-01T08:00:00Z",
  },
  {
    id: "ord-3",
    order_number: "ORD-103",
    customer_name: "أحمد كريم",
    merchants: { display_name: "متجر بغداد" },
    total: 15000,
    status: "cancelled",
    merchant_decision_status: "rejected",
    created_at: "2026-09-01T07:00:00Z",
  },
  {
    id: "ord-4",
    order_number: "ORD-104",
    customer_name: "مريم جاسم",
    merchants: { display_name: "متجر بغداد" },
    total: 50000,
    status: "UNKNOWN_STATE_FROM_API",
    merchant_decision_status: null,
    created_at: "2026-09-01T06:00:00Z",
  },
];

describe("OrdersPage — Scoped Authority, States & Arabic Status Mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetScopedOrders.mockResolvedValue({ items: mockOrdersList, total: 4, hasMore: false });
    mockGetActiveMerchants.mockResolvedValue([
      { id: "m-100", display_name: "متجر بغداد" },
      { id: "m-200", display_name: "متجر البصرة" },
    ]);
  });

  it("API ERROR STATE: renders distinct error screen with retry button and does not report zero orders", async () => {
    mockGetScopedOrders.mockRejectedValueOnce(new Error("Network timeout"));
    renderOrdersPage();

    const errorBlock = await screen.findByTestId("orders-error");
    expect(errorBlock).toBeTruthy();
    expect(screen.getByText("تعذر تحميل الطلبات")).toBeTruthy();
    expect(screen.getByText("Network timeout")).toBeTruthy();

    mockGetScopedOrders.mockResolvedValueOnce({ items: mockOrdersList, total: 4, hasMore: false });
    const retryBtn = screen.getByRole("button", { name: /إعادة المحاولة/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockGetScopedOrders).toHaveBeenCalledTimes(2);
      expect(screen.getByText("#ORD-101")).toBeTruthy();
    });
  });

  it("EMPTY STATES: distinguishes empty catalog from filtered empty", async () => {
    mockGetScopedOrders.mockResolvedValueOnce({ items: [], total: 0, hasMore: false });
    renderOrdersPage();

    await screen.findByTestId("orders-empty");
    expect(screen.getByText("لا توجد طلبات في متجرك حتى الآن.")).toBeTruthy();
  });

  it("FILTERED EMPTY STATE: shows filtered message when search or status filter active", async () => {
    mockGetScopedOrders.mockResolvedValue({ items: [], total: 0, hasMore: false });
    renderOrdersPage();

    const searchInput = await screen.findByPlaceholderText("بحث برقم الطلب...");
    fireEvent.change(searchInput, { target: { value: "9999" } });

    await waitFor(() => {
      expect(screen.getByText("لا توجد طلبات مطابقة للفلاتر الحالية.")).toBeTruthy();
    });
  });

  it("MERCHANT SCOPE: renders decision badges and Arabic status without exposing platform controls", async () => {
    mockGetScopedOrders.mockResolvedValue({ items: mockOrdersList, total: 4, hasMore: false });
    renderOrdersPage(merchantContext);

    await screen.findByText("#ORD-101");

    // Decision status badge
    expect(screen.getByText("بانتظار قرارك")).toBeTruthy();
    expect(screen.getByText("مرفوض من المتجر")).toBeTruthy();

    // Arabic mapped order status
    expect(screen.getAllByText("جديد").length).toBeGreaterThan(0);
    expect(screen.getAllByText("قيد التوصيل").length).toBeGreaterThan(0);

    // Safe fallback for unknown status (never raw string)
    expect(screen.getByText("حالة الطلب قيد التحديث")).toBeTruthy();
    expect(screen.queryByText("UNKNOWN_STATE_FROM_API")).toBeNull();

    // Merchant context must NOT render platform controls
    expect(screen.queryByText("إنشاء طلب من محادثة")).toBeNull();
    expect(screen.queryByText("كل التجار")).toBeNull();
  });

  it("PLATFORM SCOPE: renders customer names, merchant column, status select dropdown, and manual order button", async () => {
    mockGetScopedOrders.mockResolvedValue({ items: mockOrdersList, total: 4, hasMore: false });
    renderOrdersPage(platformContext, "/admin/orders");

    await screen.findByText("#ORD-101");

    // Platform elements
    expect(screen.getByText("إنشاء طلب من محادثة")).toBeTruthy();
    expect(screen.getByText("كل التجار")).toBeTruthy();
    expect(screen.getByText("علي حسن")).toBeTruthy();
    expect(screen.getAllByText("متجر بغداد").length).toBeGreaterThan(0);

    // Open manual order modal
    fireEvent.click(screen.getByText("إنشاء طلب من محادثة"));
    expect(screen.getByTestId("manual-order-modal")).toBeTruthy();
  });
});
