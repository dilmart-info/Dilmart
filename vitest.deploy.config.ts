import { defineConfig } from "vitest/config";
import path from "path";

/**
 * STORE-PR6 §6/§7 — ISOLATED config for the deploy-output proof. `build-deploy-associations.test.ts` runs a
 * REAL `npm run build:deploy` (~18s per case) to prove what actually lands in `dist/.well-known`. It is kept
 * OUT of the main parallel suite (excluded there) and run alone via `npm run test:deploy-associations`, so a
 * CPU-saturating vite build can never starve the wall-clock of the timer-based coordinator/auth-ready tests.
 * Node environment — the test only touches node:fs / node:child_process.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/lib/deep-link/build-deploy-associations.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
