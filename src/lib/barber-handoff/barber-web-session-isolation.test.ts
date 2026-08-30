/**
 * Structural regression: the Barber B2B web-session context/gate must never import the Customer
 * AuthContext/useAuth or any Merchant auth module — identity isolation (Phase 8) enforced at the
 * import-graph level, not just by runtime behavior, so a future refactor can't silently merge them.
 *
 * The scanner below matches static imports (including ones reformatted across multiple lines),
 * side-effect imports, `export ... from`, and dynamic `import(...)` calls — not merely lines that
 * happen to start with the literal word `import`, which a multi-line specifier list or a dynamic
 * import trivially bypasses. Comments are stripped first so a doc comment that legitimately NAMES
 * a module in prose (explaining what this file deliberately does not depend on) is never mistaken
 * for a real import — the earlier, weaker version of this guard tripped on exactly that prose.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(here, "../../");

const FILES_MUST_NOT_TOUCH_CUSTOMER_OR_MERCHANT_AUTH = [
  "lib/barber-handoff/BarberWebSessionContext.tsx",
  "lib/barber-handoff/barber-web-session-api.ts",
  "pages/BarberAccount.tsx",
  "components/guards/ProfileRouteGate.tsx",
];

const FORBIDDEN_IMPORTS = [/@\/lib\/auth\/AuthContext/, /@\/lib\/auth\/AuthProvider/, /@\/hooks\/use-auth/, /RequireMerchantUser/, /merchant/i];

/** Strips block and line comments so prose mentions in doc comments can never be mistaken for a
 *  real import (mirrors the same defense used by the backend log-safety scan). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

/**
 * Extracts every import-shaped construct from source text, across line breaks:
 *  - static imports / re-exports:  import X from "m";  export { X } from "m";  (may span lines)
 *  - side-effect imports:          import "m";
 *  - dynamic imports:               import("m")  /  await import("m")  /  import(`m`)
 *    (a no-substitution template literal is a valid dynamic-import specifier — matched too, since
 *    static `import ... from` specifiers, unlike dynamic import() calls, are restricted by the JS
 *    grammar to single/double-quoted string literals only, so only the dynamic patterns need the
 *    extra delimiter)
 * Returns the concatenated matched text — the ONLY text the forbidden-module regexes are run
 * against, so a module path mentioned only in prose never counts.
 */
export function extractImportText(src: string): string {
  const stripped = stripComments(src);
  const matches: string[] = [];
  const patterns = [
    /\b(?:import|export)\b[\s\S]*?\bfrom\s*["'][^"']+["']/g, // static import/export ... from "..."
    /\bimport\s*["'][^"']+["']/g, // side-effect: import "...";
    /\bimport\s*\(\s*["'][^"']+["']\s*\)/g, // dynamic: import("...") / import('...')
    /\bimport\s*\(\s*`[^`$]*`\s*\)/g, // dynamic, no-substitution template literal: import(`...`)
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(stripped)) !== null) matches.push(m[0]);
  }
  return matches.join("\n");
}

function hasForbiddenImport(src: string): boolean {
  const importText = extractImportText(src);
  return FORBIDDEN_IMPORTS.some((re) => re.test(importText));
}

describe("Barber B2B web-session isolation", () => {
  for (const rel of FILES_MUST_NOT_TOUCH_CUSTOMER_OR_MERCHANT_AUTH) {
    it(`${rel} never imports Customer auth or Merchant auth`, () => {
      const src = readFileSync(join(SRC_ROOT, rel), "utf8");
      expect(hasForbiddenImport(src), `${rel} has a forbidden Customer/Merchant auth import`).toBe(false);
    });
  }

  describe("scanner self-test: each import shape is actually caught (proves the guard can't be bypassed by formatting)", () => {
    it("single-line static import", () => {
      expect(hasForbiddenImport(`import { useAuth } from "@/hooks/use-auth";\n`)).toBe(true);
    });

    it("multi-line static import (specifier list on its own line, module path further down)", () => {
      const src = [
        "import {",
        "  useAuth,",
        "  type AuthContextValue,",
        '} from "@/hooks/use-auth";',
        "",
      ].join("\n");
      expect(hasForbiddenImport(src)).toBe(true);
    });

    it("dynamic import()", () => {
      expect(hasForbiddenImport(`const mod = await import("@/hooks/use-auth");\n`)).toBe(true);
    });

    it("dynamic import() with a no-substitution template-literal specifier (CodeRabbit follow-up: backticks bypassed the quote-only matcher)", () => {
      expect(hasForbiddenImport("const mod = await import(`@/hooks/use-auth`);\n")).toBe(true);
    });

    it("export ... from re-export", () => {
      expect(hasForbiddenImport(`export { useAuth } from "@/hooks/use-auth";\n`)).toBe(true);
    });

    it("side-effect import (no bindings)", () => {
      expect(hasForbiddenImport(`import "@/hooks/use-auth";\n`)).toBe(true);
    });

    it("RequireMerchantUser identifier import (no path match needed — name itself is forbidden)", () => {
      expect(hasForbiddenImport(`import { RequireMerchantUser } from "@/components/guards/RequireMerchantUser";\n`)).toBe(true);
    });

    it("a doc comment that only NAMES the forbidden module in prose is NOT flagged (no false positive)", () => {
      const src = [
        "/**",
        " * Deliberately separate from CustomerAuthContext (@/lib/auth/AuthContext) — never merged.",
        " */",
        'import { readBarberWebSessionCookie } from "./barber-web-cookie";',
        "",
      ].join("\n");
      expect(hasForbiddenImport(src)).toBe(false);
    });

    it("an unrelated import is NOT flagged", () => {
      expect(hasForbiddenImport(`import { useState } from "react";\n`)).toBe(false);
    });
  });
});
