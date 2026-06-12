import { pgTable, serial, integer, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";
import { tenantIdColumn } from "./_tenant";

// A player's photo gallery. One row per image; `is_default` marks the single
// image surfaced wherever a single player photo is needed (trading card, share
// card initial selection). `players.image_url` is kept in sync with whichever
// row is the default so existing single-photo readers keep working.
export const playerImagesTable = pgTable("player_images", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdColumn(),
  playerId: integer("player_id")
    .notNull()
    .references(() => playersTable.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
});

export const insertPlayerImageSchema = createInsertSchema(playerImagesTable).omit({
  id: true,
});
export type InsertPlayerImage = z.infer<typeof insertPlayerImageSchema>;
export type PlayerImageRow = typeof playerImagesTable.$inferSelect;
