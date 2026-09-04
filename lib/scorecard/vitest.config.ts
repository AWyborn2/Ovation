import { defineConfig } from "vitest/config";

// Unit tests only: both databases are mocked in every suite here, so no
// DATABASE_URL / CENTRAL_DATABASE_URL is needed.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
