import { describe, expect, it } from "vitest";
import type { CentralAppearance, NativeLine } from "./hh-central-crosswalk-core";
import { validateArgs } from "./hh-central-crosswalk-core";
import {
  countReasons,
  diffCareers,
  diffDebutOrder,
  diffMilestones,
  diffRecords,
  hybridDebuts,
  nativeAllTimeRecords,
  nativeDebuts,
  pickCatchesSamples,
  resolveCurated,
  topDeltas,
  type CareersInput,
  type CentralMatchInfo,
  type CommonMatch,
  type HybridBucket,
  type NativeGradeCareer,
  type NativeMatchInfo,
  type NativeSeasonStat,
  type PreviewIdentity,
} from "./hh-cutover-preview-core";

/**
 * Halls Head cut-over preview (hybrid stats plan U13; R6, R19, R20, R21; AE6,
 * AE7). Pure rules only — no database. The runner (hh-cutover-preview.ts)
 * reads native in a READ ONLY transaction and central through the read-only
 * proxy, builds the HYBRID side with the API's own club overlay, and hands
 * both to these functions.
 */

const G1 = "guid-1";
const G2 = "guid-2";
const A = "A Grade";

const line = (
  over: Partial<NativeLine> & Pick<NativeLine, "matchId" | "playerId">,
): NativeLine => ({
  batted: true,
  battingPos: 3,
  runs: 20,
  balls: 30,
  notOut: false,
  bowled: false,
  overs: null,
  maidens: null,
  runsConceded: null,
  wickets: null,
  catches: 0,
  stumpings: 0,
  runOuts: 0,
  ...over,
});

const app = (participantId: string, over: Partial<CentralAppearance> = {}): CentralAppearance => ({
  participantId,
  lineName: null,
  hasBattingRow: true,
  batted: true,
  batOrder: 3,
  runs: 20,
  balls: 30,
  innings: 1,
  notOuts: 0,
  bowled: false,
  bowlBalls: null,
  maidens: 0,
  runsConceded: 0,
  wickets: 0,
  catches: 0,
  stumpings: 0,
  runOuts: 0,
  onRoster: true,
  countsAsGame: true,
  ...over,
});

/** One player (id 1 ↔ guid-1), no merges, unless overridden. */
const identity = (over: Partial<PreviewIdentity> = {}): PreviewIdentity => ({
  guidsOf: (id) => (id === 1 ? [G1] : []),
  presentedId: (id) => (id === 1 ? 1 : null),
  ownedIds: (id) => (id === 1 ? [1] : []),
  playerIdOfGuid: (g) => (g === G1 ? 1 : null),
  ...over,
});

const nMatch = (id: number, over: Partial<NativeMatchInfo> = {}): NativeMatchInfo => ({
  id,
  grade: A,
  season: 2010,
  abandoned: false,
  round: id,
  matchDate: null,
  ...over,
});

const cMatch = (matchId: number, over: Partial<CentralMatchInfo> = {}): CentralMatchInfo => ({
  matchId,
  grade: A,
  season: 2010,
  ladiesT20: false,
  matchDate: null,
  ...over,
});

const career = (
  playerId: number,
  f: Partial<NativeGradeCareer> = {},
  grade = A,
): NativeGradeCareer => ({
  playerId,
  grade,
  games: 0,
  innings: 0,
  runs: 0,
  wickets: 0,
  catches: 0,
  fifties: 0,
  hundreds: 0,
  highScore: null,
  bestBowling: null,
  ...f,
});

const season = (
  playerId: number,
  s: number | null,
  f: Partial<NativeSeasonStat> = {},
): NativeSeasonStat => ({
  playerId,
  grade: A,
  season: s,
  games: 0,
  innings: 0,
  runs: 0,
  wickets: 0,
  catches: 0,
  ...f,
});

const bucket = (playerId: number, f: Partial<HybridBucket> = {}): HybridBucket => ({
  playerId,
  grade: A,
  season: 2010,
  source: "central",
  careerGrain: false,
  games: 0,
  innings: 0,
  runs: 0,
  wickets: 0,
  catches: 0,
  highScore: null,
  bestBowling: null,
  ...f,
});

/** A base input: boundary 2003/04, nothing else. */
const input = (over: Partial<CareersInput> = {}): CareersInput => ({
  nativeGrades: [],
  nativeSeasons: [],
  adjustments: [],
  nativeMatches: [],
  nativeLines: [],
  linkByNativeMatch: new Map(),
  assignments: [],
  centralMatches: [],
  appearances: new Map(),
  identity: identity(),
  boundaries: [{ grade: null, startSeason: 2003 }],
  hybridBuckets: [],
  correctionDeltas: new Map(),
  ...over,
});

const apps = (
  ...entries: Array<[number, CentralAppearance[]]>
): Map<number, Map<string, CentralAppearance>> =>
  new Map(entries.map(([mid, list]) => [mid, new Map(list.map((a) => [a.participantId, a]))]));

/** Two matches both sides agree on: native 2 games / 40 runs, hybrid the same. */
const agreed = (): Partial<CareersInput> => ({
  nativeGrades: [career(1, { games: 2, innings: 2, runs: 40 })],
  nativeSeasons: [season(1, 2010, { games: 2, innings: 2, runs: 40 })],
  nativeMatches: [nMatch(1), nMatch(2)],
  nativeLines: [line({ matchId: 1, playerId: 1 }), line({ matchId: 2, playerId: 1 })],
  linkByNativeMatch: new Map([
    [1, 101],
    [2, 102],
  ]),
  centralMatches: [cMatch(101), cMatch(102)],
  appearances: apps([101, [app(G1)]], [102, [app(G1)]]),
  hybridBuckets: [bucket(1, { games: 2, innings: 2, runs: 40 })],
});

