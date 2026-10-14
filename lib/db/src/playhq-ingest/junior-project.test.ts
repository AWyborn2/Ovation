import { describe, expect, it } from "vitest";
import {
  JUNIOR_SYNC_FIRST_SEASON,
  type JuniorPlanContext,
  type JuniorSourceMatch,
  deletedLineKeys,
  isScoredScorecard,
  juniorMatchWriteTarget,
  juniorProjectionErrorText,
  juniorSeason,
  juniorTenantsForMatch,
  lineIdentityParticipant,
  mergeParticipantSeeds,
  planJuniorFixture,
  planJuniorMatch,
  planJuniorTeamList,
  planParticipantWrite,
  reconcileLines,
  battingLineKey,
  bowlingLineKey,
  rosterLineKey,
  seedsFromLineup,
  syncIdentityParticipant,
  teamListAction,
  teamListWindow,
} from "./junior-project";
import { JUNIOR_SYNC_ID_START } from "../schema/juniors";

const ORG = "aaaaaaaa-0000-4000-8000-00000000000a";
const OPP_ORG = "bbbbbbbb-0000-4000-8000-00000000000b";
const OUR_TEAM = "cccccccc-0000-4000-8000-00000000000c";
const OPP_TEAM = "dddddddd-0000-4000-8000-00000000000d";
const MATCH = "eeeeeeee-0000-4000-8000-00000000000e";
// Upper-case on purpose: participant GUIDs are stored lowercased.
const P1 = "11111111-0000-4000-8000-000000000001".toUpperCase();
const P2 = "22222222-0000-4000-8000-000000000002";
const P3 = "33333333-0000-4000-8000-000000000003";
const Q1 = "44444444-0000-4000-8000-000000000004";
const Q2 = "55555555-0000-4000-8000-000000000005";

const ctx = (over: Partial<JuniorPlanContext> = {}): JuniorPlanContext => ({
  tenantId: 7,
  orgId: ORG,
  fullNames: new Map(),
  merges: new Map(),
  ...over,
});

/** A scored Year 9 match: we bat first (innings 1), they bat second. */
function scorecard() {
  return {
    id: MATCH,
    status: "COMPLETED",
    matchSummary: {
      resultText: "Halls Head Hawks won by 20 runs",
      teams: [
        { id: OUR_TEAM, scoreText: "5-120", wonToss: true, isWinner: true },
        { id: OPP_TEAM, scoreText: "100", wonToss: false, isWinner: false },
      ],
    },
    teams: [
      {
        id: OUR_TEAM,
        players: [
          { participantId: P1, name: "Ollie Green", shortName: "O Green" },
          { participantId: P2, name: "Private Player", shortName: "Private Player" },
          { participantId: P3, name: "Sam Taylor", shortName: "S Taylor" },
        ],
      },
      {
        id: OPP_TEAM,
        players: [
          { participantId: Q1, name: "Rival One", shortName: "R One" },
          { participantId: Q2, name: "Rival Two", shortName: "R Two" },
        ],
      },
    ],
    innings: [
      {
        inningsOrder: 1,
        battingTeamId: OUR_TEAM,
        batting: [
          {
            participantId: P1,
            playerShortName: "O Green",
            batOrder: 1,
            runsScored: 40,
            ballsFaced: 30,
            foursScored: 5,
            sixesScored: 1,
            strikeRate: "133.33",
            dismissalText: "b: R Two",
          },
          {
            participantId: P3,
            playerShortName: "S Taylor",
            batOrder: 2,
            runsScored: 12,
            ballsFaced: 20,
            dismissalText: "not out",
          },
        ],
        bowling: [
          {
            participantId: Q2,
            playerShortName: "R Two",
            oversBowled: 4,
            maidensBowled: 0,
            runsConceded: 22,
            wicketsTaken: 1,
            economy: "5.5",
            wideBalls: 2,
            noBalls: 0,
          },
        ],
      },
      {
        inningsOrder: 2,
        battingTeamId: OPP_TEAM,
        batting: [
          {
            participantId: Q1,
            playerShortName: "R One",
            batOrder: 1,
            runsScored: 55,
            ballsFaced: 60,
            dismissalText: "c: O Green b: S Taylor",
          },
        ],
        bowling: [
          {
            participantId: P3,
            playerShortName: "S Taylor",
            oversBowled: 3.2,
            maidensBowled: 1,
            runsConceded: 10,
            wicketsTaken: 2,
            economy: "3.0",
          },
        ],
      },
    ],
  };
}

