import { parse } from "csv-parse/sync";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  awardsTable,
  awardVotingConfigTable,
  awardWinnersTable,
  centuriesTable,
  clubHistoryBatchCoverageTable,
  clubHistoryBatchesTable,
  clubHistoryBoundariesTable,
  clubHistoryCuratedRowsTable,
  clubHistoryRowsTable,
  clubRecordsTable,
  fiveWicketHaulsTable,
  playerCurationTable,
  playerIdMapTable,
  tenantsTable,
  boundaryFor,
  coverageOf,
  isSyntheticParticipantKey,
  mintSyntheticPlayers,
  MINT_ID_CEILING,
  type ClubHistoryCuratedTarget,
  type ClubHistoryGrain,
  type InsertClubHistoryRow,
} from "@workspace/db";
import { slugify } from "./slug";

/**
 * Concierge club history import (hybrid stats plan U11; R13, R14, R18, AE5;
 * KTD3–KTD5, KTD8).
 *
 * A platform admin loads a club's PRE-DIGITAL history from a CSV in one of four
 * templates — career totals, season totals, match scorecards, honours — and
 * gets a validated preview before anything is written:
 *
 *   - every stats row must be a known SENIOR app grade (the central grade
 *     classifier; junior / pathway grades are refused — juniors isolation),
 *     parse its seasons, carry sane figures, and sit strictly BEFORE the
 *     tenant's boundary for its grade (KTD5: the boundary season and later come
 *     only from central, so a row at or after it would double count);
 *   - the preview lists each imported player's career delta and, for players
 *     whose history ends just before the boundary, SPAN suggestions: a central
 *     player of this club (through the tenant's crosswalk) with a compatible
 *     name whose first central season is adjacent (R14). A suggestion is never
 *     applied on its own — only a link the importer confirms is joined; every
 *     other player becomes a separate pre-digital player (AE5).
 *
 * Commit writes one `club_history_batches` row with its coverage and history
 * rows (KTD4: a new tenant-scoped store; the native stats tables are
 * untouched). A confirmed span link uses the central player's crosswalk id;
 * every other player gets a synthetic crosswalk entry (`club:<uuid>`) minted
 * under the same guards as the central crosswalk (ids < 90000, never the
 * fill-in range). Honours rows go into the EXISTING curated tables — award
 * winners, centuries, five-wicket hauls, club records — so they show on the
 * pages clubs already use, each tagged with the batch (migration 0022).
 *
 * Undo deletes the batch (its rows and coverage cascade), the curated rows it
 * created, and any synthetic player it minted that nothing else references.
 *
 * Draft safety (KTD8): nothing here runs the Social Studio sweep or writes
 * drafts or milestone events. History is the past, never news.
 *
 * The parse / validate / preview half is pure (the caller passes the tenant's
 * boundaries, existing coverage, span candidates and the grade classifier) so
 * U12's Halls Head seed can reuse it without the route.
 */

// ── Templates ──────────────────────────────────────────────────────────────

export const HISTORY_TEMPLATES = ["career", "season", "match", "honours"] as const;
export type HistoryTemplate = (typeof HISTORY_TEMPLATES)[number];

export function isHistoryTemplate(v: unknown): v is HistoryTemplate {
  return typeof v === "string" && (HISTORY_TEMPLATES as readonly string[]).includes(v);
}

export const HONOUR_TYPES = ["award", "century", "five_wickets", "club_record"] as const;
export type HonourType = (typeof HONOUR_TYPES)[number];

/** Figure columns of the career and season templates (all optional). */
const TOTAL_FIGURE_COLUMNS = [
  "games",
  "innings",
  "not_outs",
  "runs",
  "high_score",
  "balls_faced",
  "fours",
  "sixes",
  "fifties",
  "hundreds",
  "overs",
  "balls_bowled",
  "maidens",
  "runs_conceded",
  "wickets",
  "best_bowling",
  "five_wickets",
  "catches",
  "stumpings",
  "run_outs",
] as const;

/** Figure columns of the match template: one player's line in one match. */
const MATCH_FIGURE_COLUMNS = [
  "runs",
  "not_out",
  "balls_faced",
  "fours",
  "sixes",
  "overs",
  "balls_bowled",
  "maidens",
  "runs_conceded",
  "wickets",
  "catches",
  "stumpings",
  "run_outs",
] as const;

export const TEMPLATE_COLUMNS: Record<
  HistoryTemplate,
  { required: readonly string[]; optional: readonly string[] }
> = {
  career: {
    required: ["player", "grade", "first_season", "last_season"],
    optional: TOTAL_FIGURE_COLUMNS,
  },
  season: { required: ["player", "grade", "season"], optional: TOTAL_FIGURE_COLUMNS },
  match: {
    required: ["player", "grade", "season", "match_date", "opponent"],
    optional: ["round", ...MATCH_FIGURE_COLUMNS],
  },
  honours: {
    required: ["type", "name"],
    optional: ["title", "season", "grade", "detail"],
  },
};

const TEMPLATE_EXAMPLES: Record<HistoryTemplate, Array<Record<string, string>>> = {
  career: [
    {
      player: "John Smith",
      grade: "A Grade",
      first_season: "1995/96",
      last_season: "2002/03",
      games: "112",
      innings: "105",
      not_outs: "11",
      runs: "3150",
      high_score: "134*",
      fifties: "18",
      hundreds: "3",
      overs: "410.3",
      maidens: "40",
      runs_conceded: "1480",
      wickets: "86",
      best_bowling: "6/31",
      five_wickets: "2",
      catches: "38",
    },
  ],
  season: [
    {
      player: "John Smith",
      grade: "A Grade",
      season: "2001/02",
      games: "14",
      innings: "14",
      not_outs: "2",
      runs: "512",
      high_score: "101",
      fifties: "3",
      hundreds: "1",
      overs: "80.2",
      maidens: "9",
      runs_conceded: "301",
      wickets: "17",
      best_bowling: "5/22",
      five_wickets: "1",
      catches: "6",
    },
  ],
  match: [
    {
      player: "John Smith",
      grade: "A Grade",
      season: "2001/02",
      match_date: "2001-11-17",
      opponent: "Mandurah",
      round: "6",
      runs: "45",
      not_out: "N",
      balls_faced: "71",
      fours: "5",
      sixes: "1",
      overs: "8.0",
      maidens: "1",
      runs_conceded: "31",
      wickets: "2",
      catches: "1",
    },
  ],
  honours: [
    { type: "award", name: "John Smith", title: "Club Champion", season: "1999/00" },
    { type: "century", name: "John Smith", grade: "A Grade", season: "1998/99", detail: "134*" },
    {
      type: "five_wickets",
      name: "John Smith",
      grade: "A Grade",
      season: "2000/01",
      detail: "6/31",
    },
    {
      type: "club_record",
      name: "John Smith",
      title: "Most A Grade runs in a season",
      grade: "A Grade",
      detail: "812 (1999/00)",
    },
  ],
};

