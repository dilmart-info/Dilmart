import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MerchantFinance from "./Finance";
import { formatPrice } from "@/lib/format";

const {
  mockGetMerchantFinanceSummary,
  mockGetMerchantFinanceStatement,
  mockGetMerchantPayoutHistory,
  mockCurrentMerchant,
} = vi.hoisted(() => ({
  mockGetMerchantFinanceSummary: vi.fn(),
  mockGetMerchantFinanceStatement: vi.fn(),
  mockGetMerchantPayoutHistory: vi.fn(),
  mockCurrentMerchant: {
    data: {
      merchant_id: "store-a-uuid",
      role: "owner",
      merchants: { id: "store-a-uuid", display_name: "متجر بغداد", status: "active" },
    } as { merchant_id?: string; role?: string; merchants?: { id: string; display_name: string; status: string } } | null,
    isLoading: false,
  },
}));

vi.mock("@/hooks/use-current-merchant", () => ({
  useCurrentMerchant: () => mockCurrentMerchant,
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getMerchantFinanceSummary: (...args: unknown[]) => mockGetMerchantFinanceSummary(...args),
    getMerchantFinanceStatement: (...args: unknown[]) => mockGetMerchantFinanceStatement(...args),
    getMerchantPayoutHistory: (...args: unknown[]) => mockGetMerchantPayoutHistory(...args),
  },
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function renderFinance(customQueryClient?: QueryClient) {
  const queryClient = customQueryClient ?? createTestQueryClient();
  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/merchant/finance"]}>
        <MerchantFinance />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...renderResult, queryClient };
}

const mockSummaryA = {
  merchant_id: "store-a-uuid",
  total_accrued: 150000,
  total_payable: 250000,
  total_in_payout: 50000,
  total_settled: 1200000,
  outstanding_balance: 450000,
  last_payout_amount: 300000,
  last_payout_date: "2026-05-01T10:00:00.000Z",
  currency_code: "IQD",
};

const mockStatementA = {
  merchant_id: "store-a-uuid",
  total: 45,
  limit: 20,
  offset: 0,
  entries: [
    {
      id: "entry-1",
      order_id: "ord-1111-2222",
      entry_type: "order_accrual",
      direction: "credit" as const,
      amount: 150000,
      status: "payable",
      created_at: "2026-05-02T12:00:00.000Z",
      effective_at: "2026-05-02T12:00:00.000Z",
      description: "استحقاق طلب 1111",
    },
  ],
};

const mockPayoutsA = {
  merchant_id: "store-a-uuid",
  total: 25,
  limit: 10,
  offset: 0,
  payouts: [
    {
      id: "payout-batch-1",
      status: "settled",
      period_start: "2026-04-01T00:00:00.000Z",
      period_end: "2026-04-30T23:59:59.000Z",
      total_credits: 350000,
      total_debits: 50000,
      net_amount: 300000,
      currency_code: "IQD",
      created_at: "2026-05-01T08:00:00.000Z",
      approved_at: "2026-05-01T09:00:00.000Z",
      settled_at: "2026-05-01T10:00:00.000Z",
    },
  ],
};

const mockSummaryB = {
  merchant_id: "store-b-uuid",
  total_accrued: 80000,
  total_payable: 95000,
  total_in_payout: 0,
  total_settled: 600000,
  outstanding_balance: 175000,
  last_payout_amount: 120000,
  last_payout_date: "2026-05-01T10:00:00.000Z",
  currency_code: "IQD",
};

const mockStatementB = {
  merchant_id: "store-b-uuid",
  total: 1,
  limit: 20,
  offset: 0,
  entries: [
    {
      id: "entry-b-1",
      order_id: "ord-bbbb-2222",
      entry_type: "order_accrual",
      direction: "credit" as const,
      amount: 80000,
      status: "accrued",
      created_at: "2026-05-03T12:00:00.000Z",
      effective_at: "2026-05-03T12:00:00.000Z",
      description: "استحقاق متجر ب",
    },
  ],
};

const mockPayoutsB = {
  merchant_id: "store-b-uuid",
  total: 1,
  limit: 10,
  offset: 0,
  payouts: [
    {
      id: "payout-b-1",
      status: "approved",
      period_start: "2026-04-01T00:00:00.000Z",
      period_end: "2026-04-30T23:59:59.000Z",
      total_credits: 140000,
      total_debits: 20000,
      net_amount: 120000,
      currency_code: "IQD",
      created_at: "2026-05-02T08:00:00.000Z",
      approved_at: "2026-05-02T09:00:00.000Z",
    },
  ],
};

describe("MerchantFinance — Truthful States, Multi-Store Authority & Contract Safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentMerchant.data = {
      merchant_id: "store-a-uuid",
      role: "owner",
      merchants: { id: "store-a-uuid", display_name: "متجر بغداد", status: "active" },
    };
    mockCurrentMerchant.isLoading = false;
    mockGetMerchantFinanceSummary.mockResolvedValue(mockSummaryA);
    mockGetMerchantFinanceStatement.mockResolvedValue(mockStatementA);
    mockGetMerchantPayoutHistory.mockResolvedValue(mockPayoutsA);
  });

  it("renders truthful summary numbers on success (does not fallback to 0 IQD during loading/failure)", async () => {
    renderFinance();

    await waitFor(() => {
      expect(screen.getByText(formatPrice(150000))).toBeInTheDocument();
      expect(screen.getByText(formatPrice(250000))).toBeInTheDocument();
      expect(screen.getByText(formatPrice(50000))).toBeInTheDocument();
      expect(screen.getByText(formatPrice(450000))).toBeInTheDocument();
    });
  });

  it("summary loading renders loading indicator, never 0 IQD fallback", async () => {
    mockGetMerchantFinanceSummary.mockReturnValue(new Promise(() => {}));
    renderFinance();

    expect(screen.getByTestId("finance-summary-loading")).toBeInTheDocument();
    expect(screen.queryByText(formatPrice(0))).not.toBeInTheDocument();
  });

  it("summary failure renders distinct error card with retry button, not 0 IQD", async () => {
    mockGetMerchantFinanceSummary.mockRejectedValue(new Error("Network failure"));
    renderFinance();

    await waitFor(() => {
      expect(screen.getByTestId("finance-summary-error")).toBeInTheDocument();
      expect(screen.getByText("تعذر تحميل ملخص المالية للمتجر الحالي.")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("finance-summary-cards")).not.toBeInTheDocument();

    // Statement and payout can still succeed independently
    await waitFor(() => {
      expect(screen.getByText("استحقاق طلب")).toBeInTheDocument();
      expect(screen.getByText("سجل دفعات التسوية")).toBeInTheDocument();
    });
  });

  it("statement failure renders distinct error alert with retry button, NOT an empty statement", async () => {
    mockGetMerchantFinanceStatement.mockRejectedValue(new Error("Server error"));
    renderFinance();

    await waitFor(() => {
      expect(screen.getByTestId("statement-error")).toBeInTheDocument();
      expect(screen.getByText("تعذر تحميل كشف الحساب للمتجر الحالي.")).toBeInTheDocument();
    });

    // Must not show false healthy empty state
    expect(screen.queryByText("لا توجد قيود ضمن الفلتر الحالي.")).not.toBeInTheDocument();
  });

  it("payout history failure renders distinct error alert with retry button, NOT an empty history", async () => {
    mockGetMerchantPayoutHistory.mockRejectedValue(new Error("Server error"));
    renderFinance();

    await waitFor(() => {
      expect(screen.getByTestId("payout-error")).toBeInTheDocument();
      expect(screen.getByText("تعذر تحميل سجل دفعات التسوية للمتجر الحالي.")).toBeInTheDocument();
    });

    // Must not show false healthy empty state
    expect(screen.queryByText("لا يوجد سجل دفعات حتى الآن.")).not.toBeInTheDocument();
  });

  it("fails closed when response merchant_id is mismatched (contract assertion)", async () => {
    mockGetMerchantFinanceSummary.mockResolvedValue({
      ...mockSummaryA,
      merchant_id: "other-store-uuid",
    });
    mockGetMerchantFinanceStatement.mockResolvedValue({
      ...mockStatementA,
      merchant_id: "other-store-uuid",
    });
    mockGetMerchantPayoutHistory.mockResolvedValue({
      ...mockPayoutsA,
      merchant_id: "other-store-uuid",
    });

    renderFinance();

    await waitFor(() => {
      expect(screen.getByTestId("finance-summary-error")).toBeInTheDocument();
      expect(screen.getByTestId("statement-error")).toBeInTheDocument();
      expect(screen.getByTestId("payout-error")).toBeInTheDocument();
    });
  });

  it("fails closed when response merchant_id is missing/empty", async () => {
    mockGetMerchantFinanceSummary.mockResolvedValue({
      ...mockSummaryA,
      merchant_id: undefined,
    });
    renderFinance();

    await waitFor(() => {
      expect(screen.getByTestId("finance-summary-error")).toBeInTheDocument();
    });
  });

  it("disables CSV export button when statement is loading, error, or empty, and labels it truthfully", async () => {
    mockGetMerchantFinanceStatement.mockReturnValue(new Promise(() => {}));
    renderFinance();

    const exportBtn = screen.getByRole("button", { name: "تصدير الصفحة CSV" });
    expect(exportBtn).toBeDisabled();
  });

  it("complete CSV contract test: verifies filename, blob content, page-only rows, and object URL revocation", async () => {
    let capturedBlob: Blob | null = null;
    const mockUrl = "blob:http://localhost/test-uuid-statement-export";

    const createObjectURLMock = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return mockUrl;
    });
    const revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    let clickedAnchor: HTMLAnchorElement | null = null;
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName.toLowerCase() === "a") {
        el.click = vi.fn(() => {
          clickedAnchor = el as HTMLAnchorElement;
        });
      }
      return el;
    });

    renderFinance();

    const exportBtn = await screen.findByRole("button", { name: "تصدير الصفحة CSV" });
    await waitFor(() => {
      expect(exportBtn).not.toBeDisabled();
    });

    fireEvent.click(exportBtn);

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(capturedBlob).toBeInstanceOf(Blob);

    // Read generated CSV text from blob
    const csvText = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(capturedBlob!);
    });

    // Header assertion
    expect(csvText).toContain("التاريخ,نوع القيد,الاتجاه,المبلغ,الحالة,رقم الطلب,الوصف");
    // Row assertions - contains Store A loaded row
    expect(csvText).toContain("ord-1111-2222");
    expect(csvText).toContain("150000");
    // Row assertions - does NOT contain Store B row
    expect(csvText).not.toContain("ord-bbbb-2222");


    // Anchor filename assertions
    expect(clickedAnchor).not.toBeNull();
    expect(clickedAnchor!.download).toContain("store-a-uuid");
    expect(clickedAnchor!.download.endsWith(".csv")).toBe(true);
    expect(clickedAnchor!.download).toMatch(/^merchant_statement_store-a-uuid_\d+\.csv$/);

    // Object URL revocation assertion
    expect(revokeObjectURLMock).toHaveBeenCalledWith(mockUrl);


    createElementSpy.mockRestore();
  });

  it("staff role (merchant_staff) has read-only finance visibility", async () => {
    mockCurrentMerchant.data = {
      merchant_id: "store-a-uuid",
      role: "merchant_staff",
      merchants: { id: "store-a-uuid", display_name: "متجر بغداد", status: "active" },
    };

    renderFinance();

    await waitFor(() => {
      expect(screen.getByText("المالية والتسوية")).toBeInTheDocument();
      expect(screen.getByText("كشف الحساب")).toBeInTheDocument();
      expect(screen.queryByTestId("finance-unauthorized")).not.toBeInTheDocument();
    });
  });

  it("unauthorized role fails closed with explicit permission denied message", async () => {
    mockCurrentMerchant.data = {
      merchant_id: "store-a-uuid",
      role: "customer",
      merchants: { id: "store-a-uuid", display_name: "متجر بغداد", status: "active" },
    };

    renderFinance();

    expect(screen.getByTestId("finance-unauthorized")).toBeInTheDocument();
    expect(screen.getByText("ليس لديك صلاحية لعرض البيانات المالية لهذا المتجر.")).toBeInTheDocument();
    expect(mockGetMerchantFinanceSummary).not.toHaveBeenCalled();
  });

  it("real shared QueryClient race test: Store A -> Store B switch with late resolution", async () => {
    const queryClient = createTestQueryClient();

    let resolveSummaryA!: (val: typeof mockSummaryA) => void;
    let resolveStatementA!: (val: typeof mockStatementA) => void;
    let resolvePayoutsA!: (val: typeof mockPayoutsA) => void;

    mockGetMerchantFinanceSummary.mockImplementation((id: string) => {
      if (id === "store-a-uuid") {
        return new Promise((res) => { resolveSummaryA = res; });
      }
      return Promise.resolve(mockSummaryB);
    });

    mockGetMerchantFinanceStatement.mockImplementation((id: string) => {
      if (id === "store-a-uuid") {
        return new Promise((res) => { resolveStatementA = res; });
      }
      return Promise.resolve(mockStatementB);
    });

    mockGetMerchantPayoutHistory.mockImplementation((id: string) => {
      if (id === "store-a-uuid") {
        return new Promise((res) => { resolvePayoutsA = res; });
      }
      return Promise.resolve(mockPayoutsB);
    });

    // 1. Initial render with Store A using shared queryClient
    const { rerender } = renderFinance(queryClient);

    expect(mockGetMerchantFinanceSummary).toHaveBeenCalledWith("store-a-uuid");

    // 2. User switches to Store B while Store A requests are still pending
    mockCurrentMerchant.data = {
      merchant_id: "store-b-uuid",
      role: "owner",
      merchants: { id: "store-b-uuid", display_name: "متجر البصرة", status: "active" },
    };

    // Rerender using the exact same QueryClient instance
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/finance"]}>
          <MerchantFinance />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // 3. Store B resolves successfully
    await waitFor(() => {
      expect(screen.getByText(formatPrice(80000))).toBeInTheDocument();
      expect(screen.getByText(formatPrice(175000))).toBeInTheDocument();
      expect(screen.getByText(/ord-bbbb/)).toBeInTheDocument();
      expect(screen.getByText(/payout-b/)).toBeInTheDocument();
    });

    // 4. Now Store A deferred promises resolve late
    resolveSummaryA(mockSummaryA);
    resolveStatementA(mockStatementA);
    resolvePayoutsA(mockPayoutsA);

    // 5. Store B view remains pure and unaltered under the same cache
    await waitFor(() => {
      expect(screen.getByText(formatPrice(80000))).toBeInTheDocument();
      expect(screen.getByText(formatPrice(175000))).toBeInTheDocument();
      expect(screen.getByText(/ord-bbbb/)).toBeInTheDocument();
      expect(screen.getByText(/payout-b/)).toBeInTheDocument();
      expect(screen.queryByText(/ord-1111/)).not.toBeInTheDocument();
      expect(screen.queryByText(/payout-batch-1/)).not.toBeInTheDocument();
    });
  });

  it("late rejection race test: Store A requests reject after switch to Store B", async () => {
    const queryClient = createTestQueryClient();

    let rejectSummaryA!: (err: Error) => void;
    let rejectStatementA!: (err: Error) => void;
    let rejectPayoutsA!: (err: Error) => void;

    // Attach catch handlers internally in the test promise tracking to prevent unhandled rejection warnings
    const summaryPromiseA = new Promise<typeof mockSummaryA>((_, rej) => { rejectSummaryA = rej; });
    summaryPromiseA.catch(() => {});
    const statementPromiseA = new Promise<typeof mockStatementA>((_, rej) => { rejectStatementA = rej; });
    statementPromiseA.catch(() => {});
    const payoutsPromiseA = new Promise<typeof mockPayoutsA>((_, rej) => { rejectPayoutsA = rej; });
    payoutsPromiseA.catch(() => {});

    mockGetMerchantFinanceSummary.mockImplementation((id: string) => {
      if (id === "store-a-uuid") return summaryPromiseA;
      return Promise.resolve(mockSummaryB);
    });

    mockGetMerchantFinanceStatement.mockImplementation((id: string) => {
      if (id === "store-a-uuid") return statementPromiseA;
      return Promise.resolve(mockStatementB);
    });

    mockGetMerchantPayoutHistory.mockImplementation((id: string) => {
      if (id === "store-a-uuid") return payoutsPromiseA;
      return Promise.resolve(mockPayoutsB);
    });

    // 1. Initial render with Store A
    const { rerender } = renderFinance(queryClient);

    // 2. Switch to Store B while Store A requests are pending
    mockCurrentMerchant.data = {
      merchant_id: "store-b-uuid",
      role: "owner",
      merchants: { id: "store-b-uuid", display_name: "متجر البصرة", status: "active" },
    };

    // Rerender with the exact same QueryClient
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/finance"]}>
          <MerchantFinance />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // 3. Store B loads and renders successfully
    await waitFor(() => {
      expect(screen.getByText(formatPrice(80000))).toBeInTheDocument();
      expect(screen.getByText(formatPrice(175000))).toBeInTheDocument();
      expect(screen.getByText(/ord-bbbb/)).toBeInTheDocument();
      expect(screen.getByText(/payout-b/)).toBeInTheDocument();
    });

    // 4. Reject Store A requests afterward
    rejectSummaryA(new Error("Store A summary network error"));
    rejectStatementA(new Error("Store A statement server error"));
    rejectPayoutsA(new Error("Store A payouts timeout"));

    // 5. Store B data and UI state remain unchanged; no errors appear
    await waitFor(() => {
      expect(screen.getByText(formatPrice(80000))).toBeInTheDocument();
      expect(screen.getByText(formatPrice(175000))).toBeInTheDocument();
      expect(screen.getByText(/ord-bbbb/)).toBeInTheDocument();
      expect(screen.getByText(/payout-b/)).toBeInTheDocument();
    });

    expect(screen.queryByTestId("finance-summary-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("statement-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("payout-error")).not.toBeInTheDocument();
    expect(screen.queryByText("تعذر تحميل ملخص المالية للمتجر الحالي.")).not.toBeInTheDocument();
  });

  it("filter and pagination reset proof: switching store synchronously resets date inputs, status, and pagination", async () => {
    const queryClient = createTestQueryClient();

    // 1. Initial render with Store A
    const { rerender } = renderFinance(queryClient);

    await waitFor(() => {
      expect(screen.getByText(formatPrice(150000))).toBeInTheDocument();
      expect(screen.queryByTestId("statement-loading")).not.toBeInTheDocument();
      expect(screen.queryByTestId("payout-loading")).not.toBeInTheDocument();
    });

    // 2. Modify Store A local state
    const fromInput = screen.getByLabelText("من تاريخ") as HTMLInputElement;
    const toInput = screen.getByLabelText("إلى تاريخ") as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "2026-05-01" } });
    fireEvent.change(toInput, { target: { value: "2026-05-15" } });

    // Click "قابل للدفع" status filter
    const payableFilterBtn = screen.getByRole("button", { name: "قابل للدفع" });
    fireEvent.click(payableFilterBtn);

    // Wait for statement query after filter change to settle and both pagination controls to be ready
    await waitFor(() => {
      expect(screen.queryByTestId("statement-loading")).not.toBeInTheDocument();
      expect(screen.queryByTestId("payout-loading")).not.toBeInTheDocument();
      const nextButtons = screen.getAllByRole("button", { name: "التالي" });
      expect(nextButtons).toHaveLength(2);
      expect(nextButtons[0]).not.toBeDisabled();
      expect(nextButtons[1]).not.toBeDisabled();
    });

    const nextButtons = screen.getAllByRole("button", { name: "التالي" });
    // Advance statement pagination (total: 45, limit: 20)
    fireEvent.click(nextButtons[0]);

    // Advance payout pagination (total: 25, limit: 10)
    fireEvent.click(nextButtons[1]);

    // Verify Store A has modified values
    expect(fromInput.value).toBe("2026-05-01");
    expect(toInput.value).toBe("2026-05-15");


    // 3. Switch to Store B
    mockGetMerchantFinanceSummary.mockResolvedValue(mockSummaryB);
    mockGetMerchantFinanceStatement.mockResolvedValue(mockStatementB);
    mockGetMerchantPayoutHistory.mockResolvedValue(mockPayoutsB);

    mockCurrentMerchant.data = {
      merchant_id: "store-b-uuid",
      role: "owner",
      merchants: { id: "store-b-uuid", display_name: "متجر البصرة", status: "active" },
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/finance"]}>
          <MerchantFinance />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // 4. Assert that Store B workspace has synchronously reset all local state
    await waitFor(() => {
      expect(screen.getByText(formatPrice(80000))).toBeInTheDocument();
    });

    const fromInputB = screen.getByLabelText("من تاريخ") as HTMLInputElement;
    const toInputB = screen.getByLabelText("إلى تاريخ") as HTMLInputElement;
    expect(fromInputB.value).toBe("");
    expect(toInputB.value).toBe("");

    // Assert that Store B API calls contained only B's merchant ID and default pagination/filters
    const lastStatementCall = mockGetMerchantFinanceStatement.mock.calls.at(-1);
    expect(lastStatementCall?.[0]).toBe("store-b-uuid");
    expect(lastStatementCall?.[1]).toEqual({
      limit: 20,
      offset: 0,
      status: undefined,
      from: undefined,
      to: undefined,
    });

    const lastPayoutCall = mockGetMerchantPayoutHistory.mock.calls.at(-1);
    expect(lastPayoutCall?.[0]).toBe("store-b-uuid");
    expect(lastPayoutCall?.[1]).toEqual({
      limit: 10,
      offset: 0,
      from: undefined,
      to: undefined,
    });
  });

  it("retry isolation: retrying one failed section refetches only that section for current merchant", async () => {
    // 1. Initial load for Store B with summary error, statement and payout success
    mockGetMerchantFinanceSummary.mockRejectedValue(new Error("Network error on summary"));
    mockGetMerchantFinanceStatement.mockResolvedValue(mockStatementB);
    mockGetMerchantPayoutHistory.mockResolvedValue(mockPayoutsB);

    mockCurrentMerchant.data = {
      merchant_id: "store-b-uuid",
      role: "owner",
      merchants: { id: "store-b-uuid", display_name: "متجر البصرة", status: "active" },
    };

    renderFinance();

    // Summary fails, statement & payouts succeed
    await waitFor(() => {
      expect(screen.getByTestId("finance-summary-error")).toBeInTheDocument();
      expect(screen.getByText(/ord-bbbb/)).toBeInTheDocument();
      expect(screen.getByText(/payout-b/)).toBeInTheDocument();
    });

    const summaryCallsBefore = mockGetMerchantFinanceSummary.mock.calls.length;
    const statementCallsBefore = mockGetMerchantFinanceStatement.mock.calls.length;
    const payoutCallsBefore = mockGetMerchantPayoutHistory.mock.calls.length;

    // 2. Now summary retry succeeds
    mockGetMerchantFinanceSummary.mockResolvedValue(mockSummaryB);

    const retryBtn = screen.getByRole("button", { name: /إعادة المحاولة/ });
    fireEvent.click(retryBtn);

    // 3. Summary succeeds and displays data
    await waitFor(() => {
      expect(screen.getByTestId("finance-summary-cards")).toBeInTheDocument();
      expect(screen.getByText(formatPrice(80000))).toBeInTheDocument();
    });

    // 4. Verify only summary was refetched, statement and payouts were NOT refetched
    expect(mockGetMerchantFinanceSummary.mock.calls.length).toBe(summaryCallsBefore + 1);
    expect(mockGetMerchantFinanceSummary.mock.calls.at(-1)?.[0]).toBe("store-b-uuid");
    expect(mockGetMerchantFinanceStatement.mock.calls.length).toBe(statementCallsBefore);
    expect(mockGetMerchantPayoutHistory.mock.calls.length).toBe(payoutCallsBefore);
  });
});
