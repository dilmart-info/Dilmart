/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { describe, expect, it, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MerchantCustomers from "./Customers";
import * as scopedQueries from "@/lib/scoped-queries";

const { mockCurrentMerchant } = vi.hoisted(() => ({
  mockCurrentMerchant: {
    data: {
      merchant_id: "m-123",
      role: "owner",
      merchants: { id: "m-123", display_name: "متجر بغداد", status: "active" },
    } as { merchant_id: string; role: string; merchants: { id: string; display_name: string; status: string } } | null,
    isLoading: false,
  },
}));

vi.mock("@/hooks/use-current-merchant", () => ({
  useCurrentMerchant: () => mockCurrentMerchant,
}));

function renderCustomers(queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/merchant/customers"]}>
        <MerchantCustomers />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const mockCustomersA = {
  merchant_id: "m-123",
  items: [
    {
      customer_ref: "عميل #A1",
      phone_masked: "****1111",
      orders: 5,
      spent: 75000,
      last_order_at: "2026-06-01T10:00:00Z",
    },
  ],
  page: 1,
  limit: 50,
  total: 1,
  hasMore: false,
};

const mockCustomersB = {
  merchant_id: "m-456",
  items: [
    {
      customer_ref: "عميل #B2",
      phone_masked: "****2222",
      orders: 2,
      spent: 30000,
      last_order_at: "2026-06-02T11:00:00Z",
    },
  ],
  page: 1,
  limit: 50,
  total: 1,
  hasMore: false,
};

describe("MerchantCustomers — Multi-Store Authority & Privacy Contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentMerchant.isLoading = false;
    mockCurrentMerchant.data = {
      merchant_id: "m-123",
      role: "owner",
      merchants: { id: "m-123", display_name: "متجر بغداد", status: "active" },
    };

    vi.spyOn(scopedQueries, "getScopedCustomers").mockImplementation(async (context: any) => {
      if (context.merchantId === "m-123") return mockCustomersA as any;
      if (context.merchantId === "m-456") return mockCustomersB as any;
      return {
        merchant_id: context.merchantId,
        items: [],
        page: 1,
        limit: 50,
        total: 0,
        hasMore: false,
      } as any;
    });
  });

  it("renders masked customer data for authorized merchant owner", async () => {
    renderCustomers();

    expect(await screen.findByText("عميل #A1")).toBeTruthy();
    expect(screen.getByText("****1111")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
  });

  it("KEYED WORKSPACE: switching stores clears search input and unmounts old store state", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/customers"]}>
          <MerchantCustomers />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("عميل #A1")).toBeTruthy();

    const searchInput = screen.getByPlaceholderText("بحث عن عميل...") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "بحث سابق" } });
    expect(searchInput.value).toBe("بحث سابق");

    // Switch store to m-456
    mockCurrentMerchant.data = {
      merchant_id: "m-456",
      role: "owner",
      merchants: { id: "m-456", display_name: "متجر البصرة", status: "active" },
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/customers"]}>
          <MerchantCustomers />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("عميل #B2")).toBeTruthy();
    expect(screen.queryByText("عميل #A1")).toBeNull();

    // Keyed workspace resets input cleanly
    const newSearchInput = screen.getByPlaceholderText("بحث عن عميل...") as HTMLInputElement;
    expect(newSearchInput.value).toBe("");
  });

  it("LATE REJECTION SAFETY: slow deferred query for Store A does not leak errors or taint Store B", async () => {
    let rejectStoreA!: (err: Error) => void;
    const storeAPromise = new Promise((_, reject) => {
      rejectStoreA = reject;
    });
    // Attach silent no-op handler to avoid uncaught rejection noise during test run
    storeAPromise.catch(() => {});

    vi.spyOn(scopedQueries, "getScopedCustomers").mockImplementation(async (context: any) => {
      if (context.merchantId === "m-123") return storeAPromise as any;
      if (context.merchantId === "m-456") return mockCustomersB as any;
      return mockCustomersB as any;
    });

    // Use a single shared QueryClient across rerenders
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/customers"]}>
          <MerchantCustomers />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Store A is pending
    expect(screen.getByText("جاري التحميل...")).toBeTruthy();

    // Switch store to m-456
    mockCurrentMerchant.data = {
      merchant_id: "m-456",
      role: "owner",
      merchants: { id: "m-456", display_name: "متجر البصرة", status: "active" },
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/customers"]}>
          <MerchantCustomers />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Store B resolves immediately and displays customers
    expect(await screen.findByText("عميل #B2")).toBeTruthy();

    // Now reject Store A's deferred promise
    rejectStoreA(new Error("Store A connection failed"));

    // Verify Store B remains displayed without Store A's error leaking
    await waitFor(() => {
      expect(screen.getByText("عميل #B2")).toBeTruthy();
      expect(screen.queryByText("Store A connection failed")).toBeNull();
      expect(screen.queryByText("تعذر تحميل بيانات العملاء.")).toBeNull();
    });
  });

  it("PAGINATION RESET: changing pages on Store A and switching to Store B resets to page 1", async () => {
    const recordedCalls: Array<{ merchantId?: string; page?: number }> = [];

    const mockPaginatedStoreA = (page: number) => ({
      merchant_id: "m-123",
      items: [
        {
          customer_ref: `عميل #A-P${page}`,
          phone_masked: "****1111",
          orders: 5,
          spent: 75000,
          last_order_at: "2026-06-01T10:00:00Z",
        },
      ],
      page,
      limit: 50,
      total: 75, // total > 50 gives 2 pages
      hasMore: page === 1,
    });

    vi.spyOn(scopedQueries, "getScopedCustomers").mockImplementation(async (context: any, filters?: any) => {
      recordedCalls.push({ merchantId: context.merchantId, page: filters?.page });
      if (context.merchantId === "m-123") return mockPaginatedStoreA(filters?.page ?? 1) as any;
      if (context.merchantId === "m-456") return mockCustomersB as any;
      return mockCustomersB as any;
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/customers"]}>
          <MerchantCustomers />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 1. Initial load on Store A should be page 1
    expect(await screen.findByText("عميل #A-P1")).toBeTruthy();
    expect(recordedCalls[0]).toEqual({ merchantId: "m-123", page: 1 });

    // 2. Click "التالي" to navigate to page 2
    const nextBtn = screen.getByText("التالي");
    fireEvent.click(nextBtn);

    expect(await screen.findByText("عميل #A-P2")).toBeTruthy();
    expect(recordedCalls.some((c) => c.merchantId === "m-123" && c.page === 2)).toBe(true);

    // 3. Switch to Store B
    mockCurrentMerchant.data = {
      merchant_id: "m-456",
      role: "owner",
      merchants: { id: "m-456", display_name: "متجر البصرة", status: "active" },
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/customers"]}>
          <MerchantCustomers />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 4. Store B must load with page 1, NOT Store A's page 2
    expect(await screen.findByText("عميل #B2")).toBeTruthy();
    const storeBCalls = recordedCalls.filter((c) => c.merchantId === "m-456");
    expect(storeBCalls.length).toBeGreaterThan(0);
    expect(storeBCalls[0].page).toBe(1);
    expect(screen.queryByText("عميل #A-P2")).toBeNull();
  });

  it("TRUTHFUL NETWORK ERROR + RETRY: displays error state (not empty state) and retries current merchant", async () => {
    let shouldFail = true;
    const requestedMerchants: string[] = [];

    vi.spyOn(scopedQueries, "getScopedCustomers").mockImplementation(async (context: any) => {
      requestedMerchants.push(context.merchantId);
      if (shouldFail) {
        throw new Error("Network offline 503");
      }
      return mockCustomersA as any;
    });

    renderCustomers();

    // 1. Must show error state and retry action, NOT empty state
    expect(await screen.findByText("تعذر تحميل بيانات العملاء.")).toBeTruthy();
    expect(screen.getByText("Network offline 503")).toBeTruthy();
    expect(screen.queryByText("لا توجد بيانات عملاء.")).toBeNull();

    // 2. Click retry button after restoring connectivity
    shouldFail = false;
    const retryBtn = screen.getByText("إعادة المحاولة");
    fireEvent.click(retryBtn);

    // 3. Current merchant should succeed and display data
    expect(await screen.findByText("عميل #A1")).toBeTruthy();
    expect(requestedMerchants.every((m) => m === "m-123")).toBe(true);
  });

  it("ROLE GATING: owner, manager, and staff can view customers", async () => {
    for (const role of ["owner", "manager", "staff", "merchant_owner", "merchant_manager", "merchant_staff"]) {
      mockCurrentMerchant.data = {
        merchant_id: "m-123",
        role,
        merchants: { id: "m-123", display_name: "متجر بغداد", status: "active" },
      };

      const { unmount } = renderCustomers();
      expect(await screen.findByText("عميل #A1")).toBeTruthy();
      unmount();
    }
  });

  it("ROLE GATING: unauthorized roles fail closed and display unauthorized banner", async () => {
    for (const role of ["customer", "viewer", "unauthorized_role", ""]) {
      mockCurrentMerchant.data = {
        merchant_id: "m-123",
        role,
        merchants: { id: "m-123", display_name: "متجر بغداد", status: "active" },
      };

      const { unmount } = renderCustomers();
      expect(await screen.findByTestId("merchant-customers-unauthorized")).toBeTruthy();
      expect(screen.getByText("غير مصرح لك بالوصول إلى عملاء هذا المتجر.")).toBeTruthy();
      unmount();
    }
  });

  it("UNATTACHED STATE: displays unattached banner when user has no merchant", async () => {
    mockCurrentMerchant.data = null as any;

    renderCustomers();
    expect(await screen.findByTestId("merchant-customers-unattached")).toBeTruthy();
    expect(screen.getByText("لا يوجد متجر مرتبط بحسابك.")).toBeTruthy();
  });

  it("LOADING STATE: displays loading skeleton when hook is loading", async () => {
    mockCurrentMerchant.isLoading = true;

    renderCustomers();
    expect(screen.getByTestId("merchant-customers-loading")).toBeTruthy();
  });

  it("EMPTY STATE: displays honest empty state without pagination when items are empty", async () => {
    vi.spyOn(scopedQueries, "getScopedCustomers").mockResolvedValueOnce({
      merchant_id: "m-123",
      items: [],
      page: 1,
      limit: 50,
      total: 0,
      hasMore: false,
    } as any);

    renderCustomers();
    expect(await screen.findByText("لا توجد بيانات عملاء.")).toBeTruthy();
    expect(screen.queryByText("السابق")).toBeNull();
    expect(screen.queryByText("التالي")).toBeNull();
  });

  // ── Strict Contract & Incomplete Payload Matrix (test.each) ──
  const validBase = {
    merchant_id: "m-123",
    items: [
      {
        customer_ref: "عميل #A1",
        phone_masked: "****1111",
        orders: 5,
        spent: 75000,
        last_order_at: "2026-06-01T10:00:00Z",
      },
    ],
    page: 1,
    limit: 50,
    total: 1,
    hasMore: false,
  };

  test.each([
    ["null response", null],
    ["array response", [{ customer_ref: "A1" }]],
    ["missing merchant_id", { ...validBase, merchant_id: undefined }],
    ["mismatched merchant_id", { ...validBase, merchant_id: "m-attacker" }],
    ["missing items", { ...validBase, items: undefined }],
    ["non-array items", { ...validBase, items: "not-an-array" }],
    ["missing total", { ...validBase, total: undefined }],
    ["negative total", { ...validBase, total: -1 }],
    ["string total", { ...validBase, total: "10" }],
    ["NaN total", { ...validBase, total: NaN }],
    ["missing page", { ...validBase, page: undefined }],
    ["zero page", { ...validBase, page: 0 }],
    ["missing limit", { ...validBase, limit: undefined }],
    ["zero limit", { ...validBase, limit: 0 }],
    ["missing hasMore", { ...validBase, hasMore: undefined }],
    ["string hasMore", { ...validBase, hasMore: "true" }],
    ["missing customer_ref", { ...validBase, items: [{ ...validBase.items[0], customer_ref: "" }] }],
    ["missing phone_masked", { ...validBase, items: [{ ...validBase.items[0], phone_masked: "" }] }],
    ["negative orders", { ...validBase, items: [{ ...validBase.items[0], orders: -1 }] }],
    ["string orders", { ...validBase, items: [{ ...validBase.items[0], orders: "5" as any }] }],
    ["negative spent", { ...validBase, items: [{ ...validBase.items[0], spent: -100 }] }],
    ["infinite spent", { ...validBase, items: [{ ...validBase.items[0], spent: Infinity }] }],
    ["invalid last_order_at", { ...validBase, items: [{ ...validBase.items[0], last_order_at: "not-a-date" }] }],
  ])("STRICT CONTRACT: rejects %s and displays truthful error state", async (_desc, invalidPayload) => {
    vi.spyOn(scopedQueries, "getScopedCustomers").mockResolvedValueOnce(invalidPayload as any);

    renderCustomers();
    expect(await screen.findByText("تعذر تحميل بيانات العملاء.")).toBeTruthy();
    expect(screen.queryByText("لا توجد بيانات عملاء.")).toBeNull();
  });
});
