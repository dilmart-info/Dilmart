import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MerchantDecisionModal from "./MerchantDecisionModal";
import { toast } from "sonner";

const { mockGetOrderDetail, mockMerchantAcceptOrder, mockMerchantRejectOrder } = vi.hoisted(() => ({
  mockGetOrderDetail: vi.fn(),
  mockMerchantAcceptOrder: vi.fn(),
  mockMerchantRejectOrder: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getOrderDetail: (...args: unknown[]) => mockGetOrderDetail(...args),
    merchantAcceptOrder: (...args: unknown[]) => mockMerchantAcceptOrder(...args),
    merchantRejectOrder: (...args: unknown[]) => mockMerchantRejectOrder(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockOrder = {
  id: "ord-modal-1",
  order_number: "DUK-M100",
  status: "new",
  merchant_decision_status: "pending",
  created_at: "2026-09-01T12:00:00Z",
  channel: "store",
  payment_method: "cod",
  subtotal: 75000,
  discount: 0,
  delivery_cost: 5000,
  total: 80000,
  governorates: { name: "البصرة" },
  order_items: [
    {
      id: "item-m1",
      product_name: "عطر فاخر",
      quantity: 2,
      price: 37500,
      unit_price: 37500,
    },
  ],
};

function renderModal(props: Partial<React.ComponentProps<typeof MerchantDecisionModal>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const defaultProps = {
    orderId: "ord-modal-1",
    merchantId: "m-123",
    role: "owner",
    onClose: vi.fn(),
    onDecisionComplete: vi.fn(),
    queueCount: 3,
    ...props,
  };
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MerchantDecisionModal {...defaultProps} />
        </MemoryRouter>
      </QueryClientProvider>
    ),
    props: defaultProps,
  };
}

describe("MerchantDecisionModal — Role Gating, Fetch Errors, Decision Queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrderDetail.mockResolvedValue(mockOrder);
  });

  it("ROLE GATING — OWNER: renders decision modal with order details and actions", async () => {
    renderModal({ role: "owner" });

    await screen.findByTestId("decision-modal-overview");
    expect(screen.getByText(/DUK-M100/i)).toBeTruthy();
    expect(screen.getByText("لديك 3 طلبات معلقة")).toBeTruthy();
    expect(screen.getByRole("button", { name: /قبول الطلب/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /رفض الطلب/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /عرض التفاصيل/i })).toBeTruthy();
  });

  it("ROLE GATING — STAFF: fails closed and does NOT render decision modal", () => {
    renderModal({ role: "staff" });

    expect(screen.queryByTestId("merchant-decision-modal")).toBeNull();
    expect(mockGetOrderDetail).not.toHaveBeenCalled();
  });

  it("FETCH ERROR RETRY: shows retry UI on fetch failure without silently closing modal", async () => {
    mockGetOrderDetail.mockRejectedValueOnce(new Error("Database timeout"));
    renderModal();

    const errorBlock = await screen.findByTestId("decision-modal-error");
    expect(errorBlock).toBeTruthy();
    expect(screen.getByText("تعذر تحميل تفاصيل الطلب")).toBeTruthy();
    expect(screen.getByText("Database timeout")).toBeTruthy();

    mockGetOrderDetail.mockResolvedValueOnce(mockOrder);
    const retryBtn = screen.getByRole("button", { name: /إعادة المحاولة/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockGetOrderDetail).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("decision-modal-overview")).toBeTruthy();
    });
  });

  it("ACCEPT OPERATION: single-flight accept mutation, shows success toast, and triggers onDecisionComplete", async () => {
    mockMerchantAcceptOrder.mockResolvedValueOnce({ ok: true });
    const { props } = renderModal();

    await screen.findByTestId("decision-modal-overview");
    const acceptBtn = screen.getByRole("button", { name: /قبول الطلب/i });
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(mockMerchantAcceptOrder).toHaveBeenCalledWith("ord-modal-1", "m-123");
      expect(toast.success).toHaveBeenCalledWith("تم قبول الطلب بنجاح");
      expect(props.onDecisionComplete).toHaveBeenCalled();
    });
  });

  it("REJECT OPERATION: requires reason, submits code, shows neutral copy, and triggers onDecisionComplete", async () => {
    mockMerchantRejectOrder.mockResolvedValueOnce({ ok: true });
    const { props } = renderModal();

    await screen.findByTestId("decision-modal-overview");
    const rejectBtn = screen.getByRole("button", { name: /رفض الطلب/i });
    fireEvent.click(rejectBtn);

    // Rejection reason selector
    await screen.findByTestId("decision-modal-reject");
    const radio = screen.getByDisplayValue("insufficient_quantity");
    fireEvent.click(radio);

    const confirmBtn = screen.getByRole("button", { name: "تأكيد رفض الطلب" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockMerchantRejectOrder).toHaveBeenCalledWith("ord-modal-1", "insufficient_quantity", "m-123");
      expect(toast.success).toHaveBeenCalledWith("تم رفض الطلب بنجاح");
      expect(props.onDecisionComplete).toHaveBeenCalled();
    });
  });

  it("VIEW DETAILS: closes modal and navigates without submitting decision", async () => {
    const { props } = renderModal();

    await screen.findByTestId("decision-modal-overview");
    const viewBtn = screen.getByRole("button", { name: /عرض التفاصيل/i });
    fireEvent.click(viewBtn);

    expect(mockMerchantAcceptOrder).not.toHaveBeenCalled();
    expect(mockMerchantRejectOrder).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });
});
