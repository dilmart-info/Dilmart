import { describe, expect, it } from "vitest";
import { canMerchantDecide, isMerchantStaff } from "./merchant-role-authority";

describe("merchant-role-authority — Role Gating Matrix", () => {
  it("allows owner to make merchant decisions", () => {
    expect(canMerchantDecide("owner")).toBe(true);
    expect(canMerchantDecide("merchant_owner")).toBe(true);
    expect(canMerchantDecide("OWNER")).toBe(true);
  });

  it("allows manager to make merchant decisions", () => {
    expect(canMerchantDecide("manager")).toBe(true);
    expect(canMerchantDecide("merchant_manager")).toBe(true);
    expect(canMerchantDecide("MANAGER")).toBe(true);
  });

  it("strictly forbids staff from making merchant decisions", () => {
    expect(canMerchantDecide("staff")).toBe(false);
    expect(canMerchantDecide("merchant_staff")).toBe(false);
    expect(canMerchantDecide("STAFF")).toBe(false);
    expect(isMerchantStaff("staff")).toBe(true);
    expect(isMerchantStaff("merchant_staff")).toBe(true);
  });

  it("fails closed on null, undefined, empty, or unknown roles", () => {
    expect(canMerchantDecide(null)).toBe(false);
    expect(canMerchantDecide(undefined)).toBe(false);
    expect(canMerchantDecide("")).toBe(false);
    expect(canMerchantDecide("customer")).toBe(false);
    expect(canMerchantDecide("viewer")).toBe(false);
    expect(canMerchantDecide("super_admin")).toBe(false);
  });
});
