/**
 * The club overlay on the surfaces U10 left out (hybrid stats plan U10
 * follow-up): match log, scorecard, club totals / dashboard / grade summaries,
 * grade distribution, centuries and five-fors, head-to-head and record
 * progression — pinned on small fixtures without a database.
 *
 * The real-DB surfaces are covered by routes/club-overlay-surfaces.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  emptyPartialFigures,
  isSeniorAppGrade,
  type CentralCentury,
  type CentralFiveWicketHaul,
  type CentralPartial,
  type CentralPartialFigures,
  type CentralParticipantMatchLine,
  type CentralPlayerMatchRow,
  type CentralRecordProgressionRow,
  type CentralVsClubRow,
} from "@workspace/db/central-queries";
import {
  applyClubOverlay,
  buildClubIdentity,
  clubPlayerDetail,
  clubRecords,
  EMPTY_OVERLAY_DATA,
  resolveCorrections,
  type ClubOverlayData,
  type OverlayCorrection,
  type OverlayHistoryRow,
} from "./club-overlay";
import {
  bestOfMatchLines,
  clubDashboard,
  clubDistributionRows,
  clubGradeSummaries,
  clubTotals,
  correctDisplayFigures,
  lineDeltas,
  overlayHonours,
  overlayMatchLog,
  overlayProgressionCandidates,
  overlayScorecardLines,
  overlayVsClubRows,
  seasonStartYearOf,
  touchesProgression,
  type CuratedHonourRow,
} from "./club-overlay-surfaces";
import { formatRecordValue, walkProgression } from "./records-analytics";

// ── Fixtures ────────────────────────────────────────────────────────────────

const G = "22222222-0000-4000-8000-00000000000a"; // the player under test (id 1)
const H = "22222222-0000-4000-8000-00000000000b"; // G's merged-away second GUID (id 2)
const P = "22222222-0000-4000-8000-00000000000c"; // a private player (id 3)
const F = "22222222-0000-4000-8000-00000000000f"; // a fill-in (id 90005)
const T = "22222222-0000-4000-8000-00000000000d"; // a team-mate (id 4)
const IDS: Record<string, number> = { [G]: 1, [H]: 2, [P]: 3, [F]: 90005, [T]: 4 };
const NAMES: Record<string, string> = { [G]: "Ann Player", [T]: "Tom Mate", [P]: "Pat Private" };

// AE1 boundaries: club default 2003/04, B Grade override 2004/05.
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
    opponentClubId: 50,
    matchDate: `${season}-11-01`,
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
  return { id, playhqMatchId: `phq-${matchId}`, participantId, field, previousValue, newValue };
}

/** The corrected lines the surfaces consume (stale corrections never reach them). */
function corrected(
  corrections: OverlayCorrection[],
  lines: CentralParticipantMatchLine[],
  merges: [string, string][] = [],
) {
  return resolveCorrections(corrections, lines, {
    canonicalOf: identity(merges).canonicalOf,
    boundaries: BOUNDARIES,
  }).lines;
}

function stats(opts: {
  buckets: CentralPartial[];
  data?: Partial<ClubOverlayData>;
  lines?: CentralParticipantMatchLine[];
  privateIds?: string[];
}) {
  const ids = [...new Set(opts.buckets.map((b) => b.participantId))];
  return applyClubOverlay({
    partials: {
      buckets: opts.buckets,
      players: ids.map((participantId) => ({
        participantId,
        displayName: NAMES[participantId] ?? null,
        isPrivate: (opts.privateIds ?? []).includes(participantId),
      })),
    },
    lines: opts.lines ?? [],
    identity: identity(),
    data: { ...EMPTY_OVERLAY_DATA, ...opts.data },
    isSeniorGrade: isSeniorAppGrade,
  });
}

