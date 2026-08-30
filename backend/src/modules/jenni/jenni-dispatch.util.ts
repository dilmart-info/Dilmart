import { BadRequestException } from "@nestjs/common";

const TERMINAL_DELIVERY_STATUSES = new Set(["delivered", "returned", "cancelled"]);
const TERMINAL_ORDER_STATUSES = new Set(["delivered", "cancelled"]);

export type JenniDispatchPrecheck = {
  orderId: string;
  deliveryStatus: string;
  orderStatus: string;
};

export function assertOrderEligibleForJenniDispatch(order: {
  id: string;
  delivery_status?: string | null;
  status?: string | null;
}): JenniDispatchPrecheck {
  const deliveryStatus = String(order.delivery_status ?? "pending_assignment").trim();
  const orderStatus = String(order.status ?? "").trim();

  if (TERMINAL_ORDER_STATUSES.has(orderStatus)) {
    throw new BadRequestException(`Order status "${orderStatus}" cannot be dispatched to Jenni.`);
  }
  if (TERMINAL_DELIVERY_STATUSES.has(deliveryStatus)) {
    throw new BadRequestException(`Delivery status "${deliveryStatus}" cannot be dispatched to Jenni.`);
  }

  return { orderId: order.id as string, deliveryStatus, orderStatus };
}

export function shouldRetryJenniLocalDispatchOnly(integration: {
  dispatch_status?: string | null;
  provider_shipment_id?: string | null;
} | null): boolean {
  if (!integration?.provider_shipment_id) return false;
  const status = String(integration.dispatch_status ?? "");
  return status === "local_update_failed" || status === "failed";
}

export function isJenniDispatchComplete(integration: { dispatch_status?: string | null } | null): boolean {
  const status = String(integration?.dispatch_status ?? "");
  return status === "dispatched" || status === "synced";
}
