/**
 * Round-up / season-recap card sets (Social Studio). Mocked — no database.
 *
 * The native path is pinned byte-for-byte: the exact upsert inputs (source
 * keys, card JSON with key order, app paths) a native club produced before
 * central clubs were supported. The central path must produce the same card
 * set and source-key shape from the central loaders, dropping only the player
 * link for an unmapped participant.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** FIFO of results the mocked `db.select()` chains resolve to. */
const queued: unknown[][] = [];

vi.mock("@workspace/db", () => {
  const builder = () => {
    const b: Record<string, unknown> = {};
    for (const m of ["from", "innerJoin", "where", "groupBy", "orderBy", "limit"]) b[m] = () => b;
    b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
      Promise.resolve(queued.shift() ?? []).then(ok, bad);
    return b;
  };
  return {
    db: { select: () => builder() },
    playerGradeSeasonStatsTable: {},
    playersTable: {},
    milestoneEventsTable: {},
    importsTable: {},
    premiershipsTable: {},
    matchesTable: {},
  };
});
vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  and: () => ({}),
  lt: () => ({}),
  inArray: () => ({}),
  sql: () => ({}),
}));
vi.mock("@workspace/scorecard", () => ({ FILL_IN_THRESHOLD: 90000 }));
vi.mock("./tenant", () => ({ tenantIsCentral: vi.fn() }));
vi.mock("./draft-upsert", () => ({
  upsertDraftByKey: vi.fn(async (input: Record<string, unknown>) => ({
    action: "inserted",
    draft: { id: 1, ...input },
  })),
}));
vi.mock("../routes/premierships", () => ({
  premiershipSeasons: (year: number) => [year - 1],
}));
vi.mock("./roundup-central", () => ({
  loadCentralGradeSeason: vi.fn(),
  loadCentralRecapMilestones: vi.fn(),
}));

import { generateRecapDrafts, generateRoundUpDrafts, playerPath } from "./roundup";
import { tenantIsCentral } from "./tenant";
import { upsertDraftByKey } from "./draft-upsert";
import { loadCentralGradeSeason, loadCentralRecapMilestones } from "./roundup-central";

const upserts = () =>
  vi.mocked(upsertDraftByKey).mock.calls.map(([input]) => JSON.stringify(input));

beforeEach(() => {
  queued.length = 0;
  vi.mocked(upsertDraftByKey).mockClear();
  vi.mocked(loadCentralGradeSeason).mockReset();
  vi.mocked(loadCentralRecapMilestones).mockReset();
});

const PERFORMERS = [
  { playerId: 11, runs: 312, wickets: 3, dismissals: 2, surname: "Smith", givenName: "Sam" },
  { playerId: 12, runs: 40, wickets: 19, dismissals: 9, surname: "Jones", givenName: "Lee" },
];
const INNINGS = [
  { playerId: 11, surname: "Smith", givenName: "Sam", highScore: "104*", bestBowling: null },
  { playerId: 12, surname: "Jones", givenName: "Lee", highScore: "22", bestBowling: "6/31" },
  { playerId: 13, surname: "Park", givenName: "Ari", highScore: "88", bestBowling: "6/20" },
];

describe("native round-up (byte-identical)", () => {
  it("drafts the same five cards, keys and JSON as before", async () => {
    vi.mocked(tenantIsCentral).mockResolvedValue(false);
    queued.push(PERFORMERS, INNINGS, [{ round: 7 }]);

    await generateRoundUpDrafts(1, "A Grade", 2024, 99);

    const h = "A Grade 2024/25 Round-up";
    const card = (category: string, playerName: string, value: string | number) =>
      `{"kind":"gradeLeader","grade":"A Grade","category":"${category}","playerName":"${playerName}","value":${JSON.stringify(value)},"headline":"${h}"}`;
    const row = (cat: string, input: string, path: string) =>
      `{"tenantId":1,"engine":"roundup","family":"roundup","sourceKey":"roundup:2024:A Grade:7:${cat}","cardInput":${input},"appPath":"${path}","sourceImportId":99}`;
    expect(upserts()).toEqual([
      row("Runs", card("Runs", "Sam Smith", 312), "/players/11"),
      row("Wickets", card("Wickets", "Lee Jones", 19), "/players/12"),
      row("Best Bowling", card("Best Bowling", "Ari Park", "6/20"), "/players/13"),
      row("Best Innings", card("Best Innings", "Sam Smith", "104*"), "/players/11"),
      row("Dismissals", card("Dismissals", "Lee Jones", 9), "/players/12"),
    ]);
    expect(loadCentralGradeSeason).not.toHaveBeenCalled();
  });

  it("keys a round-up with no numbered round as 'none'", async () => {
    vi.mocked(tenantIsCentral).mockResolvedValue(false);
    queued.push(PERFORMERS, [], [{ round: null }]);
    await generateRoundUpDrafts(1, "B Grade", 2023, null);
    expect(upserts()[0]).toContain('"sourceKey":"roundup:2023:B Grade:none:Runs"');
  });
});

