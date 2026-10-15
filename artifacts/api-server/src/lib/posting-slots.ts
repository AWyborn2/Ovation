import { and, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import {
  db,
  socialDraftsTable,
  socialPublicationsTable,
  socialSettingsTable,
  tenantsTable,
  type SocialDraftRow,
} from "@workspace/db";
import { layoutBlocksAutomation } from "@workspace/scorecard/kind-templates";
import { loadAutoPost, persistDueDrafts } from "./effective-draft-state";
import { notifyCardsNeedApproval, notifyPostsDue } from "./draft-notifications";
import {
  OPEN_DRAFT_STATUSES,
  computePlacement,
  loadPostingSchedule,
  placeUnscheduled,
  withPlacementLock,
} from "./posting-writer";
import type { PostingSchedule } from "./posting-schedule";
import { loadConnection, publishingAvailable } from "./publishing/connections";
import { ScheduleConflictError, schedulePublications } from "./publishing/publications";
import type { Platform } from "./publishing/destination";

/**
 * When a card's planned time arrives (posting calendar, plan 2026-10-07-003,
 * U4). Runs for a calendar club on the hourly sweep, and at the start of each
 * PlayHQ runner pass; a no-op for a club that hasn't switched the calendar on.
 *
 *  1. Cards that have no time yet (never placed, or no free slot last time)
 *     are placed.
 *  2. Automatic cards past the club's age limit expire.
 *  3. With auto-post on, a card still awaiting review at its time is approved
 *     (its `auto_ready_at` follows the planned time — the one clock, KTD9).
 *  4. Each approved card at its time is sent once: published through Meta
 *     when the club publishes automatically, else a ready-to-share nudge.
 *  5. An unapproved automatic card rolls to its kind's next free slot; one
 *     the admin pinned stays put, overdue, and is reminded about once.
 *
 * Every transition is a guarded update that re-checks what it read, and the
 * notices list only the rows those updates changed, so overlapping runs and a
 * concurrent drag never double-act or double-notify (KTD12).
 */

type Logger = {
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

/** A rolled card is reminded about this many times, then left to expire quietly. */
export const MAX_ROLL_REMINDERS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PostingSlotsSummary = {
  placed: number;
  expired: number;
  promoted: number;
  published: number;
  nudged: number;
  rolled: number;
  overdue: number;
};

const EMPTY: PostingSlotsSummary = {
  placed: 0,
  expired: 0,
  promoted: 0,
  published: 0,
  nudged: 0,
  rolled: 0,
  overdue: 0,
};

/** Whether the club publishes approved cards to Meta itself (KTD9), and where. */
async function publishGate(tenantId: number): Promise<Platform[] | null> {
  const [row] = await db
    .select({ autoPublish: socialSettingsTable.autoPublishEnabled })
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  if (!row?.autoPublish || !(await publishingAvailable(tenantId))) return null;
  const connection = await loadConnection(tenantId);
  if (connection?.status !== "connected") return null;
  return connection.igUserId ? ["facebook", "instagram"] : ["facebook"];
}

function isJunior(d: SocialDraftRow): boolean {
  return d.sourceMatchIsJunior || (d.cardInput as { junior?: unknown } | null)?.junior === true;
}

/**
 * Send one approved card at its time. In one transaction: stamp it sent, then
 * (gate open, senior, layout clear) create its posts — so a failed insert
 * rolls the stamp back and the next run tries again. A card that already has
 * posts (scheduled by hand from the drawer) counts as sent. Returns what
 * happened, or null when another run got there first.
 */
async function dispatch(
  row: SocialDraftRow,
  platforms: Platform[] | null,
  now: Date,
): Promise<"published" | "nudged" | "existing" | null> {
  return db.transaction(async (tx) => {
    const [d] = await tx
      .update(socialDraftsTable)
      .set({ dispatchedAt: now })
      .where(
        and(
          eq(socialDraftsTable.id, row.id),
          eq(socialDraftsTable.status, "ready"),
          isNull(socialDraftsTable.dispatchedAt),
          isNull(socialDraftsTable.expiredAt),
          sql`${socialDraftsTable.plannedAt} = ${row.plannedAt}`,
        ),
      )
      .returning();
    if (!d) return null;
    const [existing] = await tx
      .select({ id: socialPublicationsTable.id })
      .from(socialPublicationsTable)
      .where(
        and(
          eq(socialPublicationsTable.draftId, d.id),
          ne(socialPublicationsTable.status, "cancelled"),
        ),
      )
      .limit(1);
    if (existing) return "existing";
    const handMadeUnpinned = d.engine === "adhoc" && d.plannedBy !== "admin";
    const layoutBlocked = layoutBlocksAutomation({
      templateVersion: d.templateVersion,
      layoutCheckPending: d.layoutCheckPending,
      layoutWarnings: d.layoutWarnings as Partial<Record<string, unknown[]>> | null,
    });
    if (platforms && !isJunior(d) && !handMadeUnpinned && !layoutBlocked) {
      const planned = d.plannedAt as Date;
      await schedulePublications(
        {
          tenantId: d.tenantId,
          draftId: d.id,
          platforms,
          postTypes: ["feed"],
          at: planned.getTime() > now.getTime() ? planned : now,
          origin: "auto",
        },
        tx,
      );
      return "published";
    }
    return "nudged";
  });
}

/** Roll an unapproved automatic card to its kind's next free slot (or the tray). */
async function roll(
  row: SocialDraftRow,
  schedule: PostingSchedule,
  now: Date,
): Promise<{ rollCount: number } | null> {
  return withPlacementLock(row.tenantId, async (tx) => {
    const next = await computePlacement(tx, row, schedule, now, 0);
    const [d] = await tx
      .update(socialDraftsTable)
      .set({
        plannedAt: next,
        plannedBy: next ? "auto" : null,
        rollCount: sql`${socialDraftsTable.rollCount} + 1`,
        ...(row.autoReadyAt !== null ? { autoReadyAt: next ?? row.autoReadyAt } : {}),
      })
      .where(
        and(
          eq(socialDraftsTable.id, row.id),
          eq(socialDraftsTable.status, "awaiting_review"),
          eq(socialDraftsTable.plannedBy, "auto"),
          isNull(socialDraftsTable.dispatchedAt),
          isNull(socialDraftsTable.expiredAt),
          sql`${socialDraftsTable.plannedAt} = ${row.plannedAt}`,
        ),
      )
      .returning({ rollCount: socialDraftsTable.rollCount });
    return d ?? null;
  });
}

/**
 * Run the posting slots for every active club with the calendar on. Called at
 * the start of each PlayHQ runner pass (before its scrapes, so a slot isn't
 * held up by a long match-day scrape) and by the five-minute publish job when
 * it runs. A club whose run throws is logged and skipped.
 */
export async function runPostingSlotsForAll(
  now: Date,
  logger: Logger,
): Promise<{ tenantId: number; ok: boolean }[]> {
  const rows = await db
    .select({ tenantId: socialSettingsTable.tenantId })
    .from(socialSettingsTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, socialSettingsTable.tenantId))
    .where(
      and(
        sql`(${socialSettingsTable.postingSchedule}->>'enabled')::boolean is true`,
        isNull(tenantsTable.suspendedAt),
      ),
    );
  const results: { tenantId: number; ok: boolean }[] = [];
  for (const { tenantId } of rows) {
    try {
      await runPostingSlots(tenantId, now, logger);
      results.push({ tenantId, ok: true });
    } catch (err) {
      logger.error({ err, tenantId }, "posting slots failed");
      results.push({ tenantId, ok: false });
    }
  }
  return results;
}

export async function runPostingSlots(
  tenantId: number,
  now: Date,
  logger: Logger,
): Promise<PostingSlotsSummary> {
  const schedule = await loadPostingSchedule(tenantId);
  if (!schedule.enabled) return { ...EMPTY };
  const summary = { ...EMPTY };

  summary.placed = await placeUnscheduled(tenantId, schedule, now);

  // Automatic cards past the age limit leave the calendar. A pinned card
  // stays: the admin chose its time.
  const tooOld = new Date(now.getTime() - schedule.ageLimitDays * DAY_MS);
  const expired = await db
    .update(socialDraftsTable)
    .set({ expiredAt: now })
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        inArray(socialDraftsTable.status, [...OPEN_DRAFT_STATUSES]),
        isNull(socialDraftsTable.dispatchedAt),
        isNull(socialDraftsTable.expiredAt),
        sql`${socialDraftsTable.plannedBy} is distinct from 'admin'`,
        sql`coalesce(${socialDraftsTable.sourceImportedAt}, ${socialDraftsTable.createdAt}) < ${tooOld}`,
      ),
    )
    .returning({ id: socialDraftsTable.id });
  summary.expired = expired.length;

  if ((await loadAutoPost(tenantId)).enabled) {
    summary.promoted = (await persistDueDrafts(tenantId, now)).length;
  }

  const due = await db
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        lte(socialDraftsTable.plannedAt, now),
        inArray(socialDraftsTable.status, [...OPEN_DRAFT_STATUSES]),
        isNull(socialDraftsTable.dispatchedAt),
        isNull(socialDraftsTable.expiredAt),
      ),
    )
    .orderBy(socialDraftsTable.plannedAt, socialDraftsTable.id);

  const platforms = due.some((d) => d.status === "ready") ? await publishGate(tenantId) : null;
  const nudged: number[] = [];
  const rolled: number[] = [];
  const overdue: number[] = [];
  for (const row of due) {
    try {
      if (row.status === "ready") {
        const result = await dispatch(row, platforms, now);
        if (result === "published") summary.published++;
        if (result === "nudged") nudged.push(row.id);
      } else if (row.plannedBy === "auto") {
        const r = await roll(row, schedule, now);
        if (r) {
          summary.rolled++;
          if (r.rollCount <= MAX_ROLL_REMINDERS) rolled.push(row.id);
        }
      } else {
        const [d] = await db
          .update(socialDraftsTable)
          .set({ overdueNotifiedAt: now })
          .where(
            and(
              eq(socialDraftsTable.id, row.id),
              eq(socialDraftsTable.status, "awaiting_review"),
              isNull(socialDraftsTable.overdueNotifiedAt),
              sql`${socialDraftsTable.plannedAt} = ${row.plannedAt}`,
            ),
          )
          .returning({ id: socialDraftsTable.id });
        if (d) {
          summary.overdue++;
          overdue.push(row.id);
        }
      }
    } catch (err) {
      // A concurrent manual schedule took the slot: the next run sees its posts.
      if (err instanceof ScheduleConflictError) continue;
      logger.error({ err, tenantId, draftId: row.id }, "posting slot failed");
    }
  }
  summary.nudged = nudged.length;
  await notifyPostsDue(tenantId, nudged, logger);
  await notifyCardsNeedApproval(tenantId, rolled, overdue, logger);
  return summary;
}
