import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_BOUNDARY_SEASON,
  SEED_LABEL,
  SEED_SOURCE,
  decisionsCsv,
  deriveBoundaries,
  flagBaselineOverlaps,
  parseDecisionsCsv,
  parseSeedArgs,
  planDifferenceReview,
  planHistoryRows,
  planIdentity,
  planMatchDifferences,
  planSeed,
  seedWriteSet,
  zeroPeelFigures,
  type CentralOnlyInput,
  type NativeStatRow,
  type PeelFigures,
  type SeedDecision,
  type SeedPlanInput,
} from "./seed-hh-club-layer-core";
import { decisionNote, writeSeedPlan } from "./seed-hh-club-layer-write";
import type { NativeLine, NativePlayer, PlayerLink } from "./hh-central-crosswalk-core";
import type { ReviewRow } from "./persist-hh-crosswalk-core";

/** The SQL name of a drizzle table (or null). */
const tableName = (t: unknown): string | null =>
  t ? ((t as Record<symbol, string>)[Symbol.for("drizzle:Name")] ?? null) : null;

/**
 * Halls Head club layer seed (hybrid stats plan U12; R11, R12, R20, R21,
 * KTD3, KTD5, KTD9). Pure planning only — no database. The runner
 * (seed-hh-club-layer.ts) reads native + central, calls these, prints the
 * preview and, with --commit, writes the plan in one transaction.
 */

/** Senior grade normaliser stand-in (the runner uses the central classifier). */
const seniorGrade = (raw: string): string | null => {
  const t = raw.trim().toLowerCase();
  if (t === "a grade" || t === "a") return "A Grade";
  if (t === "b grade") return "B Grade";
  if (t === "c grade") return "C Grade";
  if (t === "colts") return "Colts";
  return null; // juniors / unknown
};

const stat = (over: Partial<NativeStatRow> & Pick<NativeStatRow, "playerId">): NativeStatRow => ({
  grade: "A Grade",
  season: null,
  games: 10,
  innings: 9,
  notOuts: 1,
  runs: 250,
  highScore: "80*",
  fifties: 2,
  hundreds: 0,
  wickets: 5,
  runsConceded: 120,
  bestBowling: "3/20",
  fiveWickets: 0,
  catches: 4,
  stumpings: 0,
  runOuts: 0,
  ...over,
});

const BOUNDARIES = [
  { grade: null, startSeason: 2003 },
  { grade: "B Grade", startSeason: 2004 },
];

const player = (id: number, given: string, surname: string): NativePlayer => ({
  id,
  givenName: given,
  surname,
});

const link = (
  nativePlayerId: number,
  status: PlayerLink["status"],
  candidates: Array<{ participantId: string; lines: number; strong?: number }> = [],
): PlayerLink => ({
  nativePlayerId,
  status,
  participantId: candidates[0]?.participantId ?? null,
  matchedLines: candidates[0]?.lines ?? 0,
  assignedLines: candidates.reduce((s, c) => s + c.lines, 0),
  totalLines: candidates.reduce((s, c) => s + c.lines, 0),
  unlinkedMatchLines: 0,
  share: 1,
  candidates: candidates.map((c) => ({
    participantId: c.participantId,
    lines: c.lines,
    strong: c.strong ?? 0,
    medium: 0,
    weak: c.strong ? 0 : c.lines,
  })),
  notes: [],
});

// ── Args ─────────────────────────────────────────────────────────────────────

describe("parseSeedArgs (KTD9)", () => {
  it("requires --tenant=1 and previews by default", () => {
    expect(parseSeedArgs([])).toEqual({ error: expect.stringMatching(/--tenant=1 is required/) });
    expect(parseSeedArgs(["--tenant=2"])).toEqual({ error: expect.stringMatching(/refused/) });
    expect(parseSeedArgs(["--tenant=1"])).toEqual({
      tenantId: 1,
      commit: false,
      out: undefined,
      decisions: undefined,
      undo: undefined,
    });
  });

  it("accepts --commit, --out, --decisions and --undo=<batch>", () => {
    expect(
      parseSeedArgs(["--tenant=1", "--commit", "--out=/tmp/x", "--decisions=d.csv"]),
    ).toMatchObject({ commit: true, out: "/tmp/x", decisions: "d.csv" });
    expect(parseSeedArgs(["--tenant=1", "--undo=12"])).toMatchObject({ undo: 12 });
  });

  it("refuses unknown flags, a bad batch id, and undo mixed with decisions", () => {
    expect(parseSeedArgs(["--tenant=1", "--force"])).toHaveProperty("error");
    expect(parseSeedArgs(["--tenant=1", "--undo=abc"])).toHaveProperty("error");
    expect(parseSeedArgs(["--tenant=1", "--undo=0"])).toHaveProperty("error");
    expect(parseSeedArgs(["--tenant=1", "--undo=3", "--decisions=d.csv"])).toHaveProperty("error");
  });
});

// ── Boundary ─────────────────────────────────────────────────────────────────

