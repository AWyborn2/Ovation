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
    "Sam Keeper|1000|Runs|1,000 Club|1000||club.example/go/abc|club.example|#GoClub",
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
    "Alex Stone|2450|runs|||A Grade|club.example/go/abc|club.example|#GoClub",
  ],
  [
    "record",
    { kind: "record", title: "Highest Score", playerName: "Jo Big", value: 212, grade: null },
    "Jo Big|212|highest score|Club Record|||club.example/go/abc|club.example|#GoClub",
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
    "Kim Fast|31|wickets|Grade Leader||B Grade|club.example/go/abc|club.example|#GoClub",
  ],
  [
    "premiership",
    { kind: "premiership", year: 2024, grade: "A Grade", mom: "Pat Lens" },
    "Pat Lens|2024/25|premiers|Premiers||A Grade|club.example/go/abc|club.example|#GoClub",
  ],
  [
    "debut with cap",
    { kind: "debut", playerName: "New Kid", capNumber: 412, grade: "A Grade", season: "2025/26" },
    "New Kid|412|debut|A Grade Cap #412|2025/26|A Grade|club.example/go/abc|club.example|#GoClub",
  ],
  [
    "debut without cap",
    { kind: "debut", playerName: "New Kid", capNumber: null, grade: "C Grade" },
    "New Kid||debut|C Grade Debut||C Grade|club.example/go/abc|club.example|#GoClub",
  ],
  [
    "century",
    { kind: "century", playerName: "Ton Up", runs: 104, notOut: true, grade: "B Grade" },
    "Ton Up|104*|runs|Century|100|B Grade|club.example/go/abc|club.example|#GoClub",
  ],
  [
    "fiveFor",
    { kind: "fiveFor", playerName: "Swing King", wickets: 6, figures: "6/23", grade: "A Grade" },
    "Swing King|6/23|wickets|Five-Wicket Haul|5|A Grade|club.example/go/abc|club.example|#GoClub",
  ],
  [
    "fiveFor without figures",
    { kind: "fiveFor", playerName: "Swing King", wickets: 5, grade: "A Grade" },
    "Swing King|5|wickets|Five-Wicket Haul|5|A Grade|club.example/go/abc|club.example|#GoClub",
  ],
  [
    "matchSummary",
    { kind: "matchSummary", result: "Won by 30 runs", matchTitle: "A Grade — Round 4" },
    "|Won by 30 runs|result|Match Summary||A Grade — Round 4|club.example/go/abc|club.example|#GoClub",
  ],
  ["a kind without tokens", { kind: "ladder" }, "||||||club.example/go/abc|club.example|#GoClub"],
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
