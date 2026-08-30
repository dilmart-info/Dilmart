import { defineConfig } from "vitest/config";

/**
 * Isolated config for CI/deployment-infrastructure guards.
 *
 * These tests live under `scripts/ci/` rather than `src/` because they assert the shape of the
 * deployment pipeline, not application behaviour. The main suite only includes `src/**`, so they get
 * their own config — the same pattern `vitest.deploy.config.ts` already uses for the deploy-output
 * proof. Node environment: they only read files from disk.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["scripts/ci/**/*.test.ts"],
  },
});
