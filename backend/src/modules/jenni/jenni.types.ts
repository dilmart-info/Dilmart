export type JenniDispatchStatus = "pending" | "dispatched" | "failed" | "synced" | "cancelled";

// ── Webhook / Provider Update ────────────────────────────────────────────────

export type JenniProviderUpdate = {
  shipment_number?: string | null;
  shipment_id?: number | string | null;
  external_id?: string | null;
  external_shipment_id?: string | null;
  action_code?: string | null;
  current_step?: string | null;
  current_step_ar?: string | null;
  current_stage?: string | null;
  amount_iqd?: number | null;
  note?: string | null;
  /** New amount if DELIVERED_PRICE_CHANGED */
  new_amount_iqd?: number | null;
  /** Return/postpone reason from Jenni */
  return_reason?: string | null;
  postponed_reason?: string | null;
  /** 1=tomorrow, 2=in 2 days, 3=in 3 days */
  postponed_date_id?: number | null;
  /** Proof-of-delivery image */
  image_url?: string | null;
  timestamp?: string | null;
  [key: string]: unknown;
};

export type JenniWebhookBody = {
  system_code?: string;
  updates?: JenniProviderUpdate[];
};

// ── Shipment Create ──────────────────────────────────────────────────────────

export type JenniCreateShipmentPayload = {
  shipment_number: string;
  external_shipment_id: string;
  receiver_name: string;
  receiver_phone_1: string;
  receiver_phone_2?: string;
  governorate_code: string;
  city: string;
  address: string;
  amount_iqd: number;
  amount_usd?: number;
  quantity: number;
  product_info: string;
  note?: string | null;
  /** Store/Pickup-point in Jenni — set after Phase 0 confirms model */
  store_id?: number;
  merchant_id?: number;
  is_proof_of_delivery?: boolean;
  is_fragile?: boolean;
  have_return_item?: boolean;
  is_special_case?: boolean;
};

export type JenniAcceptedShipment = {
  shipment_number?: string;
  shipment_id?: number;
  airway_bill_number?: string | null;
  status?: string;
};

// ── Store Management ─────────────────────────────────────────────────────────

export type JenniStoreCreatePayload = {
  store_name: string;
  store_phone?: string;
  governorate_code?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  /** Only used in Option B (merchant-per-trader). Omit for Option A. */
  merchant_id?: number;
};

export type JenniStoreCreateResponse = {
  store_id?: number;
  id?: number;
  generated_password?: string;
  [key: string]: unknown;
};

export type JenniStoreInfo = {
  store_id?: number;
  id?: number;
  store_name?: string;
  store_phone?: string;
  governorate_code?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  [key: string]: unknown;
};

// ── Merchant Management (Option B only) ──────────────────────────────────────

export type JenniMerchantCreatePayload = {
  merchant_name: string;
  phone: string;
  system_code: string;
};

export type JenniMerchantCreateResponse = {
  merchant_id?: string | number;
  id?: string | number;
  generated_password?: string;
  [key: string]: unknown;
};

// ── Sticker ──────────────────────────────────────────────────────────────────

export type JenniStickerRequest = {
  shipment_numbers: string[];
  width_mm?: number;
  height_mm?: number;
};

// ── Query / Shipment Details ─────────────────────────────────────────────────

export type JenniQueryShipmentResponse = {
  shipment_id?: number;
  shipment_number?: string;
  external_shipment_id?: string;
  current_step?: string;
  current_step_ar?: string;
  current_stage?: string;
  amount_iqd?: number;
  /** Actual delivery cost charged by Jenni */
  shipment_cost?: number;
  /** Settlement batch ID (0 = not yet settled) */
  merchant_settlement_id?: number;
  /** Settlement date */
  merchant_settlement_date?: string;
  [key: string]: unknown;
};

// ── Payment / Settlement (raw placeholder until API 35 is tested) ────────────

/**
 * Raw response from Jenni Payment Statement API (API 35).
 * Shape is unknown until tested in Phase 0+.
 * Use this type to store the raw response for later analysis.
 */
export type JenniPaymentStatementResponse = Record<string, unknown>;

// ── Integration Row ──────────────────────────────────────────────────────────

export type OrderDeliveryIntegrationRow = {
  id: string;
  order_id: string;
  delivery_company_id: string | null;
  provider_code: string;
  external_shipment_id: string;
  external_shipment_number: string;
  provider_shipment_id: string | null;
  airway_bill_number: string | null;
  provider_current_step: string | null;
  provider_current_step_ar: string | null;
  provider_current_stage: string | null;
  provider_last_payload: Record<string, unknown> | null;
  dispatch_status: JenniDispatchStatus;
  dispatch_error: string | null;
  amount_change_flag: boolean;
  dispatched_at: string | null;
  last_synced_at: string | null;
  /** Jenni store_id linked to this shipment (post-Phase 0) */
  jenni_store_id?: number | null;
  /** Jenni settlement batch ID (0 = not yet settled) */
  jenni_settlement_id?: number;
  /** Actual delivery cost from Jenni */
  delivery_cost_actual?: number | null;
  /** COD amount actually collected by Jenni */
  cod_collected?: number | null;
};

// ── HTTP Client Types ────────────────────────────────────────────────────────

export type JenniHttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export type JenniRequestOptions = {
  method: JenniHttpMethod;
  path: string;
  body?: unknown;
  query?: Record<string, string>;
  /** Response is binary (e.g. PDF sticker) */
  rawResponse?: boolean;
  /** Override default timeout (ms) */
  timeoutMs?: number;
};

export type JenniApiError = {
  statusCode: number;
  message: string;
  raw?: unknown;
};
