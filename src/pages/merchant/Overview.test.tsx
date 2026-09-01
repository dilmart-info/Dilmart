import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MerchantOverview from "./Overview";
import { formatPrice } from "@/lib/format";

const { mockGetMerchantDashboard, mockCurrentMerchant } = vi.hoisted(() => ({
  mockGetMerchantDashboard: vi.fn(),
  mockCurrentMerchant: {
    data: {
      merchant_id: "m-123",
      role: "owner",
      merchants: { id: "m-123", display_name: "متجر الفرات", status: "active" },
    } as { merchant_id: string; role: string; merchants: { id: string; display_name: string; status: string } } | null,
    isLoading: false,
  },
}));

vi.mock("@/hooks/use-current-merchant", () => ({
  useCurrentMerchant: () => mockCurrentMerchant,
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getMerchantDashboard: (...args: unknown[]) => mockGetMerchantDashboard(...args),
  },
}));

function renderOverview() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/merchant"]}>
        <MerchantOverview />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const mockDashboardDataA = {
  products: {
    total: 45,
    active: 38,
    inactive: 7,
    low_stock: 3,
  },
  orders: {
    today: 12,
    completed_7d: 54,
    average_order_value_7d: 35000,
    revenue_7d: 1890000,
  },
  top_products: [
    { product_id: "p-1", name: "عطر ليالي بغداد", units_sold: 28 },
    { product_id: "p-2", name: "ساعة فاخرة", units_sold: 14 },
  ],
  low_stock_products: [
    { product_id: "p-3", name: "محفظة جلدية", stock: 2, threshold: 5 },
  ],
  recent_orders: [
    {
      id: "ord-1",
      order_number: "DUK-1001",
      created_at: "2026-09-01T10:00:00Z",
      total: 45000,
      status: "preparing",
    },
    {
      id: "ord-2",
      order_number: "DUK-1002",
      created_at: "2026-09-01T11:00:00Z",
      total: 25000,
      status: "UNKNOWN_CUSTOM_STATUS",
    },
  ],
};

const mockDashboardDataB = {
  products: {
    total: 10,
    active: 8,
    inactive: 2,
    low_stock: 0,
  },
  orders: {
    today: 5,
    completed_7d: 15,
    average_order_value_7d: 50000,
    revenue_7d: 750000,
  },
  top_products: [
    { product_id: "p-b1", name: "قهوة عربية فاخرة", units_sold: 40 },
  ],
  low_stock_products: [],
  recent_orders: [
    {
      id: "ord-b1",
      order_number: "DUK-2001",
      created_at: "2026-09-01T12:00:00Z",
      total: 50000,
      status: "shipped",
    },
  ],
};

