/**
 * Caption rendering moved from the web app into @workspace/scorecard (Social
 * Studio U5). These pin every KNOWN_TOKEN for every card kind to the output
 * the web implementation produced before the move.
 */
import { describe, it, expect } from "vitest";
import {
  KNOWN_TOKENS,
  captionAppLink,
  renderCaption,
  truncateForPlatform,
  type CaptionCardInput,
} from "./captions";

const ctx = { clubUrl: "club.example", hashtag: "#GoClub", appLink: "club.example/go/abc" };
const ALL = KNOWN_TOKENS.join("|");

const cases: Array<[string, CaptionCardInput & Record<string, unknown>, string]> = [
  [
    "milestone",
    {
      kind: "milestone",
      playerName: "Sam Keeper",
      currentValue: 1000,
      milestoneLabel: "Runs",
      tierLabel: "1,000 Club",
      threshold: 1000,
      tierIndex: 0,
    },
    "Sam Keeper|1000|Runs|1,000 Club|1000||||||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "player",
    {
      kind: "player",
      playerName: "Alex Stone",
      gradesPlayed: "A Grade",
      stats: [
        { label: "Games", value: 88 },
        { label: "Runs", value: 2450 },
      ],
    },
    "Alex Stone|2450|runs|||A Grade|||||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "record",
    { kind: "record", title: "Highest Score", playerName: "Jo Big", value: 212, grade: null },
    "Jo Big|212|highest score|Club Record|||||||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "gradeLeader",
    {
      kind: "gradeLeader",
      playerName: "Kim Fast",
      value: 31,
      category: "Wickets",
      grade: "B Grade",
    },
    "Kim Fast|31|wickets|Grade Leader||B Grade|||||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "premiership",
    { kind: "premiership", year: 2024, grade: "A Grade", mom: "Pat Lens" },
    "Pat Lens|2024/25|premiers|Premiers||A Grade|||||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "debut with cap",
    { kind: "debut", playerName: "New Kid", capNumber: 412, grade: "A Grade", season: "2025/26" },
    "New Kid|412|debut|A Grade Cap #412|2025/26|A Grade|||||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "debut without cap",
    { kind: "debut", playerName: "New Kid", capNumber: null, grade: "C Grade" },
    "New Kid||debut|C Grade Debut||C Grade|||||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "century",
    { kind: "century", playerName: "Ton Up", runs: 104, notOut: true, grade: "B Grade" },
    "Ton Up|104*|runs|Century|100|B Grade|||||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "fiveFor",
    { kind: "fiveFor", playerName: "Swing King", wickets: 6, figures: "6/23", grade: "A Grade" },
    "Swing King|6/23|wickets|Five-Wicket Haul|5|A Grade|||||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "fiveFor without figures",
    { kind: "fiveFor", playerName: "Swing King", wickets: 5, grade: "A Grade" },
    "Swing King|5|wickets|Five-Wicket Haul|5|A Grade|||||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "matchSummary",
    { kind: "matchSummary", result: "Won by 30 runs", matchTitle: "A Grade — Round 4" },
    "|Won by 30 runs|result|Match Summary||A Grade — Round 4|||||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "century with opponent and round",
    {
      kind: "century",
      playerName: "Ton Up",
      runs: 121,
      grade: "A Grade",
      opponent: "Rivals CC",
      round: 6,
    },
    "Ton Up|121|runs|Century|100|A Grade|Rivals CC|Round 6|||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "matchSummary with opposition, venue and date",
    {
      kind: "matchSummary",
      result: "Won by 4 wickets",
      matchTitle: "B Grade • Round 2",
      opposition: { name: "Rivals CC" },
      venue: "Home Oval",
      date: "Sat 12 Oct",
    },
    "|Won by 4 wickets|result|Match Summary||B Grade • Round 2|Rivals CC||Home Oval|Sat 12 Oct|club.example/go/abc|club.example|#GoClub",
  ],
  [
    "matchDay",
    {
      kind: "matchDay",
      roundLabel: "Round 3",
      oppositionName: "Rivals CC",
      homeAway: "HOME",
      venue: "Home Oval",
      date: "Sat 19 Oct",
      startTime: "12:30pm",
    },
    "|12:30pm|start|Match Day|||Rivals CC|Round 3|Home Oval|Sat 19 Oct|club.example/go/abc|club.example|#GoClub",
  ],
  [
    "matchDay with the fixture's grade",
    {
      kind: "matchDay",
      roundLabel: "ROUND 3",
      oppositionName: "Rivals CC",
      venue: "Home Oval",
      date: "SAT 19 OCT",
      startTime: "12:30pm",
      grade: "A Grade",
    },
    "|12:30pm|start|Match Day||A Grade|Rivals CC|ROUND 3|Home Oval|SAT 19 OCT|club.example/go/abc|club.example|#GoClub",
  ],
  [
    "roundFixtures",
    {
      kind: "roundFixtures",
      roundLabel: "Round 3",
      date: "Sat 19 Oct",
      fixtures: [{}, {}, {}],
    },
    "|3|fixtures|Game Day||||Round 3||Sat 19 Oct|club.example/go/abc|club.example|#GoClub",
  ],
  [
    "teamList",
    {
      kind: "teamList",
      gradeRound: "A Grade • Round 3",
      competitionLine: "Premier",
      venueDateTime: "Home Oval • Sat 12:30pm",
      players: new Array(11).fill({}),
    },
    "|11|players|Team List||A Grade • Round 3|||Home Oval • Sat 12:30pm||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "teamListRound with one team",
    { kind: "teamListRound", roundLabel: "Round 3", date: "Sat 19 Oct", teams: [{}] },
    "|1|team|Team Lists||||Round 3||Sat 19 Oct|club.example/go/abc|club.example|#GoClub",
  ],
  [
    "weekendWrap counts wins",
    {
      kind: "weekendWrap",
      roundLabel: "Round 3",
      dateRange: "19–20 Oct",
      matches: [{ outcome: "won" }, { outcome: "lost" }, { outcome: "won" }],
    },
    "|2|wins|Weekend Wrap||||Round 3||19–20 Oct|club.example/go/abc|club.example|#GoClub",
  ],
  [
    "ladder finds the club's row",
    {
      kind: "ladder",
      gradeLabel: "A Grade",
      asOfLabel: "After Round 7",
      rows: [{ pos: 1 }, { pos: 2, isClub: true }],
    },
    "|2nd|on the ladder|Ladder||A Grade||After Round 7|||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "ladder without the club",
    { kind: "ladder", gradeLabel: "A Grade", asOfLabel: "After Round 7", rows: [{ pos: 1 }] },
    "|||Ladder||A Grade||After Round 7|||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "clubLeaderboard takes the leader",
    {
      kind: "clubLeaderboard",
      title: "Run Machines",
      season: "2025/26",
      category: "Runs",
      leaders: [
        { playerName: "Jo Big", value: "612", gradeLabel: "A Grade" },
        { playerName: "Al Two", value: "540", gradeLabel: "B Grade" },
      ],
    },
    "Jo Big|612|runs|Run Machines|2025/26|A Grade|||||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "bigMoment",
    {
      kind: "bigMoment",
      momentLabel: "Fifty",
      playerName: "Sam Hit",
      runs: 50,
      balls: 28,
      oppositionName: "Rivals CC",
    },
    "Sam Hit|50 (28)|runs|Fifty|||Rivals CC||||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "newSigning",
    {
      kind: "newSigning",
      playerFirstName: "Jo",
      playerLastName: "Quick",
      role: "Fast bowler",
      season: "2026/27",
    },
    "Jo Quick||Fast bowler|New Signing|2026/27||||||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "countdown",
    {
      kind: "countdown",
      daysToGo: "7",
      eventLabel: "Season Opener",
      dateVenue: "Sat 5 Oct • Home Oval",
    },
    "|7|days to go|Season Opener|||||Sat 5 Oct • Home Oval||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "tradingCard with cap",
    {
      kind: "tradingCard",
      playerName: "Ace Card",
      role: "Batter",
      capNumber: 77,
      season: "2025/26",
      stats: [{ label: "Runs", value: "3,104" }],
    },
    "Ace Card|3,104|runs|Cap #77|2025/26||||||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "tradingCard without cap uses the role",
    { kind: "tradingCard", playerName: "Ace Card", role: "Batter", stats: [] },
    "Ace Card|||Batter|||||||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "juniorHighlights takes the first highlight",
    {
      kind: "juniorHighlights",
      grade: "Under 13",
      roundLabel: "Round 4",
      highlights: [{ name: "Kid One", note: "Top Score", figure: "34" }],
    },
    "Kid One|34|top score|Junior Highlights||Under 13||Round 4|||club.example/go/abc|club.example|#GoClub",
  ],
  [
    "a kind without tokens",
    { kind: "somethingNew" },
    "||||||||||club.example/go/abc|club.example|#GoClub",
  ],
];

describe("renderCaption", () => {
  it.each(cases)("%s: every known token", (_name, input, expected) => {
    expect(renderCaption(ALL, input, ctx)).toBe(expected);
  });

  it("leaves unknown tokens empty and plain text alone", () => {
    expect(renderCaption("Hi {nope} there", { kind: "century" }, ctx)).toBe("Hi  there");
  });
});

describe("captionAppLink", () => {
  it("prefers a tracked link, then the app path, then the bare club URL", () => {
    expect(captionAppLink("https://club.example/", "/players/4", "xyz")).toBe(
      "club.example/go/xyz",
    );
    expect(captionAppLink("https://club.example/", "/players/4")).toBe("club.example/players/4");
    expect(captionAppLink("http://club.example")).toBe("club.example");
  });
});

describe("truncateForPlatform", () => {
  it("cuts at the platform limit with an ellipsis", () => {
    const long = "x".repeat(300);
    const out = truncateForPlatform(long, "twitter");
    expect(out).toHaveLength(280);
    expect(out.endsWith("…")).toBe(true);
    expect(truncateForPlatform("short", "twitter")).toBe("short");
  });
});