function source(over: Partial<JuniorSourceMatch> = {}): JuniorSourceMatch {
  return {
    id: MATCH,
    gradeName: "Year 9 Boys Peel",
    seasonName: "Summer 2026/27",
    isJunior: true,
    status: "COMPLETED",
    startAt: new Date("2026-11-07T01:00:00Z"),
    roundName: "Round 4",
    venueName: "Halls Head Oval",
    surfaceName: "Oval 1",
    venueLine1: "1 Cricket Rd",
    venueSuburb: "Halls Head",
    resultText: null,
    homeTeamId: OUR_TEAM,
    homeTeamName: "Halls Head Hawks",
    homeOrgId: ORG,
    homeOrgName: "Halls Head Junior Cricket Club",
    homeScore: "5-120",
    awayTeamId: OPP_TEAM,
    awayTeamName: "Rivals Blue",
    awayOrgId: OPP_ORG,
    awayOrgName: "Rivals Junior Cricket Club",
    awayScore: "100",
    winnerTeamId: OUR_TEAM,
    ownerOrgName: "Peel Junior Cricket Association",
    scorecard: scorecard(),
    ...over,
  };
}

describe("juniorSeason", () => {
  it("reads the season from PlayHQ's season name as YYYY/YY", () => {
    expect(juniorSeason("Summer 2026/27", null)).toEqual({ season: "2026/27", startYear: 2026 });
    expect(juniorSeason("2029/2030 Juniors", null)).toEqual({
      season: "2029/30",
      startYear: 2029,
    });
  });
  it("falls back to the start date: July onwards starts a season", () => {
    expect(juniorSeason(null, new Date("2026-10-10T00:00:00Z"))).toEqual({
      season: "2026/27",
      startYear: 2026,
    });
    expect(juniorSeason("Summer", new Date("2027-02-10T00:00:00Z"))).toEqual({
      season: "2026/27",
      startYear: 2026,
    });
    expect(juniorSeason(null, null)).toBeNull();
  });
  it("the sync owns 2026/27 onwards", () => {
    expect(JUNIOR_SYNC_FIRST_SEASON).toBe(2026);
  });
});

describe("juniorTenantsForMatch", () => {
  const tenants = [
    { tenantId: 7, orgId: ORG.toUpperCase() },
    { tenantId: 9, orgId: "99999999-0000-4000-8000-000000000009" },
  ];
  it("returns only enabled tenants whose junior organisation plays in the match", () => {
    expect(juniorTenantsForMatch(source(), tenants)).toEqual([{ tenantId: 7, orgId: ORG }]);
  });
  it("a disabled tenant (absent from the enabled set) gets nothing", () => {
    expect(juniorTenantsForMatch(source(), [tenants[1]!])).toEqual([]);
    expect(juniorTenantsForMatch(source(), [])).toEqual([]);
  });
  it("a grade that is not junior is never projected, even for an enabled club", () => {
    expect(juniorTenantsForMatch(source({ isJunior: false }), tenants)).toEqual([]);
  });
});

describe("isScoredScorecard", () => {
  it("is scored only when the scorecard has batting or bowling lines", () => {
    expect(isScoredScorecard(scorecard())).toBe(true);
    expect(isScoredScorecard(null)).toBe(false);
    expect(isScoredScorecard({ id: MATCH, innings: [] })).toBe(false);
    expect(isScoredScorecard({ id: MATCH, innings: [{ batting: [], bowling: [] }] })).toBe(false);
  });
});

