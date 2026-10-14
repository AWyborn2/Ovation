import { and, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { db, socialDraftsTable, socialPublicationsTable, socialSettingsTable } from "@workspace/db";
import { loadConnection, publishingAvailable } from "./connections";
import { ScheduleConflictError, schedulePublications } from "./publications";
import type { Platform } from "./destination";
import { layoutClear } from "../effective-draft-state";

/**
 * Auto-publish at the deadline (plan 2026-10-06-001 U7, R4–R6, KTD11).
 *
 * Candidates come from stored state on every scheduled sweep, not from the
 * drafts that sweep just promoted, so turning auto-publish on (AE2) and
 * recovering from a crash between promotion and scheduling both work. A
 * candidate is:
 *
 *  - ready, with `auto_ready_at` still set — manual actions clear it, so this
 *    means "auto-promoted and untouched";
 *  - first imported within the club's freshness cut-off (`source_imported_at`
 *    is set only when a draft is created, so a corrective re-import never
 *    restarts the clock — R5, AE8);
 *  - not junior (either marker) and not ad-hoc (R6);
 *  - without any publication row yet.
 *
 * Each gets a feed post on every connected platform, scheduled now.
 */

type AutoPublishSettings = { enabled: boolean; freshnessHours: number };

async function loadSettings(tenantId: number): Promise<AutoPublishSettings> {
  const [row] = await db
    .select({
      autoPost: socialSettingsTable.autoPostEnabled,
      autoPublish: socialSettingsTable.autoPublishEnabled,
      hours: socialSettingsTable.autoPublishFreshnessHours,
    })
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  return { enabled: !!row?.autoPost && !!row?.autoPublish, freshnessHours: row?.hours ?? 24 };
}

/** The ids of drafts that may auto-publish now. */
export async function autoPublishCandidates(
  tenantId: number,
  freshnessHours: number,
  now: Date,
): Promise<number[]> {
  const freshSince = new Date(now.getTime() - freshnessHours * 3_600_000);
  const rows = await db
    .select({ id: socialDraftsTable.id })
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        eq(socialDraftsTable.status, "ready"),
        isNotNull(socialDraftsTable.autoReadyAt),
        gte(socialDraftsTable.sourceImportedAt, freshSince),
        eq(socialDraftsTable.sourceMatchIsJunior, false),
        sql`coalesce(${socialDraftsTable.cardInput}->>'junior', 'false') <> 'true'`,
        ne(socialDraftsTable.engine, "adhoc"),
        // A templated card that needs a look is never auto-posted (KTD10).
        layoutClear,
        sql`not exists (select 1 from ${socialPublicationsTable} p where p.draft_id = ${socialDraftsTable.id})`,
      ),
    );
  return rows.map((r) => r.id);
}

/**
 * Schedule every candidate for this club, when auto-publish is on and Meta is
 * connected. Returns the draft ids scheduled (they skip the "ready" notice).
 */
export async function scheduleAutoPublish(tenantId: number, now: Date): Promise<Set<number>> {
  const scheduled = new Set<number>();
  const settings = await loadSettings(tenantId);
  if (!settings.enabled || !(await publishingAvailable(tenantId))) return scheduled;
  const connection = await loadConnection(tenantId);
  if (connection?.status !== "connected") return scheduled;
  const platforms: Platform[] = connection.igUserId ? ["facebook", "instagram"] : ["facebook"];

  for (const draftId of await autoPublishCandidates(tenantId, settings.freshnessHours, now)) {
    try {
      await schedulePublications({
        tenantId,
        draftId,
        platforms,
        postTypes: ["feed"],
        at: now,
        origin: "auto",
      });
      scheduled.add(draftId);
    } catch (err) {
      // A concurrent sweep scheduled it first: fine, it's scheduled.
      if (!(err instanceof ScheduleConflictError)) throw err;
    }
  }
  return scheduled;
}
