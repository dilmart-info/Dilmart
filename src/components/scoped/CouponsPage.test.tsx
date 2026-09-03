/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CouponsPage, { assertCouponsContractMerchantId } from "./CouponsPage";
import { platformScope } from "@/lib/data-scope";
import * as scopedQueries from "@/lib/scoped-queries";
import * as commercialPolicy from "@/lib/commercial-policy-profiles";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getActiveMerchants: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockMerchantsList = [
  { id: "m-101", display_name: "متجر المنصور", status: "active" },
  { id: "m-102", display_name: "متجر الكرادة", status: "active" },
];

const mockGlobalCoupons = [
  {
    id: "cp-1",
    code: "GLOBAL10",
    discount_type: "percentage",
    value: 10,
    min_order_amount: 5000,
    max_uses: 200,
    expires_at: "2026-12-31T23:59:59Z",
    is_active: true,
    merchant_id: null,
    merchants: null,
  },
  {
    id: "cp-2",
    code: "MANSOUR20",
    discount_type: "fixed",
    value: 10000,
    min_order_amount: 30000,
    max_uses: 50,
    expires_at: "2026-11-30T23:59:59Z",
    is_active: true,
    merchant_id: "m-101",
    merchants: { id: "m-101", display_name: "متجر المنصور" },
  },
  {
    id: "cp-3",
    code: "KARRADA5",
    discount_type: "fixed",
    value: 5000,
    min_order_amount: 15000,
    max_uses: 100,
    expires_at: "2026-10-31T23:59:59Z",
    is_active: true,
    merchant_id: "m-102",
    merchants: { id: "m-102", display_name: "متجر الكرادة" },
  },
];