describe("deriveBoundaries (R12, KTD5)", () => {
  it("defaults to 2003/04 and overrides each grade whose central batting starts elsewhere", () => {
    const { boundaries, table } = deriveBoundaries(
      [
        { grade: "A Grade", season: 2003, lines: 180 },
        { grade: "A Grade", season: 2004, lines: 190 },
        { grade: "B Grade", season: 2004, lines: 150 },
        { grade: "C Grade", season: 2005, lines: 3 },
        { grade: "C Grade", season: 2004, lines: 120 },
      ],
      ["A Grade", "B Grade", "C Grade", "Colts"],
    );
    expect(DEFAULT_BOUNDARY_SEASON).toBe(2003);
    expect(boundaries).toEqual([
      { grade: null, startSeason: 2003 },
      { grade: "B Grade", startSeason: 2004 },
      { grade: "C Grade", startSeason: 2004 },
    ]);
    expect(table).toEqual([
      {
        grade: "A Grade",
        firstCentralSeason: 2003,
        firstSeasonLines: 180,
        boundary: 2003,
        source: "default",
      },
      {
        grade: "B Grade",
        firstCentralSeason: 2004,
        firstSeasonLines: 150,
        boundary: 2004,
        source: "override",
      },
      {
        grade: "C Grade",
        firstCentralSeason: 2004,
        firstSeasonLines: 120,
        boundary: 2004,
        source: "override",
      },
      // A native grade central never covers keeps the default, flagged.
      {
        grade: "Colts",
        firstCentralSeason: null,
        firstSeasonLines: 0,
        boundary: 2003,
        source: "no-central",
      },
    ]);
  });

  it("ignores seasons with no lines", () => {
    const { boundaries } = deriveBoundaries(
      [
        { grade: "A Grade", season: 2002, lines: 0 },
        { grade: "A Grade", season: 2003, lines: 10 },
      ],
      [],
    );
    expect(boundaries).toEqual([{ grade: null, startSeason: 2003 }]);
  });
});

// ── History rows ─────────────────────────────────────────────────────────────

describe("planHistoryRows (R11, KTD4, KTD5)", () => {
  it("loads a native career baseline as career-grain history against the native player id", () => {
    const plan = planHistoryRows({
      pgss: [stat({ playerId: 17, season: null })],
      boundaries: BOUNDARIES,
      seniorGrade,
    });
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({
      playerId: 17,
      grade: "A Grade",
      grain: "career",
      season: null,
      games: 10,
      runs: 250,
      highScore: 80,
      highScoreNotOut: true,
      bestBowlingWickets: 3,
      bestBowlingRuns: 20,
      wickets: 5,
      ballsBowled: null,
    });
    expect(plan.perGrade).toEqual([
      { grade: "A Grade", careerRows: 1, seasonRows: 0, skippedAtOrAfterBoundary: 0 },
    ]);
  });

  it("a native season before the grade's boundary loads as season history; one at or after it is skipped", () => {
    const plan = planHistoryRows({
      pgss: [
        stat({ playerId: 17, season: 2002 }), // A: before 2003 → history
        stat({ playerId: 17, season: 2003 }), // A: boundary season → central
        stat({ playerId: 17, grade: "B Grade", season: 2003 }), // B boundary is 2004 → history
        stat({ playerId: 17, grade: "B Grade", season: 2004 }), // B: at boundary → skipped
        stat({ playerId: 17, grade: "B Grade", season: 2010 }), // after → skipped
      ],
      boundaries: BOUNDARIES,
      seniorGrade,
    });
    expect(plan.rows.map((r) => [r.grade, r.grain, r.season])).toEqual([
      ["A Grade", "season", 2002],
      ["B Grade", "season", 2003],
    ]);
    expect(plan.perGrade).toEqual([
      { grade: "A Grade", careerRows: 0, seasonRows: 1, skippedAtOrAfterBoundary: 1 },
      { grade: "B Grade", careerRows: 0, seasonRows: 1, skippedAtOrAfterBoundary: 2 },
    ]);
    expect(plan.skipped.atOrAfterBoundary).toBe(3);
  });

  it("fill-ins (id >= 90000) never produce history rows", () => {
    const plan = planHistoryRows({
      pgss: [
        stat({ playerId: 90001, season: null }),
        stat({ playerId: 90001, season: 1999 }),
        stat({ playerId: 95001, season: null }),
        stat({ playerId: 5, season: 1999 }),
      ],
      boundaries: BOUNDARIES,
      seniorGrade,
    });
    expect(plan.rows.map((r) => r.playerId)).toEqual([5]);
    expect(plan.rows.every((r) => r.playerId < 90000)).toBe(true);
    expect(plan.skipped.fillIn).toBe(3);
  });

  it("never loads a junior / unknown grade (juniors isolation); reports it instead", () => {
    const plan = planHistoryRows({
      pgss: [
        stat({ playerId: 5, grade: "Under 15", season: 1999 }),
        stat({ playerId: 5, grade: "Colts", season: 1999 }),
      ],
      boundaries: BOUNDARIES,
      seniorGrade,
    });
    expect(plan.rows.map((r) => r.grade)).toEqual(["Colts"]);
    expect(plan.skipped.nonSeniorGrade).toEqual([{ grade: "Under 15", rows: 1 }]);
  });

  it("drops rows with no figures and warns (but still loads) rows failing a sanity check", () => {
    const empty = stat({
      playerId: 6,
      season: 1998,
      games: null,
      innings: null,
      notOuts: null,
      runs: null,
      highScore: null,
      fifties: null,
      hundreds: null,
      wickets: null,
      runsConceded: null,
      bestBowling: null,
      fiveWickets: null,
      catches: null,
      stumpings: null,
      runOuts: null,
    });
    const odd = stat({ playerId: 7, season: 1998, innings: 3, notOuts: 4, highScore: "abc" });
    const plan = planHistoryRows({ pgss: [empty, odd], boundaries: BOUNDARIES, seniorGrade });
    expect(plan.rows.map((r) => r.playerId)).toEqual([7]);
    expect(plan.rows[0]!.highScore).toBeNull();
    expect(plan.skipped.empty).toBe(1);
    expect(plan.warnings.map((w) => w.message)).toEqual(
      expect.arrayContaining([
        "not_outs is more than innings.",
        expect.stringMatching(/high_score/),
      ]),
    );
  });

  it("sums duplicate native rows for one (player, grade, season) the way the native career does", () => {
    const plan = planHistoryRows({
      pgss: [
        stat({ playerId: 8, season: null, runs: 100, highScore: "40", bestBowling: "2/10" }),
        stat({ playerId: 8, season: null, runs: 50, highScore: "61*", bestBowling: "2/8" }),
      ],
      boundaries: BOUNDARIES,
      seniorGrade,
    });
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({
      runs: 150,
      games: 20,
      highScore: 61,
      highScoreNotOut: true,
      bestBowlingWickets: 2,
      bestBowlingRuns: 8,
    });
    expect(plan.mergedDuplicates).toBe(1);
  });
});

