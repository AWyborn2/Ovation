import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

/**
 * Tenant-database schema config. Migrations are generated into `./migrations`
 * with `pnpm --filter @workspace/db run generate` and applied with `run migrate`
 * (src/migrate.ts). `push` remains for local experiments only: it introspects
 * the live database and drizzle-kit 0.31 cannot see NULLS NOT DISTINCT /
 * partial uniques, so it re-proposes them (plan.md §5.4).
 */
export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
