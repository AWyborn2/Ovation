import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Club admins, scoped per tenant. Each row belongs to one tenant (the club whose
 * branded app it administers); usernames are unique WITHIN a tenant, so two clubs
 * can each have an `admin`/`owner` account. `tenantId` defaults to 1 (Halls Head)
 * so the column backfills cleanly onto the pre-white-label single-tenant rows; all
 * insert sites set it explicitly.
 *
 * Cross-tenant access is denied in `requireAdmin`/`resolveAdmin` by asserting the
 * resolved admin's `tenantId` matches the request's tenant.
 */
export const adminsTable = pgTable(
  "admins",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().default(1),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantUsername: unique("admins_tenant_username_unique").on(t.tenantId, t.username),
  }),
);

export type AdminRow = typeof adminsTable.$inferSelect;

/**
 * Platform (super) admins for the apex/concierge console — a separate surface from
 * club admins. Keyed by email; not tenant-scoped (they operate across the
 * platform). Seeded from PLATFORM_ADMIN_PASSWORD.
 */
export const platformAdminsTable = pgTable("platform_admins", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformAdminRow = typeof platformAdminsTable.$inferSelect;
