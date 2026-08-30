export const APP_CONTEXT_ROLES = [
  "super_admin",
  "admin",
  "merchant_applicant",
  "merchant_owner",
  "merchant_manager",
  "merchant_staff",
  "agent",
  "customer",
] as const;

export type AppContextRole = (typeof APP_CONTEXT_ROLES)[number];
export type MerchantMembershipRole = "owner" | "manager" | "staff";
export type MerchantStatus = "draft" | "pending_review" | "active" | "suspended" | "rejected" | "archived";

export type AuthContextUser = {
  id: string;
  email: string | null;
  phone: string | null;
};

export type AuthContextProfile = {
  id: string;
  role: AppContextRole;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  points: number | null;
  account_type?: string | null;
  phone_verified?: boolean;
  claim_required?: boolean;
  verified_phone?: string | null;
};

export type AuthContextMerchant = {
  id: string;
  role: MerchantMembershipRole;
  status: MerchantStatus | null;
  display_name: string | null;
  slug: string | null;
};

/** STORE-PR5 §Phase A — capability flags the customer surface gates on (mirrors the backend contract). */
export type AuthCapabilities = {
  customerCommerce: boolean;
  phoneIdentity: boolean;
  accountClaim: boolean;
  passwordManagement: boolean;
  federatedLogoutAll: boolean;
};

export type AuthContextResponse = {
  user: AuthContextUser;
  profile: AuthContextProfile | null;
  roles: AppContextRole[];
  activeRole: AppContextRole | null;
  merchant: AuthContextMerchant | null;
  merchant_memberships?: AuthContextMerchant[];
  account_type?: string | null;
  phone_verified?: boolean;
  claim_required?: boolean;
  verified_phone?: string | null;
  /** STORE-PR5 §Phase A/J — identity provider + capability gating. */
  authSource?: "supabase" | "DilMart_federated" | null;
  capabilities?: AuthCapabilities;
};

export function isPlatformAdminRole(role?: AppContextRole | null): boolean {
  return role === "super_admin" || role === "admin";
}

export function isMerchantRole(role?: AppContextRole | null): boolean {
  return role === "merchant_owner" || role === "merchant_manager" || role === "merchant_staff";
}

export function isMerchantApplicantRole(role?: AppContextRole | null): boolean {
  return role === "merchant_applicant";
}

export function isAgentRole(role?: AppContextRole | null): boolean {
  return role === "agent";
}