describe("planJuniorMatch: a scored Year 9 match", () => {
  const plan = planJuniorMatch(source(), ctx())!;

  it("yields one junior match from the club's perspective", () => {
    expect(plan).not.toBeNull();
    expect(plan.match).toMatchObject({
      tenantId: 7,
      playhqMatchId: MATCH,
      season: "2026/27",
      seasonStartYear: 2026,
      grade: "Year 9 Boys Peel",
      ageGroup: "Year 9",
      ageGroupRaw: "Year 9",
      teamName: "Halls Head Hawks",
      competition: "Year 9 Boys Peel",
      association: "Peel Junior Cricket Association",
      round: "Round 4",
      matchDate: "2026-11-07",
      venue: "Halls Head Oval",
      venueOval: "Oval 1",
      venueAddress: "1 Cricket Rd",
      venueSuburb: "Halls Head",
      status: "COMPLETED",
      team1: "Halls Head Hawks",
      team1Score: "120/5",
      team2: "Rivals Junior Cricket Club",
      team2Score: "100/10",
      hhTeamId: OUR_TEAM,
      hhResult: "Won",
      winner: "Halls Head Hawks",
      tossWinner: "Halls Head Hawks",
      hhBattedFirst: true,
      opponentName: "Rivals Junior Cricket Club",
    });
  });

  it("has batting and bowling lines for both sides, own-club lines flagged", () => {
    expect(plan.batting).toHaveLength(3);
    expect(plan.batting[0]).toMatchObject({
      innings: 1,
      battingTeam: "Halls Head Hawks",
      isHallsHead: true,
      batOrder: 1,
      participantId: P1.toLowerCase(),
      runs: 40,
      balls: 30,
      fours: 5,
      sixes: 1,
      strikeRate: 133.33,
      dismissal: "b: R Two",
    });
    expect(plan.bowling.find((b) => b.participantId === P3)).toMatchObject({
      innings: 2,
      bowlingTeam: "Halls Head Hawks",
      isHallsHead: true,
      overs: 3.2,
      maidens: 1,
      runs: 10,
      wickets: 2,
      economy: 3,
    });
  });

  it("opposition lines keep the participant id and PlayHQ's name only", () => {
    const opp = plan.batting.find((b) => !b.isHallsHead)!;
    expect(opp).toMatchObject({
      innings: 2,
      battingTeam: "Rivals Junior Cricket Club",
      participantId: Q1,
      playerName: "R One",
    });
    const oppBowl = plan.bowling.find((b) => !b.isHallsHead)!;
    expect(oppBowl).toMatchObject({ participantId: Q2, playerName: "R Two", innings: 1 });
  });

  it("has a roster for both sides", () => {
    expect(plan.rosters.filter((r) => r.isHallsHead).map((r) => r.participantId)).toEqual([
      P1.toLowerCase(),
      P2,
      P3,
    ]);
    expect(plan.rosters.filter((r) => !r.isHallsHead).map((r) => r.participantId)).toEqual([
      Q1,
      Q2,
    ]);
  });

  it("creates participants for the club's own side only, with PlayHQ's private flag", () => {
    expect(plan.participants).toEqual([
      { participantId: P1.toLowerCase(), name: "Ollie Green", isPrivate: false },
      { participantId: P2, name: null, isPrivate: true },
      { participantId: P3, name: "Sam Taylor", isPrivate: false },
    ]);
  });

  it("prefers PlayHQ's full name from the grade reports, given name first", () => {
    const p = planJuniorMatch(
      source(),
      ctx({ fullNames: new Map([[P3, "Taylor, Samuel"]]) }),
    )!.participants.find((x) => x.participantId === P3);
    expect(p?.name).toBe("Samuel Taylor");
  });

  it("maps merged duplicate GUIDs onto the keeper", () => {
    const keeper = "66666666-0000-4000-8000-000000000006";
    const merged = planJuniorMatch(source(), ctx({ merges: new Map([[P3, keeper]]) }))!;
    expect(merged.batting.some((b) => b.participantId === P3)).toBe(false);
    expect(merged.batting.some((b) => b.participantId === keeper)).toBe(true);
    expect(merged.participants.map((p) => p.participantId)).toContain(keeper);
    expect(merged.participants.map((p) => p.participantId)).not.toContain(P3);
  });

  it("works from the away side too: we lost, batted second", () => {
    const away = planJuniorMatch(
      source({
        homeTeamId: OPP_TEAM,
        homeTeamName: "Rivals Blue",
        homeOrgId: OPP_ORG,
        homeOrgName: "Rivals Junior Cricket Club",
        homeScore: "100",
        awayTeamId: OUR_TEAM,
        awayTeamName: "Halls Head Hawks",
        awayOrgId: ORG,
        awayOrgName: "Halls Head Junior Cricket Club",
        awayScore: "5-120",
        winnerTeamId: OPP_TEAM,
        scorecard: {
          ...scorecard(),
          matchSummary: {
            teams: [
              { id: OPP_TEAM, scoreText: "100", isWinner: true, wonToss: false },
              { id: OUR_TEAM, scoreText: "5-120", isWinner: false, wonToss: true },
            ],
          },
          innings: [{ ...scorecard().innings[1]!, inningsOrder: 1 }],
        },
      }),
      ctx(),
    )!;
    expect(away.match).toMatchObject({
      team1: "Rivals Junior Cricket Club",
      team2: "Halls Head Hawks",
      hhResult: "Lost",
      winner: "Rivals Junior Cricket Club",
      hhBattedFirst: false,
      opponentName: "Rivals Junior Cricket Club",
    });
  });

  it("an in-progress scored match has no result yet", () => {
    const live = planJuniorMatch(
      source({
        status: "IN_PROGRESS",
        winnerTeamId: null,
        scorecard: { ...scorecard(), status: "LIVE", matchSummary: null },
      }),
      ctx(),
    )!;
    expect(live.match.status).toBe("IN_PROGRESS");
    expect(live.match.hhResult).toBeNull();
  });
});