/** CSV-escape one cell. */
function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** A downloadable template: every column, one example row. */
export function historyTemplateCsv(template: HistoryTemplate): string {
  const { required, optional } = TEMPLATE_COLUMNS[template];
  const columns = [...required, ...optional];
  const lines = [columns.join(",")];
  for (const ex of TEMPLATE_EXAMPLES[template]) {
    lines.push(columns.map((c) => csvCell(ex[c] ?? "")).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

// ── Parsed shapes ──────────────────────────────────────────────────────────

/** A problem tied to a spreadsheet row (the header is row 1). */
export interface HistoryRowIssue {
  row: number;
  column?: string;
  message: string;
}

/** A history row's figures — all nullable, as in the store. */
export interface HistoryFigures {
  games: number | null;
  innings: number | null;
  notOuts: number | null;
  runs: number | null;
  highScore: number | null;
  highScoreNotOut: boolean | null;
  ballsFaced: number | null;
  fours: number | null;
  sixes: number | null;
  fifties: number | null;
  hundreds: number | null;
  ballsBowled: number | null;
  maidens: number | null;
  runsConceded: number | null;
  wickets: number | null;
  bestBowlingWickets: number | null;
  bestBowlingRuns: number | null;
  fiveWickets: number | null;
  catches: number | null;
  stumpings: number | null;
  runOuts: number | null;
}

export interface ParsedStatRow extends HistoryFigures {
  row: number;
  /** The player's name as written. */
  name: string;
  /** Normalised name: rows with the same key are one player. */
  playerKey: string;
  grade: string;
  grain: ClubHistoryGrain;
  /** Season start year; null for career grain. */
  season: number | null;
  /** First / last season the row covers (career: its span; else = season). */
  firstSeason: number;
  lastSeason: number;
  matchDate: string | null;
  opponent: string | null;
  round: string | null;
}

export interface ParsedHonourRow {
  row: number;
  type: HonourType;
  name: string;
  playerKey: string;
  title: string | null;
  season: number | null;
  grade: string | null;
  detail: string | null;
}

export interface ParsedHistoryCsv {
  template: HistoryTemplate;
  stats: ParsedStatRow[];
  honours: ParsedHonourRow[];
  errors: HistoryRowIssue[];
  warnings: HistoryRowIssue[];
}

/** What validation needs to know about the tenant (loaded by the caller). */
export interface HistoryValidationContext {
  boundaries: ReadonlyArray<{ grade: string | null; startSeason: number }>;
  /** (grade, season) pairs the tenant's EXISTING batches cover. */
  existingCoverage: ReadonlyArray<{
    batchId: number;
    label: string;
    grade: string;
    season: number | null;
  }>;
  /**
   * The app grade a label normalises to when it is a SENIOR grade, else null
   * (junior, pathway or unknown). Built from the central grade classifier by
   * {@link loadSeniorGradeNormaliser}.
   */
  seniorGrade: (raw: string) => string | null;
  /** Latest season start year accepted (default: this year). */
  currentYear?: number;
}

// ── Cell parsers ───────────────────────────────────────────────────────────

/** "2003" = "2003/04"; the display form. */
export function seasonLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

const EARLIEST_SEASON = 1850;

/**
 * A season cell to its start year: "1995", "1995/96", "1995-96", "1995/1996".
 * Null for an empty cell; "invalid" when it doesn't parse or the two halves
 * aren't consecutive years.
 */
export function parseSeasonCell(raw: string, currentYear: number): number | null | "invalid" {
  const s = raw.trim();
  if (s === "") return null;
  const m = /^(\d{4})(?:\s*[/-]\s*(\d{2}|\d{4}))?$/.exec(s);
  if (!m) return "invalid";
  const start = Number(m[1]);
  if (m[2] !== undefined) {
    const end = Number(m[2]);
    const expected = m[2].length === 2 ? (start + 1) % 100 : start + 1;
    if (end !== expected) return "invalid";
  }
  if (start < EARLIEST_SEASON || start > currentYear) return "invalid";
  return start;
}

/** Lowercase, strip accents and anything that isn't a letter. */
function normToken(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Name tokens, normalised, empties dropped ("J. Smith" -> ["j", "smith"]). */
function nameTokens(name: string): string[] {
  return name
    .split(/[\s.]+/)
    .map(normToken)
    .filter((t) => t.length > 0);
}

/** The key rows of one player share: normalised tokens joined. */
export function playerKeyOf(name: string): string {
  return nameTokens(name).join(" ");
}

/**
 * True when two names can be the same person: the same surname and a
 * compatible first given name — equal, an initial of the other ("J" / "John"),
 * or one a 3+ letter prefix of the other ("Mitch" / "Mitchell"). Both need a
 * given name; a bare surname is never enough.
 */
export function namesCompatible(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length < 2 || tb.length < 2) return false;
  if (ta[ta.length - 1] !== tb[tb.length - 1]) return false;
  const ga = ta[0]!;
  const gb = tb[0]!;
  if (ga === gb) return true;
  if (ga.length === 1) return gb.startsWith(ga);
  if (gb.length === 1) return ga.startsWith(gb);
  return Math.min(ga.length, gb.length) >= 3 && (ga.startsWith(gb) || gb.startsWith(ga));
}

// ── Validation limits ──────────────────────────────────────────────────────

type CountField = Exclude<keyof HistoryFigures, "highScoreNotOut">;

/** Upper bounds that catch a slipped column or a typo, per grain. */
const CAPS: Record<ClubHistoryGrain, Partial<Record<CountField, number>>> = {
  career: {
    games: 1500,
    innings: 3000,
    notOuts: 1500,
    runs: 60000,
    highScore: 500,
    ballsFaced: 200000,
    fours: 10000,
    sixes: 5000,
    fifties: 500,
    hundreds: 300,
    ballsBowled: 300000,
    maidens: 10000,
    runsConceded: 150000,
    wickets: 5000,
    bestBowlingWickets: 10,
    bestBowlingRuns: 500,
    fiveWickets: 500,
    catches: 2000,
    stumpings: 1000,
    runOuts: 1000,
  },
  season: {
    games: 60,
    innings: 120,
    notOuts: 60,
    runs: 5000,
    highScore: 500,
    ballsFaced: 10000,
    fours: 800,
    sixes: 400,
    fifties: 60,
    hundreds: 40,
    ballsBowled: 10000,
    maidens: 600,
    runsConceded: 6000,
    wickets: 300,
    bestBowlingWickets: 10,
    bestBowlingRuns: 500,
    fiveWickets: 60,
    catches: 150,
    stumpings: 100,
    runOuts: 60,
  },
  match: {
    runs: 500,
    ballsFaced: 1000,
    fours: 100,
    sixes: 60,
    ballsBowled: 1200,
    maidens: 200,
    runsConceded: 500,
    wickets: 20,
    catches: 15,
    stumpings: 15,
    runOuts: 15,
  },
};

/** CSV column -> figure field, for the plain whole-number columns. */
const COUNT_COLUMNS: Record<string, CountField> = {
  games: "games",
  innings: "innings",
  not_outs: "notOuts",
  runs: "runs",
  balls_faced: "ballsFaced",
  fours: "fours",
  sixes: "sixes",
  fifties: "fifties",
  hundreds: "hundreds",
  balls_bowled: "ballsBowled",
  maidens: "maidens",
  runs_conceded: "runsConceded",
  wickets: "wickets",
  five_wickets: "fiveWickets",
  catches: "catches",
  stumpings: "stumpings",
  run_outs: "runOuts",
};

function emptyFigures(): HistoryFigures {
  return {
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
  };
}

/** Normalise a header cell: "Not Outs" / "not-outs" -> "not_outs". */
function headerKey(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

const HONOUR_TYPE_ALIASES: Record<string, HonourType> = {
  award: "award",
  century: "century",
  hundred: "century",
  five_wickets: "five_wickets",
  five_wicket_haul: "five_wickets",
  five_for: "five_wickets",
  "5wi": "five_wickets",
  club_record: "club_record",
  record: "club_record",
};

/** Parsed csv records: string cells, row 0 is the header. */
function readCsv(text: string): { records: string[][] } | { error: HistoryRowIssue } {
  try {
    const records = parse(text, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: false,
      trim: true,
    }) as string[][];
    return { records };
  } catch (err) {
    const line = (err as { lines?: unknown }).lines;
    return {
      error: {
        row: typeof line === "number" ? line : 1,
        message: `The file isn't valid CSV: ${(err as Error).message}`,
      },
    };
  }
}

/**
 * Parse and validate a CSV in one template. Pure: the tenant's boundaries,
 * existing coverage and grade classifier come in through `ctx`. Every problem
 * is reported with its spreadsheet row number; rows with errors are dropped
 * from `stats` / `honours`.
 */
export function parseHistoryCsv(
  template: HistoryTemplate,
  text: string,
  ctx: HistoryValidationContext,
): ParsedHistoryCsv {
  const out: ParsedHistoryCsv = { template, stats: [], honours: [], errors: [], warnings: [] };
  const currentYear = ctx.currentYear ?? new Date().getFullYear();
  const read = readCsv(text);
  if ("error" in read) {
    out.errors.push(read.error);
    return out;
  }
  const records = read.records;
  if (records.length === 0 || records[0]!.every((c) => c === "")) {
    out.errors.push({ row: 1, message: "The file is empty: it needs a header row." });
    return out;
  }

  const header = records[0]!.map(headerKey);
  const { required, optional } = TEMPLATE_COLUMNS[template];
  const known = new Set([...required, ...optional]);
  for (const h of header) {
    if (h !== "" && !known.has(h)) {
      out.errors.push({
        row: 1,
        column: h,
        message: `Unknown column "${h}" for the ${template} template.`,
      });
    }
  }
  const missing = required.filter((c) => !header.includes(c));
  for (const c of missing) {
    out.errors.push({ row: 1, column: c, message: `Missing required column "${c}".` });
  }
  const dupHeaders = header.filter((h, i) => h !== "" && header.indexOf(h) !== i);
  for (const h of new Set(dupHeaders)) {
    out.errors.push({ row: 1, column: h, message: `Column "${h}" appears more than once.` });
  }
  if (out.errors.length > 0) return out;

  const col = (cells: string[], name: string): string => {
    const i = header.indexOf(name);
    return i < 0 ? "" : (cells[i] ?? "").trim();
  };

  let dataRows = 0;
  for (let i = 1; i < records.length; i++) {
    const cells = records[i]!;
    if (cells.every((c) => c.trim() === "")) continue;
    dataRows++;
    const row = i + 1;
    const issues: HistoryRowIssue[] = [];
    const err = (column: string | undefined, message: string) =>
      issues.push({ row, column, message });
    if (template === "honours") {
      const parsed = parseHonourRow(row, (n) => col(cells, n), ctx, currentYear, err);
      if (issues.length === 0 && parsed) out.honours.push(parsed);
    } else {
      const parsed = parseStatRow(template, row, (n) => col(cells, n), ctx, currentYear, err);
      if (issues.length === 0 && parsed) out.stats.push(parsed);
    }
    out.errors.push(...issues);
  }
  if (dataRows === 0) {
    out.errors.push({ row: 2, message: "The file has a header but no data rows." });
  }

  checkDuplicates(out);
  checkBoundaries(out, ctx);
  checkCoverageOverlap(out, ctx);
  out.errors.sort((a, b) => a.row - b.row);
  return out;
}

export type ErrFn = (column: string | undefined, message: string) => void;

function parseCount(raw: string, column: string, err: ErrFn): number | null {
  if (raw === "") return null;
  if (!/^\d+$/.test(raw)) {
    err(column, `${column} must be a whole number (got "${raw}").`);
    return null;
  }
  return Number(raw);
}

/** "134*" -> 134 not out; "134" -> 134. */
export function parseHighScore(raw: string, err: ErrFn): { value: number; notOut: boolean } | null {
  if (raw === "") return null;
  const m = /^(\d+)(\*?)$/.exec(raw);
  if (!m) {
    err("high_score", `high_score must look like 134 or 134* (got "${raw}").`);
    return null;
  }
  return { value: Number(m[1]), notOut: m[2] === "*" };
}

/** "123.4" overs -> balls (the part after the dot is balls, 0–5). */
function parseOvers(raw: string, err: ErrFn): number | null {
  if (raw === "") return null;
  const m = /^(\d+)(?:\.(\d))?$/.exec(raw);
  if (!m || Number(m[2] ?? 0) > 5) {
    err("overs", `overs must look like 123 or 123.4, with 0–5 balls after the dot (got "${raw}").`);
    return null;
  }
  return Number(m[1]) * 6 + Number(m[2] ?? 0);
}

/** "6/31" or "6-31" -> 6 wickets for 31. */
export function parseBestBowling(
  raw: string,
  err: ErrFn,
): { wickets: number; runs: number } | null {
  if (raw === "") return null;
  const m = /^(\d{1,2})\s*[/-]\s*(\d{1,3})$/.exec(raw);
  if (!m) {
    err("best_bowling", `best_bowling must look like 6/31 (got "${raw}").`);
    return null;
  }
  return { wickets: Number(m[1]), runs: Number(m[2]) };
}

function parseNotOut(raw: string, err: ErrFn): boolean | null {
  if (raw === "") return null;
  const v = raw.toLowerCase();
  if (["y", "yes", "true", "1", "*"].includes(v)) return true;
  if (["n", "no", "false", "0"].includes(v)) return false;
  err("not_out", `not_out must be Y or N (got "${raw}").`);
  return null;
}

/** True when an ISO date falls in the season (1 July to 30 June). */
function dateInSeason(iso: string, season: number): boolean {
  return iso >= `${season}-07-01` && iso <= `${season + 1}-06-30`;
}

function parseIsoDate(raw: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return null;
  return raw;
}

function parseGrade(
  raw: string,
  ctx: HistoryValidationContext,
  err: ErrFn,
  required: boolean,
): string | null {
  if (raw === "") {
    if (required) err("grade", "grade is required.");
    return null;
  }
  const grade = ctx.seniorGrade(raw);
  if (!grade) {
    err(
      "grade",
      `"${raw}" isn't a senior grade this app knows (junior and pathway grades can't be imported as club history).`,
    );
  }
  return grade;
}

function parseName(raw: string, column: string, err: ErrFn): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name === "") {
    err(column, `${column} is required.`);
    return null;
  }
  if (playerKeyOf(name).replace(/ /g, "").length < 2) {
    err(column, `"${raw}" doesn't look like a name.`);
    return null;
  }
  if (name.length > 120) {
    err(column, `${column} is too long (120 characters at most).`);
    return null;
  }
  return name;
}

function parseStatRow(
  template: Exclude<HistoryTemplate, "honours">,
  row: number,
  get: (column: string) => string,
  ctx: HistoryValidationContext,
  currentYear: number,
  err: ErrFn,
): ParsedStatRow | null {
  const grain: ClubHistoryGrain = template;
  const name = parseName(get("player"), "player", err);
  const grade = parseGrade(get("grade"), ctx, err, true);

  const seasonOf = (column: string): number | null => {
    const raw = get(column);
    const s = parseSeasonCell(raw, currentYear);
    if (s === null) err(column, `${column} is required.`);
    else if (s === "invalid") {
      err(column, `${column} "${raw}" isn't a season (use 1995/96, or 1995 for 1995/96).`);
    } else return s;
    return null;
  };

  let season: number | null = null;
  let firstSeason: number | null;
  let lastSeason: number | null;
  if (grain === "career") {
    firstSeason = seasonOf("first_season");
    lastSeason = seasonOf("last_season");
    if (firstSeason !== null && lastSeason !== null && firstSeason > lastSeason) {
      err("first_season", "first_season is after last_season.");
    }
  } else {
    season = seasonOf("season");
    firstSeason = season;
    lastSeason = season;
  }

  let matchDate: string | null = null;
  let opponent: string | null = null;
  let round: string | null = null;
  if (grain === "match") {
    const rawDate = get("match_date");
    matchDate = parseIsoDate(rawDate);
    if (rawDate === "") err("match_date", "match_date is required.");
    else if (matchDate === null) {
      err("match_date", `match_date must be a date like 2001-11-17 (got "${rawDate}").`);
    } else if (season !== null && !dateInSeason(matchDate, season)) {
      err("match_date", `${matchDate} isn't in the ${seasonLabel(season)} season.`);
    }
    opponent = get("opponent").replace(/\s+/g, " ") || null;
    if (!opponent) err("opponent", "opponent is required.");
    round = get("round") || null;
  }

  const f = emptyFigures();
  for (const [column, field] of Object.entries(COUNT_COLUMNS)) {
    if (!TEMPLATE_COLUMNS[template].optional.includes(column)) continue;
    f[field] = parseCount(get(column), column, err);
  }
  if (grain !== "match") {
    const hs = parseHighScore(get("high_score"), err);
    if (hs) {
      f.highScore = hs.value;
      f.highScoreNotOut = hs.notOut;
    }
    const bb = parseBestBowling(get("best_bowling"), err);
    if (bb) {
      f.bestBowlingWickets = bb.wickets;
      f.bestBowlingRuns = bb.runs;
    }
  } else {
    const notOut = parseNotOut(get("not_out"), err);
    if (f.runs !== null) {
      f.innings = 1;
      f.notOuts = notOut ? 1 : 0;
      f.highScoreNotOut = notOut ?? false;
    } else if (notOut) {
      err("not_out", "not_out is set but runs is empty.");
    }
  }
  const oversBalls = parseOvers(get("overs"), err);
  if (oversBalls !== null) {
    if (f.ballsBowled !== null && f.ballsBowled !== oversBalls) {
      err("overs", "overs and balls_bowled disagree; give one of them.");
    }
    f.ballsBowled = oversBalls;
  }

  checkFigures(grain, f, err);

  if (!name || !grade || firstSeason === null || lastSeason === null) return null;
  return {
    row,
    name,
    playerKey: playerKeyOf(name),
    grade,
    grain,
    season: grain === "career" ? null : season,
    firstSeason,
    lastSeason,
    matchDate,
    opponent,
    round,
    ...f,
  };
}

/** Sanity: caps per grain, and figures that must agree with each other. */
function checkFigures(grain: ClubHistoryGrain, f: HistoryFigures, err: ErrFn): void {
  const caps = CAPS[grain];
  for (const [field, cap] of Object.entries(caps) as [CountField, number][]) {
    const v = f[field];
    if (v !== null && v > cap) {
      err(undefined, `${field} ${v} is more than ${cap}, which can't be right for a ${grain} row.`);
    }
  }
  const has = Object.entries(f).some(([k, v]) => k !== "highScoreNotOut" && v !== null);
  if (!has) err(undefined, "The row has no figures.");
  const gt = (a: number | null, b: number | null) => a !== null && b !== null && a > b;
  if (gt(f.notOuts, f.innings)) err("not_outs", "not_outs is more than innings.");
  if (f.innings !== null && f.games !== null && f.innings > f.games * 2) {
    err("innings", "innings is more than twice games.");
  }
  if (gt(f.highScore, f.runs)) err("high_score", "high_score is more than runs.");
  if (f.fifties !== null && f.hundreds !== null && f.innings !== null) {
    if (f.fifties + f.hundreds > f.innings) {
      err("fifties", "fifties plus hundreds is more than innings.");
    }
  }
  if (gt(f.bestBowlingWickets, f.wickets))
    err("best_bowling", "best_bowling is more than wickets.");
  if (gt(f.fiveWickets, f.games)) err("five_wickets", "five_wickets is more than games.");
  if (f.maidens !== null && f.ballsBowled !== null && f.maidens * 6 > f.ballsBowled) {
    err("maidens", "maidens is more than overs bowled.");
  }
}

/**
 * The import's figure sanity checks (caps per grain, figures that must agree)
 * on already-prepared figures, as messages. For callers that build rows
 * without a CSV — U12's Halls Head native seed reports these as warnings.
 */
export function historyFigureProblems(grain: ClubHistoryGrain, f: HistoryFigures): string[] {
  const out: string[] = [];
  checkFigures(grain, f, (_column, message) => out.push(message));
  return out;
}

function parseHonourRow(
  row: number,
  get: (column: string) => string,
  ctx: HistoryValidationContext,
  currentYear: number,
  err: ErrFn,
): ParsedHonourRow | null {
  const rawType = headerKey(get("type"));
  const type = HONOUR_TYPE_ALIASES[rawType];
  if (!type) {
    err(
      "type",
      rawType === ""
        ? "type is required (award, century, five_wickets or club_record)."
        : `type "${get("type")}" must be award, century, five_wickets or club_record.`,
    );
  }
  const name = parseName(get("name"), "name", err);
  const title = get("title").replace(/\s+/g, " ") || null;
  const detail = get("detail") || null;
  const rawSeason = get("season");
  const s = parseSeasonCell(rawSeason, currentYear);
  const season = s === "invalid" ? null : s;
  if (s === "invalid") err("season", `season "${rawSeason}" isn't a season (use 1995/96).`);
  const grade = parseGrade(get("grade"), ctx, err, type === "century" || type === "five_wickets");

  if (type === "award") {
    if (!title) err("title", "An award needs its title (e.g. Club Champion).");
    if (s === null) err("season", "An award needs its season.");
  }
  if (type === "club_record" && !title) {
    err("title", "A club record needs its title (e.g. Most runs in a season).");
  }
  if (title && title.length > 120) err("title", "title is too long (120 characters at most).");
  if (detail && detail.length > 200) err("detail", "detail is too long (200 characters at most).");

  if (!type || !name) return null;
  return { row, type, name, playerKey: playerKeyOf(name), title, season, grade, detail };
}

function checkDuplicates(out: ParsedHistoryCsv): void {
  const seen = new Map<string, number>();
  const kept: ParsedStatRow[] = [];
  for (const r of out.stats) {
    const key =
      r.grain === "career"
        ? `${r.playerKey}|${r.grade}`
        : r.grain === "season"
          ? `${r.playerKey}|${r.grade}|${r.season}`
          : `${r.playerKey}|${r.grade}|${r.matchDate}`;
    const first = seen.get(key);
    if (first !== undefined) {
      out.errors.push({
        row: r.row,
        message:
          r.grain === "career"
            ? `${r.name} already has a ${r.grade} career row (row ${first}).`
            : r.grain === "season"
              ? `${r.name} already has a ${r.grade} ${seasonLabel(r.season!)} row (row ${first}).`
              : `${r.name} already has a ${r.grade} line on ${r.matchDate} (row ${first}).`,
      });
      continue;
    }
    seen.set(key, r.row);
    kept.push(r);
  }
  out.stats = kept;
}

/** KTD5: history ends strictly before the grade's boundary. */
function checkBoundaries(out: ParsedHistoryCsv, ctx: HistoryValidationContext): void {
  const kept: ParsedStatRow[] = [];
  for (const r of out.stats) {
    const b = boundaryFor(ctx.boundaries, r.grade);
    if (b === null) {
      out.errors.push({
        row: r.row,
        column: "grade",
        message:
          `No boundary is set for ${r.grade} (and no club default), so central may already ` +
          `cover these seasons. Set the club's boundary before importing ${r.grade} history.`,
      });
      continue;
    }
    if (r.lastSeason >= b) {
      out.errors.push({
        row: r.row,
        column: r.grain === "career" ? "last_season" : "season",
        message:
          `${seasonLabel(r.lastSeason)} is at or after the ${r.grade} boundary ` +
          `(${seasonLabel(b)}): central supplies that season, so history must end by ` +
          `${seasonLabel(b - 1)}.`,
      });
      continue;
    }
    kept.push(r);
  }
  out.stats = kept;
}

/**
 * One source per (grade, season): a season or match row for a (grade, season)
 * another batch already covers is refused. Career rows carry no season, so an
 * existing career batch for the grade is a warning (the players may differ).
 */
function checkCoverageOverlap(out: ParsedHistoryCsv, ctx: HistoryValidationContext): void {
  const covered = new Map<string, { batchId: number; label: string }>();
  for (const c of ctx.existingCoverage) {
    covered.set(`${c.grade}|${c.season ?? ""}`, { batchId: c.batchId, label: c.label });
  }
  const kept: ParsedStatRow[] = [];
  const warnedCareer = new Set<string>();
  for (const r of out.stats) {
    const hit = covered.get(`${r.grade}|${r.season ?? ""}`);
    if (hit && r.grain !== "career") {
      out.errors.push({
        row: r.row,
        message:
          `${r.grade} ${seasonLabel(r.season!)} is already covered by batch #${hit.batchId} ` +
          `("${hit.label}"). Undo that batch first, or leave this season out.`,
      });
      continue;
    }
    if (hit && !warnedCareer.has(r.grade)) {
      warnedCareer.add(r.grade);
      out.warnings.push({
        row: r.row,
        message:
          `Batch #${hit.batchId} ("${hit.label}") already holds ${r.grade} career totals. ` +
          `A player in both would be counted twice.`,
      });
    }
    kept.push(r);
  }
  out.stats = kept;
}

// ── Preview ────────────────────────────────────────────────────────────────

/** A player an imported name could be linked to (R14). */
export interface SpanCandidate {
  /** The tenant player id (crosswalk int). */
  playerId: number;
  participantId: string;
  displayName: string | null;
  /** "central": a central player of this club; "history": an earlier import's pre-digital player. */
  kind: "central" | "history";
  firstSeason: number | null;
  lastSeason: number | null;
  isPrivate: boolean;
}

export interface SpanSuggestion {
  playerId: number;
  participantId: string;
  displayName: string | null;
  kind: "central" | "history";
  firstSeason: number | null;
  lastSeason: number | null;
  reason: string;
}

/** What an import adds to one player's career. */
export interface CareerDelta {
  games: number;
  innings: number;
  notOuts: number;
  runs: number;
  highScore: number | null;
  ballsBowled: number;
  runsConceded: number;
  wickets: number;
  fifties: number;
  hundreds: number;
  fiveWickets: number;
  catches: number;
  stumpings: number;
  runOuts: number;
}

export interface PreviewPlayer {
  key: string;
  name: string;
  rows: number[];
  grades: string[];
  firstSeason: number;
  lastSeason: number;
  delta: CareerDelta;
  suggestions: SpanSuggestion[];
}

export interface PreviewHonour {
  row: number;
  type: HonourType;
  name: string;
  title: string | null;
  season: number | null;
  grade: string | null;
  detail: string | null;
  /**
   * The tenant player the honour links to: only when exactly one known player
   * (a central player of the club, or an earlier import's pre-digital player)
   * has exactly this name. Otherwise null — the honour keeps its name unlinked.
   */
  playerId: number | null;
  linkedName: string | null;
}

export interface HistoryImportPreview {
  template: HistoryTemplate;
  rowCount: number;
  errors: HistoryRowIssue[];
  warnings: HistoryRowIssue[];
  coverage: Array<{ grade: string; season: number | null }>;
  players: PreviewPlayer[];
  honours: PreviewHonour[];
}

/** A history last season this close before the boundary counts as spanning it. */
export const SPAN_WINDOW = 3;

function emptyDelta(): CareerDelta {
  return {
    games: 0,
    innings: 0,
    notOuts: 0,
    runs: 0,
    highScore: null,
    ballsBowled: 0,
    runsConceded: 0,
    wickets: 0,
    fifties: 0,
    hundreds: 0,
    fiveWickets: 0,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
  };
}

/** Add one row, deriving match-row defaults exactly as the club overlay does. */
function addToDelta(d: CareerDelta, r: ParsedStatRow): void {
  const match = r.grain === "match";
  const runs = r.runs ?? 0;
  const batted = r.innings !== null ? r.innings > 0 : r.runs !== null;
  const bowled = r.ballsBowled !== null || r.wickets !== null || r.runsConceded !== null;
  d.games += r.games ?? (match ? 1 : 0);
  d.innings += r.innings ?? (match && batted ? 1 : 0);
  d.notOuts += r.notOuts ?? 0;
  d.runs += runs;
  const hs = r.highScore ?? (match && batted ? runs : null);
  if (hs !== null && (d.highScore === null || hs > d.highScore)) d.highScore = hs;
  d.ballsBowled += r.ballsBowled ?? 0;
  d.runsConceded += r.runsConceded ?? 0;
  d.wickets += r.wickets ?? 0;
  d.fifties += r.fifties ?? (match && batted && runs >= 50 && runs < 100 ? 1 : 0);
  d.hundreds += r.hundreds ?? (match && batted && runs >= 100 ? 1 : 0);
  d.fiveWickets += r.fiveWickets ?? (match && bowled && (r.wickets ?? 0) >= 5 ? 1 : 0);
  d.catches += r.catches ?? 0;
  d.stumpings += r.stumpings ?? 0;
  d.runOuts += r.runOuts ?? 0;
}

/**
 * Span suggestions for one imported player (R14): a CENTRAL player whose name
 * is compatible and whose first central season is within {@link SPAN_WINDOW}
 * seasons at or after the boundary, while the history ends within the window
 * before it; or an earlier import's pre-digital player with a compatible name.
 * Private central players are never offered (KTD2). Suggestions only — the
 * importer confirms each link.
 */
export function spanSuggestions(
  player: { name: string; grades: string[]; lastSeason: number },
  candidates: readonly SpanCandidate[],
  boundaries: HistoryValidationContext["boundaries"],
): SpanSuggestion[] {
  const out: SpanSuggestion[] = [];
  const playerBoundaries = player.grades
    .map((g) => boundaryFor(boundaries, g))
    .filter((b): b is number => b !== null);
  for (const c of candidates) {
    if (c.isPrivate || !c.displayName || !namesCompatible(player.name, c.displayName)) continue;
    if (c.kind === "history") {
      out.push({
        ...pickSuggestion(c),
        reason: `Same name as a pre-digital player already imported ("${c.displayName}").`,
      });
      continue;
    }
    if (c.firstSeason === null) continue;
    const b = playerBoundaries.find(
      (bd) =>
        player.lastSeason < bd &&
        bd - player.lastSeason <= SPAN_WINDOW &&
        c.firstSeason! >= bd &&
        c.firstSeason! - bd < SPAN_WINDOW,
    );
    if (b === undefined) continue;
    out.push({
      ...pickSuggestion(c),
      reason:
        `Name matches "${c.displayName}"; history ends ${seasonLabel(player.lastSeason)}, ` +
        `central starts ${seasonLabel(c.firstSeason)} (boundary ${seasonLabel(b)}).`,
    });
  }
  return out.sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "central" ? -1 : 1) ||
      (a.firstSeason ?? 0) - (b.firstSeason ?? 0),
  );
}

