import { sql } from "drizzle-orm";
import type { db } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Halls Head — the only tenant whose curated player ids are native
 * `players.id`s (`NATIVE_STATS_TENANT_ID` in ./tenant; repeated here so this
 * module stays free of the tenant-config import chain and can be used from
 * the rollback helpers).
 */
const NATIVE_TENANT_ID = 1;

/** Curated tables whose player link was `ON DELETE SET NULL`. */
const SET_NULL_TABLES = [
  "award_winners",
  "life_members",
  "team_of_decade_members",
  "cap_register",
  "club_roles",
  "premiership_players",
  "centuries",
  "five_wicket_hauls",
  // Season shirt numbers never had an FK; unlinking makes the entry "held"
  // again rather than losing the club's number record.
  "shirt_numbers",
] as const;

/** Curated tables whose rows were `ON DELETE CASCADE`d with the player. */
const CASCADE_TABLES = ["honour_board_overrides", "player_images"] as const;

/**
 * What the curated tables' foreign keys to `players` did when a native player
 * row was deleted, now that migration 0020 has dropped them (hybrid stats plan
 * U8, KTD3) — scoped to Halls Head, the only tenant whose curated ids are
 * native `players.id`s. Another tenant's row carrying the same integer is that
 * club's OWN crosswalk player and is left alone.
 *
 * Mirrors the old FKs exactly: award winners, life members, Team of the Decade
 * members, caps, club roles, premiership players, centuries and five-fors are
 * unlinked (SET NULL), as are season shirt-number entries (which never had an
 * FK; unlinked they are simply held again); honour-board overrides, player photos and award ballots
 * picking the player (on a Halls Head award) are deleted (CASCADE). Run it in
 * the same transaction as the delete. A merge does NOT use this — it moves the
 * links to the keeper instead (`reassignMergedNativePlayer`, below).
 */
export async function detachDeletedNativePlayers(tx: Tx, playerIds: number[]): Promise<void> {
  if (playerIds.length === 0) return;
  const ids = sql.join(
    playerIds.map((id) => sql`${id}`),
    sql`, `,
  );
  await tx.execute(sql`
    UPDATE award_winners SET
      player_ids = ARRAY(SELECT p FROM unnest(player_ids) p WHERE p NOT IN (${ids})),
      player_id = (ARRAY(SELECT p FROM unnest(player_ids) p WHERE p NOT IN (${ids})))[1]
    WHERE tenant_id = ${NATIVE_TENANT_ID} AND player_ids IS NOT NULL
  `);
  for (const table of SET_NULL_TABLES) {
    await tx.execute(sql`
      UPDATE ${sql.identifier(table)} SET player_id = NULL
      WHERE tenant_id = ${NATIVE_TENANT_ID} AND player_id IN (${ids})
    `);
  }
  for (const table of CASCADE_TABLES) {
    await tx.execute(sql`
      DELETE FROM ${sql.identifier(table)}
      WHERE tenant_id = ${NATIVE_TENANT_ID} AND player_id IN (${ids})
    `);
  }
  // Ballots carry no tenant_id; their tenant is the voting config's award's.
  await tx.execute(sql`
    DELETE FROM award_ballots b
    USING award_voting_config c
    JOIN awards a ON a.id = c.award_id
    WHERE b.config_id = c.id
      AND a.tenant_id = ${NATIVE_TENANT_ID}
      AND (b.pick1_player_id IN (${ids}) OR b.pick2_player_id IN (${ids}) OR b.pick3_player_id IN (${ids}))
  `);
}

/** Curated tables whose Halls Head player link simply follows the keeper. */
const MOVE_TABLES = [...SET_NULL_TABLES, "player_images"] as const;

/**
 * Tables with a unique index that includes `player_id`: a row on the
 * merged-away player that would collide with one the keeper already has is
 * dropped (the keeper's row wins), the rest move. `scope` lists the other
 * columns of the unique index.
 */
const DEDUPE_TABLES = [
  { table: "honour_board_overrides", scope: ["tenant_id", "board_key"] },
  { table: "club_photo_players", scope: ["photo_id"] },
  // One shirt-number entry per player per season: the keeper's number wins.
  { table: "shirt_numbers", scope: ["tenant_id", "season"] },
] as const;