describe("native season recap (byte-identical)", () => {
  it("drafts champions, milestones and the premiership exactly as before", async () => {
    vi.mocked(tenantIsCentral).mockResolvedValue(false);
    queued.push(
      PERFORMERS,
      [
        {
          playerId: 11,
          boardKey: "runs",
          tierIndex: 0,
          tierLabel: "1000 Runs",
          value: 1012,
          threshold: 1000,
          payload: { name: "Sam Smith" },
        },
      ],
      [{ year: 2025, matchDate: null, competition: "PCA", result: "Won", mom: "Ari Park" }],
    );

    await generateRecapDrafts(1, "A Grade", 2024);

    const h = "A Grade 2024/25 Season Recap";
    const leader = (category: string, playerName: string, value: number, path: string) =>
      `{"tenantId":1,"engine":"recap","family":"roundup","sourceKey":"recap:2024:A Grade:${category}","cardInput":{"kind":"gradeLeader","grade":"A Grade","category":"${category}","playerName":"${playerName}","value":${value},"headline":"${h}"},"appPath":"${path}","sourceImportId":null}`;
    expect(upserts()).toEqual([
      leader("Champion Batsman", "Sam Smith", 312, "/players/11"),
      leader("Champion Bowler", "Lee Jones", 19, "/players/12"),
      leader("Most Dismissals", "Lee Jones", 9, "/players/12"),
      `{"tenantId":1,"engine":"recap","family":"roundup","sourceKey":"recap:2024:A Grade:milestone:Sam Smith:1000 Runs","cardInput":{"kind":"milestone","playerName":"Sam Smith","tierLabel":"1000 Runs","tierIndex":0,"milestoneLabel":"Runs","currentValue":1012,"threshold":1000,"headline":"${h}"},"appPath":"/players/11","sourceImportId":null}`,
      `{"tenantId":1,"engine":"recap","family":"roundup","sourceKey":"recap:2024:A Grade:premiership","cardInput":{"kind":"premiership","grade":"A Grade","year":2024,"competition":"PCA","result":"Won","mom":"Ari Park","headline":"${h}"},"appPath":"/premierships","sourceImportId":null}`,
    ]);
    expect(loadCentralRecapMilestones).not.toHaveBeenCalled();
  });
});

describe("central round-up and recap", () => {
  const central = {
    performers: [
      { ...PERFORMERS[0], playerId: null },
      { ...PERFORMERS[1], playerId: 12 },
    ],
    innings: [{ ...INNINGS[1], playerId: 12 }],
    latestRound: 5,
  };

  it("drafts the same card set and key shape; an unmapped player keeps the card, not the link", async () => {
    vi.mocked(tenantIsCentral).mockResolvedValue(true);
    vi.mocked(loadCentralGradeSeason).mockResolvedValue(central);

    await generateRoundUpDrafts(7, "A Grade", 2024, null);

    const calls = vi.mocked(upsertDraftByKey).mock.calls.map(([i]) => i);
    expect(calls.map((c) => c.sourceKey)).toEqual([
      "roundup:2024:A Grade:5:Runs",
      "roundup:2024:A Grade:5:Wickets",
      "roundup:2024:A Grade:5:Best Bowling",
      "roundup:2024:A Grade:5:Best Innings",
      "roundup:2024:A Grade:5:Dismissals",
    ]);
    expect(calls[0]).toMatchObject({ tenantId: 7, appPath: "/players" });
    expect(calls[0].cardInput).toMatchObject({ playerName: "Sam Smith", value: 312 });
    expect(calls[1].appPath).toBe("/players/12");
    // The native tables are never read for a central club.
    expect(queued).toHaveLength(0);
    expect(loadCentralGradeSeason).toHaveBeenCalledWith(7, "A Grade", 2024);
  });

  it("recap reads central performers and central milestones", async () => {
    vi.mocked(tenantIsCentral).mockResolvedValue(true);
    vi.mocked(loadCentralGradeSeason).mockResolvedValue(central);
    vi.mocked(loadCentralRecapMilestones).mockResolvedValue([
      {
        playerId: null,
        playerName: "L Jones",
        tierLabel: "50 Wickets",
        tierIndex: 0,
        milestoneLabel: "Wickets",
        value: 51,
        threshold: 50,
      },
    ]);
    queued.push([]); // the tenant's own premierships: none this season

    await generateRecapDrafts(7, "A Grade", 2024);

    const keys = vi.mocked(upsertDraftByKey).mock.calls.map(([i]) => [i.sourceKey, i.appPath]);
    expect(keys).toEqual([
      ["recap:2024:A Grade:Champion Batsman", "/players"],
      ["recap:2024:A Grade:Champion Bowler", "/players/12"],
      ["recap:2024:A Grade:Most Dismissals", "/players/12"],
      ["recap:2024:A Grade:milestone:L Jones:50 Wickets", "/players"],
    ]);
    expect(loadCentralRecapMilestones).toHaveBeenCalledWith(7, "A Grade", 2024);
  });
});

describe("playerPath", () => {
  it("links a mapped player and falls back to the players list", () => {
    expect(playerPath(42)).toBe("/players/42");
    expect(playerPath(null)).toBe("/players");
  });
});
