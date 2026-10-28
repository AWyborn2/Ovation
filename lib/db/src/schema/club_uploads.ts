import { sql } from "drizzle-orm";
import { pgTable, serial, integer, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

/**
 * A club's Uploads in the Studio editor (migration 0073): logos, artwork,
 * stickers and shapes it adds to cards, kept apart from the photo library
 * (which feeds the automatic card photos). Like Canva's uploads, each has a
 * name to search by and can be deleted.
 *
 *   kind 'image'  a PNG, JPEG or WebP kept in its own format (PNG keeps its
 *                 transparency), EXIF stripped; `object_path` and `thumb_path`
 *   kind 'svg'    a vector, cleaned to the vector layer's allowlist and kept as
 *                 markup in `svg`, so it can be recoloured on the card
 *
 * Deleting hides an upload (`deleted_at`) and keeps the file, so cards and
 * templates that already use it still draw.
 */
export const clubUploadsTable = pgTable(
  "club_uploads",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    name: text("name").notNull(),
    kind: text("kind").$type<"image" | "svg">().notNull(),
    // 'image': object-storage entity paths (`/objects/...`).
    objectPath: text("object_path"),
    thumbPath: text("thumb_path"),
    // 'image': image/png | image/jpeg | image/webp.
    contentType: text("content_type"),
    // 'svg': the cleaned markup.
    svg: text("svg"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdByAdminId: integer("created_by_admin_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    idxTenantCreated: index("club_uploads_tenant_created_idx").on(t.tenantId, t.createdAt),
    chkKind: check("club_uploads_kind_check", sql`"kind" IN ('image', 'svg')`),
    chkContent: check(
      "club_uploads_content_check",
      sql`("kind" = 'image' AND "object_path" IS NOT NULL) OR ("kind" = 'svg' AND "svg" IS NOT NULL)`,
    ),
  }),
);

export type ClubUploadRow = typeof clubUploadsTable.$inferSelect;
