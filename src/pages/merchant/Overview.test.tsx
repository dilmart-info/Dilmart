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
    },
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

const mockDashboardData = {
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

describe("MerchantOverview — States, Metrics & Arabic Status Authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMerchantDashboard.mockResolvedValue(mockDashboardData);
  });

  it("API ERROR STATE: renders distinct error screen with retry button and does not display zeros", async () => {
    mockGetMerchantDashboard.mockRejectedValueOnce(new Error("Database timeout"));
    renderOverview();

    const errorScreen = await screen.findByTestId("overview-error");
    expect(errorScreen).toBeTruthy();
    expect(screen.getByText("تعذر تحميل بيانات المتجر")).toBeTruthy();
    expect(screen.getByText("Database timeout")).toBeTruthy();

    // Clicking retry calls getMerchantDashboard again
    mockGetMerchantDashboard.mockResolvedValueOnce(mockDashboardData);
    const retryBtn = screen.getByRole("button", { name: /إعادة المحاولة/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockGetMerchantDashboard).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("overview-content")).toBeTruthy();
    });
  });

  it("POPULATED STATE: renders authoritative metrics correctly", async () => {
    renderOverview();

    await screen.findByTestId("overview-content");

    // Document title set
    expect(document.title).toBe("لوحة التاجر | DILMART");

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

  it("ZERO METRICS: renders empty indicators without crashing", async () => {
    mockGetMerchantDashboard.mockResolvedValueOnce({
      products: { total: 0, active: 0, inactive: 0, low_stock: 0 },
      orders: { today: 0, completed_7d: 0, average_order_value_7d: 0, revenue_7d: 0 },
      top_products: [],
      low_stock_products: [],
      recent_orders: [],
    });

    renderOverview();

    await screen.findByTestId("overview-content");

    expect(screen.getByText("جميع المنتجات بمستويات مخزون آمنة.")).toBeTruthy();
    expect(screen.getByText("لا توجد طلبات واردة حتى الآن.")).toBeTruthy();
    expect(screen.getByText("لا توجد مبيعات مسجلة بعد في هذه الفترة.")).toBeTruthy();
  });
});
