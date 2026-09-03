import { apiClient } from "@/lib/api-client";
import { ENABLE_LOCAL_FALLBACKS } from "@/lib/runtime-flags";

export type CommercialPolicyProfileId = "balanced" | "strict";

export type CommercialPolicyProfile = {
  id: CommercialPolicyProfileId;
  label: string;
  description: string;
  maxDiscountPercent: number;
  minCouponOrderAmount: number;
  maxCouponUsage: number;
};

const POLICY_ASSIGNMENTS_KEY = "DilMart-commercial-policy-assignments-v1";

const PROFILES: Record<CommercialPolicyProfileId, CommercialPolicyProfile> = {
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

function readAssignments(): Record<string, CommercialPolicyProfileId> {
  try {
    const raw = localStorage.getItem(POLICY_ASSIGNMENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAssignments(state: Record<string, CommercialPolicyProfileId>) {
  localStorage.setItem(POLICY_ASSIGNMENTS_KEY, JSON.stringify(state));
}

export function listCommercialPolicyProfiles() {
  return Object.values(PROFILES);
}

export function getCommercialPolicyProfile(profileId?: string | null): CommercialPolicyProfile {
  if (profileId && profileId in PROFILES) {
    return PROFILES[profileId as CommercialPolicyProfileId];
  }
  return PROFILES.balanced;
}

export function getMerchantCommercialPolicyProfile(merchantId?: string | null): CommercialPolicyProfile {
  if (!merchantId) return PROFILES.balanced;
  const assignments = readAssignments();
  const assignedId = assignments[merchantId] ?? "balanced";
  return getCommercialPolicyProfile(assignedId);
}

export function setMerchantCommercialPolicyProfile(merchantId: string, profileId: CommercialPolicyProfileId) {
  const assignments = readAssignments();
  assignments[merchantId] = profileId;
  writeAssignments(assignments);
}

/** M5.3 — prefer server assignment source; keep local fallback for resilience. */
export async function resolveMerchantCommercialPolicyProfile(merchantId?: string | null): Promise<CommercialPolicyProfile> {
  try {
    const res = await apiClient.getCommercialPolicyAssignment({ merchant_id: merchantId ?? undefined });
    if (res?.profile) return res.profile as CommercialPolicyProfile;
  } catch {
    // fallback below (if explicitly enabled)
  }
  if (ENABLE_LOCAL_FALLBACKS) return getMerchantCommercialPolicyProfile(merchantId);
  return getCommercialPolicyProfile("balanced");
}

/**
 * Strict policy resolution for authoritatively validating commercial rules.
 * Fails closed on transport or server error without swallowing exceptions or masking
 * service unavailability with a synthetic "balanced" profile.
 */
export async function fetchMerchantCommercialPolicyProfileStrict(merchantId?: string | null): Promise<CommercialPolicyProfile> {
  if (!merchantId) {
    return PROFILES.balanced;
  }
  const res = (await apiClient.getCommercialPolicyAssignment({ merchant_id: merchantId })) as {
    error?: unknown;
    source?: string;
    merchant_id?: string;
    profile_id?: string;
    profile?: { id?: string };
  } | null | undefined;
  if (!res || typeof res !== "object") {
    throw new Error("استجابة السياسة التجارية فارغة أو غير صالحة.");
  }
  if (res.error) {
    throw new Error(`خطأ في استجابة السياسة التجارية: ${String(res.error)}`);
  }
  if (res.source === "fallback_default") {
    throw new Error("فشل استرداد السياسة المخصصة واستخدام القيمة الاحتياطية مرفوض في الوضع الصارم.");
  }
  if (res.merchant_id !== merchantId) {
    throw new Error("تطابق المتجر غير صحيح أو مفقود في استجابة السياسة التجارية.");
  }
  const profileId = res.profile_id;
  if (!profileId || !(profileId in PROFILES)) {
    throw new Error(`ملف السياسة التجارية غير معروف: ${String(profileId)}`);
  }
  if (res.profile && res.profile.id !== profileId) {
    throw new Error(`عدم تطابق بين profile_id (${String(profileId)}) و profile.id (${String(res.profile.id)}).`);
  }
  return PROFILES[profileId as CommercialPolicyProfileId];
}

export async function assignMerchantCommercialPolicyProfile(merchantId: string, profileId: CommercialPolicyProfileId) {
  try {
    const res = await apiClient.upsertCommercialPolicyAssignment(merchantId, { profile_id: profileId });
    if (res?.ok) {
      if (ENABLE_LOCAL_FALLBACKS) setMerchantCommercialPolicyProfile(merchantId, profileId);
      return { ok: true as const };
    }
    if (ENABLE_LOCAL_FALLBACKS) {
      setMerchantCommercialPolicyProfile(merchantId, profileId);
      return { ok: false as const, message: res?.message ?? "Server assignment failed, local fallback applied." };
    }
    return { ok: false as const, message: res?.message ?? "Server assignment failed (server-only mode)." };
  } catch {
    if (ENABLE_LOCAL_FALLBACKS) {
      setMerchantCommercialPolicyProfile(merchantId, profileId);
      return { ok: false as const, message: "Server assignment unavailable, local fallback applied." };
    }
    return { ok: false as const, message: "Server assignment unavailable (server-only mode)." };
  }
}
