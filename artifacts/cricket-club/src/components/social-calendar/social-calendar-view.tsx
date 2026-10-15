import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPendingSocialDraftCountQueryKey,
  getGetSocialCalendarQueryKey,
  getListSocialDraftsQueryKey,
  setSocialDraftPlannedTime,
  unscheduleSocialDraft,
  useGetSocialCalendar,
  type PostingSchedule,
  type SocialCalendar,
  type SocialCalendarCard,
  type SocialDraft,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ListSkeleton, QueryError } from "@/components/data-states";
import { usePointerDrag, type DragVerdict } from "@/components/selection/use-pointer-drag";
import { WeekGrid, PX_PER_MINUTE } from "./week-grid";
import { DayList } from "./day-list";
import { UnscheduledTray } from "./unscheduled-tray";
import { MoveToSheet } from "./move-to-sheet";
import {
  addDays,
  clubDay,
  clubInstant,
  formatClubTime,
  formatDayLabel,
  gridHours,
  isPast,
  minutesAtY,
  mondayOf,
  weekDays,
} from "./calendar-time";
import { draftHeading } from "@/components/social-queue/draft-meta";

type DropAt = { day: string; minutes: number };

function errorText(err: unknown, fallback: string): string {
  const data = (err as { data?: { error?: string } } | null)?.data;
  return data?.error ?? fallback;
}

type Props = {
  view: "week" | "list";
  schedule: PostingSchedule | null;
  onOpenDraft: (draft: SocialDraft) => void;
};

/**
 * The queue's Week and List views (plan 2026-10-07-003, U7): the same cards,
 * one week at a time. Moves are optimistic — the card jumps at once, and goes
 * back with the server's reason if the move is refused or someone else moved
 * it first. Every move is announced to screen readers.
 */
