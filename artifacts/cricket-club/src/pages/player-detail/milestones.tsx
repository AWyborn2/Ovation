import type { ComponentType } from "react";
import { Award, Flag, Flame, Shield, Star, TrendingUp, Trophy, Target } from "lucide-react";
import type {
  PlayerAward,
  PlayerMatchLine,
  PlayerPremiership,
  PlayerSeasonStat,
} from "@workspace/api-client-react";
import { ChartCard } from "@/components/stats-charts";
import {
  careerFirsts,
  sortMatchesChronological,
  tierCrossings,
  type MilestoneTiers,
} from "@/lib/stats-analytics";
import { CricketCap } from "@/components/icons/cricket-cap";
import { inStatsRange, seasonLabel, type StatsView } from "@/lib/use-stats-view";
import { cn } from "@/lib/utils";

export type MilestoneKind =
  | "debut"
  | "aGradeDebut"
  | "firstFifty"
  | "firstHundred"
  | "firstFiveFor"
  | "cap"
  | "premiership"
  | "tier"
  | "award";

export interface MilestoneEvent {
  key: string;
  kind: MilestoneKind;
  title: string;
  sub: string;
  /** Season start year; null = undated (pre-scorecard, or a cap with no date). */
  season: number | null;
  /** Major honours get a solid marker. */
  major: boolean;
  /** A debut that was also the A Grade debut (the cap): shown with the cap icon. */
  aGrade?: boolean;
}

const ICONS: Record<MilestoneKind, ComponentType<{ className?: string }>> = {
  debut: Flag,
  aGradeDebut: CricketCap,
  firstFifty: Star,
  firstHundred: Flame,
  firstFiveFor: Target,
  cap: Shield,
  premiership: Trophy,
  tier: TrendingUp,
  award: Award,
};

const FIRST_TITLES = {
  debut: "Debut",
  firstFifty: "First 50",
  firstHundred: "First 100",
  firstFiveFor: "First five-for",
} as const;

const STAT_NOUN = { games: "games", runs: "runs", wickets: "wickets" } as const;

/** Season start year of a premiership won in calendar `year` (finals Jan–Jun close the previous season). */
export function premiershipSeason(p: Pick<PlayerPremiership, "year" | "matchDate">): number {
  const m = /^(\d{4})-(\d{2})/.exec(p.matchDate ?? "");
  if (m) return Number(m[2]) >= 7 ? Number(m[1]) : Number(m[1]) - 1;
  return p.year - 1;
}

/**
 * "v Opponent", or the competition alone when the opponent field holds a
 * competition label instead ("A Grade: Wyllie Cup" reads "Wyllie Cup").
 */
export function versus(opponent: string | null | undefined): string | null {
  const o = opponent?.trim();
  if (!o) return null;
  const comp = /^[^:]*grade\s*:\s*(.+)$/i.exec(o);
  return comp ? comp[1].trim() : `v ${o}`;
}

const where = (season: number | null, opponent: string | null, pre: boolean) =>
  pre
    ? "Before scorecards"
    : [season != null ? seasonLabel(season) : null, versus(opponent)].filter(Boolean).join(" · ");

const isAGrade = (grade: string | null | undefined) => /^\s*a\s*grade\s*$/i.test(grade ?? "");

/**
 * Every career moment, oldest first: debut / first 50 / first 100 / first
 * five-for (U4 `careerFirsts`), the cap, premierships, tier crossings on the
 * milestones-board ladders (U4 `tierCrossings`, seeded with the pre-scorecard
 * baseline) and club awards where the tenant records them.
 */
