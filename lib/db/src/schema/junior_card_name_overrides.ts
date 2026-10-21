import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";
import type { CrestSource } from "./card_name_overrides";

/**
 * Club-set names and crests for JUNIOR cards (migration 0058). Junior twins of
 * `team_name_overrides` / `team_crest_overrides` / `competition_label_overrides`,
 * kept in their own tables so junior and senior names never mix (the juniors
 * isolation invariant, replit.md): only the `/api/juniors/*` routes and the
 * junior card builders read or write them.
 *
 * Junior opponents have no central club id, so a team is keyed on
 * `team_key`: the normalised automatic short name of the opponent as PlayHQ
 * names it (`cardNameKey(autoShortTeamName(opponent_name))`), so every age
 * group of one club ("Mandurah U13 Blue", "Mandurah U15") shares one row.
 * A competition is keyed on the grade label junior cards print (the age group,
 * else the grade).
 *
 * Tenant-curated: every read filters on `tenant_id`, every write sets it.
 */
export const juniorTeamNameOverridesTable = pgTable(
  "junior_team_name_overrides",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    teamKey: text("team_key").notNull(),
    shortName: text("short_name").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqTenantTeam: unique("junior_team_name_overrides_tenant_team_unique").on(t.tenantId, t.teamKey),
  }),
);

export type JuniorTeamNameOverrideRow = typeof juniorTeamNameOverridesTable.$inferSelect;

/** A club-set crest for a junior opponent: uploaded, a known PlayHQ crest, or initials. */
export const juniorTeamCrestOverridesTable = pgTable(
  "junior_team_crest_overrides",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    teamKey: text("team_key").notNull(),
    crestSource: text("crest_source").$type<CrestSource>().notNull(),
    crestUrl: text("crest_url"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqTenantTeam: unique("junior_team_crest_overrides_tenant_team_unique").on(
      t.tenantId,
      t.teamKey,
    ),
  }),
);

export type JuniorTeamCrestOverrideRow = typeof juniorTeamCrestOverridesTable.$inferSelect;

/** A club-set card label for a junior grade ("Year 7" → "Yr 7 Boys"). */
export const juniorCompetitionLabelOverridesTable = pgTable(
  "junior_competition_label_overrides",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    gradeKey: text("grade_key").notNull(),
    label: text("label").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqTenantGrade: unique("junior_competition_label_overrides_tenant_grade_unique").on(
      t.tenantId,
      t.gradeKey,
    ),
  }),
);

export type JuniorCompetitionLabelOverrideRow =
  typeof juniorCompetitionLabelOverridesTable.$inferSelect;
