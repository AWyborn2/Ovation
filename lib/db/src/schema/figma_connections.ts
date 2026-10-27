import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";
import type { SealedSecret } from "./social_publishing";

/**
 * A club's own Figma connection (template library release 2, ADR-012), used to
 * import a Figma frame into a private club template. One per tenant. The club
 * either signs in with Figma (`oauth`: an access token with a refresh token)
 * or pastes a personal access token (`token`). Tokens are always sealed with
 * `secret-box`, like the Meta Page tokens, and never returned or logged.
 */
export const figmaConnectionsTable = pgTable(
  "figma_connections",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    // "oauth" | "token"
    method: text("method").notNull(),
    // "connected" | "needs_reconnect"
    status: text("status").notNull().default("connected"),
    accessToken: jsonb("access_token").$type<SealedSecret>().notNull(),
    // OAuth only.
    refreshToken: jsonb("refresh_token").$type<SealedSecret>(),
    // OAuth only: when the access token expires (a pasted token's is unknown).
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    // The Figma account, shown so the admin can confirm which one is linked.
    figmaUserId: text("figma_user_id"),
    figmaHandle: text("figma_handle"),
    // Why the connection needs a reconnect, shown to the club.
    statusReason: text("status_reason"),
    connectedByAdminId: integer("connected_by_admin_id"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqTenant: uniqueIndex("figma_connections_tenant_unique").on(t.tenantId),
    chkMethod: check("figma_connections_method_check", sql`"method" IN ('oauth', 'token')`),
    chkStatus: check(
      "figma_connections_status_check",
      sql`"status" IN ('connected', 'needs_reconnect')`,
    ),
  }),
);

export type FigmaConnectionRow = typeof figmaConnectionsTable.$inferSelect;

/**
 * A Figma sign-in in progress: the single-use nonce carried in the signed OAuth
 * state, bound to the tenant and admin who started it. Short-lived, deleted on
 * use.
 */
export const figmaConnectionPendingTable = pgTable(
  "figma_connection_pending",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    adminId: integer("admin_id").notNull(),
    nonce: text("nonce").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqNonce: uniqueIndex("figma_connection_pending_nonce_unique").on(t.nonce),
    idxTenant: index("figma_connection_pending_tenant_idx").on(t.tenantId),
  }),
);

export type FigmaConnectionPendingRow = typeof figmaConnectionPendingTable.$inferSelect;