function pickSuggestion(c: SpanCandidate): Omit<SpanSuggestion, "reason"> {
  return {
    playerId: c.playerId,
    participantId: c.participantId,
    displayName: c.displayName,
    kind: c.kind,
    firstSeason: c.firstSeason,
    lastSeason: c.lastSeason,
  };
}

/** Build the preview from a parsed file and the tenant's span candidates. Pure. */
export function buildHistoryPreview(
  parsed: ParsedHistoryCsv,
  ctx: {
    boundaries: HistoryValidationContext["boundaries"];
    candidates: readonly SpanCandidate[];
  },
): HistoryImportPreview {
  const players = new Map<string, PreviewPlayer>();
  for (const r of parsed.stats) {
    let p = players.get(r.playerKey);
    if (!p) {
      p = {
        key: r.playerKey,
        name: r.name,
        rows: [],
        grades: [],
        firstSeason: r.firstSeason,
        lastSeason: r.lastSeason,
        delta: emptyDelta(),
        suggestions: [],
      };
      players.set(r.playerKey, p);
    }
    p.rows.push(r.row);
    if (!p.grades.includes(r.grade)) p.grades.push(r.grade);
    p.firstSeason = Math.min(p.firstSeason, r.firstSeason);
    p.lastSeason = Math.max(p.lastSeason, r.lastSeason);
    addToDelta(p.delta, r);
  }
  for (const p of players.values()) {
    p.grades.sort();
    p.suggestions = spanSuggestions(p, ctx.candidates, ctx.boundaries);
  }
  return {
    template: parsed.template,
    rowCount: parsed.stats.length + parsed.honours.length,
    errors: parsed.errors,
    warnings: parsed.warnings,
    coverage: coverageOf(parsed.stats),
    players: [...players.values()].sort((a, b) => a.name.localeCompare(b.name)),
    honours: parsed.honours.map((h) => {
      const exact = ctx.candidates.filter(
        (c) => !c.isPrivate && c.displayName && playerKeyOf(c.displayName) === h.playerKey,
      );
      const only = exact.length === 1 ? exact[0]! : null;
      return {
        row: h.row,
        type: h.type,
        name: h.name,
        title: h.title,
        season: h.season,
        grade: h.grade,
        detail: h.detail,
        playerId: only?.playerId ?? null,
        linkedName: only?.displayName ?? null,
      };
    }),
  };
}