/** A central match-log row: one innings of `runs`, no bowling. */
function logRow(
  matchId: number,
  grade: string,
  season: number,
  runs: number,
  extra: Partial<CentralPlayerMatchRow> = {},
): CentralPlayerMatchRow {
  return {
    matchId,
    grade,
    season,
    round: matchId,
    stage: null,
    matchDate: `${season}-11-01`,
    opponent: "Rivals",
    venue: "Oval",
    result: "Won",
    batted: true,
    battingPos: 3,
    runs,
    balls: runs,
    fours: 0,
    sixes: 0,
    notOut: false,
    dismissal: "b: A Bowler",
    bowled: false,
    overs: null,
    maidens: null,
    runsConceded: null,
    wickets: null,
    wides: null,
    noBalls: null,
    catches: null,
    stumpings: null,
    runOuts: null,
    isHome: true,
    battedFirst: true,
    opponentClubId: 50,
    inningsLines: [
      {
        innings: 1,
        runs,
        balls: runs,
        notOut: false,
        battingPos: 3,
        dismissal: "b: A Bowler",
        dismissalType: "bowled",
      },
    ],
    ...extra,
  };
}

// ── Corrected display figures ───────────────────────────────────────────────

describe("corrected display figures", () => {
  const before = line(G, 2, "B Grade", 2004, 40, {
    bowling: [{ balls: 24, maidens: 1, runs: 20, wickets: 2, wides: 0, noBalls: 0 }],
  });

  it("lineDeltas lists only the fields a correction moved", () => {
    const [c] = corrected([correction(1, G, 2, "runs", 40, 45)], [before]);
    expect(lineDeltas(c!)).toEqual({ runs: 5 });
  });

  it("AE4: runs 40 -> 45 shows 45; balls bowled re-states the overs", () => {
    const [c] = corrected(
      [correction(1, G, 2, "runs", 40, 45), correction(2, G, 2, "balls_bowled", 24, 27)],
      [before],
    );
    const shown = correctDisplayFigures(
      logRow(2, "B Grade", 2004, 40, { bowled: true, overs: "4", wickets: 2, runsConceded: 20 }),
      c!,
    );
    expect(shown).toMatchObject({ runs: 45, overs: "4.3", wickets: 2, runsConceded: 20 });
  });

  it("a not-out correction flips the displayed not-out flag both ways", () => {
    const [gain] = corrected([correction(1, G, 2, "not_out", 0, 1)], [before]);
    expect(correctDisplayFigures(logRow(2, "B Grade", 2004, 40), gain!).notOut).toBe(true);
    const notOutLine = line(G, 2, "B Grade", 2004, 40, {
      batting: [{ runs: 40, balls: 40, fours: 0, sixes: 0, kind: "notout" }],
    });
    const [lose] = corrected([correction(1, G, 2, "not_out", 1, 0)], [notOutLine]);
    expect(
      correctDisplayFigures(logRow(2, "B Grade", 2004, 40, { notOut: true }), lose!).notOut,
    ).toBe(false);
  });
});

// ── Player match log ────────────────────────────────────────────────────────

