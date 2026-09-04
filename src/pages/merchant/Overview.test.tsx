import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MerchantOverview, { parseCanonicalDashboardResponse } from "./Overview";
import { formatPrice } from "@/lib/format";
import { merchantApi } from "@/lib/api/merchant";
import { apiClient } from "@/lib/api-client";

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

vi.mock("@/lib/api/merchant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/merchant")>();
  return {
    ...actual,
    merchantApi: {
      ...actual.merchantApi,
      getMerchantDashboard: (...args: unknown[]) => mockGetMerchantDashboard(...args),
    },
  };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      getMerchantDashboard: (...args: unknown[]) => mockGetMerchantDashboard(...args),
    },
  };
});

function renderOverview(initialQueryClient?: QueryClient) {
  const queryClient = initialQueryClient ?? new QueryClient({
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
  merchant_id: "m-123",
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
  merchant_id: "m-456",
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

  it("API RUNTIME CONTRACT: merchantApi and apiClient both expose getMerchantDashboard", () => {
    expect(typeof merchantApi.getMerchantDashboard).toBe("function");
    expect(typeof apiClient.getMerchantDashboard).toBe("function");
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
      merchant_id: "m-123",
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

  it("DEFERRED RACE CONDITION ISOLATION: late resolved response from Store A does not overwrite Store B", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    let resolveStoreA: (val: unknown) => void = () => {};
    const storeAPromise = new Promise<unknown>((resolve) => {
      resolveStoreA = resolve;
    });

    mockGetMerchantDashboard.mockImplementation((id: string) => {
      if (id === "m-123") return storeAPromise;
      if (id === "m-456") return Promise.resolve(mockDashboardDataB);
      return Promise.reject(new Error("Unknown merchant"));
    });

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

    // Store A is still loading
    expect(screen.getByTestId("overview-loading")).toBeTruthy();

    // Switch to Store B before Store A resolves
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

    // Store B loads and renders
    expect(await screen.findByText("قهوة عربية فاخرة")).toBeTruthy();

    // Now Store A finally resolves late
    resolveStoreA(mockDashboardDataA);
    await new Promise((r) => setTimeout(r, 50));

    // Store B remains active and rendered, Store A data never leaks into Store B view
    expect(screen.getByText("قهوة عربية فاخرة")).toBeTruthy();
    expect(screen.queryByText("عطر ليالي بغداد")).toBeNull();
  });
});

describe("parseCanonicalDashboardResponse — Contract Assertion & Fail-Closed Guardrails", () => {
  it("passes on well-formed canonical payload with matching merchant_id", () => {
    const parsed = parseCanonicalDashboardResponse(mockDashboardDataA, "m-123");
    expect(parsed.merchant_id).toBe("m-123");
    expect(parsed.products.total).toBe(45);
    expect(parsed.orders.today).toBe(12);
  });

  it("fails closed if raw payload is not an object or is null", () => {
    expect(() => parseCanonicalDashboardResponse(null, "m-123")).toThrow(/البنية ليست كائناً/);
    expect(() => parseCanonicalDashboardResponse("invalid", "m-123")).toThrow(/البنية ليست كائناً/);
    expect(() => parseCanonicalDashboardResponse([], "m-123")).toThrow(/البنية ليست كائناً/);
  });

  it("fails closed if merchant_id is missing or not a string", () => {
    const payloadNoMerchantId = { ...mockDashboardDataA, merchant_id: undefined };
    expect(() => parseCanonicalDashboardResponse(payloadNoMerchantId, "m-123")).toThrow(/merchant_id مفقود أو غير نصي/);

    const payloadEmptyMerchantId = { ...mockDashboardDataA, merchant_id: "  " };
    expect(() => parseCanonicalDashboardResponse(payloadEmptyMerchantId, "m-123")).toThrow(/merchant_id مفقود أو غير نصي/);
  });

  it("fails closed if merchant_id in response mismatches expected merchantId", () => {
    expect(() => parseCanonicalDashboardResponse(mockDashboardDataA, "m-OTHER")).toThrow(
      /تعارض أمان المتجر: معرف المتجر في الاستجابة \(m-123\) لا يطابق المتجر النشط \(m-OTHER\)/
    );
  });

  it("fails closed on negative, non-integer or NaN metrics in products", () => {
    expect(() =>
      parseCanonicalDashboardResponse(
        { ...mockDashboardDataA, products: { ...mockDashboardDataA.products, total: -1 } },
        "m-123"
      )
    ).toThrow(/products\.total يجب أن يكون عدداً صحيحاً غير سالب/);

    expect(() =>
      parseCanonicalDashboardResponse(
        { ...mockDashboardDataA, products: { ...mockDashboardDataA.products, active: 3.14 } },
        "m-123"
      )
    ).toThrow(/products\.active يجب أن يكون عدداً صحيحاً غير سالب/);

    expect(() =>
      parseCanonicalDashboardResponse(
        { ...mockDashboardDataA, products: { ...mockDashboardDataA.products, low_stock: NaN } },
        "m-123"
      )
    ).toThrow(/products\.low_stock يجب أن يكون عدداً صحيحاً غير سالب/);
  });

  it("fails closed on negative financial amounts or orders counts", () => {
    expect(() =>
      parseCanonicalDashboardResponse(
        { ...mockDashboardDataA, orders: { ...mockDashboardDataA.orders, today: -5 } },
        "m-123"
      )
    ).toThrow(/orders\.today يجب أن يكون عدداً صحيحاً غير سالب/);

    expect(() =>
      parseCanonicalDashboardResponse(
        { ...mockDashboardDataA, orders: { ...mockDashboardDataA.orders, revenue_7d: -100 } },
        "m-123"
      )
    ).toThrow(/orders\.revenue_7d يجب أن يكون رقماً مالياً غير سالب/);

    expect(() =>
      parseCanonicalDashboardResponse(
        { ...mockDashboardDataA, orders: { ...mockDashboardDataA.orders, average_order_value_7d: -50 } },
        "m-123"
      )
    ).toThrow(/orders\.average_order_value_7d يجب أن يكون رقماً مالياً غير سالب/);
  });

  it("fails closed if recent_orders has invalid date or negative total", () => {
    expect(() =>
      parseCanonicalDashboardResponse(
        {
          ...mockDashboardDataA,
          recent_orders: [{ id: "o-1", order_number: "NUM", status: "delivered", total: -500, created_at: "2026-09-01T10:00:00Z" }],
        },
        "m-123"
      )
    ).toThrow(/recent_orders\[0\]\.total يجب أن يكون رقماً مالياً غير سالب/);

    expect(() =>
      parseCanonicalDashboardResponse(
        {
          ...mockDashboardDataA,
          recent_orders: [{ id: "o-1", order_number: "NUM", status: "delivered", total: 500, created_at: "not-a-date" }],
        },
        "m-123"
      )
    ).toThrow(/recent_orders\[0\]\.created_at ليس تاريخاً صالحاً/);
  });

  it("fails closed if top_products revenue is negative or NaN, but permits omitted revenue", () => {
    // Negative revenue throws
    expect(() =>
      parseCanonicalDashboardResponse(
        {
          ...mockDashboardDataA,
          top_products: [{ product_id: "p-1", name: "عطر", units_sold: 5, revenue: -1 }],
        },
        "m-123"
      )
    ).toThrow(/top_products\[0\]\.revenue يجب أن يكون رقماً مالياً غير سالب/);

    // NaN revenue throws
    expect(() =>
      parseCanonicalDashboardResponse(
        {
          ...mockDashboardDataA,
          top_products: [{ product_id: "p-1", name: "عطر", units_sold: 5, revenue: NaN }],
        },
        "m-123"
      )
    ).toThrow(/top_products\[0\]\.revenue يجب أن يكون رقماً مالياً غير سالب/);

    // Omitted (undefined) revenue is permitted
    const parsedWithOmitted = parseCanonicalDashboardResponse(
      {
        ...mockDashboardDataA,
        top_products: [{ product_id: "p-1", name: "عطر", units_sold: 5 }],
      },
      "m-123"
    );
    expect(parsedWithOmitted.top_products[0].revenue).toBeUndefined();

    // Valid positive revenue is parsed
    const parsedWithValid = parseCanonicalDashboardResponse(
      {
        ...mockDashboardDataA,
        top_products: [{ product_id: "p-1", name: "عطر", units_sold: 5, revenue: 25000 }],
      },
      "m-123"
    );
    expect(parsedWithValid.top_products[0].revenue).toBe(25000);
  });
});