const only = <T>(xs: T[]): T => {
  expect(xs).toHaveLength(1);
  return xs[0]!;
};

describe("diffCareers — zero diff", () => {
  it("lists nothing when native and hybrid agree", () => {
    const d = diffCareers(input(agreed()));
    expect(d.grades).toEqual([]);
    expect(d.players).toEqual([]);
    expect(d.unlinked).toEqual([]);
    expect(d.overlaps).toEqual([]);
    expect(countReasons(d.grades)).toEqual({});
  });

  it("ignores native lines and stats of fill-ins (ids >= 90000)", () => {
    const base = agreed();
    const d = diffCareers(
      input({
        ...base,
        nativeGrades: [...base.nativeGrades!, career(90001, { games: 5, runs: 99 })],
        nativeSeasons: [...base.nativeSeasons!, season(90001, 2010, { games: 5, runs: 99 })],
        nativeLines: [...base.nativeLines!, line({ matchId: 1, playerId: 90001, runs: 99 })],
      }),
    );
    expect(d.grades).toEqual([]);
    expect(d.players).toEqual([]);
  });
});

describe("diffCareers — reason codes", () => {
  it("extra central match: a central-only match with a line", () => {
    const base = agreed();
    const d = diffCareers(
      input({
        ...base,
        centralMatches: [...base.centralMatches!, cMatch(103)],
        appearances: apps([101, [app(G1)]], [102, [app(G1)]], [103, [app(G1, { runs: 55 })]]),
        hybridBuckets: [bucket(1, { games: 3, innings: 3, runs: 95 })],
      }),
    );
    const g = only(d.grades);
    expect(g).toMatchObject({ playerId: 1, grade: A, reasons: ["extra_central_match"] });
    expect(g.delta).toEqual({ games: 1, innings: 1, runs: 55, wickets: 0, catches: 0 });
    expect(g.components.extra_central_match).toEqual(g.delta);
    expect(only(d.players)).toMatchObject({ playerId: 1, reasons: ["extra_central_match"] });
  });

  it("games rule: a rostered appearance with no batting or bowling line", () => {
    const base = agreed();
    const rosterOnly = app(G1, {
      hasBattingRow: false,
      batted: false,
      innings: 0,
      runs: 0,
      balls: null,
    });
    const d = diffCareers(
      input({
        ...base,
        centralMatches: [...base.centralMatches!, cMatch(103)],
        appearances: apps([101, [app(G1)]], [102, [app(G1)]], [103, [rosterOnly]]),
        hybridBuckets: [bucket(1, { games: 3, innings: 2, runs: 40 })],
      }),
    );
    const g = only(d.grades);
    expect(g.reasons).toEqual(["games_rule"]);
    expect(g.delta).toEqual({ games: 1, innings: 0, runs: 0, wickets: 0, catches: 0 });
  });

  it("Ladies T20: a central-only Ladies T20 match counted as Female B Grade", () => {
    const FB = "Female B Grade";
    const d = diffCareers(
      input({
        centralMatches: [cMatch(201, { grade: FB, season: 2018, ladiesT20: true })],
        appearances: apps([201, [app(G1, { runs: 12 })]]),
        hybridBuckets: [bucket(1, { grade: FB, season: 2018, games: 1, innings: 1, runs: 12 })],
      }),
    );
    const g = only(d.grades);
    expect(g).toMatchObject({ grade: FB, reasons: ["ladies_t20"] });
    expect(g.delta.runs).toBe(12);
  });

  it("catches rule: catches differ on a match both sides have", () => {
    const base = agreed();
    const d = diffCareers(
      input({
        ...base,
        nativeGrades: [career(1, { games: 2, innings: 2, runs: 40, catches: 1 })],
        nativeSeasons: [season(1, 2010, { games: 2, innings: 2, runs: 40, catches: 1 })],
        nativeLines: [
          line({ matchId: 1, playerId: 1, catches: 1 }),
          line({ matchId: 2, playerId: 1 }),
        ],
        appearances: apps([101, [app(G1, { catches: 3 })]], [102, [app(G1)]]),
        hybridBuckets: [bucket(1, { games: 2, innings: 2, runs: 40, catches: 3 })],
      }),
    );
    const g = only(d.grades);
    expect(g.reasons).toEqual(["catches_rule"]);
    expect(g.delta).toEqual({ games: 0, innings: 0, runs: 0, wickets: 0, catches: 2 });
    expect(d.commonMatches).toContainEqual(
      expect.objectContaining({
        playerId: 1,
        nativeMatchId: 1,
        centralMatchId: 101,
        nativeCatches: 1,
        centralCatches: 3,
      }),
    );
  });

  it("merge: a merged-away player's career folds into the keeper", () => {
    // Native has the same person twice (ids 1 and 2); the confirmed merge folds
    // guid-2 into guid-1, so id 2's career moves onto id 1.
    const merged: PreviewIdentity = {
      guidsOf: (id) => (id === 1 || id === 2 ? [G1, G2] : []),
      presentedId: (id) => (id === 1 || id === 2 ? 1 : null),
      ownedIds: (id) => (id === 1 || id === 2 ? [1, 2] : []),
      playerIdOfGuid: (g) => (g === G1 || g === G2 ? 1 : null),
    };
    const d = diffCareers(
      input({
        identity: merged,
        nativeGrades: [
          career(1, { games: 1, innings: 1, runs: 20 }),
          career(2, { games: 1, innings: 1, runs: 30 }),
        ],
        nativeSeasons: [
          season(1, 2010, { games: 1, innings: 1, runs: 20 }),
          season(2, 2010, { games: 1, innings: 1, runs: 30 }),
        ],
        nativeMatches: [nMatch(1), nMatch(2)],
        nativeLines: [
          line({ matchId: 1, playerId: 1 }),
          line({ matchId: 2, playerId: 2, runs: 30 }),
        ],
        linkByNativeMatch: new Map([
          [1, 101],
          [2, 102],
        ]),
        centralMatches: [cMatch(101), cMatch(102)],
        appearances: apps([101, [app(G1)]], [102, [app(G2, { runs: 30 })]]),
        hybridBuckets: [bucket(1, { games: 2, innings: 2, runs: 50 })],
      }),
    );
    expect(d.grades).toHaveLength(2);
    const keeper = d.grades.find((g) => g.playerId === 1)!;
    const away = d.grades.find((g) => g.playerId === 2)!;
    expect(keeper.reasons).toEqual(["merge"]);
    expect(keeper.delta).toMatchObject({ games: 1, runs: 30 });
    expect(away.reasons).toEqual(["merge"]);
    expect(away.delta).toMatchObject({ games: -1, runs: -30 });
    expect(away.notes.join(" ")).toContain("#1");
  });

  it("correction: a club correction moves a match figure away from native", () => {
    const base = agreed();
    const d = diffCareers(
      input({
        ...base,
        correctionDeltas: new Map([[`${G1}\u0000101`, { runs: 5, wickets: 0, dismissals: 0 }]]),
        hybridBuckets: [bucket(1, { games: 2, innings: 2, runs: 45 })],
      }),
    );
    const g = only(d.grades);
    expect(g.reasons).toEqual(["correction"]);
    expect(g.delta.runs).toBe(5);
  });

  it("a correction that restores the native figure leaves no delta (AE4)", () => {
    const base = agreed();
    const d = diffCareers(
      input({
        ...base,
        // Central has 15 where native has 20; the correction puts 20 back.
        appearances: apps([101, [app(G1, { runs: 15 })]], [102, [app(G1)]]),
        correctionDeltas: new Map([[`${G1}\u0000101`, { runs: 5, wickets: 0, dismissals: 0 }]]),
      }),
    );
    expect(d.grades).toEqual([]);
  });

  it("figures differ: runs disagree on a common match with no correction (R21)", () => {
    const base = agreed();
    const d = diffCareers(
      input({
        ...base,
        appearances: apps([101, [app(G1, { runs: 15 })]], [102, [app(G1)]]),
        hybridBuckets: [bucket(1, { games: 2, innings: 2, runs: 35 })],
      }),
    );
    const g = only(d.grades);
    expect(g.reasons).toEqual(["figures_differ"]);
    expect(g.delta.runs).toBe(-5);
  });

  it("unlinked identity: the player's central lines sit under a GUID outside the crosswalk", () => {
    // Native match 2 is in central, but the line there belongs to guid-x, which
    // tenant 1's crosswalk and merges don't know (the Dan Howell 2013–16 case).
    const GX = "guid-x";
    const d = diffCareers(
      input({
        nativeGrades: [career(1, { games: 2, innings: 2, runs: 40 })],
        nativeSeasons: [
          season(1, 2010, { games: 1, innings: 1, runs: 20 }),
          season(1, 2013, { games: 1, innings: 1, runs: 20 }),
        ],
        nativeMatches: [nMatch(1), nMatch(2, { season: 2013 })],
        nativeLines: [line({ matchId: 1, playerId: 1 }), line({ matchId: 2, playerId: 1 })],
        linkByNativeMatch: new Map([
          [1, 101],
          [2, 102],
        ]),
        assignments: [
          { nativeMatchId: 1, nativePlayerId: 1, participantId: G1 },
          { nativeMatchId: 2, nativePlayerId: 1, participantId: GX },
        ],
        centralMatches: [cMatch(101), cMatch(102, { season: 2013 })],
        appearances: apps([101, [app(G1)]], [102, [app(GX)]]),
        hybridBuckets: [bucket(1, { games: 1, innings: 1, runs: 20 })],
      }),
    );
    const g = only(d.grades);
    expect(g.reasons).toEqual(["unlinked_identity"]);
    expect(g.delta).toMatchObject({ games: -1, runs: -20 });
    const u = only(d.unlinked);
    expect(u).toMatchObject({
      participantId: GX,
      nativePlayerId: 1,
      mappedToPlayerId: null,
      matches: 1,
      firstSeason: 2013,
      lastSeason: 2013,
    });
    expect(u.nativeFigures.runs).toBe(20);
    expect(u.centralFigures.runs).toBe(20);
  });

  it("native-only match: a native scorecard central doesn't have is lost", () => {
    const base = agreed();
    const d = diffCareers(
      input({
        ...base,
        linkByNativeMatch: new Map([[1, 101]]),
        centralMatches: [cMatch(101)],
        appearances: apps([101, [app(G1)]]),
        hybridBuckets: [bucket(1, { games: 1, innings: 1, runs: 20 })],
      }),
    );
    const g = only(d.grades);
    expect(g.reasons).toEqual(["native_only_match"]);
    expect(g.delta).toMatchObject({ games: -1, runs: -20 });
  });

  describe("seasons compared by total (no match-by-match link)", () => {
    // Native matches with no PlayHQ id can't be linked to a central match, so
    // the player's season totals are compared instead of pairing matches.
    const unlinkedSeason = (central: CentralAppearance[], hybrid: Partial<HybridBucket>) =>
      input({
        nativeGrades: [career(1, { games: 2, innings: 2, runs: 40 })],
        nativeSeasons: [season(1, 2010, { games: 2, innings: 2, runs: 40 })],
        nativeMatches: [nMatch(1), nMatch(2)],
        nativeLines: [line({ matchId: 1, playerId: 1 }), line({ matchId: 2, playerId: 1 })],
        centralMatches: central.map((_, i) => cMatch(101 + i)),
        appearances: apps(...central.map((a, i): [number, CentralAppearance[]] => [101 + i, [a]])),
        hybridBuckets: [bucket(1, hybrid)],
      });

    it("unlinked native matches that central also has are not a delta", () => {
      const d = diffCareers(unlinkedSeason([app(G1), app(G1)], { games: 2, innings: 2, runs: 40 }));
      expect(d.grades).toEqual([]);
    });

    it("one more central match in the season is an extra central match", () => {
      const d = diffCareers(
        unlinkedSeason([app(G1), app(G1), app(G1, { runs: 55 })], {
          games: 3,
          innings: 3,
          runs: 95,
        }),
      );
      const g = only(d.grades);
      expect(g.reasons).toEqual(["extra_central_match"]);
      expect(g.delta).toMatchObject({ games: 1, innings: 1, runs: 55 });
    });

    it("one fewer central match in the season is a native-only match", () => {
      const d = diffCareers(unlinkedSeason([app(G1)], { games: 1, innings: 1, runs: 20 }));
      const g = only(d.grades);
      expect(g.reasons).toEqual(["native_only_match"]);
      expect(g.delta).toMatchObject({ games: -1, runs: -20 });
    });

    it("a snapshot season (no native scorecards): games rule and catches rule by total", () => {
      const rosterOnly = app(G1, {
        hasBattingRow: false,
        batted: false,
        innings: 0,
        runs: 0,
        balls: null,
      });
      const d = diffCareers(
        input({
          // Native holds 2008/09 as a season row only: 2 games, 2 catches.
          nativeGrades: [career(1, { games: 2, innings: 2, runs: 40, catches: 2 })],
          nativeSeasons: [season(1, 2008, { games: 2, innings: 2, runs: 40, catches: 2 })],
          centralMatches: [101, 102, 103].map((id) => cMatch(id, { season: 2008 })),
          appearances: apps(
            [101, [app(G1, { catches: 1 })]],
            [102, [app(G1, { catches: 1 })]],
            [103, [rosterOnly]],
          ),
          hybridBuckets: [bucket(1, { season: 2008, games: 3, innings: 2, runs: 40, catches: 2 })],
        }),
      );
      const g = only(d.grades);
      expect(g.reasons).toEqual(["games_rule"]);
      expect(g.delta).toEqual({ games: 1, innings: 0, runs: 0, wickets: 0, catches: 0 });

      const c = diffCareers(
        input({
          nativeGrades: [career(1, { games: 2, innings: 2, runs: 40, catches: 2 })],
          nativeSeasons: [season(1, 2008, { games: 2, innings: 2, runs: 40, catches: 2 })],
          centralMatches: [101, 102].map((id) => cMatch(id, { season: 2008 })),
          appearances: apps([101, [app(G1, { catches: 3 })]], [102, [app(G1, { catches: 2 })]]),
          hybridBuckets: [bucket(1, { season: 2008, games: 2, innings: 2, runs: 40, catches: 5 })],
        }),
      );
      expect(only(c.grades)).toMatchObject({
        reasons: ["catches_rule"],
        delta: { games: 0, innings: 0, runs: 0, wickets: 0, catches: 3 },
      });
    });
  });

  it("grade reclassified: a match native keeps in A Grade is PPL centrally", () => {
    const base = agreed();
    const d = diffCareers(
      input({
        ...base,
        centralMatches: [cMatch(101), cMatch(102, { grade: "PPL" })],
        hybridBuckets: [
          bucket(1, { games: 1, innings: 1, runs: 20 }),
          bucket(1, { grade: "PPL", games: 1, innings: 1, runs: 20 }),
        ],
      }),
    );
    expect(d.grades.map((g) => [g.grade, g.reasons, g.delta.games])).toEqual([
      [A, ["grade_reclassified"], -1],
      ["PPL", ["grade_reclassified"], 1],
    ]);
    // The player's whole career is unchanged, so there is no player row.
    expect(d.players).toEqual([]);
  });

  it("unexplained: a hybrid figure the match evidence doesn't account for", () => {
    const base = agreed();
    const d = diffCareers(
      input({ ...base, hybridBuckets: [bucket(1, { games: 2, innings: 2, runs: 47 })] }),
    );
    const g = only(d.grades);
    expect(g.reasons).toEqual(["unexplained"]);
    expect(g.components.unexplained).toEqual({
      games: 0,
      innings: 0,
      runs: 7,
      wickets: 0,
      catches: 0,
    });
  });

  it("a changed high score with no counted delta is still listed", () => {
    const base = agreed();
    const d = diffCareers(
      input({
        ...base,
        nativeGrades: [career(1, { games: 2, innings: 2, runs: 40, highScore: "20" })],
        hybridBuckets: [bucket(1, { games: 2, innings: 2, runs: 40, highScore: "25*" })],
      }),
    );
    const g = only(d.grades);
    expect(g).toMatchObject({
      highScoreChanged: true,
      nativeHighScore: "20",
      hybridHighScore: "25*",
      reasons: ["unexplained"],
    });
  });

  it("history before the boundary that matches native is not a delta", () => {
    const d = diffCareers(
      input({
        nativeGrades: [career(1, { games: 30, innings: 28, runs: 700 })],
        nativeSeasons: [
          season(1, null, { games: 20, innings: 18, runs: 500 }),
          season(1, 2001, { games: 10, innings: 10, runs: 200 }),
        ],
        hybridBuckets: [
          bucket(1, {
            source: "history",
            careerGrain: true,
            season: null,
            games: 20,
            innings: 18,
            runs: 500,
          }),
          bucket(1, { source: "history", season: 2001, games: 10, innings: 10, runs: 200 }),
        ],
      }),
    );
    expect(d.grades).toEqual([]);
  });
});