describe("the player match log", () => {
  const rows = [
    logRow(1, "B Grade", 2003, 70), // before B Grade's boundary: club history's season
    logRow(2, "B Grade", 2004, 40),
    logRow(3, "B Grade", 2005, 30),
  ];
  const lines = [line(G, 2, "B Grade", 2004, 40), line(G, 3, "B Grade", 2005, 30)];
  const base = {
    rows,
    playerKey: G,
    identity: identity(),
    boundaries: BOUNDARIES,
    history: [] as OverlayHistoryRow[],
    isSeniorGrade: isSeniorAppGrade,
  };
  const runsBySeason = (log: ReturnType<typeof overlayMatchLog>) =>
    log.map((r) => [r.season, r.matchId, r.runs]);

  it("a central match before the grade's boundary is not served", () => {
    const log = overlayMatchLog({ ...base, corrected: [] });
    expect(runsBySeason(log)).toEqual([
      [2005, 3, 30],
      [2004, 2, 40],
    ]);
  });

  it("AE4: a correction shows on the match row and its innings; removed, it reverts", () => {
    const applied = overlayMatchLog({
      ...base,
      corrected: corrected([correction(1, G, 2, "runs", 40, 45)], lines),
    });
    const row = applied.find((r) => r.matchId === 2)!;
    expect(row.runs).toBe(45);
    expect(row.inningsLines.map((l) => l.runs)).toEqual([45]);
    // The cached central rows are never mutated.
    expect(rows[1]!.runs).toBe(40);
    expect(rows[1]!.inningsLines[0]!.runs).toBe(40);

    const removed = overlayMatchLog({ ...base, corrected: corrected([], lines) });
    expect(removed.find((r) => r.matchId === 2)!.runs).toBe(40);
  });

  it("a stale correction (central no longer matches) is not applied", () => {
    const log = overlayMatchLog({
      ...base,
      corrected: corrected([correction(1, G, 3, "runs", 31, 35)], lines), // central says 30
    });
    expect(log.find((r) => r.matchId === 3)!.runs).toBe(30);
  });

  it("another player's correction never touches this player's log", () => {
    const log = overlayMatchLog({
      ...base,
      corrected: corrected(
        [correction(1, T, 2, "runs", 12, 99)],
        [...lines, line(T, 2, "B Grade", 2004, 12)],
      ),
    });
    expect(log.find((r) => r.matchId === 2)!.runs).toBe(40);
  });

  it("a correction to a merged-away GUID shows on the keeper's log", () => {
    const merges: [string, string][] = [[H, G]];
    const log = overlayMatchLog({
      ...base,
      identity: identity(merges),
      corrected: corrected(
        [correction(1, H, 3, "runs", 30, 33)],
        [line(H, 3, "B Grade", 2005, 30)],
        merges,
      ),
    });
    expect(log.find((r) => r.matchId === 3)!.runs).toBe(33);
  });

  it("a fielding correction moves the row's catches", () => {
    const log = overlayMatchLog({
      ...base,
      corrected: corrected([correction(1, G, 2, "catches", 0, 2)], lines),
    });
    expect(log.find((r) => r.matchId === 2)!.catches).toBe(2);
  });

  it("match-grain history appears for a pre-boundary season; career and season grain never do", () => {
    const log = overlayMatchLog({
      ...base,
      corrected: [],
      history: [
        // A pre-boundary B Grade match from the club's own book.
        history(1, "B Grade", 2003, {
          id: 77,
          grain: "match",
          matchDate: "2003-12-06",
          opponent: "Old Rivals",
          round: "Round 7",
          runs: 88,
          notOuts: 1,
          wickets: 2,
          runsConceded: 18,
          ballsBowled: 27,
          catches: 1,
        }),
        // Never a match row: season and career grain.
        history(1, "B Grade", 2003, { games: 8, innings: 8, runs: 300 }),
        history(1, "A Grade", null, { games: 20, innings: 20, runs: 1000 }),
        // Central supplies 2004/05 for B Grade, so this history match is ignored.
        history(1, "B Grade", 2004, { id: 78, grain: "match", runs: 999 }),
        // Another player's, a junior's and a fill-in's history never appear.
        history(4, "B Grade", 2003, { id: 79, grain: "match", runs: 5 }),
        history(1, "Under 15", 2001, { id: 80, grain: "match", runs: 200 }),
        history(90005, "B Grade", 2003, { id: 81, grain: "match", runs: 500 }),
      ],
    });
    expect(runsBySeason(log)).toEqual([
      [2005, 3, 30],
      [2004, 2, 40],
      [2003, -77, 88],
    ]);
    expect(log[2]).toMatchObject({
      matchId: -77,
      grade: "B Grade",
      round: 7,
      matchDate: "2003-12-06",
      opponent: "Old Rivals",
      batted: true,
      notOut: true,
      bowled: true,
      overs: "4.3",
      wickets: 2,
      runsConceded: 18,
      catches: 1,
      isHome: null,
      battedFirst: null,
      opponentClubId: null,
    });
    expect(log[2]!.inningsLines).toEqual([expect.objectContaining({ runs: 88, notOut: true })]);
  });

  it("a history-only player (no central lines) gets their history matches", () => {
    const log = overlayMatchLog({
      ...base,
      rows: [],
      corrected: [],
      playerKey: "player:700",
      history: [history(700, "A Grade", 1998, { id: 5, grain: "match", runs: 12 })],
    });
    expect(runsBySeason(log)).toEqual([[1998, -5, 12]]);
  });
});

