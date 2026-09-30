import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HISTORY_TEMPLATES,
  HistoryStoreMissingError,
  buildHistoryPreview,
  historyTemplateCsv,
  loadSeniorGradeNormaliser,
  namesCompatible,
  parseHistoryCsv,
  parseSeasonCell,
  planPlayerLinks,
  toHistoryRow,
  withHistoryStore,
  type HistoryValidationContext,
  type SpanCandidate,
} from "./history-import";

/**
 * Club history import, the pure half (hybrid stats plan U11; R13, R14, R18,
 * AE5, KTD5, KTD8): parsing, validation with row numbers, the preview's
 * career deltas and span suggestions, and the link plan. The DB half (commit,
 * undo, tenant isolation, honours, mint guards) is covered against real
 * Postgres in routes/history-import-isolation.test.ts.
 */

let seniorGrade: HistoryValidationContext["seniorGrade"];
beforeAll(async () => {
  seniorGrade = await loadSeniorGradeNormaliser();
});

const ctx = (over: Partial<HistoryValidationContext> = {}): HistoryValidationContext => ({
  boundaries: [{ grade: null, startSeason: 2003 }],
  existingCoverage: [],
  seniorGrade,
  currentYear: 2026,
  ...over,
});

const J_SMITH: SpanCandidate = {
  playerId: 7,
  participantId: "aaaaaaaa-0000-4000-8000-000000000007",
  displayName: "J Smith",
  kind: "central",
  firstSeason: 2003,
  lastSeason: 2010,
  isPrivate: false,
};

const CAREER_JOHN = [
  "player,grade,first_season,last_season,games,runs,wickets",
  "John Smith,A Grade,1995/96,2002/03,120,3150,86",
].join("\n");

describe("templates", () => {
  it.each(HISTORY_TEMPLATES)("the %s template parses cleanly with its example row", (t) => {
    const parsed = parseHistoryCsv(t, historyTemplateCsv(t), ctx());
    expect(parsed.errors).toEqual([]);
    expect(parsed.stats.length + parsed.honours.length).toBeGreaterThan(0);
  });
});

describe("span players (R14, AE5)", () => {
  it("AE5: an unconfirmed John Smith 1995–2003 stays separate from the central J Smith", () => {
    const parsed = parseHistoryCsv("career", CAREER_JOHN, ctx());
    expect(parsed.errors).toEqual([]);
    const preview = buildHistoryPreview(parsed, {
      boundaries: ctx().boundaries,
      candidates: [J_SMITH],
    });
    const john = preview.players[0]!;
    // Suggested — history ends 2002/03, central starts at the 2003/04 boundary …
    expect(john.suggestions.map((s) => s.playerId)).toEqual([7]);
    expect(john.suggestions[0]!.reason).toMatch(/2002\/03.*2003\/04/);
    // … but with no confirmation it becomes its own pre-digital player.
    const plan = planPlayerLinks(preview, {});
    expect(plan.linked.size).toBe(0);
    expect(plan.newPlayers).toEqual([{ key: "john smith", name: "John Smith" }]);
  });

  it("a confirmed span link joins the rows to the central player's id", () => {
    const parsed = parseHistoryCsv("career", CAREER_JOHN, ctx());
    const preview = buildHistoryPreview(parsed, {
      boundaries: ctx().boundaries,
      candidates: [J_SMITH],
    });
    const plan = planPlayerLinks(preview, { "john smith": 7 });
    expect(plan.errors).toEqual([]);
    expect(plan.linked.get("john smith")).toBe(7);
    expect(plan.newPlayers).toEqual([]);
    const row = toHistoryRow(parsed.stats[0]!, 3, 11, plan.linked.get("john smith")!);
    expect(row).toMatchObject({ tenantId: 3, batchId: 11, playerId: 7, grain: "career" });
  });

  it("refuses a link that isn't one of the player's suggestions", () => {
    const parsed = parseHistoryCsv("career", CAREER_JOHN, ctx());
    const preview = buildHistoryPreview(parsed, {
      boundaries: ctx().boundaries,
      candidates: [J_SMITH],
    });
    expect(planPlayerLinks(preview, { "john smith": 8 }).errors).toHaveLength(1);
    expect(planPlayerLinks(preview, { "nobody here": 7 }).errors).toHaveLength(1);
  });

  it("never suggests a private central player, an incompatible name, or a non-adjacent career", () => {
    const parsed = parseHistoryCsv("career", CAREER_JOHN, ctx());
    const candidates: SpanCandidate[] = [
      { ...J_SMITH, playerId: 1, isPrivate: true },
      { ...J_SMITH, playerId: 2, displayName: "K Smith" },
      { ...J_SMITH, playerId: 3, displayName: "J Smyth" },
      { ...J_SMITH, playerId: 4, firstSeason: 2012 },
    ];
    const preview = buildHistoryPreview(parsed, { boundaries: ctx().boundaries, candidates });
    expect(preview.players[0]!.suggestions).toEqual([]);
  });

  it("offers an earlier import's pre-digital player with a compatible name", () => {
    const parsed = parseHistoryCsv("career", CAREER_JOHN, ctx());
    const earlier: SpanCandidate = {
      ...J_SMITH,
      playerId: 40,
      participantId: "club:0f0e0d0c-0000-4000-8000-000000000040",
      displayName: "John Smith",
      kind: "history",
      firstSeason: 1990,
      lastSeason: 1994,
    };
    const preview = buildHistoryPreview(parsed, {
      boundaries: ctx().boundaries,
      candidates: [earlier, J_SMITH],
    });
    expect(preview.players[0]!.suggestions.map((s) => [s.kind, s.playerId])).toEqual([
      ["central", 7],
      ["history", 40],
    ]);
  });

  it("matches names by surname plus a compatible given name", () => {
    expect(namesCompatible("John Smith", "J Smith")).toBe(true);
    expect(namesCompatible("J. Smith", "John Smith")).toBe(true);
    expect(namesCompatible("Mitch Brown", "Mitchell Brown")).toBe(true);
    expect(namesCompatible("John Smith", "James Smith")).toBe(false);
    expect(namesCompatible("Smith", "J Smith")).toBe(false);
  });
});

