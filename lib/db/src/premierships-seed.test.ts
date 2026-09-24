import { describe, it, expect } from "vitest";
import {
  planPremiershipSeed,
  premiershipResult,
  premiershipYear,
  PRIVATE_PLAYER_NAME,
  type ExistingPremiership,
} from "./premierships-seed";
import { pickDeciderMatch, shortTeamName, type CentralPremiershipSeed } from "./central-queries";

function seed(overrides: Partial<CentralPremiershipSeed> = {}): CentralPremiershipSeed {
  return {
    premierId: 7,
    grade: "A Grade: Wyllie Cup",
    appGrade: "A Grade",
    format: "One Day",
    seasonStartYear: 2023,
    matchDate: "2024-03-16",
    venue: "Rushton Park",
    opponent: "Pinjarra Cricket Club",
    confidence: "high",
    note: null,
    matchId: 5001,
    clubScore: "7/245",
    opponentScore: "180",
    outcome: "won",
    matchResultText: "Mandurah won by 65 runs",
    players: [
      { participantId: "g-1", name: "Alex Smith", isPrivate: false, order: 1 },
      { participantId: "g-2", name: "Hidden Person", isPrivate: true, order: 2 },
      { participantId: null, name: "Name Only", isPrivate: false, order: 3 },
    ],
    ...overrides,
  };
}

function existing(overrides: Partial<ExistingPremiership> = {}): ExistingPremiership {
  return {
    id: 100,
    year: 2024,
    grade: "A Grade",
    competition: "A Grade: Wyllie Cup",
    venue: null,
    matchDate: null,
    result: null,
    notes: null,
    centralPremierId: 7,
    centralMatchId: null,
    playerCount: 0,
    ...overrides,
  };
}

describe("premiershipYear", () => {
  it("uses the calendar year of the final when dated", () => {
    expect(premiershipYear(seed({ matchDate: "2024-03-16" }))).toBe(2024);
    expect(premiershipYear(seed({ matchDate: "2023-12-02" }))).toBe(2023);
  });

  it("falls back to the season's end year when undated", () => {
    expect(premiershipYear(seed({ matchDate: null, seasonStartYear: 2023 }))).toBe(2024);
  });

  it("is null when neither date nor season is known", () => {
    expect(premiershipYear(seed({ matchDate: null, seasonStartYear: null }))).toBeNull();
  });
});

describe("premiershipResult", () => {
  it("writes scores from the club's side for a won decider", () => {
    expect(premiershipResult(seed())).toBe("7/245 def Pinjarra 180");
  });

  it("uses central's result text for a washout / shared title", () => {
    expect(
      premiershipResult(seed({ outcome: "undecided", matchResultText: "Match abandoned" })),
    ).toBe("Match abandoned");
  });

  it("falls back to the opponent, then the note, with no decider", () => {
    const none = { outcome: null, matchId: null, clubScore: null, opponentScore: null };
    expect(premiershipResult(seed(none))).toBe("def Pinjarra");
    expect(premiershipResult(seed({ ...none, opponent: null, note: "Minor premiers" }))).toBe(
      "Minor premiers",
    );
    expect(premiershipResult(seed({ ...none, opponent: null }))).toBe("Premiers");
  });
});

describe("shortTeamName", () => {
  it("drops a trailing Cricket Club", () => {
    expect(shortTeamName("Pinjarra Cricket Club")).toBe("Pinjarra");
    expect(shortTeamName("Rockingham-Mandurah CC")).toBe("Rockingham-Mandurah");
    expect(shortTeamName("Waroona")).toBe("Waroona");
    expect(shortTeamName("  ")).toBeNull();
  });
});

