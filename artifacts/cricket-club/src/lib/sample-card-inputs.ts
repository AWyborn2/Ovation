import type { ShareCardInput } from "@/lib/share-card";

// Representative sample inputs per card kind, used to render gallery thumbnails
// and to drive the Social Studio layer editor's preview/field context. These are
// display-only stand-ins — they never touch real club data.
const SAMPLES: { [K in ShareCardInput["kind"]]: Extract<ShareCardInput, { kind: K }> } = {
  milestone: {
    kind: "milestone",
    playerName: "Sample Player",
    tierLabel: "Centurion",
    tierIndex: 2,
    milestoneLabel: "Career Runs",
    currentValue: 1000,
    threshold: 1000,
    headline: "1,000 CLUB RUNS",
  },
  player: {
    kind: "player",
    playerName: "Sample Player",
    gradesPlayed: "A Grade",
    stats: [
      { label: "Runs", value: 1234 },
      { label: "Wickets", value: 56 },
      { label: "Games", value: 89 },
    ],
    headline: "PLAYER SPOTLIGHT",
  },
  record: {
    kind: "record",
    title: "Highest Score",
    playerName: "Sample Player",
    value: "187*",
    grade: "A Grade",
    headline: "CLUB RECORD",
  },
  gradeLeader: {
    kind: "gradeLeader",
    grade: "A Grade",
    category: "Runs",
    playerName: "Sample Player",
    value: 642,
    headline: "LEADERBOARD",
  },
  premiership: {
    kind: "premiership",
    grade: "A Grade",
    year: 2024,
    competition: "One Day Premiership",
    result: "Champions",
    mom: "Sample Player",
    headline: "PREMIERS",
  },
  debut: {
    kind: "debut",
    playerName: "Sample Player",
    grade: "A Grade",
    capNumber: 123,
    season: "2024/25",
    opponent: "Rival Club",
    round: 5,
    headline: "DEBUT",
  },
  newCap: {
    kind: "newCap",
    playerName: "Sample Player",
    grade: "A Grade",
    category: "male",
    capNumber: 123,
    headline: "NEW CAP",
  },
  century: {
    kind: "century",
    playerName: "Sample Player",
    grade: "A Grade",
    runs: 112,
    balls: 98,
    notOut: true,
    opponent: "Rival Club",
    round: 5,
    headline: "CENTURY",
  },
  fiveFor: {
    kind: "fiveFor",
    playerName: "Sample Player",
    grade: "A Grade",
    wickets: 5,
    runsConceded: 24,
    overs: "9.2",
    figures: "5/24",
    opponent: "Rival Club",
    round: 5,
    headline: "FIVE-FOR",
  },
  matchSummary: {
    kind: "matchSummary",
    matchTitle: "A Grade • Round 5",
    matchType: "One Day",
    date: "Sat 12 Oct 2024",
    venue: "Sample Oval",
    result: "Sample Club won by 5 wickets",
    resultWinner: "club",
    club: {
      name: "Sample Club",
      shortName: "SC",
      primaryColor: "#42342B",
      secondaryColor: "#FBAC27",
      textColor: "#F5F2E8",
    },
    opposition: {
      name: "Rival Club",
      shortName: "RIV",
      primaryColor: "#1E3A5F",
      secondaryColor: "#FFFFFF",
      textColor: "#FFFFFF",
    },
    innings: [
      {
        teamKey: "opposition",
        inningsNum: 1,
        totalRuns: "185",
        wickets: "10",
        overs: "44.3",
        topBatters: [
          { name: "R. Batter", runs: 64, balls: 71 },
          { name: "S. Striker", runs: 41, balls: 38 },
        ],
        topBowlers: [{ name: "Sample Player", wickets: 3, runs: 28, overs: "9" }],
      },
      {
        teamKey: "club",
        inningsNum: 2,
        totalRuns: "186",
        wickets: "5",
        overs: "41.1",
        topBatters: [
          { name: "Sample Player", runs: 72, balls: 80, notOut: true },
          { name: "T. Opener", runs: 45, balls: 52 },
        ],
        topBowlers: [{ name: "O. Bowler", wickets: 2, runs: 33, overs: "8" }],
      },
    ],
    headline: "MATCH RESULT",
  },
  matchDay: {
    kind: "matchDay",
    roundLabel: "ROUND 8",
    oppositionName: "Baldivis",
    homeAway: "HOME",
    venue: "Sample Oval",
    date: "SAT 14 DEC",
    startTime: "12:00 PM",
    noteTitle: "SELECTION NOTE",
    noteBody: "Squad announced Thursday night — get down and support the club.",
  },
  teamList: {
    kind: "teamList",
    gradeRound: "A GRADE — ROUND 8",
    competitionLine: "First Grade • One Day",
    venueDateTime: "Sample Oval • Sat 14 Dec • 12:00 PM",
    players: [
      { order: 1, surname: "BURRAGE" },
      { order: 2, surname: "RUDGE" },
      { order: 3, surname: "MANUEL", role: "C" },
      { order: 4, surname: "WHITFIELD" },
      { order: 5, surname: "CURRIE", role: "WK" },
      { order: 6, surname: "TALBOT" },
      { order: 7, surname: "OSBORNE" },
      { order: 8, surname: "GRIMSHAW" },
      { order: 9, surname: "PARDOE" },
      { order: 10, surname: "KEELEY" },
      { order: 11, surname: "STANTON" },
    ],
  },
  weekendWrap: {
    kind: "weekendWrap",
    roundLabel: "ROUND 8 WRAP",
    dateRange: "13–14 DEC",
    matches: [
      {
        gradeLabel: "A GRADE",
        resultLine: "def. Baldivis by 32 runs",
        performers: "J. Manuel 74 • T. Burrage 3/21",
        outcome: "won",
      },
      {
        gradeLabel: "B GRADE",
        resultLine: "lost to Rockingham by 4 wickets",
        performers: "S. Rudge 51 • D. Currie 2/18",
        outcome: "lost",
      },
      {
        gradeLabel: "C GRADE",
        resultLine: "def. Pinjarra by 6 wickets",
        performers: "L. Whitfield 48* • M. Talbot 3/9",
        outcome: "won",
      },
      {
        gradeLabel: "U15",
        resultLine: "drew with Mandurah",
        performers: "H. Osborne 39 • C. Pardoe 2/12",
        outcome: "draw",
      },
    ],
  },
  ladder: {
    kind: "ladder",
    competitionName: "FIRST GRADE",
    gradeLabel: "A GRADE",
    asOfLabel: "AFTER ROUND 8",
    rows: [
      { pos: 1, team: "Your Club", played: 8, won: 7, lost: 1, points: 42, isClub: true },
      { pos: 2, team: "Baldivis", played: 8, won: 6, lost: 2, points: 38 },
      { pos: 3, team: "Rockingham", played: 8, won: 5, lost: 3, points: 33 },
      { pos: 4, team: "Mandurah", played: 8, won: 4, lost: 4, points: 28 },
      { pos: 5, team: "Pinjarra", played: 8, won: 3, lost: 5, points: 22 },
      { pos: 6, team: "Waroona", played: 8, won: 2, lost: 6, points: 16 },
      { pos: 7, team: "Dawesville", played: 8, won: 1, lost: 7, points: 10 },
    ],
  },
  bigMoment: {
    kind: "bigMoment",
    momentLabel: "CENTURY ALERT",
    playerName: "Jack Manuel",
    runs: 104,
    balls: 89,
    boundaryDetail: "11 fours • 3 sixes",
    oppositionName: "Baldivis",
    inningsLabel: "1ST INNINGS",
    liveScore: "4/218",
    oversChaseLine: "38.2 overs",
    equation: "Brings up his ton with a six over mid-wicket",
  },
  newSigning: {
    kind: "newSigning",
    playerFirstName: "Tom",
    playerLastName: "Burrage",
    role: "All-rounder",
    formerClub: "Rockingham",
    headline: "WELCOME TO THE CLUB",
    season: "2024/25",
  },
  countdown: {
    kind: "countdown",
    daysToGo: "2",
    eventLabel: "SEASON OPENER",
    hypeLine1: "THE WAIT IS ALMOST OVER",
    hypeLine2: "GET AROUND THE CLUB",
    dateVenue: "Sat 14 Dec • Sample Oval",
    fixtureLine: "A Grade vs Baldivis",
  },
  clubLeaderboard: {
    kind: "clubLeaderboard",
    title: "CLUB RUN SCORERS",
    subtitle: "Leading run scorer in each grade",
    season: "2024/25",
    category: "Runs",
    leaders: [
      { gradeLabel: "A GRADE", playerName: "Jack Manuel", value: "428" },
      { gradeLabel: "B GRADE", playerName: "Sam Rudge", value: "376" },
      { gradeLabel: "C GRADE", playerName: "Liam Whitfield", value: "342" },
      { gradeLabel: "U15", playerName: "Harry Osborne", value: "291" },
    ],
  },
};

