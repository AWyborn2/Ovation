import { NameBlock } from "@workspace/cricket-club";

const JASPER = {
  name: "Jasper Carter",
  number: 87,
  role: "All-Rounder" as const,
  rating: 4,
  debutYear: 2014,
  careerSpan: 12,
  photoUrl: "",
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
    catches: 61,
    stumpings: 0,
    runOuts: 9,
  },
  configuredStats: null,
  achievements: { premierships: [], awards: [], records: [] },
};

const panel: React.CSSProperties = {
  width: 348,
  background: "linear-gradient(160deg, #333F48 0%, #2a343c 100%)",
  borderRadius: 16,
  padding: "20px 0",
  color: "#fff",
  fontFamily: "'IBM Plex Sans', sans-serif",
  display: "grid",
  gap: 20,
};

/** Card-front name block — with a star rating, and rating hidden when null. */
export function NameWithAndWithoutRating() {
  return (
    <div style={panel}>
      <NameBlock data={JASPER} />
      <NameBlock data={{ ...JASPER, name: "Riley Dunstan", rating: null }} />
    </div>
  );
}
