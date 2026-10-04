import { describe, expect, it } from "vitest";
import {
  SEED_SOURCE,
  SUPPLEMENT_LABEL,
  SUPPLEMENT_SOURCE,
  parseSeedArgs,
  planSeed,
  planSupplementSeasons,
  seedWriteSet,
  supplementCsv,
  type NativeStatRow,
  type SeedPlanInput,
  type SupplementSeedInput,
} from "./seed-hh-club-layer-core";
import { writeSeedPlan } from "./seed-hh-club-layer-write";
import type { NativePlayer, PlayerLink } from "./hh-central-crosswalk-core";

/** The SQL name of a drizzle table (or null). */
const tableName = (t: unknown): string | null =>
  t ? ((t as Record<symbol, string>)[Symbol.for("drizzle:Name")] ?? null) : null;

/**
 * The SUPPLEMENT step of the Halls Head club layer seed (cut-over preview,
 * 1 Oct 2026; owner decision: keep hand-entered seasons as club history).
 *
 * Where native holds a season total for a player, grade and season AT OR AFTER
 * that grade's boundary, with NO native scorecard lines and NO central lines
 * for that player (crosswalk + confirmed merges) in that grade and season, the
 * season is planned as a supplement row in a SECOND history batch. Pure
 * planning only — no database.
 */

const seniorGrade = (raw: string): string | null => {
  const t = raw.trim().toLowerCase();
  if (t === "a grade") return "A Grade";
  if (t === "b grade") return "B Grade";
  return null; // juniors / unknown
};

const stat = (over: Partial<NativeStatRow> & Pick<NativeStatRow, "playerId">): NativeStatRow => ({
  grade: "B Grade",
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
  stumpings: 1,
  runOuts: 2,
  ...over,
});

const BOUNDARIES = [
  { grade: null, startSeason: 2003 },
  { grade: "B Grade", startSeason: 2004 },
];

const DAN = 10; // hand-entered B Grade seasons, GUID g-dan
const RYAN = 11; // B Grade 2017/18: lines and central agree
const PIN = 12; // a pinned player (no GUID)
const MERGED = 14; // Dan's merged-away second id, GUID g-dan-2

/** Dan Howell, B Grade 2013/14–2016/17: 409, 182, 129 and 11 runs, no scorecards. */
const DAN_SEASONS = [
  stat({ playerId: DAN, season: 2013, games: 12, innings: 12, runs: 409, highScore: "77" }),
  stat({ playerId: DAN, season: 2014, games: 9, innings: 9, runs: 182, highScore: "40" }),
  stat({ playerId: DAN, season: 2015, games: 8, innings: 7, runs: 129, highScore: "33" }),
  stat({ playerId: DAN, season: 2016, games: 2, innings: 2, runs: 11, highScore: "9" }),
];

const groups: Record<number, { guids: string[]; playerIds: number[] }> = {
  [DAN]: { guids: ["g-dan", "g-dan-2"], playerIds: [DAN, MERGED] },
  [MERGED]: { guids: ["g-dan", "g-dan-2"], playerIds: [DAN, MERGED] },
  [RYAN]: { guids: ["g-ryan"], playerIds: [RYAN] },
  [PIN]: { guids: [], playerIds: [PIN] },
};

const seasons = (entries: Record<string, Record<string, number[]>>) =>
  new Map(
    Object.entries(entries).map(([guid, byGrade]) => [
      guid,
      new Map(Object.entries(byGrade).map(([grade, ss]) => [grade, new Set(ss)])),
    ]),
  );

const supplementInput = (over: Partial<SupplementSeedInput> = {}): SupplementSeedInput => ({
  lines: [],
  nativeMatches: new Map(),
  groupOf: (playerId) => groups[playerId] ?? { guids: [], playerIds: [playerId] },
  centralSeasons: new Map(),
  existingBatches: [],
  existingRowKeys: new Set(),
  ...over,
});