describe("MerchantOverview — States, Metrics, Neutral Semantics & Data Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentMerchant.data = {
      merchant_id: "m-123",
      role: "owner",
      merchants: { id: "m-123", display_name: "متجر الفرات", status: "active" },
    };
    mockGetMerchantDashboard.mockResolvedValue(mockDashboardDataA);
  });

  it("API ERROR STATE: renders distinct error screen with retry button and does not display zeros", async () => {
    mockGetMerchantDashboard.mockRejectedValueOnce(new Error("Database timeout"));
    renderOverview();

    const errorScreen = await screen.findByTestId("overview-error");
    expect(errorScreen).toBeTruthy();
    expect(screen.getByText("تعذر تحميل بيانات المتجر")).toBeTruthy();
    expect(screen.getByText("Database timeout")).toBeTruthy();

    // Clicking retry calls getMerchantDashboard again
    mockGetMerchantDashboard.mockResolvedValueOnce(mockDashboardDataA);
    const retryBtn = screen.getByRole("button", { name: /إعادة المحاولة/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockGetMerchantDashboard).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("overview-content")).toBeTruthy();
    });
  });

  it("POPULATED STATE & NEUTRAL SEMANTICS: renders authoritative metrics with neutral subtitles", async () => {
    renderOverview();

    await screen.findByTestId("overview-content");

    // Document title set
    expect(document.title).toBe("لوحة التاجر | DILMART");

    // Neutral copy checks (no rolling 24-hour claim)
    expect(screen.getAllByText("طلبات اليوم").length).toBeGreaterThan(0);
    expect(screen.queryByText(/24 ساعة/)).toBeNull();

    // Primary metrics
    expect(screen.getByText("12")).toBeTruthy(); // Today's orders
    expect(screen.getAllByText(formatPrice(1890000)).length).toBeGreaterThan(0); // 7d Revenue
    expect(screen.getAllByText(formatPrice(35000)).length).toBeGreaterThan(0); // AOV
    expect(screen.getByText("3")).toBeTruthy(); // Low stock count

    // Secondary metrics
    expect(screen.getByText("45")).toBeTruthy(); // Total products
    expect(screen.getByText("38")).toBeTruthy(); // Active products
    expect(screen.getByText("7")).toBeTruthy(); // Inactive products
    expect(screen.getByText("54")).toBeTruthy(); // Completed orders 7d

    // Top products
    expect(screen.getByText("عطر ليالي بغداد")).toBeTruthy();
    expect(screen.getByText("28 وحدة مُباعة")).toBeTruthy();

    // Low stock items
    expect(screen.getByText("محفظة جلدية")).toBeTruthy();
    expect(screen.getByText("المتبقي: 2 / الحد: 5")).toBeTruthy();

    // Recent orders with mapped statuses
    expect(screen.getByText("#DUK-1001")).toBeTruthy();
    expect(screen.getByText("قيد التجهيز")).toBeTruthy();

    // Unknown status is safely mapped to Arabic fallback (never raw string)
    expect(screen.getByText("#DUK-1002")).toBeTruthy();
    expect(screen.getByText("حالة الطلب قيد التحديث")).toBeTruthy();
    expect(screen.queryByText("UNKNOWN_CUSTOM_STATUS")).toBeNull();
  });

  it("ZERO METRICS & NEUTRAL LOW-STOCK COPY: renders neutral zero low-stock message", async () => {
    mockGetMerchantDashboard.mockResolvedValueOnce({
      products: { total: 0, active: 0, inactive: 0, low_stock: 0 },
      orders: { today: 0, completed_7d: 0, average_order_value_7d: 0, revenue_7d: 0 },
      top_products: [],
      low_stock_products: [],
      recent_orders: [],
    });

    renderOverview();

    await screen.findByTestId("overview-content");

    // Neutral low stock copy
    expect(screen.getByText("لا توجد منتجات منخفضة المخزون حالياً.")).toBeTruthy();
    expect(screen.queryByText(/آمنة/)).toBeNull();
    expect(screen.getByText("لا توجد طلبات واردة حتى الآن.")).toBeTruthy();
    expect(screen.getByText("لا توجد مبيعات مسجلة بعد في هذه الفترة.")).toBeTruthy();
  });

  it("MERCHANT A -> B DATA ISOLATION: switching active merchant requests new merchant dashboard and updates rendered metrics immediately", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    mockGetMerchantDashboard.mockImplementation((id: string) => {
      if (id === "m-123") return Promise.resolve(mockDashboardDataA);
      if (id === "m-456") return Promise.resolve(mockDashboardDataB);
      return Promise.reject(new Error("Unknown merchant"));
    });

    // 1. Initial render with Merchant A (m-123)
    mockCurrentMerchant.data = {
      merchant_id: "m-123",
      role: "owner",
      merchants: { id: "m-123", display_name: "متجر الفرات", status: "active" },
    };

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant"]}>
          <MerchantOverview />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("عطر ليالي بغداد")).toBeTruthy();
    expect(screen.getByText("#DUK-1001")).toBeTruthy();
    expect(mockGetMerchantDashboard).toHaveBeenCalledWith("m-123");

    // 2. Switch to Merchant B (m-456)
    mockCurrentMerchant.data = {
      merchant_id: "m-456",
      role: "owner",
      merchants: { id: "m-456", display_name: "متجر دجلة", status: "active" },
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant"]}>
          <MerchantOverview />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Merchant B metrics and orders visible, Merchant A items replaced
    expect(await screen.findByText("قهوة عربية فاخرة")).toBeTruthy();
    expect(screen.getByText("#DUK-2001")).toBeTruthy();
    expect(screen.queryByText("عطر ليالي بغداد")).toBeNull();
    expect(screen.queryByText("#DUK-1001")).toBeNull();
    expect(mockGetMerchantDashboard).toHaveBeenCalledWith("m-456");
  });
});