describe("diffCareers — baseline overlap (R20, AE6)", () => {
  // A baseline row that includes 2003/04 runs, and a boundary of 2003/04:
  // native never loaded A Grade 2003/04 as its own season, so the baseline is
  // the only native home for it, while central supplies the season too.
  const ae6 = (): CareersInput =>
    input({
      nativeGrades: [career(1, { games: 25, innings: 24, runs: 620 })],
      nativeSeasons: [
        season(1, null, { games: 20, innings: 19, runs: 500 }),
        season(1, 2010, { games: 5, innings: 5, runs: 120 }),
      ],
      nativeMatches: [1, 2, 3, 4, 5].map((id) => nMatch(id)),
      nativeLines: [1, 2, 3, 4, 5].map((id) => line({ matchId: id, playerId: 1, runs: 24 })),
      linkByNativeMatch: new Map([1, 2, 3, 4, 5].map((id) => [id, 100 + id])),
      centralMatches: [
        ...[1, 2, 3, 4, 5].map((id) => cMatch(100 + id)),
        cMatch(301, { season: 2003 }),
        cMatch(302, { season: 2003 }),
      ],
      appearances: apps(
        ...[1, 2, 3, 4, 5].map((id): [number, CentralAppearance[]] => [
          100 + id,
          [app(G1, { runs: 24 })],
        ]),
        [301, [app(G1, { runs: 70 })]],
        [302, [app(G1, { runs: 50 })]],
      ),
      hybridBuckets: [
        bucket(1, {
          source: "history",
          careerGrain: true,
          season: null,
          games: 20,
          innings: 19,
          runs: 500,
        }),
        bucket(1, { season: 2003, games: 2, innings: 2, runs: 120 }),
        bucket(1, { season: 2010, games: 5, innings: 5, runs: 120 }),
      ],
    });

  it("flags the overlap and quantifies what would be counted twice", () => {
    const d = diffCareers(ae6());
    const g = only(d.grades);
    expect(g.reasons).toEqual(["baseline_overlap"]);
    expect(g.delta).toMatchObject({ games: 2, runs: 120 });
    const o = only(d.overlaps);
    expect(o).toMatchObject({
      playerId: 1,
      grade: A,
      boundary: 2003,
      kind: "UNCOVERED_CENTRAL_SEASONS",
      seasons: [2003],
    });
    expect(o.baseline).toMatchObject({ games: 20, runs: 500 });
    expect(o.central).toMatchObject({ games: 2, runs: 120 });
    expect(o.doubleCounted).toMatchObject({ games: 2, innings: 2, runs: 120 });
  });

  it("a seed that peeled the season out of the baseline: no change, nothing counted twice", () => {
    const i = ae6();
    // The seed took 2003/04 (2 games, 120 runs) out of the career baseline.
    i.hybridBuckets[0] = { ...i.hybridBuckets[0]!, games: 18, innings: 17, runs: 380 };
    const d = diffCareers(i);
    // The career no longer changes at all.
    expect(d.grades).toEqual([]);
    expect(d.players).toEqual([]);
    const o = only(d.overlaps);
    expect(o.peeled).toMatchObject({ games: 2, innings: 2, runs: 120 });
    expect(o.doubleCounted).toMatchObject({ games: 0, innings: 0, runs: 0 });
  });

  it("a baseline the peel emptied (no career history row): no change either", () => {
    const i = ae6();
    i.nativeSeasons = [season(1, null, { games: 2, innings: 2, runs: 120 }), i.nativeSeasons[1]!];
    i.nativeGrades = [career(1, { games: 7, innings: 7, runs: 240 })];
    i.hybridBuckets = i.hybridBuckets.slice(1);
    const d = diffCareers(i);
    expect(d.grades).toEqual([]);
    expect(only(d.overlaps).doubleCounted).toMatchObject({ games: 0, runs: 0 });
  });

  it("caps the double count at what the baseline holds", () => {
    const i = ae6();
    i.nativeSeasons = [season(1, null, { games: 1, innings: 1, runs: 30 }), i.nativeSeasons[1]!];
    i.nativeGrades = [career(1, { games: 6, innings: 6, runs: 150 })];
    i.hybridBuckets[0] = { ...i.hybridBuckets[0]!, games: 1, innings: 1, runs: 30 };
    const o = only(diffCareers(i).overlaps);
    expect(o.doubleCounted).toMatchObject({ games: 1, innings: 1, runs: 30 });
  });

  it("is an extra central match, not an overlap, when native loaded that season", () => {
    const i = ae6();
    // Another player has a native A Grade 2003/04 season row: native ingested
    // the season, so this player's baseline does not hold it.
    i.nativeSeasons = [...i.nativeSeasons, season(7, 2003, { games: 3 })];
    i.nativeGrades = [...i.nativeGrades, career(7, { games: 3 })];
    i.hybridBuckets = [
      ...i.hybridBuckets,
      bucket(7, { source: "history", season: 2003, games: 3 }),
    ];
    const d = diffCareers(i);
    expect(d.overlaps).toEqual([]);
    expect(d.grades.find((g) => g.playerId === 1)!.reasons).toEqual(["extra_central_match"]);
  });

  it("is not an overlap without a baseline", () => {
    const i = ae6();
    i.nativeSeasons = [i.nativeSeasons[1]!];
    i.nativeGrades = [career(1, { games: 5, innings: 5, runs: 120 })];
    i.hybridBuckets = i.hybridBuckets.slice(1);
    const d = diffCareers(i);
    expect(d.overlaps).toEqual([]);
    expect(only(d.grades).reasons).toEqual(["extra_central_match"]);
  });

  it("lists a peeled central season with the amount the peel removed", () => {
    const base = agreed();
    const d = diffCareers(
      input({
        ...base,
        nativeGrades: [career(1, { games: 12, innings: 12, runs: 240 })],
        nativeSeasons: [
          season(1, null, { games: 10, innings: 10, runs: 200 }),
          season(1, 2010, { games: 2, innings: 2, runs: 40 }),
        ],
        adjustments: [
          {
            playerId: 1,
            grade: A,
            season: 2010,
            games: 2,
            innings: 2,
            runs: 40,
            wickets: 0,
            catches: 0,
          },
        ],
        hybridBuckets: [
          bucket(1, {
            source: "history",
            careerGrain: true,
            season: null,
            games: 10,
            innings: 10,
            runs: 200,
          }),
          bucket(1, { games: 2, innings: 2, runs: 40 }),
        ],
      }),
    );
    expect(d.grades).toEqual([]);
    const o = only(d.overlaps);
    expect(o).toMatchObject({ kind: "PEELED_CENTRAL_SEASONS", seasons: [2010] });
    expect(o.peeled).toMatchObject({ games: 2, runs: 40 });
    expect(o.doubleCounted).toEqual({ games: 0, innings: 0, runs: 0, wickets: 0, catches: 0 });
  });
});

