import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MerchantCoupons from "./Coupons";
import * as scopedQueries from "@/lib/scoped-queries";
import * as commercialPolicy from "@/lib/commercial-policy-profiles";
import { toast } from "sonner";

const { mockCurrentMerchant } = vi.hoisted(() => ({
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

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderCoupons(queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/merchant/coupons"]}>
        <MerchantCoupons />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const mockCouponsA = [
  {
    id: "c-1",
    code: "BAGHDAD20",
    discount_type: "percentage",
    value: 20,
    min_order_amount: 10000,
    max_uses: 100,
    expires_at: "2026-12-31T23:59:59Z",
    is_active: true,
    merchant_id: "m-123",
  },
];

const mockCouponsB = [
  {
    id: "c-2",
    code: "BASRA10",
    discount_type: "fixed",
    value: 5000,
    min_order_amount: 25000,
    max_uses: 50,
    expires_at: "2026-11-30T23:59:59Z",
    is_active: true,
    merchant_id: "m-456",
  },
];

describe("MerchantCoupons — Multi-Store Authority, Truthful States & Role Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentMerchant.isLoading = false;
    mockCurrentMerchant.data = {
      merchant_id: "m-123",
      role: "owner",
      merchants: { id: "m-123", display_name: "متجر الفرات", status: "active" },
    };

    vi.spyOn(scopedQueries, "getScopedCoupons").mockResolvedValue(mockCouponsA);
    vi.spyOn(scopedQueries, "upsertScopedCoupon").mockResolvedValue(undefined);
    vi.spyOn(scopedQueries, "deleteScopedCoupon").mockResolvedValue(undefined);
    vi.spyOn(commercialPolicy, "resolveMerchantCommercialPolicyProfile").mockResolvedValue({
      id: "balanced",
      label: "Balanced",
      description: "سياسة متوازنة",
      maxDiscountPercent: 70,
      minCouponOrderAmount: 0,
      maxCouponUsage: 2000,
    });
  });

  it("LOADING SKELETON: renders skeleton when merchant data is loading", () => {
    mockCurrentMerchant.isLoading = true;
    renderCoupons();
    expect(screen.getByTestId("merchant-coupons-loading")).toBeTruthy();
  });

  it("UNATTACHED STATE: renders unattached prompt if merchant_id is missing", () => {
    mockCurrentMerchant.data = null;
    renderCoupons();
    expect(screen.getByTestId("merchant-coupons-unattached")).toBeTruthy();
    expect(screen.getByText("لا يوجد متجر مرتبط بحسابك.")).toBeTruthy();
  });

  it("TRUTHFUL ERROR STATE: displays error card with retry button on query failure, never 'لا توجد كوبونات'", async () => {
    vi.spyOn(scopedQueries, "getScopedCoupons").mockRejectedValueOnce(new Error("Database connection lost"));
    renderCoupons();

    const errorScreen = await screen.findByTestId("coupons-error");
    expect(errorScreen).toBeTruthy();
    expect(screen.getByText("تعذر تحميل بيانات الكوبونات")).toBeTruthy();
    expect(screen.getByText("Database connection lost")).toBeTruthy();
    expect(screen.queryByTestId("coupons-empty")).toBeNull();

    // Clicking retry refetches
    vi.spyOn(scopedQueries, "getScopedCoupons").mockResolvedValueOnce(mockCouponsA);
    const retryBtn = screen.getByRole("button", { name: /إعادة المحاولة/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText("BAGHDAD20")).toBeTruthy();
    });
  });

  it("TRUTHFUL EMPTY STATE: displays empty row only when query resolves with empty array", async () => {
    vi.spyOn(scopedQueries, "getScopedCoupons").mockResolvedValueOnce([]);
    renderCoupons();

    expect(await screen.findByTestId("coupons-empty")).toBeTruthy();
    expect(screen.getByText("لا توجد كوبونات.")).toBeTruthy();
  });

  it("CONTRACT VALIDATION: rejects response and displays error if coupon belongs to different merchant", async () => {
    vi.spyOn(scopedQueries, "getScopedCoupons").mockResolvedValueOnce([
      {
        id: "c-evil",
        code: "HACKED",
        discount_type: "fixed",
        value: 1000,
        is_active: true,
        merchant_id: "m-evil", // Foreign merchant ID!
      },
    ]);

    renderCoupons();

    const errorScreen = await screen.findByTestId("coupons-error");
    expect(errorScreen).toBeTruthy();
    expect(screen.getByText(/Contract violation/)).toBeTruthy();
  });

  it("MULTI-STORE KEYED WORKSPACE: switching Store A -> Store B resets draft form and mounts fresh workspace", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    vi.spyOn(scopedQueries, "getScopedCoupons").mockImplementation(async (ctx) => {
      if (ctx.merchantId === "m-123") return mockCouponsA;
      if (ctx.merchantId === "m-456") return mockCouponsB;
      return [];
    });

    // 1. Initial render on Store A
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/coupons"]}>
          <MerchantCoupons />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("BAGHDAD20")).toBeTruthy();

    // Type draft code in Store A form
    const codeInput = screen.getByPlaceholderText("الكود") as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "DRAFTCODE100" } });
    expect(codeInput.value).toBe("DRAFTCODE100");

    // 2. Switch to Store B
    mockCurrentMerchant.data = {
      merchant_id: "m-456",
      role: "owner",
      merchants: { id: "m-456", display_name: "متجر البصرة", status: "active" },
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/coupons"]}>
          <MerchantCoupons />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 3. Verify Store B is rendered, draft form is completely blank, and Store B coupon is visible
    expect(await screen.findByText("BASRA10")).toBeTruthy();
    expect(screen.queryByText("BAGHDAD20")).toBeNull();

    const newCodeInput = screen.getByPlaceholderText("الكود") as HTMLInputElement;
    expect(newCodeInput.value).toBe(""); // Cleanly reset by Keyed Workspace!
  });

  it("ROLE AUTHORITY GATING: staff role sees read-only banner; creation form and delete buttons are omitted", async () => {
    mockCurrentMerchant.data = {
      merchant_id: "m-123",
      role: "staff",
      merchants: { id: "m-123", display_name: "متجر الفرات", status: "active" },
    };

    renderCoupons();

    expect(await screen.findByText("BAGHDAD20")).toBeTruthy();
    expect(screen.getByTestId("staff-readonly-banner")).toBeTruthy();
    expect(screen.queryByTestId("coupon-create-form")).toBeNull();
    expect(screen.queryByTestId("delete-coupon-c-1")).toBeNull();
  });

  it("ROLE AUTHORITY GATING: manager role sees creation form and delete buttons", async () => {
    mockCurrentMerchant.data = {
      merchant_id: "m-123",
      role: "manager",
      merchants: { id: "m-123", display_name: "متجر الفرات", status: "active" },
    };

    renderCoupons();

    expect(await screen.findByText("BAGHDAD20")).toBeTruthy();
    expect(screen.getByTestId("coupon-create-form")).toBeTruthy();
    expect(screen.getByTestId("delete-coupon-c-1")).toBeTruthy();
    expect(screen.queryByTestId("staff-readonly-banner")).toBeNull();
  });

  it("POLICY ERROR HANDLING: displays policy error and disables save button if policy resolution fails", async () => {
    vi.spyOn(commercialPolicy, "resolveMerchantCommercialPolicyProfile").mockRejectedValueOnce(
      new Error("Policy table unavailable"),
    );

    renderCoupons();

    expect(await screen.findByTestId("policy-error")).toBeTruthy();
    expect(screen.getByText(/تعذر تحميل السياسة التجارية/)).toBeTruthy();

    const saveBtn = screen.getByTestId("coupon-save-btn");
    expect(saveBtn.hasAttribute("disabled")).toBe(true);
  });

  it("COMMERCIAL POLICY ENFORCEMENT: rejects discount exceeding policy limits before mutation", async () => {
    renderCoupons();

    await screen.findByText("BAGHDAD20");

    const codeInput = screen.getByPlaceholderText("الكود");
    const typeSelect = screen.getByDisplayValue("مبلغ ثابت");
    const valueInput = screen.getByPlaceholderText("قيمة الخصم");
    const saveBtn = screen.getByTestId("coupon-save-btn");

    fireEvent.change(codeInput, { target: { value: "SUPER75" } });
    fireEvent.change(typeSelect, { target: { value: "percentage" } });
    fireEvent.change(valueInput, { target: { value: "85" } }); // Exceeds 70% policy limit!

    fireEvent.click(saveBtn);

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("الحد الأقصى لخصم النسبة هو 70%"),
    );
    expect(scopedQueries.upsertScopedCoupon).not.toHaveBeenCalled();
  });

  it("SUCCESSFUL COUPON CREATION: converts datetime-local to ISO and submits", async () => {
    renderCoupons();

    await screen.findByText("BAGHDAD20");

    const codeInput = screen.getByPlaceholderText("الكود");
    const valueInput = screen.getByPlaceholderText("قيمة الخصم");
    const minOrderInput = screen.getByPlaceholderText("الحد الأدنى للطلب");
    const maxUsesInput = screen.getByPlaceholderText("الحد الأقصى للاستخدام");
    const dateInput = screen.getByPlaceholderText("تاريخ الانتهاء");
    const saveBtn = screen.getByTestId("coupon-save-btn");

    fireEvent.change(codeInput, { target: { value: "NEWYEAR25" } });
    fireEvent.change(valueInput, { target: { value: "25000" } });
    fireEvent.change(minOrderInput, { target: { value: "50000" } });
    fireEvent.change(maxUsesInput, { target: { value: "100" } });
    fireEvent.change(dateInput, { target: { value: "2026-12-31T20:00" } });

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(scopedQueries.upsertScopedCoupon).toHaveBeenCalledWith(
        expect.objectContaining({ scope: "merchant", merchantId: "m-123" }),
        expect.objectContaining({
          code: "NEWYEAR25",
          discount_type: "fixed",
          value: 25000,
          min_order_amount: 50000,
          max_uses: 100,
          is_active: true,
          merchant_id: "m-123",
          expires_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
        }),
      );
      expect(toast.success).toHaveBeenCalledWith("تم حفظ الكوبون");
    });
  });

  it("DEFERRED RACE CONDITION GUARD: late resolving save for Store A does not affect Store B after switch", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    let resolveSavePromise!: () => void;
    const slowSavePromise = new Promise<void>((resolve) => {
      resolveSavePromise = resolve;
    });
    vi.spyOn(scopedQueries, "upsertScopedCoupon").mockReturnValueOnce(slowSavePromise);

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/coupons"]}>
          <MerchantCoupons />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("BAGHDAD20");

    // Initiate save in Store A
    const codeInput = screen.getByPlaceholderText("الكود");
    const valueInput = screen.getByPlaceholderText("قيمة الخصم");
    const saveBtn = screen.getByTestId("coupon-save-btn");

    fireEvent.change(codeInput, { target: { value: "SLOWCODE" } });
    fireEvent.change(valueInput, { target: { value: "10000" } });
    fireEvent.click(saveBtn);

    // Switch to Store B before slow save resolves
    mockCurrentMerchant.data = {
      merchant_id: "m-456",
      role: "owner",
      merchants: { id: "m-456", display_name: "متجر البصرة", status: "active" },
    };

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/merchant/coupons"]}>
          <MerchantCoupons />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Resolve the slow save for Store A now
    resolveSavePromise();

    await new Promise((r) => setTimeout(r, 50));

    // Toast success must NOT have been called because Store A was abandoned!
    expect(toast.success).not.toHaveBeenCalled();
  });
});
