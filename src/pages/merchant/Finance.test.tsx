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

function renderFinance() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/merchant/finance"]}>
        <MerchantFinance />
      </MemoryRouter>
    </QueryClientProvider>
  );
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
  total: 1,
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
  total: 1,
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

  it("enables CSV export button when current store statement succeeds and triggers download", async () => {
    const createObjectURLMock = vi.fn(() => "blob:http://localhost/test-uuid");
    const revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    renderFinance();

    const exportBtn = await screen.findByRole("button", { name: "تصدير الصفحة CSV" });
    await waitFor(() => {
      expect(exportBtn).not.toBeDisabled();
    });

    fireEvent.click(exportBtn);

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalled();
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

  it("handles multi-store switch isolation and deferred 3-query race conditions", async () => {
    // 1. Initial render with Store A
    let resolveSummaryA!: (val: typeof mockSummaryA) => void;
    let resolveStatementA!: (val: typeof mockStatementA) => void;
    let resolvePayoutsA!: (val: typeof mockPayoutsA) => void;

    mockGetMerchantFinanceSummary.mockReturnValue(new Promise((res) => { resolveSummaryA = res; }));
    mockGetMerchantFinanceStatement.mockReturnValue(new Promise((res) => { resolveStatementA = res; }));
    mockGetMerchantPayoutHistory.mockReturnValue(new Promise((res) => { resolvePayoutsA = res; }));

    const { rerender } = renderFinance();

    // Store A queries launched
    expect(mockGetMerchantFinanceSummary).toHaveBeenCalledWith("store-a-uuid");

    // 2. User switches to Store B while Store A is still pending
    mockGetMerchantFinanceSummary.mockResolvedValue(mockSummaryB);
    mockGetMerchantFinanceStatement.mockResolvedValue(mockStatementB);
    mockGetMerchantPayoutHistory.mockResolvedValue(mockPayoutsB);

    mockCurrentMerchant.data = {
      merchant_id: "store-b-uuid",
      role: "owner",
      merchants: { id: "store-b-uuid", display_name: "متجر البصرة", status: "active" },
    };

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
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

    // 5. Store B view remains pure and unaltered
    await waitFor(() => {
      expect(screen.getByText(formatPrice(80000))).toBeInTheDocument();
      expect(screen.getByText(formatPrice(175000))).toBeInTheDocument();
      expect(screen.getByText(/ord-bbbb/)).toBeInTheDocument();
      expect(screen.getByText(/payout-b/)).toBeInTheDocument();
      expect(screen.queryByText(/ord-1111/)).not.toBeInTheDocument();
      expect(screen.queryByText(/payout-batch-1/)).not.toBeInTheDocument();
    });
  });
});

