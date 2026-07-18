import { PlayerStatsModal } from "@workspace/cricket-club";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// The modal's generated useGetPlayer hook reads from react-query. Seed the
// cache at the hook's real query key (["/api/players/<id>"]) so the open modal
// renders a full career summary statically, with no network fetch (staleTime
// Infinity keeps the seeded data fresh).
const player = {
  id: 42,
  surname: "Carter",
  givenName: "Jacob",
  deceased: false,
  gradesPlayed: "A Grade, B Grade",
  premiershipsWon: 2,
  premiershipsCaptained: 1,
  imageUrl: null,
  cardRole: null,
  cardRating: null,
  debutSeason: 2014,
  seasonsPlayed: 11,
  premierships: [],
  awards: [],
  stats: [
    {
      id: 1,
      playerId: 42,
      surname: "Carter",
      givenName: "Jacob",
      grade: "A Grade",
      season: null,
      games: 98,
      innings: 91,
      notOuts: 12,
      runs: 2847,
      batAvg: 36.0,
      highScore: "124*",
      fifties: 18,
      hundreds: 3,
      wickets: 41,
      runsConceded: 1130,
      bowlAvg: 27.6,
      bestBowling: "5/23",
      fiveWickets: 1,
      catches: 44,
      stumpings: 0,
      runOuts: 6,
    },
    {
      id: 2,
      playerId: 42,
      surname: "Carter",
      givenName: "Jacob",
      grade: "B Grade",
      season: null,
      games: 24,
      innings: 21,
      notOuts: 4,
      runs: 512,
      batAvg: 30.1,
      highScore: "78",
      fifties: 3,
      hundreds: 0,
      wickets: 18,
      runsConceded: 402,
      bowlAvg: 22.3,
      bestBowling: "4/18",
      fiveWickets: 0,
      catches: 10,
      stumpings: 0,
      runOuts: 2,
    },
  ],
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, retry: false, refetchOnMount: false, refetchOnWindowFocus: false },
  },
});
queryClient.setQueryData(["/api/players/42"], player);

/**
 * Open career-stats popup with batting / bowling / fielding sections computed
 * from two grade rows. The transform wrapper contains the fixed-position
 * overlay inside the capture cell.
 */
export function CareerSummaryOpen() {
  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ position: "relative", transform: "translateZ(0)", minHeight: 640, width: "100%" }}>
        <PlayerStatsModal playerId={42} fallbackName="Jacob Carter" onClose={() => {}} />
      </div>
    </QueryClientProvider>
  );
}
