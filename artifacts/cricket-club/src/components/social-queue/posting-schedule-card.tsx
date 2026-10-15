import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSocialCalendarQueryKey,
  getGetSocialSettingsQueryKey,
  getListSocialDraftsQueryKey,
  updateSocialSettings,
  type PostingKind,
  type PostingSchedule,
  type PostingSwitchover,
} from "@workspace/api-client-react";
import { X } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/confirm-dialog";
import { formatMinutes } from "@/components/social-calendar/calendar-time";

/** The kinds in the order a club thinks about them, with plain names. */
export const SLOT_KINDS: { key: keyof PostingSchedule["kinds"]; label: string }[] = [
  { key: "teamLists", label: "Team lists" },
  { key: "gameDay", label: "Game day" },
  { key: "results", label: "Match results" },
  { key: "roundResults", label: "Round results carousel" },
  { key: "milestones", label: "Milestones" },
  { key: "debuts", label: "Debuts" },
  { key: "achievements", label: "Centuries, five-fors and records" },
  { key: "roundUp", label: "Round-ups, ladders and leaderboards" },
  { key: "other", label: "Everything else" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");
const TIMES = Array.from(
  { length: 96 },
  (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`,
);
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: PostingSchedule;
  /** Open cards a switch-on would place (from the calendar read). */
  openCards: number;
};

function summary(s: PostingSwitchover): string {
  const parts = [
    s.placed ? `${s.placed} card${s.placed === 1 ? "" : "s"} placed` : "",
    s.pinned ? `${s.pinned} kept at their scheduled time` : "",
    s.unscheduled ? `${s.unscheduled} in the Unscheduled tray` : "",
    s.restored ? `${s.restored} handed back to auto-post` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") + "." : "No cards needed moving.";
}

/**
 * The club's posting schedule (plan 2026-10-07-003, U6): weekly posting times
 * per card kind, what happens when several share one, and the daily cap, gap
 * and age limit. Turning the calendar on or off asks first, saying what will
 * happen to the cards already in the queue.
 */
export function PostingScheduleDialog({ open, onOpenChange, schedule, openCards }: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<PostingSchedule>(schedule);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [adding, setAdding] = useState<Record<string, { day: number; time: string }>>({});

  // Start from the saved schedule each time the dialog opens — not when a
  // save refetches settings, which would wipe the result just shown.
  useEffect(() => {
    if (open) {
      setDraft(schedule);
      setError(null);
      setResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setKind = (key: keyof PostingSchedule["kinds"], kind: PostingKind) =>
    setDraft((d) => ({ ...d, kinds: { ...d.kinds, [key]: kind } }));

  const capOk = Number.isInteger(draft.dailyCap) && draft.dailyCap >= 1 && draft.dailyCap <= 20;
  const ageOk =
    Number.isInteger(draft.ageLimitDays) && draft.ageLimitDays >= 1 && draft.ageLimitDays <= 30;

  async function save() {
    if (!capOk || !ageOk) return;
    const switchingOn = draft.enabled && !schedule.enabled;
    const switchingOff = !draft.enabled && schedule.enabled;
    if (switchingOn) {
      const ok = await confirm({
        title: "Turn on the posting calendar?",
        description: `${openCards} card${openCards === 1 ? "" : "s"} waiting in the queue will get a posting time from this schedule. Auto-post then approves cards at their posting time instead of after a review window.`,
        confirmText: "Turn it on",
      });
      if (!ok) return;
    }
    if (switchingOff) {
      const ok = await confirm({
        title: "Turn off the posting calendar?",
        description:
          "Cards go back to auto-post's review window. Any whose window has already passed may become ready, or publish, at once.",
        confirmText: "Turn it off",
        destructive: true,
      });
      if (!ok) return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await updateSocialSettings({ postingSchedule: draft });
      setResult(saved.postingSwitchover ? summary(saved.postingSwitchover) : "Saved.");
      qc.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetSocialCalendarQueryKey() });
      qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
    } catch (err) {
      const data = (err as { data?: { error?: string } } | null)?.data;
      setError(data?.error ?? "We couldn't save the posting schedule. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Posting schedule</DialogTitle>
          <DialogDescription>
            When each kind of card goes out. Times are club time. New cards take the next free time
            for their kind, without breaking the daily cap or the gap between posts.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
          <div>
            <Label htmlFor="calendar-on" className="font-semibold">
              Plan posts on a calendar
            </Label>
            <p className="text-xs text-muted-foreground">
              Off: cards wait in the queue and auto-post uses its review window.
            </p>
          </div>
          <Switch
            id="calendar-on"
            checked={draft.enabled}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="daily-cap">Posts a day, at most</Label>
            <input
              id="daily-cap"
              type="number"
              min={1}
              max={20}
              value={draft.dailyCap}
              onChange={(e) => setDraft((d) => ({ ...d, dailyCap: Number(e.target.value) }))}
              className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
              aria-invalid={!capOk}
            />
            {!capOk && <p className="text-xs text-destructive">Between 1 and 20.</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="min-gap">Gap between posts</Label>
            <select
              id="min-gap"
              value={draft.minGapMinutes}
              onChange={(e) => setDraft((d) => ({ ...d, minGapMinutes: Number(e.target.value) }))}
              className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
            >
              {Array.from({ length: 17 }, (_, i) => i * 15).map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "No gap" : `${m} minutes`}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="age-limit">Drop cards older than</Label>
            <input
              id="age-limit"
              type="number"
              min={1}
              max={30}
              value={draft.ageLimitDays}
              onChange={(e) => setDraft((d) => ({ ...d, ageLimitDays: Number(e.target.value) }))}
              className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
              aria-invalid={!ageOk}
            />
            <p className={ageOk ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
              {ageOk ? "days" : "Between 1 and 30 days."}
            </p>
          </div>
        </div>

        <ul className="space-y-3">
          {SLOT_KINDS.map(({ key, label }) => {
            const kind = draft.kinds[key];
            const add = adding[key] ?? { day: 0, time: "18:00" };
            return (
              <li key={key} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{label}</p>
                  <select
                    aria-label={`${label}: several in one posting time`}
                    value={kind.collision}
                    onChange={(e) =>
                      setKind(key, {
                        ...kind,
                        collision: e.target.value as PostingKind["collision"],
                      })
                    }
                    className="h-8 rounded-md border border-border bg-card px-2 text-xs"
                  >
                    <option value="space">Several at one time: space them out</option>
                    <option value="roll">Several at one time: one per time, others later</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  {kind.slots.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      No posting times — these cards wait in the Unscheduled tray.
                    </span>
                  )}
                  {kind.slots.map((s, i) => (
                    <span
                      key={`${s.day}-${s.time}-${i}`}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
                    >
                      {DAYS[s.day]} {formatMinutes(minutesOf(s.time))}
                      <button
                        type="button"
                        aria-label={`Remove ${DAYS[s.day]} ${s.time} from ${label}`}
                        onClick={() =>
                          setKind(key, { ...kind, slots: kind.slots.filter((_, j) => j !== i) })
                        }
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`${label}: new posting day`}
                    value={add.day}
                    onChange={(e) =>
                      setAdding((a) => ({ ...a, [key]: { ...add, day: Number(e.target.value) } }))
                    }
                    className="h-8 rounded-md border border-border bg-card px-2 text-xs"
                  >
                    {DAYS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`${label}: new posting time`}
                    value={add.time}
                    onChange={(e) =>
                      setAdding((a) => ({ ...a, [key]: { ...add, time: e.target.value } }))
                    }
                    className="h-8 rounded-md border border-border bg-card px-2 text-xs"
                  >
                    {TIMES.map((t) => (
                      <option key={t} value={t}>
                        {formatMinutes(minutesOf(t))}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      kind.slots.length >= 14 ||
                      kind.slots.some((s) => s.day === add.day && s.time === add.time)
                    }
                    onClick={() => setKind(key, { ...kind, slots: [...kind.slots, add] })}
                  >
                    Add time
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {result && (
          <p className="text-sm text-foreground" role="status">
            {result}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled={saving || !capOk || !ageOk} onClick={() => void save()}>
            {saving ? "Saving…" : "Save schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