describe("countReasons / topDeltas", () => {
  it("counts rows per reason code and ranks the biggest deltas", () => {
    const base = agreed();
    const d = diffCareers(
      input({
        ...base,
        identity: identity({
          guidsOf: (id) => (id === 1 ? [G1] : id === 2 ? [G2] : []),
          presentedId: (id) => (id === 1 || id === 2 ? id : null),
          ownedIds: (id) => (id === 1 || id === 2 ? [id] : []),
          playerIdOfGuid: (g) => (g === G1 ? 1 : g === G2 ? 2 : null),
        }),
        centralMatches: [...base.centralMatches!, cMatch(103), cMatch(104)],
        appearances: apps(
          [101, [app(G1)]],
          [102, [app(G1)]],
          [103, [app(G1, { runs: 5 })]],
          [104, [app(G2, { runs: 150 })]],
        ),
        hybridBuckets: [
          bucket(1, { games: 3, innings: 3, runs: 45 }),
          bucket(2, { games: 1, innings: 1, runs: 150 }),
        ],
      }),
    );
    expect(countReasons(d.grades)).toEqual({ extra_central_match: 2 });
    expect(topDeltas(d.players, 1).map((p) => p.playerId)).toEqual([2]);
    expect(topDeltas(d.players, 25).map((p) => p.playerId)).toEqual([2, 1]);
  });
});

