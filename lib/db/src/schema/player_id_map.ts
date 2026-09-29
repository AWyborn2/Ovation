import { pgTable, serial, integer, text, uniqueIndex } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

/**
 * Player identity crosswalk for central-backed tenants (white-label Phase 1).
 *
 * The central PCA database keys players by PlayHQ `participant_id` (a GUID), but
 * the app's player routes/DTOs/links use integer ids. This table bridges the two
 * PER TENANT: each central participant a tenant's club fields gets a stable
 * integer `playerId` minted for that tenant, so central reads can present int ids
 * and the existing `/players/:id` contract is unchanged.
 *
 * Central-backed tenants (e.g. Mandurah) get a minted per-tenant sequence
 * (`mintPlayerIdMap`). Halls Head (tenant #1) is different: its player ids are
 * its native `players.id`s, so its rows map each player's KEEPER GUID onto the
 * existing native id (written by scripts/src/persist-hh-crosswalk.ts from
 * scorecard evidence), keeping every vote, cap, photo and honour link valid.
 * Anything minted for tenant 1 starts above the highest native id.
 *
 * Invariants: the map is 1:1 per tenant (both unique indexes below). A split
 * identity keeps ONE row — for its keeper GUID; every other GUID is folded into
 * the keeper via `player_curation.merged_into_participant_id`, and minting
 * never issues a fresh id to a merged-away GUID. No id is ever minted at or
 * above 90000 (the fill-in / cap-only ranges). Lookups always include
 * `tenant_id`, so per-tenant int ranges may overlap harmlessly.
 */
export const playerIdMapTable = pgTable(
  "player_id_map",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    /** Central PlayHQ participant GUID. */
    participantId: text("participant_id").notNull(),
    /** App-facing integer player id for this tenant. */
    playerId: integer("player_id").notNull(),
  },
  (t) => ({
    uniqTenantParticipant: uniqueIndex("player_id_map_tenant_participant_uq").on(
      t.tenantId,
      t.participantId,
    ),
    uniqTenantPlayer: uniqueIndex("player_id_map_tenant_player_uq").on(t.tenantId, t.playerId),
  }),
);

export type PlayerIdMapRow = typeof playerIdMapTable.$inferSelect;