function renderAdminCoupons(queryClient?: QueryClient, props?: Partial<React.ComponentProps<typeof CouponsPage>>) {
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
      <MemoryRouter initialEntries={["/admin/coupons"]}>
        <CouponsPage context={platformScope()} title="إدارة الكوبونات" {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CouponsPage — Admin Platform Oversight & Shared Regression Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(apiClient.getActiveMerchants).mockResolvedValue(mockMerchantsList as any);
    vi.spyOn(scopedQueries, "getScopedCoupons").mockResolvedValue(mockGlobalCoupons);
    vi.spyOn(scopedQueries, "upsertScopedCoupon").mockResolvedValue(undefined);
    vi.spyOn(scopedQueries, "deleteScopedCoupon").mockResolvedValue(undefined);
    vi.spyOn(commercialPolicy, "fetchMerchantCommercialPolicyProfileStrict").mockResolvedValue({
      id: "balanced",
      label: "Balanced",
      description: "سياسة متوازنة",
      maxDiscountPercent: 70,
      minCouponOrderAmount: 0,
      maxCouponUsage: 2000,
    });
  });

  it("GLOBAL LIST LOAD: platform admin loads global coupon list across different merchants and platform coupons", async () => {
    renderAdminCoupons();

    expect(await screen.findByText("GLOBAL10")).toBeTruthy();
    expect(screen.getByText("MANSOUR20")).toBeTruthy();
    expect(screen.getByText("KARRADA5")).toBeTruthy();
    expect(screen.getByText("إدارة الكوبونات")).toBeTruthy();
  });

  it("NO CONTRACT REJECTION IN PLATFORM SCOPE: mixed-merchant rows do not trigger merchant row assertion", async () => {
    // Proves that platform mode permits rows from multiple merchants without throwing assertCouponsContractMerchantId
    renderAdminCoupons();

    expect(await screen.findByText("GLOBAL10")).toBeTruthy();
    expect(screen.queryByTestId("coupons-error")).toBeNull();

    // Verify unit helper assertCouponsContractMerchantId throws only when strictly expected in merchant mode
    expect(() => {
      assertCouponsContractMerchantId(
        [{ merchant_id: "m-101" }, { merchant_id: "m-102" }],
        "m-101",
      );
    }).toThrow("Contract violation: coupon belongs to m-102, expected m-101");
  });

  it("MERCHANT FILTERING: selecting merchant sends explicitly chosen merchant ID to scoped query", async () => {
    const getCouponsSpy = vi.spyOn(scopedQueries, "getScopedCoupons").mockImplementation(async (_ctx, params) => {
      if (params?.merchantId === "m-101") {
        return [mockGlobalCoupons[1]]; // Only MANSOUR20
      }
      return mockGlobalCoupons;
    });

    renderAdminCoupons();

    expect(await screen.findByText("GLOBAL10")).toBeTruthy();

    // Filter by "متجر المنصور"
    const filterSelect = screen.getByDisplayValue("كل التجار");
    await act(async () => {
      fireEvent.change(filterSelect, { target: { value: "m-101" } });
    });

    await waitFor(() => {
      expect(getCouponsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ scope: "platform" }),
        { merchantId: "m-101" },
      );
    });

    expect(await screen.findByText("MANSOUR20")).toBeTruthy();
    expect(screen.queryByText("GLOBAL10")).toBeNull();
  });

  it("ADMIN DELETE CONTRACT: calls platform-scoped delete contract correctly", async () => {
    const deleteSpy = vi.spyOn(scopedQueries, "deleteScopedCoupon").mockResolvedValue(undefined);

    renderAdminCoupons();

    expect(await screen.findByText("GLOBAL10")).toBeTruthy();

    const deleteBtn = screen.getByTestId("delete-coupon-cp-1");
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({ scope: "platform" }),
        "cp-1",
      );
      expect(toast.success).toHaveBeenCalledWith("تم حذف الكوبون");
    });
  });

  it("MANAGEMENT CONTROLS: creation form and action buttons remain visible in admin mode", async () => {
    renderAdminCoupons();

    expect(await screen.findByText("GLOBAL10")).toBeTruthy();
    expect(screen.getByTestId("coupon-create-form")).toBeTruthy();
    expect(screen.getByTestId("coupon-save-btn")).toBeTruthy();
    expect(screen.getByTestId("delete-coupon-cp-1")).toBeTruthy();
    expect(screen.queryByTestId("staff-readonly-banner")).toBeNull();
  });

  it("MERCHANT ISOLATION REF IMMUNITY: liveMerchantIdRef does not block or suppress platform operation", async () => {
    const liveMerchantRef = { current: "some-arbitrary-merchant-id" };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderAdminCoupons(queryClient, { liveMerchantIdRef: liveMerchantRef });

    expect(await screen.findByText("GLOBAL10")).toBeTruthy();

    const deleteBtn = screen.getByTestId("delete-coupon-cp-1");
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    await waitFor(() => {
      // Platform operations ignore merchant ID mismatches in liveMerchantIdRef
      expect(toast.success).toHaveBeenCalledWith("تم حذف الكوبون");
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["scoped-coupons", "platform", undefined],
        }),
      );
    });
  });

  it("TRUTHFUL STATES: loading, error, and retry behave truth-first without inventing merchant state", async () => {
    vi.spyOn(scopedQueries, "getScopedCoupons").mockRejectedValueOnce(new Error("Database connection down"));

    renderAdminCoupons();

    const errorCard = await screen.findByTestId("coupons-error");
    expect(errorCard).toBeTruthy();
    expect(screen.getByText("تعذر تحميل بيانات الكوبونات")).toBeTruthy();
    expect(screen.getByText("Database connection down")).toBeTruthy();
    expect(screen.queryByTestId("coupons-empty")).toBeNull();

    // Clicking retry fetches and renders data
    vi.spyOn(scopedQueries, "getScopedCoupons").mockResolvedValueOnce(mockGlobalCoupons);
    const retryBtn = screen.getByRole("button", { name: /إعادة المحاولة/i });
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    expect(await screen.findByText("GLOBAL10")).toBeTruthy();
    expect(screen.queryByTestId("coupons-error")).toBeNull();
  });
});
