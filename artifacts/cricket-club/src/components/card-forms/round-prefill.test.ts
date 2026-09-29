import { describe, expect, it } from "vitest";
import type { Fixture } from "@workspace/api-client-react";
import {
  fixtureRoundLabel,
  fixtureRoundToState,
  gradeTile,
  groupFixturesByRound,
  ROUND_FIXTURES_CAP,
} from "./prefill";
import { buildCardInput } from "./logic";
import { renderPackCard, PACK_DEFAULT_TOKENS } from "@/lib/pack-render";
import { resolvePackIdForKind } from "@/lib/card-template";

/**
 * Game day (roundFixtures) prefill: every grade the club plays in a round,
 * from the fixtures list.
 */

let nextId = 1;
function fx(grade: string, startAt: string, over: Partial<Fixture> = {}): Fixture {
  return {
    id: nextId++,
    grade,
    roundLabel: "Round 15",
    opponentName: `${grade} Opposition`,
    venue: "Sample Oval",
    startAt,
    isHome: true,
    source: "playhq",
    createdAt: "2026-09-01T00:00:00Z",
    ...over,
  } as Fixture;
}

describe("game day prefill from fixtures", () => {
  it("groups a round across its weekend, earliest start first", () => {
    const rounds = groupFixturesByRound([
      fx("B Grade", "2027-02-13T05:00:00Z"), // Sat
      fx("A Grade", "2027-02-13T04:30:00Z"), // Sat, earlier
      fx("Female A Grade", "2027-02-14T01:00:00Z"), // Sun, same weekend
      fx("T20", "2027-02-12T09:00:00Z"), // Fri night, same weekend
      fx("A Grade", "2027-02-20T04:30:00Z", { roundLabel: "Round 16" }),
    ]);
    expect(rounds).toHaveLength(2);
    expect(rounds[0].roundLabel).toBe("ROUND 15");
    expect(rounds[0].fixtures.map((f) => f.grade)).toEqual([
      "T20",
      "A Grade",
      "B Grade",
      "Female A Grade",
    ]);
    expect(rounds[1].roundLabel).toBe("ROUND 16");
  });

  it("never mixes junior and senior grades in one round", () => {
    const rounds = groupFixturesByRound([
      fx("A Grade", "2027-02-13T04:30:00Z"),
      fx("Under 13", "2027-02-13T00:30:00Z"),
      fx("U15s", "2027-02-13T01:30:00Z"),
    ]);
    expect(rounds).toHaveLength(2);
    const senior = rounds.find((r) => !r.junior)!;
    const junior = rounds.find((r) => r.junior)!;
    expect(senior.fixtures.map((f) => f.grade)).toEqual(["A Grade"]);
    expect(junior.fixtures.map((f) => f.grade)).toEqual(["Under 13", "U15s"]);
    expect(fixtureRoundLabel(junior)).toContain("(juniors)");
    expect(fixtureRoundToState(junior).junior).toBe(true);
  });

  it("shortens grades for the tile", () => {
    expect(gradeTile("A Grade")).toBe("A");
    expect(gradeTile("Female A Grade")).toBe("FA");
    expect(gradeTile("Under 15")).toBe("U15");
    expect(gradeTile("T20")).toBe("T20");
    expect(gradeTile("Colts")).toBe("COL");
  });

  it("maps a round onto the card, capped, with a venue fallback", () => {
    const fixtures = ["A", "B", "C", "D", "E", "F"].map((g, i) =>
      fx(`${g} Grade`, `2027-02-13T1${i}:00:00Z`, i === 1 ? { venue: null, isHome: false } : {}),
    );
    const [round] = groupFixturesByRound(fixtures);
    const state = fixtureRoundToState(round) as {
      roundLabel: string;
      date: string;
      fixtures: { grade: string; opponent: string; venue: string; startTime: string }[];
    };
    expect(state.roundLabel).toBe("ROUND 15");
    expect(state.date).toMatch(/^SATURDAY 13 FEB$/);
    expect(state.fixtures).toHaveLength(ROUND_FIXTURES_CAP);
    expect(state.fixtures[0]).toMatchObject({ grade: "A", opponent: "A Grade Opposition" });
    expect(state.fixtures[0].startTime).toMatch(/\d{1,2}:\d{2} (AM|PM)/);
    expect(state.fixtures[1].venue).toBe("Away");
  });

  it("builds a card that renders every grade", () => {
    const [round] = groupFixturesByRound([
      fx("A Grade", "2027-02-13T04:30:00Z", { opponentName: "Baldivis" }),
      fx("B Grade", "2027-02-13T04:30:00Z", { opponentName: "Rockingham" }),
    ]);
    const input = buildCardInput("roundFixtures", fixtureRoundToState(round), false);
    const html = renderPackCard(
      input,
      "square",
      true,
      PACK_DEFAULT_TOKENS,
      false,
      null,
      resolvePackIdForKind(null, "roundFixtures"),
    );
    expect(html).toContain("v Baldivis");
    expect(html).toContain("v Rockingham");
    expect(html).not.toMatch(/\{\{/);
  });
});
