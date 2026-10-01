/**
 * The club overlay (hybrid stats plan U10; R7, R8, R12, R15; KTD1, KTD5,
 * KTD7), pinned on small fixtures without a database. The central inputs are
 * the (participant, app grade, season) partials the cached central read
 * returns; the overlay applies the boundary, corrections, merges, privacy,
 * fill-in exclusion and club history, and the views aggregate.
 *
 * The real-DB surfaces are covered by routes/club-overlay-read.test.ts (seeded,
 * CI) and routes/club-overlay-consistency.test.ts (real data, local / Repl).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as DbModule from "@workspace/db";

const dbSelect = vi.fn();
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof DbModule>();
  return { ...actual, db: { select: (...args: unknown[]) => dbSelect(...args) } };
});

import {
  emptyPartialFigures,
  isSeniorAppGrade,
  walkCentralMilestones,
  type CentralMilestoneInputs,
  type CentralPartial,
  type CentralPartialFigures,
  type CentralParticipantMatchLine,
  type CentralPartials,
} from "@workspace/db/central-queries";
import {
  applyClubOverlay,
  buildClubIdentity,
  clubCareers,
  clubGradeLeaderboard,
  clubMilestoneOverlay,
  clubPlayerDetail,
  clubPlayerSeasons,
  clubRecordLeaders,
  clubRecords,
  EMPTY_OVERLAY_DATA,
  loadClubOverlay,
  loadClubOverlayData,
  overlayIsActive,
  resetClubOverlayTableProbe,
  resolveCorrections,
  type ClubOverlay,
  type ClubOverlayData,
  type OverlayCorrection,
  type OverlayHistoryRow,
  type OverlayReader,
} from "./club-overlay";

// ── Fixture builders ─────────────────────────────────────────────────────────

const G = "11111111-0000-4000-8000-00000000000a"; // the player under test
const H = "11111111-0000-4000-8000-00000000000b"; // a second GUID of G (merged away)
const P = "11111111-0000-4000-8000-00000000000c"; // a private player
const F = "11111111-0000-4000-8000-00000000000f"; // a fill-in (crosswalk id >= 90000)
const IDS: Record<string, number> = { [G]: 1, [H]: 2, [P]: 3, [F]: 90005 };

function partial(
  participantId: string,
  grade: string,
  season: number | null,
  f: Partial<CentralPartialFigures>,
): CentralPartial {
  return { participantId, grade, season, ...emptyPartialFigures(), ...f };
}

/** A batting-only bucket: `games` matches, one innings each, `runs` in total. */
function batted(
  participantId: string,
  grade: string,
  season: number,
  games: number,
  runs: number,
  highScore = runs,
): CentralPartial {
  return partial(participantId, grade, season, {
    games,
    batLines: games,
    innings: games,
    runs,
    highScore,
    fifties: highScore >= 50 && highScore < 100 ? 1 : 0,
    hundreds: highScore >= 100 ? 1 : 0,
  });
}

function partials(buckets: CentralPartial[], privateIds: string[] = []): CentralPartials {
  const ids = [...new Set(buckets.map((b) => b.participantId))];
  return {
    buckets,
    players: ids.map((participantId) => ({
      participantId,
      displayName: participantId === G ? "A Player" : `Name ${participantId.slice(-2)}`,
      isPrivate: privateIds.includes(participantId),
    })),
  };
}

function identity(merges: [string, string][] = []) {
  return buildClubIdentity(
    Object.entries(IDS).map(([participantId, playerId]) => ({ participantId, playerId })),
    { nameByGuid: new Map(), canonicalByGuid: new Map(merges) },
  );
}

