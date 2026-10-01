import { boundaryFor, CORRECTABLE_FIELDS, type CorrectableField } from "@workspace/db";
import type {
  CentralCentury,
  CentralDashboard,
  CentralFiveWicketHaul,
  CentralGradeSummary,
  CentralInningsLine,
  CentralParticipantMatchLine,
  CentralPartialFigures,
  CentralPlayerMatchRow,
  CentralRecordProgressionRow,
  CentralVsClubRow,
} from "@workspace/db/central-queries";
import {
  beforeBoundary,
  clubRecordLeaders,
  FILL_IN_ID_FLOOR,
  historyKey,
  lineFieldValue,
  type ClubIdentity,
  type ClubStats,
  type ClubStatsBucket,
  type CorrectedLine,
  type OverlayBoundary,
  type OverlayHistoryRow,
} from "./club-overlay";
import type { InningsValue, ProgressionCandidate, RecordKind } from "./records-analytics";

/**
 * The club overlay on the read surfaces U10 left out (hybrid stats plan U10
 * follow-up; KTD1, KTD5, KTD7): the player match log, the match scorecard,
 * club totals and the dashboard, grade summaries, grade distribution,
 * head-to-head, the centuries and five-wicket lists and record progression.
 *
 * Same contract as `club-overlay.ts`: everything here is applied AFTER the
 * club-cached central read, in the route, and only when the tenant's overlay
 * is ACTIVE (a boundary, club history or a correction). An inactive tenant
 * never reaches this file — its handler runs exactly the original read.
 *
 * Two kinds of surface:
 *   - AGGREGATES (totals, dashboard, grade summaries, distribution) are views
 *     over `ClubStats` — the (participant, grade, season) buckets with the
 *     whole overlay already applied — so they agree with the careers, records
 *     and leaderboards by construction.
 *   - PER-MATCH surfaces (match log, scorecard, centuries, five-fors,
 *     head-to-head, progression) take the plain central rows, drop what is
 *     before the boundary, and replace the corrected lines.
 *
 * Rules that hold on every surface:
 *   - One source per (grade, season) (KTD5): a central match in a season
 *     before its grade's boundary is never shown; club history supplies it.
 *   - A stale correction (central no longer matches its recorded previous
 *     value) is never applied (KTD7) — the corrected lines arrive already
 *     checked by `resolveCorrections`.
 *   - Fill-ins (ids >= 90000) never count; juniors never mix in (R8).
 *   - Career-grain history adds to career totals only: it is never a match,
 *     a season row, a century or a progression point with a date.
 *
 * The Social Studio drafting paths (draft sweep, round-up, achievements, the
 * match-summary drafter) deliberately do NOT use this file or the club layer
 * (KTD8): a boundary, history import or correction must never draft a card.
 */

// ── Shared ─────────────────────────────────────────────────────────────────

