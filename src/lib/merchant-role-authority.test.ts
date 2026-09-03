import { describe, expect, it } from "vitest";
import {
  canMerchantDecide,
  canMerchantManageCatalog,
  canMerchantManageCoupons,
  canMerchantViewFinance,
  canMerchantViewCustomers,
  canMerchantManageSettings,
  canMerchantManageGlobalPushPolicy,
  canMerchantManageStoreDevices,
  isMerchantStaff,
} from "./merchant-role-authority";

describe("merchant-role-authority — Role Gating Matrix", () => {
  it("allows owner to make merchant decisions, manage catalog, and view finance", () => {
    expect(canMerchantDecide("owner")).toBe(true);
    expect(canMerchantDecide("merchant_owner")).toBe(true);
    expect(canMerchantDecide("OWNER")).toBe(true);
    expect(canMerchantManageCatalog("owner")).toBe(true);
    expect(canMerchantManageCatalog("merchant_owner")).toBe(true);
    expect(canMerchantManageCatalog("OWNER")).toBe(true);
    expect(canMerchantViewFinance("owner")).toBe(true);
    expect(canMerchantViewFinance("merchant_owner")).toBe(true);
    expect(canMerchantViewFinance("OWNER")).toBe(true);
  });

  it("allows manager to make merchant decisions, manage catalog, and view finance", () => {
    expect(canMerchantDecide("manager")).toBe(true);
    expect(canMerchantDecide("merchant_manager")).toBe(true);
    expect(canMerchantDecide("MANAGER")).toBe(true);
    expect(canMerchantManageCatalog("manager")).toBe(true);
    expect(canMerchantManageCatalog("merchant_manager")).toBe(true);
    expect(canMerchantManageCatalog("MANAGER")).toBe(true);
    expect(canMerchantViewFinance("manager")).toBe(true);
    expect(canMerchantViewFinance("merchant_manager")).toBe(true);
    expect(canMerchantViewFinance("MANAGER")).toBe(true);
  });

  it("allows staff to view finance while strictly forbidding decisions and catalog mutations", () => {
    expect(canMerchantDecide("staff")).toBe(false);
    expect(canMerchantDecide("merchant_staff")).toBe(false);
    expect(canMerchantDecide("STAFF")).toBe(false);
    expect(canMerchantManageCatalog("staff")).toBe(false);
    expect(canMerchantManageCatalog("merchant_staff")).toBe(false);
    expect(canMerchantManageCatalog("STAFF")).toBe(false);
    expect(canMerchantViewFinance("staff")).toBe(true);
    expect(canMerchantViewFinance("merchant_staff")).toBe(true);
    expect(canMerchantViewFinance("STAFF")).toBe(true);
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

    expect(canMerchantViewFinance(null)).toBe(false);
    expect(canMerchantViewFinance(undefined)).toBe(false);
    expect(canMerchantViewFinance("")).toBe(false);
    expect(canMerchantViewFinance("customer")).toBe(false);
    expect(canMerchantViewFinance("viewer")).toBe(false);
    expect(canMerchantViewFinance("super_admin")).toBe(false);
    expect(canMerchantViewFinance("admin")).toBe(false);

    expect(canMerchantManageCoupons(null)).toBe(false);
    expect(canMerchantManageCoupons(undefined)).toBe(false);
    expect(canMerchantManageCoupons("")).toBe(false);
    expect(canMerchantManageCoupons("staff")).toBe(false);
    expect(canMerchantManageCoupons("merchant_staff")).toBe(false);
    expect(canMerchantManageCoupons("customer")).toBe(false);
    expect(canMerchantManageCoupons("viewer")).toBe(false);
    expect(canMerchantManageCoupons("super_admin")).toBe(false);
    expect(canMerchantManageCoupons("manager")).toBe(true);
    expect(canMerchantManageCoupons("merchant_manager")).toBe(true);
  });

  it("authorizes owner, manager, staff for viewing customers and fails closed on unknown/null", () => {
    // Authorized roles and case-insensitive aliases
    expect(canMerchantViewCustomers("owner")).toBe(true);
    expect(canMerchantViewCustomers("merchant_owner")).toBe(true);
    expect(canMerchantViewCustomers("OWNER")).toBe(true);
    expect(canMerchantViewCustomers("manager")).toBe(true);
    expect(canMerchantViewCustomers("merchant_manager")).toBe(true);
    expect(canMerchantViewCustomers("MANAGER")).toBe(true);
    expect(canMerchantViewCustomers("staff")).toBe(true);
    expect(canMerchantViewCustomers("merchant_staff")).toBe(true);
    expect(canMerchantViewCustomers("STAFF")).toBe(true);

    // Fail-closed cases
    expect(canMerchantViewCustomers(null)).toBe(false);
    expect(canMerchantViewCustomers(undefined)).toBe(false);
    expect(canMerchantViewCustomers("")).toBe(false);
    expect(canMerchantViewCustomers("customer")).toBe(false);
    expect(canMerchantViewCustomers("viewer")).toBe(false);
    expect(canMerchantViewCustomers("super_admin")).toBe(false);
    expect(canMerchantViewCustomers("admin")).toBe(false);
    expect(canMerchantViewCustomers("unauthorized_role")).toBe(false);
  });

  it("authorizes owner and manager for settings and global push policy, while strictly forbidding staff", () => {
    // canMerchantManageSettings
    expect(canMerchantManageSettings("owner")).toBe(true);
    expect(canMerchantManageSettings("merchant_owner")).toBe(true);
    expect(canMerchantManageSettings("manager")).toBe(true);
    expect(canMerchantManageSettings("merchant_manager")).toBe(true);
    expect(canMerchantManageSettings("staff")).toBe(false);
    expect(canMerchantManageSettings("merchant_staff")).toBe(false);
    expect(canMerchantManageSettings(null)).toBe(false);
    expect(canMerchantManageSettings(undefined)).toBe(false);
    expect(canMerchantManageSettings("customer")).toBe(false);

    // canMerchantManageGlobalPushPolicy
    expect(canMerchantManageGlobalPushPolicy("owner")).toBe(true);
    expect(canMerchantManageGlobalPushPolicy("merchant_owner")).toBe(true);
    expect(canMerchantManageGlobalPushPolicy("manager")).toBe(true);
    expect(canMerchantManageGlobalPushPolicy("merchant_manager")).toBe(true);
    expect(canMerchantManageGlobalPushPolicy("staff")).toBe(false);
    expect(canMerchantManageGlobalPushPolicy("merchant_staff")).toBe(false);
    expect(canMerchantManageGlobalPushPolicy(null)).toBe(false);

    // canMerchantManageStoreDevices
    expect(canMerchantManageStoreDevices("owner")).toBe(true);
    expect(canMerchantManageStoreDevices("merchant_owner")).toBe(true);
    expect(canMerchantManageStoreDevices("manager")).toBe(true);
    expect(canMerchantManageStoreDevices("merchant_manager")).toBe(true);
    expect(canMerchantManageStoreDevices("staff")).toBe(false);
    expect(canMerchantManageStoreDevices("merchant_staff")).toBe(false);
    expect(canMerchantManageStoreDevices(null)).toBe(false);
  });
});
