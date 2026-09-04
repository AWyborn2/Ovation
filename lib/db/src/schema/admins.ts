import { pgTable, serial, integer, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

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
// NOTE: admins_tenant_username_unique (tenant_id, username) is intentionally NOT
// declared here. drizzle-kit 0.31 cannot detect the existing constraint and
// re-proposes it every push, causing an interactive truncate prompt that hangs in
// non-TTY post-merge runs. The constraint is created idempotently in
// scripts/src/ensure-constraints.ts instead (same pattern as cap_register).
export const adminsTable = pgTable(
  "admins",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .default(1)
      .references(() => tenantsTable.id),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    // Bumped on password change/reset and "log out everywhere". A session token
    // carries the epoch it was minted under; a token whose epoch is behind the
    // row's is rejected, so a leaked cookie dies with the password (plan.md §3.3).
    sessionEpoch: integer("session_epoch").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTenant: index("admins_tenant_idx").on(t.tenantId),
    uqTenantUsername: unique("admins_tenant_username_unique").on(t.tenantId, t.username),
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
  /** See adminsTable.sessionEpoch. */
  sessionEpoch: integer("session_epoch").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformAdminRow = typeof platformAdminsTable.$inferSelect;
