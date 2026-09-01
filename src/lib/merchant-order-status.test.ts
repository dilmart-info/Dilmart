import { describe, expect, it } from "vitest";
import {
  getMerchantOrderStatusLabel,
  getMerchantDecisionStatus,
  UNKNOWN_ORDER_STATUS_FALLBACK,
} from "./merchant-order-status";

describe("merchant-order-status helper", () => {
  it("maps known order statuses correctly", () => {
    expect(getMerchantOrderStatusLabel("new")).toBe("جديد");
    expect(getMerchantOrderStatusLabel("pending")).toBe("قيد الانتظار");
    expect(getMerchantOrderStatusLabel("contacted")).toBe("تم التواصل");
    expect(getMerchantOrderStatusLabel("preparing")).toBe("قيد التجهيز");
    expect(getMerchantOrderStatusLabel("processing")).toBe("قيد التجهيز");
    expect(getMerchantOrderStatusLabel("shipped")).toBe("قيد التوصيل");
    expect(getMerchantOrderStatusLabel("delivered")).toBe("تم التسليم");
    expect(getMerchantOrderStatusLabel("cancelled")).toBe("ملغي");
    expect(getMerchantOrderStatusLabel("returned")).toBe("مُرتجع");
    expect(getMerchantOrderStatusLabel("refunded")).toBe("مُسترد");
  });

  it("safely falls back for unknown, null, undefined, or empty statuses without leaking raw strings", () => {
    expect(getMerchantOrderStatusLabel("unknown_state")).toBe(UNKNOWN_ORDER_STATUS_FALLBACK);
    expect(getMerchantOrderStatusLabel("CUSTOM_STATUS_XYZ")).toBe(UNKNOWN_ORDER_STATUS_FALLBACK);
    expect(getMerchantOrderStatusLabel("")).toBe(UNKNOWN_ORDER_STATUS_FALLBACK);
    expect(getMerchantOrderStatusLabel(null)).toBe(UNKNOWN_ORDER_STATUS_FALLBACK);
    expect(getMerchantOrderStatusLabel(undefined)).toBe(UNKNOWN_ORDER_STATUS_FALLBACK);
  });

  it("maps decision statuses with appropriate variants", () => {
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
    expect(getMerchantDecisionStatus(undefined, "unknown_xyz")).toEqual({
      label: UNKNOWN_ORDER_STATUS_FALLBACK,
      variant: "normal",
    });
  });
});
