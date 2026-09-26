/**
 * Central round-up / recap loaders: crosswalk identity, curation names, the
 * fill-in floor, deterministic tie order and the milestone filter. Mocked —
 * the central reads themselves are covered in lib/db (social-recap.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let mapRows: { participantId: string; playerId: number }[] = [];

vi.mock("@workspace/db", () => {
  const b: Record<string, unknown> = {};
  b.from = () => b;
  b.where = () => b;
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve(mapRows).then(ok);
  return { db: { select: () => b }, playerIdMapTable: {} };
});
vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));
vi.mock("@workspace/scorecard", () => ({ FILL_IN_THRESHOLD: 90000 }));
vi.mock("./tenant", () => ({ getTenantCentralClubId: vi.fn(async () => 55) }));
vi.mock("./central-curation", () => ({
  resolveCuration: vi.fn(async () => ({
    nameByGuid: new Map([["g-b", "Bea Curated"]]),
    canonicalByGuid: new Map(),
  })),
}));
const { centralGradeSeasonSocial, centralMilestones } = vi.hoisted(() => ({
  centralGradeSeasonSocial: vi.fn(),
  centralMilestones: vi.fn(),
}));
vi.mock("@workspace/db/central-queries", () => ({ centralGradeSeasonSocial, centralMilestones }));

import { loadCentralGradeSeason, loadCentralRecapMilestones } from "./roundup-central";
import { TIER_THRESHOLDS } from "./milestone-detector";

beforeEach(() => {
  mapRows = [
    { participantId: "g-a", playerId: 101 },
    { participantId: "g-b", playerId: 102 },
    { participantId: "g-fill", playerId: 90001 },
  ];
  centralGradeSeasonSocial.mockReset();
  centralMilestones.mockReset();
});

describe("loadCentralGradeSeason", () => {
  it("resolves ids through the tenant crosswalk and keeps unmapped players unlinked", async () => {
    centralGradeSeasonSocial.mockResolvedValue({
      performers: [
        { participantId: "g-z", displayName: "Z Unmapped", runs: 50, wickets: 0, dismissals: 0 },
        { participantId: "g-b", displayName: "B Central", runs: 70, wickets: 2, dismissals: 1 },
        { participantId: "g-a", displayName: "A Smith", runs: 90, wickets: 1, dismissals: 3 },
        { participantId: "g-fill", displayName: "F Fill", runs: 10, wickets: 0, dismissals: 0 },
      ],
      innings: [
        { participantId: "g-a", displayName: "A Smith", highScore: "61*", bestBowling: "1/12" },
      ],
      latestRound: 9,
    });

    const data = await loadCentralGradeSeason(3, "A Grade", 2024);

    expect(centralGradeSeasonSocial).toHaveBeenCalledWith(55, "A Grade", 2024);
    expect(data.latestRound).toBe(9);
    // Sorted by name (curated names first): A Smith, Bea Curated, F Fill, Z Unmapped.
    expect(data.performers.map((p) => [p.givenName, p.surname, p.playerId])).toEqual([
      ["A", "Smith", 101],
      ["Bea", "Curated", 102],
      ["F", "Fill", null], // a fill-in id never becomes a link
      ["Z", "Unmapped", null],
    ]);
    expect(data.innings).toEqual([
      { playerId: 101, givenName: "A", surname: "Smith", highScore: "61*", bestBowling: "1/12" },
    ]);
  });
});

describe("loadCentralRecapMilestones", () => {
  it("keeps only career crossings in the grade and season, with native tier labels", async () => {
    centralMilestones.mockResolvedValue([
      {
        kind: "career",
        participantId: "g-a",
        displayName: "A Smith",
        grade: "A Grade",
        season: 2024,
        matchId: 1,
        matchDate: null,
        opponent: null,
        value: 103,
        boardKey: "games",
        tierIndex: 1,
        threshold: 100,
      },
      {
        kind: "career",
        participantId: "g-z",
        displayName: "Z Unmapped",
        grade: "A Grade",
        season: 2024,
        matchId: 2,
        matchDate: null,
        opponent: null,
        value: 1003,
        boardKey: "runs",
        tierIndex: 0,
        threshold: 1000,
      },
      {
        kind: "career",
        participantId: "g-a",
        grade: "B Grade",
        season: 2024,
        value: 1,
        boardKey: "runs",
        tierIndex: 0,
        threshold: 1,
      },
      {
        kind: "career",
        participantId: "g-a",
        grade: "A Grade",
        season: 2023,
        value: 1,
        boardKey: "runs",
        tierIndex: 0,
        threshold: 1,
      },
      { kind: "century", participantId: "g-a", grade: "A Grade", season: 2024, value: 104 },
    ]);

    const rows = await loadCentralRecapMilestones(3, "A Grade", 2024);

    expect(centralMilestones).toHaveBeenCalledWith(55, TIER_THRESHOLDS);
    expect(rows).toEqual([
      {
        playerId: 101,
        playerName: "A Smith",
        tierLabel: "Centurion",
        tierIndex: 1,
        milestoneLabel: "Games",
        value: 103,
        threshold: 100,
      },
      {
        playerId: null,
        playerName: "Z Unmapped",
        tierLabel: "1000 Runs",
        tierIndex: 0,
        milestoneLabel: "Runs",
        value: 1003,
        threshold: 1000,
      },
    ]);
  });
});