describe("diffRecords", () => {
  it("lists a record whose holder changes, with the holders' reasons", () => {
    const rows = diffRecords(
      [
        {
          scope: "all",
          native: {
            mostRuns: { playerId: 1, value: "5000" },
            mostGames: { playerId: 1, value: "200" },
          },
          hybrid: {
            mostRuns: { playerId: 2, value: "5100" },
            mostGames: { playerId: 1, value: "200" },
          },
        },
      ],
      (playerId) => (playerId === 2 ? ["extra_central_match"] : []),
    );
    expect(rows).toEqual([
      {
        scope: "all",
        record: "mostRuns",
        change: "holder",
        nativePlayerId: 1,
        nativeValue: "5000",
        hybridPlayerId: 2,
        hybridValue: "5100",
        reasons: ["extra_central_match"],
      },
    ]);
  });

  it("lists a value change for the same holder and nothing when equal", () => {
    const rows = diffRecords(
      [
        {
          scope: A,
          native: { mostWickets: { playerId: 3, value: "300" }, highestScore: null },
          hybrid: { mostWickets: { playerId: 3, value: "304" }, highestScore: null },
        },
      ],
      () => ["games_rule"],
    );
    expect(only(rows)).toMatchObject({ scope: A, record: "mostWickets", change: "value" });
  });

  it("derives the native all-time holders from the per-grade careers", () => {
    const r = nativeAllTimeRecords([
      career(1, { games: 10, runs: 300, highScore: "88*", bestBowling: "2/10" }),
      career(1, { games: 5, runs: 100, highScore: "40" }, "B Grade"),
      career(2, { games: 12, runs: 350, wickets: 20, highScore: "101", bestBowling: "5/12" }),
    ]);
    expect(r.mostGames).toEqual({ playerId: 1, value: "15" });
    expect(r.mostRuns).toEqual({ playerId: 1, value: "400" });
    expect(r.mostWickets).toEqual({ playerId: 2, value: "20" });
    expect(r.highestScore).toEqual({ playerId: 2, value: "101" });
    expect(r.bestBowling).toEqual({ playerId: 2, value: "5/12" });
    expect(r.mostCatches).toBeNull();
  });
});

