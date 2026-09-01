/**
 * DILMART Merchant Role Authority
 *
 * Backend authority invariants:
 * - Order Detail GET: merchant_owner, merchant_manager, merchant_staff
 * - Merchant Accept / Reject: merchant_owner, merchant_manager ONLY
 * - merchant_staff: VIEW ONLY (must never receive accept/reject controls or auto-opening decision modals)
 * - unknown / null: fail closed (no mutations, no decision modals)
 */

export function canMerchantDecide(role?: string | null): boolean {
  if (!role || typeof role !== "string") return false;
  const normalized = role.trim().toLowerCase();
  return (
    normalized === "owner" ||
    normalized === "merchant_owner" ||
    normalized === "manager" ||
    normalized === "merchant_manager"
  );
}

export function isMerchantStaff(role?: string | null): boolean {
  if (!role || typeof role !== "string") return false;
  const normalized = role.trim().toLowerCase();
  return normalized === "staff" || normalized === "merchant_staff";
}