describe("AE4: an unscored Year 4 match", () => {
  const unscored = source({
    gradeName: "Year 4 Gold",
    scorecard: { id: MATCH, status: "COMPLETED", innings: [] },
  });
  it("yields no junior match", () => {
    expect(planJuniorMatch(unscored, ctx())).toBeNull();
  });
  it("its fixture shows as finished", () => {
    expect(planJuniorFixture(unscored, ctx())).toMatchObject({
      tenantId: 7,
      playhqMatchId: MATCH,
      seasonStartYear: 2026,
      ageGroup: "Year 4",
      grade: "Year 4 Gold",
      teamName: "Halls Head Hawks",
      opponentName: "Rivals Junior Cricket Club",
      venue: "Halls Head Oval",
      isHome: true,
      status: "COMPLETED",
    });
  });
});

describe("planJuniorFixture: upcoming", () => {
  it("projects an upcoming match from the away side", () => {
    const f = planJuniorFixture(
      source({
        status: "UPCOMING",
        scorecard: null,
        homeOrgId: OPP_ORG,
        homeOrgName: "Rivals Junior Cricket Club",
        homeTeamName: "Rivals Blue",
        awayOrgId: ORG,
        awayTeamName: "Halls Head Hawks",
      }),
      ctx(),
    );
    expect(f).toMatchObject({ isHome: false, status: "UPCOMING", teamName: "Halls Head Hawks" });
  });
});

describe("AE2: seasons before 2026/27 are never synced", () => {
  const old = source({ seasonName: "Summer 2025/26", startAt: new Date("2025-11-08T01:00:00Z") });
  it("a 2025/26 junior match in playhq.* is ignored", () => {
    expect(planJuniorMatch(old, ctx())).toBeNull();
    expect(planJuniorFixture(old, ctx())).toBeNull();
  });
  it("an existing loader-made row (below the sync band) is never updated", () => {
    expect(juniorMatchWriteTarget(null)).toBe("insert");
    expect(juniorMatchWriteTarget(JUNIOR_SYNC_ID_START + 5)).toBe("update");
    expect(juniorMatchWriteTarget(4123)).toBe("skip");
    expect(juniorMatchWriteTarget(100_000_001)).toBe("skip");
  });
});

