import { describe, expect, it } from "vitest";
import { canMerchantDecide, canMerchantManageCatalog, isMerchantStaff } from "./merchant-role-authority";

describe("merchant-role-authority — Role Gating Matrix", () => {
  it("allows owner to make merchant decisions and manage catalog", () => {
    expect(canMerchantDecide("owner")).toBe(true);
    expect(canMerchantDecide("merchant_owner")).toBe(true);
    expect(canMerchantDecide("OWNER")).toBe(true);
    expect(canMerchantManageCatalog("owner")).toBe(true);
    expect(canMerchantManageCatalog("merchant_owner")).toBe(true);
    expect(canMerchantManageCatalog("OWNER")).toBe(true);
  });

  it("allows manager to make merchant decisions and manage catalog", () => {
    expect(canMerchantDecide("manager")).toBe(true);
    expect(canMerchantDecide("merchant_manager")).toBe(true);
    expect(canMerchantDecide("MANAGER")).toBe(true);
    expect(canMerchantManageCatalog("manager")).toBe(true);
    expect(canMerchantManageCatalog("merchant_manager")).toBe(true);
    expect(canMerchantManageCatalog("MANAGER")).toBe(true);
  });

  it("strictly forbids staff from making merchant decisions and mutating catalog", () => {
    expect(canMerchantDecide("staff")).toBe(false);
    expect(canMerchantDecide("merchant_staff")).toBe(false);
    expect(canMerchantDecide("STAFF")).toBe(false);
    expect(canMerchantManageCatalog("staff")).toBe(false);
    expect(canMerchantManageCatalog("merchant_staff")).toBe(false);
    expect(canMerchantManageCatalog("STAFF")).toBe(false);
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

    expect(canMerchantManageCatalog(null)).toBe(false);
    expect(canMerchantManageCatalog(undefined)).toBe(false);
    expect(canMerchantManageCatalog("")).toBe(false);
    expect(canMerchantManageCatalog("customer")).toBe(false);
    expect(canMerchantManageCatalog("viewer")).toBe(false);
    expect(canMerchantManageCatalog("super_admin")).toBe(false);
  });
});
