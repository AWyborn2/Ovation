/**
 * SUPPLEMENT seasons in the club overlay (Halls Head cut-over preview, 1 Oct
 * 2026; owner decision: keep hand-entered seasons as club history).
 *
 * A supplement is a hand-entered season the club keeps even though it is at or
 * after the grade's boundary — e.g. Dan Howell, B Grade 2013/14–2016/17 (409,
 * 182, 129 and 11 runs), which exist only as native season totals: no native
 * scorecard lines and no central lines.
 *
 * The rule: a supplement season counts ONLY when the player has no central
 * bucket for that same grade and season. Otherwise it is ignored and reported
 * — never counted twice. Pinned on small fixtures without a database.
 */
import { describe, expect, it } from "vitest";
import {
  emptyPartialFigures,
  isSeniorAppGrade,
  walkCentralMilestones,
  type CentralMilestoneInputs,
  type CentralPartial,
  type CentralPartialFigures,
} from "@workspace/db/central-queries";
import {
  applyClubOverlay,
  buildClubIdentity,
  clubCareers,
  clubGradeLeaderboard,
  clubMilestoneOverlay,
  clubPlayerSeasons,
  clubRecordLeaders,
  clubRecords,
  EMPTY_OVERLAY_DATA,
  type ClubOverlay,
  type ClubOverlayData,
  type OverlayHistoryRow,
} from "./club-overlay";
import { overlayProgressionCandidates } from "./club-overlay-surfaces";

// ── Fixtures ────────────────────────────────────────────────────────────────

const D = "33333333-0000-4000-8000-00000000000d"; // Dan: hand-entered B Grade seasons (id 10)
const R = "33333333-0000-4000-8000-00000000000e"; // Ryan: central has his season (id 11)
const M = "33333333-0000-4000-8000-00000000000b"; // Dan's merged-away second GUID (id 14)
const IDS: Record<string, number> = { [D]: 10, [R]: 11, [M]: 14 };
const NAMES: Record<string, string> = { [D]: "Dan Howell", [R]: "Ryan Burns" };

const BOUNDARIES = [
  { grade: null, startSeason: 2003 },
  { grade: "B Grade", startSeason: 2004 },
];

function identity(merges: [string, string][] = []) {
  return buildClubIdentity(
    Object.entries(IDS).map(([participantId, playerId]) => ({ participantId, playerId })),
    { nameByGuid: new Map(), canonicalByGuid: new Map(merges) },
  );
}

function partial(
  participantId: string,
  grade: string,
  season: number | null,
  f: Partial<CentralPartialFigures>,
): CentralPartial {
  return { participantId, grade, season, ...emptyPartialFigures(), ...f };
}

const batted = (pid: string, grade: string, season: number, games: number, runs: number) =>
  partial(pid, grade, season, { games, batLines: games, innings: games, runs, highScore: runs });

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

/** A hand-entered season kept as club history (a supplement batch's row). */
const supplement = (
  playerId: number,
  grade: string,
  season: number,
  f: Partial<OverlayHistoryRow> = {},
): OverlayHistoryRow => history(playerId, grade, season, { supplement: true, ...f });

function apply(opts: {
  buckets: CentralPartial[];
  data?: Partial<ClubOverlayData>;
  merges?: [string, string][];
}) {
  const ids = [...new Set(opts.buckets.map((b) => b.participantId))];
  return applyClubOverlay({
    partials: {
      buckets: opts.buckets,
      players: ids.map((participantId) => ({
        participantId,
        displayName: NAMES[participantId] ?? null,
        isPrivate: false,
      })),
    },
    lines: [],
    identity: identity(opts.merges),
    data: { ...EMPTY_OVERLAY_DATA, ...opts.data },
    isSeniorGrade: isSeniorAppGrade,
  });
}

const seasonsOf = (stats: ReturnType<typeof apply>, pid: string) =>
  clubPlayerSeasons(stats, pid).map((s) => [s.grade, s.season, s.games, s.runs]);
