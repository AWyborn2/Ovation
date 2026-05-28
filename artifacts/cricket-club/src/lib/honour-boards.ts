import type { Stat } from "@workspace/api-client-react";

export type BoardKey =
  | "games"
  | "runs"
  | "wickets"
  | "dismissals"
  | "highscores"
  | "bestbowling"
  | "centurions"
  | "fivefers";

export interface BoardMeta {
  key: BoardKey;
  label: string;
  title: string;
  subtitle: string;
  headlineLabel: string;
  supportingLabel: string;
}

export const BOARDS: BoardMeta[] = [
  {
    key: "games",
    label: "Games",
    title: "Most Games Played",
    subtitle: "Career appearances across all grades",
    headlineLabel: "Games",
    supportingLabel: "Runs",
  },
  {
    key: "runs",
    label: "Runs",
    title: "Most Runs Scored",
    subtitle: "Career batting aggregates",
    headlineLabel: "Runs",
    supportingLabel: "Avg",
  },
  {
    key: "wickets",
    label: "Wickets",
    title: "Most Wickets Taken",
    subtitle: "Career bowling tally",
    headlineLabel: "Wickets",
    supportingLabel: "Avg",
  },
  {
    key: "dismissals",
    label: "Dismissals",
    title: "Most Dismissals",
    subtitle: "Catches, stumpings and run outs combined",
    headlineLabel: "Dismissals",
    supportingLabel: "Ct/St/RO",
  },
  {
    key: "highscores",
    label: "High Scores",
    title: "Highest Individual Scores",
    subtitle: "Best single-innings batting performances",
    headlineLabel: "Score",
    supportingLabel: "Innings",
  },
  {
    key: "bestbowling",
    label: "Best Bowling",
    title: "Best Bowling Figures",
    subtitle: "Finest single-innings spells",
    headlineLabel: "Figures",
    supportingLabel: "Wickets",
  },
  {
    key: "centurions",
    label: "Centurions",
    title: "Centurions",
    subtitle: "Players who passed three figures",
    headlineLabel: "High Score",
    supportingLabel: "100s",
  },
  {
    key: "fivefers",
    label: "5-Wicket Hauls",
    title: "Five-Wicket Hauls",
    subtitle: "Players who claimed a five-for",
    headlineLabel: "5wI Count",
    supportingLabel: "Best",
  },
];

type TierDef = { label: string; min: number; max?: number };

type TierConfig =
  | { kind: "static"; tiers: TierDef[] }
  | {
      kind: "extendable";
      noun: string;
      step: number;
      anchorMin: number;
      belowAnchor: TierDef[];
    };

const TIER_CONFIG: Record<BoardKey, TierConfig> = {
  games: {
    kind: "extendable",
    noun: "Games",
    step: 50,
    anchorMin: 350,
    belowAnchor: [
      { label: "300 Games Club", min: 300, max: 349 },
      { label: "250 Games Club", min: 250, max: 299 },
      { label: "200 Games Club", min: 200, max: 249 },
      { label: "150 Games Club", min: 150, max: 199 },
      { label: "100 Games Club", min: 100, max: 149 },
      { label: "50 Games Club", min: 50, max: 99 },
    ],
  },
  runs: {
    kind: "extendable",
    noun: "Runs",
    step: 500,
    anchorMin: 10000,
    belowAnchor: [
      { label: "7,500 Runs Club", min: 7500, max: 9999 },
      { label: "5,000 Runs Club", min: 5000, max: 7499 },
      { label: "2,500 Runs Club", min: 2500, max: 4999 },
      { label: "1,000 Runs Club", min: 1000, max: 2499 },
      { label: "500 Runs Club", min: 500, max: 999 },
    ],
  },
  wickets: {
    kind: "extendable",
    noun: "Wickets",
    step: 50,
    anchorMin: 500,
    belowAnchor: [
      { label: "300 Wickets Club", min: 300, max: 499 },
      { label: "200 Wickets Club", min: 200, max: 299 },
      { label: "100 Wickets Club", min: 100, max: 199 },
      { label: "50 Wickets Club", min: 50, max: 99 },
      { label: "25 Wickets Club", min: 25, max: 49 },
    ],
  },
  dismissals: {
    kind: "extendable",
    noun: "Dismissals",
    step: 25,
    anchorMin: 100,
    belowAnchor: [
      { label: "75 Dismissals Club", min: 75, max: 99 },
      { label: "50 Dismissals Club", min: 50, max: 74 },
      { label: "25 Dismissals Club", min: 25, max: 49 },
      { label: "10 Dismissals Club", min: 10, max: 24 },
    ],
  },
  highscores: {
    kind: "static",
    tiers: [
      { label: "Double Century Club (200+)", min: 200 },
      { label: "150 Run Club", min: 150, max: 199 },
      { label: "Century Club (100+)", min: 100, max: 149 },
      { label: "75 Run Club", min: 75, max: 99 },
      { label: "Half Century Club (50+)", min: 50, max: 74 },
    ],
  },
  bestbowling: {
    kind: "static",
    tiers: [
      { label: "8 Wicket Haul Club", min: 8 },
      { label: "7 Wicket Haul Club", min: 7, max: 7 },
      { label: "6 Wicket Haul Club", min: 6, max: 6 },
      { label: "5 Wicket Haul Club", min: 5, max: 5 },
    ],
  },
  centurions: { kind: "static", tiers: [{ label: "Century Club", min: 100 }] },
  fivefers: { kind: "static", tiers: [{ label: "Five-Wicket Haul Club", min: 1 }] },
};

