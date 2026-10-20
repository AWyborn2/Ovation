import { pgTable, serial, integer, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

/**
 * Club-set short names for teams on social cards (ADR-010, migration 0051). A
 * square card has no room for "White Knights Baldivis Cricket Club Inc" or the
 * PlayHQ team name "SJ Blues Senior A Wo", so an admin sets "White Knights" or
 * "SJ Blues" once and every card uses it.
 *
 * Keyed on the CENTRAL club id, never on display text: team names change from
 * season to season, the club id does not. `grade_key` (an app grade, "A Grade",
 * "Female A Grade") narrows a name to one grade; NULL covers every grade.
 * UNIQUE NULLS NOT DISTINCT, so a club has at most one all-grades name.
 *
 * Tenant-curated content: every read filters on `tenant_id`, every write sets it
 * from the request. Never written to `central`. A club with no row here gets the
 * automatic short name (`autoShortTeamName` in @workspace/scorecard).
 */
export const teamNameOverridesTable = pgTable(
  "team_name_overrides",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    centralClubId: integer("central_club_id").notNull(),
    gradeKey: text("grade_key"),
    shortName: text("short_name").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqTenantClubGrade: unique("team_name_overrides_tenant_club_grade_unique")
      .on(t.tenantId, t.centralClubId, t.gradeKey)
      .nullsNotDistinct(),
    idxTenant: index("team_name_overrides_tenant_idx").on(t.tenantId),
  }),
);

export type TeamNameOverrideRow = typeof teamNameOverridesTable.$inferSelect;

/**
 * Club-set labels for competitions on social cards ("Female A Grade" →
 * "Women's A"), one per app grade. Tenant-curated like the team names above.
 */
export const competitionLabelOverridesTable = pgTable(
  "competition_label_overrides",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    gradeKey: text("grade_key").notNull(),
    label: text("label").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqTenantGrade: unique("competition_label_overrides_tenant_grade_unique").on(
      t.tenantId,
      t.gradeKey,
    ),
  }),
);

export type CompetitionLabelOverrideRow = typeof competitionLabelOverridesTable.$inferSelect;
