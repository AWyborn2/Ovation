import {
  pgTable,
  serial,
  integer,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
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
 * Only central-backed tenants are populated (e.g. Mandurah). Halls Head (tenant
 * #1) keeps its own curated `players` rows and is never mapped here. Ints are a
 * per-tenant sequence; lookups always include `tenant_id`, so per-tenant int
 * ranges may overlap harmlessly.
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
    uniqTenantPlayer: uniqueIndex("player_id_map_tenant_player_uq").on(
      t.tenantId,
      t.playerId,
    ),
  }),
);

export type PlayerIdMapRow = typeof playerIdMapTable.$inferSelect;
