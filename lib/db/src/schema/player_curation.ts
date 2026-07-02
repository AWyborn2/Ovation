import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

/**
 * Per-tenant curation overlay for CENTRAL players.
 *
 * Central data is READ-ONLY (keyed by PlayHQ participant GUID and stored as
 * "Initial Surname"), so clubs can't fix identity in the source. This app-side,
 * tenant-scoped overlay lets a club correct how a central player appears on
 * THEIR site without ever writing to central:
 *
 *   - rename: `overrideDisplayName` replaces the central "M Brown" with a real
 *     name for this tenant only.
 *   - merge:  `mergedIntoParticipantId` points a duplicate GUID at a keeper GUID
 *     so their stats and profile present as one player.
 *
 * Keyed uniquely on (tenant_id, participant_id): one curation row per central
 * player per tenant. Never blends across tenants.
 */
export const playerCurationTable = pgTable(
  "player_curation",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    /** Central PlayHQ participant GUID this curation applies to. */
    participantId: text("participant_id").notNull(),
    /** Rename: shown instead of the central display name. Null = no override. */
    overrideDisplayName: text("override_display_name"),
    /**
     * Merge: keeper GUID this participant folds into. Null = standalone. A
     * keeper never points at itself; chains are resolved to a single canonical
     * GUID at read time.
     */
    mergedIntoParticipantId: text("merged_into_participant_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqTenantParticipant: uniqueIndex("player_curation_tenant_participant_uq").on(
      t.tenantId,
      t.participantId,
    ),
  }),
);

export type PlayerCurationRow = typeof playerCurationTable.$inferSelect;
