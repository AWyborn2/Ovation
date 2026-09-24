import type {
  Century,
  FiveWicketHaul,
  PartnershipRecord,
  RecordLeaderMetric,
  RecordLeaderRow,
  RecordProgressionPoint,
  RecordsDisplaySettings,
} from "@workspace/api-client-react";
import { parseSeasonYear, seasonLabel, type StatsView } from "@/lib/use-stats-view";

/**
 * Pure derivations behind the Records page (stats plan U10). Everything here is
 * computed from the API payloads — no sample numbers — so it is unit-testable
 * without rendering.
 */

/** The "All grades" tab (no `grade` param on any request). */
export const ALL_GRADES = "all";

export const LEADER_METRICS: ReadonlyArray<{
  key: RecordLeaderMetric;
  label: string;
  title: string;
  unit: string;
  one: string;
}> = [
  { key: "runs", label: "Runs", title: "Most runs", unit: "runs", one: "run" },
  { key: "wickets", label: "Wickets", title: "Most wickets", unit: "wickets", one: "wicket" },
  { key: "catches", label: "Catches", title: "Most catches", unit: "catches", one: "catch" },
  { key: "hundreds", label: "100s", title: "Most hundreds", unit: "hundreds", one: "hundred" },
  { key: "games", label: "Games", title: "Most games", unit: "games", one: "game" },
];

export const metricMeta = (m: RecordLeaderMetric) =>
  LEADER_METRICS.find((x) => x.key === m) ?? LEADER_METRICS[0];

/**
 * The grade tab a visitor lands on, from the admin's records display settings:
 * "By Grade" opens that grade (or the most senior one), "Partnerships" opens
 * its default grade, everything else opens All grades. A configured grade that
 * no longer exists falls back sensibly.
 */
export function defaultGradeTab(
  settings:
    | Pick<
        RecordsDisplaySettings,
        "defaultTab" | "byGradeDefaultGrade" | "partnershipsDefaultGrade"
      >
    | null
    | undefined,
  grades: string[],
): string {
  if (!settings) return ALL_GRADES;
  if (settings.defaultTab === "by-grade") {
    const g = settings.byGradeDefaultGrade;
    if (g && grades.includes(g)) return g;
    return grades[0] ?? ALL_GRADES;
  }
  if (settings.defaultTab === "partnerships") {
    const g = settings.partnershipsDefaultGrade;
    return g && grades.includes(g) ? g : ALL_GRADES;
  }
  return ALL_GRADES;
}

/** Request params for a grade tab: All grades sends no `grade` at all. */
export const gradeParam = (tab: string): { grade?: string } =>
  tab && tab !== ALL_GRADES ? { grade: tab } : {};

/** Request params for the season range (Career sends neither). */
export function rangeParams(view: Pick<StatsView, "from" | "to">): {
  fromSeason?: number;
  toSeason?: number;
} {
  const out: { fromSeason?: number; toSeason?: number } = {};
  if (view.from != null) out.fromSeason = view.from;
  if (view.to != null) out.toSeason = view.to;
  return out;
}

/** Free-text season inside the view range; undated rows only count for Career. */
export function seasonInRange(
  season: string | number | null | undefined,
  view: Pick<StatsView, "from" | "to">,
): boolean {
  if (view.from == null && view.to == null) return true;
  const y = parseSeasonYear(season);
  if (y == null) return false;
  if (view.from != null && y < view.from) return false;
  if (view.to != null && y > view.to) return false;
  return true;
}

/** "Played in the current or previous season" (plan assumption). */
export function isActive(
  lastSeason: number | null | undefined,
  currentSeason: number | null,
): boolean {
  if (lastSeason == null || currentSeason == null) return false;
  return lastSeason >= currentSeason - 1;
}

export const initials = (given: string, surname: string): string =>
  `${given.trim().charAt(0)}${surname.trim().charAt(0)}`.toUpperCase() || "?";

export const shortName = (given: string, surname: string): string => {
  const g = given.trim();
  const s = surname.trim();
  if (!s) return g;
  return g ? `${g.charAt(0)}. ${s}` : s;
};

export const fullName = (given: string, surname: string): string => `${given} ${surname}`.trim();

const fmt = (n: number) => n.toLocaleString("en-AU");

const ORDINALS = ["th", "st", "nd", "rd"];
export function ordinal(n: number): string {
  const v = n % 100;
  return `${n}${ORDINALS[(v - 20) % 10] || ORDINALS[v] || ORDINALS[0]}`;
}

// --- Record watch -----------------------------------------------------------

export interface WatchItem {
  key: string;
  playerId: number;
  initials: string;
  name: string;
  /** "Pass Clinton Adams for 2nd on career runs". */
  target: string;
  /** Amount still needed, e.g. "216 runs". */
  need: string;
  /** Short context line (no invented forecasts). */
  note: string;
  current: number;
  goal: number;
  /** Fraction of the goal reached, 0–1. */
  progress: number;
}

