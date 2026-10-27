import { pgTable, serial, integer, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";
import { clubPhotosTable } from "./club_photos";

/**
 * Photo collections (photo layer sources, migration 0071): named sets of
 * library photos an admin makes in the photo library ("Matchday crowd",
 * "Sponsor night"). Unlike the library's folders, which are a view over each
 * photo's grade and type, a collection is chosen by hand and a photo can be in
 * any number of them. A template's photo layer can take a random photo from a
 * collection (`PhotoLayerSource` in `@workspace/scorecard`), picked per draft.
 */
export const clubPhotoCollectionsTable = pgTable(
  "club_photo_collections",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTenant: index("club_photo_collections_tenant_idx").on(t.tenantId),
  }),
);

export type ClubPhotoCollectionRow = typeof clubPhotoCollectionsTable.$inferSelect;

/** The photos in a collection. Deleting the collection or the photo removes the row. */
export const clubPhotoCollectionPhotosTable = pgTable(
  "club_photo_collection_photos",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    collectionId: integer("collection_id")
      .notNull()
      .references(() => clubPhotoCollectionsTable.id, { onDelete: "cascade" }),
    photoId: integer("photo_id")
      .notNull()
      .references(() => clubPhotosTable.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqCollectionPhoto: uniqueIndex("club_photo_collection_photos_unique").on(
      t.collectionId,
      t.photoId,
    ),
    idxTenantPhoto: index("club_photo_collection_photos_tenant_photo_idx").on(
      t.tenantId,
      t.photoId,
    ),
  }),
);

export type ClubPhotoCollectionPhotoRow = typeof clubPhotoCollectionPhotosTable.$inferSelect;