export function SocialCalendarView({ view, schedule, onOpenDraft }: Props) {
  const qc = useQueryClient();
  const today = clubDay(new Date());
  const [monday, setMonday] = useState(() => mondayOf(today));
  const days = useMemo(() => weekDays(monday), [monday]);
  const params = { from: days[0], to: days[6] };
  const key = getGetSocialCalendarQueryKey(params);
  const q = useGetSocialCalendar(params, { query: { queryKey: key } });
  const cal = q.data as SocialCalendar | undefined;

  const [moving, setMoving] = useState<SocialCalendarCard | null>(null);
  const [pending, setPending] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetSocialCalendarQueryKey() });
    qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetPendingSocialDraftCountQueryKey() });
  };

  const findCard = (id: number) =>
    cal?.cards.find((c) => c.draft.id === id) ?? cal?.unscheduled.find((c) => c.draft.id === id);

  /** Move a card: show it at the new time at once, then confirm with the server. */
  async function move(card: SocialCalendarCard, at: Date) {
    setPending(true);
    setMoveError(null);
    setProblem(null);
    const previous = qc.getQueryData<SocialCalendar>(key);
    if (previous) {
      const moved = {
        ...card,
        draft: { ...card.draft, plannedAt: at.toISOString(), plannedBy: "admin" as const },
      };
      qc.setQueryData<SocialCalendar>(key, {
        ...previous,
        cards: [...previous.cards.filter((c) => c.draft.id !== card.draft.id), moved],
        unscheduled: previous.unscheduled.filter((c) => c.draft.id !== card.draft.id),
      });
    }
    try {
      const result = await setSocialDraftPlannedTime(card.draft.id, {
        plannedAt: at.toISOString(),
        expectedPlannedAt: card.draft.plannedAt ?? null,
      });
      const where = `${formatDayLabel(clubDay(at))} at ${formatClubTime(at)}`;
      setAnnounce(
        `${draftHeading(card.draft)} moved to ${where}.${result.warning ? ` ${result.warning}` : ""}`,
      );
      if (result.warning) setProblem(result.warning);
      setMoving(null);
    } catch (err) {
      if (previous) qc.setQueryData(key, previous);
      const message = errorText(err, "We couldn't move that card. Try again.");
      setMoveError(message);
      setProblem(message);
      setAnnounce(message);
    } finally {
      setPending(false);
      refresh();
    }
  }

  async function unschedule(card: SocialCalendarCard) {
    setPending(true);
    setMoveError(null);
    try {
      await unscheduleSocialDraft(card.draft.id, {
        expectedPlannedAt: card.draft.plannedAt ?? null,
      });
      setAnnounce(`${draftHeading(card.draft)} taken off the calendar.`);
      setMoving(null);
    } catch (err) {
      setMoveError(errorText(err, "We couldn't take that card off the calendar."));
    } finally {
      setPending(false);
      refresh();
    }
  }

  const { startMinutes, endMinutes } = useMemo(
    () =>
      gridHours([
        ...(cal?.cards ?? [])
          .map((c) => c.draft.plannedAt ?? c.draft.reviewedAt)
          .filter((t): t is string => !!t)
          .map((t) => new Date(t)),
        ...(cal?.placeholders ?? []).map((p) => new Date(p.at)),
      ]),
    [cal],
  );

  const drag = usePointerDrag<DropAt>({
    readTarget: (zone, point) => {
      const day = zone.dataset.day;
      if (zone.dataset.drop !== "day" || !day) return null;
      const top = zone.getBoundingClientRect().top;
      return { day, minutes: minutesAtY(point.y, top, PX_PER_MINUTE, startMinutes) };
    },
    check: (_id, target): DragVerdict =>
      isPast(target.day, target.minutes)
        ? { ok: false, message: "That time has already passed." }
        : { ok: true },
    onDrop: (id, target) => {
      const card = findCard(id);
      if (!card) return;
      if (isPast(target.day, target.minutes)) {
        setProblem("That time has already passed.");
        setAnnounce("That time has already passed.");
        return;
      }
      void move(card, clubInstant(target.day, target.minutes));
    },
  });

  const info = useMemo(() => new Map((cal?.days ?? []).map((d) => [d.date, d])), [cal]);

  if (q.isLoading) return <ListSkeleton rows={6} />;
  if (q.isError || !cal) {
    return (
      <QueryError
        message="We couldn't load the posting calendar. Please try again."
        onRetry={() => q.refetch()}
      />
    );
  }

  const open = (c: SocialCalendarCard) => onOpenDraft(c.draft);
  const empty = cal.cards.length === 0 && cal.placeholders.length === 0;

  return (
    <div className="space-y-4">
      <p className="sr-only" aria-live="polite" role="status">
        {announce}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMonday(addDays(monday, -7))}>
            Previous week
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonday(mondayOf(today))}>
            This week
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonday(addDays(monday, 7))}>
            Next week
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatDayLabel(days[0])} – {formatDayLabel(days[6])} · club time · up to {cal.dailyCap}{" "}
          posts a day, {cal.minGapMinutes} minutes apart
        </p>
      </div>
      {problem && (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          role="alert"
        >
          {problem}
        </p>
      )}
      <UnscheduledTray
        cards={cal.unscheduled}
        draggingId={drag.draggingId}
        onOpen={open}
        onMoveTo={setMoving}
        onPointerDown={view === "week" ? drag.onPointerDown : undefined}
      />
      {empty && (
        <p className="text-sm text-muted-foreground">
          Nothing is planned this week. New cards get a time when they're drafted, from your posting
          schedule.
        </p>
      )}
      {view === "week" ? (
        <WeekGrid
          days={days}
          info={info}
          dailyCap={cal.dailyCap}
          cards={cal.cards}
          placeholders={cal.placeholders}
          startMinutes={startMinutes}
          endMinutes={endMinutes}
          today={today}
          draggingId={drag.draggingId}
          onOpen={(c) => !drag.shouldSuppressClick() && open(c)}
          onMoveTo={setMoving}
          onPointerDown={drag.onPointerDown}
        />
      ) : (
        <DayList
          days={days}
          info={info}
          dailyCap={cal.dailyCap}
          cards={cal.cards}
          placeholders={cal.placeholders}
          today={today}
          onOpen={open}
          onMoveTo={setMoving}
        />
      )}
      <MoveToSheet
        card={moving}
        schedule={schedule}
        pending={pending}
        error={moveError}
        onMove={(c, at) => void move(c, at)}
        onUnschedule={(c) => void unschedule(c)}
        onClose={() => {
          setMoving(null);
          setMoveError(null);
        }}
      />
    </div>
  );
}