function history(
  playerId: number,
  grade: string,
  season: number | null,
  f: Partial<OverlayHistoryRow> = {},
): OverlayHistoryRow {
  return {
    playerId,
    grade,
    season,
    grain: season === null ? "career" : "season",
    games: null,
    innings: null,
    notOuts: null,
    runs: null,
    highScore: null,
    highScoreNotOut: null,
    ballsFaced: null,
    fours: null,
    sixes: null,
    fifties: null,
    hundreds: null,
    ballsBowled: null,
    maidens: null,
    runsConceded: null,
    wickets: null,
    bestBowlingWickets: null,
    bestBowlingRuns: null,
    fiveWickets: null,
    catches: null,
    stumpings: null,
    runOuts: null,
    ...f,
  };
}

function line(
  participantId: string,
  matchId: number,
  grade: string,
  season: number,
  runs: number,
  extra: Partial<CentralParticipantMatchLine> = {},
): CentralParticipantMatchLine {
  return {
    participantId,
    matchId,
    playhqMatchId: `phq-${matchId}`,
    grade,
    season,
    batting: [{ runs, balls: runs, fours: 0, sixes: 0, kind: "out" }],
    bowling: [],
    catches: 0,
    stumpings: 0,
    runOuts: 0,
    ...extra,
  };
}

function correction(
  id: number,
  participantId: string,
  matchId: number,
  field: OverlayCorrection["field"],
  previousValue: number,
  newValue: number,
): OverlayCorrection {
  return {
    id,
    playhqMatchId: `phq-${matchId}`,
    participantId,
    field,
    previousValue,
    newValue,
  };
}

function data(d: Partial<ClubOverlayData>): ClubOverlayData {
  return { ...EMPTY_OVERLAY_DATA, ...d };
}

function apply(opts: {
  buckets: CentralPartial[];
  data?: Partial<ClubOverlayData>;
  lines?: CentralParticipantMatchLine[];
  merges?: [string, string][];
  privateIds?: string[];
}) {
  return applyClubOverlay({
    partials: partials(opts.buckets, opts.privateIds),
    lines: opts.lines ?? [],
    identity: identity(opts.merges),
    data: data(opts.data ?? {}),
    isSeniorGrade: isSeniorAppGrade,
  });
}

const careerOf = (stats: ReturnType<typeof apply>, pid: string) =>
  clubCareers(stats).find((c) => c.participantId === pid);

// AE1 boundaries: club default 2003/04, B Grade override 2004/05.
const AE1_BOUNDARIES = [
  { grade: null, startSeason: 2003 },
  { grade: "B Grade", startSeason: 2004 },
];

// ── Boundary (R12, KTD5, AE1) ────────────────────────────────────────────────

