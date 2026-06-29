/**
 * CI / fresh-database seed: guarantee tenant #1 (Halls Head, the demo/default)
 * exists.
 *
 * On a developer's or production database tenant 1 has existed since the app was
 * single-tenant, so nothing in the app creates it at runtime. But a CI database
 * built fresh from `drizzle-kit push` is empty, and the api-server integration
 * tests assume tenant 1 is present (they send `x-tenant-id: 1` and read its
 * data). This script makes CI faithful to that assumption.
 *
 * It is idempotent: if tenant 1 already exists it does nothing. It forces
 * `id = 1` explicitly (the column is a serial) and bumps the identity sequence
 * past 1 so later auto-assigned tenants don't collide.
 *
 * Deliberately does NOT touch the central DB — it inserts a minimal native row
 * only, so CI needs just DATABASE_URL, not CENTRAL_DATABASE_URL.
 *
 * Run:  tsx src/maintenance/seed-ci-tenant.ts   (with DATABASE_URL set)
 */
import { sql } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";

async function main(): Promise<void> {
  const existing = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(sql`${tenantsTable.id} = 1`)
    .limit(1);

  if (existing.length > 0) {
    console.log("[seed-ci-tenant] tenant #1 already present — nothing to do.");
    return;
  }

  await db.execute(sql`
    INSERT INTO tenants (id, slug, central_club_id, name, plan)
    VALUES (1, 'halls-head', 1, 'Halls Head Cricket Club', 'free')
    ON CONFLICT (id) DO NOTHING
  `);

  // Keep the serial sequence ahead of the forced id so future inserts don't reuse 1.
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('tenants', 'id'), GREATEST((SELECT MAX(id) FROM tenants), 1))`,
  );

  console.log("[seed-ci-tenant] seeded tenant #1 (Halls Head).");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-ci-tenant] failed:", err);
    process.exit(1);
  });
