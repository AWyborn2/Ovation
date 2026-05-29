// Detects honour-board tier crossings after a CSV import.
// Mirrors the tier logic in the client's lib/honour-boards.ts.

export type BoardKey = "games" | "runs" | "wickets" | "dismissals";

export const TIER_THRESHOLDS: Record<BoardKey, number[]> = {
  games: [50, 100, 150, 200, 250, 300],
  runs: [1000, 2500, 5000, 7500, 10000, 15000],
  wickets: [50, 100, 200, 300, 400, 500],
  dismissals: [25, 50, 100, 150, 200],
};

export const TIER_LABELS: Record<BoardKey, string[]> = {
  games: ["50 Games", "Centurion", "150 Games", "200 Games", "250 Games", "300 Games"],
  runs: ["1000 Runs", "2500 Runs", "5000 Runs", "7500 Runs", "10K Runs", "15K Runs"],
  wickets: ["50 Wickets", "100 Wickets", "200 Wickets", "300 Wickets", "400 Wickets", "500 Wickets"],
  dismissals: ["25 Dismissals", "Half-Century", "Centurion", "150 Dismissals", "200 Dismissals"],
};

export const BOARD_STAT_LABEL: Record<BoardKey, string> = {
  games: "Games",
  runs: "Runs",
  wickets: "Wickets",
  dismissals: "Dismissals",
};

type Totals = { games: number; runs: number; wickets: number; dismissals: number };

export type DetectedCrossing = {
  playerId: number;
  boardKey: BoardKey;
  tierIndex: number;
  tierLabel: string;
  value: number;
  threshold: number;
};

export const tierIndexFor = (key: BoardKey, value: number): number => {
  const t = TIER_THRESHOLDS[key];
  let idx = -1;
  for (let i = 0; i < t.length; i++) if (value >= t[i]) idx = i;
  return idx;
};

export const detectCrossings = (
  before: Map<number, Totals>,
  after: Map<number, Totals>,
): DetectedCrossing[] => {
  const out: DetectedCrossing[] = [];
  for (const [playerId, afterT] of after) {
    const beforeT = before.get(playerId) ?? { games: 0, runs: 0, wickets: 0, dismissals: 0 };
    for (const key of Object.keys(TIER_THRESHOLDS) as BoardKey[]) {
      const beforeIdx = tierIndexFor(key, beforeT[key]);
      const afterIdx = tierIndexFor(key, afterT[key]);
      if (afterIdx > beforeIdx) {
        for (let i = beforeIdx + 1; i <= afterIdx; i++) {
          out.push({
            playerId,
            boardKey: key,
            tierIndex: i,
            tierLabel: TIER_LABELS[key][i],
            value: afterT[key],
            threshold: TIER_THRESHOLDS[key][i],
          });
        }
      }
    }
  }
  return out;
};