export function milestoneEvents({
  matches,
  seasons,
  tiers,
  capNumber,
  premierships,
  awards,
}: {
  matches: ReadonlyArray<PlayerMatchLine>;
  seasons: ReadonlyArray<PlayerSeasonStat>;
  tiers: MilestoneTiers;
  capNumber: number | null;
  premierships: ReadonlyArray<PlayerPremiership>;
  awards: ReadonlyArray<PlayerAward>;
}): MilestoneEvent[] {
  const out: MilestoneEvent[] = [];
  // The A Grade debut (when the cap was earned). Unknown when the player has
  // A Grade games from before the scorecard era.
  const aGradeBeforeScorecards = seasons.some(
    (s) => s.season == null && isAGrade(s.grade) && (s.games ?? 0) > 0,
  );
  const firstAGrade = aGradeBeforeScorecards
    ? null
    : (sortMatchesChronological(matches).find((m) => isAGrade(m.grade)) ?? null);
  const capLabel = capNumber != null ? `Cap ${capNumber}` : null;
  let aGradePlaced = false;

  for (const f of careerFirsts(matches, seasons)) {
    // Club debut and A Grade debut in the same game: one combined moment.
    if (f.kind === "debut" && firstAGrade && f.matchId === firstAGrade.matchId) {
      aGradePlaced = true;
      out.push({
        key: "first-debut",
        kind: "debut",
        title: capLabel ? `Debut · ${capLabel}` : "Debut",
        sub: ["Club & A Grade debut", where(f.season, f.opponent, false)]
          .filter(Boolean)
          .join(" · "),
        season: f.season,
        major: true,
        aGrade: true,
      });
      continue;
    }
    const score =
      f.value != null && f.kind !== "debut"
        ? f.kind === "firstFiveFor"
          ? `${f.value} wkts`
          : `${f.value}${f.notOut ? "*" : ""}`
        : null;
    out.push({
      key: `first-${f.kind}`,
      kind: f.kind,
      title: FIRST_TITLES[f.kind],
      sub: [where(f.season, f.opponent, f.preScorecard), score].filter(Boolean).join(" · "),
      season: f.season,
      major: false,
    });
  }
  if (firstAGrade && !aGradePlaced) {
    // A later A Grade debut: its own moment, dated where the cap was earned.
    out.push({
      key: "a-grade-debut",
      kind: "aGradeDebut",
      title: capLabel ? `A Grade debut · ${capLabel}` : "A Grade debut",
      sub: where(firstAGrade.season ?? null, firstAGrade.opponent ?? null, false),
      season: firstAGrade.season ?? null,
      major: true,
    });
  } else if (!firstAGrade && capNumber != null) {
    // The A Grade debut isn't in the scorecards: an undated cap, as before.
    out.push({
      key: "cap",
      kind: "cap",
      title: `Cap ${capNumber}`,
      sub: "Capped player",
      season: null,
      major: true,
    });
  }
  for (const p of premierships) {
    const season = premiershipSeason(p);
    out.push({
      key: `prem-${p.id}`,
      kind: "premiership",
      title: p.isCaptain ? "Premiership (captain)" : "Premiership",
      sub: `${p.grade} · ${seasonLabel(season)}`,
      season,
      major: true,
    });
  }
  for (const c of tierCrossings(matches, seasons, tiers)) {
    out.push({
      key: `tier-${c.stat}-${c.tier}`,
      kind: "tier",
      title: `${c.tier.toLocaleString("en-AU")} ${STAT_NOUN[c.stat]}`,
      sub: where(c.season, c.opponent, c.preScorecard),
      season: c.season,
      major: false,
    });
  }
  for (const a of awards) {
    out.push({
      key: `award-${a.key}-${a.season}`,
      kind: "award",
      title: a.title,
      sub: `${seasonLabel(a.season)} season`,
      season: a.season,
      major: true,
    });
  }
  // Undated first (they sit before the scorecard era), then by season; the
  // stable sort keeps each group's own chronological order within a season.
  return out
    .map((e, i) => ({ e, i }))
    .sort(
      (a, b) =>
        (a.e.season ?? -Infinity) - (b.e.season ?? -Infinity) ||
        Number(a.e.kind === "tier") - Number(b.e.kind === "tier") ||
        a.i - b.i,
    )
    .map(({ e }) => e);
}

/**
 * "Milestone moments": a horizontal career timeline. Labels alternate above and
 * below a 3px line; events outside the selected range fade. Scrolls sideways on
 * narrow screens rather than squashing labels.
 */
export function MilestoneTimeline({
  events,
  view,
  loading,
}: {
  events: MilestoneEvent[];
  view: StatsView;
  loading: boolean;
}) {
  const dated = events.map((e) => e.season).filter((s): s is number => s != null);
  const span = dated.length
    ? `${seasonLabel(Math.min(...dated))} to ${seasonLabel(Math.max(...dated))}`
    : null;
  return (
    <ChartCard
      eyebrow={span ? `Career moments · ${span}` : "Career moments"}
      title="Milestone moments"
      loading={loading}
      points={events.length}
      minPoints={1}
      emptyReason="No milestones recorded yet"
      table={{
        columns: ["Milestone", "When"],
        rows: events.map((e) => [e.title, e.sub]),
      }}
    >
      {/* Scroll container: browsers make it keyboard-focusable on their own. */}
      <div
        role="region"
        aria-label="Milestone moments timeline"
        className="-mx-1 overflow-x-auto pb-2"
      >
        <ol
          className="relative flex min-w-max px-1"
          aria-label="Milestone moments"
          data-testid="milestone-timeline"
        >
          <span
            aria-hidden
            className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-gradient-to-r from-border to-primary"
          />
          {events.map((e, i) => {
            const Icon = e.aGrade ? CricketCap : ICONS[e.kind];
            const inRange =
              e.season == null
                ? view.from == null && view.to == null
                : inStatsRange(e.season, view);
            const label = (
              <div className="w-[128px] text-center">
                <div className="font-serif text-[15px] font-bold uppercase leading-tight text-foreground">
                  {e.title}
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{e.sub}</div>
              </div>
            );
            const above = i % 2 === 0;
            return (
              <li
                key={e.key}
                data-testid="milestone-event"
                data-kind={e.kind}
                data-in-range={inRange}
                className={cn(
                  "relative grid w-[136px] shrink-0 grid-rows-[76px_32px_76px] justify-items-center motion-safe:transition-opacity",
                  !inRange && "opacity-40",
                )}
              >
                <div className="flex flex-col items-center justify-end">
                  {above && (
                    <>
                      {label}
                      <span aria-hidden className="mt-1 h-[18px] w-px bg-border" />
                    </>
                  )}
                </div>
                <span
                  aria-hidden
                  className={cn(
                    "z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary",
                    e.major ? "bg-primary text-primary-foreground" : "bg-card text-primary-text",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex flex-col items-center justify-start">
                  {!above && (
                    <>
                      <span aria-hidden className="mb-1 h-[18px] w-px bg-border" />
                      {label}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </ChartCard>
  );
}
