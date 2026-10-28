import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  boolean,
  integer,
  jsonb,
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
  "premiership",
  "batting_milestone",
  "bowling_milestone",
] as const;

/** `ARRAY['batting', …]::text[]` for the check constraints. */
export const clubPhotoTypesSqlArray = sql.raw(
  `ARRAY[${CLUB_PHOTO_TYPES.map((t) => `'${t}'`).join(", ")}]::text[]`,
);

/**
 * The match format a library photo can be tagged with (one per photo, or
 * none). Mirrors `MATCH_FORMATS` in `@workspace/scorecard`.
 */
export const CLUB_PHOTO_MATCH_FORMATS = ["one_day", "t20", "two_day"] as const;

/**
 * A box on a photo in fractions (0–1) of its width and height: the photo's
 * focus box, or a tagged player's area (photo focus areas, migration 0070).
 * Mirrors `FocusBox` in `@workspace/scorecard`.
 */
export type PhotoFocusBoxJson = { x: number; y: number; w: number; h: number };

/** The frame shapes an admin can switch off for a photo (`FRAME_SHAPES` in scorecard). */
export const PHOTO_FRAME_SHAPES = ["tall", "square", "wide"] as const;

/** `ARRAY['tall', …]::text[]` for the check constraints. */
export const photoFrameShapesSqlArray = sql.raw(
  `ARRAY[${PHOTO_FRAME_SHAPES.map((t) => `'${t}'`).join(", ")}]::text[]`,
);

const clubPhotoMatchFormatsSqlArray = sql.raw(
  `ARRAY[${CLUB_PHOTO_MATCH_FORMATS.map((t) => `'${t}'`).join(", ")}]::text[]`,
);

/**
 * The club's photo library. Player tags are senior-only, never junior
 * participants. Explicit juniorStock artwork is the sole neutral-image
 * exception for junior carousel cards; it must have no grade or player tags.
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
    // Explicit club-approved reusable artwork, not a junior participant photo.
    juniorStock: boolean("junior_stock").notNull().default(false),
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
    // The match format (CLUB_PHOTO_MATCH_FORMATS): a separate tag from the
    // photo type; a card from a format prefers photos of that format.
    matchFormat: text("match_format"),
    // The part of the photo that matters (photo focus areas): every frame crops
    // to keep it in view. Null = a centred crop, as before.
    focusBox: jsonb("focus_box").$type<PhotoFocusBoxJson>(),
    // Frame shapes (PHOTO_FRAME_SHAPES) the admin switched off for this photo;
    // the automatic picker never puts it in a frame of those shapes.
    offShapes: text("off_shapes").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTenantCreated: index("club_photos_tenant_created_idx").on(t.tenantId, t.createdAt),
    chkPhotoTypes: check(
      "club_photos_photo_types_check",
      sql`"photo_types" <@ ${clubPhotoTypesSqlArray}`,
    ),
    chkMatchFormat: check(
      "club_photos_match_format_check",
      sql`"match_format" IS NULL OR "match_format" = ANY (${clubPhotoMatchFormatsSqlArray})`,
    ),
    chkOffShapes: check(
      "club_photos_off_shapes_check",
      sql`"off_shapes" <@ ${photoFrameShapesSqlArray}`,
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
    // Where this player is on the photo; a card about them crops to it
    // instead of the photo's focus box. Null = no area marked.
    area: jsonb("area").$type<PhotoFocusBoxJson>(),
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
