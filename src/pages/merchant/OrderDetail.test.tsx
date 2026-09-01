import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MerchantOrderDetail from "./OrderDetail";
import { formatPrice } from "@/lib/format";
import { toast } from "sonner";

const { mockGetOrderDetail, mockMerchantAcceptOrder, mockMerchantRejectOrder, mockDownloadJenniSticker, mockCurrentMerchant } = vi.hoisted(() => ({
  mockGetOrderDetail: vi.fn(),
  mockMerchantAcceptOrder: vi.fn(),
  mockMerchantRejectOrder: vi.fn(),
  mockDownloadJenniSticker: vi.fn(),
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

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getOrderDetail: (...args: unknown[]) => mockGetOrderDetail(...args),
    merchantAcceptOrder: (...args: unknown[]) => mockMerchantAcceptOrder(...args),
    merchantRejectOrder: (...args: unknown[]) => mockMerchantRejectOrder(...args),
    downloadJenniSticker: (...args: unknown[]) => mockDownloadJenniSticker(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockOrderNewPending = {
  id: "ord-101",
  order_number: "DUK-101",
  status: "new",
  merchant_decision_status: "pending",
  merchant_rejection_reason_code: null,
  created_at: "2026-09-01T10:00:00Z",
  channel: "online_store",
  payment_method: "cod",
  subtotal: 50000,
  discount: 5000,
  delivery_cost: 4000,
  total: 49000,
  merchant_notes: "تغليف كهدية",
  governorates: { name: "بغداد", code: "BG" },
  delivery_company_id: null,
  delivery_status: "pending_assignment",
  delivery_companies: null,
  order_delivery_integrations: null,
  order_items: [
    {
      id: "item-1",
      product_name: "ساعة فاخرة",
      quantity: 1,
      unit_price: 50000,
      price: 50000,
    },
  ],
};

const mockOrderAccepted = {
  ...mockOrderNewPending,
  id: "ord-102",
  order_number: "DUK-102",
  status: "preparing",
  merchant_decision_status: "accepted",
};

const mockOrderRejected = {
  ...mockOrderNewPending,
  id: "ord-103",
  order_number: "DUK-103",
  status: "cancelled",
  merchant_decision_status: "rejected",
  merchant_rejection_reason_code: "out_of_stock",
};

const mockOrderJenniDispatched = {
  ...mockOrderAccepted,
  id: "ord-104",
  order_number: "DUK-104",
  delivery_status: "in_transit",
  delivery_companies: { name: "Jenni Delivery", provider_code: "jenni" },
  order_delivery_integrations: [
    {
      id: "jenni-int-1",
      provider_code: "jenni",
      dispatch_status: "dispatched",
      external_shipment_number: "JENNI-TRK-98765",
      provider_shipment_id: "JENNI-PROVIDER-INT-104",
      provider_current_step_ar: "مركز التوزيع المركزي",
      dispatch_error: null,
      last_synced_at: "2026-09-01T11:00:00Z",
    },
  ],
};

function renderOrderDetail(orderId = "ord-101") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/merchant/orders/${orderId}`]}>
        <Routes>
          <Route path="/merchant/orders/:id" element={<MerchantOrderDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("MerchantOrderDetail — Role Gating, Query States & Decision Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentMerchant.data = {
      merchant_id: "m-123",
      role: "owner",
      merchants: { id: "m-123", display_name: "متجر الفرات", status: "active" },
    };
    mockGetOrderDetail.mockResolvedValue(mockOrderNewPending);
  });

  it("ROLE GATING — OWNER: sees active Accept and Reject decision buttons", async () => {
    mockCurrentMerchant.data!.role = "owner";
    renderOrderDetail();

    await screen.findByTestId("merchant-order-detail");
    expect(screen.getByTestId("decision-controls")).toBeTruthy();
    expect(screen.getByRole("button", { name: /قبول الطلب/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /رفض الطلب/i })).toBeTruthy();
    expect(screen.queryByText(/حساب موظف/i)).toBeNull();
  });

  it("ROLE GATING — MANAGER: sees active Accept and Reject decision buttons", async () => {
    mockCurrentMerchant.data!.role = "manager";
    renderOrderDetail();

    await screen.findByTestId("merchant-order-detail");
    expect(screen.getByTestId("decision-controls")).toBeTruthy();
    expect(screen.getByRole("button", { name: /قبول الطلب/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /رفض الطلب/i })).toBeTruthy();
  });

  it("ROLE GATING — STAFF: sees read-only badge and NO decision buttons", async () => {
    mockCurrentMerchant.data!.role = "staff";
    renderOrderDetail();

    await screen.findByTestId("merchant-order-detail");
    expect(screen.getByTestId("staff-readonly-banner")).toBeTruthy();
    expect(screen.getByText(/عرض فقط \(حساب موظف\)/i)).toBeTruthy();
    expect(screen.queryByTestId("decision-controls")).toBeNull();
    expect(screen.queryByRole("button", { name: /قبول الطلب/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /رفض الطلب/i })).toBeNull();
  });

  it("QUERY STATES — 404 NOT FOUND: displays clean not found state without crash", async () => {
    const notFoundError = new Error("Order not found");
    (notFoundError as { status?: number }).status = 404;
    mockGetOrderDetail.mockRejectedValueOnce(notFoundError);
    renderOrderDetail("non-existent-order");

    const notFoundBlock = await screen.findByTestId("order-not-found");
    expect(notFoundBlock).toBeTruthy();
    expect(screen.getByText("الطلب غير موجود أو لم يعد متاحاً")).toBeTruthy();
    expect(screen.getByRole("button", { name: /العودة لقائمة الطلبات/i })).toBeTruthy();
  });

  it("QUERY STATES — API ERROR & RETRY: displays error card and allows retry", async () => {
    mockGetOrderDetail.mockRejectedValueOnce(new Error("Internal Server Error"));
    renderOrderDetail("err-order");

    const errorBlock = await screen.findByTestId("order-error");
    expect(errorBlock).toBeTruthy();
    expect(screen.getByText("تعذر تحميل تفاصيل الطلب")).toBeTruthy();
    expect(screen.getByText("Internal Server Error")).toBeTruthy();

    mockGetOrderDetail.mockResolvedValueOnce(mockOrderNewPending);
    const retryBtn = screen.getByRole("button", { name: /إعادة المحاولة/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId("merchant-order-detail")).toBeTruthy();
    });
  });

  it("ACCEPT OPERATION: single-flight accept mutation, shows neutral success toast", async () => {
    mockMerchantAcceptOrder.mockResolvedValueOnce({ ok: true });
    renderOrderDetail();

    await screen.findByTestId("merchant-order-detail");
    const acceptBtn = screen.getByRole("button", { name: /قبول الطلب/i });

    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(mockMerchantAcceptOrder).toHaveBeenCalledWith("ord-101", "m-123");
      expect(toast.success).toHaveBeenCalledWith("تم قبول الطلب بنجاح");
    });
  });

  it("REJECT OPERATION: requires selecting reason code, submits canonical code, and shows neutral success copy", async () => {
    mockMerchantRejectOrder.mockResolvedValueOnce({ ok: true });
    renderOrderDetail();

    await screen.findByTestId("merchant-order-detail");
    const rejectBtn = screen.getByRole("button", { name: /رفض الطلب/i });
    fireEvent.click(rejectBtn);

    // Reject dialog appears
    expect(screen.getByTestId("reject-dialog")).toBeTruthy();
    expect(screen.getByText("المنتج غير متوفر حالياً")).toBeTruthy();

    // Select reason
    const radio = screen.getByDisplayValue("out_of_stock");
    fireEvent.click(radio);

    const confirmRejectBtn = screen.getByRole("button", { name: "تأكيد الرفض" });
    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      expect(mockMerchantRejectOrder).toHaveBeenCalledWith("ord-101", "out_of_stock", "m-123");
      expect(toast.success).toHaveBeenCalledWith("تم رفض الطلب بنجاح");
    });
  });

  it("ACCEPTED ORDER DISPLAY: shows merchant decision badge separately from order status", async () => {
    mockGetOrderDetail.mockResolvedValueOnce(mockOrderAccepted);
    renderOrderDetail("ord-102");

    await screen.findByTestId("merchant-order-detail");
    expect(screen.getByText("قرار المتجر: تم القبول")).toBeTruthy();
    expect(screen.getByText(/حالة الطلب الحالية: قيد التجهيز/i)).toBeTruthy();
    expect(screen.queryByTestId("decision-controls")).toBeNull();
  });

  it("REJECTED ORDER DISPLAY: shows merchant decision badge and rejection reason", async () => {
    mockGetOrderDetail.mockResolvedValueOnce(mockOrderRejected);
    renderOrderDetail("ord-103");

    await screen.findByTestId("merchant-order-detail");
    expect(screen.getByText("قرار المتجر: مرفوض")).toBeTruthy();
    expect(screen.getByText(/سبب الرفض: المنتج غير متوفر حالياً/i)).toBeTruthy();
    expect(screen.queryByTestId("decision-controls")).toBeNull();
  });

  it("PAYMENT & CHANNEL FALLBACKS: null values render as 'غير محدد' and 'قناة الطلب غير محددة'", async () => {
    mockGetOrderDetail.mockResolvedValueOnce({
      ...mockOrderNewPending,
      payment_method: null,
      channel: null,
    });
    renderOrderDetail();

    await screen.findByTestId("merchant-order-detail");
    expect(screen.getAllByText("غير محدد").length).toBeGreaterThan(0);
    expect(screen.getAllByText("قناة الطلب غير محددة").length).toBeGreaterThan(0);
  });

  it("JENNI DELIVERY & STICKER BUTTON: renders shipment ID and enables sticker button when dispatched or synced", async () => {
    mockGetOrderDetail.mockResolvedValueOnce(mockOrderJenniDispatched);
    renderOrderDetail("ord-104");

    await screen.findByTestId("merchant-order-detail");
    expect(screen.getByText("JENNI-TRK-98765")).toBeTruthy();
    expect(screen.getByText("JENNI-PROVIDER-INT-104")).toBeTruthy();
    expect(screen.getByText("معرف المزود الداخلي")).toBeTruthy();
    expect(screen.getByText("مركز التوزيع المركزي")).toBeTruthy();
    expect(screen.getByText("تم الإرسال لشركة التوصيل")).toBeTruthy();

    const stickerBtns = screen.getAllByRole("button", { name: /طباعة الستيكر/i });
    expect(stickerBtns.length).toBeGreaterThan(0);
    expect(stickerBtns[0].hasAttribute("disabled")).toBe(false);

    fireEvent.click(stickerBtns[0]);
    expect(mockDownloadJenniSticker).toHaveBeenCalledWith("ord-104");
  });

  it("JENNI STICKER BUTTON: enabled when status is 'synced' with external_shipment_number", async () => {
    mockGetOrderDetail.mockResolvedValueOnce({
      ...mockOrderAccepted,
      id: "ord-105",
      order_delivery_integrations: [
        {
          id: "jenni-int-2",
          provider_code: "jenni",
          dispatch_status: "synced",
          external_shipment_number: "JENNI-EXT-105",
          provider_current_step_ar: "تم الاستلام",
        },
      ],
    });
    renderOrderDetail("ord-105");

    await screen.findByTestId("merchant-order-detail");
    expect(screen.getByText("JENNI-EXT-105")).toBeTruthy();
    expect(screen.getByText("تمت المزامنة")).toBeTruthy();

    const stickerBtns = screen.getAllByRole("button", { name: /طباعة الستيكر/i });
    expect(stickerBtns[0].hasAttribute("disabled")).toBe(false);
  });

  it("JENNI STICKER BUTTON: disabled when external_shipment_number is empty even if provider_shipment_id is present", async () => {
    mockGetOrderDetail.mockResolvedValueOnce({
      ...mockOrderAccepted,
      id: "ord-106",
      order_delivery_integrations: [
        {
          id: "jenni-int-3",
          provider_code: "jenni",
          dispatch_status: "dispatched",
          external_shipment_number: "",
          provider_shipment_id: "PROVIDER-INTERNAL-123",
        },
      ],
    });
    renderOrderDetail("ord-106");

    await screen.findByTestId("merchant-order-detail");
    expect(screen.getByText("PROVIDER-INTERNAL-123")).toBeTruthy();
    expect(screen.getByText("معرف المزود الداخلي")).toBeTruthy();

    const stickerBtns = screen.getAllByRole("button", { name: /طباعة الستيكر/i });
    expect(stickerBtns[0].hasAttribute("disabled")).toBe(true);
    fireEvent.click(stickerBtns[0]);
    expect(mockDownloadJenniSticker).not.toHaveBeenCalled();
  });

  it("PRINT FULFILLMENT SLIP PRIVACY: fulfillment slip contains NO customer phone or email PII", async () => {
    renderOrderDetail();

    await screen.findByTestId("merchant-order-detail");
    const printSlip = document.getElementById("merchant-fulfillment-slip");
    expect(printSlip).toBeTruthy();

    const printText = printSlip?.textContent || "";
    expect(printText).toContain("وصل التجهيز");
    expect(printText).toContain("DUK-101");
    expect(printText).toContain("ساعة فاخرة");
    expect(printText).toContain(formatPrice(49000));
    expect(printText).toContain("بغداد");
    expect(printText).toContain("تغليف كهدية");

    // Strictly NO customer PII
    expect(printText).not.toContain("077");
    expect(printText).not.toContain("078");
    expect(printText).not.toContain("@");
    expect(printText).not.toContain("customer_id");
  });
});
