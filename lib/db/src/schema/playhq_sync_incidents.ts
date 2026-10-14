import { pgTable, serial, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * PlayHQ scheduled-sync incidents (docs/plans/2026-10-01-001-feat-playhq-scheduled-sync-plan.md,
 * U8/U9). Platform-level, keyed by PlayHQ organisation rather than tenant: one org feeds every
 * tenant linked to it. At most one OPEN incident per org and kind (partial unique index), which
 * is what makes alerts fire once per incident — the watchdog emails and notifies only when it
 * opens or resolves a row, never while one stays open. The watchdog reads only its own kinds
 * (`PLAYHQ_WATCHDOG_INCIDENT_KINDS`).
 *
 * Kind `unclassified_grades` (junior sync plan U4, KTD4) lists an enabled organisation's grades
 * that are neither junior nor senior, for the platform admin: `detail.grades` holds grade
 * names and seasons only, never player names. The watchdog never opens or resolves it.
 */
/** The incident kinds the sync watchdog opens and resolves. */
export const PLAYHQ_WATCHDOG_INCIDENT_KINDS = ["overdue", "failed"] as const;
/** The kind recording an enabled organisation's unclassified grades. */
export const UNCLASSIFIED_GRADES_INCIDENT_KIND = "unclassified_grades";

export interface PlayhqSyncIncidentDetail {
  reasons: string[];
  /** Kind `unclassified_grades`: each grade's name and season, once. */
  grades?: { grade: string; season: string | null }[];
}

export const playhqSyncIncidentsTable = pgTable(
  "playhq_sync_incidents",
  {
    id: serial("id").primaryKey(),
    orgId: text("org_id").notNull(),
    // "overdue" (a due plan has waited too long) | "failed" (the latest run failed) |
    // "unclassified_grades" (an enabled organisation's grades no classifier recognises).
    kind: text("kind").notNull(),
    detail: jsonb("detail").$type<PlayhqSyncIncidentDetail>().notNull().default({ reasons: [] }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    uqOpenPerOrgKind: uniqueIndex("playhq_sync_incidents_open_org_kind_uidx")
      .on(t.orgId, t.kind)
      .where(sql`"resolved_at" IS NULL`),
    idxOrgOpened: index("playhq_sync_incidents_org_opened_idx").on(t.orgId, t.openedAt),
  }),
);

export type PlayhqSyncIncidentRow = typeof playhqSyncIncidentsTable.$inferSelect;
