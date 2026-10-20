import { pgTable, serial, integer, timestamp, index, unique } from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";
import { clubPhotosTable } from "./club_photos";
import { socialDraftsTable } from "./social_cards";

/**
 * When each library photo went out on a post (ADR-010 P4, migration 0054). A
 * row is written for every photo on a draft when the draft is posted (a carousel
 * writes one per slide photo). `pickPhoto` reads it to choose the least
 * recently used photo for a carousel's cover and fixture slides.
 *
 * Tenant-curated: every read filters on `tenant_id`, every write sets it from
 * the draft's tenant. A photo deleted from the library takes its rows with it;
 * a deleted draft leaves them (the photo was still used), with `draft_id` NULL.
 * UNIQUE (tenant, photo, draft): posting a draft twice records it once.
 */
export const photoUsageTable = pgTable(
  "photo_usage",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    photoId: integer("photo_id")
      .notNull()
      .references(() => clubPhotosTable.id, { onDelete: "cascade" }),
    usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
    draftId: integer("draft_id").references(() => socialDraftsTable.id, { onDelete: "set null" }),
  },
  (t) => ({
    uqTenantPhotoDraft: unique("photo_usage_tenant_photo_draft_unique").on(
      t.tenantId,
      t.photoId,
      t.draftId,
    ),
    idxTenantPhotoUsed: index("photo_usage_tenant_photo_used_idx").on(
      t.tenantId,
      t.photoId,
      t.usedAt,
    ),
  }),
);

export type PhotoUsageRow = typeof photoUsageTable.$inferSelect;