const plan = (pgss: NativeStatRow[], over: Partial<SupplementSeedInput> = {}) =>
  planSupplementSeasons({
    pgss,
    boundaries: BOUNDARIES,
    seniorGrade,
    inTenantSpace: (id) => [DAN, RYAN, PIN, MERGED].includes(id),
    identityPending: new Set(),
    ...supplementInput(over),
  });

const keys = (p: ReturnType<typeof plan>) =>
  p.rows.map((r) => `${r.playerId}|${r.grade}|${r.season}`);

describe("planSupplementSeasons", () => {
  it("plans a hand-entered season at or after the boundary as a supplement row", () => {
    const p = plan(DAN_SEASONS);
    expect(p.rows.map((r) => [r.playerId, r.grade, r.season, r.grain, r.games, r.runs])).toEqual([
      [DAN, "B Grade", 2013, "season", 12, 409],
      [DAN, "B Grade", 2014, "season", 9, 182],
      [DAN, "B Grade", 2015, "season", 8, 129],
      [DAN, "B Grade", 2016, "season", 2, 11],
    ]);
    // The whole native season line travels: bests and all three fielding columns.
    expect(p.rows[0]).toMatchObject({
      highScore: 77,
      highScoreNotOut: false,
      wickets: 5,
      bestBowlingWickets: 3,
      bestBowlingRuns: 20,
      catches: 4,
      stumpings: 1,
      runOuts: 2,
    });
    expect(p.write).toBe(true);
  });

  it("the boundary season itself counts; a season before it is ordinary history, a baseline never", () => {
    const p = plan([
      stat({ playerId: DAN, season: 2004 }), // B Grade's boundary season
      stat({ playerId: DAN, season: 2003 }), // before it: U12's history
      stat({ playerId: DAN, season: null }), // career baseline
      stat({ playerId: DAN, grade: "A Grade", season: 2003 }), // A Grade's boundary season
    ]);
    expect(keys(p)).toEqual([`${DAN}|A Grade|2003`, `${DAN}|B Grade|2004`]);
    expect(p.skipped.beforeBoundary).toBe(1);
  });

  it("never where native scorecard lines exist for the player in that grade and season", () => {
    const p = plan(DAN_SEASONS, {
      lines: [
        { matchId: 1, playerId: DAN }, // B Grade 2013/14
        { matchId: 2, playerId: MERGED }, // B Grade 2014/15, under the merged-away id
        { matchId: 3, playerId: DAN }, // A Grade 2015/16: another grade
        { matchId: 4, playerId: DAN }, // B Grade 2016/17, abandoned: never counted
        { matchId: 5, playerId: RYAN }, // someone else
      ],
      nativeMatches: new Map([
        [1, { grade: "B Grade", season: 2013, abandoned: false }],
        [2, { grade: "B Grade", season: 2014, abandoned: false }],
        [3, { grade: "A Grade", season: 2015, abandoned: false }],
        [4, { grade: "B Grade", season: 2016, abandoned: true }],
        [5, { grade: "B Grade", season: 2015, abandoned: false }],
      ]),
    });
    expect(keys(p)).toEqual([`${DAN}|B Grade|2015`, `${DAN}|B Grade|2016`]);
    expect(p.skipped.nativeLines).toBe(2);
  });

  it("never where central has the player in that grade and season — crosswalk and merges", () => {
    const p = plan(DAN_SEASONS, {
      centralSeasons: seasons({
        "g-dan": { "B Grade": [2013], "A Grade": [2014] },
        "g-dan-2": { "B Grade": [2015] }, // under the merged-away GUID
        "g-ryan": { "B Grade": [2016] }, // someone else
      }),
    });
    expect(keys(p)).toEqual([`${DAN}|B Grade|2014`, `${DAN}|B Grade|2016`]);
    expect(p.skipped.centralLines).toBe(2);
    // Central has him in ANOTHER grade that season: kept, and noted for review.
    expect(p.details.get(`${DAN}|B Grade|2014`)).toMatchObject({
      centralOtherGrades: ["A Grade"],
    });
  });

  it("the Ryan Burns case (snapshot 0, lines 358, central 358) is never a supplement", () => {
    const p = plan(
      [
        stat({
          playerId: RYAN,
          season: 2017,
          games: 0,
          innings: 0,
          notOuts: 0,
          runs: 0,
          highScore: null,
          fifties: 0,
          wickets: 0,
          runsConceded: 0,
          bestBowling: null,
          catches: 0,
          stumpings: 0,
          runOuts: 0,
        }),
      ],
      {
        lines: [{ matchId: 1, playerId: RYAN }],
        nativeMatches: new Map([[1, { grade: "B Grade", season: 2017, abandoned: false }]]),
        centralSeasons: seasons({ "g-ryan": { "B Grade": [2017] } }),
      },
    );
    expect(p.rows).toEqual([]);
    expect(p.write).toBe(false);
  });

  it("an all-zero season total is not history", () => {
    const zero = stat({
      playerId: DAN,
      season: 2013,
      games: 0,
      innings: 0,
      notOuts: 0,
      runs: 0,
      highScore: null,
      fifties: 0,
      wickets: 0,
      runsConceded: 0,
      bestBowling: null,
      catches: 0,
      stumpings: 0,
      runOuts: 0,
    });
    const p = plan([zero]);
    expect(p.rows).toEqual([]);
    expect(p.skipped.empty).toBe(1);
  });

  it("fill-ins, cap-only ids and junior grades never produce a supplement", () => {
    const p = plan([
      stat({ playerId: 90001, season: 2013 }),
      stat({ playerId: 95001, season: 2013 }),
      stat({ playerId: DAN, grade: "Under 15", season: 2013 }),
    ]);
    expect(p.rows).toEqual([]);
    expect(p.skipped).toMatchObject({ fillIn: 2, nonSeniorGrade: 1 });
  });

  it("a pinned player (no GUID) keeps their hand-entered seasons", () => {
    expect(keys(plan([stat({ playerId: PIN, season: 2013 })]))).toEqual([`${PIN}|B Grade|2013`]);
  });

  it("sums duplicate native rows for one season the way the native career does", () => {
    const p = plan([
      stat({ playerId: DAN, season: 2013, runs: 100, highScore: "60" }),
      stat({ playerId: DAN, season: 2013, runs: 50, highScore: "45*" }),
    ]);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({ runs: 150, games: 20, highScore: 60 });
  });

  it("a player with no tenant player id is reported and blocks the commit — never guessed", () => {
    const p = planSupplementSeasons({
      pgss: [stat({ playerId: 77, season: 2013 }), ...DAN_SEASONS],
      boundaries: BOUNDARIES,
      seniorGrade,
      inTenantSpace: (id) => id === DAN,
      identityPending: new Set(),
      ...supplementInput(),
    });
    expect(p.skipped.noTenantId).toEqual([77]);
    expect(keys(p)).toHaveLength(4);
  });

  it("a player whose crosswalk row this run still has to write waits for the next run", () => {
    const p = planSupplementSeasons({
      pgss: DAN_SEASONS,
      boundaries: BOUNDARIES,
      seniorGrade,
      inTenantSpace: () => true,
      identityPending: new Set([DAN]),
      ...supplementInput(),
    });
    expect(p.rows).toEqual([]);
    expect(p.skipped.identityPending).toEqual([DAN]);
  });

  it("is idempotent: with the supplement batch in place nothing is written again", () => {
    const first = plan(DAN_SEASONS);
    const again = plan(DAN_SEASONS, {
      existingBatches: [{ id: 2, label: SUPPLEMENT_LABEL, source: SUPPLEMENT_SOURCE }],
      existingRowKeys: new Set(keys(first)),
    });
    expect(again.write).toBe(false);
    expect(again.existing.map((b) => b.id)).toEqual([2]);
    expect(again.drift).toEqual({ notSeeded: [], noLongerQualifies: [] });
    expect(keys(again)).toEqual(keys(first));
  });

  it("reports drift against the seeded batch instead of writing a second one", () => {
    const first = plan(DAN_SEASONS);
    const again = plan(DAN_SEASONS, {
      existingBatches: [{ id: 2, label: SUPPLEMENT_LABEL, source: SUPPLEMENT_SOURCE }],
      // 2016/17 was never seeded; 2013/14 was, and central has since gained it.
      existingRowKeys: new Set(keys(first).filter((k) => !k.endsWith("|2016"))),
      centralSeasons: seasons({ "g-dan": { "B Grade": [2013] } }),
    });
    expect(again.write).toBe(false);
    expect(again.drift).toEqual({
      notSeeded: [`${DAN}|B Grade|2016`],
      noLongerQualifies: [`${DAN}|B Grade|2013`],
    });
  });
});

