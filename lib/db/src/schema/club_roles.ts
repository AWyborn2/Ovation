import { pgTable, serial, integer, text, boolean, index } from "drizzle-orm/pg-core";
import { playersTable } from "./players";

/**
 * Club roles by season — a uniform model for both club office bearers (President,
 * Vice President, Secretary, Treasurer, Director of Cricket, Club Captain, Coach)
 * and grade captains. A club office-bearer row has `grade = NULL`; a grade
 * captain row has `role = "Grade Captain"` and `grade` set. Modelling both the
 * same way lets the records page count role-holdings uniformly.
 *
 * `published` gates public visibility: admins can prepare a season privately and
 * publish later. Historical rows loaded from the spreadsheet are published.
 *
 * NOTE: a composite UNIQUE on (season, role, grade) with NULLS NOT DISTINCT is
 * enforced in Postgres but intentionally NOT declared here — drizzle-kit 0.31
 * can't detect existing multi-column uniques and re-proposes them every push,
 * hanging the non-interactive post-merge migration. It is (re)created
 * idempotently by `scripts/src/ensure-constraints.ts`. See cap_register.ts for
 * the full rationale.
 */
export const clubRolesTable = pgTable(
  "club_roles",
  {
    id: serial("id").primaryKey(),
    season: integer("season").notNull(),
    role: text("role").notNull(),
    grade: text("grade"),
    playerId: integer("player_id").references(() => playersTable.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    published: boolean("published").notNull().default(false),
  },
  (t) => ({
    idxSeason: index("club_roles_season_idx").on(t.season),
    idxGrade: index("club_roles_grade_idx").on(t.grade),
  }),
);

export type ClubRoleRow = typeof clubRolesTable.$inferSelect;
