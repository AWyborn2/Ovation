import { randomUUID } from "node:crypto";
import { eq, lt, max, sql } from "drizzle-orm";
import type { Db } from "./index";
import { playerIdMapTable } from "./schema/player_id_map";
import { playerCurationTable } from "./schema/player_curation";
import { playersTable } from "./schema/players";

/**
 * The per-tenant player id sequence (hybrid stats plan KTD3), shared by the
 * central crosswalk mint (`mintPlayerIdMap` in ./provision) and the synthetic
 * pre-digital players a club history import creates (U11).
 *
 * This module never imports ./index at runtime (only its types), so it can be
 * used from ./provision and from the api-server without a cycle, and never
 * touches the central database.
 */

/**
 * Minted player ids stay strictly below this: ids >= 90000 are the native
 * fill-in (90001+) and cap-only (95001+) ranges, excluded from every derivation.
 */
export const MINT_ID_CEILING = 90000;

/**
 * Halls Head: the tenant whose player ids are its native `players.id`s, so
 * anything minted for it starts above the highest native id.
 */
const NATIVE_STATS_TENANT_ID = 1;

/**
 * Participant-key prefix of a synthetic (pre-digital-only) player: a club-local
 * `club:<uuid>` that can never collide with a PlayHQ GUID and is never looked
 * up in central (see player_id_map.ts).
 */
export const SYNTHETIC_PARTICIPANT_PREFIX = "club:";

/** True for a synthetic pre-digital player's participant key. */
export function isSyntheticParticipantKey(participantId: string): boolean {
  return participantId.startsWith(SYNTHETIC_PARTICIPANT_PREFIX);
}

/** A fresh synthetic participant key: `club:` + a lower-case v4 UUID. */
export function newSyntheticParticipantKey(): string {
  return `${SYNTHETIC_PARTICIPANT_PREFIX}${randomUUID().toLowerCase()}`;
}

/** First key of the two-key advisory lock that serialises a tenant's mints. */
const MINT_LOCK_KEY = 7_311_901;

/** Anything that can run tenant-DB reads (the shared `db` or a transaction). */
type Reader = Pick<Db, "select">;

/**
 * The highest id already used in a tenant's player space below the ceiling —
 * the next minted id is this + 1. `existingIds` are the tenant's crosswalk ids;
 * for Halls Head the highest native `players.id` below the ceiling counts too,
 * so a minted id never collides with a native one.
 */
export async function mintFloor(
  executor: Reader,
  tenantId: number,
  existingIds: readonly number[],
): Promise<number> {
  let floor = existingIds.reduce((m, id) => (id < MINT_ID_CEILING ? Math.max(m, id) : m), 0);
  if (tenantId === NATIVE_STATS_TENANT_ID) {
    const [row] = await executor
      .select({ maxId: max(playersTable.id) })
      .from(playersTable)
      .where(lt(playersTable.id, MINT_ID_CEILING));
    floor = Math.max(floor, Number(row?.maxId ?? 0));
  }
  return floor;
}

/** The error a mint that would reach the fill-in range throws (nothing is written). */
export class MintCeilingError extends Error {
  constructor(tenantId: number, wouldMint: number) {
    super(
      `Tenant ${tenantId} would mint player id ${wouldMint}, at or above ${MINT_ID_CEILING} ` +
        `(the fill-in / cap-only range). Nothing was minted.`,
    );
    this.name = "MintCeilingError";
  }
}

export interface SyntheticPlayer {
  participantId: string;
  playerId: number;
  displayName: string;
}

/**
 * Mint one synthetic pre-digital player per name for a tenant (hybrid stats
 * plan U11, KTD3): a `player_id_map` row keyed `club:<uuid>` with the next id in
 * the tenant's sequence, plus a `player_curation` row carrying the display name
 * (the overlay names history-only players from curation). Same guards as the
 * crosswalk mint: ids stay below {@link MINT_ID_CEILING}, and Halls Head's
 * start above its highest native id. Never assigns a fill-in range id.
 *
 * Pass a transaction handle so the players roll back with the caller's writes.
 * Serialised per tenant with a transaction-scoped advisory lock, so two
 * concurrent imports can't pick the same next id.
 */
export async function mintSyntheticPlayers(
  executor: Pick<Db, "select" | "insert" | "execute">,
  tenantId: number,
  names: readonly string[],
): Promise<SyntheticPlayer[]> {
  if (names.length === 0) return [];
  await executor.execute(sql`select pg_advisory_xact_lock(${MINT_LOCK_KEY}, ${tenantId})`);
  const existing = await executor
    .select({ playerId: playerIdMapTable.playerId })
    .from(playerIdMapTable)
    .where(eq(playerIdMapTable.tenantId, tenantId));
  const floor = await mintFloor(
    executor,
    tenantId,
    existing.map((e) => e.playerId),
  );
  const last = floor + names.length;
  if (last >= MINT_ID_CEILING) throw new MintCeilingError(tenantId, last);

  const players = names.map((displayName, i) => ({
    participantId: newSyntheticParticipantKey(),
    playerId: floor + 1 + i,
    displayName,
  }));
  await executor
    .insert(playerIdMapTable)
    .values(
      players.map((p) => ({ tenantId, participantId: p.participantId, playerId: p.playerId })),
    );
  await executor.insert(playerCurationTable).values(
    players.map((p) => ({
      tenantId,
      participantId: p.participantId,
      overrideDisplayName: p.displayName,
    })),
  );
  return players;
}
