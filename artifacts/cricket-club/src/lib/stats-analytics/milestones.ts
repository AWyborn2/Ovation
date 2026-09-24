import type {
  MilestoneBoardSettings,
  PlayerMatchLine,
  PlayerSeasonStat,
} from "@workspace/api-client-react";
import { baselineTotals, sortMatchesChronological } from "./range";

/**
 * Profile milestones (timeline + "Next up") from the SAME tier ladders as the
 * public Milestones board, so the two never disagree (plan Assumptions). The
 * board's ladders are tenant settings (`getMilestoneBoardSettings`); the
 * defaults below mirror `artifacts/api-server/src/routes/milestones.ts`, and
 * `milestoneTiers` applies the same "empty → default, sorted ascending" rule.
 *
 * Cumulative views are seeded with the pre-scorecard baseline (KTD3): a tier
 * already passed by the baseline is a `preScorecard` crossing with no match,
 * and a scorecard-era crossing is only recorded when the running total
 * (baseline + match rows) passes it — exactly how the board computes it.
 */

export type MilestoneStat = "games" | "runs" | "wickets";

export interface MilestoneTiers {
  games: number[];
  runs: number[];
  wickets: number[];
}

/** Mirrors DEFAULT_*_TIERS in the api-server milestones route. */
export const DEFAULT_MILESTONE_TIERS: Readonly<MilestoneTiers> = {
  games: [100, 150, 200, 250, 300],
  runs: [1000, 2000, 3000, 5000, 7500, 10000],
  wickets: [100, 150, 200, 300],
};

const ladder = (custom: number[] | null | undefined, fallback: number[]): number[] =>
  (custom?.length ? custom : fallback).slice().sort((a, b) => a - b);

/** The board's ladders from its settings (or the defaults while loading). */
export function milestoneTiers(
  settings?: Partial<
    Pick<MilestoneBoardSettings, "gamesTiers" | "runsTiers" | "wicketsTiers">
  > | null,
): MilestoneTiers {
  return {
    games: ladder(settings?.gamesTiers, DEFAULT_MILESTONE_TIERS.games),
    runs: ladder(settings?.runsTiers, DEFAULT_MILESTONE_TIERS.runs),
    wickets: ladder(settings?.wicketsTiers, DEFAULT_MILESTONE_TIERS.wickets),
  };
}

const STATS: MilestoneStat[] = ["games", "runs", "wickets"];

function matchValue(m: PlayerMatchLine, stat: MilestoneStat): number {
  if (stat === "games") return 1;
  if (stat === "wickets") return m.bowled ? (m.wickets ?? 0) : 0;
  return (m.innings ?? []).reduce((s, i) => s + (i.runs ?? 0), 0);
}

function baselineValue(seasons: ReadonlyArray<PlayerSeasonStat>, stat: MilestoneStat): number {
  const b = baselineTotals(seasons);
  return stat === "games" ? b.games : stat === "runs" ? b.runs : b.wickets;
}

export interface TierCrossing {
  stat: MilestoneStat;
  tier: number;
  tierIndex: number;
  /** Passed within the pre-scorecard baseline — no match or date. */
  preScorecard: boolean;
  matchId: number | null;
  season: number | null;
  opponent: string | null;
  /** Running career total straight after the crossing. */
  value: number;
}

/** Every tier crossed in the career, oldest first per stat. */
export function tierCrossings(
  matches: ReadonlyArray<PlayerMatchLine>,
  seasons: ReadonlyArray<PlayerSeasonStat>,
  tiers: MilestoneTiers = DEFAULT_MILESTONE_TIERS,
): TierCrossing[] {
  const ordered = sortMatchesChronological(matches);
  const out: TierCrossing[] = [];
  for (const stat of STATS) {
    const ladderFor = tiers[stat];
    let running = baselineValue(seasons, stat);
    ladderFor.forEach((tier, tierIndex) => {
      if (running >= tier) {
        out.push({
          stat,
          tier,
          tierIndex,
          preScorecard: true,
          matchId: null,
          season: null,
          opponent: null,
          value: running,
        });
      }
    });
    for (const m of ordered) {
      const prev = running;
      running += matchValue(m, stat);
      ladderFor.forEach((tier, tierIndex) => {
        if (prev < tier && running >= tier) {
          out.push({
            stat,
            tier,
            tierIndex,
            preScorecard: false,
            matchId: m.matchId,
            season: m.season ?? null,
            opponent: m.opponent ?? null,
            value: running,
          });
        }
      });
    }
  }
  return out;
}

export type CareerFirstKind = "debut" | "firstFifty" | "firstHundred" | "firstFiveFor";

export interface CareerFirst {
  kind: CareerFirstKind;
  /** Achieved before the scorecard era (the baseline says so); no match. */
  preScorecard: boolean;
  matchId: number | null;
  season: number | null;
  opponent: string | null;
  /** Runs (50/100), wickets (five-for) or null (debut). */
  value: number | null;
  notOut: boolean;
}

/**
 * Debut, first 50, first 100 and first five-for. Where the baseline shows the
 * feat already happened pre-scorecard, it's returned undated rather than
 * wrongly pinned to the first scorecard match that repeats it.
 */
