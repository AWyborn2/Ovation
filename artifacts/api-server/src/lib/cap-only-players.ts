import { and, eq, gte, inArray } from "drizzle-orm";
import { db, playersTable, type Player } from "@workspace/db";

/**
 * Cap-only players (Halls Head pre-cut-over fix, 1 Oct 2026).
 *
 * A cap-only player is a native `players` row with `is_cap_only = true` and an
 * id in the fill-in range (master ids from 95001): someone who earned an A
 * Grade cap before the club kept stats for players with fewer than 10 games.
 * They have a name and a cap number and NO stats, ever.
 *
 * Halls Head's cap register links caps to these ids, and the cap register page
 * links each to `/players/<id>`. While tenant 1 reads native that page is the
 * native row. After cut-over players resolve through the crosswalk, and ids >=
 * 90000 are never in the crosswalk (they are excluded from every stat
 * derivation) — so without this the cap would resolve to nobody.
 *
 * The rule: for the tenant that owns the native `players` table, a cap-only
 * native row is a VALID PLAYER WITH NO STATS. It is a player for curated links
 * (the cap register, `assertPlayerInTenantSpace`) and for the player page, and
 * it is still left out of every stat derivation, leaderboard, directory and
 * count — it has no GUID, no crosswalk row and no overlay key.
 *
 * Only tenant 1: the native `players` table has no tenant_id and holds only
 * Halls Head's people. Another club's id 95001 is never one of these.
 */

/** The tenant the native `players` table belongs to (tenant.ts NATIVE_STATS_TENANT_ID). */
export const NATIVE_PLAYERS_TENANT_ID = 1;

/** Cap-only ids live in the fill-in range (>= 90000), so they can never be a crosswalk id. */
export const CAP_ONLY_ID_FLOOR = 90000;

/** True for a native row that is a cap-only player (and not a fill-in). */
export function isCapOnlyRow(p: Pick<Player, "id" | "isCapOnly" | "isFillIn">): boolean {
  return p.isCapOnly === true && p.isFillIn !== true && p.id >= CAP_ONLY_ID_FLOOR;
}

type Reader = Pick<typeof db, "select">;

/**
 * A tenant's cap-only players: the native rows for tenant 1, nothing for any
 * other tenant. Pass `ids` to look up only those. `reader` lets the cut-over
 * preview load them inside its READ ONLY transaction.
 */
export async function loadCapOnlyPlayers(
  tenantId: number,
  reader: Reader = db,
  ids?: readonly number[],
): Promise<Player[]> {
  if (tenantId !== NATIVE_PLAYERS_TENANT_ID) return [];
  const wanted = ids?.filter((id) => id >= CAP_ONLY_ID_FLOOR);
  if (wanted && wanted.length === 0) return [];
  const rows = await reader
    .select()
    .from(playersTable)
    .where(
      and(
        eq(playersTable.isCapOnly, true),
        eq(playersTable.isFillIn, false),
        gte(playersTable.id, CAP_ONLY_ID_FLOOR),
        wanted ? inArray(playersTable.id, wanted) : undefined,
      ),
    );
  return rows.filter(isCapOnlyRow);
}
