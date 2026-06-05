import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";
import { playersTable } from "./players";

/**
 * Curated historical record lists loaded from the master DB. These are
 * display-only honour lists (centuries, five-wicket hauls, the club's hand-kept
 * record holders, and administrative records). `grade` is the app's flat grade
 * name; `season` is the display label (YYYY/YY). `playerId` links to a player
 * where the master provided one.
 */
export const centuriesTable = pgTable("centuries", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").references(() => playersTable.id, {
    onDelete: "set null",
  }),
  grade: text("grade").notNull(),
  batsman: text("batsman").notNull(),
  score: text("score"),
  season: text("season"),
});

export const fiveWicketHaulsTable = pgTable("five_wicket_hauls", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").references(() => playersTable.id, {
    onDelete: "set null",
  }),
  grade: text("grade").notNull(),
  bowler: text("bowler").notNull(),
  figures: text("figures"),
  season: text("season"),
});

/** The club's hand-kept record holders (e.g. "GAMES RECORD HOLDERS"). */
export const clubRecordsTable = pgTable("club_records", {
  id: serial("id").primaryKey(),
  recordType: text("record_type").notNull(),
  grade: text("grade"),
  detail: text("detail"),
});

/** Administrative honour-board records (e.g. "Most Seasons as President"). */
export const honourBoardRecordsTable = pgTable("honour_board_records", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  rank: integer("rank"),
  name: text("name"),
  value: text("value"),
});

export type CenturyRow = typeof centuriesTable.$inferSelect;
export type FiveWicketHaulRow = typeof fiveWicketHaulsTable.$inferSelect;
export type ClubRecordRow = typeof clubRecordsTable.$inferSelect;
export type HonourBoardRecordRow = typeof honourBoardRecordsTable.$inferSelect;