const buildTiers = (key: BoardKey, players: AggregatedPlayer[]): TierDef[] => {
  const cfg = TIER_CONFIG[key];
  if (cfg.kind === "static") return cfg.tiers;

  const { noun, step, anchorMin, belowAnchor } = cfg;
  const mkLabel = (n: number) => `${n.toLocaleString()} ${noun} Club`;

  let max = 0;
  for (const p of players) {
    const v = getPlayerValue(p, key).tierValue;
    if (v > max) max = v;
  }

  const tiers: TierDef[] = [];
  let topMin = anchorMin;
  if (max >= anchorMin + step) {
    topMin = Math.floor(max / step) * step;
  }

  tiers.push({ label: mkLabel(topMin), min: topMin });
  for (let m = topMin - step; m > anchorMin; m -= step) {
    tiers.push({ label: mkLabel(m), min: m, max: m + step - 1 });
  }
  if (topMin > anchorMin) {
    tiers.push({ label: mkLabel(anchorMin), min: anchorMin, max: anchorMin + step - 1 });
  }
  tiers.push(...belowAnchor);
  return tiers;
};

const TIERS: Record<BoardKey, TierDef[]> = {
  games: buildTiersStatic("games"),
  runs: buildTiersStatic("runs"),
  wickets: buildTiersStatic("wickets"),
  dismissals: buildTiersStatic("dismissals"),
  highscores: buildTiersStatic("highscores"),
  bestbowling: buildTiersStatic("bestbowling"),
  centurions: buildTiersStatic("centurions"),
  fivefers: buildTiersStatic("fivefers"),
};

function buildTiersStatic(key: BoardKey): TierDef[] {
  const cfg = TIER_CONFIG[key];
  if (cfg.kind === "static") return cfg.tiers;
  const { noun, anchorMin, belowAnchor } = cfg;
  const mkLabel = (n: number) => `${n.toLocaleString()} ${noun} Club`;
  return [{ label: mkLabel(anchorMin), min: anchorMin }, ...belowAnchor];
}

export interface AggregatedPlayer {
  playerId: number;
  surname: string;
  givenName: string;
  grades: Set<string>;
  games: number;
  innings: number;
  notOuts: number;
  runs: number;
  highScore: number;
  highScoreDisplay: string;
  hundreds: number;
  fifties: number;
  wickets: number;
  runsConceded: number;
  bestBowlingWkts: number;
  bestBowlingRuns: number;
  bestBowling: string;
  fiveWickets: number;
  catches: number;
  stumpings: number;
  runOuts: number;
}