/**
 * The generic club tokens sample data uses for the tenant's own side.
 * Opposition names ("Rival Club", "Baldivis", …) are deliberately NOT tokens —
 * they are the other side of the fixture, not the tenant.
 */
const CLUB_TOKEN_RE = /SAMPLE CLUB|YOUR CLUB|Sample Club|Your Club/g;

function replaceClubTokens<T>(value: T, club: string): T {
  if (typeof value === "string") {
    return value.replace(CLUB_TOKEN_RE, (token) =>
      token === token.toUpperCase() ? club.toUpperCase() : club,
    ) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => replaceClubTokens(v, club)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = replaceClubTokens(v, club);
    return out as T;
  }
  return value;
}

/**
 * A representative input for `kind`, for previews and form seeding.
 *
 * Pass `clubName` (already shortened — see `shortClubName`) to have the sample
 * speak as the tenant: "Sample Club won by 5 wickets" → "Mandurah won by 5
 * wickets", the ladder's highlighted row becomes the tenant's, and so on. The
 * Studio gallery and the composer seed both do this, so a club browsing card
 * designs sees ITS results, not a generic club's. Omitted → the neutral sample,
 * unchanged (tests, brand-less contexts).
 *
 * Substitution deep-clones; the shared sample objects are never mutated.
 */
export function sampleCardInput(
  kind: ShareCardInput["kind"],
  clubName?: string | null,
): ShareCardInput {
  const sample = SAMPLES[kind];
  if (!clubName?.trim()) return sample;
  return replaceClubTokens(sample, clubName.trim());
}
