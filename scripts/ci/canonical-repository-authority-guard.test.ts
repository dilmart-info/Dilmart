/**
 * Fail-closed Static Governance Guard — Canonical Repository Authority.
 *
 * Ensures that all ACTIVE repository and deployment authority documents strictly reference
 * the canonical repository `dilmart-info/Dilmart` and do not contain the obsolete identifier
 * `cylendralabs-blip/DilMart-Store`.
 *
 * Scoped explicitly to an active-file allowlist to avoid false positives on historical
 * audit artifacts or legacy phase reports.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const OBSOLETE_REPO_IDENTIFIER = "cylendralabs-blip/DilMart-Store";
const CANONICAL_REPO_IDENTIFIER = "dilmart-info/Dilmart";

const ACTIVE_AUTHORITY_FILES = [
  "ai/ENVIRONMENT_SOURCE_OF_TRUTH.md",
  "docs/CANONICAL_WORKSPACE.md",
  "docs/deployment/netlify-gated-production-deploy.md",
  "governance/CURRENT_PHASE.md",
  ".github/workflows/netlify-production-deploy.yml",
  "scripts/build-production.ps1",
] as const;

describe("canonical repository governance authority guard", () => {
  for (const relativePath of ACTIVE_AUTHORITY_FILES) {
    describe(`active authority file: ${relativePath}`, () => {
      const fullPath = resolve(__dirname, "../../", relativePath);

      it("exists on disk", () => {
        expect(existsSync(fullPath), `Active authority file missing: ${relativePath}`).toBe(true);
      });

      it(`does NOT contain obsolete repository identifier "${OBSOLETE_REPO_IDENTIFIER}"`, () => {
        const content = readFileSync(fullPath, "utf8");
        expect(
          content.includes(OBSOLETE_REPO_IDENTIFIER),
          `Found obsolete identifier "${OBSOLETE_REPO_IDENTIFIER}" in active authority file: ${relativePath}`,
        ).toBe(false);
      });

      it(`contains canonical repository identifier "${CANONICAL_REPO_IDENTIFIER}"`, () => {
        const content = readFileSync(fullPath, "utf8");
        expect(
          content.includes(CANONICAL_REPO_IDENTIFIER),
          `Missing canonical repository identifier "${CANONICAL_REPO_IDENTIFIER}" in active authority file: ${relativePath}`,
        ).toBe(true);
      });
    });
  }
});