describe("the boundary: one source per (grade, season)", () => {
  it("AE1: B Grade 2003/04 comes from history; 2004/05 and 2005/06 from central", () => {
    const stats = apply({
      buckets: [
        batted(G, "B Grade", 2003, 5, 100), // central has it, but it is before B's boundary
        batted(G, "B Grade", 2004, 6, 200),
        batted(G, "B Grade", 2005, 7, 300),
      ],
      data: {
        boundaries: AE1_BOUNDARIES,
        history: [
          history(1, "B Grade", 2003, { games: 9, innings: 9, runs: 450 }),
          history(1, "B Grade", 2002, { games: 4, innings: 4, runs: 80 }),
        ],
      },
    });
    const seasons = clubPlayerSeasons(stats, G);
    expect(seasons.map((s) => [s.season, s.games, s.runs])).toEqual([
      [2002, 4, 80],
      [2003, 9, 450],
      [2004, 6, 200],
      [2005, 7, 300],
    ]);
    const source = (season: number) =>
      stats.buckets
        .filter((b) => b.participantId === G && b.season === season)
        .map((b) => b.source);
    expect(source(2003)).toEqual(["history"]);
    expect(source(2004)).toEqual(["central"]);
    expect(source(2005)).toEqual(["central"]);
    expect(careerOf(stats, G)?.runs).toBe(80 + 450 + 200 + 300);
  });

  it("the club default applies to grades with no override (A Grade from 2003/04)", () => {
    const stats = apply({
      buckets: [batted(G, "A Grade", 2002, 3, 30), batted(G, "A Grade", 2003, 4, 40)],
      data: {
        boundaries: AE1_BOUNDARIES,
        history: [history(1, "A Grade", 2002, { games: 8, runs: 800 })],
      },
    });
    expect(clubPlayerSeasons(stats, G).map((s) => [s.season, s.runs])).toEqual([
      [2002, 800],
      [2003, 40],
    ]);
  });

  it("history for the boundary season or later is ignored — central supplies it", () => {
    const stats = apply({
      buckets: [batted(G, "B Grade", 2004, 6, 200)],
      data: {
        boundaries: AE1_BOUNDARIES,
        history: [history(1, "B Grade", 2004, { games: 99, runs: 9999 })],
      },
    });
    expect(clubPlayerSeasons(stats, G).map((s) => [s.season, s.runs])).toEqual([[2004, 200]]);
  });

  it("no (grade, season) is ever counted from both sources", () => {
    const seasons = [2000, 2001, 2002, 2003, 2004, 2005, 2006];
    const grades = ["A Grade", "B Grade", "C Grade"];
    const stats = apply({
      buckets: grades.flatMap((g) => seasons.map((s) => batted(G, g, s, 1, 10))),
      data: {
        boundaries: AE1_BOUNDARIES,
        history: grades.flatMap((g) => seasons.map((s) => history(1, g, s, { games: 1, runs: 5 }))),
      },
    });
    const sources = new Map<string, Set<string>>();
    for (const b of stats.buckets) {
      if (b.season === null) continue;
      const k = `${b.participantId}|${b.grade}|${b.season}`;
      sources.set(k, (sources.get(k) ?? new Set()).add(b.source));
    }
    for (const [k, s] of sources) expect([k, s.size]).toEqual([k, 1]);
    // And every (grade, season) is still present exactly once.
    expect(sources.size).toBe(grades.length * seasons.length);
  });

  it("with no boundary, season-grained history adds nothing (central supplies everything)", () => {
    const stats = apply({
      buckets: [batted(G, "A Grade", 2004, 2, 20)],
      data: { history: [history(1, "A Grade", 1999, { games: 5, runs: 500 })] },
    });
    expect(careerOf(stats, G)?.runs).toBe(20);
  });
});

// ── Career-grain history ────────────────────────────────────────────────────

describe("career-grain history", () => {
  it("adds once to career totals and appears in no season view", () => {
    const stats = apply({
      buckets: [batted(G, "A Grade", 2004, 10, 400)],
      data: {
        boundaries: AE1_BOUNDARIES,
        history: [history(1, "A Grade", null, { games: 50, innings: 48, runs: 1500 })],
      },
    });
    expect(careerOf(stats, G)).toMatchObject({ games: 60, runs: 1900 });
    expect(clubPlayerDetail(stats, G)?.runs).toBe(1900);
    expect(clubPlayerSeasons(stats, G).map((s) => s.season)).toEqual([2004]);
    // A season-scoped leaderboard never sees it; the career leaderboard does, once.
    expect(clubGradeLeaderboard(stats, "A Grade", { seasonStartYear: 2004 })[0]?.runs).toBe(400);
    expect(clubGradeLeaderboard(stats, "A Grade")[0]?.runs).toBe(1900);
    // Two career rows for one grade still count once each (no duplication by the view).
    expect(stats.buckets.filter((b) => b.careerGrain)).toHaveLength(1);
  });

  it("a record span filter excludes career-grain rows; no filter includes them", () => {
    const stats = apply({
      buckets: [batted(G, "A Grade", 2004, 10, 400)],
      data: { history: [history(1, "A Grade", null, { games: 50, runs: 1500 })] },
    });
    expect(clubRecordLeaders(stats, "runs")[0]?.value).toBe(1900);
    expect(clubRecordLeaders(stats, "runs", { fromSeason: 2000 })[0]?.value).toBe(400);
  });

  it("a history-only player (no central lines) gets a career under their tenant id", () => {
    const stats = apply({
      buckets: [batted(G, "A Grade", 2004, 1, 10)],
      data: { history: [history(77, "A Grade", null, { games: 120, runs: 3000 })] },
    });
    const c = careerOf(stats, "player:77");
    expect(c).toMatchObject({ games: 120, runs: 3000, isPrivate: false });
    expect(stats.intByGuid.get("player:77")).toBe(77);
  });
});