/**
 * Check the importer's confirmed links against the preview (R14): each must
 * name an imported player and one of THAT player's suggestions. Returns the
 * accepted links and the players that become new pre-digital players.
 */
export function planPlayerLinks(
  preview: HistoryImportPreview,
  links: Readonly<Record<string, number>>,
): {
  errors: string[];
  linked: Map<string, number>;
  newPlayers: Array<{ key: string; name: string }>;
} {
  const errors: string[] = [];
  const linked = new Map<string, number>();
  const byKey = new Map(preview.players.map((p) => [p.key, p]));
  for (const [key, playerId] of Object.entries(links)) {
    const p = byKey.get(key);
    if (!p) {
      errors.push(`"${key}" isn't a player in this file.`);
      continue;
    }
    if (!p.suggestions.some((s) => s.playerId === playerId)) {
      errors.push(`${p.name} can only be linked to one of the suggested players.`);
      continue;
    }
    linked.set(key, playerId);
  }
  const newPlayers = preview.players
    .filter((p) => !linked.has(p.key))
    .map((p) => ({ key: p.key, name: p.name }));
  return { errors, linked, newPlayers };
}

/** A parsed stats row as a store row for one batch. */
export function toHistoryRow(
  r: ParsedStatRow,
  tenantId: number,
  batchId: number,
  playerId: number,
): InsertClubHistoryRow {
  return {
    tenantId,
    batchId,
    playerId,
    grade: r.grade,
    season: r.grain === "career" ? null : r.season,
    grain: r.grain,
    matchDate: r.matchDate,
    opponent: r.opponent,
    round: r.round,
    games: r.games,
    innings: r.innings,
    notOuts: r.notOuts,
    runs: r.runs,
    highScore: r.highScore,
    highScoreNotOut: r.highScoreNotOut,
    ballsFaced: r.ballsFaced,
    fours: r.fours,
    sixes: r.sixes,
    fifties: r.fifties,
    hundreds: r.hundreds,
    ballsBowled: r.ballsBowled,
    maidens: r.maidens,
    runsConceded: r.runsConceded,
    wickets: r.wickets,
    bestBowlingWickets: r.bestBowlingWickets,
    bestBowlingRuns: r.bestBowlingRuns,
    fiveWickets: r.fiveWickets,
    catches: r.catches,
    stumpings: r.stumpings,
    runOuts: r.runOuts,
  };
}

