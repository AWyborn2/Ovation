import { pgTable, serial, integer, text, boolean } from "drizzle-orm/pg-core";
import { playersTable } from "./players";

export const capRegisterTable = pgTable("cap_register", {
  id: serial("id").primaryKey(),
  capNumber: integer("cap_number").notNull().unique(),
  name: text("name").notNull(),
  deceased: boolean("deceased").notNull().default(false),
  playerId: integer("player_id").references(() => playersTable.id, {
    onDelete: "set null",
  }),
});

export type CapRegisterRow = typeof capRegisterTable.$inferSelect;
