import { defineConfig } from "drizzle-kit";
import path from "path";

/**
 * CI-ONLY drizzle-kit config for the `central` schema.
 *
 * The real central PCA database is external and read-only; the app never
 * migrates it. This config exists so a throwaway CI Postgres can be given an
 * empty `central` schema matching `src/central-schema/*` (via `push-central`),
 * which the fixture seeder then fills with a handful of rows so the
 * provisioning and central-read suites can run without a live Supabase secret.
 *
 * Guarded so it can never be pointed at anything but a local database.
 */
const url = process.env.CENTRAL_DATABASE_URL;
if (!url) {
  throw new Error("CENTRAL_DATABASE_URL must be set (local CI database only)");
}
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1", "postgres"].includes(host)) {
  throw new Error(
    `Refusing to push the central schema to non-local host "${host}". ` +
      "The real central database is read-only and never migrated by the app.",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/central-schema/index.ts"),
  dialect: "postgresql",
  schemaFilter: ["central"],
  dbCredentials: { url },
});
