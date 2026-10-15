import { Router, type IRouter } from "express";
import { and, eq, gte, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import {
  db,
  fixturesTable,
  socialDraftsTable,
  socialPublicationsTable,
  type SocialDraftRow,
} from "@workspace/db";
import {
  GetSocialCalendarQueryParams,
  SetSocialDraftPlannedTimeBody,
  UnscheduleSocialDraftBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { effectiveDraftStatus, loadAutoPost, type AutoPost } from "../lib/effective-draft-state";
import { draftPublishing, publicationsByDraft } from "../lib/publishing/publications";
import {
  ROUND_SLOT_KINDS,
  SLOT_KIND_LABELS,
  addDaysToKey,
  clubDate,
  clubDayStart,
  slotKindOf,
  type PostingSchedule,
} from "../lib/posting-schedule";
import { slotOccurrences, STEP_MINUTES } from "../lib/posting-placement";
import {
  OPEN_DRAFT_STATUSES,
  loadPostingSchedule,
  withPlacementLock,
} from "../lib/posting-writer";
import { countOpenCards } from "../lib/posting-switchover";
import { CLUB_TIME_ZONE } from "../lib/round-schedules";
import { notAnUntouchedEditorDraft } from "./social-drafts";

/**
 * The posting calendar's own API (plan 2026-10-07-003, U5): the week's cards
 * with their planned times, the Unscheduled tray, placeholders and each day's
 * count against the cap; moving a card to a time (a pin); taking one off the
 * calendar. Every query is scoped to the request's tenant.
 */
const router: IRouter = Router();

const MAX_RANGE_DAYS = 14;
const MINUTE = 60_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseId(raw: unknown): number | null {
  const id = Number.parseInt(String(raw), 10);
  return Number.isInteger(id) ? id : null;
}

/** When a card sits on the calendar: its planned time, or when it was posted by hand. */
function cardTime(d: SocialDraftRow): Date | null {
  return d.plannedAt ?? (d.status === "posted" ? d.reviewedAt : null);
}

/** Its time passed while it still waits for approval. */
function isOverdue(d: SocialDraftRow, autoPost: AutoPost, now: Date): boolean {
  return (
    d.plannedAt !== null &&
    d.plannedAt.getTime() <= now.getTime() &&
    d.dispatchedAt === null &&
    d.expiredAt === null &&
    effectiveDraftStatus(d, autoPost, now) === "awaiting_review"
  );
}

type Warnings = { overCapDays: Set<string>; gapIds: Set<number> };

/** Days over the cap, and cards closer than the gap to another post. */
function warningsFor(
  timed: { id: number; at: Date }[],
  schedule: Pick<PostingSchedule, "dailyCap" | "minGapMinutes">,
): Warnings & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  for (const c of timed) {
    const key = clubDate(c.at).key;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const overCapDays = new Set(
    [...counts].filter(([, n]) => n > schedule.dailyCap).map(([k]) => k),
  );
  const gapIds = new Set<number>();
  const gap = schedule.minGapMinutes * MINUTE;
  if (gap > 0) {
    const sorted = [...timed].sort((a, b) => a.at.getTime() - b.at.getTime());
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].at.getTime() - sorted[i - 1].at.getTime() < gap) {
        gapIds.add(sorted[i].id);
        gapIds.add(sorted[i - 1].id);
      }
    }
  }
  return { counts, overCapDays, gapIds };
}

function warningText(
  d: SocialDraftRow,
  w: Warnings,
  schedule: Pick<PostingSchedule, "dailyCap" | "minGapMinutes">,
): string | null {
  const at = cardTime(d);
  if (!at) return null;
  if (w.overCapDays.has(clubDate(at).key)) {
    return `This day is over the club's cap of ${schedule.dailyCap} posts.`;
  }
  if (w.gapIds.has(d.id)) {
    return `Closer than ${schedule.minGapMinutes} minutes to another post.`;
  }
  return null;
}