// ── Corrections (R15, KTD7, AE4) ────────────────────────────────────────────

describe("corrections", () => {
  const bucket = batted(G, "A Grade", 2010, 2, 40 + 12, 40);
  const lines = [line(G, 501, "A Grade", 2010, 40), line(G, 502, "A Grade", 2010, 12)];

  it("AE4: a 40 -> 45 runs correction applies; removing it reverts to 40", () => {
    const corrected = apply({
      buckets: [bucket],
      lines,
      data: { corrections: [correction(1, G, 501, "runs", 40, 45)] },
    });
    expect(careerOf(corrected, G)?.runs).toBe(57);
    expect(clubPlayerSeasons(corrected, G)[0]).toMatchObject({ runs: 57, highScore: "45" });
    expect(corrected.corrections).toEqual({ applied: 1, stale: [] });

    const removed = apply({ buckets: [bucket], lines, data: { corrections: [] } });
    expect(careerOf(removed, G)?.runs).toBe(52);
    expect(clubPlayerSeasons(removed, G)[0]).toMatchObject({ runs: 52, highScore: "40" });
  });

  it("a correction whose previous value no longer matches central is skipped and reported", () => {
    const stats = apply({
      buckets: [bucket],
      lines,
      data: {
        corrections: [
          correction(1, G, 501, "runs", 38, 45), // central now says 40
          correction(2, G, 999, "runs", 10, 20), // match not in central for this club
        ],
      },
    });
    expect(careerOf(stats, G)?.runs).toBe(52);
    expect(stats.corrections.applied).toBe(0);
    expect(stats.corrections.stale.map((s) => [s.id, s.reason, s.centralValue])).toEqual([
      [1, "mismatch", 40],
      [2, "not_found", null],
    ]);
  });

  it("a correction to a season central does not supply (before the boundary) is skipped", () => {
    const stats = apply({
      buckets: [batted(G, "A Grade", 2002, 1, 40)],
      lines: [line(G, 601, "A Grade", 2002, 40)],
      data: {
        boundaries: AE1_BOUNDARIES,
        corrections: [correction(1, G, 601, "runs", 40, 45)],
      },
    });
    expect(stats.corrections.stale.map((s) => s.reason)).toEqual(["before_boundary"]);
  });

  it("crossing 50 or 100 moves the fifties / hundreds with the runs", () => {
    const stats = apply({
      buckets: [batted(G, "A Grade", 2010, 1, 95)],
      lines: [line(G, 701, "A Grade", 2010, 95)],
      data: { corrections: [correction(1, G, 701, "runs", 95, 105)] },
    });
    expect(clubPlayerDetail(stats, G)?.stats[0]).toMatchObject({
      runs: 105,
      fifties: 0,
      hundreds: 1,
      highScore: "105",
    });
  });

  it("a correction to a merged-away GUID lands on the keeper's bucket", () => {
    const stats = apply({
      // Partials arrive already folded to the keeper (G).
      buckets: [
        partial(G, "A Grade", 2010, { games: 2, bowlLines: 2, wickets: 3, runsConceded: 40 }),
      ],
      lines: [
        line(G, 801, "A Grade", 2010, 0, {
          batting: [],
          bowling: [{ balls: 30, maidens: 0, runs: 20, wickets: 1, wides: 0, noBalls: 0 }],
        }),
        line(H, 802, "A Grade", 2010, 0, {
          batting: [],
          bowling: [{ balls: 30, maidens: 0, runs: 20, wickets: 2, wides: 0, noBalls: 0 }],
        }),
      ],
      merges: [[H, G]],
      data: { corrections: [correction(1, H, 802, "wickets", 2, 4)] },
    });
    expect(careerOf(stats, G)?.wickets).toBe(5);
    expect(clubPlayerDetail(stats, G)?.stats[0]?.bestBowling).toBe("4/20");
  });

  it("per-match deltas feed the milestone walk", () => {
    const resolved = resolveCorrections([correction(1, G, 501, "runs", 40, 45)], lines, {
      canonicalOf: (g) => g,
      boundaries: [],
    });
    expect(resolved.matchDeltas.get(`${G}\u0000501`)).toEqual({
      runs: 5,
      wickets: 0,
      dismissals: 0,
    });
  });
});

