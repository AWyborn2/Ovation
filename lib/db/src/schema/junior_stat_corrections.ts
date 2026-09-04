import { pgTable, serial, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

/**
 * Journal of admin corrections to the read-only junior_* dump data.
 *
 * The junior tables are FULLY REPLACED by every juniors ETL reload
 * (scripts/sql/juniors-etl.sql), so admin edits made through the API would be
 * lost without this journal: each correction endpoint writes the target row
 * directly (so every live-computed junior aggregate is immediately right) AND
 * records the change here; the ETL re-applies the journal after its replace
 * (step 6). This table is app-owned — the ETL reads it but NEVER deletes it —
 * and doubles as the audit trail (prevValues powers one-click revert).
 *
 * Keying: targetId is the dump row id (as text; participant GUIDs verbatim).
 * Dump ids have proven stable across reloads (premiership mom/is_captain
 * already re-key by id), but a future dump could renumber, so corrections on
 * match-child rows also carry playhq_match_id as a sanity anchor — on
 * re-apply a correction whose anchor no longer matches is SKIPPED (and
 * reported by the loader), never applied to the wrong row.
 */
export const juniorStatCorrectionsTable = pgTable(
  "junior_stat_corrections",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    /** One of: junior_matches | junior_match_batting | junior_match_bowling |
     * junior_match_rosters | junior_participants. */
    targetTable: text("target_table").notNull(),
    /** Dump row id as text, or the participant GUID for junior_participants. */
    targetId: text("target_id").notNull(),
    /** update | insert | delete. */
    op: text("op").notNull(),
    /** snake_case column→value patch (full row for insert), including
     * server-computed derived fields so the ETL re-apply stays dumb. */
    patch: jsonb("patch"),
    /** Pre-image of the patched columns (full row for delete) — audit + revert. */
    prevValues: jsonb("prev_values"),
    /** Sanity anchors for match-child corrections. */
    matchId: integer("match_id"),
    playhqMatchId: text("playhq_match_id"),
    participantId: text("participant_id"),
    note: text("note"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTenant: index("junior_stat_corrections_tenant_idx").on(t.tenantId),
    idxTarget: index("junior_stat_corrections_target_idx").on(t.targetTable, t.targetId),
  }),
);

export type JuniorStatCorrectionRow = typeof juniorStatCorrectionsTable.$inferSelect;
