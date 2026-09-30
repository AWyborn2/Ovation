import { and, eq, inArray } from "drizzle-orm";
import { db, playersTable, playerIdMapTable } from "@workspace/db";
import { NATIVE_STATS_TENANT_ID, tenantIsCentral } from "./tenant";

/**
 * The per-tenant player id space for curated content (hybrid stats plan U8,
 * R16, KTD3).
 *
 * Curated tables (awards, ballots, life members, Team of the Decade, caps, club
 * roles, honour-board overrides, player photos, premiership team lists,
 * centuries / five-fors) carry a bare integer `player_id` — no FK to the native
 * `players` table. The id means "this TENANT's player":
 *
 *   - every tenant's ids are its crosswalk ints (`player_id_map`), with
 *     confirmed merges folded on read (U6);
 *   - Halls Head (tenant 1) seeded its crosswalk so each keeper GUID maps to its
 *     existing native `players.id`, so every Halls Head link keeps its value.
 *     While it still reads native it may ALSO link a native id that has no
 *     crosswalk row (a player the crosswalk never matched); once it reads
 *     central, only crosswalk ids.
 *
 * Central tenants' crosswalk ids start at 1 and overlap native Halls Head ids,
 * so an unchecked write could point another club's award at a Halls Head
 * player (and, with the old FK, be "validated" by it). Every route that writes
 * a player id into a curated table goes through {@link assertPlayerInTenantSpace}.
 * Deleting a native player clears Halls Head's links the way the dropped FKs
 * did: see `detachDeletedNativePlayers` in ./curated-player-detach.ts.
 */

/** A player id a tenant tried to link that is not in its id space. */
export class PlayerOutsideTenantSpaceError extends Error {
  readonly status = 422;
  constructor(
    readonly tenantId: number,
    readonly playerIds: number[],
  ) {
    super(
      `Player ${playerIds.length === 1 ? "id" : "ids"} ${playerIds.join(", ")} ` +
        `${playerIds.length === 1 ? "is" : "are"} not one of this club's players.`,
    );
    this.name = "PlayerOutsideTenantSpaceError";
  }
}

/**
 * Whether a tenant's curated player ids are native `players.id`s: tenant 1
 * while it reads native. Uses the raw `reads_from_central` flag, like the
 * native write fence — the `CENTRAL_READS=0` incident kill-switch must never
 * turn a cut-over Halls Head's crosswalk ids back into native ones.
 */
export async function curatedIdsAreNative(tenantId: number): Promise<boolean> {
  return tenantId === NATIVE_STATS_TENANT_ID && !(await tenantIsCentral(tenantId));
}

type MaybeId = number | null | undefined;

/** The ids in `playerIds` that are NOT in the tenant's player id space. */
export async function playersOutsideTenantSpace(
  tenantId: number,
  playerIds: readonly MaybeId[],
): Promise<number[]> {
  const ids = [...new Set(playerIds.filter((id): id is number => id != null))];
  if (ids.length === 0) return [];

  const known = new Set<number>();
  const crosswalk = await db
    .select({ id: playerIdMapTable.playerId })
    .from(playerIdMapTable)
    .where(and(eq(playerIdMapTable.tenantId, tenantId), inArray(playerIdMapTable.playerId, ids)));
  for (const r of crosswalk) known.add(r.id);

  const rest = ids.filter((id) => !known.has(id));
  if (rest.length > 0 && (await curatedIdsAreNative(tenantId))) {
    const nativeRows = await db
      .select({ id: playersTable.id })
      .from(playersTable)
      .where(inArray(playersTable.id, rest));
    for (const r of nativeRows) known.add(r.id);
  }
  return ids.filter((id) => !known.has(id));
}

/**
 * The single write-side check for curated player links. Null / undefined ids
 * (an unlinked row) always pass. Throws {@link PlayerOutsideTenantSpaceError}
 * (422, surfaced by the app error handler) naming every id outside the space.
 */
export async function assertPlayerInTenantSpace(
  tenantId: number,
  playerId: MaybeId | readonly MaybeId[],
): Promise<void> {
  const ids: readonly MaybeId[] = Array.isArray(playerId)
    ? (playerId as readonly MaybeId[])
    : [playerId as MaybeId];
  const outside = await playersOutsideTenantSpace(tenantId, ids);
  if (outside.length > 0) throw new PlayerOutsideTenantSpaceError(tenantId, outside);
}