// ── Games rule, juniors, fill-ins, privacy (R7, R8) ─────────────────────────

describe("games, juniors, fill-ins and privacy", () => {
  it("R7: a rostered appearance with no batting or bowling counts as a game", () => {
    const stats = apply({
      buckets: [partial(G, "A Grade", 2010, { games: 3, batLines: 1, innings: 1, runs: 10 })],
      data: { history: [history(1, "A Grade", null, { games: 2 })] },
    });
    expect(careerOf(stats, G)?.games).toBe(5);
    expect(clubPlayerDetail(stats, G)?.stats[0]?.games).toBe(5);
  });

  it("R7: a batter's seasons with no batting line still count on the grade leaderboard", () => {
    // 2010: batted twice. 2011: bowled once, no batting line. 2012: team sheet only.
    const stats = apply({
      buckets: [
        batted(G, "A Grade", 2010, 2, 40),
        partial(G, "A Grade", 2011, { games: 1, bowlLines: 1, wickets: 2, runsConceded: 9 }),
        partial(G, "A Grade", 2012, { games: 1 }),
        // Never batted in the grade: not on the BATTING leaderboard at all.
        partial(H, "A Grade", 2011, { games: 3, bowlLines: 3, wickets: 7, runsConceded: 40 }),
      ],
    });
    const board = clubGradeLeaderboard(stats, "A Grade");
    expect(board.map((r) => [r.playerId, r.games, r.runs])).toEqual([[1, 4, 40]]);
    // The same games the career shows.
    expect(careerOf(stats, G)?.games).toBe(4);
    // A single season still lists only who batted in it.
    expect(clubGradeLeaderboard(stats, "A Grade", { seasonStartYear: 2011 })).toEqual([]);
  });

  it("a history match's not out carries to its high score", () => {
    const stats = apply({
      buckets: [],
      data: {
        boundaries: AE1_BOUNDARIES,
        history: [history(1, "A Grade", 1999, { grain: "match", runs: 100, notOuts: 1 })],
      },
    });
    expect(clubRecords(stats).highestScore).toMatchObject({ participantId: G, value: "100*" });
    expect(clubPlayerSeasons(stats, G)[0]).toMatchObject({ highScore: "100*", hundreds: 1 });
  });

  it("R8: junior grades are excluded from both sources", () => {
    const stats = apply({
      buckets: [batted(G, "A Grade", 2010, 1, 10), batted(G, "Under 15", 2010, 5, 500)],
      data: {
        history: [
          history(1, "U15 Juniors", null, { games: 30, runs: 900 }),
          history(1, "Under 13", null, { games: 20, runs: 700 }),
        ],
      },
    });
    expect(careerOf(stats, G)).toMatchObject({ games: 1, runs: 10, grades: ["A Grade"] });
  });

  it("R8: fill-ins are excluded from both sources", () => {
    const stats = apply({
      buckets: [batted(G, "A Grade", 2010, 1, 10), batted(F, "A Grade", 2010, 4, 400)],
      data: { history: [history(90001, "A Grade", null, { games: 9, runs: 900 })] },
    });
    expect(clubCareers(stats).map((c) => c.participantId)).toEqual([G]);
  });

  it("a private keeper stays private with history added (masked on the leaderboard)", () => {
    const stats = apply({
      buckets: [batted(P, "A Grade", 2010, 1, 10)],
      privateIds: [P],
      data: { history: [history(3, "A Grade", null, { games: 9, runs: 900 })] },
    });
    expect(careerOf(stats, P)?.isPrivate).toBe(true);
    expect(clubGradeLeaderboard(stats, "A Grade")[0]).toMatchObject({
      givenName: "Private",
      surname: "Player",
      runs: 910,
    });
    expect(clubRecordLeaders(stats, "runs")).toEqual([]);
  });
});

