import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";

export const capRegisterTable = pgTable(
  "cap_register",
  {
    id: serial("id").primaryKey(),
    capNumber: integer("cap_number").notNull(),
    category: text("category").notNull().default("male"),
    name: text("name").notNull(),
    deceased: boolean("deceased").notNull().default(false),
    inStats: boolean("in_stats").notNull().default(false),
    gamesAGrade: integer("games_a_grade").notNull().default(0),
    playerId: integer("player_id").references(() => playersTable.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    unique("cap_register_category_cap_number_unique").on(
      t.category,
      t.capNumber,
    ),
  ],
);

export type CapRegisterRow = typeof capRegisterTable.$inferSelect;