// ── Match scorecard ─────────────────────────────────────────────────────────

describe("the match scorecard", () => {
  const card = [
    { participantId: G, ...logRow(2, "B Grade", 2004, 40) },
    { participantId: T, ...logRow(2, "B Grade", 2004, 12) },
    { participantId: null, ...logRow(2, "B Grade", 2004, 7) },
  ];
  const lines = [line(G, 2, "B Grade", 2004, 40), line(G, 3, "B Grade", 2005, 30)];

  it("applies a correction to that player's line in that match only", () => {
    const fixed = overlayScorecardLines(
      card,
      corrected([correction(1, G, 2, "runs", 40, 45)], lines),
      2,
    );
    expect(fixed.map((l) => l.runs)).toEqual([45, 12, 7]);
    expect(card[0]!.runs).toBe(40);
  });

  it("a correction on a different match leaves this card alone", () => {
    const fixed = overlayScorecardLines(
      card,
      corrected([correction(1, G, 3, "runs", 30, 35)], lines),
      2,
    );
    expect(fixed.map((l) => l.runs)).toEqual([40, 12, 7]);
  });
});

// ── Club totals, dashboard and grade summaries ──────────────────────────────

describe("club totals, dashboard and grade summaries", () => {
  const s = stats({
    buckets: [
      partial(G, "B Grade", 2003, { games: 1, batLines: 1, innings: 1, runs: 70 }), // dropped
      partial(G, "B Grade", 2004, { games: 1, batLines: 1, innings: 1, runs: 40, highScore: 40 }),
      partial(G, "B Grade", 2005, { games: 1, batLines: 1, innings: 1, runs: 30, catches: 1 }),
      // R7: bowling only (no batting line) is still a game.
      partial(T, "B Grade", 2005, { games: 1, bowlLines: 1, wickets: 3, runsConceded: 20 }),
      partial(P, "A Grade", 2010, { games: 2, batLines: 2, innings: 2, runs: 500, catches: 9 }),
      partial(F, "B Grade", 2005, { games: 4, batLines: 4, innings: 4, runs: 900 }), // fill-in
    ],
    lines: [line(G, 2, "B Grade", 2004, 40)],
    privateIds: [P],
    data: {
      boundaries: BOUNDARIES,
      corrections: [correction(1, G, 2, "runs", 40, 45)],
      history: [
        history(1, "B Grade", 2003, { games: 8, innings: 8, runs: 300, catches: 4 }),
        history(1, "A Grade", null, { games: 20, innings: 20, runs: 1000 }),
      ],
    },
  });

  it("totals are the sum of the careers: history + corrected central, no fill-ins", () => {
    expect(clubTotals(s)).toEqual({
      players: 3, // G, T and the private P (counted, never named)
      games: 8 + 20 + 1 + 1 + 1 + 2,
      runs: 300 + 1000 + 45 + 30 + 500,
      wickets: 3,
      grades: 2,
    });
  });

  it("grade summaries add up per grade (games are appearances)", () => {
    expect(clubGradeSummaries(s)).toEqual([
      {
        grade: "A Grade",
        players: 2,
        games: 22,
        innings: 22,
        runs: 1500,
        wickets: 0,
        catches: 9,
        stumpings: 0,
        runOuts: 0,
      },
      {
        grade: "B Grade",
        players: 2,
        games: 11,
        innings: 10,
        runs: 375,
        wickets: 3,
        catches: 5,
        stumpings: 0,
        runOuts: 0,
      },
    ]);
  });

  it("the dashboard names the top performers from the overlaid stats, never a private player", () => {
    const dash = clubDashboard(s);
    expect(dash).toMatchObject({
      totalPlayers: 3,
      totalGames: 33,
      totalRuns: 1875,
      totalWickets: 3,
      gradesCount: 2,
      topRunScorer: { participantId: G, displayName: "Ann Player", value: 1375 },
      topWicketTaker: { participantId: T, value: 3 },
      topFielder: { participantId: G, value: 5 },
    });
    expect(dash.gradeSummaries).toEqual(clubGradeSummaries(s));
  });

  it("the top fielder is the most-catches record holder (one classifier, one answer)", () => {
    expect(clubDashboard(s).topFielder?.participantId).toBe(
      clubRecords(s).mostCatches?.participantId,
    );
  });

  it("player detail shows fielding from both sources (history catches were blank)", () => {
    const detail = clubPlayerDetail(s, G)!;
    expect(detail.stats.map((r) => [r.grade, r.catches])).toEqual([
      ["A Grade", 0],
      ["B Grade", 5],
    ]);
  });
});

