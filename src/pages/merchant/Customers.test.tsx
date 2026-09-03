/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("RACE CONDITION SAFETY: slow deferred query for Store A does not overwrite Store B", async () => {
    let resolveStoreA!: (val: any) => void;
    const storeAPromise = new Promise((resolve) => {
      resolveStoreA = resolve;
    });

    vi.spyOn(scopedQueries, "getScopedCustomers").mockImplementation(async (context: any) => {
      if (context.merchantId === "m-123") return storeAPromise as any;
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

    // Store A is still loading
    expect(screen.getByText("جاري التحميل...")).toBeTruthy();

    // Quickly switch store to m-456
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

    // Store B resolves immediately
    expect(await screen.findByText("عميل #B2")).toBeTruthy();

    // Now Store A's slow promise finally resolves
    resolveStoreA(mockCustomersA);

    // Store B MUST remain displayed and not get contaminated by Store A!
    expect(screen.getByText("عميل #B2")).toBeTruthy();
    expect(screen.queryByText("عميل #A1")).toBeNull();
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

  it("STRICT CONTRACT ASSERTION: fails closed if response has mismatched merchant_id", async () => {
    vi.spyOn(scopedQueries, "getScopedCustomers").mockResolvedValueOnce({
      merchant_id: "m-mismatched-attacker",
      items: mockCustomersA.items,
      page: 1,
      limit: 50,
      total: 1,
      hasMore: false,
    } as any);

    renderCustomers();
    expect(await screen.findByText("تعذر تحميل بيانات العملاء.")).toBeTruthy();
    expect(screen.getByText(/خرق عقد أمان المتجر/)).toBeTruthy();
  });

  it("STRICT CONTRACT ASSERTION: rejects legacy array response without contract", async () => {
    vi.spyOn(scopedQueries, "getScopedCustomers").mockResolvedValueOnce([
      { full_name: "تسريب قديم", email: "leak@example.com" },
    ] as any);

    renderCustomers();
    expect(await screen.findByText("تعذر تحميل بيانات العملاء.")).toBeTruthy();
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
});