/** Rows dropped because the keeper already had the same link. */
export type MergeDedupeSummary = Partial<Record<(typeof DEDUPE_TABLES)[number]["table"], number>>;

/**
 * A native player merge (`POST /players/:id/merge`): Halls Head's curated links
 * on the merged-away player MOVE to the keeper rather than being cleared (owner
 * decision, 30 Sep 2026) — award winners, life members, Team of the Decade
 * members, caps, club roles, premiership players, centuries, five-fors, player
 * photos, honour-board overrides, library photo tags, season shirt-number
 * entries and award-ballot picks.
 *
 * Tenant 1 rows only: another tenant's row carrying the same integer is that
 * club's own crosswalk player (the U8 invariant). Where a unique index would
 * collide the keeper's existing row is kept and the duplicate dropped, so the
 * merge never fails; the dropped counts are returned for logging. A moved
 * gallery photo stops being the default when the keeper already has one. Run
 * it in the merge's transaction, before the duplicate `players` row is deleted.
 */
export async function reassignMergedNativePlayer(
  tx: Tx,
  duplicateId: number,
  keeperId: number,
): Promise<MergeDedupeSummary> {
  const deduped: MergeDedupeSummary = {};
  await tx.execute(sql`
    UPDATE award_winners SET
      player_ids = (SELECT array_agg(p ORDER BY first_position) FROM (
        SELECT CASE WHEN p = ${duplicateId} THEN ${keeperId} ELSE p END AS p, min(pos) AS first_position
        FROM unnest(player_ids) WITH ORDINALITY AS links(p, pos)
        GROUP BY 1
      ) ordered_links)
    WHERE tenant_id = ${NATIVE_TENANT_ID} AND ${duplicateId} = ANY(player_ids)
  `);
  for (const { table, scope } of DEDUPE_TABLES) {
    const sameScope = sql.join(
      scope.map((col) => sql`k.${sql.identifier(col)} = d.${sql.identifier(col)}`),
      sql` AND `,
    );
    const dropped = await tx.execute(sql`
      DELETE FROM ${sql.identifier(table)} d
      USING ${sql.identifier(table)} k
      WHERE d.tenant_id = ${NATIVE_TENANT_ID} AND d.player_id = ${duplicateId}
        AND k.tenant_id = ${NATIVE_TENANT_ID} AND k.player_id = ${keeperId}
        AND ${sameScope}
    `);
    if (dropped.rowCount) deduped[table] = dropped.rowCount;
    await tx.execute(sql`
      UPDATE ${sql.identifier(table)} SET player_id = ${keeperId}
      WHERE tenant_id = ${NATIVE_TENANT_ID} AND player_id = ${duplicateId}
    `);
  }

  // One default gallery photo per player: the keeper's stays the default.
  await tx.execute(sql`
    UPDATE player_images SET is_default = false
    WHERE tenant_id = ${NATIVE_TENANT_ID} AND player_id = ${duplicateId} AND is_default
      AND EXISTS (
        SELECT 1 FROM player_images k
        WHERE k.tenant_id = ${NATIVE_TENANT_ID} AND k.player_id = ${keeperId} AND k.is_default
      )
  `);
  for (const table of MOVE_TABLES) {
    await tx.execute(sql`
      UPDATE ${sql.identifier(table)} SET player_id = ${keeperId}
      WHERE tenant_id = ${NATIVE_TENANT_ID} AND player_id = ${duplicateId}
    `);
  }

  // players.image_url mirrors the default photo; fill it if the keeper had none.
  await tx.execute(sql`
    UPDATE players p SET image_url = i.image_url
    FROM player_images i
    WHERE p.id = ${keeperId} AND p.image_url IS NULL
      AND i.tenant_id = ${NATIVE_TENANT_ID} AND i.player_id = ${keeperId} AND i.is_default
  `);

  // Ballot picks on a Halls Head award (ballots carry no tenant_id).
  for (const pick of ["pick1_player_id", "pick2_player_id", "pick3_player_id"] as const) {
    await tx.execute(sql`
      UPDATE award_ballots b SET ${sql.identifier(pick)} = ${keeperId}
      FROM award_voting_config c
      JOIN awards a ON a.id = c.award_id
      WHERE b.config_id = c.id
        AND a.tenant_id = ${NATIVE_TENANT_ID}
        AND b.${sql.identifier(pick)} = ${duplicateId}
    `);
  }
  return deduped;
}
