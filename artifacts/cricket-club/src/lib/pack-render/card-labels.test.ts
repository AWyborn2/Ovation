import { describe, expect, it } from "vitest";
import { cardNameKey, type CardNames } from "@workspace/scorecard/card-names";
import { pageTokens } from "@workspace/scorecard/kind-templates";
import { bindInput } from "./bind";
import type { CardMatch, ShareCardInput } from "../share-card";

/**
 * Card labels: the opposition's name, initials and logo on every card that
 * names one (from the club's card names), and a player card's whole match
 * (both scores, the result, venue, logos and innings lists) when it carries it.
 */

const NAMES: CardNames = {
  teams: { [cardNameKey("MCC Senior Men A Grade")]: "Mandurah" },
  crests: { [cardNameKey("MCC Senior Men A Grade")]: "https://img.test/mcc.png" },
};

const innings = (teamKey: "club" | "opposition", runs: number, wickets: number) => ({
  teamKey,
  teamName: teamKey === "club" ? "Halls Head" : "Mandurah",
  totalRuns: runs,
  wickets,
  overs: "50",
  topBatters: [{ name: "R Star", runs: 112, balls: 98, notOut: true }],
  topBowlers: [],
});

const MATCH: CardMatch = {
  matchTitle: "A Grade • Round 3",
  result: "Halls Head won by 30 runs",
  resultWinner: "club",
  venue: "Halls Head Oval",
  date: "Sat 14 Nov",
  club: { name: "Halls Head", logoUrl: "https://img.test/hh.png" },
  opposition: { name: "MCC Senior Men A Grade", logoUrl: null },
  innings: [innings("club", 250, 6), innings("opposition", 220, 10)],
} as unknown as CardMatch;

const century = (extra: Partial<Extract<ShareCardInput, { kind: "century" }>> = {}) =>
  ({
    kind: "century",
    playerName: "R Star",
    grade: "A Grade",
    runs: 112,
    opponent: "MCC Senior Men A Grade",
    round: 3,
    ...extra,
  }) as ShareCardInput;

describe("opposition labels", () => {
  it("names the opponent and finds its logo in the club's card names", () => {
    const b = bindInput(century(), null, NAMES);
    expect(b.values["opposition.name"]).toBe("Mandurah");
    expect(b.values["opposition.monogram"]).toBe("MA");
    expect(b.images["opposition.logo"]).toBe("https://img.test/mcc.png");
    expect(b.values["opposition.logoDisplay"]).toBe("flex");
  });

  it("covers team lists and big moments too, and stays off with no opponent", () => {
    const team = bindInput(
      { kind: "teamList", grade: "A Grade", opponent: "MCC Senior Men A Grade" } as ShareCardInput,
      null,
      NAMES,
    );
    expect(team.images["opposition.logo"]).toBe("https://img.test/mcc.png");
    const moment = bindInput(
      {
        kind: "bigMoment",
        momentLabel: "Hat-trick",
        playerName: "R Star",
        oppositionName: "MCC Senior Men A Grade",
      } as ShareCardInput,
      null,
      NAMES,
    );
    expect(moment.values["opposition.name"]).toBe("Mandurah");
    expect(bindInput(century({ opponent: null }), null, NAMES).values["opposition.name"]).toBe(
      undefined,
    );
  });

  it("gives fixture and result rows their crests", () => {
    const fixtures = bindInput(
      {
        kind: "roundFixtures",
        roundLabel: "Round 3",
        date: "Sat",
        fixtures: [
          { grade: "A", opponent: "MCC Senior Men A Grade", venue: "Oval", startTime: "1" },
        ],
      } as ShareCardInput,
      null,
      NAMES,
    );
    expect(fixtures.rows["fixtures"]![0]!.values).toMatchObject({
      opponent: "Mandurah",
      crest: "https://img.test/mcc.png",
      monogram: "MA",
    });
  });
});

describe("match labels on a player card", () => {
  it("binds the match's scores, result, venue and logos beside the card's own", () => {
    const b = bindInput(century({ match: MATCH }), null, NAMES);
    expect(b.values["runs"]).toBe("112");
    expect(b.values["club.score"]).toBe("6/250");
    expect(b.values["opposition.score"]).toBe("10/220");
    expect(b.values["result"]).toBe("Halls Head won by 30 runs");
    expect(b.values["venue"]).toBe("Halls Head Oval");
    expect(b.images["club.logo"]).toBe("https://img.test/hh.png");
    expect(b.images["opposition.logo"]).toBe("https://img.test/mcc.png");
    expect(b.images["photo"]).toBeUndefined();
  });

  it("lists the match and opposition labels in the editor, grouped", () => {
    const cat = pageTokens("century", "card")!;
    const field = (k: string) => cat.fields.find((f) => f.key === k);
    expect(field("runs")?.group).toBeUndefined();
    expect(field("club.score")?.group).toBe("match");
    expect(field("opposition.score")?.group).toBe("opposition");
    expect(field("clubName")?.group).toBe("club");
    expect(cat.images.map((i) => i.key)).toContain("opposition.logo");
    expect(cat.repeats.map((r) => r.key)).toContain("performances.batting");
    // The result card's content fields are its own, not a century's.
    expect(cat.fields.every((f) => f.content === undefined)).toBe(true);
  });
});