describe("validation (row-numbered)", () => {
  it("rejects a row at or after the boundary, reporting its row number", () => {
    const csv = [
      "player,grade,season,runs",
      "Ann Able,A Grade,2001/02,100",
      "Ann Able,A Grade,2003/04,200",
      "Ann Able,B Grade,2003/04,300",
    ].join("\n");
    const parsed = parseHistoryCsv(
      "season",
      csv,
      ctx({
        boundaries: [
          { grade: null, startSeason: 2003 },
          { grade: "B Grade", startSeason: 2004 },
        ],
      }),
    );
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]).toMatchObject({ row: 3, column: "season" });
    expect(parsed.errors[0]!.message).toMatch(/boundary \(2003\/04\)/);
    // The B Grade override lets 2003/04 through (AE1's per-grade boundary).
    expect(parsed.stats.map((r) => r.row)).toEqual([2, 4]);
  });

  it("a career row whose span reaches the boundary is rejected", () => {
    const csv = ["player,grade,first_season,last_season,runs", "Ann Able,A Grade,1999,2003,5"].join(
      "\n",
    );
    const parsed = parseHistoryCsv("career", csv, ctx());
    expect(parsed.errors).toMatchObject([{ row: 2, column: "last_season" }]);
  });

  it("refuses history with no boundary for its grade", () => {
    const parsed = parseHistoryCsv("career", CAREER_JOHN, ctx({ boundaries: [] }));
    expect(parsed.errors).toMatchObject([{ row: 2, column: "grade" }]);
    expect(parsed.errors[0]!.message).toMatch(/No boundary/);
  });

  it("accepts only senior grades (juniors isolation) and normalises aliases", () => {
    const csv = [
      "player,grade,season,runs",
      "Ann Able,Under 15,2001/02,100",
      "Ann Able,a grade,2001/02,100",
      "Ann Able,Ladies T20,2001/02,100",
      "Ann Able,Z Grade,2000/01,100",
    ].join("\n");
    const parsed = parseHistoryCsv("season", csv, ctx());
    expect(parsed.errors.map((e) => [e.row, e.column])).toEqual([
      [2, "grade"],
      [5, "grade"],
    ]);
    expect(parsed.stats.map((r) => r.grade)).toEqual(["A Grade", "Female B Grade"]);
  });

  it("reports bad seasons, numbers and inconsistent figures with row numbers", () => {
    const csv = [
      "player,grade,season,games,innings,not_outs,runs,high_score,overs,best_bowling,wickets",
      "Ann Able,A Grade,1995/97,1,1,0,10,10,,,",
      "Bob Bee,A Grade,1996/97,x,1,0,10,10,,,",
      "Cal Cee,A Grade,1996/97,10,10,11,100,50,,,",
      "Dee Dee,A Grade,1996/97,10,10,1,100,150,,,",
      "Eve Ee,A Grade,1996/97,10,,,,,12.7,,",
      "Fay Eff,A Grade,1996/97,10,,,,,,6/20,4",
      "Gus Gee,A Grade,1996/97,10,10,0,9000,100,,,",
      "Hal Aitch,A Grade,1996/97,,,,,,,,",
    ].join("\n");
    const parsed = parseHistoryCsv("season", csv, ctx());
    const at = (row: number) => parsed.errors.filter((e) => e.row === row).map((e) => e.column);
    expect(at(2)).toEqual(["season"]);
    expect(at(3)).toEqual(["games"]);
    expect(at(4)).toEqual(["not_outs"]);
    expect(at(5)).toEqual(["high_score"]);
    expect(at(6)).toEqual(["overs"]);
    expect(at(7)).toEqual(["best_bowling"]);
    expect(parsed.errors.find((e) => e.row === 8)?.message).toMatch(/more than 5000/);
    expect(parsed.errors.find((e) => e.row === 9)?.message).toMatch(/no figures/);
    expect(parsed.stats).toEqual([]);
  });

  it("reports missing and unknown columns on row 1", () => {
    const parsed = parseHistoryCsv("season", "player,grade,runz\nAnn Able,A Grade,5", ctx());
    expect(parsed.errors).toEqual([
      { row: 1, column: "runz", message: expect.stringMatching(/Unknown column/) },
      { row: 1, column: "season", message: expect.stringMatching(/Missing required column/) },
    ]);
  });

  it("rejects a player's duplicate season row", () => {
    const csv = [
      "player,grade,season,runs",
      "Ann Able,A Grade,2001/02,1",
      "ann  able,A Grade,2001,2",
    ].join("\n");
    const parsed = parseHistoryCsv("season", csv, ctx());
    expect(parsed.errors).toMatchObject([{ row: 3, message: expect.stringMatching(/row 2/) }]);
  });

  it("refuses a (grade, season) another batch already covers; warns for career overlap", () => {
    const existingCoverage = [
      { batchId: 9, label: "Club book", grade: "A Grade", season: 2001 },
      { batchId: 10, label: "Careers", grade: "A Grade", season: null },
    ];
    const seasons = parseHistoryCsv(
      "season",
      "player,grade,season,runs\nAnn Able,A Grade,2001/02,1\nAnn Able,A Grade,2000/01,1",
      ctx({ existingCoverage }),
    );
    expect(seasons.errors).toMatchObject([{ row: 2, message: expect.stringMatching(/batch #9/) }]);
    const careers = parseHistoryCsv("career", CAREER_JOHN, ctx({ existingCoverage }));
    expect(careers.errors).toEqual([]);
    expect(careers.warnings).toMatchObject([{ row: 2, message: expect.stringMatching(/#10/) }]);
  });

  it("checks a match date falls in its season", () => {
    const csv = [
      "player,grade,season,match_date,opponent,runs,not_out,wickets",
      "Ann Able,A Grade,2001/02,2001-11-17,Mandurah,45,Y,5",
      "Ann Able,A Grade,2001/02,2003-01-10,Pinjarra,12,N,",
      "Ann Able,A Grade,2001/02,17/11/2001,Pinjarra,12,N,",
    ].join("\n");
    const parsed = parseHistoryCsv("match", csv, ctx());
    expect(parsed.errors.map((e) => [e.row, e.column])).toEqual([
      [3, "match_date"],
      [4, "match_date"],
    ]);
    expect(parsed.stats[0]).toMatchObject({
      grain: "match",
      season: 2001,
      innings: 1,
      notOuts: 1,
      highScoreNotOut: true,
    });
  });

  it("parses seasons in every accepted form", () => {
    expect(parseSeasonCell("1995", 2026)).toBe(1995);
    expect(parseSeasonCell("1995/96", 2026)).toBe(1995);
    expect(parseSeasonCell("1999-00", 2026)).toBe(1999);
    expect(parseSeasonCell("1995/1996", 2026)).toBe(1995);
    expect(parseSeasonCell("", 2026)).toBeNull();
    expect(parseSeasonCell("1995/97", 2026)).toBe("invalid");
    expect(parseSeasonCell("2030", 2026)).toBe("invalid");
  });
});

describe("preview", () => {
  it("a career-totals-only import produces career numbers and no season rows", () => {
    const parsed = parseHistoryCsv("career", CAREER_JOHN, ctx());
    const preview = buildHistoryPreview(parsed, { boundaries: ctx().boundaries, candidates: [] });
    expect(preview.coverage).toEqual([{ grade: "A Grade", season: null }]);
    expect(preview.players[0]!.delta).toMatchObject({ games: 120, runs: 3150, wickets: 86 });
    const rows = parsed.stats.map((r) => toHistoryRow(r, 1, 1, 5));
    expect(rows.every((r) => r.grain === "career" && r.season === null)).toBe(true);
  });

  it("sums a player's match lines into one career delta", () => {
    const csv = [
      "player,grade,season,match_date,opponent,runs,wickets",
      "Ann Able,A Grade,2001/02,2001-11-17,Mandurah,120,5",
      "Ann Able,A Grade,2001/02,2001-11-24,Pinjarra,60,",
      "Ann Able,B Grade,2002/03,2002-11-24,Pinjarra,,2",
    ].join("\n");
    const parsed = parseHistoryCsv("match", csv, ctx());
    const preview = buildHistoryPreview(parsed, { boundaries: ctx().boundaries, candidates: [] });
    expect(preview.players).toHaveLength(1);
    expect(preview.players[0]).toMatchObject({
      grades: ["A Grade", "B Grade"],
      firstSeason: 2001,
      lastSeason: 2002,
      delta: {
        games: 3,
        innings: 2,
        runs: 180,
        hundreds: 1,
        fifties: 1,
        wickets: 7,
        fiveWickets: 1,
      },
    });
    expect(preview.coverage).toEqual([
      { grade: "A Grade", season: 2001 },
      { grade: "B Grade", season: 2002 },
    ]);
  });

  it("honours link a player only on an exact, unique name", () => {
    const csv = [
      "type,name,title,season,grade,detail",
      "award,J Smith,Club Champion,1999/00,,",
      "century,Nobody Known,,1998/99,A Grade,101",
    ].join("\n");
    const parsed = parseHistoryCsv("honours", csv, ctx());
    expect(parsed.errors).toEqual([]);
    const preview = buildHistoryPreview(parsed, {
      boundaries: ctx().boundaries,
      candidates: [J_SMITH],
    });
    expect(preview.honours.map((h) => h.playerId)).toEqual([7, null]);
  });

  it("validates honours rows: type, award title and season, grade for centuries", () => {
    const csv = [
      "type,name,title,season,grade,detail",
      "trophy,Ann Able,,,,",
      "award,Ann Able,,,,",
      "century,Ann Able,,1999,,104",
      "five_wickets,Ann Able,,1999,Under 16,6/12",
    ].join("\n");
    const parsed = parseHistoryCsv("honours", csv, ctx());
    expect(parsed.errors.map((e) => [e.row, e.column])).toEqual([
      [2, "type"],
      [3, "title"],
      [3, "season"],
      [4, "grade"],
      [5, "grade"],
    ]);
  });
});

describe("store guard", () => {
  it("turns a missing history table into a clear 503 error", async () => {
    const missing = Object.assign(new Error("relation does not exist"), { code: "42P01" });
    const wrapped = Object.assign(new Error("Failed query"), { cause: missing });
    const err = await withHistoryStore(() => Promise.reject(wrapped)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HistoryStoreMissingError);
    expect((err as HistoryStoreMissingError).status).toBe(503);
    expect((err as Error).message).toMatch(/migrations 0021 and 0022/);
  });

  it("passes any other error through", async () => {
    const other = new Error("boom");
    await expect(withHistoryStore(() => Promise.reject(other))).rejects.toBe(other);
  });
});

describe("draft safety (KTD8)", () => {
  it("the import never reaches the Social Studio sweep, drafts or milestone events", () => {
    const src = readFileSync(join(__dirname, "history-import.ts"), "utf8");
    const route = readFileSync(join(__dirname, "..", "routes", "history-import.ts"), "utf8");
    for (const s of [src, route]) {
      expect(s).not.toMatch(/draft-sweep|post-commit-social|social-drafts|draft-upsert/);
      expect(s).not.toMatch(/milestoneEventsTable|socialDraftsTable|runDraftSweep/);
    }
  });
});
