import { BowlingCard } from "@workspace/cricket-club";
import { deriveClubColors, deriveOppositionColors } from "@workspace/scorecard";

// Fictional clubs only (never real-club literals). The bowling card is
// rendered in the BOWLING team's colours — here the tenant club fields.
const seacrest = {
  name: "Seacrest CC",
  shortName: "SCC",
  logoUrl: null,
  colors: deriveClubColors("#123a5c", "#e8b93c"),
  isHallsHead: true,
};

const dunes = {
  name: "Dunes CC",
  shortName: "DCC",
  logoUrl: null,
  colors: deriveOppositionColors("#5c1f2e", "#d9a441"),
  isHallsHead: false,
};

const inningsSeacrestBowling = {
  battingTeam: dunes,
  bowlingTeam: seacrest,
  inningsLabel: "2ND INNINGS",
  batsmen: [],
  didNotBat: [],
  bowlers: [
    { playerId: 21, name: "A. Patterson", overs: "9", maidens: 2, runs: 28, wickets: 3, economy: 3.11, wides: 1, noBalls: 0 },
    { playerId: 22, name: "D. Keys", overs: "9.4", maidens: 1, runs: 41, wickets: 4, economy: 4.24, wides: 3, noBalls: 1 },
    { playerId: 23, name: "T. Nguyen", overs: "8", maidens: 0, runs: 52, wickets: 2, economy: 6.5, wides: 2, noBalls: 0 },
    { playerId: 24, name: "S. Rimmer", overs: "8", maidens: 0, runs: 33, wickets: 1, economy: 4.13, wides: 1, noBalls: 0 },
    { playerId: null, name: "L. Okafor", overs: "5", maidens: 0, runs: 24, wickets: 0, economy: 4.8, wides: 0, noBalls: 0 },
  ],
  extras: { total: 12, wides: 7, noBalls: 1, other: 4 },
  totalRuns: 186,
  wickets: 10,
  oversTotal: "39.4",
};

/**
 * Tenant-branded bowling figures (O/M/R/W/Econ) with a hat-trick flame marker
 * on D. Keys and the extras/overs/total strip along the bottom.
 */
export function SeacrestBowlingInnings() {
  return (
    <div style={{ maxWidth: 560 }}>
      <BowlingCard
        innings={inningsSeacrestBowling}
        hatTrickIds={new Set([22])}
        onPlayerClick={() => {}}
      />
    </div>
  );
}

const inningsDunesBowling = {
  battingTeam: seacrest,
  bowlingTeam: dunes,
  inningsLabel: "1ST INNINGS",
  batsmen: [],
  didNotBat: [],
  bowlers: [
    { playerId: null, name: "R. Ford", overs: "9", maidens: 1, runs: 38, wickets: 2, economy: 4.22, wides: 2, noBalls: 1 },
    { playerId: null, name: "C. Hearn", overs: "8", maidens: 0, runs: 42, wickets: 1, economy: 5.25, wides: 1, noBalls: 0 },
    { playerId: null, name: "G. Aldridge", overs: "7.2", maidens: 0, runs: 33, wickets: 1, economy: 4.5, wides: 0, noBalls: 0 },
    { playerId: null, name: "J. Tan", overs: "6", maidens: 1, runs: 25, wickets: 0, economy: 4.17, wides: 1, noBalls: 0 },
  ],
  extras: { total: 9, wides: 4, noBalls: 1, other: 4 },
  totalRuns: 168,
  wickets: 4,
  oversTotal: "30.2",
};

/** Opposition bowling card branded from the opponent club's stored colours. */
export function DunesBowlingInnings() {
  return (
    <div style={{ maxWidth: 560 }}>
      <BowlingCard innings={inningsDunesBowling} />
    </div>
  );
}
