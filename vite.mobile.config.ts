import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";
import viteCapacitorFix from "./vite-capacitor-fix.js";
import { mobileBoundaryPlugin } from "./scripts/mobile/mobile-boundary-plugin.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Independent Capacitor customer build → dist-mobile (never shares Web entry graph).
export default defineConfig(({ mode }) => ({
  base: "/",
  root: rootDir,
  publicDir: "public",
  plugins: [react(), viteCapacitorFix(), mobileBoundaryPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  build: {
    outDir: "dist-mobile",
    emptyOutDir: true,
    manifest: true,
    chunkSizeWarningLimit: 2000,
    modulePreload: false,
    minify: true,
    rollupOptions: {
      input: path.resolve(rootDir, "index.mobile.html"),
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/") ||
            id.includes("node_modules/react-router") ||
            id.includes("node_modules/@tanstack/react-query")
          ) {
            return "vendor-react";
          }
          if (id.includes("node_modules/@radix-ui")) return "vendor-radix";
          if (id.includes("node_modules")) return "vendor";
          return undefined;
        },
      },
    },
  },
}));
