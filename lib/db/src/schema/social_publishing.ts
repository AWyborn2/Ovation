import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenantIdColumn } from "./_tenant";
import { socialDraftsTable } from "./social_cards";

/**
 * Meta publishing (plan 2026-10-06-001). A club connects one Facebook Page and
 * the Instagram professional account linked to it; Social Studio drafts then
 * publish to both through Ovation's own scheduler.
 */

/** An encrypted secret as stored: AES-256-GCM ciphertext, IV and key version. */
export type SealedSecret = { v: number; iv: string; tag: string; data: string };

// One connection per tenant and provider (KTD1). The Page token is the only
// credential stored, always encrypted; the user token is never persisted.
export const socialConnectionsTable = pgTable(
  "social_connections",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    provider: text("provider").notNull().default("meta"),
    // "connected" | "needs_reconnect" | "disconnected"
    status: text("status").notNull().default("connected"),
    // The Meta user who connected — matched by the deauthorize and
    // data-deletion callbacks (KTD16).
    metaUserId: text("meta_user_id"),
    pageId: text("page_id"),
    pageName: text("page_name"),
    // Null when the Page has no linked Instagram professional account.
    igUserId: text("ig_user_id"),
    igUsername: text("ig_username"),
    pageToken: jsonb("page_token").$type<SealedSecret>(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    // Why the connection needs a reconnect, shown to the club.
    statusReason: text("status_reason"),
    connectedByAdminId: integer("connected_by_admin_id"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqTenantProvider: uniqueIndex("social_connections_tenant_provider_unique").on(
      t.tenantId,
      t.provider,
    ),
    idxMetaUser: index("social_connections_meta_user_idx").on(t.metaUserId),
    chkStatus: check(
      "social_connections_status_check",
      sql`"status" IN ('connected', 'needs_reconnect', 'disconnected')`,
    ),
  }),
);

export type SocialConnectionRow = typeof socialConnectionsTable.$inferSelect;

/** One Page offered during connect, with its token sealed. */
export type PendingPage = {
  pageId: string;
  pageName: string;
  igUserId: string | null;
  igUsername: string | null;
  token: SealedSecret;
};

// The Pages a callback found, held until the admin picks one (KTD1). Bound to
// tenant and admin, short-lived, deleted on use.
export const socialConnectionPendingTable = pgTable(
  "social_connection_pending",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    adminId: integer("admin_id").notNull(),
    metaUserId: text("meta_user_id").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    pages: jsonb("pages").$type<PendingPage[]>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTenant: index("social_connection_pending_tenant_idx").on(t.tenantId),
  }),
);

export type SocialConnectionPendingRow = typeof socialConnectionPendingTable.$inferSelect;

// One row per draft, platform and post type (KTD4).
export const socialPublicationsTable = pgTable(
  "social_publications",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    draftId: integer("draft_id")
      .notNull()
      .references(() => socialDraftsTable.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // "facebook" | "instagram"
    postType: text("post_type").notNull().default("feed"), // "feed" | "story"
    // "scheduled" | "held" | "publishing" | "published" | "failed" | "cancelled"
    status: text("status").notNull().default("scheduled"),
    // "manual" | "auto" — who asked for it.
    origin: text("origin").notNull().default("manual"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    lastError: text("last_error"),
    // Ids persisted before anything goes live (KTD6): IG container ids
    // (children then parent) or unpublished FB photo ids.
    mediaIds: jsonb("media_ids").$type<string[]>().notNull().default([]),
    // When the IG containers were created (the five-minute window, KTD6a).
    mediaCreatedAt: timestamp("media_created_at", { withTimezone: true }),
    // Object-store paths of the rendered JPEGs, deleted when terminal (KTD7).
    imagePaths: jsonb("image_paths").$type<string[]>().notNull().default([]),
    externalPostId: text("external_post_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    activeUnique: uniqueIndex("social_publications_active_unique")
      .on(t.draftId, t.platform, t.postType)
      .where(sql`status IN ('scheduled', 'held', 'publishing', 'published')`),
    idxDue: index("social_publications_due_idx").on(t.status, t.nextAttemptAt),
    idxTenantDraft: index("social_publications_tenant_draft_idx").on(t.tenantId, t.draftId),
    chkStatus: check(
      "social_publications_status_check",
      sql`"status" IN ('scheduled', 'held', 'publishing', 'published', 'failed', 'cancelled')`,
    ),
    chkPlatform: check(
      "social_publications_platform_check",
      sql`"platform" IN ('facebook', 'instagram')`,
    ),
    chkPostType: check(
      "social_publications_post_type_check",
      sql`"post_type" IN ('feed', 'story')`,
    ),
  }),
);

export type SocialPublicationRow = typeof socialPublicationsTable.$inferSelect;