describe("supplementCsv", () => {
  it("lists every supplement season with the player, grade, season and figures", () => {
    const p = plan(DAN_SEASONS, {
      centralSeasons: seasons({ "g-dan": { "A Grade": [2014] } }),
    });
    const csv = supplementCsv(p, (id) => (id === DAN ? "Dan Howell" : ""));
    const [header, ...body] = csv.trim().split(/\r?\n/);
    expect(header).toBe(
      "player_id,name,grade,season,games,innings,not_outs,runs,high_score,fifties,hundreds," +
        "wickets,runs_conceded,best_bowling,five_wickets,catches,stumpings,run_outs," +
        "central_other_grades_same_season,status",
    );
    expect(body).toEqual([
      "10,Dan Howell,B Grade,2013/14,12,12,1,409,77,2,0,5,120,3/20,0,4,1,2,,to seed",
      "10,Dan Howell,B Grade,2014/15,9,9,1,182,40,2,0,5,120,3/20,0,4,1,2,A Grade,to seed",
      "10,Dan Howell,B Grade,2015/16,8,7,1,129,33,2,0,5,120,3/20,0,4,1,2,,to seed",
      "10,Dan Howell,B Grade,2016/17,2,2,1,11,9,2,0,5,120,3/20,0,4,1,2,,to seed",
    ]);
  });
});

