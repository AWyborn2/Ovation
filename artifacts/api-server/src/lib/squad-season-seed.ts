import { eq, sql } from "drizzle-orm";
import {
  availabilitySettingsTable,
  db,
  markSquadSeasonSeeded,
  seedCurrentSeasonSquad,
  squadMembersTable,
} from "@workspace/db";
import { seasonStartYearFor } from "@workspace/db/seasons";
import { env } from "../config";
import { logger as defaultLogger } from "./logger";
import { tenantCentralClubIdOrNull } from "./tenant";

/**
 * The squad register from this season's games, outside provisioning: the
 * admin's "Add this season's players" button and the scheduled sweep's hourly
 * top-up of an empty register. Both reuse provisioning's seed
 * (`seedCurrentSeasonSquad` over `centralCurrentSeasonSquad`, in `@workspace/db`):
 * same players, same names, same sections, same dedupe. This module only adds
 * the tenant lock, the `availability_settings.season_seeded_at` marker and the
 * "only while empty" rule.
 *
 * Provisioning sets the marker itself when its seed added someone, so the
 * hourly top-up only ever runs for a club that had no games yet when it signed
 * up (or that central couldn't be read for). The marker matters only for an
 * empty register: a club that empties its list on purpose is not refilled.
 */

export type SeasonSeedResult = {
  /** Members added. */
  added: number;
  /** This season's players already in the register. */
  skipped: number;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** This season's players for the tenant's central club. Empty when central is off or unlinked. */
async function seasonPlayers(tenantId: number, now: Date) {
  if (env.centralReadsDisabled()) return [];
  const clubId = await tenantCentralClubIdOrNull(tenantId);
  if (clubId === null) return [];
  const { centralCurrentSeasonSquad } = await import("@workspace/db/central-queries");
  return centralCurrentSeasonSquad(clubId, seasonStartYearFor(now));
}

/**
 * Serialise with the participant import and manual additions, which take the
 * same per-tenant lock.
 */
async function lockTenantSquad(tx: Tx, tenantId: number): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(72401, ${tenantId})`);
}

async function seedLocked(
  tx: Tx,
  tenantId: number,
  players: Awaited<ReturnType<typeof seasonPlayers>>,
  now: Date,
): Promise<SeasonSeedResult> {
  const added = await seedCurrentSeasonSquad(tx, tenantId, players);
  if (added > 0) await markSquadSeasonSeeded(tx, tenantId, now);
  return { added, skipped: players.length - added };
}

/**
 * Add everyone who has played for the club this season and isn't in the
 * register yet (the admin button). Idempotent; existing members are never
 * changed. Runs whether or not the register was seeded before.
 */
export async function seedSquadFromSeason(
  tenantId: number,
  now: Date = new Date(),
): Promise<SeasonSeedResult> {
  const players = await seasonPlayers(tenantId, now);
  return db.transaction(async (tx: Tx) => {
    await lockTenantSquad(tx, tenantId);
    return seedLocked(tx, tenantId, players, now);
  });
}

/**
 * The hourly top-up: seed only while the register is empty and was never
 * seeded. The marker is set only when someone was added, so a club with no
 * games yet is tried again next hour. Best effort: never throws. Null when it
 * did not run.
 */
export async function autoSeedSquadIfEmpty(
  tenantId: number,
  now: Date = new Date(),
  logger: Pick<typeof defaultLogger, "info" | "warn"> = defaultLogger,
): Promise<SeasonSeedResult | null> {
  try {
    const due = async (reader: Pick<typeof db, "select">) => {
      const [settings] = await reader
        .select({ seededAt: availabilitySettingsTable.seasonSeededAt })
        .from(availabilitySettingsTable)
        .where(eq(availabilitySettingsTable.tenantId, tenantId));
      if (settings?.seededAt) return false;
      const [member] = await reader
        .select({ id: squadMembersTable.id })
        .from(squadMembersTable)
        .where(eq(squadMembersTable.tenantId, tenantId))
        .limit(1);
      return !member;
    };
    if (!(await due(db))) return null;
    const players = await seasonPlayers(tenantId, now);
    if (players.length === 0) return { added: 0, skipped: 0 };
    const result = await db.transaction(async (tx: Tx) => {
      await lockTenantSquad(tx, tenantId);
      if (!(await due(tx))) return null;
      return seedLocked(tx, tenantId, players, now);
    });
    if (result?.added) logger.info({ tenantId, ...result }, "squad seeded from this season");
    return result;
  } catch (err) {
    logger.warn({ err, tenantId }, "squad season seed failed");
    return null;
  }
}
