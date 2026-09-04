import { request } from "@/lib/api-core";

export const productsApi = {
  getInventory(payload?: { merchant_id?: string; search?: string }) {
    const params = new URLSearchParams();
    if (payload?.merchant_id) params.set("merchant_id", payload.merchant_id);
    if (payload?.search) params.set("search", payload.search);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<Array<{ id: string; name: string; stock: number; low_stock_threshold?: number; merchant_id?: string }>>(
      `/inventory${suffix}`,
      "GET",
    );
  },

  adjustInventory(payload: { product_id: string; delta: number; merchant_id?: string }) {
    return request<{ ok: boolean; stock: number }>("/inventory/adjust", "POST", payload);
  },

  getProductById(id: string, payload?: { merchant_id?: string }) {
    const params = new URLSearchParams();
    if (payload?.merchant_id) params.set("merchant_id", payload.merchant_id);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<any>(`/products/${id}${suffix}`, "GET");
  },

  createProduct(payload: Record<string, unknown>) {
    return request<any>("/products", "POST", payload);
  },

  updateProduct(id: string, payload: Record<string, unknown>, scope?: { merchant_id?: string }) {
    const params = new URLSearchParams();
    if (scope?.merchant_id) params.set("merchant_id", scope.merchant_id);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ ok: boolean; merchant_id?: string; product_id?: string }>(`/products/${id}${suffix}`, "POST", payload);
  },

  listScopedProducts(payload?: {
    merchant_id?: string;
    search?: string;
    offset?: number;
    limit?: number;
    page?: number;
    readiness?: string;
  }) {
    const params = new URLSearchParams();
    if (payload?.merchant_id) params.set("merchant_id", payload.merchant_id);
    if (payload?.search) params.set("search", payload.search);
    if (payload?.offset !== undefined && payload?.offset !== null) params.set("offset", String(payload.offset));
    if (payload?.limit !== undefined && payload?.limit !== null) params.set("limit", String(payload.limit));
    if (payload?.page !== undefined && payload?.page !== null) params.set("page", String(payload.page));
    if (payload?.readiness && payload.readiness !== "all") params.set("readiness", payload.readiness);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ items: any[]; total: number; offset: number; limit: number } | Array<any>>(`/products${suffix}`, "GET");
  },

  updateProductStatus(id: string, payload: { is_active: boolean; merchant_id?: string }) {
    return request<{ ok: boolean; merchant_id?: string; product_id?: string }>(`/products/${id}/status`, "POST", payload);
  },

  getCategoriesAdminList() {
    return request<Array<any>>("/categories/admin-list", "GET");
  },

  uploadProductImage(payload: {
    file_name: string;
    content_type: string;
    base64_data: string;
    merchant_id?: string;
    product_id?: string;
  }) {
    return request<{ public_url: string; file_path: string }>("/uploads/products/image", "POST", payload);
  },
};
