import { pgTable, serial, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * PlayHQ scheduled-sync incidents (docs/plans/2026-10-01-001-feat-playhq-scheduled-sync-plan.md,
 * U8/U9). Platform-level, keyed by PlayHQ organisation rather than tenant: one org feeds every
 * tenant linked to it. At most one OPEN incident per org (partial unique index), which is what
 * makes alerts fire once per incident — the watchdog emails and notifies only when it opens or
 * resolves a row, never while one stays open.
 */
export const playhqSyncIncidentsTable = pgTable(
  "playhq_sync_incidents",
  {
    id: serial("id").primaryKey(),
    orgId: text("org_id").notNull(),
    // "overdue" (a due plan has waited too long) | "failed" (the latest run failed).
    kind: text("kind").notNull(),
    detail: jsonb("detail").$type<{ reasons: string[] }>().notNull().default({ reasons: [] }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    uqOpenPerOrg: uniqueIndex("playhq_sync_incidents_open_org_uidx")
      .on(t.orgId)
      .where(sql`"resolved_at" IS NULL`),
    idxOrgOpened: index("playhq_sync_incidents_org_opened_idx").on(t.orgId, t.openedAt),
  }),
);

export type PlayhqSyncIncidentRow = typeof playhqSyncIncidentsTable.$inferSelect;