const careerOf = (stats: ReturnType<typeof apply>, pid: string) =>
  clubCareers(stats).find((c) => c.participantId === pid);

// The Dan Howell case: B Grade 2013/14–2016/17, hand-entered, no scorecards.
const DAN = [
  supplement(10, "B Grade", 2013, { games: 12, innings: 12, runs: 409, highScore: 77 }),
  supplement(10, "B Grade", 2014, { games: 9, innings: 9, runs: 182 }),
  supplement(10, "B Grade", 2015, { games: 8, innings: 7, runs: 129 }),
  supplement(10, "B Grade", 2016, { games: 2, innings: 2, runs: 11 }),
];

// ── The rule ────────────────────────────────────────────────────────────────

describe("supplement seasons (hand-entered, at or after the boundary)", () => {
  it("count when the player has no central bucket for that grade and season", () => {
    const stats = apply({
      // Dan plays A Grade in central those seasons — a different grade.
      buckets: [batted(D, "A Grade", 2013, 3, 60), batted(D, "B Grade", 2018, 4, 90)],
      data: { boundaries: BOUNDARIES, history: DAN },
    });
    expect(seasonsOf(stats, D)).toEqual([
      ["A Grade", 2013, 3, 60],
      ["B Grade", 2013, 12, 409],
      ["B Grade", 2014, 9, 182],
      ["B Grade", 2015, 8, 129],
      ["B Grade", 2016, 2, 11],
      ["B Grade", 2018, 4, 90],
    ]);
    expect(careerOf(stats, D)).toMatchObject({ games: 3 + 31 + 4, runs: 60 + 731 + 90 });
    expect(stats.supplements).toEqual({ used: 4, ignored: [] });
    const sources = stats.buckets
      .filter((b) => b.participantId === D && b.grade === "B Grade" && b.season !== 2018)
      .map((b) => [b.season, b.source, b.careerGrain]);
    expect(sources).toEqual([
      [2013, "history", false],
      [2014, "history", false],
      [2015, "history", false],
      [2016, "history", false],
    ]);
  });

  it("are ignored and reported when central has that grade and season — never double-counted", () => {
    const stats = apply({
      buckets: [batted(D, "B Grade", 2013, 12, 409), batted(D, "B Grade", 2018, 4, 90)],
      data: { boundaries: BOUNDARIES, history: DAN },
    });
    // 2013/14 is central's alone; the other three seasons still come from history.
    expect(seasonsOf(stats, D)).toEqual([
      ["B Grade", 2013, 12, 409],
      ["B Grade", 2014, 9, 182],
      ["B Grade", 2015, 8, 129],
      ["B Grade", 2016, 2, 11],
      ["B Grade", 2018, 4, 90],
    ]);
    expect(careerOf(stats, D)?.runs).toBe(409 + 182 + 129 + 11 + 90);
    expect(stats.supplements.used).toBe(3);
    expect(stats.supplements.ignored).toEqual([
      {
        playerId: 10,
        participantId: D,
        grade: "B Grade",
        season: 2013,
        reason: "central_has_season",
      },
    ]);
    const b2013 = stats.buckets.filter((b) => b.participantId === D && b.season === 2013);
    expect(b2013.map((b) => b.source)).toEqual(["central"]);
  });

  it("a roster-only central appearance is a central bucket too", () => {
    const stats = apply({
      buckets: [partial(D, "B Grade", 2014, { games: 1 })],
      data: { boundaries: BOUNDARIES, history: DAN },
    });
    expect(stats.supplements.ignored.map((s) => s.season)).toEqual([2014]);
    expect(seasonsOf(stats, D).find((s) => s[1] === 2014)).toEqual(["B Grade", 2014, 1, null]);
  });

  it("a central bucket under a merged-away GUID belongs to the keeper", () => {
    // The central partials arrive already folded to the keeper (D).
    const stats = apply({
      buckets: [batted(D, "B Grade", 2015, 8, 150)],
      data: { boundaries: BOUNDARIES, history: DAN },
      merges: [[M, D]],
    });
    expect(stats.supplements.ignored.map((s) => s.season)).toEqual([2015]);
    // A supplement row filed against the merged-away id folds to the keeper too.
    const viaMergedId = apply({
      buckets: [batted(D, "B Grade", 2015, 8, 150)],
      data: {
        boundaries: BOUNDARIES,
        history: [supplement(14, "B Grade", 2015, { games: 8, runs: 129 })],
      },
      merges: [[M, D]],
    });
    expect(viaMergedId.supplements).toMatchObject({ used: 0 });
    expect(viaMergedId.supplements.ignored).toHaveLength(1);
    expect(careerOf(viaMergedId, D)?.runs).toBe(150);
  });

  it("an ordinary history row at or after the boundary is still ignored (not a supplement)", () => {
    const stats = apply({
      buckets: [batted(D, "A Grade", 2013, 3, 60)],
      data: {
        boundaries: BOUNDARIES,
        history: [history(10, "B Grade", 2013, { games: 12, runs: 409 })],
      },
    });
    expect(seasonsOf(stats, D)).toEqual([["A Grade", 2013, 3, 60]]);
    expect(stats.supplements).toEqual({ used: 0, ignored: [] });
  });

  it("a supplement row before the boundary is plain history", () => {
    const stats = apply({
      buckets: [batted(D, "B Grade", 2003, 5, 500)], // before B's boundary: dropped
      data: {
        boundaries: BOUNDARIES,
        history: [supplement(10, "B Grade", 2003, { games: 6, runs: 66 })],
      },
    });
    expect(seasonsOf(stats, D)).toEqual([["B Grade", 2003, 6, 66]]);
    expect(stats.supplements).toEqual({ used: 0, ignored: [] });
  });

  it("with no boundary at all, a supplement still counts only where central has nothing", () => {
    const stats = apply({
      buckets: [batted(D, "B Grade", 2013, 12, 400)],
      data: { history: DAN },
    });
    expect(stats.supplements.ignored.map((s) => s.season)).toEqual([2013]);
    expect(careerOf(stats, D)?.runs).toBe(400 + 182 + 129 + 11);
  });

  it("a pinned player with no central GUID keeps their supplement seasons", () => {
    const stats = apply({
      buckets: [batted(R, "B Grade", 2017, 10, 358)],
      data: {
        boundaries: BOUNDARIES,
        history: [supplement(77, "B Grade", 2013, { games: 5, runs: 55 })],
      },
    });
    expect(stats.intByGuid.get("player:77")).toBe(77);
    expect(seasonsOf(stats, "player:77")).toEqual([["B Grade", 2013, 5, 55]]);
    expect(stats.supplements.used).toBe(1);
  });

  it("fill-ins and junior grades never produce a supplement", () => {
    const stats = apply({
      buckets: [batted(R, "B Grade", 2017, 10, 358)],
      data: {
        boundaries: BOUNDARIES,
        history: [
          supplement(90001, "B Grade", 2013, { games: 5, runs: 55 }),
          supplement(10, "Under 15", 2013, { games: 5, runs: 55 }),
        ],
      },
    });
    expect(stats.buckets.map((b) => b.participantId)).toEqual([R]);
    expect(stats.supplements).toEqual({ used: 0, ignored: [] });
  });

  it("the Ryan Burns case needs no supplement: central alone supplies the season", () => {
    const stats = apply({
      buckets: [batted(R, "B Grade", 2017, 10, 358)],
      data: { boundaries: BOUNDARIES, history: DAN },
    });
    expect(seasonsOf(stats, R)).toEqual([["B Grade", 2017, 10, 358]]);
  });

  it("flows into the grade leaderboard, records, leaders and record progression", () => {
    const stats = apply({
      buckets: [batted(R, "B Grade", 2017, 10, 358)],
      data: { boundaries: BOUNDARIES, history: DAN },
    });
    const board = clubGradeLeaderboard(stats, "B Grade");
    expect(board.map((r) => [r.playerId, r.games, r.runs])).toEqual([
      [10, 31, 731],
      [11, 10, 358],
    ]);
    // A season filter sees the supplement season (it has one), unlike career grain.
    expect(
      clubGradeLeaderboard(stats, "B Grade", { seasonStartYear: 2013 }).map((r) => r.runs),
    ).toEqual([409]);
    expect(clubRecords(stats, { grade: "B Grade" }).mostRuns).toMatchObject({
      participantId: D,
      value: 731,
    });
    expect(
      clubRecordLeaders(stats, "runs", { fromSeason: 2013, toSeason: 2014 }).map((l) => l.value),
    ).toEqual([409 + 182]);
    const { dated } = overlayProgressionCandidates({
      kind: "highScore",
      rows: [],
      correctedMatches: [],
      stats,
      identity: identity(),
      boundaries: BOUNDARIES,
    });
    expect(dated.map((c) => [c.season, c.value.primary, c.seasonLevel])).toEqual([
      [2013, 77, true],
    ]);
  });
});

