/**
 * Pure helpers for merchant new-order Web Push payloads (unit-testable).
 */

export type MerchantNewOrderPushPayload = {
  type: "merchant_new_order";
  notification_id: string | null;
  order_id: string;
  order_number: string | null;
  title: string;
  body: string;
  url: string;
};

export function buildMerchantNewOrderPushEventKey(orderId: string): string {
  return `merchant-new-order-push:${orderId}`;
}

export function parseOrderIdFromPushEventKey(eventKey: string): string | null {
  const prefix = "merchant-new-order-push:";
  if (!eventKey.startsWith(prefix)) return null;
  const id = eventKey.slice(prefix.length).trim();
  return id || null;
}

/** Minimal push payload — never include customer PII or address/phone. */
export function buildMerchantNewOrderPushPayload(input: {
  orderId: string;
  orderNumber?: string | null;
  notificationId?: string | null;
}): MerchantNewOrderPushPayload {
  const orderNumber = input.orderNumber?.trim() || null;
  const urlBase = `/merchant/orders/${input.orderId}`;
  const url = input.notificationId
    ? `${urlBase}?notification=${encodeURIComponent(input.notificationId)}`
    : urlBase;

  return {
    type: "merchant_new_order",
    notification_id: input.notificationId ?? null,
    order_id: input.orderId,
    order_number: orderNumber,
    title: "طلب جديد",
    body: orderNumber
      ? `وصل طلب رقم ${orderNumber} — افتح الطلب لبدء التجهيز`
      : "وصل طلب جديد إلى متجرك",
    url,
  };
}

export function isPermanentWebPushFailure(statusCode: number | undefined | null): boolean {
  return statusCode === 404 || statusCode === 410;
}

export function isTerminalPushDeliveryStatus(status: string): boolean {
  return status === "accepted" || status === "permanent_failure" || status === "skipped";
}

export type ProcessMerchantPushResult = {
  /** Outbox may be marked processed only when true. */
  complete: boolean;
  skipped: boolean;
  skipReason?: string;
  accepted: number;
  retryable: number;
  permanentFailures: number;
};
