import { sql } from "drizzle-orm";
import { check, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
 *     so their stats and profile present as one player. `mergeStatus` says
 *     where the pair is in review: only a `confirmed` merge folds careers on
 *     read; `suggested` (duplicate evidence awaiting an admin) and `rejected`
 *     (an admin said "not the same person") leave both GUIDs separate.
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
    /**
     * Review state of the merge: "suggested" | "confirmed" | "rejected". Set
     * whenever `mergedIntoParticipantId` is (enforced by a check), null for a
     * rename-only row. Only "confirmed" folds on read.
     */
    mergeStatus: text("merge_status").$type<MergeStatus>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqTenantParticipant: uniqueIndex("player_curation_tenant_participant_uq").on(
      t.tenantId,
      t.participantId,
    ),
    chkMergeStatus: check(
      "player_curation_merge_status_check",
      sql`"merge_status" IS NULL OR "merge_status" IN ('suggested', 'confirmed', 'rejected')`,
    ),
    chkMergeHasStatus: check(
      "player_curation_merge_has_status_check",
      sql`"merged_into_participant_id" IS NULL OR "merge_status" IS NOT NULL`,
    ),
  }),
);

/** Review state of a curation merge; only "confirmed" folds careers on read. */
export type MergeStatus = "suggested" | "confirmed" | "rejected";
export const MERGE_STATUSES: readonly MergeStatus[] = ["suggested", "confirmed", "rejected"];

export type PlayerCurationRow = typeof playerCurationTable.$inferSelect;