async function presentCards(
  tenantId: number,
  rows: SocialDraftRow[],
  autoPost: AutoPost,
  now: Date,
  warning: (d: SocialDraftRow) => string | null,
) {
  const pubs = await publicationsByDraft(
    tenantId,
    rows.map((r) => r.id),
  );
  return rows.map((d) => ({
    draft: {
      ...d,
      status: effectiveDraftStatus(d, autoPost, now),
      ...draftPublishing(pubs.get(d.id)),
    },
    slotKind: slotKindOf((d.cardInput as { kind?: unknown } | null)?.kind),
    overdue: isOverdue(d, autoPost, now),
    warning: warning(d),
  }));
}

/** Every timed card that counts toward the cap and gap on the given days. */
async function timedCards(tenantId: number, start: Date, end: Date): Promise<SocialDraftRow[]> {
  return db
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        ne(socialDraftsTable.status, "dismissed"),
        isNull(socialDraftsTable.expiredAt),
        notAnUntouchedEditorDraft,
        or(
          and(gte(socialDraftsTable.plannedAt, start), lt(socialDraftsTable.plannedAt, end)),
          and(
            isNull(socialDraftsTable.plannedAt),
            eq(socialDraftsTable.status, "posted"),
            gte(socialDraftsTable.reviewedAt, start),
            lt(socialDraftsTable.reviewedAt, end),
          ),
        ),
      ),
    )
    .orderBy(socialDraftsTable.plannedAt, socialDraftsTable.id);
}

router.get("/social-calendar", requireAdmin, async (req, res): Promise<void> => {
  const parsed = GetSocialCalendarQueryParams.safeParse(req.query);
  if (!parsed.success || !DATE_RE.test(parsed.data.from) || !DATE_RE.test(parsed.data.to)) {
    res.status(400).json({ error: "from and to must be YYYY-MM-DD" });
    return;
  }
  const { from, to } = parsed.data;
  const days: string[] = [];
  for (let k = from; k <= to && days.length <= MAX_RANGE_DAYS; k = addDaysToKey(k, 1)) days.push(k);
  if (days.length === 0 || days.length > MAX_RANGE_DAYS) {
    res.status(400).json({ error: `Pick 1 to ${MAX_RANGE_DAYS} days.` });
    return;
  }
  const tenantId = getTenantId(req);
  const now = new Date();
  const schedule = await loadPostingSchedule(tenantId);
  const autoPost = await loadAutoPost(tenantId);
  const start = clubDayStart(from);
  const end = clubDayStart(addDaysToKey(to, 1));

  const rows = await timedCards(tenantId, start, end);
  const w = warningsFor(
    rows.map((d) => ({ id: d.id, at: cardTime(d) as Date })),
    schedule,
  );

  const trayRows = await db
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        inArray(socialDraftsTable.status, [...OPEN_DRAFT_STATUSES]),
        isNull(socialDraftsTable.dispatchedAt),
        notAnUntouchedEditorDraft,
        or(isNull(socialDraftsTable.plannedAt), isNotNull(socialDraftsTable.expiredAt)),
      ),
    )
    .orderBy(socialDraftsTable.createdAt);

  // Placeholders: a round card's slot with an upcoming fixture near it and no
  // card of that kind on the day yet (KTD14).
  const placeholders: { slotKind: string; label: string; at: string }[] = [];
  if (schedule.enabled) {
    const fixtures = await db
      .select({ startAt: fixturesTable.startAt })
      .from(fixturesTable)
      .where(
        and(
          eq(fixturesTable.tenantId, tenantId),
          gte(fixturesTable.startAt, new Date(start.getTime() - 7 * 24 * 60 * MINUTE)),
          lt(fixturesTable.startAt, new Date(end.getTime() + 7 * 24 * 60 * MINUTE)),
        ),
      );
    const week = 7 * 24 * 60 * MINUTE;
    for (const kind of ROUND_SLOT_KINDS) {
      const from = new Date(Math.max(start.getTime(), now.getTime()));
      for (const at of slotOccurrences(schedule.kinds[kind], from, end, CLUB_TIME_ZONE)) {
        if (at.getTime() >= end.getTime()) continue;
        // Results follow the games; game day and team lists come before them.
        const near = fixtures.some((f) =>
          kind === "roundResults"
            ? f.startAt.getTime() <= at.getTime() && f.startAt.getTime() > at.getTime() - week
            : f.startAt.getTime() >= at.getTime() && f.startAt.getTime() < at.getTime() + week,
        );
        const dayKey = clubDate(at).key;
        const covered = rows.some(
          (d) =>
            slotKindOf((d.cardInput as { kind?: unknown } | null)?.kind) === kind &&
            clubDate(cardTime(d) as Date).key === dayKey,
        );
        if (near && !covered) {
          placeholders.push({ slotKind: kind, label: SLOT_KIND_LABELS[kind], at: at.toISOString() });
        }
      }
    }
  }

  res.json({
    enabled: schedule.enabled,
    from,
    to,
    timeZone: CLUB_TIME_ZONE,
    dailyCap: schedule.dailyCap,
    minGapMinutes: schedule.minGapMinutes,
    days: days.map((date) => ({
      date,
      count: w.counts.get(date) ?? 0,
      overCap: w.overCapDays.has(date),
      gapWarnings: rows
        .filter((d) => w.gapIds.has(d.id) && clubDate(cardTime(d) as Date).key === date)
        .map((d) => d.id),
    })),
    cards: await presentCards(tenantId, rows, autoPost, now, (d) => warningText(d, w, schedule)),
    unscheduled: await presentCards(tenantId, trayRows, autoPost, now, () => null),
    placeholders,
    openCards: schedule.enabled ? 0 : await countOpenCards(tenantId),
  });
});

