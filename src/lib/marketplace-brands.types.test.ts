import { describe, expect, it } from "vitest";

import { toBrandProductsHref } from "./marketplace-brands.types";

describe("toBrandProductsHref", () => {
  it("builds the canonical /products?brand=<value> target", () => {
    expect(toBrandProductsHref("Gavaro")).toBe("/products?brand=Gavaro");
  });

  it("encodes spaces and special characters in the brand name", () => {
    expect(toBrandProductsHref("Big Roc")).toBe("/products?brand=Big%20Roc");
  });

  it("trims outer whitespace before encoding", () => {
    expect(toBrandProductsHref("  RAVE  ")).toBe("/products?brand=RAVE");
  });

  it("preserves the exact production casing (no normalization of the target itself)", () => {
    expect(toBrandProductsHref("SAWENSITO")).toBe("/products?brand=SAWENSITO");
  });

  it("builds a working target for O'me'do and round-trips back to the exact brand name", () => {
    const href = toBrandProductsHref("O'me'do");
    expect(href.startsWith("/products?brand=")).toBe(true);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("brand")).toBe("O'me'do");
  });
});
