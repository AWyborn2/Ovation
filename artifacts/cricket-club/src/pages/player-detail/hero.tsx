import type { ReactNode } from "react";
import { AttrChip, GlassPill, PageHero, initialsOf } from "@/components/broadcast";
import type { Discipline } from "@/lib/use-stats-view";
import { seasonLabel } from "@/lib/season-label";
import { fmt1, fmt2, formatFigures, formatHighScore, type SeasonTotals } from "./season-stats";

export interface HeroStat {
  label: string;
  value: string | number | null;
}

/**
 * The 7-cell strip, batting or bowling (handoff Screen 1 §1). Every figure is
 * a season-level total over the selected range (KTD3).
 */
export function heroStats(t: SeasonTotals, d: Discipline): HeroStat[] {
  if (d === "bowl") {
    return [
      { label: "Matches", value: t.games },
      { label: "Wickets", value: t.wickets },
      { label: "Average", value: fmt2(t.bowlingAverage) },
      { label: "Economy", value: fmt2(t.economy) },
      { label: "Best", value: formatFigures(t.bestBowling) },
      { label: "5WI", value: t.fiveWickets },
      { label: "Maidens", value: t.maidens },
    ];
  }
  return [
    { label: "Matches", value: t.games },
    { label: "Runs", value: t.runs },
    { label: "Average", value: fmt1(t.battingAverage) },
    { label: "High score", value: formatHighScore(t.highScore) },
    { label: "Wickets", value: t.wickets },
    { label: "Best", value: formatFigures(t.bestBowling) },
    { label: "Catches", value: t.catches },
  ];
}

/** A season's shirt number, as `PlayerDetail.shirtNumbers` carries it. */
export interface HeroShirtNumber {
  season: number;
  number: string;
}

/** Most seasons the past-numbers line lists, so it stays a single short line. */
const SHIRT_HISTORY_MAX = 6;

const show = (v: string | number | null) =>
  v == null || v === "" ? "–" : typeof v === "number" ? v.toLocaleString("en-AU") : v;

/**
 * Profile hero: photo (player's own, else the club's action shot, else the
 * brand gradient with initials) fading into the dark panel, cap pill, meta
 * line, name (with the season shirt number beside it when the club numbers
 * shirts, separate from the cap pill), trait chips and the range-aware stat
 * strip. Brand values come
 * from the tenant via `PageHero` / theme tokens, never literals (R7).
 */
export function ProfileHero({
  fullName,
  photo,
  clubPhoto,
  capNumber,
  shirtNumber = null,
  shirtNumbers = [],
  meta,
  chips,
  rangeLabel,
  stats,
  discipline,
  overlay,
}: {
  fullName: string;
  photo: string | null;
  clubPhoto: string | null;
  capNumber: number | null;
  /** Current season's shirt number; absent/null shows nothing (R15). */
  shirtNumber?: string | null;
  /** Numbered seasons, newest first; listed only when more than one. */
  shirtNumbers?: HeroShirtNumber[];
  meta: string | null;
  chips: string[];
  rangeLabel: string;
  stats: HeroStat[];
  discipline: Discipline;
  /** Admin photo controls, pinned bottom-right over the photo. */
  overlay?: ReactNode;
}) {
  const image = photo ?? clubPhoto;
  const [first, ...rest] = fullName.split(" ");
  const shirtHistory =
    shirtNumbers.length > 1
      ? shirtNumbers
          .slice(0, SHIRT_HISTORY_MAX)
          .map((s) => `${seasonLabel(s.season)} #${s.number}`)
          .join(" · ")
      : null;
  return (
    <div className="relative" data-testid="profile-hero">
      <PageHero
        variant="home"
        image={image}
        imagePosition="52% 30%"
        className="min-h-[clamp(420px,46vw,560px)] rounded-[20px] border"
        contentClassName="gap-4 px-[clamp(18px,3vw,40px)] pb-[clamp(18px,3vw,32px)]"
      >
        {!image && (
          <div
            aria-hidden
            data-testid="player-initials"
            className="pointer-events-none absolute right-[6%] top-1/2 -translate-y-1/2 font-serif text-[clamp(96px,16vw,220px)] font-extrabold leading-none text-white/15"
          >
            {initialsOf(fullName)}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          {capNumber != null && <GlassPill>Cap {capNumber}</GlassPill>}
          {meta && (
            <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-white/80">
              {meta}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <h1 className="max-w-[12ch] font-serif text-[clamp(56px,8vw,112px)] font-extrabold uppercase leading-[.88] text-white">
            {first}
            {rest.length > 0 && (
              <>
                {" "}
                <br />
                {rest.join(" ")}
              </>
            )}
          </h1>
          {shirtNumber && (
            <div
              data-testid="hero-shirt-number"
              aria-label={`Shirt number ${shirtNumber}`}
              className="mb-1 rounded-[14px] border-2 border-white/70 bg-black/40 px-3 pb-1 pt-1.5 font-serif text-[clamp(36px,4.6vw,64px)] font-extrabold leading-none tabular-nums text-white"
            >
              #{shirtNumber}
            </div>
          )}
        </div>
        {shirtHistory && (
          <div
            data-testid="hero-shirt-history"
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70"
          >
            {shirtHistory}
          </div>
        )}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <AttrChip key={c} className="border-white/25 bg-black/40 text-white">
                {c}
              </AttrChip>
            ))}
          </div>
        )}
        <div
          className="mt-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--primary))]"
          data-testid="hero-range"
        >
          {rangeLabel}
        </div>
        <dl
          data-testid="hero-stats"
          data-discipline={discipline}
          className="grid max-w-[760px] overflow-hidden rounded-[12px] border border-white/15 [grid-template-columns:repeat(auto-fill,minmax(96px,1fr))]"
        >
          {stats.map((s) => (
            <div
              key={s.label}
              className="bg-black/70 px-3.5 py-3 [box-shadow:1px_0_0_rgb(255_255_255/.12),0_1px_0_rgb(255_255_255/.12)]"
            >
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
                {s.label}
              </dt>
              <dd className="font-serif text-[clamp(24px,2.6vw,34px)] font-bold leading-[1.05] tabular-nums text-white">
                {show(s.value)}
              </dd>
            </div>
          ))}
        </dl>
      </PageHero>
      {overlay && (
        <div className="absolute bottom-3 right-3 flex items-center gap-2">{overlay}</div>
      )}
    </div>
  );
}
