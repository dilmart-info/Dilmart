import { request } from "@/lib/api-core";
import type { AuthContextResponse } from "@/lib/auth-context-contract";

export const customerApi = {
  getAuthContext(overrideAccessToken?: string) {
    return request<AuthContextResponse>(
      "/auth/context",
      "GET",
      undefined,
      overrideAccessToken ? { accessToken: overrideAccessToken } : undefined,
    );
  },

  createProvisionalUser(payload: { customer_name: string; customer_phone: string }) {
    return request<{ email: string; password: string }>(
      "/auth/create-provisional-user",
      "POST",
      payload
    );
  },

  /**
   * Is this number free for the caller to link? Asked before the OTP is sent so a user does
   * not burn a code on a number they can never claim. Says nothing about who holds it.
   */
  checkPhoneAvailability(payload: { phone: string }) {
    return request<{ available: boolean; alreadyMine: boolean }>(
      "/auth/phone-identity/check",
      "POST",
      payload,
    );
  },

  /**
   * Mirrors an already-verified auth phone into profiles and customer_phone_identities.
   * Takes no phone: the backend reads it from the caller's own auth record, so this call
   * cannot assert a number that was never verified.
   */
  syncVerifiedPhoneIdentity() {
    return request<{ linked: true; phoneMasked: string }>(
      "/auth/phone-identity/sync",
      "POST",
    );
  },

  getCustomerProfile() {
    return request<{ user_id: string; full_name: string | null; phone: string | null; email: string | null }>("/customer/profile", "GET");
  },

  updateCustomerProfile(payload: { full_name?: string; phone?: string; email?: string }) {
    return request<{ user_id: string; full_name: string | null; phone: string | null; email: string | null }>("/customer/profile", "PATCH", payload);
  },

  getCustomerAddresses() {
    return request<
      Array<{
        id: string;
        user_id: string;
        label: string | null;
        recipient_name: string;
        recipient_phone: string;
        governorate_id: string | null;
        area: string;
        nearest_landmark: string | null;
        map_url: string | null;
        delivery_notes: string | null;
        is_default: boolean;
      }>
    >("/customer/addresses", "GET");
  },

  createCustomerAddress(payload: {
    label?: string;
    recipient_name: string;
    recipient_phone: string;
    governorate_id?: string | null;
    area: string;
    nearest_landmark?: string | null;
    map_url?: string | null;
    delivery_notes?: string | null;
    is_default?: boolean;
  }) {
    return request<any>("/customer/addresses", "POST", payload);
  },

  updateCustomerAddress(
    id: string,
    payload: {
      label?: string;
      recipient_name: string;
      recipient_phone: string;
      governorate_id?: string | null;
      area: string;
      nearest_landmark?: string | null;
      map_url?: string | null;
      delivery_notes?: string | null;
      is_default?: boolean;
    },
  ) {
    return request<any>(`/customer/addresses/${encodeURIComponent(id)}`, "PATCH", payload);
  },

  deleteCustomerAddress(id: string) {
    return request<{ ok: boolean }>(`/customer/addresses/${encodeURIComponent(id)}`, "DELETE");
  },

  setDefaultCustomerAddress(id: string) {
    return request<{ ok: boolean }>(`/customer/addresses/${encodeURIComponent(id)}/set-default`, "POST");
  },

  getCustomerOrders(payload?: { limit?: number }) {
    const params = new URLSearchParams();
    if (payload?.limit) params.set("limit", String(payload.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<
      Array<{
        id: string;
        order_number: string;
        status: string;
        delivery_status: string | null;
        total: number;
        created_at: string;
        items_count: number;
        items_preview: Array<{
          product_id: string;
          product_name: string;
          quantity: number;
          price: number;
        }>;
      }>
    >(`/customer/orders${suffix}`, "GET");
  },

  getCustomerOrderDetail(id: string) {
    return request<{
      id: string;
      order_number: string;
      status: string;
      delivery_status: string | null;
      created_at: string;
      total: number;
      delivery_snapshot: {
        customer_name: string;
        customer_phone: string;
        governorate_id: string | null;
        area: string;
        nearest_landmark: string | null;
        map_url: string | null;
        notes: string | null;
      };
      items: Array<{
        product_id: string;
        product_name: string;
        quantity: number;
        price: number;
        merchant_id: string | null;
      }>;
    }>(`/customer/orders/${encodeURIComponent(id)}`, "GET");
  },

  previewCustomerReorder(id: string) {
    return request<{
      can_reorder: boolean;
      merchant_id: string | null;
      valid_items: Array<{
        product_id: string;
        product_name: string;
        quantity: number;
        current_price: number;
        previous_price: number;
        price_changed: boolean;
        stock_available: boolean;
      }>;
      unavailable_items: Array<{
        product_id: string;
        product_name: string;
        reason: "inactive" | "deleted" | "out_of_stock" | "merchant_inactive";
      }>;
      warnings: string[];
    }>(`/customer/orders/${encodeURIComponent(id)}/reorder-preview`, "POST");
  },

  updateMyProfile(payload: { full_name?: string; phone?: string; address?: string }) {
    return request<Record<string, unknown>>("/profiles/me", "PATCH", payload);
  },

  // Account Claim & Recovery
  requestAccountClaim(phone: string) {
    return request<{ challenge_id: string; expires_at: string; resend_after: number }>(
      "/auth/account-claim/request",
      "POST",
      { phone }
    );
  },

  recoverClaimByOrder(order_number: string, phone: string) {
    // request_id is opaque and always present, whether or not the order/phone matched.
    return request<{ request_id: string; message: string }>(
      "/auth/account-claim/recover",
      "POST",
      { order_number, phone }
    );
  },

  verifyAccountClaimOtp(reference: string, otp: string) {
    return request<{ success: boolean; action_token: string; expires_in: number }>(
      "/auth/account-claim/verify",
      "POST",
      { request_id: reference, otp }
    );
  },

  completeAccountClaim(payload: { action_token: string; new_password: string; email?: string }) {
    return request<{ success: boolean; merged: boolean; user_id: string; message: string }>(
      "/auth/account-claim/complete",
      "POST",
      payload
    );
  },

  requestPasswordReset(phone: string) {
    return request<{ request_id: string; message: string }>(
      "/auth/password-reset/request",
      "POST",
      { phone }
    );
  },

  verifyPasswordResetOtp(reference: string, otp: string) {
    return request<{ success: boolean; action_token: string; expires_in: number }>(
      "/auth/password-reset/verify",
      "POST",
      { request_id: reference, otp }
    );
  },

  completePasswordReset(payload: { action_token: string; new_password: string }) {
    return request<{ success: boolean; message: string }>(
      "/auth/password-reset/complete",
      "POST",
      payload
    );
  },

  customerCancelOrder(
    id: string,
    payload: { reason_code: string; reason_details?: string },
  ) {
    return request<{ cancelled: boolean; can_request_return: boolean; message: string }>(
      `/orders/${encodeURIComponent(id)}/customer-cancel`,
      "POST",
      payload,
    );
  },

  createReturnRequest(
    id: string,
    payload: { reason_code: string; reason_details?: string },
  ) {
    return request<{ ok: boolean; return_request_id: string; status: string; message: string }>(
      `/orders/${encodeURIComponent(id)}/return-request`,
      "POST",
      payload,
    );
  },

  getReturnRequest(id: string) {
    return request<{ id: string; status: string; reason_code: string; reason_details: string | null; created_at: string }>(
      `/orders/${encodeURIComponent(id)}/return-request`,
      "GET",
    );
  },
};
