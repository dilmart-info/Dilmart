import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // STORE-PR6 §6/§7 — the deploy-output proof runs a REAL `npm run build:deploy` (~18s each). It is
    // isolated in vitest.deploy.config.ts (script: test:deploy-associations) so a parallel vite build can
    // never starve the timer-sensitive coordinator/auth-ready tests and flake them.
    exclude: [...configDefaults.exclude, "**/build-deploy-associations.test.ts"],
    // Native CI has no local .env; provide non-secret placeholders so createClient
    // can boot during suite collection. Real device/CI builds use production env.
    env: {
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PROJECT_ID: "example",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-anon-key",
      VITE_STORE_API_BASE_URL: "http://localhost:4000/api",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
