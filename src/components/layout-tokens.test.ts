import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Mobile Layout Tokens & Sticky Stacking Architecture", () => {
  const cssContent = readFileSync(resolve(__dirname, "../index.css"), "utf-8");

  it("defines all canonical shared mobile layout custom properties in :root", () => {
    expect(cssContent).toContain("--mobile-safe-bottom");
    expect(cssContent).toContain("--mobile-bottom-nav-content-height");
    expect(cssContent).toContain("--mobile-bottom-nav-total");
    expect(cssContent).toContain("--mobile-pdp-purchase-height");
    expect(cssContent).toContain("--mobile-pdp-total-bottom");
  });

  it("establishes correct mathematical layout relationships", () => {
    // --mobile-bottom-nav-total must combine content height and safe-area inset
    expect(cssContent).toMatch(
      /--mobile-bottom-nav-total:\s*calc\(var\(--mobile-bottom-nav-content-height\)\s*\+\s*var\(--mobile-safe-bottom\)\);/,
    );
    // --mobile-pdp-total-bottom must stack bottom-nav total and PDP purchase bar height
    expect(cssContent).toMatch(
      /--mobile-pdp-total-bottom:\s*calc\(var\(--mobile-bottom-nav-total\)\s*\+\s*var\(--mobile-pdp-purchase-height\)\);/,
    );
  });

  it("provides utility classes for safe-area insets without double counting", () => {
    expect(cssContent).toContain(".mobile-safe-area-top");
    expect(cssContent).toContain(".mobile-safe-area-bottom");
    expect(cssContent).toContain("padding-bottom: var(--mobile-safe-bottom);");
  });

  it("ensures AuthPageShell accommodates mobile bottom navigation clearance", () => {
    const authShellContent = readFileSync(
      resolve(__dirname, "./auth/AuthPageShell.tsx"),
      "utf-8",
    );
    expect(authShellContent).toContain("var(--mobile-bottom-nav-total)");
  });
});
