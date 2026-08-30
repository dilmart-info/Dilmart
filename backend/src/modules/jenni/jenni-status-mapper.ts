import type { DeliveryStatus } from "../shipping/delivery-operations.service";

export type JenniStatusMapping = {
  deliveryStatus: DeliveryStatus | null;
  eventType: string | null;
  requiresAdminReview: boolean;
  financeDelivered: boolean;
  financeReturned: boolean;
  /** Extra metadata to store in delivery_events.metadata (e.g. postpone reason, return reason) */
  eventMetadata: Record<string, unknown> | null;
};

const STEP_MAP: Record<string, DeliveryStatus> = {
  NEW_ORDER_TO_PRINT: "assigned_to_company",
  NEW_ORDER_TO_PICKUP: "assigned_to_company",
  NEW_WITH_PA: "assigned_to_company",
  IN_SC: "in_transit",              // Entered sorting center = in transit
  PRINT_MANIFEST_DA: "in_transit",
  OFD: "in_transit",
  DELIVERED: "delivered",
  SUCCESSFUL_DELIVERY: "delivered",
  DELIVERED_PRICE_CHANGED: "delivered",
  POSTPONED: "in_transit",           // Postponed = still in transit, details in event metadata
  POSTPONED_CONFIRMED: "in_transit",
  DELIVERY_REATTEMPT: "in_transit",
  FORCE_DELIVERY: "in_transit",
  RTO_WITH_DA: "returned",
  RTO_WH: "returned",
  RETURN_APPROVED: "returned",
  RTO_CONFIRMED: "returned",
  RTO_ARCHIVED: "returned",
  RETURNED_WITH_AGENT: "returned",
  PARTIALLY_DELIVERED: "in_transit",  // Partial = still in transit, details in event metadata
};

const ACTION_MAP: Record<string, DeliveryStatus> = {
  SUCCESSFUL_DELIVERY: "delivered",
  DELIVERED: "delivered",
  DELIVERED_PRICE_CHANGED: "delivered",
  POSTPONED: "in_transit",
  POSTPONEMENT_APPROVED: "in_transit",
  POSTPONED_CONFIRMED: "in_transit",
  DELIVERY_REATTEMPT: "in_transit",
  FORCE_DELIVERY: "in_transit",
  RETURNED_WITH_AGENT: "returned",
  RETURN_APPROVED: "returned",
  RTO_WITH_DA: "returned",
  RTO_WH: "returned",
  RTO_CONFIRMED: "returned",
  RTO_ARCHIVED: "returned",
  PARTIAL_DELIVERY: "in_transit",
  PARTIALLY_DELIVERED: "in_transit",
};

export function mapJenniProviderUpdate(input: {
  action_code?: string | null;
  current_step?: string | null;
  postponed_reason?: string | null;
  return_reason?: string | null;
  postponed_date_id?: number | null;
}): JenniStatusMapping {
  const action = String(input.action_code ?? "").trim().toUpperCase();
  const step = String(input.current_step ?? "").trim().toUpperCase();

  const amountChange = step === "DELIVERED_PRICE_CHANGED" || action === "DELIVERED_PRICE_CHANGED";
  const partial = step === "PARTIALLY_DELIVERED" || action === "PARTIAL_DELIVERY" || action === "PARTIALLY_DELIVERED";
  const postponed = step === "POSTPONED" || step === "POSTPONED_CONFIRMED" || action === "POSTPONED" || action === "POSTPONEMENT_APPROVED";
  const isReturn = ["RTO_WITH_DA", "RTO_WH", "RTO_CONFIRMED", "RTO_ARCHIVED", "RETURN_APPROVED", "RETURNED_WITH_AGENT"].includes(step) ||
    ["RTO_WITH_DA", "RTO_WH", "RTO_CONFIRMED", "RTO_ARCHIVED", "RETURN_APPROVED", "RETURNED_WITH_AGENT"].includes(action);

  const fromAction = action ? ACTION_MAP[action] : undefined;
  const fromStep = step ? STEP_MAP[step] : undefined;
  const deliveryStatus = fromAction ?? fromStep ?? null;

  const financeDelivered = deliveryStatus === "delivered";
  const financeReturned = deliveryStatus === "returned" || deliveryStatus === "failed";

  let eventType: string | null = "provider_synced";
  if (amountChange) eventType = "amount_change_reported";
  else if (postponed) eventType = "provider_postponed";
  else if (partial) eventType = "provider_partially_delivered";
  else if (isReturn) eventType = "provider_return";

  // Metadata to be saved in delivery_events.metadata
  const eventMetadata: Record<string, unknown> = {};
  if (postponed) {
    if (input.postponed_reason) eventMetadata.postponed_reason = input.postponed_reason;
    if (input.postponed_date_id) eventMetadata.postponed_date_id = input.postponed_date_id;
  }
  if (isReturn && input.return_reason) {
    eventMetadata.return_reason = input.return_reason;
  }

  return {
    deliveryStatus,
    eventType,
    requiresAdminReview: amountChange || partial,
    financeDelivered,
    financeReturned,
    eventMetadata: Object.keys(eventMetadata).length > 0 ? eventMetadata : null,
  };
}
