import { describe, expect, it } from "vitest";
import {
  getMerchantOrderStatusLabel,
  getMerchantDecisionStatus,
  getMerchantDeliveryStatusLabel,
  getMerchantPaymentMethodLabel,
  getMerchantChannelLabel,
  getMerchantJenniDispatchLabel,
  getMerchantJenniErrorLabel,
  UNKNOWN_ORDER_STATUS_FALLBACK,
  UNKNOWN_DELIVERY_STATUS_FALLBACK,
  UNKNOWN_PAYMENT_METHOD_FALLBACK,
  UNKNOWN_CHANNEL_FALLBACK,
  UNKNOWN_JENNI_DISPATCH_FALLBACK,
  SAFE_JENNI_ERROR_MESSAGE,
} from "./merchant-order-status";

describe("merchant-order-status authority", () => {
  it("maps known order statuses accurately to Arabic", () => {
    expect(getMerchantOrderStatusLabel("new")).toBe("جديد");
    expect(getMerchantOrderStatusLabel("pending")).toBe("قيد الانتظار");
    expect(getMerchantOrderStatusLabel("preparing")).toBe("قيد التجهيز");
    expect(getMerchantOrderStatusLabel("shipped")).toBe("قيد التوصيل");
    expect(getMerchantOrderStatusLabel("delivered")).toBe("تم التسليم");
    expect(getMerchantOrderStatusLabel("cancelled")).toBe("ملغي");
    expect(getMerchantOrderStatusLabel("returned")).toBe("مُرتجع");
  });

  it("safely falls back for unknown or empty order status without exposing raw string", () => {
    expect(getMerchantOrderStatusLabel("UNKNOWN_INTERNAL_CODE")).toBe(UNKNOWN_ORDER_STATUS_FALLBACK);
    expect(getMerchantOrderStatusLabel(null)).toBe(UNKNOWN_ORDER_STATUS_FALLBACK);
    expect(getMerchantOrderStatusLabel(undefined)).toBe(UNKNOWN_ORDER_STATUS_FALLBACK);
    expect(getMerchantOrderStatusLabel("")).toBe(UNKNOWN_ORDER_STATUS_FALLBACK);
  });

  it("maps merchant decision statuses with correct badges and priority", () => {
    expect(getMerchantDecisionStatus("pending", "new")).toEqual({
      label: "بانتظار قرارك",
      variant: "pending",
    });
    expect(getMerchantDecisionStatus("rejected", "cancelled")).toEqual({
      label: "مرفوض من المتجر",
      variant: "rejected",
    });
    expect(getMerchantDecisionStatus("accepted", "preparing")).toEqual({
      label: "مقبول",
      variant: "accepted",
    });
    expect(getMerchantDecisionStatus(null, "shipped")).toEqual({
      label: "قيد التوصيل",
      variant: "normal",
    });
  });

  it("maps delivery milestone statuses with safe fallback", () => {
    expect(getMerchantDeliveryStatusLabel("in_transit")).toBe("في الطريق");
    expect(getMerchantDeliveryStatusLabel("delivered")).toBe("تم التوصيل");
    expect(getMerchantDeliveryStatusLabel("failed")).toBe("تعذر التوصيل");
    expect(getMerchantDeliveryStatusLabel("unknown_milestone")).toBe(UNKNOWN_DELIVERY_STATUS_FALLBACK);
    expect(getMerchantDeliveryStatusLabel(null)).toBe(UNKNOWN_DELIVERY_STATUS_FALLBACK);
  });

  it("PAYMENT METHOD FALLBACK: never defaults null/undefined to COD", () => {
    expect(getMerchantPaymentMethodLabel("cod")).toBe("الدفع عند الاستلام");
    expect(getMerchantPaymentMethodLabel("online_card")).toBe("دفع إلكتروني (بطاقة)");
    expect(getMerchantPaymentMethodLabel("zain_cash")).toBe("زين كاش");
    expect(getMerchantPaymentMethodLabel(null)).toBe(UNKNOWN_PAYMENT_METHOD_FALLBACK);
    expect(getMerchantPaymentMethodLabel(undefined)).toBe(UNKNOWN_PAYMENT_METHOD_FALLBACK);
    expect(getMerchantPaymentMethodLabel("")).toBe(UNKNOWN_PAYMENT_METHOD_FALLBACK);
    expect(getMerchantPaymentMethodLabel(null)).not.toBe("الدفع عند الاستلام");
  });

  it("CHANNEL FALLBACK: never defaults null/undefined to Web Store", () => {
    expect(getMerchantChannelLabel("store")).toBe("متجر ويب");
    expect(getMerchantChannelLabel("mobile_app")).toBe("تطبيق جوال");
    expect(getMerchantChannelLabel("whatsapp")).toBe("واتساب");
    expect(getMerchantChannelLabel(null)).toBe(UNKNOWN_CHANNEL_FALLBACK);
    expect(getMerchantChannelLabel(undefined)).toBe(UNKNOWN_CHANNEL_FALLBACK);
    expect(getMerchantChannelLabel("")).toBe(UNKNOWN_CHANNEL_FALLBACK);
    expect(getMerchantChannelLabel(null)).not.toBe("متجر ويب");
  });

  it("JENNI DISPATCH & ERROR: maps dispatch status and provides sanitized error copy", () => {
    expect(getMerchantJenniDispatchLabel("dispatched")).toBe("تم الإرسال لشركة التوصيل");
    expect(getMerchantJenniDispatchLabel("failed")).toBe("تعذر الربط مع شركة التوصيل");
    expect(getMerchantJenniDispatchLabel("custom_code")).toBe(UNKNOWN_JENNI_DISPATCH_FALLBACK);
    expect(getMerchantJenniErrorLabel(new Error("500 Internal Provider timeout at /dispatch"))).toBe(SAFE_JENNI_ERROR_MESSAGE);
    expect(getMerchantJenniErrorLabel(null)).toBe("");
  });
});