const parseHighScore = (hs: string | null | undefined): { value: number; display: string } => {
  if (!hs) return { value: 0, display: "-" };
  const num = parseInt(String(hs).replace(/[^0-9]/g, ""), 10);
  return { value: isNaN(num) ? 0 : num, display: String(hs) };
};

const parseBestBowling = (bb: string | null | undefined): { wkts: number; runs: number } => {
  if (!bb) return { wkts: 0, runs: 0 };
  const m = String(bb).match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return { wkts: 0, runs: 0 };
  return { wkts: parseInt(m[1], 10), runs: parseInt(m[2], 10) };
};

const isBetterBowling = (a: { wkts: number; runs: number }, b: { wkts: number; runs: number }): boolean => {
  if (a.wkts !== b.wkts) return a.wkts > b.wkts;
  return a.runs < b.runs;
};

export const getAvailableSeasons = (stats: Stat[]): number[] => {
  const set = new Set<number>();
  for (const s of stats) {
    if (typeof s.season === "number") set.add(s.season);
  }
  return Array.from(set).sort((a, b) => b - a);
};

export const aggregateCareer = (stats: Stat[]): AggregatedPlayer[] => {
  const map = new Map<number, AggregatedPlayer>();
  for (const s of stats) {
    let p = map.get(s.playerId);
    if (!p) {
      p = {
        playerId: s.playerId,
        surname: s.surname,
        givenName: s.givenName,
        grades: new Set(),
        games: 0,
        innings: 0,
        notOuts: 0,
        runs: 0,
        highScore: 0,
        highScoreDisplay: "-",
        hundreds: 0,
        fifties: 0,
        wickets: 0,
        runsConceded: 0,
        bestBowlingWkts: 0,
        bestBowlingRuns: 0,
        bestBowling: "-",
        fiveWickets: 0,
        catches: 0,
        stumpings: 0,
        runOuts: 0,
      };
      map.set(s.playerId, p);
    }
    p.grades.add(s.grade);
    p.games += s.games ?? 0;
    p.innings += s.innings ?? 0;
    p.notOuts += s.notOuts ?? 0;
    p.runs += s.runs ?? 0;
    p.hundreds += s.hundreds ?? 0;
    p.fifties += s.fifties ?? 0;
    p.wickets += s.wickets ?? 0;
    p.runsConceded += s.runsConceded ?? 0;
    p.fiveWickets += s.fiveWickets ?? 0;
    p.catches += s.catches ?? 0;
    p.stumpings += s.stumpings ?? 0;
    p.runOuts += s.runOuts ?? 0;

    const hs = parseHighScore(s.highScore);
    if (hs.value > p.highScore) {
      p.highScore = hs.value;
      p.highScoreDisplay = hs.display;
    }
    const bb = parseBestBowling(s.bestBowling);
    if (isBetterBowling(bb, { wkts: p.bestBowlingWkts, runs: p.bestBowlingRuns })) {
      p.bestBowlingWkts = bb.wkts;
      p.bestBowlingRuns = bb.runs;
      p.bestBowling = s.bestBowling ?? "-";
    }
  }
  return Array.from(map.values());
};

export const statToAggregated = (s: Stat): AggregatedPlayer => {
  const hs = parseHighScore(s.highScore);
  const bb = parseBestBowling(s.bestBowling);
  return {
    playerId: s.playerId,
    surname: s.surname,
    givenName: s.givenName,
    grades: new Set([s.grade]),
    games: s.games ?? 0,
    innings: s.innings ?? 0,
    notOuts: s.notOuts ?? 0,
    runs: s.runs ?? 0,
    highScore: hs.value,
    highScoreDisplay: hs.display,
    hundreds: s.hundreds ?? 0,
    fifties: s.fifties ?? 0,
    wickets: s.wickets ?? 0,
    runsConceded: s.runsConceded ?? 0,
    bestBowlingWkts: bb.wkts,
    bestBowlingRuns: bb.runs,
    bestBowling: s.bestBowling ?? "-",
    fiveWickets: s.fiveWickets ?? 0,
    catches: s.catches ?? 0,
    stumpings: s.stumpings ?? 0,
    runOuts: s.runOuts ?? 0,
  };
};

