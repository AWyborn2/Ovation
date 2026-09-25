import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

/**
 * Photo type tags a library photo can carry (several per photo). Mirrors
 * `PHOTO_TYPES` in `@workspace/scorecard`, which maps card types to the tags
 * they prefer; the check constraints below keep the database to this set.
 */
export const CLUB_PHOTO_TYPES = [
  "batting",
  "bowling",
  "fielding",
  "team",
  "celebrating",
  "batting_milestone",
  "bowling_milestone",
] as const;

/** `ARRAY['batting', …]::text[]` for the check constraints. */
export const clubPhotoTypesSqlArray = sql.raw(
  `ARRAY[${CLUB_PHOTO_TYPES.map((t) => `'${t}'`).join(", ")}]::text[]`,
);

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
    // A derived image (a background-removed cut-out PNG, U19) points at the
    // library photo it was made from; null for uploaded photos. Deleting the
    // source keeps the cut-out.
    sourcePhotoId: integer("source_photo_id").references((): AnyPgColumn => clubPhotosTable.id, {
      onDelete: "set null",
    }),
    // Photo type tags (CLUB_PHOTO_TYPES); a card prefers photos of the types
    // its card type asks for, then falls back to any photo.
    photoTypes: text("photo_types").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTenantCreated: index("club_photos_tenant_created_idx").on(t.tenantId, t.createdAt),
    chkPhotoTypes: check(
      "club_photos_photo_types_check",
      sql`"photo_types" <@ ${clubPhotoTypesSqlArray}`,
    ),
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
