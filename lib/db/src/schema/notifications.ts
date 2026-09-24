import { pgTable, serial, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

/**
 * In-app notifications for a club's admins (Social Studio KTD5). One row per
 * event batch — e.g. one per sweep that moved drafts to ready — so the bell
 * never floods. Email is a best-effort echo of the same row.
 */
export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    kind: text("kind").notNull(), // "drafts_ready"
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    // Where the notification leads, e.g. the queue filtered to the batch.
    link: text("link"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => ({
    idxTenantCreated: index("notifications_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

export type NotificationRow = typeof notificationsTable.$inferSelect;
