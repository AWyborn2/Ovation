import { pgTable, serial, integer, text, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { type z } from "zod/v4";
import { tenantIdColumn } from "./_tenant";

// A player's photo gallery. One row per image; `is_default` marks the single
// image surfaced wherever a single player photo is needed (trading card, share
// card initial selection). `players.image_url` is kept in sync with whichever
// row is the default so existing single-photo readers keep working.
export const playerImagesTable = pgTable(
  "player_images",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    // A player id in the TENANT's id space (its crosswalk ints; for Halls Head
    // also its native players.id while it reads native) — deliberately no FK to
    // the native players table (hybrid stats plan U8, KTD3). Writes are checked
    // by assertPlayerInTenantSpace (api-server/src/lib/curated-player-space.ts).
    playerId: integer("player_id").notNull(),
    imageUrl: text("image_url").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (t) => ({
    idxTenant: index("player_images_tenant_idx").on(t.tenantId),
    idxPlayer: index("player_images_player_idx").on(t.playerId),
  }),
);

export const insertPlayerImageSchema = createInsertSchema(playerImagesTable).omit({
  id: true,
});
export type InsertPlayerImage = z.infer<typeof insertPlayerImageSchema>;
export type PlayerImageRow = typeof playerImagesTable.$inferSelect;