// ── Identity ─────────────────────────────────────────────────────────────────

/** Central figures for one (GUID, grade, season). */
const central = (over: Partial<PeelFigures> = {}): PeelFigures => ({
  ...zeroPeelFigures(),
  ...over,
});

describe("planHistoryRows: career baseline peel of what only central records (R20)", () => {
  // Sam Hardman (dev, 4 Oct 2026): his B Grade lives only in a career baseline
  // (6 games, 85 runs), all of it 2017/18. Native holds his 2017/18 scorecard
  // lines, but a native career counts snapshots only, and he has no season row.
  const hardman = stat({
    playerId: 473,
    grade: "B Grade",
    season: null,
    games: 6,
    innings: 6,
    notOuts: 1,
    runs: 85,
    highScore: "32",
    fifties: 0,
    wickets: 0,
    runsConceded: 0,
    bestBowling: null,
    catches: 2,
  });
  const centralOnly = (figures: Array<[string, string, PeelFigures]>): CentralOnlyInput => {
    const byGuid = new Map<string, Map<string, PeelFigures>>();
    for (const [guid, key, f] of figures) {
      const m = byGuid.get(guid) ?? new Map<string, PeelFigures>();
      m.set(key, f);
      byGuid.set(guid, m);
    }
    return {
      guidsByPlayer: new Map([
        [473, ["g-473"]],
        [32, ["g-32a", "g-32b"]],
      ]),
      figures: byGuid,
    };
  };

  it("a baseline wholly made of a season central supplies is dropped, not loaded twice", () => {
    const plan = planHistoryRows({
      pgss: [hardman],
      boundaries: BOUNDARIES,
      seniorGrade,
      centralOnly: centralOnly([
        [
          "g-473",
          "B Grade|2017",
          central({ games: 6, innings: 6, notOuts: 1, runs: 85, catches: 2 }),
        ],
      ]),
    });
    expect(plan.rows).toEqual([]);
    expect(plan.skipped.peeledAway).toBe(1);
    expect(plan.peels).toEqual([
      expect.objectContaining({ playerId: 473, grade: "B Grade", seasons: [2017], dropped: true }),
    ]);
  });

  it("keeps what is left, per figure and floored at zero, over every GUID of the player", () => {
    const plan = planHistoryRows({
      pgss: [
        stat({ playerId: 32, grade: "B Grade", games: 14, innings: 13, runs: 339, wickets: 3 }),
      ],
      boundaries: BOUNDARIES,
      seniorGrade,
      centralOnly: centralOnly([
        ["g-32a", "B Grade|2015", central({ games: 5, innings: 5, runs: 120, wickets: 4 })],
        ["g-32b", "B Grade|2016", central({ games: 3, innings: 3, runs: 40 })],
      ]),
    });
    expect(plan.rows).toHaveLength(1);
    // Wickets: central has 4, the baseline 3 → floored at zero (null, like the native peel).
    expect(plan.rows[0]).toMatchObject({ games: 6, innings: 5, runs: 179, wickets: null });
    // High score and best bowling stay: the hybrid read takes the max with central's anyway.
    expect(plan.rows[0]).toMatchObject({ highScore: 80, bestBowlingWickets: 3 });
    expect(plan.peels[0]).toMatchObject({ seasons: [2015, 2016], dropped: false });
    expect(plan.peels[0]!.peeled).toMatchObject({ games: 8, runs: 160, wickets: 3 });
  });

  it("peels only what central has beyond the player's own season rows, season by season", () => {
    const plan = planHistoryRows({
      pgss: [
        hardman,
        // His own 2018/19 B Grade season row covers part of that season.
        stat({ playerId: 473, grade: "B Grade", season: 2018, games: 1, innings: 1, runs: 10 }),
        // Another player's season row says nothing about Hardman.
        stat({ playerId: 99, grade: "B Grade", season: 2016 }),
      ],
      boundaries: BOUNDARIES,
      seniorGrade,
      centralOnly: centralOnly([
        ["g-473", "B Grade|2016", central({ games: 1, runs: 5 })], // no season row: peeled
        ["g-473", "B Grade|2018", central({ games: 2, runs: 20 })], // row: 1 game, 10 runs
        ["g-473", "B Grade|2003", central({ games: 1, runs: 10 })], // before B's 2004 boundary
        ["g-473", "A Grade|2019", central({ games: 1, runs: 10 })], // another grade
      ]),
    });
    expect(plan.peels).toEqual([
      expect.objectContaining({
        seasons: [2016, 2018],
        peeled: expect.objectContaining({ games: 2, runs: 15 }),
      }),
    ]);
    expect(plan.rows.find((r) => r.playerId === 473 && r.grain === "career")).toMatchObject({
      games: 4,
      runs: 70,
    });
  });

  it("nothing to peel when the player's season rows already hold everything central has", () => {
    const plan = planHistoryRows({
      pgss: [
        hardman,
        stat({ playerId: 473, grade: "B Grade", season: 2017, games: 2, runs: 31, catches: 0 }),
      ],
      boundaries: BOUNDARIES,
      seniorGrade,
      centralOnly: centralOnly([["g-473", "B Grade|2017", central({ games: 2, runs: 30 })]]),
    });
    expect(plan.peels).toEqual([]);
    expect(plan.rows.find((r) => r.grain === "career")).toMatchObject({ games: 6, runs: 85 });
  });

  it("match-era fielding (season rows carry none) comes out of the baseline", () => {
    const plan = planHistoryRows({
      pgss: [
        stat({ playerId: 473, grade: "B Grade", games: 3, catches: 10 }),
        stat({ playerId: 473, grade: "B Grade", season: 2017, games: 2, runs: 30, catches: 0 }),
      ],
      boundaries: BOUNDARIES,
      seniorGrade,
      centralOnly: centralOnly([
        ["g-473", "B Grade|2017", central({ games: 2, runs: 30, catches: 4 })],
      ]),
    });
    expect(plan.peels[0]!.peeled).toMatchObject({ games: 0, runs: 0, catches: 4 });
    expect(plan.rows.find((r) => r.grain === "career")).toMatchObject({ games: 3, catches: 6 });
  });

  it("a baseline with only a high score or best bowling is never dropped by an empty peel", () => {
    const plan = planHistoryRows({
      pgss: [
        stat({
          playerId: 473,
          grade: "B Grade",
          games: null,
          innings: null,
          notOuts: null,
          runs: null,
          fifties: null,
          hundreds: null,
          wickets: null,
          runsConceded: null,
          fiveWickets: null,
          catches: null,
          stumpings: null,
          runOuts: null,
          highScore: "40",
        }),
      ],
      boundaries: BOUNDARIES,
      seniorGrade,
      centralOnly: centralOnly([["g-473", "B Grade|2017", central({ games: 3, runs: 90 })]]),
    });
    expect(plan.peels).toEqual([]);
    expect(plan.rows).toHaveLength(1);
  });

  it("without central figures, baselines load unpeeled (as before)", () => {
    const plan = planHistoryRows({ pgss: [hardman], boundaries: BOUNDARIES, seniorGrade });
    expect(plan.rows[0]).toMatchObject({ games: 6, runs: 85 });
    expect(plan.peels).toEqual([]);
  });
});

