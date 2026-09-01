/**
 * Typesafe Merchant Order Detail Contracts
 * Derived directly from canonical getOrderDetail() response
 */

export interface MerchantOrderItem {
  id: string;
  product_id?: string | null;
  product_name?: string | null;
  quantity: number;
  price?: number;
  unit_price?: number;
  total_price?: number;
  image_url?: string | null;
  options?: Record<string, unknown> | null;
}

export interface MerchantDeliveryIntegration {
  id?: string;
  provider_code?: string | null;
  dispatch_status?: string | null;
  provider_shipment_id?: string | null;
  external_shipment_number?: string | null;
  provider_current_step_ar?: string | null;
  dispatch_error?: string | null;
  last_synced_at?: string | null;
}

export interface MerchantOrderDetail {
  id: string;
  order_number: string;
  status: string;
  merchant_decision_status?: string | null;
  merchant_rejection_reason_code?: string | null;
  created_at: string;
  channel?: string | null;
  payment_method?: string | null;
  subtotal?: number;
  discount?: number;
  delivery_cost?: number;
  total: number;
  merchant_notes?: string | null;
  governorates?: { name?: string; code?: string } | null;
  delivery_company_id?: string | null;
  delivery_status?: string | null;
  delivery_companies?: { name?: string; provider_code?: string } | null;
  order_delivery_integrations?: MerchantDeliveryIntegration[] | MerchantDeliveryIntegration | null;
  order_items?: MerchantOrderItem[];
}