export function careerFirsts(
  matches: ReadonlyArray<PlayerMatchLine>,
  seasons: ReadonlyArray<PlayerSeasonStat>,
): CareerFirst[] {
  const base = baselineTotals(seasons);
  const ordered = sortMatchesChronological(matches);
  const pre = (kind: CareerFirstKind): CareerFirst => ({
    kind,
    preScorecard: true,
    matchId: null,
    season: null,
    opponent: null,
    value: null,
    notOut: false,
  });
  const at = (
    kind: CareerFirstKind,
    m: PlayerMatchLine,
    value: number | null,
    notOut = false,
  ): CareerFirst => ({
    kind,
    preScorecard: false,
    matchId: m.matchId,
    season: m.season ?? null,
    opponent: m.opponent ?? null,
    value,
    notOut,
  });
  const firstInnings = (min: number): CareerFirst | null => {
    for (const m of ordered) {
      for (const inn of m.innings ?? []) {
        if ((inn.runs ?? 0) >= min) {
          return at(min >= 100 ? "firstHundred" : "firstFifty", m, inn.runs ?? 0, inn.notOut);
        }
      }
    }
    return null;
  };

  const out: CareerFirst[] = [];
  if (base.games > 0) out.push(pre("debut"));
  else if (ordered.length > 0) out.push(at("debut", ordered[0], null));

  if (base.fifties + base.hundreds > 0) out.push(pre("firstFifty"));
  else {
    const f = firstInnings(50);
    if (f) out.push(f);
  }

  if (base.hundreds > 0) out.push(pre("firstHundred"));
  else {
    const h = firstInnings(100);
    if (h) out.push(h);
  }

  if (base.fiveWickets > 0) out.push(pre("firstFiveFor"));
  else {
    const m = ordered.find((x) => x.bowled && (x.wickets ?? 0) >= 5);
    if (m) out.push(at("firstFiveFor", m, m.wickets ?? 0));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Next up + ETA
// ---------------------------------------------------------------------------

export interface MilestoneEta {
  /** Matches needed at the current rate (rounded up). */
  matches: number;
  /** Seasons needed (unrounded). */
  seasons: number;
  /** "Next match", "About 4 matches", "1 season", "About 1.5 seasons". */
  label: string;
}

function fmtSeasons(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** ETA = remaining ÷ average per match, expressed in seasons of `matchesPerSeason`. */
export function milestoneEta(
  remaining: number,
  perMatch: number,
  matchesPerSeason: number,
): MilestoneEta | null {
  if (!(remaining > 0) || !(perMatch > 0) || !(matchesPerSeason > 0)) return null;
  const exactMatches = remaining / perMatch;
  const matches = Math.ceil(exactMatches - 1e-9);
  const seasons = exactMatches / matchesPerSeason;
  let label: string;
  if (seasons < 1) {
    label = matches <= 1 ? "Next match" : `About ${matches} matches`;
  } else {
    const rounded = Math.round(seasons * 2) / 2;
    const exact = Math.abs(rounded - seasons) < 1e-9;
    label = `${exact ? "" : "About "}${fmtSeasons(rounded)} ${rounded === 1 ? "season" : "seasons"}`;
  }
  return { matches, seasons, label };
}

export interface NextMilestone {
  stat: MilestoneStat;
  /** Career total now (baseline + scorecard rows). */
  current: number;
  target: number;
  remaining: number;
  /** Progress from the previous tier (or 0) to the target, 0–1. */
  progress: number;
  /** Average per match over the rate window (games: 1). */
  perMatch: number;
  eta: MilestoneEta | null;
}

export interface NextMilestoneOptions {
  /** Matches that set "the current rate" (default: every scorecard match). */
  rateMatches?: ReadonlyArray<PlayerMatchLine>;
  /** Override matches per season (default: the rate window's own average). */
  matchesPerSeason?: number;
}

export function nextMilestones(
  matches: ReadonlyArray<PlayerMatchLine>,
  seasons: ReadonlyArray<PlayerSeasonStat>,
  tiers: MilestoneTiers = DEFAULT_MILESTONE_TIERS,
  opts: NextMilestoneOptions = {},
): NextMilestone[] {
  const rate = opts.rateMatches ?? matches;
  const rateSeasons = new Set(rate.map((m) => m.season).filter((s) => s != null)).size;
  const matchesPerSeason =
    opts.matchesPerSeason ?? (rateSeasons > 0 ? rate.length / rateSeasons : 0);

  const out: NextMilestone[] = [];
  for (const stat of STATS) {
    const current =
      baselineValue(seasons, stat) + matches.reduce((s, m) => s + matchValue(m, stat), 0);
    const ladderFor = tiers[stat];
    const idx = ladderFor.findIndex((t) => t > current);
    if (idx < 0) continue;
    const target = ladderFor[idx];
    const floor = idx > 0 ? ladderFor[idx - 1] : 0;
    const remaining = target - current;
    const perMatch = rate.length
      ? rate.reduce((s, m) => s + matchValue(m, stat), 0) / rate.length
      : 0;
    out.push({
      stat,
      current,
      target,
      remaining,
      progress: target > floor ? Math.max(0, Math.min(1, (current - floor) / (target - floor))) : 0,
      perMatch,
      eta: milestoneEta(remaining, perMatch, matchesPerSeason),
    });
  }
  return out;
}