// ── No club layer = today's numbers ──────────────────────────────────────────

describe("a tenant with no history, boundary or corrections", () => {
  it("is inactive, so handlers keep the original central reads", () => {
    expect(overlayIsActive(EMPTY_OVERLAY_DATA)).toBe(false);
    expect(overlayIsActive(data({ boundaries: [{ grade: null, startSeason: 2003 }] }))).toBe(true);
  });

  it("even applied, the overlay reproduces the central partials exactly", () => {
    const buckets = [
      batted(G, "A Grade", 2004, 6, 200, 88),
      batted(G, "B Grade", 2005, 3, 90, 60),
      partial(G, "A Grade", 2006, { games: 2, bowlLines: 2, wickets: 4, runsConceded: 50 }),
    ];
    const stats = apply({ buckets });
    expect(careerOf(stats, G)).toMatchObject({
      games: 11,
      runs: 290,
      wickets: 4,
      grades: ["A Grade", "B Grade"],
    });
    expect(stats.buckets.map(({ source, careerGrain, ...b }) => b)).toEqual(buckets);
  });
});

// ── Records ──────────────────────────────────────────────────────────────────

describe("records", () => {
  it("a pre-boundary history high score can hold the club record", () => {
    const stats = apply({
      buckets: [batted(G, "A Grade", 2005, 1, 120, 120)],
      data: {
        boundaries: AE1_BOUNDARIES,
        history: [history(77, "A Grade", 1995, { games: 1, runs: 180, highScore: 180 })],
      },
    });
    expect(clubRecords(stats).highestScore).toMatchObject({
      participantId: "player:77",
      value: "180",
    });
  });
});

// ── Milestones ───────────────────────────────────────────────────────────────

describe("the milestone walk with the overlay", () => {
  const meta = (grade: string, season: number) => ({
    grade,
    season,
    matchDate: null,
    opponent: "Opp",
  });
  const inputs: CentralMilestoneInputs = {
    metaOf: new Map([
      [1, meta("A Grade", 2002)],
      [2, meta("A Grade", 2004)],
      [3, meta("A Grade", 2005)],
    ]),
    careers: new Map([
      [
        G,
        {
          runsByMatch: new Map([
            [1, 500],
            [2, 40],
            [3, 30],
          ]),
          wktsByMatch: new Map(),
          dismByMatch: new Map(),
          matches: new Set([1, 2, 3]),
        },
      ],
    ]),
    centuries: [],
    fivers: [],
    names: new Map([[G, { displayName: "A Player", isPrivate: false }]]),
  };
  const tiers = { games: [1000], runs: [1000], wickets: [1000] };
  const overlay = (d: Partial<ClubOverlayData>): ClubOverlay => ({
    identity: identity(),
    data: data(d),
    active: true,
  });

  it("drops pre-boundary central matches and starts from the history totals", () => {
    const o = overlay({
      boundaries: [{ grade: null, startSeason: 2003 }],
      history: [history(1, "A Grade", null, { games: 40, runs: 950 })],
    });
    const lines = [line(G, 2, "A Grade", 2004, 40)];
    const resolved = resolveCorrections([correction(1, G, 2, "runs", 40, 45)], lines, {
      canonicalOf: (g) => g,
      boundaries: o.data.boundaries,
    });
    const out = walkCentralMilestones(
      inputs,
      tiers,
      clubMilestoneOverlay(o, resolved, isSeniorAppGrade),
    );
    // 950 (history) + 45 (corrected match 2) = 995 < 1000; + 30 in match 3 crosses.
    // The 500 in the pre-boundary 2002/03 central match is never counted.
    expect(out.map((m) => [m.matchId, m.boardKey, m.value])).toEqual([[3, "runs", 1025]]);
  });

  it("without an overlay the walk is the plain central one", () => {
    const out = walkCentralMilestones(inputs, { games: [1000], runs: [500], wickets: [1000] });
    expect(out.map((m) => [m.matchId, m.value])).toEqual([[1, 500]]);
  });
});