// ── Milestones ──────────────────────────────────────────────────────────────

describe("supplement seasons in the milestone walk", () => {
  const meta = (grade: string, season: number) => ({
    grade,
    season,
    matchDate: null,
    opponent: "Opp",
  });
  const inputs: CentralMilestoneInputs = {
    metaOf: new Map([
      [1, meta("A Grade", 2013)],
      [2, meta("B Grade", 2015)],
      [3, meta("B Grade", 2018)],
    ]),
    careers: new Map([
      [
        D,
        {
          runsByMatch: new Map([
            [1, 60],
            [2, 150],
            [3, 90],
          ]),
          wktsByMatch: new Map(),
          dismByMatch: new Map(),
          matches: new Set([1, 2, 3]),
        },
      ],
    ]),
    centuries: [],
    fivers: [],
    names: new Map([[D, { displayName: "Dan Howell", isPrivate: false }]]),
  };
  const overlay: ClubOverlay = {
    identity: identity(),
    data: { ...EMPTY_OVERLAY_DATA, boundaries: BOUNDARIES, history: DAN },
    active: true,
  };
  const none = { matchDeltas: new Map() };

  it("carries the supplement seasons central does not have, and only those", () => {
    const o = clubMilestoneOverlay(overlay, none, isSeniorAppGrade, inputs);
    // 2015/16 is central's (match 2): 409 + 182 + 11 carried, 129 left out.
    expect(o.baseTotals?.get(D)).toMatchObject({ games: 12 + 9 + 2, runs: 409 + 182 + 11 });
    const out = walkCentralMilestones(inputs, { games: [1000], runs: [800], wickets: [1000] }, o);
    // 602 + 60 + 150 = 812 crosses 800 in match 2.
    expect(out.map((m) => [m.matchId, m.boardKey, m.value])).toEqual([[2, "runs", 812]]);
  });

  it("without the central inputs no supplement is carried (nothing is guessed)", () => {
    const o = clubMilestoneOverlay(overlay, none, isSeniorAppGrade);
    expect(o.baseTotals?.get(D)).toBeUndefined();
  });

  it("agrees with the career the overlay shows", () => {
    const stats = apply({
      buckets: [
        batted(D, "A Grade", 2013, 1, 60),
        batted(D, "B Grade", 2015, 1, 150),
        batted(D, "B Grade", 2018, 1, 90),
      ],
      data: { boundaries: BOUNDARIES, history: DAN },
    });
    expect(careerOf(stats, D)?.runs).toBe(602 + 60 + 150 + 90);
  });
});
