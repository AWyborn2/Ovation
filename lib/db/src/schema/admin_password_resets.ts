import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Single-use password-reset / bootstrap tokens for club admins, minted by a
 * platform (super) admin from the concierge console. This is the recovery path
 * for a tenant whose admin credentials are lost — or a tenant that has no admin
 * at all (bootstrap): a platform admin issues a token, the reset URL is handed to
 * the club out-of-band, and the club admin sets their OWN password via the link.
 * Platform staff never learn or set the password, so there is no silent
 * impersonation vector.
 *
 * Only the SHA-256 hash of the raw token is stored — the raw token exists only in
 * the returned reset URL. Tokens are tenant-scoped (`tenantId` must match the
 * request tenant when redeemed) and audited (`createdByPlatformAdminId`).
 */
export const adminPasswordResetsTable = pgTable(
  "admin_password_resets",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    adminId: integer("admin_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    // Which platform admin issued this token (audit trail).
    createdByPlatformAdminId: integer("created_by_platform_admin_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Set the moment the token is redeemed; a used token can never be reused.
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tokenHashIdx: index("admin_password_resets_token_hash_idx").on(t.tokenHash),
    adminIdx: index("admin_password_resets_admin_idx").on(t.adminId),
  }),
);

export type AdminPasswordResetRow =
  typeof adminPasswordResetsTable.$inferSelect;