/** The card as the calendar shows it, with its day's warning. */
async function calendarCard(tenantId: number, d: SocialDraftRow) {
  const schedule = await loadPostingSchedule(tenantId);
  const autoPost = await loadAutoPost(tenantId);
  const now = new Date();
  let warning: string | null = null;
  const at = cardTime(d);
  if (at) {
    const key = clubDate(at).key;
    const rows = await timedCards(tenantId, clubDayStart(key), clubDayStart(addDaysToKey(key, 1)));
    // Neighbours just over midnight still count for the gap.
    const w = warningsFor(
      rows.map((r) => ({ id: r.id, at: cardTime(r) as Date })),
      schedule,
    );
    warning = warningText(d, w, schedule);
  }
  const [card] = await presentCards(tenantId, [d], autoPost, now, () => warning);
  return card;
}

class CalendarRefusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const sameTime = (a: Date | null, b: Date | string | null | undefined) =>
  (a === null && (b === null || b === undefined)) ||
  (a !== null && b != null && a.getTime() === new Date(b).getTime());

/** Lock the draft's posts; refuse when one is already going out. */
async function lockPublications(
  tx: Parameters<Parameters<typeof withPlacementLock>[1]>[0],
  draftId: number,
) {
  const rows = await tx
    .select()
    .from(socialPublicationsTable)
    .where(eq(socialPublicationsTable.draftId, draftId))
    .for("update");
  if (rows.some((p) => p.status === "publishing" || p.status === "published")) {
    throw new CalendarRefusal(409, "This card is already going out, so it can't be moved.");
  }
  return rows;
}