// ── The whole seed ───────────────────────────────────────────────────────────

describe("planSeed with the supplement step", () => {
  const player = (id: number, given: string, surname: string): NativePlayer => ({
    id,
    givenName: given,
    surname,
  });
  const link = (nativePlayerId: number, status: PlayerLink["status"]): PlayerLink => ({
    nativePlayerId,
    status,
    participantId: status === "CLEAN" ? "g-dan" : null,
    matchedLines: 0,
    assignedLines: 0,
    totalLines: 0,
    unlinkedMatchLines: 0,
    share: 1,
    candidates: [],
    notes: [],
  });

  /** Halls Head as it is in production: boundaries set, batch 1 seeded. */
  const input = (over: Partial<SeedPlanInput> = {}): SeedPlanInput => ({
    coverage: [
      { grade: "A Grade", season: 2003, lines: 100 },
      { grade: "B Grade", season: 2004, lines: 100 },
    ],
    pgss: [stat({ playerId: DAN, season: null }), ...DAN_SEASONS],
    seniorGrade,
    players: [player(DAN, "Dan", "Howell")],
    links: [link(DAN, "CLEAN")],
    review: [],
    pendingKeeperIds: [],
    privateByGuid: new Map(),
    decisions: new Map(),
    existing: {
      map: [{ participantId: "g-dan", playerId: DAN }],
      mergedAway: new Set(),
      boundaries: BOUNDARIES,
      seedBatches: [{ id: 1, label: "x", source: SEED_SOURCE }],
      storeMissing: false,
    },
    supplement: supplementInput(),
    ...over,
  });

  it("plans the supplement as a second batch and leaves everything else unchanged", () => {
    const p = planSeed(input());
    expect(p.blockers).toEqual([]);
    expect(p.boundaries.changed).toBe(false);
    expect(p.batch.write).toBe(false);
    expect(p.supplement.write).toBe(true);
    expect(p.supplement.rows).toHaveLength(4);
    expect(JSON.parse(seedWriteSet(p))).toEqual({
      boundaries: null,
      maps: [],
      pins: [],
      batchRows: 0,
      supplement: [
        `${DAN}|B Grade|2013`,
        `${DAN}|B Grade|2014`,
        `${DAN}|B Grade|2015`,
        `${DAN}|B Grade|2016`,
      ],
    });
  });

  it("without the supplement input the seed plans exactly what it did before", () => {
    const p = planSeed(input({ supplement: undefined }));
    expect(p.supplement).toMatchObject({ rows: [], write: false });
  });

  it("blocks the commit when a supplement player has no tenant player id", () => {
    const p = planSeed(input({ pgss: [...DAN_SEASONS, stat({ playerId: 77, season: 2013 })] }));
    expect(p.blockers.join("\n")).toMatch(/hand-entered season.*no tenant player id.*77/);
  });

  function fakeTx() {
    const ops: Array<[string, unknown, unknown[]?]> = [];
    let nextId = 76;
    const tx = {
      execute: async () => ({ rows: [] }),
      select: () => {
        const b = {
          from: () => b,
          where: () => b,
          then: (ok: (v: unknown) => unknown) => Promise.resolve([]).then(ok),
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
            returning: async () => [{ id: ++nextId }],
            then: (ok: (v: unknown) => unknown) => Promise.resolve(undefined).then(ok),
          };
        },
      }),
    };
    return { tx: tx as never, ops };
  }

  it("writes ONE more batch — source supplement, the owner's label — its rows, and no coverage", async () => {
    const { tx, ops } = fakeTx();
    const res = await writeSeedPlan(tx, 1, planSeed(input()));
    expect(res).toMatchObject({
      boundariesReplaced: false,
      batchId: null,
      historyRows: 0,
      supplementBatchId: 77,
      supplementRows: 4,
    });
    expect(ops.map(([op, t]) => [op, tableName(t)])).toEqual([
      ["insert", "club_history_batches"],
      ["insert", "club_history_rows"],
    ]);
    expect(ops[0]![2]![0]).toMatchObject({
      tenantId: 1,
      source: "supplement",
      label: "Halls Head hand-entered seasons",
    });
    const rows = ops[1]![2] as Array<{ batchId: number; grain: string; season: number }>;
    expect(rows.map((r) => [r.batchId, r.grain, r.season])).toEqual([
      [77, "season", 2013],
      [77, "season", 2014],
      [77, "season", 2015],
      [77, "season", 2016],
    ]);
  });

  it("a re-run after the commit writes nothing at all", async () => {
    const first = planSeed(input());
    const again = planSeed(
      input({
        supplement: supplementInput({
          existingBatches: [{ id: 77, label: SUPPLEMENT_LABEL, source: SUPPLEMENT_SOURCE }],
          existingRowKeys: new Set(JSON.parse(seedWriteSet(first)).supplement as string[]),
        }),
      }),
    );
    expect(again.supplement.write).toBe(false);
    const { tx, ops } = fakeTx();
    const res = await writeSeedPlan(tx, 1, again);
    expect(ops).toEqual([]);
    expect(res).toMatchObject({ supplementBatchId: null, supplementRows: 0 });
  });

  it("the first seed and the supplement can go in one commit, the main batch first", async () => {
    const fresh = planSeed(
      input({
        existing: {
          map: [{ participantId: "g-dan", playerId: DAN }],
          mergedAway: new Set(),
          boundaries: [],
          seedBatches: [],
          storeMissing: false,
        },
      }),
    );
    expect(fresh.blockers).toEqual([]);
    const { tx, ops } = fakeTx();
    const res = await writeSeedPlan(tx, 1, fresh);
    expect(res).toMatchObject({ batchId: 77, supplementBatchId: 78, supplementRows: 4 });
    const batches = ops.filter(([, t]) => tableName(t) === "club_history_batches");
    expect(batches.map((b) => (b[2]![0] as { source: string }).source)).toEqual([
      SEED_SOURCE,
      SUPPLEMENT_SOURCE,
    ]);
  });
});

describe("--undo accepts the supplement batch", () => {
  it("still parses --undo=<batch> as before", () => {
    expect(parseSeedArgs(["--tenant=1", "--undo=2"])).toMatchObject({ undo: 2 });
  });
});
