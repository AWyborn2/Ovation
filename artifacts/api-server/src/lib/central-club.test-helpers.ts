import { isNotNull } from "drizzle-orm";

/**
 * Find a real folded/renamed row in `central.clubs` (`active_to` set) for
 * tests that assert the provisioning guard rejects it. Returns null when this
 * deployment's central DB happens to carry none, so callers can skip cleanly
 * rather than asserting against data the environment doesn't have.
 */
export async function findFoldedCentralClub(): Promise<{
  clubId: number;
  name: string | null;
} | null> {
  const { centralDb, centralClubsTable } = await import("@workspace/db/central");
  const [folded] = await centralDb
    .select({ clubId: centralClubsTable.clubId, name: centralClubsTable.name })
    .from(centralClubsTable)
    .where(isNotNull(centralClubsTable.activeTo))
    .limit(1);
  return folded ?? null;
}