describe("planPremiershipSeed", () => {
  it("inserts a new premiership with result, scorecard link and team list", () => {
    const plan = planPremiershipSeed([], [seed()]);
    expect(plan.updates).toEqual([]);
    expect(plan.inserts).toHaveLength(1);
    const ins = plan.inserts[0]!;
    expect(ins.row).toMatchObject({
      year: 2024,
      grade: "A Grade",
      competition: "A Grade: Wyllie Cup",
      result: "7/245 def Pinjarra 180",
      centralPremierId: 7,
      centralMatchId: 5001,
      notes: "confidence: high",
    });
    expect(ins.players).toEqual([
      { name: "Alex Smith", participantId: "g-1", battingOrder: 1 },
      // Private players are masked and their GUID is never persisted.
      { name: PRIVATE_PLAYER_NAME, participantId: null, battingOrder: 2 },
      { name: "Name Only", participantId: null, battingOrder: 3 },
    ]);
  });

  it("skips premiers it cannot place", () => {
    const plan = planPremiershipSeed(
      [],
      [seed({ matchDate: null, seasonStartYear: null }), seed({ appGrade: null, grade: null })],
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.skipped).toBe(2);
  });

  it("only backfills an already-seeded row and keeps the club's edits", () => {
    const plan = planPremiershipSeed(
      [
        existing({
          result: "Mandurah 7/245 d Pinjarra 180 (club's wording)",
          venue: "Edited Oval",
          playerCount: 11,
        }),
      ],
      [seed()],
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toEqual([
      {
        id: 100,
        set: { centralMatchId: 5001, matchDate: "2024-03-16", notes: "confidence: high" },
        players: [],
      },
    ]);
  });

  it("upgrades the old seed's placeholder result and start-year year", () => {
    const plan = planPremiershipSeed(
      [existing({ centralPremierId: null, year: 2023, result: "def Pinjarra Cricket Club" })],
      [seed()],
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.set).toMatchObject({
      centralPremierId: 7,
      centralMatchId: 5001,
      result: "7/245 def Pinjarra 180",
      year: 2024,
    });
    expect(plan.updates[0]!.players).toHaveLength(3);
  });

  it("does not adopt a curated row from a different competition", () => {
    const plan = planPremiershipSeed(
      [existing({ centralPremierId: null, competition: "MID-YEAR T20" })],
      [seed()],
    );
    expect(plan.inserts).toHaveLength(1);
    expect(plan.updates).toEqual([]);
  });

  it("is a no-op when everything is already seeded", () => {
    const first = planPremiershipSeed([], [seed()]).inserts[0]!.row;
    const plan = planPremiershipSeed([existing({ ...first, id: 100, playerCount: 3 })], [seed()]);
    expect(plan).toEqual({ inserts: [], updates: [], skipped: 0 });
  });
});

describe("pickDeciderMatch", () => {
  const match = (over: Record<string, unknown>) =>
    ({
      matchId: 1,
      season: "2023/24",
      grade: "A Grade",
      round: "Grand Final",
      matchDate: "2024-03-16",
      homeClubId: 2,
      awayClubId: 3,
      ...over,
    }) as Parameters<typeof pickDeciderMatch>[2][number];
  const premier = { season: "2023/24", grade: "A Grade", matchDate: null, opponentClubId: 3 };

  it("picks the single grand final for the season, grade and opponent", () => {
    expect(
      pickDeciderMatch(premier, 2, [match({}), match({ matchId: 2, round: "Semi Final" })]),
    ).toBe(1);
  });

  it("returns null when ambiguous or absent", () => {
    expect(pickDeciderMatch(premier, 2, [match({}), match({ matchId: 2 })])).toBeNull();
    expect(pickDeciderMatch(premier, 2, [match({ awayClubId: 4 })])).toBeNull();
    expect(pickDeciderMatch(premier, 2, [])).toBeNull();
  });

  it("respects a recorded date", () => {
    expect(
      pickDeciderMatch({ ...premier, matchDate: "2024-03-09" }, 2, [
        match({}),
        match({ matchId: 2, matchDate: "2024-03-09" }),
      ]),
    ).toBe(2);
  });
});
