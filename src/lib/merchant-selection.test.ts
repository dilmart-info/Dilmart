import { describe, expect, it } from "vitest";
import {
  MerchantMembership,
  MerchantMembershipStatus,
  isSelectableMembership,
  listSelectableMemberships,
  resolveActiveMerchantSelection,
} from "./merchant-selection";

function membership(id: string, status: MerchantMembershipStatus): MerchantMembership {
  return {
    merchant_id: id,
    role: "owner",
    merchants: { id, display_name: `Store ${id}`, status, slug: id.toLowerCase() },
  };
}

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("merchant selection — authoritative invariant", () => {
  it("only an active membership is selectable", () => {
    expect(isSelectableMembership(membership(A, "active"))).toBe(true);
    for (const status of ["draft", "pending_review", "suspended", "rejected", "archived"] as const) {
      expect(isSelectableMembership(membership(A, status))).toBe(false);
    }
    expect(isSelectableMembership(null)).toBe(false);
    expect(isSelectableMembership({ merchant_id: A, role: "owner", merchants: null })).toBe(false);
  });

  // CASE 1 — persisted merchant is suspended, another membership is active.
  it("never keeps a suspended persisted merchant when an active one exists", () => {
    const result = resolveActiveMerchantSelection([membership(A, "suspended"), membership(B, "active")], A);
    expect(result.merchantId).toBe(B);
    expect(result.reason).toBe("fallback");
    expect(result.selectable.map((m) => m.merchant_id)).toEqual([B]);
  });

  // CASE 2 — persisted merchant is a valid active membership.
  it("keeps a valid active persisted merchant", () => {
    const result = resolveActiveMerchantSelection([membership(A, "active"), membership(B, "active")], B);
    expect(result.merchantId).toBe(B);
    expect(result.reason).toBe("persisted");
  });

  // CASE 3 — persisted id does not exist at all.
  it("falls back deterministically to the first active membership in authoritative order", () => {
    const memberships = [membership(A, "active"), membership(B, "active")];
    const first = resolveActiveMerchantSelection(memberships, "random-nonexistent-id");
    const second = resolveActiveMerchantSelection(memberships, "random-nonexistent-id");
    expect(first.merchantId).toBe(A);
    expect(second.merchantId).toBe(A);
    expect(first.reason).toBe("fallback");
  });

  it("skips leading inactive memberships when falling back", () => {
    const result = resolveActiveMerchantSelection(
      [membership(A, "suspended"), membership(B, "active")],
      "random-nonexistent-id",
    );
    expect(result.merchantId).toBe(B);
  });

  // CASE 4 — a single active membership, no usable preference.
  it("selects the only active membership when the preference is missing or invalid", () => {
    expect(resolveActiveMerchantSelection([membership(A, "active")], null).merchantId).toBe(A);
    expect(resolveActiveMerchantSelection([membership(A, "active")], "").merchantId).toBe(A);
    expect(resolveActiveMerchantSelection([membership(A, "active")], "nope").merchantId).toBe(A);
  });

  // CASE 5 — no active membership at all.
  it("selects nothing when every membership is inactive", () => {
    const result = resolveActiveMerchantSelection([membership(A, "suspended"), membership(B, "draft")], A);
    expect(result.membership).toBeNull();
    expect(result.merchantId).toBeNull();
    expect(result.reason).toBe("none");
    expect(result.selectable).toEqual([]);
  });

  it("selects nothing when there are no memberships", () => {
    expect(resolveActiveMerchantSelection([], A).merchantId).toBeNull();
  });

  // CASE 6 — a crafted id for a merchant the user is not a member of.
  it("can never resolve a merchant id that is absent from the authoritative memberships", () => {
    const crafted = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const result = resolveActiveMerchantSelection([membership(A, "active")], crafted);
    expect(result.merchantId).toBe(A);
    expect(result.merchantId).not.toBe(crafted);
  });

  it("listSelectableMemberships preserves authoritative order and drops inactive stores", () => {
    const memberships = [membership(A, "active"), membership(B, "suspended"), membership("c", "active")];
    expect(listSelectableMemberships(memberships).map((m) => m.merchant_id)).toEqual([A, "c"]);
  });
});
