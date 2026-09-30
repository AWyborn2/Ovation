import { pgTable, serial, integer, text, boolean, index, unique } from "drizzle-orm/pg-core";
import { nonPlayerPeopleTable } from "./non_player_people";
import { tenantIdColumn } from "./_tenant";

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
 * Identity: UNIQUE NULLS NOT DISTINCT (tenant_id, season, role, grade) — one
 * holder of a role per season (and grade) PER CLUB. It replaced a global
 * (season, role, grade) unique that let only one club in the platform have a
 * 2024 President (hybrid stats plan U8, R17). Created by migration 0020 and
 * verified by `scripts/src/ensure-constraints.ts`.
 */
export const clubRolesTable = pgTable(
  "club_roles",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    season: integer("season").notNull(),
    role: text("role").notNull(),
    grade: text("grade"),
    // A player id in the TENANT's id space (its crosswalk ints; for Halls Head
    // also its native players.id while it reads native) — deliberately no FK to
    // the native players table (hybrid stats plan U8, KTD3). Writes are checked
    // by assertPlayerInTenantSpace (api-server/src/lib/curated-player-space.ts).
    playerId: integer("player_id"),
    // Alternative link target for office bearers who never played (no row in
    // `players`). Mutually exclusive with `playerId` at the app level.
    nonPlayerId: integer("non_player_id").references(() => nonPlayerPeopleTable.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    published: boolean("published").notNull().default(false),
  },
  (t) => ({
    idxSeason: index("club_roles_season_idx").on(t.season),
    idxGrade: index("club_roles_grade_idx").on(t.grade),
    idxTenant: index("club_roles_tenant_idx").on(t.tenantId),
    uqTenantSeasonRoleGrade: unique("club_roles_tenant_season_role_grade_unique")
      .on(t.tenantId, t.season, t.role, t.grade)
      .nullsNotDistinct(),
  }),
);

export type ClubRoleRow = typeof clubRolesTable.$inferSelect;
