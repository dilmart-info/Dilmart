import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import viteCapacitorFix from "./vite-capacitor-fix.js";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/',
  plugins: [react(), viteCapacitorFix()],
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
    modulePreload: false,
    minify: true,
    // No manualChunks. Bucketing node_modules by name split packages away from the
    // dependencies they evaluate against: react-router and @tanstack/react-query landed
    // in a "vendor-react" chunk while @remix-run/router and @tanstack/query-core landed
    // in "vendor", and everything in "vendor" imports react back out of "vendor-react".
    // That mutual import is a chunk cycle, and ES modules evaluate a cycle depth-first:
    // "vendor" ran to completion before "vendor-react" had initialised its exports, so
    // lucide-react's top-level React.forwardRef call read undefined and the whole bundle
    // died before the first render — a black screen in production.
    // Rollup derives chunk boundaries from the real module graph and does not produce
    // cycles, so the split is left to it.
  }
}));