describe("diffMilestones", () => {
  const tiers = { games: [100, 150], runs: [1000], wickets: [100] };
  const base = {
    tiers,
    nativeMatchByCentral: new Map([[901, 9]]),
    reasonsFor: () => ["extra_central_match" as const],
  };

  it("a tier crossing that appears, disappears and moves", () => {
    const rows = diffMilestones({
      ...base,
      nativeTotals: new Map([
        [1, { games: 99, runs: 1200, wickets: 0 }],
        [2, { games: 101, runs: 0, wickets: 0 }],
      ]),
      hybridTotals: new Map([
        [1, { games: 102, runs: 1250, wickets: 0 }],
        [2, { games: 97, runs: 0, wickets: 0 }],
      ]),
      nativeCrossings: [
        {
          playerId: 1,
          board: "runs",
          threshold: 1000,
          season: 2015,
          matchDate: "2016-01-09",
          matchId: 5,
        },
        { playerId: 2, board: "games", threshold: 100, season: 2019, matchDate: null, matchId: 6 },
      ],
      hybridCrossings: [
        {
          playerId: 1,
          board: "games",
          threshold: 100,
          season: 2021,
          matchDate: "2021-11-06",
          matchId: 900,
        },
        {
          playerId: 1,
          board: "runs",
          threshold: 1000,
          season: 2014,
          matchDate: "2015-02-07",
          matchId: 902,
        },
      ],
    });
    expect(rows.map((r) => [r.playerId, r.board, r.threshold, r.status, r.direction])).toEqual([
      [1, "games", 100, "appears", ""],
      [1, "runs", 1000, "moves", "earlier"],
      [2, "games", 100, "disappears", ""],
    ]);
    expect(rows[0]).toMatchObject({ nativeValue: 99, hybridValue: 102, hybridSeason: 2021 });
  });

  it("the same match on both sides is not a move", () => {
    const rows = diffMilestones({
      ...base,
      nativeTotals: new Map([[1, { games: 120, runs: 0, wickets: 0 }]]),
      hybridTotals: new Map([[1, { games: 120, runs: 0, wickets: 0 }]]),
      nativeCrossings: [
        {
          playerId: 1,
          board: "games",
          threshold: 100,
          season: 2019,
          matchDate: "2019-10-12",
          matchId: 9,
        },
      ],
      hybridCrossings: [
        {
          playerId: 1,
          board: "games",
          threshold: 100,
          season: 2019,
          matchDate: "2019-10-12",
          matchId: 901,
        },
      ],
    });
    expect(rows).toEqual([]);
  });
});

