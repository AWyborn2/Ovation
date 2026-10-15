/**
 * Season-recap card sets (Social Studio). Mocked — no database.
 *
 * The native path is pinned byte-for-byte: the exact upsert inputs (source
 * keys, card JSON with key order, app paths) a native club produced before
 * central clubs were supported. The central path must produce the same card
 * set and source-key shape from the central loaders, dropping only the player
 * link for an unmapped participant. The grade-leader round-up is retired
 * (plan 2026-10-15-001 R5) and no longer drafted.
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

import { generateRecapDrafts, playerPath } from "./roundup";
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

describe("central recap", () => {
  const central = {
    performers: [
      { ...PERFORMERS[0], playerId: null },
      { ...PERFORMERS[1], playerId: 12 },
    ],
    innings: [],
    latestRound: 5,
  };

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
