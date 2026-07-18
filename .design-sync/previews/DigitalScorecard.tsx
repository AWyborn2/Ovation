import { DigitalScorecard } from "@workspace/cricket-club";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// DigitalScorecard mounts PlayerStatsModal (closed), whose generated
// react-query hook needs a QueryClient in context even while disabled.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false } },
});

// Hand-written MatchDetail DTO for a fictional tenant club vs a branded
// opponent. Raw dismissals use the stored colon-delimited shapes so
// buildScorecard's formatDismissal path is exercised for real.
const line = (
  id: number,
  playerId: number,
  givenName: string,
  surname: string,
  bat: null | { runs: number; balls: number; fours: number; sixes: number; notOut: boolean; dismissal: string | null },
  bowl: null | { overs: string; maidens: number; runsConceded: number; wickets: number; wides: number; noBalls: number },
) => ({
  id,
  playerId,
  givenName,
  surname,
  batted: bat != null,
  battingPos: null,
  runs: bat?.runs ?? null,
  balls: bat?.balls ?? null,
  fours: bat?.fours ?? null,
  sixes: bat?.sixes ?? null,
  notOut: bat?.notOut ?? false,
  dismissal: bat?.dismissal ?? null,
  bowled: bowl != null,
  overs: bowl?.overs ?? null,
  maidens: bowl?.maidens ?? null,
  runsConceded: bowl?.runsConceded ?? null,
  wickets: bowl?.wickets ?? null,
  wides: bowl?.wides ?? null,
  noBalls: bowl?.noBalls ?? null,
  catches: 0,
  stumpings: 0,
  runOuts: 0,
});

const oppLine = (
  id: number,
  name: string,
  bat: null | { runs: number; balls: number; notOut: boolean; dismissal: string | null },
  bowl: null | { overs: string; maidens: number; runsConceded: number; wickets: number; wides: number; noBalls: number },
) => ({
  id,
  name,
  batted: bat != null,
  battingPos: null,
  runs: bat?.runs ?? null,
  balls: bat?.balls ?? null,
  fours: null,
  sixes: null,
  notOut: bat?.notOut ?? false,
  dismissal: bat?.dismissal ?? null,
  bowled: bowl != null,
  overs: bowl?.overs ?? null,
  maidens: bowl?.maidens ?? null,
  runsConceded: bowl?.runsConceded ?? null,
  wickets: bowl?.wickets ?? null,
  wides: bowl?.wides ?? null,
  noBalls: bowl?.noBalls ?? null,
  catches: 0,
  stumpings: 0,
  runOuts: 0,
});

const match = {
  id: 4101,
  grade: "A Grade",
  season: 2025,
  round: 8,
  competition: "First Grade",
  matchDate: "2026-01-17",
  venue: "Seacrest Oval",
  result: "Seacrest CC won by 34 runs",
  opponent: "Dunes CC",
  clubScore: "168 / 4",
  opponentScore: "134 / 5",
  abandoned: false,
  clubBattedFirst: true,
  club: {
    name: "Seacrest CC",
    shortName: "SCC",
    logoUrl: null,
    logoUrl128: null,
    backgroundColour: "#123a5c",
    primaryColour: "#e8b93c",
  },
  opponentClub: {
    id: 5,
    name: "Dunes CC",
    shortName: "DCC",
    logoUrl: null,
    logoUrl128: null,
    backgroundColour: "#5c1f2e",
    primaryColour: "#d9a441",
  },
  lines: [
    line(1, 11, "Jacob", "Carter", { runs: 54, balls: 47, fours: 7, sixes: 1, notOut: false, dismissal: "c: Wilson b: Ford" }, null),
    line(2, 12, "Tom", "Nguyen", { runs: 38, balls: 41, fours: 4, sixes: 0, notOut: false, dismissal: "b: Ford" }, { overs: "8", maidens: 1, runsConceded: 24, wickets: 1, wides: 2, noBalls: 0 }),
    line(3, 13, "Marco", "Della Bosca", { runs: 27, balls: 33, fours: 3, sixes: 0, notOut: false, dismissal: "lbw: Hearn" }, null),
    line(4, 14, "Sam", "Rimmer", { runs: 21, balls: 17, fours: 2, sixes: 1, notOut: false, dismissal: "run out (Pratt)" }, { overs: "7.3", maidens: 0, runsConceded: 31, wickets: 1, wides: 1, noBalls: 1 }),
    line(5, 15, "Ben", "Hooper", { runs: 16, balls: 20, fours: 1, sixes: 0, notOut: true, dismissal: null }, { overs: "6", maidens: 0, runsConceded: 28, wickets: 0, wides: 0, noBalls: 0 }),
    line(6, 16, "Dan", "Keys", null, { overs: "9", maidens: 2, runsConceded: 35, wickets: 2, wides: 0, noBalls: 0 }),
    line(7, 17, "Aaron", "Patterson", null, null),
  ],
  oppositionLines: [
    oppLine(11, "N. Wilson", { runs: 44, balls: 52, notOut: false, dismissal: "c: Carter b: Keys" }, null),
    oppLine(12, "R. Ford", { runs: 8, balls: 15, notOut: false, dismissal: "b: Rimmer" }, { overs: "9", maidens: 1, runsConceded: 38, wickets: 2, wides: 2, noBalls: 1 }),
    oppLine(13, "C. Hearn", { runs: 36, balls: 40, notOut: false, dismissal: "c: Hooper b: Nguyen" }, { overs: "8", maidens: 0, runsConceded: 42, wickets: 1, wides: 1, noBalls: 0 }),
    oppLine(14, "P. Pratt", { runs: 22, balls: 31, notOut: false, dismissal: "lbw: Keys" }, null),
    oppLine(15, "G. Aldridge", { runs: 5, balls: 9, notOut: false, dismissal: "run out" }, { overs: "7.2", maidens: 0, runsConceded: 33, wickets: 1, wides: 0, noBalls: 0 }),
    oppLine(16, "S. Mistry", { runs: 10, balls: 14, notOut: true, dismissal: null }, { overs: "6", maidens: 1, runsConceded: 25, wickets: 0, wides: 1, noBalls: 0 }),
  ],
};

/**
 * Full two-innings composition: batting card then bowling card per innings,
 * tenant navy/gold vs the opponent's maroon/gold, on the dark match surface.
 */
export function TwoInningsMatch() {
  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ maxWidth: 620 }}>
        <DigitalScorecard match={match} />
      </div>
    </QueryClientProvider>
  );
}

/** Abandoned match with no recorded lines — the empty-state panel. */
export function AbandonedMatch() {
  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ maxWidth: 620 }}>
        <DigitalScorecard
          match={{
            ...match,
            id: 4102,
            abandoned: true,
            result: "Abandoned",
            clubScore: null,
            opponentScore: null,
            lines: [],
            oppositionLines: [],
          }}
        />
      </div>
    </QueryClientProvider>
  );
}
