import type { AppContextRole } from "@/lib/auth-context-contract";
import { isAgentRole, isMerchantApplicantRole, isMerchantRole, isPlatformAdminRole } from "@/lib/auth-context-contract";

export function isPlatformAdmin(role?: AppContextRole | null) {
  return isPlatformAdminRole(role);
}

export function isMerchantUser(role?: AppContextRole | null) {
  return isMerchantRole(role);
}

export function isMerchantOwner(role?: AppContextRole | null) {
  return role === "merchant_owner";
}

export function isMerchantManagerOrOwner(role?: AppContextRole | null) {
  return role === "merchant_owner" || role === "merchant_manager";
}

export function isAgent(role?: AppContextRole | null) {
  return isAgentRole(role);
}

export function isMerchantApplicant(role?: AppContextRole | null) {
  return isMerchantApplicantRole(role);
}
