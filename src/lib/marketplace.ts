import { storeConfig } from "@/config/store";
import { apiClient } from "@/lib/api-client";

export const PLATFORM_ADMIN_ROLES = ["super_admin", "admin"] as const;
export const MERCHANT_ROLES = ["merchant_owner", "merchant_manager", "merchant_staff"] as const;
export const ALL_APP_ROLES = [...PLATFORM_ADMIN_ROLES, "customer", "agent", ...MERCHANT_ROLES] as const;

export type AppRole = (typeof ALL_APP_ROLES)[number];

export type MerchantStatus = "draft" | "active" | "suspended" | "archived";

export type MerchantRecord = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  display_name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  status: MerchantStatus;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
};

export function isPlatformAdminRole(role?: string | null): role is (typeof PLATFORM_ADMIN_ROLES)[number] {
  return !!role && PLATFORM_ADMIN_ROLES.includes(role as (typeof PLATFORM_ADMIN_ROLES)[number]);
}

export function isMerchantRole(role?: string | null): role is (typeof MERCHANT_ROLES)[number] {
  return !!role && MERCHANT_ROLES.includes(role as (typeof MERCHANT_ROLES)[number]);
}

export function isMerchantOwnerRole(role?: string | null): boolean {
  return role === "merchant_owner";
}

export function isMerchantManagerOrOwnerRole(role?: string | null): boolean {
  return role === "merchant_owner" || role === "merchant_manager";
}

export function isAgentRole(role?: string | null): boolean {
  return role === "agent";
}

/**
 * Legacy helper calling `GET /merchants/active-by-slug`.
 * **Prefer** `apiClient.getMarketplaceMerchantBySlug` for public storefront (`GET /marketplace/merchants/:slug`).
 * @see docs/canonical-routing.md
 */
export async function getActiveMerchantBySlug(slug: string) {
  if (!slug?.trim()) return null;
  const data = await apiClient.getActiveMerchantBySlug(slug);
  return (data ?? null) as MerchantRecord | null;
}

export async function getMerchantProducts(merchantId: string) {
  return apiClient.getMerchantProducts(merchantId);
}

export async function getMerchantOrders(merchantId: string) {
  return apiClient.getMerchantOrders(merchantId);
}

export async function getMerchantDashboardStats(merchantId: string) {
  return apiClient.getMerchantDashboardStats(merchantId);
}
