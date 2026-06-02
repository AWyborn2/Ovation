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
  },
  (t) => ({
    idxAward: index("award_winners_award_idx").on(t.awardId),
  }),
);

export type AwardRow = typeof awardsTable.$inferSelect;
export type AwardWinnerRow = typeof awardWinnersTable.$inferSelect;