describe("planIdentity (R4, R11, KTD2, KTD3)", () => {
  const players = [
    player(1, "Clean", "Player"),
    player(2, "Amb", "Iguous"),
    player(3, "Weak", "Only"),
    player(4, "Baseline", "Only"),
    player(5, "Old", "Scorebook"),
    player(90001, "Fill", "In"),
  ];
  const links = [
    link(1, "CLEAN", [{ participantId: "g-1", lines: 20, strong: 10 }]),
    link(2, "AMBIGUOUS", [
      { participantId: "g-2a", lines: 3, strong: 1 },
      { participantId: "g-2b", lines: 3, strong: 1 },
    ]),
    link(3, "AMBIGUOUS", [
      { participantId: "g-3a", lines: 4, strong: 2 },
      { participantId: "g-3b", lines: 1 },
    ]),
    link(4, "NO_LINES"),
    link(5, "UNMATCHED"),
    link(90001, "EXCLUDED_FILL_IN"),
  ];
  const review: ReviewRow[] = [
    { nativePlayerId: 2, participantId: "g-2a", reason: "AMBIGUOUS", detail: "competing" },
    { nativePlayerId: 3, participantId: "g-3b", reason: "WEAK_ONLY", detail: "1 weak line" },
    // A per-merge refusal on a mapped player is NOT a decision.
    { nativePlayerId: 1, participantId: "g-x", reason: "MERGE_WEAK_EVIDENCE", detail: "" },
  ];
  const base = {
    players,
    links,
    review,
    pendingKeeperIds: [] as number[],
    existingMap: [{ participantId: "g-1", playerId: 1 }],
    historyPlayerIds: new Set([1, 4, 5]),
    privateByGuid: new Map<string, boolean>([["g-3b", true]]),
    mergedAway: new Set<string>(),
  };

  it("lists every review player without a keeper row as a decision, never guessing", () => {
    const plan = planIdentity({ ...base, decisions: new Map() });
    expect(plan.decisionsNeeded.map((d) => [d.nativePlayerId, d.reasons, d.decision])).toEqual([
      [2, ["AMBIGUOUS"], null],
      [3, ["WEAK_ONLY"], null],
    ]);
    expect(plan.undecided).toEqual([2, 3]);
    expect(plan.decisionMapInserts).toEqual([]);
  });

  it("seeds baseline-only players as synthetic entries pinned to their native ids, never a fill-in", () => {
    const plan = planIdentity({ ...base, decisions: new Map() });
    expect(plan.pins).toEqual([
      { playerId: 4, displayName: "Baseline Only", reason: "BASELINE_ONLY" },
      { playerId: 5, displayName: "Old Scorebook", reason: "NO_GUID_WITH_HISTORY" },
    ]);
    expect(plan.pins.every((p) => p.playerId < 90000)).toBe(true);
  });

  it("applies a map decision as a crosswalk row to the native id, and an unmapped one as a pin", () => {
    const decisions = new Map<number, SeedDecision>([
      [2, { kind: "map", participantId: "g-2b" }],
      [3, { kind: "unmapped", note: "different person" }],
    ]);
    const plan = planIdentity({ ...base, decisions });
    expect(plan.errors).toEqual([]);
    expect(plan.undecided).toEqual([]);
    expect(plan.decisionMapInserts).toEqual([
      { nativePlayerId: 2, participantId: "g-2b", playerId: 2 },
    ]);
    expect(plan.pins.map((p) => [p.playerId, p.reason])).toEqual([
      [3, "DECIDED_UNMAPPED"],
      [4, "BASELINE_ONLY"],
      [5, "NO_GUID_WITH_HISTORY"],
    ]);
  });

  it("refuses a map decision to a GUID that isn't the player's candidate, is private, or is taken", () => {
    const bad = (d: SeedDecision, over: Partial<typeof base> = {}) =>
      planIdentity({ ...base, ...over, decisions: new Map([[3, d]]) }).errors;
    expect(bad({ kind: "map", participantId: "g-1" })[0]).toMatch(/isn't one of/);
    expect(bad({ kind: "map", participantId: "g-3b" })[0]).toMatch(/private/);
    expect(
      bad(
        { kind: "map", participantId: "g-3a" },
        { existingMap: [...base.existingMap, { participantId: "g-3a", playerId: 77 }] },
      )[0],
    ).toMatch(/already maps/);
    expect(
      bad({ kind: "map", participantId: "g-3a" }, { mergedAway: new Set(["g-3a"]) })[0],
    ).toMatch(/merged/);
    expect(
      planIdentity({
        ...base,
        decisions: new Map([[99, { kind: "unmapped", note: "" } as SeedDecision]]),
      }).errors[0],
    ).toMatch(/isn't waiting for a decision/);
  });

  it("never pins a player whose keeper row the crosswalk persistence still has to write", () => {
    const plan = planIdentity({
      ...base,
      existingMap: [],
      pendingKeeperIds: [1],
      decisions: new Map(),
    });
    expect(plan.pins.some((p) => p.playerId === 1)).toBe(false);
  });

  it("is idempotent: rows already in place are reported unchanged and nothing is re-written", () => {
    const decisions = new Map<number, SeedDecision>([
      [2, { kind: "map", participantId: "g-2b" }],
      [3, { kind: "unmapped", note: "" }],
    ]);
    const first = planIdentity({ ...base, decisions });
    const after = [
      ...base.existingMap,
      ...first.decisionMapInserts.map((r) => ({
        participantId: r.participantId,
        playerId: r.playerId,
      })),
      ...first.pins.map((p) => ({ participantId: `club:${p.playerId}`, playerId: p.playerId })),
    ];
    // Re-run WITHOUT the decisions file: the pinned row itself records "left unmapped".
    const again = planIdentity({ ...base, existingMap: after, decisions: new Map() });
    expect(again.errors).toEqual([]);
    expect(again.undecided).toEqual([]);
    expect(again.decisionMapInserts).toEqual([]);
    expect(again.pins).toEqual([]);
    expect(again.pinsUnchanged.map((p) => p.playerId)).toEqual([3, 4, 5]);
    // And WITH the same file: the map decision is unchanged, not an error.
    const withFile = planIdentity({ ...base, existingMap: after, decisions });
    expect(withFile.errors).toEqual([]);
    expect(withFile.decisionMapUnchanged).toEqual(first.decisionMapInserts);
  });
});

describe("decisions CSV", () => {
  it("round-trips the needed list into a file Ash fills in", () => {
    const plan = planIdentity({
      players: [player(2, "Amb", "Iguous")],
      links: [link(2, "AMBIGUOUS", [{ participantId: "g-2a", lines: 3, strong: 1 }])],
      review: [{ nativePlayerId: 2, participantId: "g-2a", reason: "AMBIGUOUS", detail: "x" }],
      pendingKeeperIds: [],
      existingMap: [],
      historyPlayerIds: new Set(),
      privateByGuid: new Map(),
      mergedAway: new Set(),
      decisions: new Map(),
    });
    const csv = decisionsCsv(plan.decisionsNeeded, new Map([["g-2a", "A. Iguous"]]));
    expect(csv.split("\r\n")[0]).toBe(
      "native_player_id,native_name,reasons,detail,candidates,decision,participant_id,note",
    );
    expect(csv).toContain("g-2a (A. Iguous) x3");
    const filled = csv.replace(/,,,\r\n$/, ",map,g-2a,checked scorebook\r\n");
    const parsed = parseDecisionsCsv(filled);
    expect(parsed.errors).toEqual([]);
    expect(parsed.decisions.get(2)).toEqual({ kind: "map", participantId: "g-2a" });
  });

  it("reports bad rows with their row number and skips blank decisions", () => {
    const parsed = parseDecisionsCsv(
      [
        "native_player_id,decision,participant_id,note",
        "2,,,",
        "3,unmapped,,not him",
        "x,map,g,",
        "4,map,,",
        "5,maybe,,",
        '6,"unmapped",,"quoted, with comma"',
      ].join("\n"),
    );
    expect(parsed.decisions.get(3)).toEqual({ kind: "unmapped", note: "not him" });
    expect(parsed.decisions.get(6)).toEqual({ kind: "unmapped", note: "quoted, with comma" });
    expect(parsed.decisions.has(2)).toBe(false);
    expect(parsed.errors.map((e) => e.row)).toEqual([4, 5, 6]);
  });
});

// ── Review lists ─────────────────────────────────────────────────────────────

describe("planDifferenceReview (R20, R21, KTD7)", () => {
  it("lists a player whose runs or wickets differ from central — as review rows, never corrections", () => {
    const review = planDifferenceReview({
      pgss: [
        stat({ playerId: 1, season: 2005, runs: 300, wickets: 10 }),
        stat({ playerId: 2, season: 2005, runs: 200, wickets: 4 }),
        stat({ playerId: 1, season: 2001, runs: 999, wickets: 99 }), // pre-boundary: not compared
        stat({ playerId: 1, season: null, runs: 5000 }), // baseline: not compared
      ],
      boundaries: BOUNDARIES,
      seniorGrade,
      guidsByPlayer: new Map([
        [1, ["g-1", "g-1m"]],
        [2, ["g-2"]],
      ]),
      centralBuckets: new Map([
        ["g-1", new Map([["A Grade|2005", { runs: 250, wickets: 6 }]])],
        ["g-1m", new Map([["A Grade|2005", { runs: 40, wickets: 4 }]])], // merged GUID folds in
        ["g-2", new Map([["A Grade|2005", { runs: 200, wickets: 4 }]])],
      ]),
    });
    expect(review.rows).toEqual([
      {
        playerId: 1,
        grade: "A Grade",
        season: 2005,
        nativeRuns: 300,
        centralRuns: 290,
        nativeWickets: 10,
        centralWickets: 10,
        runsDiffer: true,
        wicketsDiffer: false,
      },
    ]);
    expect(review.playersRunsDiffer).toEqual([1]);
    expect(review.playersWicketsDiffer).toEqual([]);
  });

  it("per-match candidates carry the PlayHQ match id and field a correction would key on", () => {
    const line = (over: Partial<NativeLine>): NativeLine => ({
      matchId: 10,
      playerId: 1,
      batted: true,
      battingPos: 3,
      runs: 45,
      balls: null,
      notOut: false,
      bowled: true,
      overs: "4",
      maidens: 0,
      runsConceded: 20,
      wickets: 2,
      catches: 0,
      stumpings: 0,
      runOuts: 0,
      ...over,
    });
    const rows = planMatchDifferences({
      lines: [line({}), line({ matchId: 11, playerId: 90001 }), line({ matchId: 12 })],
      nativeMatches: new Map([
        [10, { season: 2005, grade: "A Grade", abandoned: false }],
        [11, { season: 2005, grade: "A Grade", abandoned: false }],
        [12, { season: 2001, grade: "A Grade", abandoned: false }], // pre-boundary
      ]),
      linkByNativeMatch: new Map([
        [10, 500],
        [11, 501],
        [12, 502],
      ]),
      playhqByCentral: new Map([
        [500, "phq-500"],
        [501, "phq-501"],
        [502, "phq-502"],
      ]),
      appearances: new Map([
        [500, new Map([["g-1", { batted: true, runs: 41, bowled: true, wickets: 2 }]])],
        [501, new Map([["g-9", { batted: true, runs: 1, bowled: false, wickets: 0 }]])],
        [502, new Map([["g-1", { batted: true, runs: 0, bowled: false, wickets: 0 }]])],
      ]),
      guidsByPlayer: new Map([[1, ["g-1"]]]),
      boundaries: BOUNDARIES,
      seniorGrade,
    });
    expect(rows).toEqual([
      {
        playerId: 1,
        nativeMatchId: 10,
        playhqMatchId: "phq-500",
        participantId: "g-1",
        grade: "A Grade",
        season: 2005,
        field: "runs",
        nativeValue: 45,
        centralValue: 41,
      },
    ]);
  });
});

describe("flagBaselineOverlaps (KTD5, for U13)", () => {
  it("flags a baseline whose player has central seasons native never loaded separately, and peeled seasons", () => {
    const flags = flagBaselineOverlaps({
      pgss: [
        stat({ playerId: 1, season: null }),
        stat({ playerId: 1, season: 2004 }),
        stat({ playerId: 2, season: null }),
        stat({ playerId: 2, season: 2003 }),
        stat({ playerId: 3, season: 2005 }), // no baseline → never flagged
      ],
      boundaries: BOUNDARIES,
      seniorGrade,
      guidsByPlayer: new Map([
        [1, ["g-1"]],
        [2, ["g-2"]],
        [3, ["g-3"]],
      ]),
      centralSeasons: new Map([
        ["g-1", new Map([["A Grade", new Set([2003, 2004])]])],
        ["g-2", new Map([["A Grade", new Set([2003])]])],
        ["g-3", new Map([["A Grade", new Set([2003, 2004, 2005])]])],
      ]),
      adjustments: [
        { playerId: 2, grade: "A Grade", season: 2003 },
        { playerId: 2, grade: "A Grade", season: 1999 },
      ],
    });
    expect(flags).toEqual([
      { playerId: 1, grade: "A Grade", flag: "CENTRAL_SEASONS_NOT_IN_NATIVE", seasons: [2003] },
      { playerId: 2, grade: "A Grade", flag: "PEELED_CENTRAL_SEASONS", seasons: [2003] },
    ]);
  });
});

// ── Whole plan ───────────────────────────────────────────────────────────────

describe("planSeed", () => {
  const input = (over: Partial<SeedPlanInput> = {}): SeedPlanInput => ({
    coverage: [
      { grade: "A Grade", season: 2003, lines: 100 },
      { grade: "B Grade", season: 2004, lines: 100 },
    ],
    pgss: [
      stat({ playerId: 1, season: null }),
      stat({ playerId: 1, season: 2001 }),
      stat({ playerId: 4, season: null }),
      stat({ playerId: 90001, season: null }),
    ],
    seniorGrade,
    players: [player(1, "Clean", "Player"), player(4, "Baseline", "Only")],
    links: [link(1, "CLEAN", [{ participantId: "g-1", lines: 9, strong: 3 }]), link(4, "NO_LINES")],
    review: [],
    pendingKeeperIds: [],
    privateByGuid: new Map(),
    decisions: new Map(),
    existing: {
      map: [{ participantId: "g-1", playerId: 1 }],
      mergedAway: new Set(),
      boundaries: [],
      seedBatches: [],
      storeMissing: false,
    },
    ...over,
  });

  it("previews boundary, history, pins and no blockers for a ready tenant", () => {
    const plan = planSeed(input());
    expect(plan.blockers).toEqual([]);
    expect(plan.boundaries.changed).toBe(true);
    expect(plan.history.rows.map((r) => [r.playerId, r.grain, r.season])).toEqual([
      [1, "career", null],
      [1, "season", 2001],
      [4, "career", null],
    ]);
    expect(plan.batch.write).toBe(true);
    expect(plan.identity.pins.map((p) => p.playerId)).toEqual([4]);
  });

  it("re-running after a commit writes nothing (idempotent)", () => {
    const first = planSeed(input());
    const again = planSeed(
      input({
        existing: {
          map: [
            { participantId: "g-1", playerId: 1 },
            { participantId: "club:abc", playerId: 4 },
          ],
          mergedAway: new Set(),
          boundaries: first.boundaries.desired,
          seedBatches: [{ id: 9, label: SEED_LABEL, source: SEED_SOURCE }],
          storeMissing: false,
        },
      }),
    );
    expect(again.blockers).toEqual([]);
    expect(again.boundaries.changed).toBe(false);
    expect(again.batch.write).toBe(false);
    expect(again.batch.existing).toEqual([{ id: 9, label: SEED_LABEL, source: SEED_SOURCE }]);
    expect(again.identity.pins).toEqual([]);
    expect(JSON.parse(seedWriteSet(again))).toEqual({
      boundaries: null,
      maps: [],
      pins: [],
      batchRows: 0,
      peels: [],
    });
  });

  it("asks for a re-seed over a batch an earlier version loaded (baselines not peeled)", () => {
    const plan = planSeed(
      input({
        existing: {
          map: [
            { participantId: "g-1", playerId: 1 },
            { participantId: "club:abc", playerId: 4 },
          ],
          mergedAway: new Set(),
          boundaries: planSeed(input()).boundaries.desired,
          seedBatches: [{ id: 9, label: "old label", source: SEED_SOURCE }],
          storeMissing: false,
        },
      }),
    );
    expect(plan.blockers.join("\n")).toMatch(/earlier version of this seed.*undo batch #9/s);
  });

  it("peels the central-only seasons out of the career baselines it writes", () => {
    const plan = planSeed(
      input({
        centralOnly: {
          guidsByPlayer: new Map([[1, ["g-1"]]]),
          figures: new Map([["g-1", new Map([["A Grade|2017", central({ games: 4, runs: 60 })]])]]),
        },
      }),
    );
    const career = plan.history.rows.find((r) => r.playerId === 1 && r.grain === "career");
    expect(career).toMatchObject({ games: 6, runs: 190 });
    expect(JSON.parse(seedWriteSet(plan)).peels).toEqual(["1|A Grade|4,0,0,60,0,0,0,0,0,0,0,0"]);
  });

  it("blocks commit while decisions are open, keepers are unpersisted, or the store is missing", () => {
    const blocked = planSeed(
      input({
        players: [player(1, "Clean", "Player"), player(2, "Amb", "Iguous")],
        links: [
          link(1, "CLEAN", [{ participantId: "g-1", lines: 9, strong: 3 }]),
          link(2, "AMBIGUOUS", [{ participantId: "g-2", lines: 2 }]),
        ],
        review: [{ nativePlayerId: 2, participantId: "g-2", reason: "AMBIGUOUS", detail: "" }],
        pendingKeeperIds: [7],
        existing: {
          map: [{ participantId: "g-1", playerId: 1 }],
          mergedAway: new Set(),
          boundaries: [],
          seedBatches: [],
          storeMissing: true,
        },
      }),
    );
    expect(blocked.blockers.join("\n")).toMatch(/persist-hh-crosswalk/);
    expect(blocked.blockers.join("\n")).toMatch(/1 player\(s\) still need a decision/);
    expect(blocked.blockers.join("\n")).toMatch(/migrations 0021 and 0022/);
  });

  it("refuses to change boundaries under an existing seed batch", () => {
    const plan = planSeed(
      input({
        existing: {
          map: [
            { participantId: "g-1", playerId: 1 },
            { participantId: "club:abc", playerId: 4 },
          ],
          mergedAway: new Set(),
          boundaries: [{ grade: null, startSeason: 2005 }],
          seedBatches: [{ id: 9, label: SEED_LABEL, source: SEED_SOURCE }],
          storeMissing: false,
        },
      }),
    );
    expect(plan.blockers.join("\n")).toMatch(/undo batch #9/);
  });

  /** A recording fake transaction: every write is logged as [op, table, rows]. */
  function fakeTx(existingMap: Array<{ participantId: string; playerId: number }> = []) {
    const ops: Array<[string, unknown, unknown[]?]> = [];
    const tx = {
      execute: async () => {
        ops.push(["lock", null]);
        return { rows: [] };
      },
      select: () => {
        const b = {
          from: () => b,
          where: () => b,
          then: (ok: (v: unknown) => unknown) => Promise.resolve(existingMap).then(ok),
        };
        return b;
      },
      delete: (table: unknown) => ({
        where: async () => {
          ops.push(["delete", table]);
        },
      }),
      insert: (table: unknown) => ({
        values: (rows: unknown) => {
          const list = Array.isArray(rows) ? rows : [rows];
          ops.push(["insert", table, list]);
          return {
            returning: async () => [{ id: 77 }],
            then: (ok: (v: unknown) => unknown) => Promise.resolve(undefined).then(ok),
          };
        },
      }),
    };
    return { tx: tx as never, ops };
  }

  it("writes boundary, pins and one history batch — in that order, only in the given tx", async () => {
    const plan = planSeed(input());
    const { tx, ops } = fakeTx([{ participantId: "g-1", playerId: 1 }]);
    const res = await writeSeedPlan(tx, 1, plan);
    expect(res).toEqual({
      boundariesReplaced: true,
      mapRows: 0,
      pinned: 1,
      batchId: 77,
      historyRows: 3,
    });
    expect(ops.map(([op, t]) => [op, tableName(t)])).toEqual([
      ["delete", "club_history_boundaries"],
      ["insert", "club_history_boundaries"],
      ["lock", null],
      ["insert", "player_id_map"],
      ["insert", "player_curation"],
      ["insert", "club_history_batches"],
      ["insert", "club_history_rows"],
      ["insert", "club_history_batch_coverage"],
    ]);
    const pinRow = ops[3]![2]![0] as { playerId: number; participantId: string };
    expect(pinRow.playerId).toBe(4);
    expect(pinRow.participantId).toMatch(/^club:/);
    const batch = ops[5]![2]![0] as { source: string; tenantId: number };
    expect(batch).toMatchObject({ source: SEED_SOURCE, tenantId: 1 });
    const rows = ops[6]![2] as Array<{ playerId: number; batchId: number }>;
    expect(rows.every((r) => r.batchId === 77 && r.playerId < 90000)).toBe(true);
  });

  it("an idempotent re-run writes nothing at all", async () => {
    const first = planSeed(input());
    const again = planSeed(
      input({
        existing: {
          map: [
            { participantId: "g-1", playerId: 1 },
            { participantId: "club:abc", playerId: 4 },
          ],
          mergedAway: new Set(),
          boundaries: first.boundaries.desired,
          seedBatches: [{ id: 77, label: SEED_LABEL, source: SEED_SOURCE }],
          storeMissing: false,
        },
      }),
    );
    const { tx, ops } = fakeTx();
    const res = await writeSeedPlan(tx, 1, again);
    expect(ops).toEqual([]);
    expect(res).toEqual({
      boundariesReplaced: false,
      mapRows: 0,
      pinned: 0,
      batchId: null,
      historyRows: 0,
    });
  });

  it("refuses to write a plan with blockers", async () => {
    const plan = planSeed(input({ pendingKeeperIds: [9] }));
    const { tx, ops } = fakeTx();
    await expect(writeSeedPlan(tx, 1, plan)).rejects.toThrow(/blockers/);
    expect(ops).toEqual([]);
  });

  it("records the review decisions on the batch", () => {
    const plan = planSeed(
      input({
        players: [player(1, "Clean", "Player"), player(4, "Baseline", "Only"), player(2, "A", "B")],
        links: [
          link(1, "CLEAN", [{ participantId: "g-1", lines: 9, strong: 3 }]),
          link(4, "NO_LINES"),
          link(2, "AMBIGUOUS", [{ participantId: "g-2", lines: 2, strong: 1 }]),
        ],
        review: [{ nativePlayerId: 2, participantId: "g-2", reason: "AMBIGUOUS", detail: "" }],
        decisions: new Map([[2, { kind: "unmapped", note: "not him" }]]),
      }),
    );
    expect(plan.blockers).toEqual([]);
    expect(decisionNote(plan)).toBe("U4 review decisions: 2=unmapped (not him)");
  });

  it("blocks when a history row's player would have no id in the tenant space", () => {
    const plan = planSeed(
      input({
        links: [link(1, "CLEAN", [{ participantId: "g-1", lines: 9, strong: 3 }])],
        existing: {
          map: [],
          mergedAway: new Set(),
          boundaries: [],
          seedBatches: [],
          storeMissing: false,
        },
        pendingKeeperIds: [1],
      }),
    );
    expect(plan.blockers.join("\n")).toMatch(/no tenant player id/);
  });
});

describe("safety", () => {
  it("the seed never creates corrections, drafts or central writes", () => {
    for (const f of [
      "seed-hh-club-layer.ts",
      "seed-hh-club-layer-core.ts",
      "seed-hh-club-layer-write.ts",
    ]) {
      const src = readFileSync(join(__dirname, f), "utf8");
      expect(src).not.toMatch(/clubCorrectionsTable|club_corrections/);
      expect(src).not.toMatch(/draft-sweep|socialDraftsTable|milestoneEventsTable|runDraftSweep/);
      expect(src).not.toMatch(/centralDb\.(insert|update|delete)/);
    }
  });
});
