import { describe, expect, it } from "vitest";

import { classifyDesktopQuickLinkHref, isValidDesktopQuickLinkHref } from "./desktop-quick-link-href";

describe("desktop-quick-link-href — client mirror of the backend canonical validator (internal-only policy)", () => {
  it("accepts safe internal Store paths", () => {
    for (const href of ["/", "/products", "/products?brand=Lattafa", "/category/tools", "/offers"]) {
      expect(classifyDesktopQuickLinkHref(href)).toBe("VALID_INTERNAL");
      expect(isValidDesktopQuickLinkHref(href)).toBe(true);
    }
  });

  it("preserves legitimate single-encoded query values", () => {
    expect(classifyDesktopQuickLinkHref("/products?brand=O%27me%27do")).toBe("VALID_INTERNAL");
  });

  it("accepts a literal percent sign that survives one decode — not double-encoding", () => {
    for (const href of [
      "/products?search=50%25",
      "/products?search=100%25%20original",
      "/products?brand=Lattafa&search=50%25",
    ]) {
      expect(classifyDesktopQuickLinkHref(href)).toBe("VALID_INTERNAL");
    }
  });

  it("rejects malformed/double-encoded/control-char query keys", () => {
    expect(classifyDesktopQuickLinkHref("/products?%ZZ=ok")).toBe("INVALID_MALFORMED");
    expect(classifyDesktopQuickLinkHref("/products?%2525=ok")).toBe("INVALID_MALFORMED");
    expect(classifyDesktopQuickLinkHref("/products?na%0Ame=value")).toBe("INVALID_UNSAFE_CHARACTERS");
  });

  it("rejects malformed/double-encoded/control-char query values", () => {
    expect(classifyDesktopQuickLinkHref("/products?search=%ZZ")).toBe("INVALID_MALFORMED");
    expect(classifyDesktopQuickLinkHref("/products?search=50%2525")).toBe("INVALID_MALFORMED");
    expect(classifyDesktopQuickLinkHref("/products?search=foo%0Abar")).toBe("INVALID_UNSAFE_CHARACTERS");
  });

  it("rejects explicit http/https external URLs — policy is internal-only", () => {
    for (const href of ["https://example.com/promo", "http://example.com/x"]) {
      expect(classifyDesktopQuickLinkHref(href)).toBe("INVALID_EXTERNAL_NOT_ALLOWED");
      expect(isValidDesktopQuickLinkHref(href)).toBe(false);
    }
  });

  it("rejects javascript: scheme including obfuscation", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "\tjavascript:alert(1)",
    ]) {
      expect(isValidDesktopQuickLinkHref(href)).toBe(false);
    }
  });

  it("rejects every other unsafe scheme from the task's list", () => {
    expect(classifyDesktopQuickLinkHref("data:text/html,x")).toBe("INVALID_DATA_SCHEME");
    expect(classifyDesktopQuickLinkHref("vbscript:x")).toBe("INVALID_VBSCRIPT_SCHEME");
    expect(classifyDesktopQuickLinkHref("file:///etc/passwd")).toBe("INVALID_FILE_SCHEME");
    expect(classifyDesktopQuickLinkHref("blob:https://x/uuid")).toBe("INVALID_BLOB_SCHEME");
    expect(classifyDesktopQuickLinkHref("about:blank")).toBe("INVALID_ABOUT_SCHEME");
    expect(classifyDesktopQuickLinkHref("intent://x")).toBe("INVALID_INTENT_SCHEME");
  });

  it("rejects protocol-relative URLs", () => {
    expect(isValidDesktopQuickLinkHref("//evil.com")).toBe(false);
  });

  it("rejects raw leading/trailing whitespace and control chars — never strips-then-accepts", () => {
    for (const href of [
      " https://example.com",
      "https://example.com ",
      "\thttps://example.com",
      "https://example.com\r",
      "\nhttps://example.com",
      " /offers",
      "/offers ",
    ]) {
      expect(classifyDesktopQuickLinkHref(href)).toBe("INVALID_LEADING_OR_TRAILING_WHITESPACE");
    }
  });

  it("rejects embedded control chars mid-string", () => {
    expect(isValidDesktopQuickLinkHref("https://exa\nmple.com")).toBe(false);
  });

  it("rejects percent-encoded and control-char obfuscated variants", () => {
    expect(isValidDesktopQuickLinkHref("javascript%3Aalert(1)")).toBe(false);
    expect(isValidDesktopQuickLinkHref("/foo\njavascript:alert(1)")).toBe(false);
  });

  it("rejects malformed/empty/oversized input", () => {
    expect(classifyDesktopQuickLinkHref("")).toBe("INVALID_EMPTY_OR_TOO_LONG");
    expect(classifyDesktopQuickLinkHref("a".repeat(501))).toBe("INVALID_EMPTY_OR_TOO_LONG");
    expect(classifyDesktopQuickLinkHref(null)).toBe("INVALID_EMPTY_OR_TOO_LONG");
  });
});