/** Round-number "club first" steps per metric (400 wickets, 10 hundreds…). */
const CLUB_FIRST_STEP: Record<RecordLeaderMetric, number> = {
  runs: 1000,
  wickets: 100,
  catches: 50,
  hundreds: 5,
  games: 50,
};

/** Within 10% of the target (the handoff's reach rule). */
const WITHIN = 0.1;
/** Within this many games of the games record. */
const GAMES_REACH = 10;

/**
 * The handoff's three record-watch rules, applied to career leaders:
 *
 * 1. an active player within 10% of passing the next person on a career
 *    leaderboard;
 * 2. an active player within 10% of a round-number club first (e.g. the first
 *    to 400 wickets or 10 hundreds — a number nobody has reached yet);
 * 3. an active player within 10 games of the games record.
 *
 * Retired players never appear. Closest first, at most `limit` cards.
 */
export function buildRecordWatch(
  leaders: Partial<Record<RecordLeaderMetric, RecordLeaderRow[] | undefined>>,
  currentSeason: number | null,
  limit = 6,
): WatchItem[] {
  const out: WatchItem[] = [];
  const seen = new Set<string>();
  const push = (item: WatchItem) => {
    if (seen.has(item.key)) return;
    seen.add(item.key);
    out.push(item);
  };

  for (const meta of LEADER_METRICS) {
    const rows = (leaders[meta.key] ?? []).filter((r) => r.value > 0);
    if (rows.length === 0) continue;
    const sorted = [...rows].sort((a, b) => b.value - a.value || a.rank - b.rank);
    const clubBest = sorted[0].value;
    const unitFor = (n: number) => (n === 1 ? meta.one : meta.unit);
    const base = (r: RecordLeaderRow) => ({
      playerId: r.playerId,
      initials: initials(r.givenName, r.surname),
      name: fullName(r.givenName, r.surname),
      current: r.value,
    });

    sorted.forEach((r, i) => {
      if (!isActive(r.lastSeason, currentSeason)) return;

      // Rule 1: the next person above on this leaderboard.
      const ahead = sorted
        .slice(0, i)
        .reverse()
        .find((a) => a.value > r.value);
      if (ahead) {
        const goal = ahead.value + 1;
        if ((goal - r.value) / goal <= WITHIN) {
          const games = meta.key === "games" && ahead.value === clubBest;
          push({
            ...base(r),
            key: `${meta.key}:${r.playerId}:pass:${ahead.playerId}`,
            target: games
              ? `Pass ${fullName(ahead.givenName, ahead.surname)} for most games`
              : `Pass ${fullName(ahead.givenName, ahead.surname)} for ${ordinal(ahead.rank)} on career ${meta.unit}`,
            need: `${fmt(goal - r.value)} ${unitFor(goal - r.value)}`,
            note: `Currently ${ordinal(r.rank)}`,
            goal,
            progress: r.value / goal,
          });
        }
      }

      // Rule 3: within 10 games of the games record (even beyond 10%).
      if (meta.key === "games" && r.value < clubBest && clubBest - r.value <= GAMES_REACH) {
        const holder = sorted[0];
        const goal = clubBest + 1;
        push({
          ...base(r),
          key: `${meta.key}:${r.playerId}:pass:${holder.playerId}`,
          target: `Pass ${fullName(holder.givenName, holder.surname)} for most games`,
          need: `${fmt(goal - r.value)} ${unitFor(goal - r.value)}`,
          note: "Games record",
          goal,
          progress: r.value / goal,
        });
      }
    });

    // Rule 2: the next round number nobody has reached yet.
    const step = CLUB_FIRST_STEP[meta.key];
    const target = (Math.floor(clubBest / step) + 1) * step;
    for (const r of sorted) {
      if (!isActive(r.lastSeason, currentSeason)) continue;
      if (r.value >= target || (target - r.value) / target > WITHIN) continue;
      push({
        ...base(r),
        key: `${meta.key}:${r.playerId}:first:${target}`,
        target: `First player to ${fmt(target)} ${meta.unit}`,
        need: `${fmt(target - r.value)} ${unitFor(target - r.value)}`,
        note: "A club first",
        goal: target,
        progress: r.value / target,
      });
    }
  }

  return out
    .sort((a, b) => b.progress - a.progress || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// --- Progression -------------------------------------------------------------

export type ProgressionKind = "highScore" | "bestBowling";

/** "7/23" → 7.977 so more wickets, then fewer runs, plots higher. */
export function progressionValue(kind: ProgressionKind, value: string): number {
  if (kind === "highScore") {
    const n = parseInt(value.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }
  const m = /(\d+)\s*\/\s*(\d+)/.exec(value);
  if (!m) return 0;
  const w = Number(m[1]);
  const r = Math.min(Number(m[2]), 999);
  return Number((w + (1 - r / 1000)).toFixed(3));
}

export function progressionSeasonLabel(p: Pick<RecordProgressionPoint, "season" | "dated">) {
  if (p.season == null || !p.dated) return "Undated";
  return seasonLabel(p.season);
}

// --- Partnerships --------------------------------------------------------------

const wicketOrd = (w: string | null | undefined): number => {
  const m = /(\d+)/.exec(w ?? "");
  return m ? Number(m[1]) : 999;
};

/**
 * Best stand for each wicket (1st → 10th) in the grade and range. Draws on the
 * per-wicket records AND every 50+ stand, so a range still finds its best.
 */
export function bestStandPerWicket(
  pool: PartnershipRecord[],
  grade: string,
  view: Pick<StatsView, "from" | "to">,
): PartnershipRecord[] {
  const byWicket = new Map<number, PartnershipRecord>();
  for (const p of pool) {
    if (grade !== ALL_GRADES && p.grade !== grade) continue;
    if (!seasonInRange(p.season, view)) continue;
    const ord = wicketOrd(p.wicket);
    if (ord < 1 || ord > 10) continue;
    const cur = byWicket.get(ord);
    if (!cur || p.runs > cur.runs) byWicket.set(ord, p);
  }
  return [...byWicket.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

/** "A / B" or "A and B" → "A & B". */
export const pairLabel = (batsmen: string) =>
  batsmen
    .split(/\s*(?:\/|&|\band\b)\s*/i)
    .filter(Boolean)
    .join(" & ");

// --- Hundreds heatmap ----------------------------------------------------------

export interface HeatmapModel {
  seasons: number[];
  grades: string[];
  /** counts[grade][season] */
  counts: Map<string, Map<number, number>>;
  total: number;
}

/** Continuous run of seasons between the first and last in the list. */
function seasonSpan(years: number[], view: Pick<StatsView, "from" | "to">): number[] {
  if (years.length === 0) return [];
  const lo = view.from ?? Math.min(...years);
  const hi = view.to ?? Math.max(...years);
  const out: number[] = [];
  for (let y = lo; y <= hi; y++) out.push(y);
  return out;
}

/** Seasons × grades counts of centuries in the grade tab and range. */
export function centuriesHeatmap(
  centuries: Century[],
  grade: string,
  view: Pick<StatsView, "from" | "to">,
  gradeOrder: (grades: Iterable<string>) => string[],
): HeatmapModel {
  const counts = new Map<string, Map<number, number>>();
  const years: number[] = [];
  let total = 0;
  for (const c of centuries) {
    if (grade !== ALL_GRADES && c.grade !== grade) continue;
    const y = parseSeasonYear(c.season);
    if (y == null || !seasonInRange(y, view)) continue;
    const row = counts.get(c.grade) ?? new Map<number, number>();
    row.set(y, (row.get(y) ?? 0) + 1);
    counts.set(c.grade, row);
    years.push(y);
    total += 1;
  }
  return {
    seasons: seasonSpan(years, view),
    grades: gradeOrder(counts.keys()),
    counts,
    total,
  };
}

// --- Five-fors timeline --------------------------------------------------------

export interface HaulDot {
  id: number;
  wickets: number;
  /** 7+ wickets render solid; 5–6 ringed. */
  solid: boolean;
  tip: string;
}

export interface FiveForsModel {
  columns: Array<{ season: number; hauls: HaulDot[] }>;
  total: number;
}

export function haulWickets(figures: string | null | undefined): number | null {
  const m = /(\d+)\s*\/\s*\d+/.exec(figures ?? "") ?? /^(\d+)/.exec((figures ?? "").trim());
  return m ? Number(m[1]) : null;
}

/** One column per season (continuous), one dot per haul, biggest hauls first. */
export function fiveForsTimeline(
  hauls: FiveWicketHaul[],
  grade: string,
  view: Pick<StatsView, "from" | "to">,
): FiveForsModel {
  const bySeason = new Map<number, HaulDot[]>();
  let total = 0;
  for (const h of hauls) {
    if (grade !== ALL_GRADES && h.grade !== grade) continue;
    const y = parseSeasonYear(h.season);
    if (y == null || !seasonInRange(y, view)) continue;
    const wickets = haulWickets(h.figures) ?? 5;
    const dots = bySeason.get(y) ?? [];
    dots.push({
      id: h.id,
      wickets,
      solid: wickets >= 7,
      tip: `${h.figures ?? `${wickets} wickets`} · ${h.bowler} · ${h.grade} · ${seasonLabel(y)}`,
    });
    bySeason.set(y, dots);
    total += 1;
  }
  const seasons = seasonSpan([...bySeason.keys()], view);
  return {
    columns: seasons.map((season) => ({
      season,
      hauls: (bySeason.get(season) ?? []).sort((a, b) => b.wickets - a.wickets),
    })),
    total,
  };
}

/** "2019/20" → "19/20" for tight axis labels. */
export const shortSeason = (y: number) => seasonLabel(y).slice(2);