/**
 * A history row whose player is already resolved to a tenant player id — what
 * a CSV row becomes after linking, and what U12's native seed builds directly.
 */
export interface PreparedHistoryRow extends HistoryFigures {
  playerId: number;
  grade: string;
  grain: ClubHistoryGrain;
  /** Season start year; null for career grain. */
  season: number | null;
  matchDate?: string | null;
  opponent?: string | null;
  round?: string | null;
}

type Inserter = Pick<typeof db, "insert">;

/** Insert one batch row (inside the caller's transaction) and return its id. */
export async function insertHistoryBatch(
  tx: Inserter,
  batch: {
    tenantId: number;
    source: string;
    label: string;
    note?: string | null;
    createdBy: string | null;
  },
): Promise<number> {
  const [row] = await tx
    .insert(clubHistoryBatchesTable)
    .values({
      tenantId: batch.tenantId,
      source: batch.source,
      label: batch.label,
      note: batch.note ?? null,
      createdBy: batch.createdBy,
    })
    .returning({ id: clubHistoryBatchesTable.id });
  return row!.id;
}

/**
 * Write a batch's history rows (500 per statement) and its coverage, inside
 * the caller's transaction. Shared by the CSV commit and U12's native seed so
 * both produce identical store rows; undo is {@link undoHistoryBatch}.
 */
export async function insertHistoryRows(
  tx: Inserter,
  tenantId: number,
  batchId: number,
  prepared: readonly PreparedHistoryRow[],
  opts: { coverage?: boolean } = {},
): Promise<{ rows: number; coverage: Array<{ grade: string; season: number | null }> }> {
  const rows: InsertClubHistoryRow[] = prepared.map((r) => ({
    tenantId,
    batchId,
    playerId: r.playerId,
    grade: r.grade,
    season: r.grain === "career" ? null : r.season,
    grain: r.grain,
    matchDate: r.matchDate ?? null,
    opponent: r.opponent ?? null,
    round: r.round ?? null,
    games: r.games,
    innings: r.innings,
    notOuts: r.notOuts,
    runs: r.runs,
    highScore: r.highScore,
    highScoreNotOut: r.highScoreNotOut,
    ballsFaced: r.ballsFaced,
    fours: r.fours,
    sixes: r.sixes,
    fifties: r.fifties,
    hundreds: r.hundreds,
    ballsBowled: r.ballsBowled,
    maidens: r.maidens,
    runsConceded: r.runsConceded,
    wickets: r.wickets,
    bestBowlingWickets: r.bestBowlingWickets,
    bestBowlingRuns: r.bestBowlingRuns,
    fiveWickets: r.fiveWickets,
    catches: r.catches,
    stumpings: r.stumpings,
    runOuts: r.runOuts,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await tx.insert(clubHistoryRowsTable).values(rows.slice(i, i + 500));
  }
  const coverage =
    opts.coverage === false
      ? []
      : coverageOf(prepared.map((r) => ({ grade: r.grade, season: r.season })));
  if (coverage.length > 0) {
    await tx
      .insert(clubHistoryBatchCoverageTable)
      .values(coverage.map((c) => ({ tenantId, batchId, ...c })));
  }
  return { rows: rows.length, coverage };
}

// ── Supplement seasons (the explicit path past the boundary check) ─────────

/**
 * What is wrong with a set of SUPPLEMENT rows (hand-entered seasons kept at or
 * after the boundary — see `CLUB_HISTORY_SUPPLEMENT_SOURCE`). Empty = fine.
 *
 * The ordinary import refuses every row at or after the boundary
 * (`checkBoundaries`), and that stays. A supplement is the deliberate
 * exception, so its own rules are narrow: season grain only, a senior grade, a
 * real player id (never a fill-in / cap-only id), a season AT OR AFTER the
 * grade's boundary (a season before it is ordinary history and belongs in an
 * ordinary batch), and one row per (player, grade, season). Whether central
 * has the player's season is decided on READ by the club overlay, which
 * ignores and reports a supplement central supplies — so a supplement can
 * never double count, even if central gains the season later.
 */
export function supplementRowProblems(
  rows: readonly PreparedHistoryRow[],
  ctx: {
    boundaries: ReadonlyArray<{ grade: string | null; startSeason: number }>;
    isSeniorGrade: (grade: string) => boolean;
  },
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const at = `player ${r.playerId}, ${r.grade}, ${r.season === null ? "no season" : seasonLabel(r.season)}`;
    if (r.grain !== "season" || r.season === null) {
      problems.push(`${at}: a supplement row must be a season row.`);
      continue;
    }
    if (!Number.isInteger(r.playerId) || r.playerId <= 0 || r.playerId >= MINT_ID_CEILING) {
      problems.push(`${at}: not a real player id (fill-in / cap-only ids never carry stats).`);
    }
    if (!ctx.isSeniorGrade(r.grade)) problems.push(`${at}: not a senior grade.`);
    const b = boundaryFor(ctx.boundaries, r.grade);
    if (b !== null && r.season < b) {
      problems.push(
        `${at}: before the ${r.grade} boundary (${seasonLabel(b)}) — that is ordinary club ` +
          "history, not a supplement.",
      );
    }
    const key = `${r.playerId}|${r.grade}|${r.season}`;
    if (seen.has(key)) problems.push(`${at}: listed twice.`);
    seen.add(key);
  }
  return problems;
}

/**
 * Write a SUPPLEMENT batch's rows inside the caller's transaction. The batch
 * itself must have been inserted with `source: CLUB_HISTORY_SUPPLEMENT_SOURCE`
 * — that is what the overlay reads. No coverage rows are written: a supplement
 * claims one player's season, not the whole (grade, season), so it must never
 * block a later import for other players. Throws (400) and writes nothing when
 * a row breaks the supplement rules. Undo is {@link undoHistoryBatch}.
 */
export async function insertSupplementRows(
  tx: Inserter,
  tenantId: number,
  batchId: number,
  prepared: readonly PreparedHistoryRow[],
  ctx: Parameters<typeof supplementRowProblems>[1],
): Promise<{ rows: number }> {
  const problems = supplementRowProblems(prepared, ctx);
  if (problems.length > 0) {
    throw new HistoryImportError(
      400,
      `Supplement rows refused: ${problems.slice(0, 5).join(" ")}` +
        `${problems.length > 5 ? ` (+${problems.length - 5} more)` : ""}`,
    );
  }
  const { rows } = await insertHistoryRows(tx, tenantId, batchId, prepared, { coverage: false });
  return { rows };
}

// ── Errors ─────────────────────────────────────────────────────────────────

/** An import request the route answers with `status` (and the preview, when there is one). */
export class HistoryImportError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly preview?: HistoryImportPreview,
  ) {
    super(message);
    this.name = "HistoryImportError";
  }
}

