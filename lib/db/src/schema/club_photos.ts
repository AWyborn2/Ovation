import { pgTable, serial, integer, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

/**
 * The club's photo library (Social Studio, R10–R12). Senior-only: photos are
 * tagged with senior players, never junior participants, and the library never
 * supplies junior cards (KTD15).
 *
 * Every row is an ingested JPEG — uploads (including iPhone HEIC) are
 * converted, oriented and stripped of EXIF on the server, and the original
 * upload is deleted (KTD7). `objectPath` / `thumbPath` are object-storage
 * entity paths (`/objects/...`), served at `/api/storage/objects/...`.
 */
export const clubPhotosTable = pgTable(
  "club_photos",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    objectPath: text("object_path").notNull(),
    thumbPath: text("thumb_path").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    season: integer("season"),
    grade: text("grade"),
    // When the photo was taken, from the original's EXIF (null when absent).
    takenAt: timestamp("taken_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTenantCreated: index("club_photos_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

export type ClubPhotoRow = typeof clubPhotosTable.$inferSelect;

/**
 * Player tags on a library photo. `playerId` is the tenant's app player id (a
 * native `players.id`, or a crosswalk id for a central-data club), so there is
 * no foreign key to `players`; the route validates ids are senior players.
 */
export const clubPhotoPlayersTable = pgTable(
  "club_photo_players",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    photoId: integer("photo_id")
      .notNull()
      .references(() => clubPhotosTable.id, { onDelete: "cascade" }),
    playerId: integer("player_id").notNull(),
  },
  (t) => ({
    uniqPhotoPlayer: uniqueIndex("club_photo_players_photo_player_unique").on(
      t.photoId,
      t.playerId,
    ),
    idxTenantPlayer: index("club_photo_players_tenant_player_idx").on(t.tenantId, t.playerId),
  }),
);

export type ClubPhotoPlayerRow = typeof clubPhotoPlayersTable.$inferSelect;