// ── Grade distribution ──────────────────────────────────────────────────────

describe("grade distribution", () => {
  const s = stats({
    buckets: [
      partial(G, "B Grade", 2004, {
        games: 5,
        batLines: 5,
        innings: 5,
        runs: 200,
        highScore: 80,
        ballsFaced: 250,
        runsOffBallsFaced: 190,
        bowlLines: 2,
        ballsBowled: 60,
        runsOffBallsBowled: 40,
        wicketsOffBallsBowled: 3,
        wickets: 3,
        runsConceded: 40,
      }),
      partial(G, "B Grade", 2005, { games: 4, batLines: 4, innings: 4, runs: 100, highScore: 95 }),
      partial(G, "A Grade", 2005, { games: 9, batLines: 9, innings: 9, runs: 900 }),
      partial(P, "B Grade", 2005, { games: 9, batLines: 9, innings: 9, runs: 900 }),
    ],
    privateIds: [P],
    data: {
      boundaries: BOUNDARIES,
      history: [
        history(1, "B Grade", 2003, { games: 8, innings: 8, runs: 300, highScore: 120 }),
        history(1, "B Grade", null, { games: 20, innings: 20, runs: 1000, ballsFaced: 50 }),
      ],
    },
  });

  it("a career span includes history (career grain too) and omits private players", () => {
    const rows = clubDistributionRows(s, "B Grade");
    expect(rows).toEqual([
      expect.objectContaining({
        participantId: G,
        displayName: "Ann Player",
        games: 37,
        innings: 37,
        runs: 1600,
        highScore: 120,
        ballsFaced: 300,
        // Runs only from innings with a ball count: central's 190 + the career row's 1000.
        runsOffBallsFaced: 1190,
        ballsBowled: 60,
        runsOffBallsBowled: 40,
        wicketsOffBallsBowled: 3,
      }),
    ]);
  });

  it("a season span leaves career-grain history out and respects the bounds", () => {
    const [row] = clubDistributionRows(s, "B Grade", { fromSeason: 2003, toSeason: 2004 });
    expect(row).toMatchObject({ games: 13, runs: 500, highScore: 120 });
    const [later] = clubDistributionRows(s, "B Grade", { fromSeason: 2005 });
    expect(later).toMatchObject({ games: 4, runs: 100, highScore: 95 });
  });
});

// ── Centuries and five-wicket hauls ─────────────────────────────────────────