/** The club history tables (migrations 0021 / 0022) aren't in this database yet. */
export class HistoryStoreMissingError extends HistoryImportError {
  constructor() {
    super(
      503,
      "The club history tables aren't in this database yet: apply migrations 0021 and 0022 " +
        "before importing history.",
    );
    this.name = "HistoryStoreMissingError";
  }
}

const UNDEFINED_TABLE = "42P01";

/** True when `err` (or a cause in its chain) is Postgres undefined_table. */
export function isUndefinedTable(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && i < 5; i++) {
    if ((e as { code?: unknown }).code === UNDEFINED_TABLE) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/** Run a store operation, turning a missing table into {@link HistoryStoreMissingError}. */
export async function withHistoryStore<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUndefinedTable(err)) throw new HistoryStoreMissingError();
    throw err;
  }
}

// ── Loading the tenant context ─────────────────────────────────────────────

/**
 * The senior-grade normaliser from the central grade classifier: the app grade
 * a label maps to ("a grade" -> "A Grade", "Ladies T20" -> "Female B Grade"),
 * or null for junior / pathway / unknown labels. Loaded lazily, like every
 * central module, so the API boots without CENTRAL_DATABASE_URL.
 */
export async function loadSeniorGradeNormaliser(): Promise<(raw: string) => string | null> {
  const { appGradeFromCentral, isSeniorAppGrade } = await import("@workspace/db/central-queries");
  return (raw: string) => {
    const trimmed = raw.trim();
    const grade = isSeniorAppGrade(trimmed) ? trimmed : appGradeFromCentral(trimmed);
    return grade && isSeniorAppGrade(grade) ? grade : null;
  };
}

export interface HistoryImportContext extends HistoryValidationContext {
  tenantId: number;
  candidates: SpanCandidate[];
  /** Set when central couldn't be read: the preview has no central span suggestions. */
  centralUnavailable: string | null;
}

/** The tenant's boundaries (store must exist). */
export async function loadBoundaries(
  tenantId: number,
): Promise<Array<{ grade: string | null; startSeason: number }>> {
  return withHistoryStore(() =>
    db
      .select({
        grade: clubHistoryBoundariesTable.grade,
        startSeason: clubHistoryBoundariesTable.startSeason,
      })
      .from(clubHistoryBoundariesTable)
      .where(eq(clubHistoryBoundariesTable.tenantId, tenantId)),
  );
}

/** Pre-digital players earlier imports minted for this tenant, with their history seasons. */
async function loadHistoryCandidates(tenantId: number): Promise<SpanCandidate[]> {
  const rows = await db
    .select({
      participantId: playerIdMapTable.participantId,
      playerId: playerIdMapTable.playerId,
      displayName: playerCurationTable.overrideDisplayName,
    })
    .from(playerIdMapTable)
    .leftJoin(
      playerCurationTable,
      and(
        eq(playerCurationTable.tenantId, playerIdMapTable.tenantId),
        eq(playerCurationTable.participantId, playerIdMapTable.participantId),
      ),
    )
    .where(
      and(
        eq(playerIdMapTable.tenantId, tenantId),
        sql`${playerIdMapTable.participantId} LIKE 'club:%'`,
      ),
    );
  if (rows.length === 0) return [];
  const spans = await db
    .select({
      playerId: clubHistoryRowsTable.playerId,
      first: sql<number | null>`min(${clubHistoryRowsTable.season})`,
      last: sql<number | null>`max(${clubHistoryRowsTable.season})`,
    })
    .from(clubHistoryRowsTable)
    .where(
      and(
        eq(clubHistoryRowsTable.tenantId, tenantId),
        inArray(
          clubHistoryRowsTable.playerId,
          rows.map((r) => r.playerId),
        ),
      ),
    )
    .groupBy(clubHistoryRowsTable.playerId);
  const spanById = new Map(spans.map((s) => [s.playerId, s]));
  return rows.map((r) => ({
    playerId: r.playerId,
    participantId: r.participantId,
    displayName: r.displayName,
    kind: "history" as const,
    firstSeason: spanById.get(r.playerId)?.first ?? null,
    lastSeason: spanById.get(r.playerId)?.last ?? null,
    isPrivate: false,
  }));
}

/**
 * The club's central players as span candidates: each keeper (confirmed
 * merges folded) with its tenant player id, name, privacy and first / last
 * senior central season. Read through the same club-cached partials the club
 * overlay uses; never writes central.
 */
async function loadCentralCandidates(
  tenantId: number,
  centralClubId: number,
): Promise<SpanCandidate[]> {
  const [{ loadClubIdentity }, central] = await Promise.all([
    import("./club-overlay"),
    import("@workspace/db/central-queries"),
  ]);
  const identity = await loadClubIdentity(tenantId);
  const partials = await central.centralPlayerPartials(centralClubId, identity.merges);
  const span = new Map<string, { first: number; last: number }>();
  for (const b of partials.buckets) {
    if (b.season === null) continue;
    const s = span.get(b.participantId);
    if (!s) span.set(b.participantId, { first: b.season, last: b.season });
    else {
      s.first = Math.min(s.first, b.season);
      s.last = Math.max(s.last, b.season);
    }
  }
  const out: SpanCandidate[] = [];
  for (const p of partials.players) {
    const playerId = identity.intByGuid.get(p.participantId);
    if (playerId === undefined || playerId >= MINT_ID_CEILING) continue;
    const s = span.get(p.participantId);
    out.push({
      playerId,
      participantId: p.participantId,
      displayName: identity.nameFor(p.participantId, p.displayName),
      kind: "central",
      firstSeason: s?.first ?? null,
      lastSeason: s?.last ?? null,
      isPrivate: p.isPrivate,
    });
  }
  return out;
}

/** Everything validation and the preview need for one tenant. */
export async function loadHistoryImportContext(tenantId: number): Promise<HistoryImportContext> {
  const [tenant] = await db
    .select({ id: tenantsTable.id, centralClubId: tenantsTable.centralClubId })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant) throw new HistoryImportError(404, "No such tenant");

  const [boundaries, existingCoverage, historyCandidates, seniorGrade] = await withHistoryStore(
    () =>
      Promise.all([
        loadBoundaries(tenantId),
        db
          .select({
            batchId: clubHistoryBatchCoverageTable.batchId,
            label: clubHistoryBatchesTable.label,
            grade: clubHistoryBatchCoverageTable.grade,
            season: clubHistoryBatchCoverageTable.season,
          })
          .from(clubHistoryBatchCoverageTable)
          .innerJoin(
            clubHistoryBatchesTable,
            eq(clubHistoryBatchesTable.id, clubHistoryBatchCoverageTable.batchId),
          )
          .where(eq(clubHistoryBatchCoverageTable.tenantId, tenantId)),
        loadHistoryCandidates(tenantId),
        loadSeniorGradeNormaliser(),
        // 0022 must be there too, or commit / undo would fail half way.
        db
          .select({ id: clubHistoryCuratedRowsTable.id })
          .from(clubHistoryCuratedRowsTable)
          .limit(1),
      ]),
  );

  let centralCandidates: SpanCandidate[] = [];
  let centralUnavailable: string | null = null;
  try {
    centralCandidates = await loadCentralCandidates(tenantId, tenant.centralClubId);
  } catch (err) {
    centralUnavailable = err instanceof Error ? err.message : String(err);
  }

  return {
    tenantId,
    boundaries,
    existingCoverage,
    seniorGrade,
    candidates: [...centralCandidates, ...historyCandidates],
    centralUnavailable,
  };
}

/** Parse, validate and preview a file for a tenant. Writes nothing. */
export async function previewHistoryImport(
  tenantId: number,
  template: HistoryTemplate,
  csv: string,
): Promise<HistoryImportPreview> {
  const ctx = await loadHistoryImportContext(tenantId);
  return previewWithContext(template, csv, ctx);
}

