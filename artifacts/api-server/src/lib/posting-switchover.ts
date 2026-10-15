import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import {
  db,
  socialDraftsTable,
  socialPublicationsTable,
  socialSettingsTable,
} from "@workspace/db";
import {
  OPEN_DRAFT_STATUSES,
  placeDraftIn,
  withPlacementLock,
} from "./posting-writer";
import type { PostingSchedule } from "./posting-schedule";

/**
 * Turning the posting calendar on or off (plan 2026-10-07-003, KTD3).
 *
 * On (first time, or again after being off): every open, unsent, unexpired
 * card is taken into the calendar in one locked pass, oldest first —
 *
 *  - a card that already has posts (scheduled by hand, or by the old
 *    auto-publish while the calendar was off) keeps that time, pinned, and
 *    counts as sent, so it is never published twice;
 *  - a card an admin pinned keeps its time;
 *  - every other generated card is placed from now (a stale time from an
 *    earlier spell is replaced), and its auto-post deadline follows the slot;
 *  - hand-made cards stay in the Unscheduled tray.
 *
 * Off: auto-post takes over again. Only cards automation still owns (their
 * `auto_ready_at` is set — nobody sent them back, reopened or edited them)
 * get their old deadline back: import time plus the club's window. Planned
 * times stay, ignored, so switching on again resumes cleanly.
 */

export type SwitchoverSummary = {
  placed: number;
  pinned: number;
  unscheduled: number;
  restored: number;
};

const EMPTY: SwitchoverSummary = { placed: 0, pinned: 0, unscheduled: 0, restored: 0 };

/** Open automatic cards a switch-on would place (shown before turning it on). */
export async function countOpenCards(tenantId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        inArray(socialDraftsTable.status, [...OPEN_DRAFT_STATUSES]),
        isNull(socialDraftsTable.dispatchedAt),
        isNull(socialDraftsTable.expiredAt),
        ne(socialDraftsTable.engine, "adhoc"),
      ),
    );
  return Number(row?.n ?? 0);
}

export async function switchCalendarOn(
  tenantId: number,
  schedule: PostingSchedule,
  now: Date,
): Promise<SwitchoverSummary> {
  return withPlacementLock(tenantId, async (tx) => {
    const summary = { ...EMPTY };
    const rows = await tx
      .select()
      .from(socialDraftsTable)
      .where(
        and(
          eq(socialDraftsTable.tenantId, tenantId),
          inArray(socialDraftsTable.status, [...OPEN_DRAFT_STATUSES]),
          isNull(socialDraftsTable.dispatchedAt),
          isNull(socialDraftsTable.expiredAt),
        ),
      )
      .orderBy(socialDraftsTable.createdAt, socialDraftsTable.id);

    for (const d of rows) {
      const [pub] = await tx
        .select({ at: sql<Date>`min(${socialPublicationsTable.scheduledFor})` })
        .from(socialPublicationsTable)
        .where(
          and(
            eq(socialPublicationsTable.draftId, d.id),
            ne(socialPublicationsTable.status, "cancelled"),
          ),
        );
      if (pub?.at) {
        await tx
          .update(socialDraftsTable)
          .set({ plannedAt: new Date(pub.at), plannedBy: "admin", dispatchedAt: now })
          .where(eq(socialDraftsTable.id, d.id));
        summary.pinned++;
        continue;
      }
      if (d.plannedBy === "admin" || d.engine === "adhoc") continue;
      // A time from an earlier spell may have passed: place from now.
      if (d.plannedAt !== null) {
        await tx
          .update(socialDraftsTable)
          .set({ plannedAt: null, plannedBy: null })
          .where(eq(socialDraftsTable.id, d.id));
      }
      if (await placeDraftIn(tx, tenantId, d.id, schedule, now)) summary.placed++;
      else summary.unscheduled++;
    }
    return summary;
  });
}

export async function switchCalendarOff(tenantId: number): Promise<SwitchoverSummary> {
  const [settings] = await db
    .select({ hours: socialSettingsTable.autoPostWindowHours })
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  const hours = settings?.hours ?? 12;
  const restored = await db
    .update(socialDraftsTable)
    .set({
      autoReadyAt: sql`coalesce(${socialDraftsTable.sourceImportedAt}, ${socialDraftsTable.createdAt}) + make_interval(hours => ${hours})`,
    })
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        inArray(socialDraftsTable.status, [...OPEN_DRAFT_STATUSES]),
        isNotNull(socialDraftsTable.autoReadyAt),
        isNull(socialDraftsTable.dispatchedAt),
        isNull(socialDraftsTable.expiredAt),
      ),
    )
    .returning({ id: socialDraftsTable.id });
  return { ...EMPTY, restored: restored.length };
}
