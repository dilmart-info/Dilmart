import { apiClient } from "@/lib/api-client";

export type ScopedContext = {
  scope: "platform" | "merchant";
  merchantId?: string;
};

export type QueryFilters = {
  search?: string;
  status?: string;
  merchantId?: string;
  page?: number;
  limit?: number;
  offset?: number;
  readiness?: string;
  date_from?: string;
  date_to?: string;
};

function assertScope(context: ScopedContext) {
  if (context.scope === "merchant" && !context.merchantId) {
    throw new Error("Merchant scope requires merchantId.");
  }
}

function merchantIdForContext(context: ScopedContext, fallback?: string) {
  return context.scope === "merchant" ? context.merchantId : fallback;
}

export async function getScopedProducts(context: ScopedContext, filters: QueryFilters = {}) {
  assertScope(context);
  const payload = {
    merchant_id: merchantIdForContext(context, filters.merchantId),
    search: filters.search,
    offset: filters.offset,
    limit: filters.limit,
    page: filters.page,
    readiness: filters.readiness,
  };
  const response = await apiClient.listScopedProducts(payload).catch((error: any) => {
    // If merchant_id scope was explicitly rejected by the server, retry without it
    // so the actor's server-resolved scope is used instead.
    const msg = String(error?.message ?? "");
    if (context.scope === "merchant" && payload.merchant_id && msg.includes("Merchant scope is not allowed")) {
      return apiClient.listScopedProducts({
        search: filters.search,
        offset: filters.offset,
        limit: filters.limit,
        page: filters.page,
        readiness: filters.readiness,
      });
    }
    throw error;
  });

  if (Array.isArray(response)) {
    return {
      items: response,
      total: response.length,
      offset: filters.offset ?? 0,
      limit: filters.limit ?? response.length,
    };
  }

  return {
    items: response?.items ?? [],
    total: typeof response?.total === "number" ? response.total : (response?.items ?? []).length,
    offset: response?.offset ?? filters.offset ?? 0,
    limit: response?.limit ?? filters.limit ?? 100,
  };
}

export async function updateScopedProductStatus(context: ScopedContext, productId: string, isActive: boolean) {
  assertScope(context);
  await apiClient.updateProductStatus(productId, {
    is_active: isActive,
    merchant_id: merchantIdForContext(context),
  });
}

export async function getScopedOrders(context: ScopedContext, filters: QueryFilters = {}) {
  assertScope(context);
  const payload = {
    merchant_id: merchantIdForContext(context, filters.merchantId),
    status: filters.status,
    search: filters.search,
    page: filters.page,
    limit: filters.limit,
    date_from: filters.date_from,
    date_to: filters.date_to,
  };
  return apiClient.listScopedOrders(payload);
}

export async function updateScopedOrderStatus(context: ScopedContext, orderId: string, status: string) {
  assertScope(context);
  await apiClient.updateOrderStatus(orderId, {
    status,
    merchant_id: merchantIdForContext(context),
  });
}

export async function getScopedCoupons(context: ScopedContext, filters: QueryFilters = {}) {
  assertScope(context);
  const payload = {
    merchant_id: merchantIdForContext(context, filters.merchantId),
  };
  return apiClient.listScopedCoupons(payload);
}

export async function upsertScopedCoupon(
  context: ScopedContext,
  payload: {
    id?: string;
    code: string;
    discount_type: "fixed" | "percentage";
    value: number;
    is_active: boolean;
    merchant_id?: string | null;
    min_order_amount?: number;
    max_uses?: number | null;
    expires_at?: string | null;
  },
) {
  assertScope(context);
  const merchant_id = context.scope === "merchant" ? context.merchantId! : payload.merchant_id ?? null;

  await apiClient.upsertCoupon({
    id: payload.id,
    code: payload.code,
    discount_type: payload.discount_type,
    value: payload.value,
    is_active: payload.is_active,
    merchant_id,
    min_order_amount: payload.min_order_amount ?? 0,
    max_uses: payload.max_uses ?? null,
    expires_at: payload.expires_at ?? null,
  });
}

export async function deleteScopedCoupon(context: ScopedContext, couponId: string) {
  assertScope(context);
  await apiClient.deleteCoupon(couponId, {
    merchant_id: merchantIdForContext(context),
  });
}

export async function getScopedCustomers(context: ScopedContext, filters: QueryFilters = {}) {
  assertScope(context);
  const payload = {
    merchant_id: merchantIdForContext(context, filters.merchantId),
    search: filters.search,
  };
  return apiClient.listScopedCustomers(payload);
}
