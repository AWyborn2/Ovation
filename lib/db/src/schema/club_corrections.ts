import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

/**
 * Figures a club may correct on one central stat line. Integer-valued only:
 * bowling is corrected in balls (not overs) and `not_out` as 0/1, so every
 * correction is a plain integer delta on its (participant, grade, season)
 * bucket (KTD1).
 */
export const CORRECTABLE_FIELDS = [
  "runs",
  "balls_faced",
  "fours",
  "sixes",
  "not_out",
  "balls_bowled",
  "maidens",
  "runs_conceded",
  "wickets",
  "wides",
  "no_balls",
  "catches",
  "stumpings",
  "run_outs",
] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

export function isCorrectableField(value: string): value is CorrectableField {
  return (CORRECTABLE_FIELDS as readonly string[]).includes(value);
}

/**
 * Club corrections journal (hybrid stats plan U9; R15, KTD7).
 *
 * Central data is read-only, so a club fixes a wrong central figure here: one
 * row per (PlayHQ match, participant GUID, field). It is applied on READ by the
 * club overlay (U10) — central is never written. Each row records the figure
 * as central had it (`previous_value`): if central later disagrees with that
 * (a reload fixed or changed the line) the correction is STALE — skipped and
 * reported, never applied on top of different data. Pattern:
 * `junior_stat_corrections.ts` (anchor + skip-on-mismatch).
 *
 * Reversal is soft: `removed_at` / `removed_by` retire a correction and keep
 * it as audit history. At most one ACTIVE correction per (tenant, match,
 * participant, field) — a partial unique index on `removed_at IS NULL` — so a
 * re-correction first retires the current one.
 */
export const clubCorrectionsTable = pgTable(
  "club_corrections",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    /** PlayHQ match id as central stores it (`central.matches.playhq_match_id`). */
    playhqMatchId: text("playhq_match_id").notNull(),
    /** Central PlayHQ participant GUID whose line is corrected. */
    participantId: text("participant_id").notNull(),
    field: text("field").$type<CorrectableField>().notNull(),
    /** The central figure when the correction was made (staleness anchor). */
    previousValue: integer("previous_value").notNull(),
    newValue: integer("new_value").notNull(),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when reversed; null = active. */
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedBy: text("removed_by"),
  },
  (t) => ({
    idxTenant: index("club_corrections_tenant_idx").on(t.tenantId),
    idxTenantMatch: index("club_corrections_tenant_match_idx").on(t.tenantId, t.playhqMatchId),
    uqActive: uniqueIndex("club_corrections_active_uidx")
      .on(t.tenantId, t.playhqMatchId, t.participantId, t.field)
      .where(sql`"removed_at" IS NULL`),
    chkField: check(
      "club_corrections_field_check",
      sql`"field" IN ('runs', 'balls_faced', 'fours', 'sixes', 'not_out', 'balls_bowled', 'maidens', 'runs_conceded', 'wickets', 'wides', 'no_balls', 'catches', 'stumpings', 'run_outs')`,
    ),
    chkValues: check(
      "club_corrections_values_check",
      sql`"previous_value" >= 0 AND "new_value" >= 0 AND "previous_value" <> "new_value" AND ("field" <> 'not_out' OR ("previous_value" IN (0, 1) AND "new_value" IN (0, 1)))`,
    ),
    chkIdentity: check(
      "club_corrections_identity_check",
      sql`btrim("playhq_match_id") <> '' AND btrim("participant_id") <> ''`,
    ),
  }),
);

export type ClubCorrection = typeof clubCorrectionsTable.$inferSelect;
export type InsertClubCorrection = typeof clubCorrectionsTable.$inferInsert;
