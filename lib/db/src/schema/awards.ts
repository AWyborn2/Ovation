import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";

export const awardsTable = pgTable("awards", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  displayOrder: integer("display_order").notNull().default(0),
  votingEnabled: boolean("voting_enabled").notNull().default(false),
  // How a season's winner is determined: 'voted' (captain 3-2-1 ballots),
  // 'points' (auto-tallied from match stats for `pointsGrade`), or 'manual'
  // (admin records the winner directly).
  mechanism: text("mechanism").notNull().default("manual"),
  // Public visibility. Draft awards (published=false) are admin-only.
  published: boolean("published").notNull().default(false),
  // For 'points' awards: the single grade whose match stats are tallied.
  pointsGrade: text("points_grade"),
});

export const awardWinnersTable = pgTable(
  "award_winners",
  {
    id: serial("id").primaryKey(),
    awardId: integer("award_id")
      .notNull()
      .references(() => awardsTable.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    playerId: integer("player_id").references(() => playersTable.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    // Public visibility for an individual winner row. Defaults true so a
    // recorded winner shows once its award is published.
    published: boolean("published").notNull().default(true),
  },
  (t) => ({
    idxAward: index("award_winners_award_idx").on(t.awardId),
  }),
);

export type AwardRow = typeof awardsTable.$inferSelect;
export type AwardWinnerRow = typeof awardWinnersTable.$inferSelect;
