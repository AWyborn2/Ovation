import { CardBack, ScaledCard } from "@workspace/cricket-club";

const PHOTO =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 320"><rect width="384" height="320" fill="#3d4a55"/><circle cx="192" cy="118" r="56" fill="#212a31"/><path d="M72 320c0-66 54-106 120-106s120 40 120 106z" fill="#212a31"/></svg>',
  );

const JASPER = {
  name: "Jasper Carter",
  number: 87,
  role: "All-Rounder" as const,
  rating: 4,
  debutYear: 2014,
  careerSpan: 12,
  photoUrl: PHOTO,
  usingFallback: false,
  stats: {
    matches: 142,
    runs: 4182,
    battingAverage: 34.6,
    centuries: 3,
    halfCenturies: 24,
    wickets: 87,
    bowlingAverage: 21.4,
    fiveWickets: 4,
  },
  additionalStats: {
    highestScore: "124*",
    bestBowling: "5/23",
    // Fielding zeroed so the premierships + awards sections fit inside the
    // fixed 800px card — with every section present the awards clip (app-side
    // overflow:hidden) and the chips overlap the absolute footer.
    catches: 0,
    stumpings: 0,
    runOuts: 0,
  },
  configuredStats: null,
  achievements: {
    premierships: [
      { year: 2019, grade: "A Grade", competition: "A Grade" },
      { year: 2023, grade: "A Grade", competition: "T20" },
    ],
    // One award only — a second row overflows the fixed 800px card and
    // collides with the absolute footer.
    awards: [{ title: "Club Champion", seasons: [2023, 2019] }],
    records: [],
  },
};

/** Stats back face — career, batting, bowling, fielding, premiership chips and awards.
 *  Scaled 0.75 so the full 800px card fits the capture cell. */
export function CareerStatsBack() {
  return (
    <div style={{ padding: 8 }}>
      <ScaledCard scale={0.75}>
        <CardBack data={JASPER} />
      </ScaledCard>
    </div>
  );
}