describe("reconcileLines: stable lines", () => {
  const plan = planJuniorMatch(source(), ctx())!;
  const withIds = plan.batting.map((l, i) => ({
    id: JUNIOR_SYNC_ID_START + i,
    key: battingLineKey(l),
  }));

  it("a first sync inserts every line", () => {
    const r = reconcileLines([], plan.batting, battingLineKey, new Set());
    expect(r.inserts).toHaveLength(3);
    expect(r.updates).toEqual([]);
    expect(r.removes).toEqual([]);
  });

  it("a re-run makes no new rows and keeps every id", () => {
    const r = reconcileLines(withIds, plan.batting, battingLineKey, new Set());
    expect(r.inserts).toEqual([]);
    expect(r.removes).toEqual([]);
    expect(r.updates.map((u) => u.id)).toEqual(withIds.map((w) => w.id));
  });

  it("a line PlayHQ dropped is removed; an admin-added or loader line is never touched", () => {
    const r = reconcileLines(
      [
        ...withIds,
        { id: JUNIOR_SYNC_ID_START + 50, key: "9|p|gone" },
        { id: 100_000_007, key: "1|p|admin-added" },
        { id: 1234, key: "1|p|loader" },
      ],
      plan.batting,
      battingLineKey,
      new Set(),
    );
    expect(r.removes).toEqual([JUNIOR_SYNC_ID_START + 50]);
    expect(r.inserts).toEqual([]);
  });

  it("a line an admin deleted is not re-created", () => {
    const gone = battingLineKey(plan.batting[1]!);
    const r = reconcileLines(
      withIds.filter((w) => w.key !== gone),
      plan.batting,
      battingLineKey,
      new Set([gone]),
    );
    expect(r.inserts).toEqual([]);
  });

  it("lines without a participant match on innings and batting order", () => {
    const anon = { ...plan.batting[0]!, participantId: null };
    expect(battingLineKey(anon)).toBe("1|o|1|true");
    const r = reconcileLines(
      [{ id: JUNIOR_SYNC_ID_START + 9, key: "1|o|1|true" }],
      [anon],
      battingLineKey,
      new Set(),
    );
    expect(r.updates).toEqual([{ id: JUNIOR_SYNC_ID_START + 9, row: anon }]);
  });

  it("bowling and roster keys", () => {
    expect(bowlingLineKey(plan.bowling[0]!)).toBe(`1|p|${Q2}`);
    expect(bowlingLineKey({ ...plan.bowling[0]!, participantId: null, playerName: "No Id" })).toBe(
      "1|n|false|no id",
    );
    expect(rosterLineKey(plan.rosters[0]!)).toBe(`p|${P1.toLowerCase()}`);
  });
});

describe("corrections survive a re-sync", () => {
  it("a line whose participant an admin corrected still matches by its PlayHQ identity", () => {
    expect(
      syncIdentityParticipant("someone-else", [
        { participantId: "Original-Guid" },
        { participantId: "second-fix" },
      ]),
    ).toBe("original-guid");
    expect(syncIdentityParticipant("current", [])).toBe("current");
    expect(syncIdentityParticipant(null, [])).toBeNull();
  });

  it("deleted synced lines become keys to skip; admin-band deletions are ignored", () => {
    const keys = deletedLineKeys("junior_match_batting", [
      {
        targetId: String(JUNIOR_SYNC_ID_START + 3),
        prevValues: { innings: 1, participant_id: P3, bat_order: 2, is_halls_head: true },
      },
      {
        targetId: "100000004",
        prevValues: { innings: 1, participant_id: P1, bat_order: 1, is_halls_head: true },
      },
    ]);
    expect([...keys]).toEqual([`1|p|${P3}`]);
  });

  it("a line's identity undoes re-points, then follows the merge map", () => {
    const merges = new Map([["dup-guid", "keeper-guid"]]);
    expect(lineIdentityParticipant("B-Guid", [{ participantId: "A-Guid" }], merges)).toBe("a-guid");
    expect(lineIdentityParticipant("Dup-Guid", [], merges)).toBe("keeper-guid");
    expect(lineIdentityParticipant("x", [{ participantId: "dup-guid" }], merges)).toBe(
      "keeper-guid",
    );
    expect(lineIdentityParticipant(null, [], merges)).toBeNull();
  });

  it("tombstones key like live lines: re-pointed then deleted, or deleted then merged (adversarial P2)", () => {
    const A = "aaaaaaaa-0000-4000-8000-000000000001";
    const B = "bbbbbbbb-0000-4000-8000-000000000002";
    const KEEPER = "cccccccc-0000-4000-8000-000000000003";
    const repointed = String(JUNIOR_SYNC_ID_START + 7);
    const merged = String(JUNIOR_SYNC_ID_START + 8);
    // Line 7: PlayHQ said A, an admin re-pointed it to B, then deleted it (prev = B);
    // A has since been merged into KEEPER. Line 8: a line of A, deleted, A merged later.
    const repoints: Record<string, { participantId: string }[]> = {
      [repointed]: [{ participantId: A }],
    };
    const merges = new Map([[A, KEEPER]]);
    const deletions = [
      {
        targetId: repointed,
        prevValues: { innings: 1, participant_id: B, bat_order: 3, is_halls_head: true },
      },
      {
        targetId: merged,
        prevValues: { innings: 2, participant_id: A, bat_order: 4, is_halls_head: true },
      },
    ];
    // Without the resolver the tombstones miss the planned lines (the old behaviour).
    const naive = deletedLineKeys("junior_match_batting", deletions);
    expect(naive.has(`1|p|${KEEPER}`)).toBe(false);
    expect(naive.has(`2|p|${KEEPER}`)).toBe(false);
    // With it they match the planned lines, which the planners key through the merge map.
    const keys = deletedLineKeys("junior_match_batting", deletions, (targetId, pid) =>
      lineIdentityParticipant(pid, repoints[targetId] ?? [], merges),
    );
    expect([...keys].sort()).toEqual([`1|p|${KEEPER}`, `2|p|${KEEPER}`]);
    const planned = [
      { innings: 1, participantId: KEEPER, batOrder: 3, isHallsHead: true, playerName: "x" },
      { innings: 2, participantId: KEEPER, batOrder: 4, isHallsHead: true, playerName: "y" },
    ];
    expect(reconcileLines([], planned, battingLineKey, keys).inserts).toEqual([]);
  });
});

