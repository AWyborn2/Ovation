import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

/**
 * Email distribution lists (.10x/decisions/architect/email-distribution-lists.md).
 * A club keeps named lists of contacts; a team-sheet list covers one or more
 * senior grades and is emailed the printable sheet when a side is finalised
 * (or by hand). Tenant-curated content; addresses are admin-only PII and never
 * reach the send log.
 */
export type EmailListKind = "team_sheet" | "social";
/**
 * Which side of the club a team-sheet list serves, fixed at creation (decision
 * of 20 Oct 2026): a junior list covers junior teams only and a senior list
 * senior grades only, so junior contacts and children's names never share a
 * list with senior ones. Social lists are always "senior" (club-level).
 */
export type EmailListSection = "senior" | "junior";
export type TeamSheetSendMode = "on_publish" | "manual" | "scheduled" | "off";
export type EmailListSettings = {
  /** team_sheet lists: when a finalised side is emailed. */
  sendMode?: TeamSheetSendMode;
  /** team_sheet lists in scheduled mode: day of week (0 = Sunday) and HH:MM, Australia/Perth. */
  schedule?: { dow: number; time: string } | null;
  /** team_sheet lists: re-send when a side is re-finalised (absent = on). */
  resendOnChange?: boolean;
  /** social lists: email each card as it becomes ready to post. */
  assetReady?: boolean;
  /** social lists: one email per sweep listing new cards awaiting review. */
  reviewNeeded?: boolean;
  /** social lists: one email per sweep listing new milestone / achievement cards. */
  milestone?: boolean;
};

export const emailListsTable = pgTable(
  "email_lists",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    kind: text("kind").$type<EmailListKind>().notNull(),
    section: text("section").$type<EmailListSection>().notNull().default("senior"),
    name: text("name").notNull(),
    settings: jsonb("settings").$type<EmailListSettings>().notNull().default({}),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindCheck: check("email_lists_kind_check", sql`${t.kind} IN ('team_sheet', 'social')`),
    sectionCheck: check("email_lists_section_check", sql`${t.section} IN ('senior', 'junior')`),
    idxTenant: index("email_lists_tenant_idx").on(t.tenantId),
  }),
);

export const emailListMembersTable = pgTable(
  "email_list_members",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    listId: integer("list_id")
      .notNull()
      .references(() => emailListsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqEmail: uniqueIndex("email_list_members_list_email_unique").on(
      t.listId,
      sql`lower(${t.email})`,
    ),
  }),
);

/** The senior grades (app grade key, e.g. "A Grade") a team-sheet list covers. */
export const emailListTeamsTable = pgTable(
  "email_list_teams",
  {
    tenantId: tenantIdColumn(),
    listId: integer("list_id")
      .notNull()
      .references(() => emailListsTable.id, { onDelete: "cascade" }),
    gradeKey: text("grade_key").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.listId, t.gradeKey] }),
    idxTenantGrade: index("email_list_teams_tenant_grade_idx").on(t.tenantId, t.gradeKey),
  }),
);

export type EmailSendStatus = "queued" | "sending" | "sent" | "failed" | "skipped";

/**
 * The outbox and send log in one: a row is queued alongside the state change it
 * reports, drained after commit and retried by the hourly sweep. No addresses
 * are stored — members are resolved at send time; only the count is kept.
 */
export const emailSendsTable = pgTable(
  "email_sends",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    listId: integer("list_id")
      .notNull()
      .references(() => emailListsTable.id, { onDelete: "cascade" }),
    // "team_sheet" (PR1); social kinds follow in PR2.
    kind: text("kind").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: integer("subject_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    // Send-time context captured at enqueue, e.g. { origin } for the sheet's logo.
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").$type<EmailSendStatus>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    recipientCount: integer("recipient_count").notNull().default(0),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => ({
    statusCheck: check(
      "email_sends_status_check",
      sql`${t.status} IN ('queued', 'sending', 'sent', 'failed', 'skipped')`,
    ),
    idxTenantQueued: index("email_sends_tenant_queued_idx").on(t.tenantId, t.queuedAt),
    idxStatus: index("email_sends_status_idx").on(t.status),
  }),
);

export type EmailListRow = typeof emailListsTable.$inferSelect;
export type EmailListMemberRow = typeof emailListMembersTable.$inferSelect;
export type EmailSendRow = typeof emailSendsTable.$inferSelect;
