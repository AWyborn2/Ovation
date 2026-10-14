import { pgTable, text, timestamp, integer, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Platform-admin decisions about PlayHQ competitions Ovation can't place in a grade.
 *
 * A competition name the classifier doesn't recognise is skipped by the PlayHQ → central
 * projection, so its matches never appear. Competitions are shared by every club that plays in
 * them, so what to do is a platform decision, keyed by the normalised PlayHQ grade name
 * (`central.playhq_grade_key()` — lowercased, season tokens removed, so one row serves every
 * season):
 *
 *  - `map`:    project the matches under `centralGrade`, a label the classifier recognises
 *              ("Over 45s", "F Grade" …) — the same label the central history uses.
 *  - `ignore`: deliberately not a grade Ovation tracks; the club notice stops listing it.
 *
 * The projector (the one sanctioned `central` writer) reads this table and never writes it, as
 * with `player_privacy_overrides`; the app itself never writes `central`.
 */
export const playhqGradeDecisionsTable = pgTable(
  "playhq_grade_decisions",
  {
    gradeKey: text("grade_key").primaryKey(),
    /** The PlayHQ grade name as first seen, for display; the projector re-derives the key from it. */
    gradeName: text("grade_name").notNull(),
    action: text("action").notNull(),
    /** Required for `map`, null for `ignore`. */
    centralGrade: text("central_grade"),
    reason: text("reason"),
    setByPlatformAdminId: integer("set_by_platform_admin_id"),
    setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("playhq_grade_decisions_action_check", sql`${t.action} in ('map', 'ignore')`),
    check(
      "playhq_grade_decisions_map_needs_grade",
      sql`(${t.action} = 'map') = (${t.centralGrade} is not null)`,
    ),
  ],
);

export type PlayhqGradeDecisionRow = typeof playhqGradeDecisionsTable.$inferSelect;
