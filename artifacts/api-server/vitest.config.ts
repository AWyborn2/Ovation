import { defineConfig } from "vitest/config";

// Data-dependent suites validate the club's real curated stats data and cannot
// pass against a fresh, empty CI database. Excluded in CI via CI_SKIP_DATA_TESTS;
// they still run locally against a populated DB. The provisioning suites and
// the batch-import preview are NOT here any more: CI seeds a small `central`
// fixture (seed-ci-central-fixture.ts) and the xlsx fixtures live in
// src/test/fixtures, so they run everywhere. Likewise award-voting, historical,
// imports-backfill, juniors-office-bearers and player-images seed what they need.
const DATA_DEPENDENT = [
  "src/routes/*-consistency.test.ts",
  "src/routes/honour-display-kiosk.test.ts",
];
const skipData = !!process.env.CI_SKIP_DATA_TESTS;

export default defineConfig({
  resolve: { conditions: ["workspace"] },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", ...(skipData ? DATA_DEPENDENT : [])],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
