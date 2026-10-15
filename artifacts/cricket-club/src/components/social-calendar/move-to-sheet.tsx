import { useEffect, useMemo, useState } from "react";
import type { PostingSchedule, SocialCalendarCard } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { draftHeading } from "@/components/social-queue/draft-meta";
import {
  STEP_MINUTES,
  addDays,
  clubDay,
  clubInstant,
  formatClubTime,
  formatDayLabel,
  formatMinutes,
  weekdayOf,
} from "./calendar-time";

type Props = {
  card: SocialCalendarCard | null;
  schedule: PostingSchedule | null;
  pending: boolean;
  error: string | null;
  onMove: (card: SocialCalendarCard, at: Date) => void;
  onUnschedule: (card: SocialCalendarCard) => void;
  onClose: () => void;
};

const QUICK_DAYS = 7;
const PICK_DAYS = 14;

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * "Move to…" — the way to move a card on a phone, and the keyboard path on
 * desktop (WCAG 2.5.7: dragging always has a single-pointer alternative).
 * Quick picks are the card kind's own posting times over the next week; any
 * other club-time day and 15-minute time can be chosen below.
 */
export function MoveToSheet({
  card,
  schedule,
  pending,
  error,
  onMove,
  onUnschedule,
  onClose,
}: Props) {
  const today = clubDay(new Date());
  const [day, setDay] = useState(today);
  const [minutes, setMinutes] = useState(18 * 60);

  useEffect(() => {
    if (!card) return;
    setDay(card.draft.plannedAt ? clubDay(new Date(card.draft.plannedAt)) : today);
  }, [card, today]);

  const quick = useMemo(() => {
    if (!card || !schedule) return [];
    const kind = (
      schedule.kinds as unknown as Record<string, { slots: { day: number; time: string }[] }>
    )[card.slotKind];
    const out: Date[] = [];
    for (let i = 0; i < QUICK_DAYS; i++) {
      const d = addDays(today, i);
      for (const s of kind?.slots ?? []) {
        if (s.day !== weekdayOf(d)) continue;
        const at = clubInstant(d, minutesOf(s.time));
        if (at.getTime() > Date.now()) out.push(at);
      }
    }
    return out.sort((a, b) => a.getTime() - b.getTime());
  }, [card, schedule, today]);

  const times: number[] = [];
  for (let m = 0; m < 24 * 60; m += STEP_MINUTES) times.push(m);
  const days = Array.from({ length: PICK_DAYS }, (_, i) => addDays(today, i));
  const chosen = clubInstant(day, minutes);
  const chosenPast = chosen.getTime() < Date.now();

  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move “{card ? draftHeading(card.draft) : ""}”</DialogTitle>
          <DialogDescription>Times are club time. A time you choose stays put.</DialogDescription>
        </DialogHeader>
        {quick.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">This card's posting times</p>
            <div className="flex flex-wrap gap-2">
              {quick.map((at) => {
                const d = clubDay(at);
                return (
                  <Button
                    key={at.toISOString()}
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => card && onMove(card, at)}
                  >
                    {formatDayLabel(d)}, {formatClubTime(at)}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="move-day">Day</Label>
            <select
              id="move-day"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {formatDayLabel(d)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="move-time">Time</Label>
            <select
              id="move-time"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
            >
              {times.map((m) => (
                <option key={m} value={m}>
                  {formatMinutes(m)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {chosenPast && <p className="text-xs text-destructive">That time has already passed.</p>}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          {card?.draft.plannedAt ? (
            <Button variant="ghost" disabled={pending} onClick={() => card && onUnschedule(card)}>
              Take off the calendar
            </Button>
          ) : (
            <span />
          )}
          <Button disabled={pending || chosenPast} onClick={() => card && onMove(card, chosen)}>
            {pending ? "Moving…" : "Move here"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
