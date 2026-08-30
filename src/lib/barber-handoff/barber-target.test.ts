import { describe, expect, it } from "vitest";
import { validateBarberTarget } from "./barber-target";

describe("validateBarberTarget", () => {
  it("accepts the home target", () => {
    expect(validateBarberTarget("/")).toBe("/");
  });

  it("accepts /store/:slug with a valid slug", () => {
    expect(validateBarberTarget("/store/acme-supplies")).toBe("/store/acme-supplies");
    expect(validateBarberTarget("/store/عطور")).toBe("/store/عطور");
  });

  it("rejects everything outside the first-slice allowlist", () => {
    for (const t of ["/products", "/cart", "/checkout", "/admin", "/merchant/x", "/agent", "https://evil.com", "//evil.com"]) {
      expect(validateBarberTarget(t)).toBeNull();
    }
  });

  it("rejects non-string / oversized / malformed input", () => {
    expect(validateBarberTarget(12345)).toBeNull();
    expect(validateBarberTarget(null)).toBeNull();
    expect(validateBarberTarget("/" + "a".repeat(300))).toBeNull();
    expect(validateBarberTarget("/store/Acme")).toBeNull(); // uppercase slug
    expect(validateBarberTarget("/store/-acme")).toBeNull(); // leading hyphen
  });
});
