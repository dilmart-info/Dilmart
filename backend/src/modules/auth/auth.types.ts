import { AppActorRole } from "../../common/authz/roles.decorator";
import { AuthSource } from "../../common/authz/auth-source";

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

export type ContextRole = (typeof APP_CONTEXT_ROLES)[number];
export type MerchantMembershipRole = "owner" | "manager" | "staff";
export type MerchantStatus = "draft" | "pending_review" | "active" | "suspended" | "rejected" | "archived";

export type AuthContextUser = {
  id: string;
  email: string | null;
  phone: string | null;
};

export type AuthContextProfile = {
  id: string;
  role: ContextRole;
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

/**
 * STORE-PR5 §Phase A — source-aware capability flags surfaced on the auth context. The frontend
 * gates sensitive customer-surface controls on these (never on route names): a federated DilMart
 * customer has commerce but no Store password / phone-security / account-claim surface, and can
 * "logout everywhere" (federated family revoke). Supabase back-office roles get none of them.
 */
export type AuthContextCapabilities = {
  customerCommerce: boolean;
  phoneIdentity: boolean;
  accountClaim: boolean;
  passwordManagement: boolean;
  federatedLogoutAll: boolean;
};

export type AuthContextResponse = {
  user: AuthContextUser;
  profile: AuthContextProfile | null;
  roles: ContextRole[];
  activeRole: ContextRole | null;
  merchant: AuthContextMerchant | null;
  merchant_memberships?: AuthContextMerchant[];
  account_type?: string | null;
  phone_verified?: boolean;
  claim_required?: boolean;
  verified_phone?: string | null;
  /**
   * Which identity provider resolved the caller. `null` only for the guest passthrough.
   */
  authSource: AuthSource | null;
  capabilities: AuthContextCapabilities;
};

export type RawMembershipRow = {
  merchant_id: string;
  role: MerchantMembershipRole;
  merchants:
    | {
        id: string;
        status: MerchantStatus | null;
        display_name: string | null;
        slug: string | null;
      }
    | {
    id: string;
    status: MerchantStatus | null;
    display_name: string | null;
    slug: string | null;
      }[]
    | null;
};

export function isContextRole(role: string | null | undefined): role is ContextRole {
  const trimmed = String(role ?? "").trim();
  return !!trimmed && (APP_CONTEXT_ROLES as readonly string[]).includes(trimmed);
}

export function isPlatformRole(role: AppActorRole | null | undefined): boolean {
  return role === "super_admin" || role === "admin";
}
