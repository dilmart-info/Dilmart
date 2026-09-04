import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MerchantOrders, { parseCanonicalOrdersResponse } from "./Orders";
import { formatPrice } from "@/lib/format";
import { merchantApi } from "@/lib/api/merchant";
import { apiClient } from "@/lib/api-client";

const { mockListMerchantOrders, mockCurrentMerchant } = vi.hoisted(() => ({
  mockListMerchantOrders: vi.fn(),
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
      listMerchantOrders: (...args: unknown[]) => mockListMerchantOrders(...args),
    },
  };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      listMerchantOrders: (...args: unknown[]) => mockListMerchantOrders(...args),
    },
  };
});

function renderOrders(initialQueryClient?: QueryClient) {
  const queryClient = initialQueryClient ?? new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/merchant/orders"]}>
        <MerchantOrders />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const mockOrdersDataA = {
  merchant_id: "m-123",
  orders: [
    {
      id: "ord-1",
      order_number: "DUK-1001",
      merchant_id: "m-123",
      status: "pending",
      merchant_decision_status: "pending",
      currency: "IQD",
      subtotal: 50000,
      delivery_cost: 5000,
      discount: 0,
      total: 55000,
      created_at: "2026-09-01T10:00:00Z",
      updated_at: "2026-09-01T10:00:00Z",
      governorate: "بغداد",
    },
    {
      id: "ord-2",
      order_number: "DUK-1002",
      merchant_id: "m-123",
      status: "processing",
      merchant_decision_status: "accepted",
      currency: "IQD",
      subtotal: 30000,
      delivery_cost: 5000,
      discount: 0,
      total: 35000,
      created_at: "2026-09-01T11:00:00Z",
      updated_at: "2026-09-01T11:00:00Z",
      governorate: "البصرة",
    },
  ],
  total: 2,
  limit: 20,
  offset: 0,
};

const mockOrdersDataB = {
  merchant_id: "m-456",
  orders: [
    {
      id: "ord-b1",
      order_number: "DUK-2001",
      merchant_id: "m-456",
      status: "completed",
      merchant_decision_status: "accepted",
      currency: "IQD",
      subtotal: 80000,
      delivery_cost: 5000,
      discount: 10000,
      total: 75000,
      created_at: "2026-09-02T12:00:00Z",
      updated_at: "2026-09-02T13:00:00Z",
      governorate: "أربيل",
    },
  ],
  total: 1,
  limit: 20,
  offset: 0,
};

describe("MerchantOrders — Keyed Workspace, Truthful States & Multi-Store Authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentMerchant.data = {
      merchant_id: "m-123",
      role: "owner",
      merchants: { id: "m-123", display_name: "متجر الفرات", status: "active" },
    };
    mockListMerchantOrders.mockResolvedValue(mockOrdersDataA);
  });

  it("API RUNTIME CONTRACT: merchantApi and apiClient both expose listMerchantOrders", () => {
    expect(typeof merchantApi.listMerchantOrders).toBe("function");
    expect(typeof apiClient.listMerchantOrders).toBe("function");
  });

  it("NO MERCHANT STATE: displays prompt if merchant_id is missing", () => {
    mockCurrentMerchant.data = null;
    renderOrders();

    expect(screen.getByTestId("orders-unattached")).toBeTruthy();
    expect(screen.getByText("لا يوجد متجر نشط مرتبط بحسابك حالياً.")).toBeTruthy();
    expect(mockListMerchantOrders).not.toHaveBeenCalled();
  });

  it("API ERROR STATE: renders distinct error screen with retry button", async () => {
    mockListMerchantOrders.mockRejectedValueOnce(new Error("Network timeout"));
    renderOrders();

    const errorScreen = await screen.findByTestId("orders-error");
    expect(errorScreen).toBeTruthy();
    expect(screen.getByText("تعذر تحميل الطلبات")).toBeTruthy();
    expect(screen.getByText("Network timeout")).toBeTruthy();

    // Clicking retry calls listMerchantOrders again
    mockListMerchantOrders.mockResolvedValueOnce(mockOrdersDataA);
    const retryBtn = screen.getByRole("button", { name: /إعادة المحاولة/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockListMerchantOrders).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("orders-content")).toBeTruthy();
    });
  });

  it("EMPTY STATE: displays truthful empty message when total is zero", async () => {
    mockListMerchantOrders.mockResolvedValueOnce({
      merchant_id: "m-123",
      orders: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderOrders();

    await screen.findByTestId("orders-empty");
    expect(screen.getByText("لا توجد طلبات في متجرك حتى الآن.")).toBeTruthy();
  });

  it("POPULATED STATE & SAFE PROJECTION: displays orders correctly without leaking sensitive customer PII", async () => {
    renderOrders();

    await screen.findByTestId("orders-content");

    // Document title
    expect(document.title).toBe("طلبات المتجر | DILMART");

    // Header & summary
    expect(screen.getByText("طلبات المتجر")).toBeTruthy();
    expect(screen.getByText(/من إجمالي/)).toBeTruthy();

    // Order items
    expect(screen.getByText("DUK-1001")).toBeTruthy();
    expect(screen.getByText("بغداد")).toBeTruthy();
    expect(screen.getByText(formatPrice(55000))).toBeTruthy();

    expect(screen.getByText("DUK-1002")).toBeTruthy();
    expect(screen.getByText("البصرة")).toBeTruthy();
    expect(screen.getByText(formatPrice(35000))).toBeTruthy();

    // Status badges / decisions
    expect(screen.getAllByText("قيد الانتظار").length).toBeGreaterThan(0);
    expect(screen.getAllByText("مقبول").length).toBeGreaterThan(0);

    // Safe projection check: no phone number or street address should appear
    expect(screen.queryByText(/07\d{8,9}/)).toBeNull();
    expect(screen.queryByText(/شارع/)).toBeNull();
  });

  it("SEARCH & STATUS FILTERING: triggers queries with updated parameters", async () => {
    renderOrders();

    await screen.findByTestId("orders-content");

    // Search by order number
    const searchInput = screen.getByTestId("orders-search-input");
    fireEvent.change(searchInput, { target: { value: "DUK-1001" } });

    await waitFor(() => {
      expect(mockListMerchantOrders).toHaveBeenCalledWith(
        "m-123",
        expect.objectContaining({ search: "DUK-1001" })
      );
    });

    // Change status filter
    const statusSelect = screen.getByTestId("orders-status-filter");
    fireEvent.change(statusSelect, { target: { value: "preparing" } });

    await waitFor(() => {
      expect(mockListMerchantOrders).toHaveBeenCalledWith(
        "m-123",
        expect.objectContaining({ status: "preparing" })
      );
    });
  });

  it("MERCHANT A -> B DATA ISOLATION: switching merchant unmounts workspace and requests new merchant orders", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    mockListMerchantOrders.mockImplementation((id: string) => {
      if (id === "m-123") return Promise.resolve(mockOrdersDataA);
      if (id === "m-456") return Promise.resolve(mockOrdersDataB);
      return Promise.reject(new Error("Unknown merchant"));
    });

    // 1. Initial render with Store A
    mockCurrentMerchant.data = {
      merchant_id: "m-123",
      role: "owner",
      merchants: { id: "m-123", display_name: "متجر الفرات", status: "active" },
    };

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/orders"]}>
          <MerchantOrders />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("DUK-1001")).toBeTruthy();
    expect(screen.getByText("بغداد")).toBeTruthy();
    expect(mockListMerchantOrders).toHaveBeenCalledWith("m-123", expect.anything());

    // 2. Switch to Store B
    mockCurrentMerchant.data = {
      merchant_id: "m-456",
      role: "owner",
      merchants: { id: "m-456", display_name: "متجر دجلة", status: "active" },
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/orders"]}>
          <MerchantOrders />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Store B orders visible, Store A orders removed
    expect(await screen.findByText("DUK-2001")).toBeTruthy();
    expect(screen.getByText("أربيل")).toBeTruthy();
    expect(screen.queryByText("DUK-1001")).toBeNull();
    expect(screen.queryByText("بغداد")).toBeNull();
    expect(mockListMerchantOrders).toHaveBeenCalledWith("m-456", expect.anything());
  });

  it("DEFERRED RACE CONDITION ISOLATION: late resolved response from Store A does not overwrite Store B", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    let resolveStoreA: (val: unknown) => void = () => {};
    const storeAPromise = new Promise<unknown>((resolve) => {
      resolveStoreA = resolve;
    });

    mockListMerchantOrders.mockImplementation((id: string) => {
      if (id === "m-123") return storeAPromise;
      if (id === "m-456") return Promise.resolve(mockOrdersDataB);
      return Promise.reject(new Error("Unknown merchant"));
    });

    mockCurrentMerchant.data = {
      merchant_id: "m-123",
      role: "owner",
      merchants: { id: "m-123", display_name: "متجر الفرات", status: "active" },
    };

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/orders"]}>
          <MerchantOrders />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Store A is loading skeleton
    expect(screen.getByTestId("orders-loading")).toBeTruthy();

    // Switch to Store B before Store A resolves
    mockCurrentMerchant.data = {
      merchant_id: "m-456",
      role: "owner",
      merchants: { id: "m-456", display_name: "متجر دجلة", status: "active" },
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/orders"]}>
          <MerchantOrders />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Store B loads and renders
    expect(await screen.findByText("DUK-2001")).toBeTruthy();

    // Now Store A resolves late
    resolveStoreA(mockOrdersDataA);
    await new Promise((r) => setTimeout(r, 50));

    // Store B remains active, Store A data never leaks
    expect(screen.getByText("DUK-2001")).toBeTruthy();
    expect(screen.queryByText("DUK-1001")).toBeNull();
  });
});

