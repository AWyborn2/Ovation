import { BattingCard } from "@workspace/cricket-club";
import { deriveClubColors, deriveOppositionColors } from "@workspace/scorecard";

// Fictional tenant club (navy + gold) and opposition — never real-club literals.
const seacrest = {
  name: "Seacrest CC",
  shortName: "SCC",
  logoUrl: null,
  colors: deriveClubColors("#123a5c", "#e8b93c"),
  isHallsHead: true,
};

const dunesNeutral = {
  name: "Dunes CC",
  shortName: null,
  logoUrl: null,
  colors: deriveOppositionColors(null, null),
  isHallsHead: false,
};

const firstInnings = {
  battingTeam: seacrest,
  bowlingTeam: dunesNeutral,
  inningsLabel: "1ST INNINGS",
  batsmen: [
    { playerId: 11, name: "J. Carter", dismissal: "c Wilson b Nguyen", notOut: false, runs: 78, balls: 64, fours: 9, sixes: 2, strikeRate: 121.9 },
    { playerId: 12, name: "T. Nguyen", dismissal: "b Rimmer", notOut: false, runs: 45, balls: 52, fours: 5, sixes: 0, strikeRate: 86.5 },
    { playerId: 13, name: "M. Della Bosca", dismissal: "lbw b Hooper", notOut: false, runs: 31, balls: 40, fours: 3, sixes: 0, strikeRate: 77.5 },
    { playerId: 14, name: "S. Rimmer", dismissal: "run out (Keys)", notOut: false, runs: 22, balls: 18, fours: 2, sixes: 1, strikeRate: 122.2 },
    { playerId: 15, name: "B. Hooper", dismissal: "not out", notOut: true, runs: 24, balls: 25, fours: 2, sixes: 0, strikeRate: 96.0 },
    { playerId: null, name: "Fill-in", dismissal: "c & b Wilson", notOut: false, runs: 8, balls: 11, fours: 1, sixes: 0, strikeRate: 72.7 },
  ],
  didNotBat: ["D. Keys", "A. Patterson"],
  bowlers: [],
  extras: { total: 14, wides: 6, noBalls: 2, other: 6 },
  totalRuns: 222,
  wickets: 5,
  oversTotal: "45",
};

/** Tenant-branded batting innings: dismissals, not-out star, DNB strip, totals bar. */
export function SeacrestBattingInnings() {
  return (
    <div style={{ maxWidth: 560 }}>
      <BattingCard innings={firstInnings} onPlayerClick={() => {}} />
    </div>
  );
}

const oppositionInnings = {
  battingTeam: dunesNeutral,
  bowlingTeam: seacrest,
  inningsLabel: "2ND INNINGS",
  batsmen: [
    { playerId: null, name: "N. Wilson", dismissal: "c Carter b Keys", notOut: false, runs: 44, balls: 52, fours: 5, sixes: 0, strikeRate: 84.6 },
    { playerId: null, name: "R. Ford", dismissal: "b Rimmer", notOut: false, runs: 8, balls: 15, fours: 1, sixes: 0, strikeRate: 53.3 },
    { playerId: null, name: "C. Hearn", dismissal: "st Hooper b Nguyen", notOut: false, runs: 36, balls: 40, fours: 4, sixes: 1, strikeRate: 90.0 },
    { playerId: null, name: "P. Pratt", dismissal: "not out", notOut: true, runs: 19, balls: 27, fours: 2, sixes: 0, strikeRate: 70.4 },
  ],
  didNotBat: [],
  bowlers: [],
  extras: { total: 11, wides: 4, noBalls: 1, other: 6 },
  totalRuns: 118,
  wickets: 3,
  oversTotal: "31.4",
};

/** Opposition batting card on the neutral dark scheme (no stored brand colours). */
export function OppositionNeutralScheme() {
  return (
    <div style={{ maxWidth: 560 }}>
      <BattingCard innings={oppositionInnings} />
    </div>
  );
}