export interface BoardRow {
  playerId: number;
  surname: string;
  givenName: string;
  headline: string;
  supporting: string;
  sortValue: number;
  /** All grades this player has appeared in. Used by the Games board to render
   * grade-crest badges instead of the supporting text. */
  gradesPlayed: string[];
}

export interface BoardTier {
  label: string;
  rows: BoardRow[];
  startRank: number;
  tierIndex: number;
}

const fmtNum = (n: number): string => n.toLocaleString();
const fmtAvg = (runs: number, divisor: number): string => (divisor > 0 ? (runs / divisor).toFixed(2) : "-");

const getPlayerValue = (
  p: AggregatedPlayer,
  key: BoardKey,
): { sortValue: number; tierValue: number; headline: string; supporting: string } => {
  switch (key) {
    case "games":
      return { sortValue: p.games, tierValue: p.games, headline: fmtNum(p.games), supporting: fmtNum(p.runs) };
    case "runs":
      return { sortValue: p.runs, tierValue: p.runs, headline: fmtNum(p.runs), supporting: fmtAvg(p.runs, p.innings - p.notOuts) };
    case "wickets":
      return { sortValue: p.wickets, tierValue: p.wickets, headline: fmtNum(p.wickets), supporting: fmtAvg(p.runsConceded, p.wickets) };
    case "dismissals": {
      const d = p.catches + p.stumpings + p.runOuts;
      return { sortValue: d, tierValue: d, headline: fmtNum(d), supporting: `${p.catches}/${p.stumpings}/${p.runOuts}` };
    }
    case "highscores":
      return { sortValue: p.highScore, tierValue: p.highScore, headline: p.highScoreDisplay, supporting: `${p.innings} inn` };
    case "bestbowling": {
      const sortValue = p.bestBowlingWkts * 10000 - p.bestBowlingRuns;
      return { sortValue, tierValue: p.bestBowlingWkts, headline: p.bestBowling, supporting: `${p.bestBowlingWkts} wkts` };
    }
    case "centurions":
      return { sortValue: p.highScore, tierValue: p.highScore, headline: p.highScoreDisplay, supporting: `${p.hundreds} 100s` };
    case "fivefers":
      return { sortValue: p.fiveWickets, tierValue: p.fiveWickets, headline: fmtNum(p.fiveWickets), supporting: p.bestBowling };
  }
};

export const MILESTONE_BOARDS: BoardKey[] = ["games", "runs", "wickets", "dismissals"];

/**
 * Minimum tier thresholds for a milestone to count as "significant" in the
 * "Just promoted" feed. Boards not listed here are excluded entirely.
 */
const SIGNIFICANT_MIN: Partial<Record<BoardKey, number>> = {
  games: 100,
  runs: 1000,
  wickets: 100,
};

const isSignificant = (key: BoardKey, threshold: number): boolean => {
  const min = SIGNIFICANT_MIN[key];
  return typeof min === "number" && threshold >= min;
};

const milestoneValue = (p: AggregatedPlayer, key: BoardKey): number => {
  switch (key) {
    case "games":
      return p.games;
    case "runs":
      return p.runs;
    case "wickets":
      return p.wickets;
    case "dismissals":
      return p.catches + p.stumpings + p.runOuts;
    default:
      return 0;
  }
};

export interface MilestoneStatus {
  key: BoardKey;
  boardLabel: string;
  currentValue: number;
  currentTierIndex: number | null;
  currentTierLabel: string | null;
  nextTierIndex: number | null;
  nextTierLabel: string | null;
  nextTierThreshold: number | null;
  gap: number | null;
}

