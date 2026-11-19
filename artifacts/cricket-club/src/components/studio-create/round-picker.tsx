/**
 * Create → Carousel set → Fill it from: pick a season, then one round or several
 * (a whole weekend, or a run of rounds), with the date range behind "Use dates
 * instead". Team List and Match Day list this season's fixtures; Results and
 * Match Summary every season the club has played. Junior sets read the junior
 * rounds only (`/juniors/carousel-rounds`), never the senior ones.
 *
 * A pick sets the carousel's dates to span the rounds and limits its games to
 * theirs, which can still be ticked or unticked. Switching to dates keeps those
 * dates; switching back keeps the rounds picked.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getGetCarouselRoundsQueryKey,
  getGetJuniorCarouselRoundsQueryKey,
  useGetCarouselRounds,
  useGetJuniorCarouselRounds,
  type CarouselRound,
  type CarouselRounds,
} from "@workspace/api-client-react";
import type { CarouselSetType } from "@workspace/scorecard/queued-carousel";
import type { WeekendCarouselState } from "@/components/weekend-carousel/use-weekend-carousel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Target = Pick<WeekendCarouselState, "from" | "to" | "applyRange">;
export type PickMode = "rounds" | "dates";

/** "2026-11-22" → "22/11/2026". */
export const dmy = (day: string) => day.split("-").reverse().join("/");

/** A round's dates as the picker shows them. */
export const roundDates = (r: Pick<CarouselRound, "from" | "to">) =>
  r.from === r.to ? dmy(r.from) : `${dmy(r.from)} to ${dmy(r.to)}`;

/** The dates spanning the rounds picked, and their games. */
export function spanOf(rounds: readonly CarouselRound[]) {
  if (!rounds.length) return null;
  const days = rounds.flatMap((r) => [r.from, r.to]).sort();
  return {
    from: days[0]!,
    to: days[days.length - 1]!,
    ids: [...new Set(rounds.flatMap((r) => r.gameIds))],
  };
}

export function useRoundPick(s: Target, setType: CarouselSetType, audience: "senior" | "junior") {
  const junior = audience === "junior";
  const params = { setType };
  const seniorQ = useGetCarouselRounds(params, {
    query: { queryKey: getGetCarouselRoundsQueryKey(params), enabled: !junior },
  });
  const juniorQ = useGetJuniorCarouselRounds(params, {
    query: { queryKey: getGetJuniorCarouselRoundsQueryKey(params), enabled: junior },
  });
  const q = junior ? juniorQ : seniorQ;
  const data = q.data as CarouselRounds | undefined;

  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<PickMode>("rounds");
  const [season, setSeason] = useState<number | null>(null);
  const [keys, setKeys] = useState<string[]>([]);

  // Open on the server's default: the next round, or the latest completed one.
  // With no labelled round (or no answer), the dates.
  useEffect(() => {
    if (ready) return;
    if (q.isError) {
      setMode("dates");
      setReady(true);
    } else if (data) {
      setSeason(data.defaultSeason ?? data.seasons[0]?.season ?? null);
      setKeys(data.defaultRounds);
      if (data.defaultSeason === null) setMode("dates");
      setReady(true);
    }
  }, [ready, data, q.isError]);

  const seasonRow = data?.seasons.find((x) => x.season === season) ?? null;
  const picked = useMemo(
    () => seasonRow?.rounds.filter((r) => keys.includes(r.key)) ?? [],
    [seasonRow, keys],
  );

  // Carry the pick to the carousel: the rounds' dates and games, or (dates) every
  // game between whatever dates are showing. Each game keeps the tick the admin
  // gave it across the switch, both ways; the extra games the dates bring in come
  // in unticked, so the switch never ticks more than the admin did.
  // Opening on dates (no labelled round) ticks every game, as before.
  const sig = JSON.stringify([ready, mode, season, keys, !!seasonRow]);
  const lastMode = useRef<PickMode | null>(null);
  useEffect(() => {
    if (!ready) return;
    const span = spanOf(picked);
    const switched = lastMode.current === "rounds";
    lastMode.current = mode;
    if (mode === "dates")
      s.applyRange({ from: s.from, to: s.to, ids: null }, switched ? "unticked" : "ticked");
    else if (span) s.applyRange(span);
    else s.applyRange({ from: s.from, to: s.to, ids: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return {
    loading: !ready,
    error: q.isError,
    seasons: data?.seasons ?? [],
    mode,
    setMode,
    season,
    setSeason: (n: number) => {
      setSeason(n);
      setKeys([]);
    },
    rounds: seasonRow?.rounds ?? [],
    keys,
    toggle: (key: string) =>
      setKeys((ks) => (ks.includes(key) ? ks.filter((k) => k !== key) : [...ks, key])),
  };
}

export type RoundPick = ReturnType<typeof useRoundPick>;

const HINTS: Record<CarouselSetType, string> = {
  teamList: "Upcoming and recent rounds from this season's fixtures.",
  matchDay: "Upcoming and recent rounds from this season's fixtures.",
  results: "Any round, from any season the club has played.",
  matchSummary: "Any round, from any season the club has played.",
};

export function RoundPicker({
  pick,
  setType,
  disabled,
}: {
  pick: RoundPick;
  setType: CarouselSetType;
  disabled: boolean;
}) {
  if (pick.loading)
    return <p className="text-sm text-muted-foreground">Loading seasons and rounds…</p>;
  if (pick.mode === "dates")
    return (
      <div className="space-y-1">
        {pick.error && (
          <p role="alert" className="text-sm text-destructive">
            Couldn&rsquo;t load the club&rsquo;s seasons and rounds. Pick dates instead.
          </p>
        )}
        {pick.seasons.length > 0 && (
          <Button
            variant="link"
            className="h-auto px-0"
            disabled={disabled}
            onClick={() => pick.setMode("rounds")}
          >
            Pick a season and round instead
          </Button>
        )}
      </div>
    );
  return (
    <div className="space-y-3" data-testid="round-picker">
      <p className="text-sm text-muted-foreground">{HINTS[setType]}</p>
      <div className="space-y-1">
        <Label htmlFor="carousel-season">Season</Label>
        <select
          id="carousel-season"
          className="block h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={pick.season ?? ""}
          disabled={disabled}
          onChange={(e) => pick.setSeason(Number(e.target.value))}
        >
          {pick.seasons.map((x) => (
            <option key={x.season} value={x.season}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Rounds</legend>
        <p className="text-xs text-muted-foreground">
          Tick one round or several, such as a whole weekend.
        </p>
        <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
          {pick.rounds.map((r) => (
            <li key={r.key}>
              <label className="flex items-center gap-3 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                  checked={pick.keys.includes(r.key)}
                  disabled={disabled}
                  onChange={() => pick.toggle(r.key)}
                />
                <span className="flex-1 font-medium">{r.label}</span>
                <span className="text-xs text-muted-foreground">
                  {roundDates(r)} · {r.gameIds.length} {r.gameIds.length === 1 ? "game" : "games"}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <Button
        variant="link"
        className="h-auto px-0"
        disabled={disabled}
        onClick={() => pick.setMode("dates")}
      >
        Use dates instead
      </Button>
    </div>
  );
}
