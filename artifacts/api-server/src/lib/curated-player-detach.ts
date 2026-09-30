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
 * unlinked (SET NULL); honour-board overrides, player photos and award ballots
 * picking the player (on a Halls Head award) are deleted (CASCADE). Run it in
 * the same transaction as the delete.
 */
export async function detachDeletedNativePlayers(tx: Tx, playerIds: number[]): Promise<void> {
  if (playerIds.length === 0) return;
  const ids = sql.join(
    playerIds.map((id) => sql`${id}`),
    sql`, `,
  );
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