export const getMilestoneStatus = (p: AggregatedPlayer, key: BoardKey): MilestoneStatus => {
  const cfg = TIER_CONFIG[key];
  const tiers = buildTiers(key, [p]);
  const value = milestoneValue(p, key);
  const board = BOARDS.find((b) => b.key === key)!;
  const currentIdx = tiers.findIndex((t) => value >= t.min && (t.max === undefined || value <= t.max));

  let nextIdx: number | null = null;
  let nextLabel: string | null = null;
  let nextThreshold: number | null = null;

  if (currentIdx > 0) {
    nextIdx = currentIdx - 1;
    nextLabel = tiers[nextIdx].label;
    nextThreshold = tiers[nextIdx].min;
  } else if (currentIdx === 0 && cfg.kind === "extendable") {
    const synthMin = tiers[0].min + cfg.step;
    nextIdx = 0;
    nextLabel = `${synthMin.toLocaleString()} ${cfg.noun} Club`;
    nextThreshold = synthMin;
  } else if (currentIdx === -1 && tiers.length > 0) {
    nextIdx = tiers.length - 1;
    nextLabel = tiers[nextIdx].label;
    nextThreshold = tiers[nextIdx].min;
  }

  return {
    key,
    boardLabel: board.label,
    currentValue: value,
    currentTierIndex: currentIdx >= 0 ? currentIdx : null,
    currentTierLabel: currentIdx >= 0 ? tiers[currentIdx].label : null,
    nextTierIndex: nextIdx,
    nextTierLabel: nextLabel,
    nextTierThreshold: nextThreshold,
    gap: nextThreshold !== null ? Math.max(nextThreshold - value, 0) : null,
  };
};

export interface SeasonCrossing {
  key: BoardKey;
  boardLabel: string;
  tierLabel: string;
  tierIndex: number;
  threshold: number;
  beforeValue: number;
  afterValue: number;
}

export const getSeasonCrossings = (
  before: AggregatedPlayer,
  after: AggregatedPlayer,
): SeasonCrossing[] => {
  const out: SeasonCrossing[] = [];
  for (const key of MILESTONE_BOARDS) {
    const tiers = TIERS[key];
    const bVal = milestoneValue(before, key);
    const aVal = milestoneValue(after, key);
    const board = BOARDS.find((b) => b.key === key)!;
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      if (t.min <= 0) continue;
      if (!isSignificant(key, t.min)) continue;
      if (t.min > bVal && t.min <= aVal) {
        out.push({
          key,
          boardLabel: board.label,
          tierLabel: t.label,
          tierIndex: i,
          threshold: t.min,
          beforeValue: bVal,
          afterValue: aVal,
        });
      }
    }
  }
  out.sort((a, b) => b.threshold - a.threshold);
  return out;
};

export interface PlayerSeasonCrossings {
  playerId: number;
  surname: string;
  givenName: string;
  crossings: SeasonCrossing[];
}

export const getSeasonPromotions = (
  allStats: Stat[],
  season: number,
  limit = 5,
): PromotionEntry[] => {
  const beforeStats = allStats.filter(
    (s) => typeof s.season !== "number" || s.season < season,
  );
  const throughStats = allStats.filter(
    (s) => typeof s.season !== "number" || s.season <= season,
  );
  const beforeMap = new Map<number, AggregatedPlayer>();
  for (const p of aggregateCareer(beforeStats)) beforeMap.set(p.playerId, p);
  const throughMap = new Map<number, AggregatedPlayer>();
  for (const p of aggregateCareer(throughStats)) throughMap.set(p.playerId, p);

  const entries: PromotionEntry[] = [];

  for (const [playerId, after] of throughMap) {
    const before = beforeMap.get(playerId) ?? {
      ...after,
      games: 0,
      runs: 0,
      wickets: 0,
      catches: 0,
      stumpings: 0,
      runOuts: 0,
    };
    const crossings = getSeasonCrossings(before, after);
    for (const c of crossings) {
      const excess = c.afterValue - c.threshold;
      entries.push({
        playerId,
        surname: after.surname,
        givenName: after.givenName,
        boardKey: c.key,
        boardLabel: c.boardLabel,
        tierLabel: c.tierLabel,
        tierIndex: c.tierIndex,
        currentValue: c.afterValue,
        threshold: c.threshold,
        excess,
        recencyScore: c.threshold > 0 ? excess / c.threshold : excess,
      });
    }
  }
  entries.sort((a, b) => {
    if (a.recencyScore !== b.recencyScore) return a.recencyScore - b.recencyScore;
    return a.surname.localeCompare(b.surname);
  });
  return entries.slice(0, limit);
};

