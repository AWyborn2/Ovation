import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateSocialSettings,
  getGetSocialSettingsQueryKey,
  type RoundSchedule,
  type RoundSchedules,
  type SocialSettings,
} from "@workspace/api-client-react";
import { SaveBar, SettingsCard, SettingsRow } from "@/components/admin-ui";

type Card = keyof RoundSchedules;

export const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** "6 pm", "12 pm", "12 am". */
export function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? "am" : "pm"}`;
}

/** "Sunday at 7 pm". */
export function whenLabel(s: Pick<RoundSchedule, "day" | "hour">): string {
  return `${DAYS[s.day]} at ${hourLabel(s.hour)}`;
}

const FALLBACK: RoundSchedules = {
  gameDay: { mode: "perFixture", day: 4, hour: 18 },
  teamLists: { mode: "perFixture", day: 5, hour: 12 },
  weekendWrap: { mode: "off", day: 0, hour: 19 },
};

const ROWS: { card: Card; label: string; helper: string }[] = [
  { card: "gameDay", label: "Game day", helper: "The round's fixtures as one carousel." },
  { card: "teamLists", label: "Team lists", helper: "Every published XI as one carousel." },
  {
    card: "weekendWrap",
    label: "Results, ladders and leaderboards",
    helper: "Last round's carousels, drafted once the round is played.",
  },
];

/** Which round carousels the club's Posting Plan drafts (and so need a time). */
export function roundCarouselsInUse(settings: SocialSettings | undefined): Record<Card, boolean> {
  const rows = settings?.postingPlan?.rows;
  const round = (r: { enabled: boolean; packaging: string } | undefined) =>
    !!r && r.enabled && r.packaging !== "individual";
  return {
    gameDay: round(rows?.gameDay),
    teamLists: round(rows?.teamLists),
    weekendWrap: round(rows?.results) || round(rows?.ladders) || round(rows?.clubLeaderboards),
  };
}

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50";

/**
 * When the round carousels draft (balanced card sets U5; plan 2026-10-07-001
 * R20): the day and time for each round carousel the Posting Plan turns on.
 * Which cards post as a round carousel is chosen on the Posting Plan tab;
 * this card keeps only their timing until per-card times arrive. Times are
 * club time (Perth).
 */
export function RoundSchedulesCard({ settings }: { settings: SocialSettings | undefined }) {
  const qc = useQueryClient();
  const saved = settings?.roundSchedules ?? FALLBACK;
  const [form, setForm] = useState<RoundSchedules>(saved);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setForm(settings?.roundSchedules ?? FALLBACK), [settings]);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const inUse = roundCarouselsInUse(settings);
  const rows = ROWS.filter((r) => inUse[r.card]);

  const update = useUpdateSocialSettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        qc.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
      },
      onError: () => setError("Couldn't save the times. Try again."),
    },
  });

  // Only the day and hour change here; each card keeps the mode the plan set.
  const set = (card: Card, patch: Pick<Partial<RoundSchedule>, "day" | "hour">) =>
    setForm((f) => ({ ...f, [card]: { ...f[card], ...patch } }));

  return (
    <div id="round-schedules" className="scroll-mt-20 space-y-3">
      <SettingsCard
        title="Round carousel times"
        description={
          <>
            When each round carousel is drafted, Perth time. Choose which cards post as a round
            carousel on the{" "}
            <Link href="/admin/social/plan" className="underline underline-offset-2">
              Posting Plan
            </Link>
            .
          </>
        }
      >
        {rows.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            No cards post as a round carousel yet.
          </p>
        ) : (
          rows.map(({ card, label, helper }) => (
            <SettingsRow
              key={card}
              label={label}
              helper={`${helper} Every ${whenLabel(form[card])}.`}
              htmlFor={`round-${card}-day`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <select
                  id={`round-${card}-day`}
                  className={selectClass}
                  value={form[card].day}
                  disabled={!settings}
                  onChange={(e) => set(card, { day: Number(e.target.value) })}
                  aria-label={`${label}: day`}
                >
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
                <select
                  className={selectClass}
                  value={form[card].hour}
                  disabled={!settings}
                  onChange={(e) => set(card, { hour: Number(e.target.value) })}
                  aria-label={`${label}: time`}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </div>
            </SettingsRow>
          ))
        )}
      </SettingsCard>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <SaveBar
        dirty={dirty}
        saving={update.isPending}
        onSave={() => update.mutate({ data: { roundSchedules: form } })}
        onReset={() => {
          setForm(saved);
          setError(null);
        }}
      />
    </div>
  );
}
