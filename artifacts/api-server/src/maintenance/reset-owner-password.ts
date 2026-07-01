/**
 * One-off test helper: set the Halls Head (tenant #1) "owner" admin password to
 * a known value so a human can log in to the club admin console during testing.
 *
 * Creates the owner row if it doesn't exist yet (tenant 1, username "owner").
 * Reads the desired password from RESET_OWNER_PASSWORD.
 *
 * Run:  RESET_OWNER_PASSWORD=... tsx src/maintenance/reset-owner-password.ts
 *       (with DATABASE_URL set)
 *
 * NOT part of normal operation — delete or ignore after testing.
 */
import { and, eq } from "drizzle-orm";
import { db, adminsTable } from "@workspace/db";
import { hashPassword } from "../lib/auth";

const TENANT_ID = 1;
const USERNAME = "owner";

async function main(): Promise<void> {
  const plain = process.env["RESET_OWNER_PASSWORD"];
  if (!plain) {
    console.error("[reset-owner] RESET_OWNER_PASSWORD not set — nothing to do.");
    process.exit(1);
  }
  const passwordHash = await hashPassword(plain);

  const existing = await db
    .select({ id: adminsTable.id })
    .from(adminsTable)
    .where(and(eq(adminsTable.tenantId, TENANT_ID), eq(adminsTable.username, USERNAME)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(adminsTable)
      .set({ passwordHash })
      .where(and(eq(adminsTable.tenantId, TENANT_ID), eq(adminsTable.username, USERNAME)));
    console.log(`[reset-owner] updated password for tenant ${TENANT_ID} / ${USERNAME}.`);
  } else {
    await db.insert(adminsTable).values({
      tenantId: TENANT_ID,
      username: USERNAME,
      displayName: "Owner",
      passwordHash,
    });
    console.log(`[reset-owner] created admin tenant ${TENANT_ID} / ${USERNAME}.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[reset-owner] failed:", err);
    process.exit(1);
  });