describe("centuries and five-wicket hauls", () => {
  const century = (
    participantId: string,
    matchId: number,
    grade: string,
    season: string,
    score: string,
  ): CentralCentury => ({
    participantId,
    displayName: NAMES[participantId] ?? null,
    matchId,
    grade,
    score,
    season,
  });
  const names = new Map(
    Object.entries(NAMES).map(([pid, displayName]) => [pid, { displayName, isPrivate: pid === P }]),
  );
  const base = {
    kind: "century" as const,
    identity: identity(),
    boundaries: BOUNDARIES,
    history: [] as OverlayHistoryRow[],
    curated: [] as CuratedHonourRow[],
    names,
    isSeniorGrade: isSeniorAppGrade,
  };
  const listed = (rows: ReturnType<typeof overlayHonours>) =>
    rows.map((r) => [r.displayName, r.grade, r.season, r.detail, r.source]);

  it("central rows before the boundary and fill-ins' rows are left out", () => {
    const rows = overlayHonours({
      ...base,
      corrected: [],
      rows: [
        century(G, 1, "B Grade", "2003/04", "101"), // before B's boundary
        century(G, 2, "B Grade", "2004/05", "104"),
        century(F, 3, "B Grade", "2005/06", "150"),
      ],
    });
    expect(listed(rows)).toEqual([["Ann Player", "B Grade", "2004/05", "104", "central"]]);
  });

  it("a correction can ADD a century (95 -> 105) for a player with no central row", () => {
    const rows = overlayHonours({
      ...base,
      rows: [century(T, 9, "B Grade", "2005/06", "111*")],
      corrected: corrected(
        [correction(1, G, 2, "runs", 95, 105)],
        [line(G, 2, "B Grade", 2004, 95)],
      ),
    });
    expect(listed(rows)).toEqual([
      ["Tom Mate", "B Grade", "2005/06", "111*", "central"],
      ["Ann Player", "B Grade", "2004/05", "105", "central"],
    ]);
  });

  it("a correction can REMOVE a century (104 -> 94), and re-states a corrected one", () => {
    const lines = [line(G, 2, "B Grade", 2004, 104), line(G, 3, "B Grade", 2005, 120)];
    const rows = overlayHonours({
      ...base,
      rows: [
        century(G, 2, "B Grade", "2004/05", "104"),
        century(G, 3, "B Grade", "2005/06", "120"),
      ],
      corrected: corrected(
        [correction(1, G, 2, "runs", 104, 94), correction(2, G, 3, "runs", 120, 125)],
        lines,
      ),
    });
    expect(listed(rows)).toEqual([["Ann Player", "B Grade", "2005/06", "125", "central"]]);
  });

  it("a private player's corrected century never appears", () => {
    const rows = overlayHonours({
      ...base,
      rows: [],
      corrected: corrected(
        [correction(1, P, 2, "runs", 95, 105)],
        [line(P, 2, "B Grade", 2004, 95)],
      ),
    });
    expect(rows).toEqual([]);
  });

  it("pre-boundary club history adds match-grain hundreds; season and career grain never list", () => {
    const rows = overlayHonours({
      ...base,
      rows: [],
      corrected: [],
      history: [
        history(1, "B Grade", 2003, { id: 7, grain: "match", runs: 134, notOuts: 1 }),
        history(1, "B Grade", 2003, { id: 8, grain: "match", runs: 99 }),
        history(1, "B Grade", 2004, { id: 9, grain: "match", runs: 150 }), // central's season
        history(1, "B Grade", 2002, { games: 9, innings: 9, runs: 600, hundreds: 2 }),
        history(1, "A Grade", null, { games: 20, runs: 1000, hundreds: 3 }),
      ],
    });
    expect(listed(rows)).toEqual([["Ann Player", "B Grade", "2003/04", "134*", "history"]]);
    expect(rows[0]).toMatchObject({ participantId: G, playerId: 1 });
  });

  it("curated honours before the boundary are listed; later, undated and no-boundary ones are not", () => {
    const curated: CuratedHonourRow[] = [
      { playerId: 1, grade: "A Grade", name: "A Player", detail: "134*", season: "1998/99" },
      { playerId: 1, grade: "A Grade", name: "A Player", detail: "101", season: "2003/04" },
      { playerId: null, grade: "B Grade", name: "Old Timer", detail: "110", season: "2003/04" },
      { playerId: 1, grade: "A Grade", name: "A Player", detail: "100", season: null },
      { playerId: 1, grade: "Under 15", name: "A Player", detail: "100", season: "1990/91" },
      { playerId: 90005, grade: "A Grade", name: "Fill In", detail: "200", season: "1990/91" },
    ];
    const rows = overlayHonours({ ...base, rows: [], corrected: [], curated });
    expect(listed(rows)).toEqual([
      ["A Player", "A Grade", "1998/99", "134*", "curated"],
      ["Old Timer", "B Grade", "2003/04", "110", "curated"],
    ]);
    // No boundary at all: central supplies everything, curated rows add nothing.
    expect(overlayHonours({ ...base, boundaries: [], rows: [], corrected: [], curated })).toEqual(
      [],
    );
  });

  it("five-wicket hauls follow the same rules (a correction can add one)", () => {
    const fiver: CentralFiveWicketHaul = {
      participantId: T,
      displayName: "Tom Mate",
      matchId: 1,
      grade: "B Grade",
      figures: "6/20",
      season: "2003/04", // before B's boundary
    };
    const bowled = line(G, 2, "B Grade", 2004, 0, {
      bowling: [{ balls: 60, maidens: 0, runs: 30, wickets: 4, wides: 0, noBalls: 0 }],
    });
    const rows = overlayHonours({
      ...base,
      kind: "fiveFor",
      rows: [fiver],
      corrected: corrected([correction(1, G, 2, "wickets", 4, 5)], [bowled]),
      history: [
        history(1, "B Grade", 2003, { id: 3, grain: "match", wickets: 7, runsConceded: 22 }),
      ],
    });
    expect(listed(rows)).toEqual([
      ["Ann Player", "B Grade", "2004/05", "5/30", "central"],
      ["Ann Player", "B Grade", "2003/04", "7/22", "history"],
    ]);
  });

  it("seasonStartYearOf reads the start year of a season label", () => {
    expect(seasonStartYearOf("2004/05")).toBe(2004);
    expect(seasonStartYearOf("Summer 1998/99")).toBe(1998);
    expect(seasonStartYearOf(null)).toBeNull();
    expect(seasonStartYearOf("unknown")).toBeNull();
  });
});

