import { PlayerPhoto } from "@workspace/cricket-club";

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
    catches: 61,
    stumpings: 0,
    runOuts: 9,
  },
  configuredStats: null,
  achievements: { premierships: [], awards: [], records: [] },
};

/** Portrait band with a photo, role chip and debut-year chip. */
export function WithPhoto() {
  return (
    <div style={{ width: 384, borderRadius: 16, overflow: "hidden" }}>
      <PlayerPhoto data={JASPER} height={300} />
    </div>
  );
}

/** Missing photo — the brand radial gradient carries the band; chips still render. */
export function MissingPhotoFallback() {
  return (
    <div style={{ width: 384, borderRadius: 16, overflow: "hidden" }}>
      <PlayerPhoto data={{ ...JASPER, photoUrl: "/no-such-player.png", usingFallback: true }} height={300} />
    </div>
  );
}
