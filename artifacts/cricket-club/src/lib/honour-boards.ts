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

const TIERS: Record<BoardKey, { label: string; min: number; max?: number }[]> = {
  games: [
    { label: "350+ Games", min: 350 },
    { label: "300–349 Games", min: 300, max: 349 },
    { label: "250–299 Games", min: 250, max: 299 },
    { label: "200–249 Games", min: 200, max: 249 },
    { label: "150–199 Games", min: 150, max: 199 },
    { label: "100–149 Games", min: 100, max: 149 },
    { label: "50–99 Games", min: 50, max: 99 },
  ],
  runs: [
    { label: "10,000+ Runs", min: 10000 },
    { label: "7,500+ Runs", min: 7500, max: 9999 },
    { label: "5,000+ Runs", min: 5000, max: 7499 },
    { label: "2,500+ Runs", min: 2500, max: 4999 },
    { label: "1,000+ Runs", min: 1000, max: 2499 },
    { label: "500+ Runs", min: 500, max: 999 },
  ],
  wickets: [
    { label: "500+ Wickets", min: 500 },
    { label: "300+ Wickets", min: 300, max: 499 },
    { label: "200+ Wickets", min: 200, max: 299 },
    { label: "100+ Wickets", min: 100, max: 199 },
    { label: "50+ Wickets", min: 50, max: 99 },
    { label: "25+ Wickets", min: 25, max: 49 },
  ],
  dismissals: [
    { label: "100+ Dismissals", min: 100 },
    { label: "75+ Dismissals", min: 75, max: 99 },
    { label: "50+ Dismissals", min: 50, max: 74 },
    { label: "25+ Dismissals", min: 25, max: 49 },
    { label: "10+ Dismissals", min: 10, max: 24 },
  ],
  highscores: [
    { label: "200+", min: 200 },
    { label: "150+", min: 150, max: 199 },
    { label: "100+ (Centurions)", min: 100, max: 149 },
    { label: "75+", min: 75, max: 99 },
    { label: "50+", min: 50, max: 74 },
  ],
  bestbowling: [
    { label: "8+ Wickets", min: 8 },
    { label: "7 Wickets", min: 7, max: 7 },
    { label: "6 Wickets", min: 6, max: 6 },
    { label: "5 Wickets", min: 5, max: 5 },
  ],
  centurions: [{ label: "100+ High Score", min: 100 }],
  fivefers: [{ label: "Five-Wicket Haul", min: 1 }],
};

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
}

export interface BoardTier {
  label: string;
  rows: BoardRow[];
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

export const computeBoard = (players: AggregatedPlayer[], key: BoardKey): BoardTier[] => {
  const tiers = TIERS[key];
  const tierResults: BoardTier[] = tiers.map((t) => ({ label: t.label, rows: [] }));
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
    });
  }
  return tierResults.filter((t) => t.rows.length > 0);
};
