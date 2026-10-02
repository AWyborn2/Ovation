import { describe, expect, it } from "vitest";
import {
  emptyPartialFigures,
  isSeniorAppGrade,
  type CentralMilestone,
  type CentralPartial,
} from "@workspace/db/central-queries";
import {
  applyClubOverlay,
  buildClubIdentity,
  overlayIsActive,
  type ClubOverlay,
  type ClubOverlayData,
  type OverlayHistoryRow,
} from "../../artifacts/api-server/src/lib/club-overlay";
import type { NativeRecordSeasonRow } from "../../artifacts/api-server/src/lib/records-native";
import type { NativeLine } from "./hh-central-crosswalk-core";
import type { CentralData, NativeData } from "./hh-central-crosswalk-read";
import { buildReport, type ReportInput } from "./hh-cutover-preview-report";

/**
 * The cut-over preview end to end, without a database (hybrid stats plan U13):
 * a small Halls Head fixture goes through the API's REAL club overlay
 * (`buildClubIdentity` + `applyClubOverlay`) to make the hybrid side, and
 * through `buildReport` to make every output file. This pins the wiring the
 * unit tests of the pure rules can't: overlay buckets → player ids → reasons →
 * files and summary.
 */

const GA = "guid-a";
const GB = "guid-b";
const A = "A Grade";

