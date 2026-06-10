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
    result: "Halls Head won by 5 wickets",
    resultWinner: "club",
    club: {
      name: "Halls Head",
      shortName: "HHCC",
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
};

export function sampleCardInput(kind: ShareCardInput["kind"]): ShareCardInput {
  return SAMPLES[kind];
}
