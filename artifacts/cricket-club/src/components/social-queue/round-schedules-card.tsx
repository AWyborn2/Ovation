import { useEffect, useState } from "react";
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
type Mode = RoundSchedule["mode"];

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

/** What a schedule does, in a sentence, for the row's helper. */
export function describeSchedule(card: Card, s: RoundSchedule): string {
  if (s.mode === "off") return "Not drafted automatically.";
  if (s.mode === "perFixture") {
    return card === "gameDay"
      ? "One card per match, two days before it."
      : "One card per team, as soon as its XI is published.";
  }
  const when = `${DAYS[s.day]} at ${hourLabel(s.hour)}`;
  if (card === "gameDay") return `The whole round as one set, every ${when}.`;
  if (card === "teamLists") return `Every published XI as one set, every ${when}.`;
  return `Last round's results as one set, every ${when}.`;
}

const CARDS: { card: Card; label: string; modes: { value: Mode; label: string }[] }[] = [
  {
    card: "gameDay",
    label: "Game day",
    modes: [
      { value: "perFixture", label: "Each match" },
      { value: "perRound", label: "Whole round" },
      { value: "off", label: "Off" },
    ],
  },
  {
    card: "teamLists",
    label: "Team lists",
    modes: [
      { value: "perFixture", label: "Each team" },
      { value: "perRound", label: "Whole round" },
      { value: "off", label: "Off" },
    ],
  },
  {
    card: "weekendWrap",
    label: "Weekend wrap",
    modes: [
      { value: "perRound", label: "Whole round" },
      { value: "off", label: "Off" },
    ],
  },
];

const FALLBACK: RoundSchedules = {
  gameDay: { mode: "perFixture", day: 4, hour: 18 },
  teamLists: { mode: "perFixture", day: 5, hour: 12 },
  weekendWrap: { mode: "off", day: 0, hour: 19 },
};

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50";

/**
 * When the round cards draft themselves (balanced card sets U5): game day and
 * team lists per match or as one round set at a chosen day and time, and the
 * weekend wrap at a chosen day and time. A round set posts as a cover plus
 * even cards. Times are club time (Perth).
 */
export function RoundSchedulesCard({ settings }: { settings: SocialSettings | undefined }) {
  const qc = useQueryClient();
  const saved = settings?.roundSchedules ?? FALLBACK;
  const [form, setForm] = useState<RoundSchedules>(saved);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setForm(settings?.roundSchedules ?? FALLBACK), [settings]);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const matchdayOn = settings?.familyConfig?.matchday.enabled ?? false;
  const roundupOn = settings?.familyConfig?.roundup.enabled ?? false;

  const update = useUpdateSocialSettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        qc.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
      },
      onError: () => setError("Couldn't save the schedule. Try again."),
    },
  });

  const set = (card: Card, patch: Partial<RoundSchedule>) =>
    setForm((f) => ({ ...f, [card]: { ...f[card], ...patch } }));

  return (
    <div id="round-schedules" className="scroll-mt-20 space-y-3">
      <SettingsCard
        title="Round cards"
        description="When game day, team lists and the weekend wrap draft themselves. A whole round posts as a cover plus even cards, never 6 on one and 1 on another. Times are Perth time."
      >
        {CARDS.map(({ card, label, modes }) => {
          const s = form[card];
          const familyOn = card === "weekendWrap" ? roundupOn : matchdayOn;
          const helper = familyOn
            ? describeSchedule(card, s)
            : `Switch on ${card === "weekendWrap" ? "Round-up" : "Match day"} in Automation above first.`;
          return (
            <SettingsRow key={card} label={label} helper={helper} htmlFor={`round-${card}-mode`}>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  id={`round-${card}-mode`}
                  className={selectClass}
                  value={s.mode}
                  disabled={!settings}
                  onChange={(e) => set(card, { mode: e.target.value as Mode })}
                  aria-label={`${label}: how it drafts`}
                >
                  {modes.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {s.mode === "perRound" && (
                  <>
                    <select
                      className={selectClass}
                      value={s.day}
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
                      value={s.hour}
                      onChange={(e) => set(card, { hour: Number(e.target.value) })}
                      aria-label={`${label}: time`}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {hourLabel(h)}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </SettingsRow>
          );
        })}
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