// ── Head-to-head ────────────────────────────────────────────────────────────

describe("head-to-head (vs club)", () => {
  const row = (participantId: string, f: Partial<CentralVsClubRow>): CentralVsClubRow => ({
    participantId,
    displayName: NAMES[participantId] ?? null,
    matches: 2,
    innings: 2,
    notOuts: 0,
    outs: 2,
    runs: 70,
    highScore: 40,
    highScoreNotOut: false,
    spells: 0,
    wickets: 0,
    runsConceded: 0,
    ballsBowled: null,
    bestWickets: null,
    bestRuns: null,
    ...f,
  });
  const lines = [
    line(G, 2, "B Grade", 2004, 40),
    line(G, 3, "B Grade", 2005, 30),
    line(G, 4, "B Grade", 2005, 99, { opponentClubId: 51 }), // a different opponent
    line(G, 1, "B Grade", 2003, 70), // before the boundary
  ];
  const base = { opponentClubId: 50, identity: identity(), boundaries: BOUNDARIES, lines };

  it("with no corrections the central rows pass through untouched", () => {
    const rows = [row(G, {}), row(T, { runs: 12 })];
    expect(overlayVsClubRows({ ...base, rows, corrected: [] })).toEqual(rows);
  });

  it("a corrected player's record is recomputed from their corrected lines vs that club", () => {
    const rows = [row(G, {}), row(T, { runs: 12 })];
    const out = overlayVsClubRows({
      ...base,
      rows,
      corrected: corrected([correction(1, G, 2, "runs", 40, 45)], lines),
    });
    expect(out[0]).toMatchObject({ matches: 2, innings: 2, outs: 2, runs: 75, highScore: 45 });
    expect(out[1]).toEqual(rows[1]);
  });

  it("a correction against another club changes nothing here", () => {
    const rows = [row(G, {})];
    const out = overlayVsClubRows({
      ...base,
      rows,
      corrected: corrected([correction(1, G, 4, "runs", 99, 150)], lines),
    });
    expect(out[0]).toMatchObject({ runs: 70, highScore: 40 });
  });
});