function previewWithContext(
  template: HistoryTemplate,
  csv: string,
  ctx: HistoryImportContext,
): HistoryImportPreview {
  const parsed = parseHistoryCsv(template, csv, ctx);
  const preview = buildHistoryPreview(parsed, ctx);
  if (ctx.centralUnavailable && preview.players.length > 0) {
    preview.warnings.push({
      row: 1,
      message: `Central couldn't be read, so there are no span suggestions: ${ctx.centralUnavailable}`,
    });
  }
  return preview;
}

// ── Commit ─────────────────────────────────────────────────────────────────

export interface CommitHistoryImportInput {
  tenantId: number;
  template: HistoryTemplate;
  csv: string;
  label: string;
  source?: string;
  note?: string | null;
  createdBy: string | null;
  /** Confirmed span links: imported player key -> suggested tenant player id. */
  links?: Readonly<Record<string, number>>;
}

export interface HistoryCommitResult {
  batchId: number;
  rows: number;
  honours: number;
  linkedPlayers: number;
  newPlayers: number;
  coverage: Array<{ grade: string; season: number | null }>;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Validate the file again (never trust a stale preview) and write it as one
 * batch. Throws {@link HistoryImportError} 422 with the preview when the file
 * has errors, 400 for a link that isn't one of the player's suggestions.
 */
export async function commitHistoryImport(
  input: CommitHistoryImportInput,
): Promise<HistoryCommitResult> {
  const ctx = await loadHistoryImportContext(input.tenantId);
  const parsed = parseHistoryCsv(input.template, input.csv, ctx);
  const preview = buildHistoryPreview(parsed, ctx);
  if (preview.errors.length > 0) {
    throw new HistoryImportError(
      422,
      "The file has errors; fix them and upload it again.",
      preview,
    );
  }
  if (parsed.stats.length === 0 && parsed.honours.length === 0) {
    throw new HistoryImportError(422, "There is nothing to import.", preview);
  }
  const plan = planPlayerLinks(preview, input.links ?? {});
  if (plan.errors.length > 0) throw new HistoryImportError(400, plan.errors.join(" "));
  const label = input.label.trim();
  if (!label) throw new HistoryImportError(400, "A label is required.");

  return withHistoryStore(() =>
    db.transaction(async (tx) => {
      const batchId = await insertHistoryBatch(tx, {
        tenantId: input.tenantId,
        source: input.source?.trim() || `csv:${input.template}`,
        label,
        note: input.note?.trim() || null,
        createdBy: input.createdBy,
      });

      const minted = await mintSyntheticPlayers(
        tx,
        input.tenantId,
        plan.newPlayers.map((p) => p.name),
      );
      const idByKey = new Map(plan.linked);
      plan.newPlayers.forEach((p, i) => idByKey.set(p.key, minted[i]!.playerId));

      const { rows, coverage } = await insertHistoryRows(
        tx,
        input.tenantId,
        batchId,
        parsed.stats.map((r) => ({ ...r, playerId: idByKey.get(r.playerKey)! })),
      );

      const honours = await writeHonours(tx, input.tenantId, batchId, preview.honours);

      return {
        batchId,
        rows,
        honours,
        linkedPlayers: plan.linked.size,
        newPlayers: minted.length,
        coverage,
      };
    }),
  );
}

/**
 * Honours into the EXISTING curated tables (KTD4), each tagged with the batch.
 * An honour links the player the preview matched by exact name (a tenant
 * crosswalk id, so it is inside the tenant's player space); otherwise it stays
 * an unlinked name, as hand-kept honours often are.
 */
async function writeHonours(
  tx: Tx,
  tenantId: number,
  batchId: number,
  honours: readonly PreviewHonour[],
): Promise<number> {
  if (honours.length === 0) return 0;
  const tags: Array<{ target: ClubHistoryCuratedTarget; rowId: number }> = [];
  const playerIdOf = (h: PreviewHonour) => h.playerId;
  const awardIds = new Map<string, number>();

  for (const h of honours) {
    if (h.type === "award") {
      const title = h.title!;
      const key = slugify(title) || "award";
      let awardId = awardIds.get(key);
      if (awardId === undefined) {
        const [existing] = await tx
          .select({ id: awardsTable.id })
          .from(awardsTable)
          .where(
            and(
              eq(awardsTable.tenantId, tenantId),
              sql`(${awardsTable.key} = ${key} OR lower(${awardsTable.title}) = lower(${title}))`,
            ),
          )
          .limit(1);
        if (existing) awardId = existing.id;
        else {
          const [created] = await tx
            .insert(awardsTable)
            .values({ tenantId, key, title, mechanism: "manual", published: true })
            .returning({ id: awardsTable.id });
          awardId = created!.id;
          tags.push({ target: "award", rowId: awardId });
        }
        awardIds.set(key, awardId);
      }
      const [w] = await tx
        .insert(awardWinnersTable)
        .values({ tenantId, awardId, season: h.season!, playerId: playerIdOf(h), name: h.name })
        .returning({ id: awardWinnersTable.id });
      tags.push({ target: "award_winner", rowId: w!.id });
    } else if (h.type === "century") {
      const [c] = await tx
        .insert(centuriesTable)
        .values({
          tenantId,
          playerId: playerIdOf(h),
          grade: h.grade!,
          batsman: h.name,
          score: h.detail,
          season: h.season === null ? null : seasonLabel(h.season),
        })
        .returning({ id: centuriesTable.id });
      tags.push({ target: "century", rowId: c!.id });
    } else if (h.type === "five_wickets") {
      const [f] = await tx
        .insert(fiveWicketHaulsTable)
        .values({
          tenantId,
          playerId: playerIdOf(h),
          grade: h.grade!,
          bowler: h.name,
          figures: h.detail,
          season: h.season === null ? null : seasonLabel(h.season),
        })
        .returning({ id: fiveWicketHaulsTable.id });
      tags.push({ target: "five_wicket_haul", rowId: f!.id });
    } else {
      const parts = [h.name, h.detail, h.season === null ? null : seasonLabel(h.season)];
      const [r] = await tx
        .insert(clubRecordsTable)
        .values({
          tenantId,
          recordType: h.title!,
          grade: h.grade,
          detail: parts.filter(Boolean).join(" — "),
        })
        .returning({ id: clubRecordsTable.id });
      tags.push({ target: "club_record", rowId: r!.id });
    }
  }
  await tx
    .insert(clubHistoryCuratedRowsTable)
    .values(tags.map((t) => ({ tenantId, batchId, ...t })));
  return honours.length;
}

// ── Batches and undo ───────────────────────────────────────────────────────

export interface HistoryBatchSummary {
  id: number;
  label: string;
  source: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  rows: number;
  honours: number;
  coverage: Array<{ grade: string; season: number | null }>;
}

/** A tenant's history batches, newest first, with their size and coverage. */
export async function listHistoryBatches(tenantId: number): Promise<HistoryBatchSummary[]> {
  return withHistoryStore(async () => {
    const [batches, rowCounts, honourCounts, coverage] = await Promise.all([
      db
        .select()
        .from(clubHistoryBatchesTable)
        .where(eq(clubHistoryBatchesTable.tenantId, tenantId)),
      db
        .select({
          batchId: clubHistoryRowsTable.batchId,
          n: sql<number>`count(*)::int`,
        })
        .from(clubHistoryRowsTable)
        .where(eq(clubHistoryRowsTable.tenantId, tenantId))
        .groupBy(clubHistoryRowsTable.batchId),
      db
        .select({
          batchId: clubHistoryCuratedRowsTable.batchId,
          n: sql<number>`count(*)::int`,
        })
        .from(clubHistoryCuratedRowsTable)
        .where(
          and(
            eq(clubHistoryCuratedRowsTable.tenantId, tenantId),
            sql`${clubHistoryCuratedRowsTable.target} <> 'award'`,
          ),
        )
        .groupBy(clubHistoryCuratedRowsTable.batchId),
      db
        .select({
          batchId: clubHistoryBatchCoverageTable.batchId,
          grade: clubHistoryBatchCoverageTable.grade,
          season: clubHistoryBatchCoverageTable.season,
        })
        .from(clubHistoryBatchCoverageTable)
        .where(eq(clubHistoryBatchCoverageTable.tenantId, tenantId)),
    ]);
    const rowsBy = new Map(rowCounts.map((r) => [r.batchId, r.n]));
    const honoursBy = new Map(honourCounts.map((r) => [r.batchId, r.n]));
    return batches
      .map((b) => ({
        id: b.id,
        label: b.label,
        source: b.source,
        note: b.note,
        createdBy: b.createdBy,
        createdAt: b.createdAt.toISOString(),
        rows: rowsBy.get(b.id) ?? 0,
        honours: honoursBy.get(b.id) ?? 0,
        coverage: coverageOf(coverage.filter((c) => c.batchId === b.id)),
      }))
      .sort((a, b) => b.id - a.id);
  });
}

/**
 * Tenant-scoped tables whose `player_id` links a tenant player — a synthetic
 * player referenced by any of them is kept on undo.
 */
const PLAYER_REFERENCE_TABLES = [
  "club_history_rows",
  "award_winners",
  "cap_register",
  "club_photo_players",
  "club_roles",
  "centuries",
  "five_wicket_hauls",
  "honour_board_overrides",
  "life_members",
  "player_images",
  "premiership_players",
  "team_of_decade_members",
  "milestone_events",
] as const;

/** True when anything in the tenant still points at the player id. */
async function playerReferenced(tx: Tx, tenantId: number, playerId: number): Promise<boolean> {
  const checks = PLAYER_REFERENCE_TABLES.map(
    (t) =>
      sql`EXISTS (SELECT 1 FROM ${sql.identifier(t)} WHERE tenant_id = ${tenantId} AND player_id = ${playerId})`,
  );
  checks.push(
    sql`EXISTS (SELECT 1 FROM junior_participants WHERE tenant_id = ${tenantId} AND senior_player_id = ${playerId})`,
    sql`EXISTS (SELECT 1 FROM award_ballots b JOIN award_voting_config c ON c.id = b.config_id
        JOIN awards a ON a.id = c.award_id
        WHERE a.tenant_id = ${tenantId}
          AND ${playerId} IN (b.pick1_player_id, b.pick2_player_id, b.pick3_player_id))`,
  );
  const res = await tx.execute(sql`SELECT (${sql.join(checks, sql` OR `)}) AS referenced`);
  return Boolean((res.rows[0] as { referenced?: unknown } | undefined)?.referenced);
}

export interface HistoryUndoResult {
  batchId: number;
  rowsRemoved: number;
  honoursRemoved: number;
  playersRemoved: number;
}

/**
 * Undo one batch: its curated honours rows (an award it created goes too once
 * no winner or voting is left on it), the batch itself (rows and coverage
 * cascade), then every synthetic player the batch used that nothing in the
 * tenant references any more. Only the given tenant's batch can be undone.
 */
export async function undoHistoryBatch(
  tenantId: number,
  batchId: number,
): Promise<HistoryUndoResult> {
  return withHistoryStore(() =>
    db.transaction(async (tx) => {
      const [batch] = await tx
        .select({ id: clubHistoryBatchesTable.id })
        .from(clubHistoryBatchesTable)
        .where(
          and(
            eq(clubHistoryBatchesTable.id, batchId),
            eq(clubHistoryBatchesTable.tenantId, tenantId),
          ),
        );
      if (!batch) throw new HistoryImportError(404, "No such history batch for this club.");

      const rowPlayers = await tx
        .selectDistinct({ playerId: clubHistoryRowsTable.playerId })
        .from(clubHistoryRowsTable)
        .where(
          and(
            eq(clubHistoryRowsTable.tenantId, tenantId),
            eq(clubHistoryRowsTable.batchId, batchId),
          ),
        );
      const [{ n: rowsRemoved } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(clubHistoryRowsTable)
        .where(
          and(
            eq(clubHistoryRowsTable.tenantId, tenantId),
            eq(clubHistoryRowsTable.batchId, batchId),
          ),
        );

      const tags = await tx
        .select({
          target: clubHistoryCuratedRowsTable.target,
          rowId: clubHistoryCuratedRowsTable.rowId,
        })
        .from(clubHistoryCuratedRowsTable)
        .where(
          and(
            eq(clubHistoryCuratedRowsTable.tenantId, tenantId),
            eq(clubHistoryCuratedRowsTable.batchId, batchId),
          ),
        );
      const idsOf = (target: ClubHistoryCuratedTarget) =>
        tags.filter((t) => t.target === target).map((t) => t.rowId);

      const candidatePlayers = new Set(rowPlayers.map((r) => r.playerId));
      let honoursRemoved = 0;

      const winners = idsOf("award_winner");
      if (winners.length > 0) {
        const del = await tx
          .delete(awardWinnersTable)
          .where(
            and(eq(awardWinnersTable.tenantId, tenantId), inArray(awardWinnersTable.id, winners)),
          )
          .returning({ playerId: awardWinnersTable.playerId });
        honoursRemoved += del.length;
        for (const d of del) if (d.playerId !== null) candidatePlayers.add(d.playerId);
      }
      const centuries = idsOf("century");
      if (centuries.length > 0) {
        const del = await tx
          .delete(centuriesTable)
          .where(and(eq(centuriesTable.tenantId, tenantId), inArray(centuriesTable.id, centuries)))
          .returning({ playerId: centuriesTable.playerId });
        honoursRemoved += del.length;
        for (const d of del) if (d.playerId !== null) candidatePlayers.add(d.playerId);
      }
      const fivers = idsOf("five_wicket_haul");
      if (fivers.length > 0) {
        const del = await tx
          .delete(fiveWicketHaulsTable)
          .where(
            and(
              eq(fiveWicketHaulsTable.tenantId, tenantId),
              inArray(fiveWicketHaulsTable.id, fivers),
            ),
          )
          .returning({ playerId: fiveWicketHaulsTable.playerId });
        honoursRemoved += del.length;
        for (const d of del) if (d.playerId !== null) candidatePlayers.add(d.playerId);
      }
      const records = idsOf("club_record");
      if (records.length > 0) {
        const del = await tx
          .delete(clubRecordsTable)
          .where(
            and(eq(clubRecordsTable.tenantId, tenantId), inArray(clubRecordsTable.id, records)),
          )
          .returning({ id: clubRecordsTable.id });
        honoursRemoved += del.length;
      }
      for (const awardId of idsOf("award")) {
        const [winnerLeft] = await tx
          .select({ id: awardWinnersTable.id })
          .from(awardWinnersTable)
          .where(eq(awardWinnersTable.awardId, awardId))
          .limit(1);
        const [votingLeft] = await tx
          .select({ id: awardVotingConfigTable.id })
          .from(awardVotingConfigTable)
          .where(eq(awardVotingConfigTable.awardId, awardId))
          .limit(1);
        if (!winnerLeft && !votingLeft) {
          await tx
            .delete(awardsTable)
            .where(and(eq(awardsTable.tenantId, tenantId), eq(awardsTable.id, awardId)));
        }
      }

      await tx
        .delete(clubHistoryBatchesTable)
        .where(
          and(
            eq(clubHistoryBatchesTable.id, batchId),
            eq(clubHistoryBatchesTable.tenantId, tenantId),
          ),
        );

      let playersRemoved = 0;
      if (candidatePlayers.size > 0) {
        const synthetic = await tx
          .select({
            participantId: playerIdMapTable.participantId,
            playerId: playerIdMapTable.playerId,
          })
          .from(playerIdMapTable)
          .where(
            and(
              eq(playerIdMapTable.tenantId, tenantId),
              inArray(playerIdMapTable.playerId, [...candidatePlayers]),
            ),
          );
        for (const p of synthetic) {
          if (!isSyntheticParticipantKey(p.participantId)) continue;
          if (await playerReferenced(tx, tenantId, p.playerId)) continue;
          const [mergedInto] = await tx
            .select({ id: playerCurationTable.id })
            .from(playerCurationTable)
            .where(
              and(
                eq(playerCurationTable.tenantId, tenantId),
                eq(playerCurationTable.mergedIntoParticipantId, p.participantId),
              ),
            )
            .limit(1);
          if (mergedInto) continue;
          await tx
            .delete(playerCurationTable)
            .where(
              and(
                eq(playerCurationTable.tenantId, tenantId),
                eq(playerCurationTable.participantId, p.participantId),
              ),
            );
          await tx
            .delete(playerIdMapTable)
            .where(
              and(
                eq(playerIdMapTable.tenantId, tenantId),
                eq(playerIdMapTable.participantId, p.participantId),
              ),
            );
          playersRemoved++;
        }
      }

      return { batchId, rowsRemoved, honoursRemoved, playersRemoved };
    }),
  );
}

// ── Boundaries ─────────────────────────────────────────────────────────────

export interface BoundaryInput {
  grade: string | null;
  startSeason: number;
}

/**
 * Replace the tenant's boundaries (R12): one optional club default (grade
 * null) plus per-grade overrides, each a senior app grade and a season start
 * year. Setting a boundary changes the club's public numbers (central seasons
 * before it stop counting), so only the platform admin reaches this.
 */
export async function replaceBoundaries(
  tenantId: number,
  input: readonly BoundaryInput[],
  updatedBy: string | null,
): Promise<Array<{ grade: string | null; startSeason: number }>> {
  const seniorGrade = await loadSeniorGradeNormaliser();
  const currentYear = new Date().getFullYear() + 1;
  const seen = new Set<string>();
  const rows: BoundaryInput[] = [];
  for (const b of input) {
    let grade: string | null = null;
    if (b.grade !== null && b.grade.trim() !== "") {
      grade = seniorGrade(b.grade);
      if (!grade) throw new HistoryImportError(400, `"${b.grade}" isn't a senior grade.`);
    }
    if (!Number.isInteger(b.startSeason) || b.startSeason < EARLIEST_SEASON) {
      throw new HistoryImportError(400, `${b.startSeason} isn't a season start year.`);
    }
    if (b.startSeason > currentYear) {
      throw new HistoryImportError(400, `${b.startSeason} is in the future.`);
    }
    const key = grade ?? "";
    if (seen.has(key)) {
      throw new HistoryImportError(400, `${grade ?? "The club default"} is listed twice.`);
    }
    seen.add(key);
    rows.push({ grade, startSeason: b.startSeason });
  }
  return withHistoryStore(() =>
    db.transaction(async (tx) => {
      await tx
        .delete(clubHistoryBoundariesTable)
        .where(eq(clubHistoryBoundariesTable.tenantId, tenantId));
      if (rows.length > 0) {
        await tx
          .insert(clubHistoryBoundariesTable)
          .values(rows.map((r) => ({ tenantId, ...r, updatedBy })));
      }
      return rows
        .map((r) => ({ grade: r.grade, startSeason: r.startSeason }))
        .sort((a, b) => (a.grade ?? "").localeCompare(b.grade ?? ""));
    }),
  );
}