const line = (matchId: number, playerId: number, over: Partial<NativeLine> = {}): NativeLine => ({
  matchId,
  playerId,
  batted: true,
  battingPos: 3,
  runs: 20,
  balls: null,
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

const seasonRow = (
  over: Partial<NativeRecordSeasonRow> & Pick<NativeRecordSeasonRow, "id" | "playerId">,
): NativeRecordSeasonRow => ({
  givenName: over.playerId === 1 ? "Alan" : "Bob",
  surname: over.playerId === 1 ? "Able" : "Baker",
  grade: A,
  season: 2010,
  games: 0,
  innings: 0,
  notOuts: 0,
  runs: 0,
  highScore: null,
  fifties: 0,
  hundreds: 0,
  wickets: 0,
  runsConceded: 0,
  bestBowling: null,
  fiveWickets: 0,
  catches: 0,
  stumpings: 0,
  runOuts: 0,
  ...over,
});

const bat = (matchId: number, participantId: string, batOrder: number, runs: number) => ({
  matchId,
  innings: 1,
  batOrder,
  participantId,
  playerName: participantId === GA ? "Alan Able" : "Bob Baker",
  runs,
  balls: null,
  dismissal: "b Someone",
  dismissalType: "bowled",
});

const partial = (
  participantId: string,
  season: number,
  f: Partial<CentralPartial>,
): CentralPartial => ({
  ...emptyPartialFigures(),
  participantId,
  grade: A,
  season,
  ...f,
});

function fixture(): ReportInput {
  // ── Native (what the site shows today) ────────────────────────────────────
  const native: NativeData = {
    players: [
      { id: 1, givenName: "Alan", surname: "Able", isCapOnly: false },
      { id: 2, givenName: "Bob", surname: "Baker", isCapOnly: false },
      { id: 3, givenName: "Cara", surname: "Cole", isCapOnly: false },
    ],
    matches: [
      { id: 1, sourceKey: "phq-1", season: 2010, grade: A, abandoned: false },
      { id: 2, sourceKey: "phq-2", season: 2010, grade: A, abandoned: false },
    ],
    lines: [line(1, 1, { catches: 1 }), line(2, 1), line(2, 2, { battingPos: 4, runs: 30 })],
    pgss: [],
  };
  const seasonRows = [
    // Alan's pre-scorecard A Grade baseline, and the 2010/11 scorecard season.
    seasonRow({
      id: 1,
      playerId: 1,
      season: null,
      games: 20,
      innings: 19,
      runs: 500,
      highScore: "80",
    }),
    seasonRow({ id: 2, playerId: 1, games: 2, innings: 2, runs: 40, catches: 1, highScore: "20" }),
    seasonRow({ id: 3, playerId: 2, games: 1, innings: 1, runs: 30, highScore: "30" }),
  ].sort((x, y) => (x.season ?? Infinity) - (y.season ?? Infinity) || x.id - y.id);

  // ── Central (raw rows for the club) ───────────────────────────────────────
  const central = {
    matches: [
      {
        matchId: 101,
        playhqMatchId: "phq-1",
        season: "Summer 2010/11",
        grade: A,
        matchDate: "2010-10-09",
      },
      {
        matchId: 102,
        playhqMatchId: "phq-2",
        season: "Summer 2010/11",
        grade: A,
        matchDate: "2010-10-16",
      },
      // Central-only: a third 2010/11 match, and a 2003/04 match native never loaded.
      {
        matchId: 103,
        playhqMatchId: "phq-3",
        season: "Summer 2010/11",
        grade: A,
        matchDate: "2010-10-23",
      },
      {
        matchId: 301,
        playhqMatchId: "phq-0",
        season: "Summer 2003/04",
        grade: A,
        matchDate: "2003-10-11",
      },
    ],
    batting: [
      bat(101, GA, 3, 20),
      bat(102, GA, 3, 20),
      bat(102, GB, 4, 30),
      bat(103, GA, 3, 55),
      bat(301, GA, 3, 70),
    ],
    bowling: [],
    rosters: [],
    // Central credits Alan two catches in match 101; native has one.
    fielding: [
      { matchId: 101, participantId: GA, kind: "Caught" },
      { matchId: 101, participantId: GA, kind: "Caught" },
    ],
    players: [
      { participantId: GA, displayName: "Alan Able", isPrivate: 0 },
      { participantId: GB, displayName: "Bob Baker", isPrivate: 0 },
    ],
  } as unknown as CentralData;

  // ── Tenant 1's club overlay, and the hybrid read through the real overlay ──
  const history: OverlayHistoryRow = {
    playerId: 1,
    grade: A,
    season: null,
    grain: "career",
    games: 20,
    innings: 19,
    notOuts: null,
    runs: 500,
    highScore: 80,
    highScoreNotOut: false,
    ballsFaced: null,
    fours: null,
    sixes: null,
    fifties: 2,
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
  };
  const data: ClubOverlayData = {
    boundaries: [{ grade: null, startSeason: 2003 }],
    history: [history],
    corrections: [],
  };
  const overlay: ClubOverlay = {
    identity: buildClubIdentity(
      [
        { participantId: GA, playerId: 1 },
        { participantId: GB, playerId: 2 },
      ],
      { nameByGuid: new Map(), canonicalByGuid: new Map() },
    ),
    data,
    active: overlayIsActive(data),
  };
  const stats = applyClubOverlay({
    // What centralPlayerPartials returns for the raw rows above.
    partials: {
      buckets: [
        partial(GA, 2010, {
          games: 3,
          batLines: 3,
          innings: 3,
          runs: 95,
          highScore: 55,
          catches: 2,
        }),
        partial(GA, 2003, { games: 1, batLines: 1, innings: 1, runs: 70, highScore: 70 }),
        partial(GB, 2010, { games: 1, batLines: 1, innings: 1, runs: 30, highScore: 30 }),
      ],
      players: [
        { participantId: GA, displayName: "Alan Able", isPrivate: false },
        { participantId: GB, displayName: "Bob Baker", isPrivate: false },
      ],
    },
    lines: [],
    identity: overlay.identity,
    data,
    isSeniorGrade: isSeniorAppGrade,
  });
  const hybridMilestones: CentralMilestone[] = [
    {
      kind: "career",
      participantId: GA,
      displayName: "Alan Able",
      grade: A,
      season: 2010,
      matchId: 103,
      matchDate: "2010-10-23",
      opponent: null,
      value: 24,
      boardKey: "games",
      tierIndex: 0,
      threshold: 23,
    },
  ];

  return {
    tenantReadsFromCentral: false,
    warnings: [],
    native,
    gradeStats: [
      {
        playerId: 1,
        grade: A,
        games: 22,
        innings: 21,
        runs: 540,
        wickets: 0,
        catches: 1,
        fifties: 2,
        hundreds: 0,
        highScore: "80",
        bestBowling: null,
      },
      {
        playerId: 2,
        grade: A,
        games: 1,
        innings: 1,
        runs: 30,
        wickets: 0,
        catches: 0,
        fifties: 0,
        hundreds: 0,
        highScore: "30",
        bestBowling: null,
      },
    ],
    seasonRows,
    adjustments: [],
    matchMeta: [
      { id: 1, round: 1, matchDate: "9 Oct 2010" },
      { id: 2, round: 2, matchDate: "16 Oct 2010" },
    ],
    playerTotals: [
      { id: 1, totalGames: 22, totalRuns: 540, totalWickets: 0 },
      { id: 2, totalGames: 1, totalRuns: 30, totalWickets: 0 },
      { id: 3, totalGames: null, totalRuns: null, totalWickets: null },
    ],
    caps: [{ category: "male", capNumber: 1, playerId: 2, name: "Bob Baker" }],
    tierSettings: { gamesTiers: [23], runsTiers: [1000], wicketsTiers: [100] },
    curated: [
      {
        table: "award_winners",
        rowId: 10,
        column: "player_id",
        playerId: 1,
        label: "Alan Able (2010)",
      },
      // Cara has no crosswalk row: her award would point at nobody after cut-over.
      {
        table: "award_winners",
        rowId: 11,
        column: "player_id",
        playerId: 3,
        label: "Cara Cole (2011)",
      },
    ],
    central,
    overlay,
    stats,
    hybridMilestones,
    outDir: "/tmp/hh-cutover-preview-test",
  };
}

/** Parse one of the report's CSVs into objects keyed by header. */
function rows(csv: string): Array<Record<string, string>> {
  const [header, ...body] = csv
    .trim()
    .split("\n")
    .map((l) => l.split(","));
  return body.map((cells) => Object.fromEntries(header!.map((h, i) => [h, cells[i] ?? ""])));
}

describe("buildReport — the whole preview through the real club overlay", () => {
  const report = buildReport(fixture());

  it("writes every report file", () => {
    expect(Object.keys(report.files).sort()).toEqual([
      "baseline-overlaps.csv",
      "careers-diff.csv",
      "catches-samples.csv",
      "curated-resolution.csv",
      "debut-order.csv",
      "milestones-diff.csv",
      "records-diff.csv",
      "summary.json",
      "unlinked-identities.csv",
    ]);
    expect(JSON.parse(report.files["summary.json"]!)).toMatchObject({
      readOnly: true,
      tenantId: 1,
      overlay: { active: true, historyRows: 1 },
    });
  });

  it("diffs the careers and explains every part of the delta", () => {
    const careers = rows(report.files["careers-diff.csv"]!);
    // Bob's career is identical both ways, so only Alan is listed.
    expect(careers.map((r) => [r.scope, r.player_id, r.grade])).toEqual([
      ["player", "1", "ALL"],
      ["grade", "1", A],
    ]);
    expect(careers[1]).toMatchObject({
      name: "Alan Able",
      native_games: "22",
      hybrid_games: "24",
      delta_games: "2",
      native_runs: "540",
      hybrid_runs: "665",
      delta_runs: "125",
      delta_catches: "1",
      native_high_score: "80",
      hybrid_high_score: "80",
      high_score_changed: "0",
      // The 2010/11 extra match, the catches on the shared match, and the
      // 2003/04 season the baseline may already hold — nothing unexplained.
      reasons: "extra_central_match; catches_rule; baseline_overlap",
    });
    const summary = report.summary as unknown as {
      careers: { playersChanged: number; playersByReason: Record<string, number> };
    };
    expect(summary.careers.playersChanged).toBe(1);
    expect(summary.careers.playersByReason).toEqual({
      extra_central_match: 1,
      catches_rule: 1,
      baseline_overlap: 1,
    });
  });

  it("flags the baseline overlap with the double-counted amount (AE6)", () => {
    expect(rows(report.files["baseline-overlaps.csv"]!)).toEqual([
      expect.objectContaining({
        player_id: "1",
        grade: A,
        boundary: "2003",
        kind: "UNCOVERED_CENTRAL_SEASONS",
        seasons: "2003",
        baseline_runs: "500",
        central_runs: "70",
        double_counted_games: "1",
        double_counted_runs: "70",
      }),
    ]);
  });

  it("lists the records, milestones and catches samples that change", () => {
    const records = rows(report.files["records-diff.csv"]!);
    expect(records.filter((r) => r.scope === "all").map((r) => [r.record, r.change])).toEqual([
      ["mostGames", "value"],
      ["mostRuns", "value"],
      ["mostCatches", "value"],
    ]);
    expect(records.find((r) => r.scope === "all" && r.record === "mostRuns")).toMatchObject({
      native_holder: "Alan Able",
      native_value: "540",
      hybrid_holder: "Alan Able",
      hybrid_value: "665",
    });

    expect(rows(report.files["milestones-diff.csv"]!)).toEqual([
      expect.objectContaining({
        player_id: "1",
        board: "games",
        tier: "23",
        status: "appears",
        native_total: "22",
        hybrid_total: "24",
        hybrid_crossed_date: "2010-10-23",
      }),
    ]);

    expect(rows(report.files["catches-samples.csv"]!)).toEqual([
      expect.objectContaining({
        player_id: "1",
        native_match_id: "1",
        central_match_id: "101",
        playhq_match_id: "phq-1",
        native_match_date: "2010-10-09",
        native_catches: "1",
        central_catches: "2",
        differs: "1",
        central_fielding_rows_kind: "Caught x2",
      }),
    ]);
  });

  it("leaves the cap register alone when the debut is the same match (AE7)", () => {
    expect(rows(report.files["debut-order.csv"]!)).toEqual([]);
    expect(report.summary).toMatchObject({ debutOrder: { caps: 1, capNumbersChanged: 0 } });
  });

  it("reports the curated link that would point at a missing player", () => {
    expect(rows(report.files["curated-resolution.csv"]!)).toEqual([
      expect.objectContaining({
        table: "award_winners",
        row_id: "11",
        player_id: "3",
        native_name: "Cara Cole",
        status: "missing",
        blocking: "1",
      }),
    ]);
    expect(report.summary.curated.blocking).toBe(1);
    expect(report.lines.join("\n")).toContain("MUST be zero to cut over");
  });

  it("prints counts per reason code and the biggest deltas", () => {
    const text = report.lines.join("\n");
    expect(text).toContain("extra_central_match");
    expect(text).toContain("Top 25 biggest career deltas");
    expect(text).toMatch(/#1\s+Alan Able\s+games \+2 innings \+2 runs \+125 catches \+1/);
  });
});

describe("buildReport — cap-only players (a cap number, no stats)", () => {
  const input = fixture();
  input.native.players.push({ id: 95001, givenName: "Colin", surname: "Capper", isCapOnly: true });
  input.native.players.push({ id: 90001, givenName: "Fill", surname: "In", isCapOnly: false });
  input.curated.push(
    {
      table: "cap_register",
      rowId: 20,
      column: "player_id",
      playerId: 95001,
      label: "male cap #7 Colin Capper",
    },
    {
      table: "cap_register",
      rowId: 21,
      column: "player_id",
      playerId: 90001,
      label: "male cap #8 Fill In",
    },
  );
  input.overlay = {
    ...input.overlay,
    // The API's own identity, now carrying tenant 1's cap-only native players.
    identity: buildClubIdentity(
      [
        { participantId: GA, playerId: 1 },
        { participantId: GB, playerId: 2 },
      ],
      { nameByGuid: new Map(), canonicalByGuid: new Map() },
      [
        {
          id: 95001,
          surname: "Capper",
          givenName: "Colin",
          gradesPlayed: null,
          totalGames: null,
          totalRuns: null,
          totalWickets: null,
          deceased: false,
          imageUrl: null,
          cardRole: null,
          cardRating: null,
          isFillIn: false,
          isCapOnly: true,
        },
      ],
    ),
  };
  const report = buildReport(input);

  it("a cap that points at a cap-only player resolves to the same player", () => {
    const listed = rows(report.files["curated-resolution.csv"]!).map((r) => [
      r.table,
      r.player_id,
      r.status,
    ]);
    // Only the links that do NOT resolve are listed: Cara's award and the fill-in's cap.
    expect(listed).toEqual([
      ["award_winners", "3", "missing"],
      ["cap_register", "90001", "missing"],
    ]);
    expect(report.summary.curated).toMatchObject({
      links: 4,
      blocking: 2,
      capOnlyPlayers: 1,
      byTable: { cap_register: { same: 1, missing: 1 } },
    });
    expect(report.lines.join("\n")).toMatch(/1 cap-only player link/);
  });

  it("the cap-only player has no career on either side", () => {
    expect(report.files["careers-diff.csv"]).not.toContain("95001");
  });
});