describe("debut order vs the cap register (AE7)", () => {
  const caps = [
    { category: "male", capNumber: 10, playerId: 1, name: "First Capped" },
    { category: "male", capNumber: 11, playerId: 2, name: "Second Capped" },
    { category: "male", capNumber: 12, playerId: 3, name: "Third Capped" },
  ];

  it("lists a debut that moves earlier and leaves every cap number unchanged", () => {
    const rows = diffDebutOrder({
      caps,
      gradeOf: () => A,
      nativeDebut: new Map([
        ["1|A Grade", { season: 2010, date: "2010-10-09", matchId: 1 }],
        ["2|A Grade", { season: 2011, date: "2011-10-08", matchId: 2 }],
        ["3|A Grade", { season: 2012, date: "2012-10-06", matchId: 3 }],
      ]),
      hybridDebut: new Map([
        ["1|A Grade", { season: 2010, date: "2010-10-09", matchId: 101 }],
        ["2|A Grade", { season: 2011, date: "2011-10-08", matchId: 102 }],
        // Central has an earlier A Grade match for cap #12 than native did.
        ["3|A Grade", { season: 2009, date: "2009-11-14", matchId: 99 }],
      ]),
      sameMatch: (n, c) => c === 100 + n,
    });
    const r = only(rows);
    expect(r).toMatchObject({
      category: "male",
      capNumber: 12,
      capNumberAfter: 12,
      playerId: 3,
      moved: "earlier",
      nativeSeason: 2012,
      hybridSeason: 2009,
      orderDiffers: true,
      wouldPrecedeCap: 10,
    });
    // The register itself is never touched.
    expect(caps.map((c) => c.capNumber)).toEqual([10, 11, 12]);
  });

  it("lists nothing when every debut is the same match", () => {
    const pts = new Map([
      ["1|A Grade", { season: 2010, date: "2010-10-09", matchId: 1 }],
      ["2|A Grade", { season: 2011, date: "2011-10-08", matchId: 2 }],
    ]);
    const rows = diffDebutOrder({
      caps: caps.slice(0, 2),
      gradeOf: () => A,
      nativeDebut: pts,
      hybridDebut: new Map(
        [...pts].map(([k, v]) => [k, { ...v, matchId: 100 + (v.matchId ?? 0) }]),
      ),
      sameMatch: (n, c) => c === 100 + n,
    });
    expect(rows).toEqual([]);
  });

  it("derives native debuts the way the milestone board does, and hybrid debuts from central", () => {
    const native = nativeDebuts({
      grades: [A],
      matches: [
        nMatch(1, { season: 2010, round: 3, matchDate: "2010-10-23" }),
        nMatch(2, { season: 2010, round: 1, matchDate: "2010-10-09" }),
        nMatch(3, { season: 2012, round: 1, matchDate: "2012-10-06" }),
      ],
      lines: [
        line({ matchId: 1, playerId: 1 }),
        line({ matchId: 2, playerId: 1 }),
        line({ matchId: 3, playerId: 2 }),
      ],
      // Player 2 has baseline A Grade games: the debut predates the scorecards.
      seasons: [season(2, null, { games: 4 })],
    });
    expect(native.get("1|A Grade")).toEqual({ season: 2010, date: "2010-10-09", matchId: 2 });
    expect(native.has("2|A Grade")).toBe(false);

    const hybrid = hybridDebuts({
      grades: [A],
      playerIds: [1, 2],
      identity: identity({
        guidsOf: (id) => (id === 1 ? [G1] : id === 2 ? [G2] : []),
      }),
      boundaries: [{ grade: null, startSeason: 2003 }],
      centralMatches: [
        cMatch(101, { season: 2009, matchDate: "2009-11-14" }),
        cMatch(102, { season: 2010, matchDate: "2010-10-09" }),
        cMatch(103, { season: 2001, matchDate: "2001-10-06" }),
      ],
      appearances: apps([101, [app(G1), app(G2)]], [102, [app(G1)]], [103, [app(G1)]]),
      // Player 2 has pre-boundary A Grade history: no datable hybrid debut.
      hybridBuckets: [bucket(2, { source: "history", careerGrain: true, season: null, games: 4 })],
    });
    // 2001/02 is before the boundary, so central doesn't supply it.
    expect(hybrid.get("1|A Grade")).toEqual({ season: 2009, date: "2009-11-14", matchId: 101 });
    expect(hybrid.has("2|A Grade")).toBe(false);
  });
});