// ── Loading degrades safely before migration 0021 ───────────────────────────

describe("loadClubOverlayData before migration 0021", () => {
  beforeEach(() => {
    dbSelect.mockReset();
    resetClubOverlayTableProbe();
  });

  const rejectingChain = (err: unknown) => {
    const chain = {
      from: () => chain,
      where: () => Promise.reject(err),
    };
    return chain;
  };

  it("treats a missing table (42P01) as an empty club layer, and remembers it", async () => {
    const err = Object.assign(new Error("query failed"), {
      cause: Object.assign(new Error('relation "club_history_boundaries" does not exist'), {
        code: "42P01",
      }),
    });
    dbSelect.mockImplementation(() => rejectingChain(err));
    await expect(loadClubOverlayData(7)).resolves.toEqual(EMPTY_OVERLAY_DATA);
    const calls = dbSelect.mock.calls.length;
    await expect(loadClubOverlayData(7)).resolves.toEqual(EMPTY_OVERLAY_DATA);
    expect(dbSelect.mock.calls.length).toBe(calls); // no re-probe within the window
  });

  it("any other database error still fails the request", async () => {
    dbSelect.mockImplementation(() =>
      rejectingChain(Object.assign(new Error("boom"), { code: "57014" })),
    );
    await expect(loadClubOverlayData(7)).rejects.toThrow("boom");
  });
});

// ── A caller-supplied reader (the read-only cut-over preview, U13) ───────────

describe("loadClubOverlay with a supplied reader", () => {
  beforeEach(() => {
    dbSelect.mockReset();
    resetClubOverlayTableProbe();
  });

  it("runs every tenant-DB select through the reader and never touches the app pool", async () => {
    const readerSelect = vi.fn(() => {
      const chain = { from: () => chain, where: () => Promise.resolve([]) };
      return chain;
    });
    const overlay = await loadClubOverlay(1, {
      select: readerSelect,
    } as unknown as OverlayReader);
    // Crosswalk, curation, tenant 1's cap-only native players, boundaries,
    // history rows and corrections.
    expect(readerSelect).toHaveBeenCalledTimes(6);
    expect(dbSelect).not.toHaveBeenCalled();
    expect(overlay.active).toBe(false);
    expect(overlay.data).toEqual(EMPTY_OVERLAY_DATA);
  });

  it("never reads the native players table for any tenant but tenant 1", async () => {
    const readerSelect = vi.fn(() => {
      const chain = { from: () => chain, where: () => Promise.resolve([]) };
      return chain;
    });
    const overlay = await loadClubOverlay(2, {
      select: readerSelect,
    } as unknown as OverlayReader);
    // Crosswalk, curation, boundaries, history rows and corrections — no native read.
    expect(readerSelect).toHaveBeenCalledTimes(5);
    expect(dbSelect).not.toHaveBeenCalled();
    expect(overlay.identity.capOnly.size).toBe(0);
  });
});
