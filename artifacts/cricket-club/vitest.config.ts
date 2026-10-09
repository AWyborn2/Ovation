import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Smoke-test runner config. Kept separate from vite.config.ts because the app's
// build config requires PORT/BASE_PATH env vars and pulls in Replit-only plugins
// that aren't needed (and don't work) under jsdom.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    // Same as vite.config.ts: web and Expo use different React peer contexts, so the
    // shared API hooks must resolve this app's React Query (and React) instance.
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
