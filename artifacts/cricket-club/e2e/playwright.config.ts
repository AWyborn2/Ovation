import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the Social-studio smoke test.
 *
 * Runs against an ALREADY-RUNNING instance (Replit dev URL or a local run) —
 * it does NOT boot the app itself, because the web dev server needs PORT/BASE_PATH
 * from the Replit "Project" workflow. Start the app (Run button) first, then:
 *
 *   BASE_URL=https://<your-repl>.replit.dev \
 *   ADMIN_EMAIL=you@club.com ADMIN_PASSWORD=... \
 *   pnpm --filter @workspace/cricket-club exec playwright test -c e2e/playwright.config.ts
 *
 * Chromium is pre-installed on this platform (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers);
 * do NOT run `playwright install`.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.smoke.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "e2e/report", open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
