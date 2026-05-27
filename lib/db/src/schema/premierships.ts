import { pgTable, serial, integer, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";

export const premiershipsTable = pgTable("premierships", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  grade: text("grade").notNull(),
  competition: text("competition").notNull(),
  venue: text("venue"),
  matchDate: text("match_date"),
  result: text("result"),
  mom: text("mom"),
  notes: text("notes"),
});

export const premiershipPlayersTable = pgTable("premiership_players", {
  id: serial("id").primaryKey(),
  premiershipId: integer("premiership_id")
    .notNull()
    .references(() => premiershipsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").references(() => playersTable.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  isCaptain: boolean("is_captain").notNull().default(false),
  battingOrder: integer("batting_order"),
});

export const insertPremiershipSchema = createInsertSchema(premiershipsTable).omit({ id: true });
export type InsertPremiership = z.infer<typeof insertPremiershipSchema>;
export type Premiership = typeof premiershipsTable.$inferSelect;

export const insertPremiershipPlayerSchema = createInsertSchema(premiershipPlayersTable).omit({ id: true });
export type InsertPremiershipPlayer = z.infer<typeof insertPremiershipPlayerSchema>;
export type PremiershipPlayer = typeof premiershipPlayersTable.$inferSelect;