describe("participants", () => {
  it("lineup players seed participants (so they exist before the first game)", () => {
    const seeds = seedsFromLineup(
      [
        { participantId: P1, name: "Ollie Green", shortName: "O Green", roles: ["Captain"] },
        { participantId: P2, name: "Private Player", shortName: "", roles: [] },
        { participantId: null, name: "No Id", roles: [] },
      ],
      ctx(),
    );
    expect(seeds).toEqual([
      { participantId: P1.toLowerCase(), name: "Ollie Green", isPrivate: false },
      { participantId: P2, name: null, isPrivate: true },
    ]);
  });

  it("merged seeds: privacy tightens, the best name wins", () => {
    expect(
      mergeParticipantSeeds([
        { participantId: P1, name: "O Green", isPrivate: false },
        { participantId: P1.toLowerCase(), name: "Ollie Green", isPrivate: false },
        { participantId: P2, name: "Pat Hidden", isPrivate: false },
        { participantId: P2, name: null, isPrivate: true },
      ]),
    ).toEqual([
      { participantId: P1.toLowerCase(), name: "Ollie Green", isPrivate: false },
      { participantId: P2, name: "Pat Hidden", isPrivate: true },
    ]);
  });

  it("a new participant is inserted (a private one with the withheld label)", () => {
    expect(
      planParticipantWrite(
        null,
        { participantId: P1, name: "Ollie Green", isPrivate: false },
        false,
      ),
    ).toEqual({
      kind: "insert",
      displayName: "Ollie Green",
      isPrivate: false,
    });
    expect(
      planParticipantWrite(null, { participantId: P2, name: null, isPrivate: true }, false),
    ).toEqual({
      kind: "insert",
      displayName: "Private Player",
      isPrivate: true,
    });
  });

  it("first seen public, later flagged private: becomes private on the next sync", () => {
    expect(
      planParticipantWrite(
        { displayName: "Ollie Green", isPrivate: false },
        { participantId: P1, name: null, isPrivate: true },
        false,
      ),
    ).toEqual({ kind: "update", isPrivate: true, clearOverride: true });
  });

  it("tightening privacy clears any stale override (adversarial review P1)", () => {
    // An override left from an earlier private spell must not name the child the
    // moment PlayHQ withholds them again: a fresh admin decision is needed.
    const w = planParticipantWrite(
      { displayName: "Ollie Green", isPrivate: false },
      { participantId: P1, name: "Ollie Green", isPrivate: true },
      false,
    );
    expect(w).toMatchObject({ kind: "update", isPrivate: true, clearOverride: true });
    // A participant who is already private keeps the admin's override.
    const kept = planParticipantWrite(
      { displayName: "Ollie Green", isPrivate: true },
      { participantId: P1, name: null, isPrivate: true },
      false,
    );
    expect(kept).toEqual({ kind: "none" });
  });

  it("privacy never loosens automatically", () => {
    expect(
      planParticipantWrite(
        { displayName: "Ollie Green", isPrivate: true },
        { participantId: P1, name: "Ollie Green", isPrivate: false },
        false,
      ),
    ).toEqual({ kind: "none" });
  });

  it("an admin rename survives a sync that brings a different PlayHQ name", () => {
    expect(
      planParticipantWrite(
        { displayName: "Olly G (U12)", isPrivate: false },
        { participantId: P1, name: "Oliver Green", isPrivate: false },
        true,
      ),
    ).toEqual({ kind: "none" });
  });

  it("an un-renamed name refreshes, but never downgrades to initials", () => {
    expect(
      planParticipantWrite(
        { displayName: "O Green", isPrivate: false },
        { participantId: P1, name: "Ollie Green", isPrivate: false },
        false,
      ),
    ).toEqual({ kind: "update", displayName: "Ollie Green" });
    expect(
      planParticipantWrite(
        { displayName: "Ollie Green", isPrivate: false },
        { participantId: P1, name: "O Green", isPrivate: false },
        false,
      ),
    ).toEqual({ kind: "none" });
  });
});

