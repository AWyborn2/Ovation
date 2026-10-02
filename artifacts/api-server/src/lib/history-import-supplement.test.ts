import { describe, it, expect } from "vitest";
import { isSeniorAppGrade } from "@workspace/db/central-queries";
import { clubHistoryBatchCoverageTable, clubHistoryRowsTable } from "@workspace/db";
import {
  HistoryImportError,
  insertSupplementRows,
  parseHistoryCsv,
  supplementRowProblems,
  type HistoryFigures,
  type PreparedHistoryRow,
} from "./history-import";

/**
 * The explicit SUPPLEMENT path (Halls Head cut-over, Oct 2026): hand-entered
 * seasons kept as club history at or after the boundary. The ordinary import
 * still refuses such rows; only this path writes them, under narrow rules, and
 * without coverage rows. Pure — a recording fake transaction.
 */

const BOUNDARIES = [
  { grade: null, startSeason: 2003 },
  { grade: "B Grade", startSeason: 2004 },
];
const ctx = { boundaries: BOUNDARIES, isSeniorGrade: isSeniorAppGrade };

const figures = (over: Partial<HistoryFigures> = {}): HistoryFigures => ({
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
  ...over,
});

const row = (
  playerId: number,
  grade: string,
  season: number | null,
  over: Partial<PreparedHistoryRow> = {},
): PreparedHistoryRow => ({
  ...figures({ games: 12, runs: 409 }),
  playerId,
  grade,
  season,
  grain: season === null ? "career" : "season",
  ...over,
});

function fakeTx() {
  const inserts: Array<{ table: unknown; rows: unknown[] }> = [];
  const tx = {
    insert: (table: unknown) => ({
      values: async (rows: unknown[]) => {
        inserts.push({ table, rows });
      },
    }),
  };
  return { tx, inserts };
}

describe("supplement rows (the explicit path past the boundary check)", () => {
  it("the ordinary import still refuses a season at or after the boundary", () => {
    const csv = ["player,grade,season,games,runs", "Dan Howell,B Grade,2013/14,12,409"].join("\n");
    const parsed = parseHistoryCsv("season", csv, {
      boundaries: BOUNDARIES,
      existingCoverage: [],
      seniorGrade: (g) => (isSeniorAppGrade(g) ? g : null),
      currentYear: 2026,
    });
    expect(parsed.stats).toEqual([]);
    expect(parsed.errors.map((e) => e.message).join(" ")).toMatch(
      /at or after the B Grade boundary/,
    );
  });

  it("accepts season rows at or after the boundary", () => {
    expect(
      supplementRowProblems(
        [row(10, "B Grade", 2013), row(10, "B Grade", 2004), row(10, "A Grade", 2003)],
        ctx,
      ),
    ).toEqual([]);
  });

  it("refuses what is not a supplement", () => {
    const problems = (r: PreparedHistoryRow[]) => supplementRowProblems(r, ctx).join(" ");
    // Before the boundary: ordinary history.
    expect(problems([row(10, "B Grade", 2003)])).toMatch(/before the B Grade boundary/);
    // Career and match grain.
    expect(problems([row(10, "B Grade", null)])).toMatch(/must be a season row/);
    expect(problems([row(10, "B Grade", 2013, { grain: "match" })])).toMatch(/season row/);
    // Fill-in / cap-only ids never carry stats; juniors never mix in.
    expect(problems([row(90001, "B Grade", 2013)])).toMatch(/not a real player id/);
    expect(problems([row(95001, "B Grade", 2013)])).toMatch(/not a real player id/);
    expect(problems([row(10, "Under 15", 2013)])).toMatch(/not a senior grade/);
    // One row per player, grade and season.
    expect(problems([row(10, "B Grade", 2013), row(10, "B Grade", 2013)])).toMatch(/twice/);
  });

  it("writes the rows and NO coverage (a supplement claims one player's season only)", async () => {
    const { tx, inserts } = fakeTx();
    const res = await insertSupplementRows(
      tx as never,
      1,
      7,
      [row(10, "B Grade", 2013), row(10, "B Grade", 2014, { runs: 182 })],
      ctx,
    );
    expect(res).toEqual({ rows: 2 });
    expect(inserts.filter((i) => i.table === clubHistoryBatchCoverageTable)).toEqual([]);
    const rows = inserts.filter((i) => i.table === clubHistoryRowsTable).flatMap((i) => i.rows);
    expect(rows).toEqual([
      expect.objectContaining({
        tenantId: 1,
        batchId: 7,
        playerId: 10,
        grade: "B Grade",
        season: 2013,
        grain: "season",
        runs: 409,
      }),
      expect.objectContaining({ season: 2014, runs: 182 }),
    ]);
  });

  it("writes nothing at all when any row breaks the rules", async () => {
    const { tx, inserts } = fakeTx();
    await expect(
      insertSupplementRows(
        tx as never,
        1,
        7,
        [row(10, "B Grade", 2013), row(10, "B Grade", 2003)],
        ctx,
      ),
    ).rejects.toBeInstanceOf(HistoryImportError);
    expect(inserts).toEqual([]);
  });
});
