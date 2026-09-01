import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OrdersPage, {
  ORDER_FILTER_OPTIONS,
  PLATFORM_ORDER_MUTATION_OPTIONS,
} from "./OrdersPage";

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

const merchantContextA = { scope: "merchant" as const, merchantId: "m-100" };
const merchantContextB = { scope: "merchant" as const, merchantId: "m-200" };
const platformContext = { scope: "platform" as const };

function renderOrdersPage(context = merchantContextA, detailBasePath = "/merchant/orders", initialEntries = ["/merchant/orders"]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <OrdersPage context={context} detailBasePath={detailBasePath} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const mockOrdersA = [
  {
    id: "ord-a1",
    order_number: "ORD-A101",
    customer_name: "علي حسن",
    merchants: { display_name: "متجر بغداد" },
    total: 35000,
    status: "new",
    merchant_decision_status: "pending",
    created_at: "2026-09-01T09:00:00Z",
  },
  {
    id: "ord-a2",
    order_number: "ORD-A102",
    customer_name: "زينب مهدي",
    merchants: { display_name: "متجر بغداد" },
    total: 80000,
    status: "shipped",
    merchant_decision_status: "accepted",
    created_at: "2026-09-01T08:00:00Z",
  },
];

const mockOrdersB = [
  {
    id: "ord-b1",
    order_number: "ORD-B201",
    customer_name: "حسين علي",
    merchants: { display_name: "متجر البصرة" },
    total: 120000,
    status: "preparing",
    merchant_decision_status: null,
    created_at: "2026-09-01T10:00:00Z",
  },
];

describe("OrdersPage — Scoped Authority, States & Arabic Status Mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetScopedOrders.mockResolvedValue({ items: mockOrdersA, total: 2, hasMore: false });
    mockGetActiveMerchants.mockResolvedValue([
      { id: "m-100", display_name: "متجر بغداد" },
      { id: "m-200", display_name: "متجر البصرة" },
    ]);
  });

  it("ORDER FILTER VS ADMIN MUTATION AUTHORITY: filter-only status ('pending') does NOT become a mutation option", async () => {
    // 1. Static authority split verification
    expect(ORDER_FILTER_OPTIONS).toContain("pending");
    expect(PLATFORM_ORDER_MUTATION_OPTIONS).not.toContain("pending");

    // 2. Runtime DOM verification
    renderOrdersPage(platformContext, "/admin/orders");

    // Filter dropdown includes 'pending'
    const filterSelect = screen.getByLabelText("فلترة الحالة");
    const filterOptions = Array.from(filterSelect.querySelectorAll("option")).map((o) => o.value);
    expect(filterOptions).toContain("pending");

    // Platform status mutation select does NOT include 'pending'
    const mutationSelects = await screen.findAllByLabelText("تحديث حالة الطلب");
    expect(mutationSelects.length).toBeGreaterThan(0);
    const mutationOptions = Array.from(mutationSelects[0].querySelectorAll("option")).map((o) => o.value);
    expect(mutationOptions).not.toContain("pending");
    expect(mutationOptions).toEqual(["new", "contacted", "preparing", "shipped", "delivered", "cancelled", "returned"]);
  });

  it("API ERROR STATE: renders distinct error screen with retry button and does not report zero orders", async () => {
    mockGetScopedOrders.mockRejectedValueOnce(new Error("Network timeout"));
    renderOrdersPage();

    const errorBlock = await screen.findByTestId("orders-error");
    expect(errorBlock).toBeTruthy();
    expect(screen.getByText("تعذر تحميل الطلبات")).toBeTruthy();
    expect(screen.getByText("Network timeout")).toBeTruthy();

    mockGetScopedOrders.mockResolvedValueOnce({ items: mockOrdersA, total: 2, hasMore: false });
    const retryBtn = screen.getByRole("button", { name: /إعادة المحاولة/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockGetScopedOrders).toHaveBeenCalledTimes(2);
      expect(screen.getAllByText("#ORD-A101").length).toBeGreaterThan(0);
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
    mockGetScopedOrders.mockResolvedValue({ items: mockOrdersA, total: 2, hasMore: false });
    renderOrdersPage(merchantContextA);

    await screen.findAllByText("#ORD-A101");

    // Decision status badge
    expect(screen.getAllByText("بانتظار قرارك").length).toBeGreaterThan(0);

    // Arabic mapped order status
    expect(screen.getAllByText("جديد").length).toBeGreaterThan(0);
    expect(screen.getAllByText("قيد التوصيل").length).toBeGreaterThan(0);

    // Merchant context must NOT render platform controls
    expect(screen.queryByText("إنشاء طلب من محادثة")).toBeNull();
    expect(screen.queryByText("كل التجار")).toBeNull();
  });

  it("PLATFORM SCOPE: renders customer names, merchant column, status select dropdown, and manual order button", async () => {
    mockGetScopedOrders.mockResolvedValue({ items: mockOrdersA, total: 2, hasMore: false });
    renderOrdersPage(platformContext, "/admin/orders");

    await screen.findByText("#ORD-A101");

    // Platform elements
    expect(screen.getByText("إنشاء طلب من محادثة")).toBeTruthy();
    expect(screen.getByText("كل التجار")).toBeTruthy();
    expect(screen.getByText("علي حسن")).toBeTruthy();
    expect(screen.getAllByText("متجر بغداد").length).toBeGreaterThan(0);

    // Open manual order modal
    fireEvent.click(screen.getByText("إنشاء طلب من محادثة"));
    expect(screen.getByTestId("manual-order-modal")).toBeTruthy();
  });

  it("MERCHANT A -> B DATA ISOLATION: switching merchant context immediately requests new merchant orders and does not leak previous orders", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    mockGetScopedOrders.mockImplementation((ctx: { merchantId?: string }) => {
      if (ctx.merchantId === "m-100") {
        return Promise.resolve({ items: mockOrdersA, total: 2, hasMore: false });
      }
      if (ctx.merchantId === "m-200") {
        return Promise.resolve({ items: mockOrdersB, total: 1, hasMore: false });
      }
      return Promise.resolve({ items: [], total: 0, hasMore: false });
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/orders"]}>
          <OrdersPage context={merchantContextA} detailBasePath="/merchant/orders" />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Merchant A orders visible
    expect(await screen.findAllByText("#ORD-A101")).toBeTruthy();
    expect(screen.queryByText("#ORD-B201")).toBeNull();

    // Rerender with Merchant B context
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/orders"]}>
          <OrdersPage context={merchantContextB} detailBasePath="/merchant/orders" />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Merchant B orders visible, Merchant A orders NOT leaked
    expect(await screen.findAllByText("#ORD-B201")).toBeTruthy();
    expect(screen.queryByText("#ORD-A101")).toBeNull();
  });
});
