import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db, socialDraftsTable, socialSettingsTable, type SocialDraftRow } from "@workspace/db";
import { HORIZON_DAYS, placeCard } from "./posting-placement";
import { resolvePostingSchedule, slotKindOf, type PostingSchedule } from "./posting-schedule";

/**
 * Writes planned times (plan 2026-10-07-003, U3, KTD6/KTD7).
 *
 * Every transaction that writes `planned_at` — placement, a roll, a drag, the
 * switch-over backfill — first takes this tenant's advisory lock, then reads
 * the club's planned times, then writes. The hourly sweep and the five-minute
 * publish job can overlap, and two ingests can draft at once, so without the
 * lock two cards could take the same "roll" slot or break the daily cap. No
 * rendering, enrichment or network call runs while it is held.
 */

/** Per-tenant lock key for planned-time writes (pg_advisory_xact_lock(key, tenantId)). */
export const POSTING_LOCK_KEY = 7_311_903;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | Tx;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function loadPostingSchedule(
  tenantId: number,
  exec: Executor = db,
): Promise<PostingSchedule> {
  const [row] = await exec
    .select({ schedule: socialSettingsTable.postingSchedule })
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  return resolvePostingSchedule(row?.schedule ?? null);
}

/** Whether the club has its posting calendar switched on. */
export async function calendarEnabled(tenantId: number, exec: Executor = db): Promise<boolean> {
  return (await loadPostingSchedule(tenantId, exec)).enabled;
}

/** Run `fn` in a transaction holding this tenant's planned-time lock. */
export async function withPlacementLock<T>(
  tenantId: number,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${POSTING_LOCK_KEY}, ${tenantId})`);
    return fn(tx);
  });
}

/** When a draft stops being worth posting: its import (or creation) plus the age limit. */
export function expiryOf(
  draft: Pick<SocialDraftRow, "sourceImportedAt" | "createdAt">,
  schedule: Pick<PostingSchedule, "ageLimitDays">,
): Date {
  const anchor = draft.sourceImportedAt ?? draft.createdAt;
  return new Date(new Date(anchor).getTime() + schedule.ageLimitDays * DAY_MS);
}

type PlannedRow = { id: number; plannedAt: Date; kind: unknown };

/** Every card that still counts toward the cap and gap: planned, not dismissed or expired. */
async function plannedCards(tx: Executor, tenantId: number): Promise<PlannedRow[]> {
  const rows = await tx
    .select({
      id: socialDraftsTable.id,
      plannedAt: socialDraftsTable.plannedAt,
      kind: sql<unknown>`${socialDraftsTable.cardInput}->>'kind'`,
    })
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        isNotNull(socialDraftsTable.plannedAt),
        ne(socialDraftsTable.status, "dismissed"),
        isNull(socialDraftsTable.expiredAt),
      ),
    );
  return rows.filter((r): r is PlannedRow => r.plannedAt !== null);
}

/**
 * The planned time `draft` would get now, given everything else planned.
 * Callers hold the lock.
 */
export async function computePlacement(
  tx: Executor,
  draft: Pick<SocialDraftRow, "id" | "tenantId" | "cardInput" | "sourceImportedAt" | "createdAt">,
  schedule: PostingSchedule,
  now: Date,
  /** A roll passes 0: the slot the card just missed is never reused. */
  graceMinutes?: number,
): Promise<Date | null> {
  const kind = slotKindOf((draft.cardInput as { kind?: unknown } | null)?.kind);
  const others = (await plannedCards(tx, draft.tenantId)).filter((r) => r.id !== draft.id);
  const horizon = Math.min(
    now.getTime() + HORIZON_DAYS * DAY_MS,
    expiryOf(draft, schedule).getTime(),
  );
  return placeCard({
    kind: schedule.kinds[kind],
    dailyCap: schedule.dailyCap,
    minGapMinutes: schedule.minGapMinutes,
    taken: others.map((r) => r.plannedAt),
    sameKindTaken: others.filter((r) => slotKindOf(r.kind) === kind).map((r) => r.plannedAt),
    now,
    horizonEnd: new Date(horizon),
    graceMinutes,
  });
}

/** Statuses a card can still be placed, rolled or sent in. */
export const OPEN_DRAFT_STATUSES = ["awaiting_review", "ready"] as const;

/**
 * Give one draft an automatic planned time (or leave it unscheduled when no
 * slot is free before it expires). Skips a draft the admin has pinned, one
 * already sent or expired, and one no longer open. While the draft may still
 * be auto-approved (its `auto_ready_at` is set), its deadline follows the
 * planned time: the slot is the one clock (KTD9). Returns the planned time.
 */
export async function placeDraftIn(
  tx: Executor,
  tenantId: number,
  draftId: number,
  schedule: PostingSchedule,
  now: Date,
): Promise<Date | null> {
  const [draft] = await tx
    .select()
    .from(socialDraftsTable)
    .where(and(eq(socialDraftsTable.id, draftId), eq(socialDraftsTable.tenantId, tenantId)));
  if (
    !draft ||
    !(OPEN_DRAFT_STATUSES as readonly string[]).includes(draft.status) ||
    draft.plannedBy === "admin" ||
    draft.dispatchedAt !== null ||
    draft.expiredAt !== null
  ) {
    return null;
  }
  const at = await computePlacement(tx, draft, schedule, now);
  if (at === null) {
    if (draft.plannedAt !== null) {
      await tx
        .update(socialDraftsTable)
        .set({ plannedAt: null, plannedBy: null })
        .where(eq(socialDraftsTable.id, draft.id));
    }
    return null;
  }
  await tx
    .update(socialDraftsTable)
    .set({
      plannedAt: at,
      plannedBy: "auto",
      ...(draft.autoReadyAt !== null ? { autoReadyAt: at } : {}),
    })
    .where(eq(socialDraftsTable.id, draft.id));
  return at;
}

/** `placeDraftIn` under the tenant's lock, for a calendar club. Null when it's off. */
export async function placeDraft(
  tenantId: number,
  draftId: number,
  now: Date = new Date(),
): Promise<Date | null> {
  const schedule = await loadPostingSchedule(tenantId);
  if (!schedule.enabled) return null;
  return withPlacementLock(tenantId, (tx) => placeDraftIn(tx, tenantId, draftId, schedule, now));
}

/**
 * Place every generated draft that has no time yet and was never pinned:
 * the recovery path for a crash between insert and placement, and for cards
 * that found no free slot last time. Oldest first. Returns how many were placed.
 */
export async function placeUnscheduled(
  tenantId: number,
  schedule: PostingSchedule,
  now: Date,
): Promise<number> {
  return withPlacementLock(tenantId, async (tx) => {
    const rows = await tx
      .select({ id: socialDraftsTable.id })
      .from(socialDraftsTable)
      .where(
        and(
          eq(socialDraftsTable.tenantId, tenantId),
          inArray(socialDraftsTable.status, [...OPEN_DRAFT_STATUSES]),
          isNull(socialDraftsTable.plannedAt),
          isNull(socialDraftsTable.plannedBy),
          isNull(socialDraftsTable.dispatchedAt),
          isNull(socialDraftsTable.expiredAt),
          ne(socialDraftsTable.engine, "adhoc"),
        ),
      )
      .orderBy(socialDraftsTable.createdAt, socialDraftsTable.id);
    let placed = 0;
    for (const r of rows) {
      if (await placeDraftIn(tx, tenantId, r.id, schedule, now)) placed++;
    }
    return placed;
  });
}
