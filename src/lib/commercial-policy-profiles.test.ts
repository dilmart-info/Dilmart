/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  fetchMerchantCommercialPolicyProfileStrict,
  getCommercialPolicyProfile,
  getMerchantCommercialPolicyProfile,
  listCommercialPolicyProfiles,
} from "./commercial-policy-profiles";
import { apiClient } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getCommercialPolicyAssignment: vi.fn(),
  },
}));

describe("commercial-policy-profiles — Strict Resolution Unit Tests", () => {
  const mockMerchantId = "m-123";

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("DEFAULT PROFILE: returns balanced profile when merchantId is null or undefined", async () => {
    const profileNull = await fetchMerchantCommercialPolicyProfileStrict(null);
    expect(profileNull.id).toBe("balanced");
    expect(apiClient.getCommercialPolicyAssignment).not.toHaveBeenCalled();

    const profileUndefined = await fetchMerchantCommercialPolicyProfileStrict(undefined);
    expect(profileUndefined.id).toBe("balanced");
  });

  it("REJECTS INVALID OBJECT: rejects when server response is null or non-object", async () => {
    vi.mocked(apiClient.getCommercialPolicyAssignment).mockResolvedValueOnce(null as any);
    await expect(fetchMerchantCommercialPolicyProfileStrict(mockMerchantId)).rejects.toThrow(
      "استجابة السياسة التجارية فارغة أو غير صالحة.",
    );

    vi.mocked(apiClient.getCommercialPolicyAssignment).mockResolvedValueOnce("invalid string" as any);
    await expect(fetchMerchantCommercialPolicyProfileStrict(mockMerchantId)).rejects.toThrow(
      "استجابة السياسة التجارية فارغة أو غير صالحة.",
    );
  });

  it("REJECTS SERVER ERROR: rejects when response contains an error field", async () => {
    vi.mocked(apiClient.getCommercialPolicyAssignment).mockResolvedValueOnce({
      error: "Internal Server Error",
    } as any);

    await expect(fetchMerchantCommercialPolicyProfileStrict(mockMerchantId)).rejects.toThrow(
      "خطأ في استجابة السياسة التجارية: Internal Server Error",
    );
  });

  it("REJECTS FALLBACK_DEFAULT: rejects when source is fallback_default in strict mode", async () => {
    vi.mocked(apiClient.getCommercialPolicyAssignment).mockResolvedValueOnce({
      source: "fallback_default",
      merchant_id: mockMerchantId,
      profile_id: "balanced",
      profile: { id: "balanced" },
    } as any);

    await expect(fetchMerchantCommercialPolicyProfileStrict(mockMerchantId)).rejects.toThrow(
      "فشل استرداد السياسة المخصصة واستخدام القيمة الاحتياطية مرفوض في الوضع الصارم.",
    );
  });

  it("REJECTS MISSING OR MISMATCHED MERCHANT_ID: fails closed when merchant_id does not match", async () => {
    // Missing merchant_id
    vi.mocked(apiClient.getCommercialPolicyAssignment).mockResolvedValueOnce({
      source: "db",
      profile_id: "balanced",
      profile: { id: "balanced" },
    } as any);

    await expect(fetchMerchantCommercialPolicyProfileStrict(mockMerchantId)).rejects.toThrow(
      "تطابق المتجر غير صحيح أو مفقود في استجابة السياسة التجارية.",
    );

    // Mismatched foreign merchant_id
    vi.mocked(apiClient.getCommercialPolicyAssignment).mockResolvedValueOnce({
      source: "db",
      merchant_id: "m-foreign-456",
      profile_id: "balanced",
      profile: { id: "balanced" },
    } as any);

    await expect(fetchMerchantCommercialPolicyProfileStrict(mockMerchantId)).rejects.toThrow(
      "تطابق المتجر غير صحيح أو مفقود في استجابة السياسة التجارية.",
    );
  });

  it("REJECTS UNKNOWN PROFILE_ID: rejects when profile_id is not in PROFILES", async () => {
    vi.mocked(apiClient.getCommercialPolicyAssignment).mockResolvedValueOnce({
      source: "db",
      merchant_id: mockMerchantId,
      profile_id: "nonexistent_aggressive_profile",
      profile: { id: "nonexistent_aggressive_profile" },
    } as any);

    await expect(fetchMerchantCommercialPolicyProfileStrict(mockMerchantId)).rejects.toThrow(
      "ملف السياسة التجارية غير معروف: nonexistent_aggressive_profile",
    );
  });

  it("REJECTS PROFILE.ID MISMATCH: rejects when profile_id differs from profile.id", async () => {
    vi.mocked(apiClient.getCommercialPolicyAssignment).mockResolvedValueOnce({
      source: "db",
      merchant_id: mockMerchantId,
      profile_id: "balanced",
      profile: { id: "strict" }, // Mismatch!
    } as any);

    await expect(fetchMerchantCommercialPolicyProfileStrict(mockMerchantId)).rejects.toThrow(
      "عدم تطابق بين profile_id (balanced) و profile.id (strict).",
    );
  });

  it("SUCCESS RESOLUTION: successfully returns profile when contract is satisfied", async () => {
    // Balanced
    vi.mocked(apiClient.getCommercialPolicyAssignment).mockResolvedValueOnce({
      source: "db",
      merchant_id: mockMerchantId,
      profile_id: "balanced",
      profile: { id: "balanced" },
    } as any);

    const balanced = await fetchMerchantCommercialPolicyProfileStrict(mockMerchantId);
    expect(balanced.id).toBe("balanced");
    expect(balanced.maxDiscountPercent).toBe(70);

    // Strict
    vi.mocked(apiClient.getCommercialPolicyAssignment).mockResolvedValueOnce({
      source: "db",
      merchant_id: mockMerchantId,
      profile_id: "strict",
      profile: { id: "strict" },
    } as any);

    const strict = await fetchMerchantCommercialPolicyProfileStrict(mockMerchantId);
    expect(strict.id).toBe("strict");
    expect(strict.maxDiscountPercent).toBe(50);
    expect(strict.minCouponOrderAmount).toBe(5000);
    expect(strict.maxCouponUsage).toBe(500);
  });

  it("CANONICAL LIMITS: returns canonical local strict limits even if server supplies untrusted numeric overrides", async () => {
    vi.mocked(apiClient.getCommercialPolicyAssignment).mockResolvedValueOnce({
      source: "db",
      merchant_id: mockMerchantId,
      profile_id: "strict",
      profile: {
        id: "strict",
        label: "Spoofed Strict Limits",
        maxDiscountPercent: 99,
        minCouponOrderAmount: 0,
        maxCouponUsage: 99999,
      },
    } as any);

    const resolved = await fetchMerchantCommercialPolicyProfileStrict(mockMerchantId);
    expect(resolved.id).toBe("strict");
    // Canonical strict limits must be strictly preserved
    expect(resolved.maxDiscountPercent).toBe(50);
    expect(resolved.minCouponOrderAmount).toBe(5000);
    expect(resolved.maxCouponUsage).toBe(500);
  });

  it("HELPERS: listCommercialPolicyProfiles and getCommercialPolicyProfile behave deterministically", () => {
    const list = listCommercialPolicyProfiles();
    expect(list.map((p) => p.id)).toEqual(["balanced", "strict"]);

    expect(getCommercialPolicyProfile("strict").id).toBe("strict");
    expect(getCommercialPolicyProfile("unknown-profile").id).toBe("balanced");
    expect(getMerchantCommercialPolicyProfile(null).id).toBe("balanced");
  });
});