router.put(
  "/social-drafts/:id/planned-time",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    const parsed = SetSocialDraftPlannedTimeBody.safeParse(req.body ?? {});
    if (id === null || !parsed.success) {
      res.status(400).json({ error: "Send plannedAt and expectedPlannedAt." });
      return;
    }
    const tenantId = getTenantId(req);
    const schedule = await loadPostingSchedule(tenantId);
    if (!schedule.enabled) {
      res.status(409).json({ error: "Turn on the posting calendar first." });
      return;
    }
    const requested = new Date(parsed.data.plannedAt);
    if (Number.isNaN(requested.getTime())) {
      res.status(400).json({ error: "That isn't a time." });
      return;
    }
    const step = STEP_MINUTES * MINUTE;
    const at = new Date(Math.round(requested.getTime() / step) * step);
    const now = new Date();
    if (at.getTime() < now.getTime() - step) {
      res.status(400).json({ error: "That time has already passed." });
      return;
    }
    try {
      const updated = await withPlacementLock(tenantId, async (tx) => {
        const [d] = await tx
          .select()
          .from(socialDraftsTable)
          .where(and(eq(socialDraftsTable.id, id), eq(socialDraftsTable.tenantId, tenantId)));
        if (!d) throw new CalendarRefusal(404, "Not found");
        if (!(OPEN_DRAFT_STATUSES as readonly string[]).includes(d.status)) {
          throw new CalendarRefusal(409, `A ${d.status} card can't be moved.`);
        }
        if (!sameTime(d.plannedAt, parsed.data.expectedPlannedAt)) {
          throw new CalendarRefusal(409, "Someone else moved this card. Here's where it is now.");
        }
        const pubs = await lockPublications(tx, d.id);
        const open = pubs.filter((p) => p.status === "scheduled" || p.status === "held");
        if (open.length) {
          await tx
            .update(socialPublicationsTable)
            .set({ scheduledFor: at, nextAttemptAt: at, updatedAt: now })
            .where(
              inArray(
                socialPublicationsTable.id,
                open.map((p) => p.id),
              ),
            );
        }
        const [row] = await tx
          .update(socialDraftsTable)
          .set({
            plannedAt: at,
            plannedBy: "admin",
            expiredAt: null,
            overdueNotifiedAt: null,
            // Posts already scheduled are its send; otherwise it goes again at the new time.
            ...(open.length ? {} : { dispatchedAt: null }),
            ...(d.autoReadyAt !== null ? { autoReadyAt: at } : {}),
          })
          .where(eq(socialDraftsTable.id, d.id))
          .returning();
        return row;
      });
      res.json(await calendarCard(tenantId, updated));
    } catch (err) {
      if (err instanceof CalendarRefusal) {
        const [current] = await db
          .select()
          .from(socialDraftsTable)
          .where(and(eq(socialDraftsTable.id, id), eq(socialDraftsTable.tenantId, tenantId)));
        res.status(err.status).json({
          error: err.message,
          ...(current && err.status === 409 ? { card: await calendarCard(tenantId, current) } : {}),
        });
        return;
      }
      throw err;
    }
  },
);

router.post(
  "/social-drafts/:id/unschedule",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    const parsed = UnscheduleSocialDraftBody.safeParse(req.body ?? {});
    if (id === null || !parsed.success) {
      res.status(400).json({ error: "Send expectedPlannedAt." });
      return;
    }
    const tenantId = getTenantId(req);
    try {
      const updated = await withPlacementLock(tenantId, async (tx) => {
        const [d] = await tx
          .select()
          .from(socialDraftsTable)
          .where(and(eq(socialDraftsTable.id, id), eq(socialDraftsTable.tenantId, tenantId)));
        if (!d) throw new CalendarRefusal(404, "Not found");
        if (!(OPEN_DRAFT_STATUSES as readonly string[]).includes(d.status)) {
          throw new CalendarRefusal(409, `A ${d.status} card can't be moved.`);
        }
        if (!sameTime(d.plannedAt, parsed.data.expectedPlannedAt)) {
          throw new CalendarRefusal(409, "Someone else moved this card. Here's where it is now.");
        }
        await lockPublications(tx, d.id);
        await tx
          .update(socialPublicationsTable)
          .set({ status: "cancelled", lastError: "Taken off the calendar.", updatedAt: new Date() })
          .where(
            and(
              eq(socialPublicationsTable.draftId, d.id),
              inArray(socialPublicationsTable.status, ["scheduled", "held"]),
            ),
          );
        // Pinned with no time: placement leaves it in the tray until a drag.
        const [row] = await tx
          .update(socialDraftsTable)
          .set({
            plannedAt: null,
            plannedBy: "admin",
            autoReadyAt: null,
            dispatchedAt: null,
            overdueNotifiedAt: null,
          })
          .where(eq(socialDraftsTable.id, d.id))
          .returning();
        return row;
      });
      res.json(await calendarCard(tenantId, updated));
    } catch (err) {
      if (err instanceof CalendarRefusal) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      throw err;
    }
  },
);

export default router;