describe("resolveCurated", () => {
  const ctx = {
    nativePlayerExists: (id: number) => id !== 404,
    presentedId: (id: number) => (id === 1 ? 1 : id === 2 ? 1 : id === 5 ? 5 : id === 6 ? 6 : null),
    hybridVisibility: (id: number) =>
      id === 5 ? ("private" as const) : id === 6 ? ("no_career" as const) : ("ok" as const),
  };
  const ref = (playerId: number) => ({
    table: "award_winners",
    rowId: playerId,
    column: "player_id",
    playerId,
    label: `row ${playerId}`,
  });

  it("classifies each curated link after cut-over", () => {
    const rows = resolveCurated([1, 2, 3, 5, 6, 404, 95001].map(ref), ctx);
    expect(rows.map((r) => [r.playerId, r.status, r.resolvesTo])).toEqual([
      [1, "same", 1],
      [2, "different", 1],
      [3, "missing", null],
      [5, "missing", null],
      [6, "missing", null],
      [404, "unresolved_before", null],
      [95001, "missing", null],
    ]);
    expect(rows.filter((r) => r.blocking)).toHaveLength(5);
    expect(rows.find((r) => r.playerId === 95001)!.detail).toMatch(/cap-only|fill-in/);
  });

  it("a cap-only player keeps its profile, so its links don't block the cut-over", () => {
    const rows = resolveCurated([95001, 95002].map(ref), {
      ...ctx,
      capOnly: (id: number) => id === 95001,
    });
    expect(rows.map((r) => [r.playerId, r.status, r.blocking])).toEqual([
      [95001, "same", false],
      [95002, "missing", true],
    ]);
  });
});

describe("pickCatchesSamples (R6)", () => {
  const cm = (playerId: number, n: number, native: number, central: number): CommonMatch => ({
    playerId,
    nativeMatchId: n,
    centralMatchId: 100 + n,
    participantId: `guid-${playerId}`,
    grade: A,
    season: 2010,
    nativeCatches: native,
    nativeStumpings: 0,
    nativeRunOuts: 0,
    centralCatches: central,
    centralStumpings: 0,
    centralRunOuts: 0,
  });

  it("picks the players whose catches differ most, with both counts per match", () => {
    const common = [
      cm(1, 1, 2, 0), // differs by 2
      cm(1, 2, 0, 1), // differs by 1 the other way: total 3, not 1
      cm(1, 3, 1, 1), // agrees, still shown (a catch on both sides)
      cm(1, 4, 0, 0), // nothing to show
      cm(2, 5, 1, 2), // total 1
      cm(3, 6, 3, 3), // agrees: never sampled
    ];
    const s = pickCatchesSamples(common, 2);
    expect(s.players).toEqual([
      { playerId: 1, matchesDiffering: 2, absoluteDifference: 3, netDifference: -1 },
      { playerId: 2, matchesDiffering: 1, absoluteDifference: 1, netDifference: 1 },
    ]);
    expect(
      s.rows.map((r) => [
        r.playerId,
        r.nativeMatchId,
        r.nativeCatches,
        r.centralCatches,
        r.differs,
      ]),
    ).toEqual([
      [1, 1, 2, 0, true],
      [1, 2, 0, 1, true],
      [1, 3, 1, 1, false],
      [2, 5, 1, 2, true],
    ]);
  });

  it("takes ten players by default", () => {
    const common = Array.from({ length: 14 }, (_, i) => cm(i + 1, i + 1, i + 2, 0));
    const s = pickCatchesSamples(common);
    expect(s.players).toHaveLength(10);
    expect(s.players[0]!.playerId).toBe(14);
  });
});

describe("read-only guard", () => {
  it("refuses any write-ish flag and accepts --out", () => {
    expect(validateArgs(["--out=/tmp/x"])).toBeNull();
    for (const flag of ["--commit", "--apply", "--write", "--fix", "--persist=1"]) {
      expect(validateArgs([flag])).toMatch(/READ-ONLY/);
    }
    expect(validateArgs(["--tenant=2"])).toMatch(/Unknown flag/);
  });
});