const seasonLabel = (startYear: number) =>
  `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;

/** "2004/05" (or any text with a 4-digit year) -> 2004; null when there is none. */
export function seasonStartYearOf(label: string | null | undefined): number | null {
  const m = /(\d{4})/.exec(label ?? "");
  return m ? Number(m[1]) : null;
}

const ballsToOversText = (balls: number): string =>
  balls % 6 === 0 ? String(balls / 6) : `${Math.floor(balls / 6)}.${balls % 6}`;

/** True when club history (not central) supplies this history row's season. */
function historyRowCounts(
  r: OverlayHistoryRow,
  boundaries: readonly OverlayBoundary[],
  isSeniorGrade: (grade: string) => boolean,
): boolean {
  if (r.playerId <= 0 || r.playerId >= FILL_IN_ID_FLOOR) return false;
  if (!isSeniorGrade(r.grade)) return false;
  if (r.grain === "career") return true;
  const b = boundaryFor(boundaries, r.grade);
  return b !== null && r.season !== null && r.season < b;
}

/** The overlay key a history row's player presents under (keeper GUID or `player:<id>`). */
const historyRowKey = (identity: ClubIdentity, r: OverlayHistoryRow): string =>
  identity.guidForPlayerId(r.playerId) ?? historyKey(r.playerId);

/** What a club's corrections change on one line, per correctable field (zeros left out). */
export type LineDeltas = Partial<Record<CorrectableField, number>>;

export function lineDeltas(c: CorrectedLine): LineDeltas {
  const out: LineDeltas = {};
  for (const field of CORRECTABLE_FIELDS) {
    const d = lineFieldValue(c.after, field) - lineFieldValue(c.before, field);
    if (d !== 0) out[field] = d;
  }
  return out;
}

/** The per-match figures a scorecard line and a match-log row both display. */
export interface DisplayFigures {
  batted: boolean;
  runs: number | null;
  balls: number | null;
  fours: number | null;
  sixes: number | null;
  notOut: boolean;
  bowled: boolean;
  overs: string | null;
  maidens: number | null;
  runsConceded: number | null;
  wickets: number | null;
  wides: number | null;
  noBalls: number | null;
}

/**
 * One displayed line with a corrected line's changes applied. Each corrected
 * field moves by its delta, so a line that collapses two innings (the match
 * log sums them, the scorecard shows the later one) moves by the same amount
 * the career does. Pure — returns a copy.
 */
export function correctDisplayFigures<T extends DisplayFigures>(row: T, c: CorrectedLine): T {
  const d = lineDeltas(c);
  const out: T = { ...row };
  const add = (v: number | null, delta: number | undefined): number | null =>
    delta === undefined ? v : (v ?? 0) + delta;

  out.runs = add(row.runs, d.runs);
  out.balls = add(row.balls, d.balls_faced);
  out.fours = add(row.fours, d.fours);
  out.sixes = add(row.sixes, d.sixes);
  if (d.not_out !== undefined) {
    // Gaining a not out shows not out; losing the only one shows out.
    out.notOut = d.not_out > 0 ? true : lineFieldValue(c.after, "not_out") > 0 && row.notOut;
  }
  if (c.after.batting.some((b) => b.kind !== "dnb")) out.batted = true;

  if (d.balls_bowled !== undefined) {
    out.overs = ballsToOversText(lineFieldValue(c.after, "balls_bowled"));
  }
  out.maidens = add(row.maidens, d.maidens);
  out.runsConceded = add(row.runsConceded, d.runs_conceded);
  out.wickets = add(row.wickets, d.wickets);
  out.wides = add(row.wides, d.wides);
  out.noBalls = add(row.noBalls, d.no_balls);
  if (c.after.bowling.length > 0) out.bowled = true;
  return out;
}

// ── Club totals, dashboard and grade summaries (views over ClubStats) ───────

export interface ClubTotals {
  players: number;
  games: number;
  runs: number;
  wickets: number;
  grades: number;
}

/**
 * Club-wide totals — the `centralClubTotals` shape. Games are appearances
 * (one per player per match, R7's roster ∪ batting ∪ bowling), so the total
 * is exactly the sum of the careers on the players page.
 */
export function clubTotals(stats: ClubStats): ClubTotals {
  const players = new Set<string>();
  const grades = new Set<string>();
  let games = 0;
  let runs = 0;
  let wickets = 0;
  for (const b of stats.buckets) {
    players.add(b.participantId);
    grades.add(b.grade);
    games += b.games;
    runs += b.runs;
    wickets += b.wickets;
  }
  return { players: players.size, games, runs, wickets, grades: grades.size };
}

/**
 * Per-grade aggregates — the `centralGradeSummaries` shape. `games` is the
 * grade's total appearances (the sum of its players' games, which is what the
 * app's own `grade_summaries` table holds), because club history carries
 * player figures, not a count of the matches the club played.
 */
export function clubGradeSummaries(stats: ClubStats): CentralGradeSummary[] {
  const byGrade = new Map<string, CentralGradeSummary & { ids: Set<string> }>();
  for (const b of stats.buckets) {
    let g = byGrade.get(b.grade);
    if (!g) {
      g = {
        grade: b.grade,
        players: 0,
        games: 0,
        innings: 0,
        runs: 0,
        wickets: 0,
        catches: 0,
        stumpings: 0,
        runOuts: 0,
        ids: new Set(),
      };
      byGrade.set(b.grade, g);
    }
    g.ids.add(b.participantId);
    g.games += b.games;
    g.innings += b.innings;
    g.runs += b.runs;
    g.wickets += b.wickets;
    g.catches += b.catches;
    g.stumpings += b.stumpings;
    g.runOuts += b.runOuts;
  }
  return [...byGrade.values()]
    .map(({ ids, ...g }) => ({ ...g, players: ids.size }))
    .sort((x, y) => x.grade.localeCompare(y.grade));
}

/** The dashboard — the `centralDashboard` shape (private players never named). */
export function clubDashboard(stats: ClubStats): CentralDashboard {
  const totals = clubTotals(stats);
  const gradeSummaries = clubGradeSummaries(stats);
  const top = (metric: "runs" | "wickets" | "catches") => {
    const [first] = clubRecordLeaders(stats, metric);
    return first
      ? { participantId: first.participantId, displayName: first.displayName, value: first.value }
      : null;
  };
  return {
    totalPlayers: totals.players,
    totalGames: totals.games,
    totalRuns: totals.runs,
    totalWickets: totals.wickets,
    gradesCount: gradeSummaries.length,
    topRunScorer: top("runs"),
    topWicketTaker: top("wickets"),
    topFielder: top("catches"),
    gradeSummaries,
  };
}

// ── Grade distribution ─────────────────────────────────────────────────────

/** One player's raw aggregate for a grade and span — `centralGradeDistribution`'s figures. */
export interface ClubDistributionRow {
  participantId: string;
  displayName: string | null;
  games: number;
  innings: number;
  notOuts: number;
  runs: number;
  highScore: number | null;
  fifties: number;
  hundreds: number;
  wickets: number;
  runsConceded: number;
  fiveWickets: number;
  catches: number;
  ballsFaced: number | null;
  runsOffBallsFaced: number | null;
  ballsBowled: number | null;
  runsOffBallsBowled: number | null;
  wicketsOffBallsBowled: number | null;
  maidens: number | null;
}

const addKnown = (a: number | null, b: number | null): number | null =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0);

/**
 * Every non-private player's aggregate for one grade over a season span. A
 * bounded span leaves out career-grain history (it has no season); the career
 * span (no bounds) includes it, like the native read's baseline rows.
 */
export function clubDistributionRows(
  stats: ClubStats,
  grade: string,
  span: { fromSeason?: number; toSeason?: number } = {},
): ClubDistributionRow[] {
  const bounded = span.fromSeason !== undefined || span.toSeason !== undefined;
  const inSpan = (b: ClubStatsBucket): boolean => {
    if (b.grade !== grade) return false;
    if (!bounded) return true;
    if (b.careerGrain || b.season === null) return false;
    if (span.fromSeason !== undefined && b.season < span.fromSeason) return false;
    if (span.toSeason !== undefined && b.season > span.toSeason) return false;
    return true;
  };
  const rows = new Map<string, ClubDistributionRow>();
  for (const b of stats.buckets) {
    if (!inSpan(b)) continue;
    const p = stats.players.get(b.participantId);
    if (p?.isPrivate) continue;
    let r = rows.get(b.participantId);
    if (!r) {
      r = {
        participantId: b.participantId,
        displayName: p?.displayName ?? null,
        games: 0,
        innings: 0,
        notOuts: 0,
        runs: 0,
        highScore: null,
        fifties: 0,
        hundreds: 0,
        wickets: 0,
        runsConceded: 0,
        fiveWickets: 0,
        catches: 0,
        ballsFaced: null,
        runsOffBallsFaced: null,
        ballsBowled: null,
        runsOffBallsBowled: null,
        wicketsOffBallsBowled: null,
        maidens: null,
      };
      rows.set(b.participantId, r);
    }
    const f: CentralPartialFigures = b;
    r.games += f.games;
    r.innings += f.innings;
    r.notOuts += f.notOuts;
    r.runs += f.runs;
    if (f.highScore !== null && (r.highScore === null || f.highScore > r.highScore)) {
      r.highScore = f.highScore;
    }
    r.fifties += f.fifties;
    r.hundreds += f.hundreds;
    r.wickets += f.wickets;
    r.runsConceded += f.runsConceded;
    r.fiveWickets += f.fiveWickets;
    r.catches += f.catches;
    r.ballsFaced = addKnown(r.ballsFaced, f.ballsFaced);
    r.runsOffBallsFaced = addKnown(r.runsOffBallsFaced, f.runsOffBallsFaced);
    r.ballsBowled = addKnown(r.ballsBowled, f.ballsBowled);
    r.runsOffBallsBowled = addKnown(r.runsOffBallsBowled, f.runsOffBallsBowled);
    r.wicketsOffBallsBowled = addKnown(r.wicketsOffBallsBowled, f.wicketsOffBallsBowled);
    r.maidens = addKnown(r.maidens, f.maidens);
  }
  return [...rows.values()];
}

// ── Player match log ───────────────────────────────────────────────────────

/** A match-log row; `isHome` is unknown (null) for a club-history match. */
export type OverlayMatchLogRow = Omit<CentralPlayerMatchRow, "isHome"> & {
  isHome: boolean | null;
};

export interface OverlayMatchLogInput {
  /** The plain central log for the player's merge group. */
  rows: readonly CentralPlayerMatchRow[];
  /** The tenant's corrected lines (any player — only this player's are used). */
  corrected: readonly CorrectedLine[];
  /** The overlay key of the player: keeper GUID, or `player:<id>` (history only). */
  playerKey: string;
  identity: ClubIdentity;
  boundaries: readonly OverlayBoundary[];
  history: readonly OverlayHistoryRow[];
  isSeniorGrade: (grade: string) => boolean;
}

/** A history round text ("7", "Round 7") -> 7; finals and free text -> null. */
function historyRound(round: string | null | undefined): number | null {
  if (!round || /final|semi|grand|qualif|elimin|prelim/i.test(round)) return null;
  const m = /(\d+)/.exec(round);
  return m ? Number(m[1]) : null;
}

/** One club-history MATCH row as a match-log row (negative id: never a central match). */
function historyMatchRow(r: OverlayHistoryRow, index: number): OverlayMatchLogRow {
  const batted = r.innings !== null ? r.innings > 0 : r.runs !== null;
  const bowled = r.ballsBowled !== null || r.wickets !== null || r.runsConceded !== null;
  const notOut = (r.notOuts ?? 0) > 0 || r.highScoreNotOut === true;
  const runs = batted ? (r.runs ?? 0) : null;
  const inningsLines: CentralInningsLine[] = batted
    ? [
        {
          innings: 1,
          runs,
          balls: r.ballsFaced,
          notOut,
          battingPos: null,
          dismissal: null,
          dismissalType: null,
        },
      ]
    : [];
  return {
    matchId: -(r.id ?? index + 1),
    grade: r.grade,
    season: r.season as number,
    round: historyRound(r.round),
    stage: null,
    matchDate: r.matchDate ?? null,
    opponent: r.opponent ?? null,
    venue: null,
    result: null,
    batted,
    battingPos: null,
    runs,
    balls: batted ? r.ballsFaced : null,
    fours: batted ? r.fours : null,
    sixes: batted ? r.sixes : null,
    notOut: batted && notOut,
    dismissal: null,
    bowled,
    overs: bowled && r.ballsBowled !== null ? ballsToOversText(r.ballsBowled) : null,
    maidens: bowled ? r.maidens : null,
    runsConceded: bowled ? (r.runsConceded ?? 0) : null,
    wickets: bowled ? (r.wickets ?? 0) : null,
    wides: null,
    noBalls: null,
    catches: r.catches || null,
    stumpings: r.stumpings || null,
    runOuts: r.runOuts || null,
    isHome: null,
    battedFirst: null,
    opponentClubId: null,
    inningsLines,
  };
}

/** A match-log row's per-innings lines with a corrected line's batting changes. */
function correctInningsLines(
  lines: readonly CentralInningsLine[],
  d: LineDeltas,
): CentralInningsLine[] {
  const batting = d.runs !== undefined || d.balls_faced !== undefined || d.not_out !== undefined;
  if (!batting) return [...lines];
  const out = lines.map((l) => ({ ...l }));
  // The first played innings carries the change (see `correctLine`).
  const first = (): CentralInningsLine => {
    let l = out[0];
    if (!l) {
      l = {
        innings: null,
        runs: 0,
        balls: null,
        notOut: false,
        battingPos: null,
        dismissal: null,
        dismissalType: null,
      };
      out.push(l);
    }
    return l;
  };
  if (d.runs !== undefined) {
    const l = first();
    l.runs = (l.runs ?? 0) + d.runs;
  }
  if (d.balls_faced !== undefined) {
    const l = first();
    l.balls = (l.balls ?? 0) + d.balls_faced;
  }
  if (d.not_out !== undefined) {
    const gained = d.not_out > 0;
    const l = out.find((x) => x.notOut !== gained) ?? (gained ? first() : undefined);
    if (l) l.notOut = gained;
  }
  return out;
}

/**
 * A player's match log with the overlay applied: central matches from the
 * boundary on (corrected), plus the club's own MATCH-grain history for the
 * seasons before it. Season- and career-grain history is never a match row.
 * Sorted like the central log (season, round, match id — newest first).
 */
export function overlayMatchLog(input: OverlayMatchLogInput): OverlayMatchLogRow[] {
  const { identity, boundaries } = input;
  const out = new Map<number, OverlayMatchLogRow>();
  for (const r of input.rows) {
    if (beforeBoundary(boundaries, r.grade, r.season)) continue;
    out.set(r.matchId, { ...r });
  }
  for (const c of input.corrected) {
    if (identity.canonicalOf(c.after.participantId) !== input.playerKey) continue;
    const row = out.get(c.after.matchId);
    if (!row) continue;
    const d = lineDeltas(c);
    const fixed = correctDisplayFigures(row, c);
    const fld = (v: number | null, delta: number | undefined) =>
      delta === undefined ? v : (v ?? 0) + delta || null;
    fixed.catches = fld(row.catches, d.catches);
    fixed.stumpings = fld(row.stumpings, d.stumpings);
    fixed.runOuts = fld(row.runOuts, d.run_outs);
    fixed.inningsLines = correctInningsLines(row.inningsLines, d);
    out.set(row.matchId, fixed);
  }
  const rows = [...out.values()];
  input.history.forEach((r, i) => {
    if (r.grain !== "match") return;
    if (!historyRowCounts(r, boundaries, input.isSeniorGrade)) return;
    if (historyRowKey(identity, r) !== input.playerKey) return;
    rows.push(historyMatchRow(r, i));
  });
  return rows.sort(
    (a, b) => b.season - a.season || (b.round ?? -1) - (a.round ?? -1) || b.matchId - a.matchId,
  );
}

// ── Match scorecard ────────────────────────────────────────────────────────

/**
 * A scorecard's club-side lines with the corrections for that match applied.
 * Lines are matched on the participant's OWN GUID (a correction names one).
 */
export function overlayScorecardLines<T extends DisplayFigures & { participantId: string | null }>(
  lines: readonly T[],
  corrected: readonly CorrectedLine[],
  matchId: number,
): T[] {
  const byPid = new Map<string, CorrectedLine>();
  for (const c of corrected) {
    if (c.after.matchId === matchId) byPid.set(c.after.participantId, c);
  }
  if (byPid.size === 0) return [...lines];
  return lines.map((l) => {
    const c = l.participantId ? byPid.get(l.participantId) : undefined;
    return c ? correctDisplayFigures(l, c) : l;
  });
}

// ── Centuries and five-wicket hauls ────────────────────────────────────────

/** A curated honours row (the tenant's `centuries` / `five_wicket_hauls` tables). */
export interface CuratedHonourRow {
  playerId: number | null;
  grade: string;
  name: string;
  /** "134*" for a century, "6/23" for a five-for. */
  detail: string | null;
  /** "YYYY/YY" display label. */
  season: string | null;
}

/** One row of the centuries / five-fors list, before the route maps ids. */
export interface OverlayHonourRow {
  /** Overlay key (keeper GUID / `player:<id>`); null for a curated row with no player. */
  participantId: string | null;
  /** The tenant player id when it is already known (curated rows). */
  playerId: number | null;
  displayName: string | null;
  grade: string;
  /** "134*" / "6/23". */
  detail: string;
  /** "YYYY/YY". */
  season: string;
  source: "central" | "history" | "curated";
}

export interface OverlayHonoursInput {
  kind: "century" | "fiveFor";
  /** The plain central rows (`centralCenturies` / `centralFiveWicketHauls`). */
  rows: ReadonlyArray<CentralCentury | CentralFiveWicketHaul>;
  corrected: readonly CorrectedLine[];
  identity: ClubIdentity;
  boundaries: readonly OverlayBoundary[];
  history: readonly OverlayHistoryRow[];
  /** The tenant's curated honours rows for this list. */
  curated: readonly CuratedHonourRow[];
  /** Central name + privacy per keeper GUID (corrected and history players). */
  names: ReadonlyMap<string, { displayName: string | null; isPrivate: boolean }>;
  isSeniorGrade: (grade: string) => boolean;
}

const detailOf = (r: CentralCentury | CentralFiveWicketHaul): string =>
  "score" in r ? r.score : r.figures;

/** The century / five-for entries one (corrected) line produces. */
function honoursOfLine(kind: "century" | "fiveFor", l: CentralParticipantMatchLine): string[] {
  if (kind === "century") {
    return l.batting
      .filter((b) => b.kind !== "dnb" && b.runs >= 100)
      .map((b) => `${b.runs}${b.kind === "notout" ? "*" : ""}`);
  }
  return l.bowling.filter((b) => b.wickets >= 5).map((b) => `${b.wickets}/${b.runs}`);
}

/**
 * The centuries (or five-wicket hauls) list with the overlay applied:
 *   - central rows from the boundary on, fill-ins left out;
 *   - a corrected line is re-judged, so a correction can add or remove a row;
 *   - the club's own history before the boundary: MATCH-grain history rows
 *     that reached the mark, and the tenant's curated honours rows dated
 *     before the grade's boundary (imported honours live in the curated
 *     tables — KTD4). A curated row with no parseable season, or in a grade
 *     with no boundary, is left out: nothing says central doesn't supply it.
 * Private players never appear. Sorted by grade, then season (newest first).
 */
export function overlayHonours(input: OverlayHonoursInput): OverlayHonourRow[] {
  const { kind, identity, boundaries, names } = input;
  const fillIn = (pid: string) => (identity.intByGuid.get(pid) ?? 0) >= FILL_IN_ID_FLOOR;
  // The central name, like the plain rows; a history-only player has none, so
  // theirs is the club's own (curated) name.
  const nameOf = (pid: string) => names.get(pid)?.displayName ?? identity.nameFor(pid, null);

  // Corrected (keeper, match) pairs are rebuilt from the corrected line.
  const rebuilt = new Set<string>();
  for (const c of input.corrected) {
    rebuilt.add(`${identity.canonicalOf(c.after.participantId)}\u0000${c.after.matchId}`);
  }

  const out: OverlayHonourRow[] = [];
  for (const r of input.rows) {
    if (rebuilt.has(`${r.participantId}\u0000${r.matchId}`)) continue;
    if (beforeBoundary(boundaries, r.grade, seasonStartYearOf(r.season))) continue;
    if (fillIn(r.participantId)) continue;
    out.push({
      participantId: r.participantId,
      playerId: null,
      displayName: r.displayName,
      grade: r.grade,
      detail: detailOf(r),
      season: r.season,
      source: "central",
    });
  }
  for (const c of input.corrected) {
    const l = c.after;
    const keeper = identity.canonicalOf(l.participantId);
    if (l.season === null || beforeBoundary(boundaries, l.grade, l.season)) continue;
    if (fillIn(keeper) || names.get(keeper)?.isPrivate) continue;
    for (const detail of honoursOfLine(kind, l)) {
      out.push({
        participantId: keeper,
        playerId: null,
        displayName: nameOf(keeper),
        grade: l.grade,
        detail,
        season: seasonLabel(l.season),
        source: "central",
      });
    }
  }

  for (const r of input.history) {
    if (r.grain !== "match" || r.season === null) continue;
    if (!historyRowCounts(r, boundaries, input.isSeniorGrade)) continue;
    const key = historyRowKey(identity, r);
    if (fillIn(key) || names.get(key)?.isPrivate) continue;
    let detail: string | null = null;
    if (kind === "century") {
      const runs = r.highScore ?? r.runs ?? 0;
      const notOut = r.highScoreNotOut === true || (r.notOuts ?? 0) > 0;
      if (runs >= 100) detail = `${runs}${notOut ? "*" : ""}`;
    } else {
      const wickets = r.bestBowlingWickets ?? r.wickets ?? 0;
      const runs = r.bestBowlingWickets !== null ? r.bestBowlingRuns : r.runsConceded;
      if (wickets >= 5) detail = `${wickets}/${runs ?? 0}`;
    }
    if (detail === null) continue;
    out.push({
      participantId: key,
      playerId: r.playerId,
      displayName: nameOf(key),
      grade: r.grade,
      detail,
      season: seasonLabel(r.season),
      source: "history",
    });
  }

  for (const r of input.curated) {
    if (!input.isSeniorGrade(r.grade)) continue;
    const season = seasonStartYearOf(r.season);
    const b = boundaryFor(boundaries, r.grade);
    if (season === null || b === null || season >= b) continue;
    if (r.playerId !== null && r.playerId >= FILL_IN_ID_FLOOR) continue;
    out.push({
      participantId: null,
      playerId: r.playerId,
      displayName: r.name,
      grade: r.grade,
      detail: r.detail ?? "",
      season: r.season ?? seasonLabel(season),
      source: "curated",
    });
  }

  return out.sort((a, b) => a.grade.localeCompare(b.grade) || b.season.localeCompare(a.season));
}

// ── Head-to-head (vs club) ─────────────────────────────────────────────────

export interface OverlayVsClubInput {
  /** `centralVsClub` rows, already limited to matches from the boundary on. */
  rows: readonly CentralVsClubRow[];
  corrected: readonly CorrectedLine[];
  /** Every senior club-match line of the corrected players' merge groups. */
  lines: readonly CentralParticipantMatchLine[];
  opponentClubId: number;
  identity: ClubIdentity;
  boundaries: readonly OverlayBoundary[];
}

/**
 * Head-to-head rows with the corrections applied: a corrected player's
 * figures against the opponent are recomputed from their own (corrected)
 * lines, so the high score and best bowling stay exact. `matches` keeps the
 * central appearance count (a correction never adds or removes a match).
 * Only players with a correction in a match against THIS opponent are
 * recomputed; every other row is the central read's, untouched.
 * Club history is not included: a history match names its opponent as free
 * text, which cannot be tied to a club id.
 */
export function overlayVsClubRows(input: OverlayVsClubInput): CentralVsClubRow[] {
  const { identity, boundaries } = input;
  const keepers = new Set(
    input.corrected
      .filter((c) => c.after.opponentClubId === input.opponentClubId)
      .map((c) => identity.canonicalOf(c.after.participantId)),
  );
  if (keepers.size === 0) return [...input.rows];
  const fixed = new Map<string, CentralParticipantMatchLine>();
  for (const c of input.corrected) {
    fixed.set(`${c.after.participantId}\u0000${c.after.matchId}`, c.after);
  }
  const linesOf = new Map<string, CentralParticipantMatchLine[]>();
  for (const l of input.lines) {
    const keeper = identity.canonicalOf(l.participantId);
    if (!keepers.has(keeper)) continue;
    if (l.opponentClubId !== input.opponentClubId) continue;
    // The head-to-head read counts only matches whose season parses.
    if (l.season === null || beforeBoundary(boundaries, l.grade, l.season)) continue;
    const arr = linesOf.get(keeper) ?? [];
    arr.push(fixed.get(`${l.participantId}\u0000${l.matchId}`) ?? l);
    linesOf.set(keeper, arr);
  }
  return input.rows.map((row) => {
    const lines = linesOf.get(row.participantId);
    if (!lines) return row;
    const out: CentralVsClubRow = {
      ...row,
      innings: 0,
      notOuts: 0,
      outs: 0,
      runs: 0,
      highScore: null,
      highScoreNotOut: false,
      spells: 0,
      wickets: 0,
      runsConceded: 0,
      ballsBowled: null,
      bestWickets: null,
      bestRuns: null,
    };
    for (const l of lines) {
      for (const b of l.batting) {
        if (b.kind === "dnb") continue;
        const notOut = b.kind === "notout";
        out.innings += 1;
        out.runs += b.runs;
        if (notOut) out.notOuts += 1;
        else out.outs += 1;
        if (
          out.highScore === null ||
          b.runs > out.highScore ||
          (b.runs === out.highScore && notOut)
        ) {
          out.highScore = b.runs;
          out.highScoreNotOut = notOut;
        }
      }
      for (const b of l.bowling) {
        out.spells += 1;
        out.wickets += b.wickets;
        out.runsConceded += b.runs;
        if (b.balls !== null) out.ballsBowled = (out.ballsBowled ?? 0) + b.balls;
        if (
          out.bestWickets === null ||
          b.wickets > out.bestWickets ||
          (b.wickets === out.bestWickets && b.runs < (out.bestRuns ?? Infinity))
        ) {
          out.bestWickets = b.wickets;
          out.bestRuns = b.runs;
        }
      }
    }
    return out;
  });
}

// ── Record progression ─────────────────────────────────────────────────────

/** Who a progression point belongs to (the route maps the id and splits the name). */
export interface ProgressionPlayer {
  participantId: string;
  displayName: string | null;
}

/** A corrected match's club lines, every participant, corrections applied. */
export interface CorrectedMatchLines {
  matchId: number;
  lines: readonly CentralParticipantMatchLine[];
}

/** The best single innings (or bowling figures) among one match's lines; null when none. */
export function bestOfMatchLines(
  kind: RecordKind,
  lines: readonly CentralParticipantMatchLine[],
  skip: (participantId: string) => boolean,
): { participantId: string; value: InningsValue } | null {
  let best: { participantId: string; value: InningsValue } | null = null;
  const offer = (participantId: string, value: InningsValue) => {
    const better =
      best === null ||
      value.primary > best.value.primary ||
      (kind === "bestBowling" &&
        value.primary === best.value.primary &&
        value.secondary < best.value.secondary);
    if (better) best = { participantId, value };
  };
  for (const l of lines) {
    if (skip(l.participantId)) continue;
    if (kind === "highScore") {
      for (const b of l.batting) {
        if (b.kind === "dnb") continue;
        offer(l.participantId, { primary: b.runs, secondary: b.kind === "notout" ? 1 : 0 });
      }
    } else {
      for (const b of l.bowling) {
        if (b.wickets >= 1) offer(l.participantId, { primary: b.wickets, secondary: b.runs });
      }
    }
  }
  return best;
}

/** True when a corrected line can change a match's best score / best figures. */
export function touchesProgression(kind: RecordKind, c: CorrectedLine): boolean {
  const d = lineDeltas(c);
  return kind === "highScore"
    ? d.runs !== undefined || d.not_out !== undefined
    : d.wickets !== undefined || d.runs_conceded !== undefined;
}

export interface OverlayProgressionInput {
  kind: RecordKind;
  /** Optional app-grade filter (the route's `grade` param). */
  grade?: string;
  /** The plain central per-match bests (`centralRecordProgressionRows`). */
  rows: readonly CentralRecordProgressionRow[];
  /** The corrected matches, each with ALL its club lines (corrected ones replaced). */
  correctedMatches: readonly CorrectedMatchLines[];
  stats: ClubStats;
  identity: ClubIdentity;
  boundaries: readonly OverlayBoundary[];
}

/**
 * The record-progression candidates with the overlay applied:
 *   - central per-match bests from the boundary on (fill-ins left out), with
 *     each corrected match re-judged from its corrected lines;
 *   - club history before the boundary as season-level candidates (they have
 *     no match), and career-grain history as UNDATED candidates, so the
 *     series still ends at the record card's value.
 */
export function overlayProgressionCandidates(input: OverlayProgressionInput): {
  dated: ProgressionCandidate<ProgressionPlayer>[];
  undated: ProgressionCandidate<ProgressionPlayer>[];
} {
  const { kind, stats, identity, boundaries } = input;
  const fillIn = (pid: string) => (stats.intByGuid.get(pid) ?? 0) >= FILL_IN_ID_FLOOR;
  const isPrivate = (pid: string) => stats.players.get(pid)?.isPrivate === true;
  const player = (pid: string, fallback: string | null = null): ProgressionPlayer => ({
    participantId: pid,
    displayName: stats.players.get(pid)?.displayName ?? fallback,
  });

  const rejudged = new Map(input.correctedMatches.map((m) => [m.matchId, m]));
  const dated: ProgressionCandidate<ProgressionPlayer>[] = [];
  for (const r of input.rows) {
    if (rejudged.has(r.matchId)) continue;
    if (beforeBoundary(boundaries, r.grade, r.season)) continue;
    if (fillIn(r.participantId)) continue;
    dated.push({
      player: player(r.participantId, r.displayName),
      grade: r.grade,
      season: r.season,
      matchId: r.matchId,
      matchDate: r.matchDate,
      value: { primary: r.primary, secondary: r.secondary },
    });
  }
  for (const m of input.correctedMatches) {
    const meta = m.lines.find((l) => l.matchId === m.matchId);
    if (!meta || meta.season === null) continue;
    if (input.grade !== undefined && meta.grade !== input.grade) continue;
    if (beforeBoundary(boundaries, meta.grade, meta.season)) continue;
    const best = bestOfMatchLines(kind, m.lines, (guid) => {
      const keeper = identity.canonicalOf(guid);
      return fillIn(keeper) || isPrivate(keeper);
    });
    if (!best) continue;
    dated.push({
      player: player(identity.canonicalOf(best.participantId)),
      grade: meta.grade,
      season: meta.season,
      matchId: m.matchId,
      matchDate: meta.matchDate ?? null,
      value: best.value,
    });
  }

  const undated: ProgressionCandidate<ProgressionPlayer>[] = [];
  for (const b of stats.buckets) {
    if (b.source !== "history") continue;
    if (input.grade !== undefined && b.grade !== input.grade) continue;
    if (isPrivate(b.participantId)) continue;
    const value: InningsValue | null =
      kind === "highScore"
        ? b.highScore === null
          ? null
          : { primary: b.highScore, secondary: b.highScoreNotOut ? 1 : 0 }
        : b.bestBowlingWickets === null || b.bestBowlingWickets <= 0
          ? null
          : { primary: b.bestBowlingWickets, secondary: b.bestBowlingRuns ?? 0 };
    if (value === null) continue;
    const candidate: ProgressionCandidate<ProgressionPlayer> = {
      player: player(b.participantId),
      grade: b.grade,
      season: b.season,
      matchId: null,
      matchDate: null,
      value,
      seasonLevel: true,
    };
    if (b.careerGrain || b.season === null) undated.push(candidate);
    else dated.push(candidate);
  }
  return { dated, undated };
}

// ── Loaders (central + tenant DB) ──────────────────────────────────────────

/**
 * Each corrected match that can move the progression, with all of its club
 * lines and the corrected ones replaced. A handful of matches at most — one
 * per correction — and nothing at all without corrections. One (cached)
 * lines read covers every corrected match's players.
 */
export async function loadCorrectedMatchLines(
  clubId: number,
  kind: RecordKind,
  corrected: readonly CorrectedLine[],
): Promise<CorrectedMatchLines[]> {
  const touched = corrected.filter((c) => touchesProgression(kind, c));
  if (touched.length === 0) return [];
  const central = await import("@workspace/db/central-queries");
  const fixed = new Map<string, CentralParticipantMatchLine>();
  for (const c of corrected) fixed.set(`${c.after.participantId}\u0000${c.after.matchId}`, c.after);
  const matchIds = [...new Set(touched.map((c) => c.after.matchId))];
  const guids = await Promise.all(
    matchIds.map((matchId) => central.centralClubMatchParticipantIds(clubId, matchId)),
  );
  const lines = await central.centralParticipantMatchLines(clubId, guids.flat());
  return matchIds.map((matchId) => ({
    matchId,
    lines: lines
      .filter((l) => l.matchId === matchId)
      .map((l) => fixed.get(`${l.participantId}\u0000${l.matchId}`) ?? l),
  }));
}
