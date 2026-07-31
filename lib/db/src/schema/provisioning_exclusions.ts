import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Platform-admin-managed exclusion list for central PCA clubs, independent of
 * `central.clubs.active_to` (the folded-club provisioning guard) — that column
 * is read-only from this app and its current curation state can't be verified
 * without a live central DB connection. This table is fully owned by the app:
 * a platform admin picks a club from a live search and excludes it, no name
 * matching or central-DB write involved.
 *
 * `visibility`:
 *   - "everywhere" — excluded from both self-serve signup and the concierge
 *     picker (defunct or merged clubs).
 *   - "self_serve_only" — excluded from public self-serve signup only; still
 *     concierge-provisionable by a platform admin (clubs invited into
 *     competitions but not ready for public onboarding yet).
 *
 * `clubName` snapshots the central club's name at exclusion time, so the
 * management list renders without a central-DB round trip on every read
 * (mirrors `tenants.name`'s snapshot-from-central pattern).
 */
export const provisioningExclusionsTable = pgTable("provisioning_exclusions", {
  id: serial("id").primaryKey(),
  centralClubId: integer("central_club_id").notNull().unique(),
  clubName: text("club_name").notNull(),
  visibility: text("visibility").notNull(),
  reason: text("reason"),
  // Which platform admin added this exclusion (audit trail, no strict FK —
  // matches admin_password_resets.created_by_platform_admin_id).
  createdByPlatformAdminId: integer("created_by_platform_admin_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ProvisioningExclusionRow =
  typeof provisioningExclusionsTable.$inferSelect;
export type InsertProvisioningExclusion =
  typeof provisioningExclusionsTable.$inferInsert;