describe("parseCanonicalOrdersResponse — Contract Assertion & Fail-Closed Guardrails", () => {
  it("passes on well-formed canonical payload with matching merchant_id", () => {
    const parsed = parseCanonicalOrdersResponse(mockOrdersDataA, "m-123");
    expect(parsed.merchant_id).toBe("m-123");
    expect(parsed.orders.length).toBe(2);
    expect(parsed.total).toBe(2);
    expect(parsed.limit).toBe(20);
    expect(parsed.offset).toBe(0);
  });

  it("fails closed if raw payload is not an object or is null", () => {
    expect(() => parseCanonicalOrdersResponse(null, "m-123")).toThrow(/Invalid orders payload: expected an object/);
    expect(() => parseCanonicalOrdersResponse("invalid", "m-123")).toThrow(/Invalid orders payload: expected an object/);
    expect(() => parseCanonicalOrdersResponse([], "m-123")).toThrow(/Invalid orders payload: expected an object/);
  });

  it("fails closed if merchant_id is missing or empty", () => {
    const noMerchantId = { ...mockOrdersDataA, merchant_id: undefined };
    expect(() => parseCanonicalOrdersResponse(noMerchantId, "m-123")).toThrow(/Invalid orders payload: missing merchant_id/);

    const emptyMerchantId = { ...mockOrdersDataA, merchant_id: "  " };
    expect(() => parseCanonicalOrdersResponse(emptyMerchantId, "m-123")).toThrow(/Invalid orders payload: missing merchant_id/);
  });

  it("fails closed if merchant_id in response mismatches active merchantId", () => {
    expect(() => parseCanonicalOrdersResponse(mockOrdersDataA, "m-OTHER")).toThrow(
      /Cross-store leakage detected: expected merchant_id m-OTHER but received m-123/
    );
  });

  it("fails closed if orders is missing or not an array", () => {
    const missingOrders = { ...mockOrdersDataA, orders: undefined };
    expect(() => parseCanonicalOrdersResponse(missingOrders, "m-123")).toThrow(/Invalid orders payload: orders must be an array/);
  });

  it("fails closed if total, limit, or offset is missing, negative, or not integer", () => {
    expect(() =>
      parseCanonicalOrdersResponse({ ...mockOrdersDataA, total: -1 }, "m-123")
    ).toThrow(/Invalid orders payload: total must be a non-negative integer/);

    expect(() =>
      parseCanonicalOrdersResponse({ ...mockOrdersDataA, limit: 0 }, "m-123")
    ).toThrow(/Invalid orders payload: limit must be a positive integer/);

    expect(() =>
      parseCanonicalOrdersResponse({ ...mockOrdersDataA, offset: -5 }, "m-123")
    ).toThrow(/Invalid orders payload: offset must be a non-negative integer/);
  });

  it("fails closed if any order contains forbidden customer PII (e.g. phone or street address)", () => {
    const leakPhonePayload = {
      ...mockOrdersDataA,
      orders: [
        {
          ...mockOrdersDataA.orders[0],
          customer_phone: "07701234567",
        },
      ],
    };
    expect(() => parseCanonicalOrdersResponse(leakPhonePayload, "m-123")).toThrow(
      /Security violation: customer_phone detected in merchant order summary/
    );

    const leakAddressPayload = {
      ...mockOrdersDataA,
      orders: [
        {
          ...mockOrdersDataA.orders[0],
          shipping_address: "حي المنصور، زقاق 14",
        },
      ],
    };
    expect(() => parseCanonicalOrdersResponse(leakAddressPayload, "m-123")).toThrow(
      /Security violation: address or phone PII detected in merchant order summary/
    );
  });

  it("fails closed if an order item has invalid/negative amounts", () => {
    const negativeTotalPayload = {
      ...mockOrdersDataA,
      orders: [
        {
          ...mockOrdersDataA.orders[0],
          total: -500,
        },
      ],
    };
    expect(() => parseCanonicalOrdersResponse(negativeTotalPayload, "m-123")).toThrow(
      /Invalid order total amount at index 0/
    );
  });

  it("fails closed if any order contains merchant_notes as free-text PII risk", () => {
    const leakNotesPayload = {
      ...mockOrdersDataA,
      orders: [
        {
          ...mockOrdersDataA.orders[0],
          merchant_notes: "ملاحظة خاصة بالعميل",
        },
      ],
    };
    expect(() => parseCanonicalOrdersResponse(leakNotesPayload, "m-123")).toThrow(
      /Security violation: merchant_notes detected in merchant order summary/
    );
  });
});