describe("juniorProjectionErrorText", () => {
  it("keeps the code and first line, never key values or failing rows", () => {
    const err = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "x"\nDETAIL: Key (participant_id)=(Ollie Green) already exists.',
      ),
      { code: "23505" },
    );
    expect(juniorProjectionErrorText(err)).toBe(
      '23505: duplicate key value violates unique constraint "x"',
    );
    expect(
      juniorProjectionErrorText(
        new Error("Key (display_name)=(Ollie Green) is bad. Failing row contains (Ollie Green, 7)"),
      ),
    ).toBe("Key (…) is bad.");
  });
});

describe("team lists", () => {
  const lineup = [
    { participantId: P1, name: "Ollie Green", roles: ["Captain"] },
    { participantId: P3, name: "Sam Taylor", roles: ["Wicket Keeper"] },
    { participantId: P2, name: "Private Player", roles: [] },
    { participantId: null, name: "No Id", roles: [] },
    { participantId: P1.toLowerCase(), name: "Ollie Again", roles: [] },
  ];

  it("the club's named side, by participant only (names are never stored)", () => {
    expect(planJuniorTeamList(lineup, new Map())).toEqual([
      { order: 1, participantId: P1.toLowerCase(), role: "C" },
      { order: 2, participantId: P3, role: "WK" },
      { order: 3, participantId: P2 },
    ]);
  });

  it("merged GUIDs are listed as the keeper", () => {
    const keeper = "66666666-0000-4000-8000-000000000006";
    expect(planJuniorTeamList(lineup, new Map([[P2, keeper]]))[2]).toEqual({
      order: 3,
      participantId: keeper,
    });
  });

  it("an admin-saved list survives; a PlayHQ list is refreshed and published", () => {
    const players = planJuniorTeamList(lineup, new Map());
    expect(teamListAction(null, players)).toBe("write");
    expect(teamListAction({ source: "admin", isPublished: true, players: [] }, players)).toBe(
      "keepAdmin",
    );
    expect(teamListAction({ source: "playhq", isPublished: true, players: [] }, players)).toBe(
      "write",
    );
    expect(teamListAction({ source: "playhq", isPublished: false, players }, players)).toBe(
      "write",
    );
    expect(teamListAction({ source: "playhq", isPublished: true, players }, players)).toBe(
      "unchanged",
    );
    expect(teamListAction(null, [])).toBe("unchanged");
  });

  it("copies sides within 8 days ahead or 7 days after the start", () => {
    const now = new Date("2026-11-01T00:00:00Z");
    const day = 86_400_000;
    expect(teamListWindow(new Date(now.getTime() + 3 * day), now)).toBe("upcoming");
    expect(teamListWindow(new Date(now.getTime() + 9 * day), now)).toBeNull();
    expect(teamListWindow(new Date(now.getTime() - 2 * day), now)).toBe("played");
    expect(teamListWindow(new Date(now.getTime() - 8 * day), now)).toBeNull();
    expect(teamListWindow(null, now)).toBeNull();
  });
});