export const getPlayerSeasonCrossings = (
  playerStats: Stat[],
  season: number,
): SeasonCrossing[] => {
  const before = aggregateCareer(
    playerStats.filter((s) => typeof s.season !== "number" || s.season < season),
  )[0];
  const after = aggregateCareer(
    playerStats.filter((s) => typeof s.season !== "number" || s.season <= season),
  )[0];
  if (!after) return [];
  const zero: AggregatedPlayer = before ?? {
    ...after,
    games: 0,
    innings: 0,
    notOuts: 0,
    runs: 0,
    hundreds: 0,
    fifties: 0,
    wickets: 0,
    runsConceded: 0,
    fiveWickets: 0,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
    highScore: 0,
    bestBowlingWkts: 0,
    bestBowlingRuns: 0,
  };
  return getSeasonCrossings(zero, after);
};

export interface PromotionEntry {
  playerId: number;
  surname: string;
  givenName: string;
  boardKey: BoardKey;
  boardLabel: string;
  tierLabel: string;
  tierIndex: number;
  currentValue: number;
  threshold: number;
  excess: number;
  recencyScore: number;
}

export const getRecentPromotions = (players: AggregatedPlayer[], limit = 5): PromotionEntry[] => {
  const entries: PromotionEntry[] = [];
  const tiersByKey = new Map<BoardKey, TierDef[]>();
  for (const key of MILESTONE_BOARDS) tiersByKey.set(key, buildTiers(key, players));
  for (const p of players) {
    for (const key of MILESTONE_BOARDS) {
      const tiers = tiersByKey.get(key)!;
      const value = milestoneValue(p, key);
      const idx = tiers.findIndex((t) => value >= t.min && (t.max === undefined || value <= t.max));
      if (idx === -1) continue;
      const tier = tiers[idx];
      if (tier.min <= 0) continue;
      if (!isSignificant(key, tier.min)) continue;
      const excess = value - tier.min;
      const board = BOARDS.find((b) => b.key === key)!;
      entries.push({
        playerId: p.playerId,
        surname: p.surname,
        givenName: p.givenName,
        boardKey: key,
        boardLabel: board.label,
        tierLabel: tier.label,
        tierIndex: idx,
        currentValue: value,
        threshold: tier.min,
        excess,
        recencyScore: excess / tier.min,
      });
    }
  }
  entries.sort((a, b) => {
    if (a.recencyScore !== b.recencyScore) return a.recencyScore - b.recencyScore;
    return a.surname.localeCompare(b.surname);
  });
  return entries.slice(0, limit);
};

export const computeBoard = (players: AggregatedPlayer[], key: BoardKey): BoardTier[] => {
  const tiers = buildTiers(key, players);
  const tierResults: BoardTier[] = tiers.map((t, i) => ({ label: t.label, rows: [], startRank: 1, tierIndex: i }));
  const seen = new Set<number>();

  const enriched = players
    .map((p) => ({ p, v: getPlayerValue(p, key) }))
    .filter((e) => e.v.sortValue > 0)
    .sort((a, b) => {
      if (b.v.sortValue !== a.v.sortValue) return b.v.sortValue - a.v.sortValue;
      return a.p.surname.localeCompare(b.p.surname);
    });

  for (const { p, v } of enriched) {
    if (seen.has(p.playerId)) continue;
    const tierIdx = tiers.findIndex((t) => v.tierValue >= t.min && (t.max === undefined || v.tierValue <= t.max));
    if (tierIdx === -1) continue;
    seen.add(p.playerId);
    tierResults[tierIdx].rows.push({
      playerId: p.playerId,
      surname: p.surname,
      givenName: p.givenName,
      headline: v.headline,
      supporting: v.supporting,
      sortValue: v.sortValue,
      gradesPlayed: Array.from(p.grades).filter((g) => g !== "CLUB TOTAL"),
    });
  }
  const populated = tierResults.filter((t) => t.rows.length > 0);
  let running = 1;
  for (let i = 0; i < populated.length; i++) {
    const t = populated[i];
    t.tierIndex = i;
    t.startRank = running;
    running += t.rows.length;
  }
  return populated;
};
