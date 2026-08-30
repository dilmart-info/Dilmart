/**
 * STORE-PR3 — canonical Store target-path validator + target fuzzing (spec §12).
 * Pure unit test (no DB). Proves the FULL handoff allowlist, the discovery subset used by
 * STORE-PR2, decode-once, double-encoding/traversal rejection, and open-redirect blocking.
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
  validateHandoffTargetPath,
  DISCOVERY_TARGET_SUBSET,
  isValidSlug,
  brandTarget,
} = await import("../dist/modules/store-integration/customer-handoff/customer-handoff-target.validator.js");

test("accepts the full initial Handoff allowlist", () => {
  const ok = [
    "/", "/products", "/offers", "/stores", "/cart", "/checkout", "/wishlist",
    "/my-account/orders", "/my-account/addresses", "/track-order",
    "/category/fragrance", "/product/argan-oil-250", "/store/dukany", "/category/عطور",
  ];
  for (const p of ok) assert.equal(validateHandoffTargetPath(p), p, `should accept ${p}`);
});

test("discovery subset accepts only discovery-safe routes", () => {
  for (const p of ["/", "/products", "/offers", "/stores", "/category/x", "/product/y", "/store/z"]) {
    assert.equal(validateHandoffTargetPath(p, DISCOVERY_TARGET_SUBSET), p, `discovery accepts ${p}`);
  }
  // Full-allowlist routes NOT in the discovery subset are rejected.
  for (const p of ["/cart", "/checkout", "/wishlist", "/my-account/orders", "/track-order"]) {
    assert.equal(validateHandoffTargetPath(p, DISCOVERY_TARGET_SUBSET), null, `discovery rejects ${p}`);
  }
});

test("rejects open redirects, schemes, host and protocol-relative", () => {
  for (const p of [
    "https://evil.com", "http://x", "//evil.com", "/\\evil.com",
    "javascript:alert(1)", "data:text/html,x", "vbscript:x", "ftp://x", "/redirect?url=https://evil.com",
  ]) {
    assert.equal(validateHandoffTargetPath(p), null, `should reject ${p}`);
  }
});

test("rejects admin/merchant/agent and unknown routes", () => {
  for (const p of ["/admin", "/admin/login", "/merchant/x", "/agent", "/nope", "/category", "/category/x/y"]) {
    assert.equal(validateHandoffTargetPath(p), null, `should reject ${p}`);
  }
});

test("rejects traversal, encoded traversal and double-encoding", () => {
  for (const p of [
    "/category/../etc", "/category/%2e%2e/etc", "/product/%2E%2E", "/category/%252e%252e",
    "/product/a%2Fb", "/category/%2561", "/product/valid_slug", "/category/a b", "/category/",
  ]) {
    assert.equal(validateHandoffTargetPath(p), null, `should reject ${JSON.stringify(p)}`);
  }
});

test("decodes exactly once (a legitimate percent-encoded slug decodes to a valid path)", () => {
  // %D8%B9%D8%B7%D9%88%D8%B1 === عطور
  assert.equal(
    validateHandoffTargetPath("/category/%D8%B9%D8%B7%D9%88%D8%B1"),
    "/category/عطور",
    "single-decodes a valid encoded Arabic slug",
  );
});

test("rejects every query param outside the single allowlisted contract", () => {
  for (const p of ["/products?x=1", "/category/x?a=b", "/?next=/foo", "/offers?brand=x", "/product/y?brand=x"]) {
    assert.equal(validateHandoffTargetPath(p), null, `should reject query ${p}`);
  }
});

// ── /products?brand= — the ONLY allowlisted query contract ───────────────────────────────────────
// An allowlisted query is part of the target: it must be validated, canonically re-encoded and
// RETURNED. Stripping it would silently navigate the customer to the unfiltered products page.

test("accepts /products?brand= and preserves a canonical query", () => {
  assert.equal(validateHandoffTargetPath("/products?brand=Big%20Roc"), "/products?brand=Big%20Roc");
  assert.equal(validateHandoffTargetPath("/products?brand=Gavaro"), "/products?brand=Gavaro");
  // Arabic brand round-trips through single-decode + canonical re-encode.
  assert.equal(
    validateHandoffTargetPath("/products?brand=%D8%B9%D8%B7%D9%88%D8%B1"),
    "/products?brand=%D8%B9%D8%B7%D9%88%D8%B1",
  );
});

test("rejects unknown keys, duplicates, empty and unsafe brand values", () => {
  const rejected = [
    "/products?foo=bar",              // unknown key
    "/products?brand=x&foo=y",        // one unknown key poisons the whole target
    "/products?brand=a&brand=b",      // duplicate parameter
    "/products?brand=",               // empty value
    "/products?brand=%3Cscript%3E",   // markup
    "/products?brand=%22x%22",        // quotes
    "/products?brand=a%5Cb",          // backslash
    "/products?brand=%2520",          // double-encoded
    "/products?brand=%E0%A4%A",       // malformed percent-encoding
    `/products?brand=${"x".repeat(121)}`, // over-long value
  ];
  for (const p of rejected) assert.equal(validateHandoffTargetPath(p), null, `should reject ${p}`);
});

test("the brand query never unlocks a privileged or external target", () => {
  for (const p of ["/admin?brand=x", "//evil.example?brand=x", "/merchant?brand=x", "/agent?brand=x"]) {
    assert.equal(validateHandoffTargetPath(p), null, `should reject ${p}`);
  }
});

test("brandTarget builds a validated target and drops unsafe brands", () => {
  assert.equal(brandTarget("Big Roc"), "/products?brand=Big%20Roc");
  assert.equal(brandTarget("  Gavaro  "), "/products?brand=Gavaro", "trims before encoding");
  assert.equal(brandTarget("عطور"), "/products?brand=%D8%B9%D8%B7%D9%88%D8%B1");
  for (const bad of ["", "   ", "<script>", 'a"b', "x".repeat(121), null, undefined, 42]) {
    assert.equal(brandTarget(bad), null, `should drop ${JSON.stringify(bad)}`);
  }
});

test("slug validator", () => {
  assert.equal(isValidSlug("valid-slug-1"), true);
  assert.equal(isValidSlug("bad slug"), false);
  assert.equal(isValidSlug("under_score"), false);
  assert.equal(isValidSlug(""), false);
  assert.equal(isValidSlug(null), false);
});