// ── Record progression ──────────────────────────────────────────────────────

describe("record progression", () => {
  const prog = (
    participantId: string,
    matchId: number,
    season: number,
    primary: number,
    secondary = 0,
  ): CentralRecordProgressionRow => ({
    participantId,
    displayName: NAMES[participantId] ?? null,
    grade: "B Grade",
    season,
    matchId,
    matchDate: `${season}-11-01`,
    primary,
    secondary,
  });
  const s = stats({
    buckets: [
      partial(G, "B Grade", 2004, { games: 1, batLines: 1, innings: 1, runs: 90, highScore: 90 }),
      partial(T, "B Grade", 2004, { games: 1, batLines: 1, innings: 1, runs: 60, highScore: 60 }),
    ],
    data: {
      boundaries: BOUNDARIES,
      history: [
        history(1, "B Grade", 2002, { games: 9, innings: 9, runs: 600, highScore: 75 }),
        history(4, "B Grade", null, {
          games: 50,
          runs: 2000,
          highScore: 140,
          highScoreNotOut: true,
        }),
      ],
    },
  });
  const matchLines = [line(G, 2, "B Grade", 2004, 90), line(T, 2, "B Grade", 2004, 60)];

  it("bestOfMatchLines picks the match's best innings or figures, skipping who it's told to", () => {
    expect(bestOfMatchLines("highScore", matchLines, () => false)).toEqual({
      participantId: G,
      value: { primary: 90, secondary: 0 },
    });
    expect(bestOfMatchLines("highScore", matchLines, (pid) => pid === G)?.participantId).toBe(T);
    const bowl = [
      line(G, 2, "B Grade", 2004, 0, {
        bowling: [{ balls: 30, maidens: 0, runs: 25, wickets: 3, wides: 0, noBalls: 0 }],
      }),
      line(T, 2, "B Grade", 2004, 0, {
        bowling: [{ balls: 30, maidens: 0, runs: 12, wickets: 3, wides: 0, noBalls: 0 }],
      }),
    ];
    expect(bestOfMatchLines("bestBowling", bowl, () => false)).toEqual({
      participantId: T,
      value: { primary: 3, secondary: 12 },
    });
    expect(bestOfMatchLines("bestBowling", matchLines, () => false)).toBeNull();
  });

  it("only corrections to the relevant figures re-judge a match", () => {
    const [runs] = corrected([correction(1, G, 2, "runs", 90, 50)], matchLines);
    const [catches] = corrected([correction(1, G, 2, "catches", 0, 1)], matchLines);
    expect(touchesProgression("highScore", runs!)).toBe(true);
    expect(touchesProgression("bestBowling", runs!)).toBe(false);
    expect(touchesProgression("highScore", catches!)).toBe(false);
  });

  it("drops pre-boundary matches, re-judges a corrected match and ends at the history record", () => {
    const fixed = corrected([correction(1, G, 2, "runs", 90, 50)], matchLines);
    const { dated, undated } = overlayProgressionCandidates({
      kind: "highScore",
      rows: [prog(G, 1, 2003, 130), prog(G, 2, 2004, 90), prog(T, 3, 2005, 95)],
      correctedMatches: [{ matchId: 2, lines: [fixed[0]!.after, matchLines[1]!] }],
      stats: s,
      identity: identity(),
      boundaries: BOUNDARIES,
    });
    const points = walkProgression("highScore", dated, undated).map((p) => [
      p.player.participantId,
      p.season,
      p.matchId,
      formatRecordValue("highScore", p.value),
      p.dated,
    ]);
    expect(points).toEqual([
      [G, 2002, null, "75", true], // club history, season level
      [T, 2005, 3, "95", true], // 2004/05's corrected match (best now T's 60) never broke 75
      [T, null, null, "140*", false], // career-grain history: the record card's value
    ]);
  });
});
