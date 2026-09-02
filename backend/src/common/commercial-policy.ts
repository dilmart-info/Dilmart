export type CommercialPolicyProfileId = "balanced" | "strict";

export type CommercialPolicyProfile = {
  id: CommercialPolicyProfileId;
  label: string;
  description: string;
  maxDiscountPercent: number;
  minCouponOrderAmount: number;
  maxCouponUsage: number;
};

export const COMMERCIAL_POLICY_PROFILES: Record<CommercialPolicyProfileId, CommercialPolicyProfile> = {
  balanced: {
    id: "balanced",
    label: "Balanced",
    description: "سياسة متوازنة للتوسع التجاري المعتدل.",
    maxDiscountPercent: 70,
    minCouponOrderAmount: 0,
    maxCouponUsage: 2000,
  },
  strict: {
    id: "strict",
    label: "Strict",
    description: "سياسة محافظة لحماية الهوامش التجارية.",
    maxDiscountPercent: 50,
    minCouponOrderAmount: 5000,
    maxCouponUsage: 500,
  },
};

export function isValidCommercialPolicyProfileId(profileId: unknown): profileId is CommercialPolicyProfileId {
  return typeof profileId === "string" && (profileId === "balanced" || profileId === "strict");
}

export function getCommercialPolicyProfile(profileId?: string | null): CommercialPolicyProfile {
  if (profileId === "strict") return COMMERCIAL_POLICY_PROFILES.strict;
  if (profileId === "balanced" || profileId === null || profileId === undefined) {
    return COMMERCIAL_POLICY_PROFILES.balanced;
  }
  throw new Error(`ملف السياسة التجارية غير معروف: ${profileId}`);
}
