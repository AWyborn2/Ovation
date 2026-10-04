import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  boundaryFor,
  clubCorrectionsTable,
  clubHistoryBatchesTable,
  clubHistoryBoundariesTable,
  CLUB_HISTORY_SUPPLEMENT_SOURCE,
  clubHistoryRowsTable,
  playerIdMapTable,
  type ClubHistoryGrain,
  type CorrectableField,
  type Player,
  type PlayerGradeStat,
} from "@workspace/db";
import type {
  CentralClubRecords,
  CentralLineBatting,
  CentralLineBowling,
  CentralMilestone,
  CentralMilestoneInputs,
  CentralParticipantMatchLine,
  CentralPartialFigures,
  CentralPartials,
  CentralPlayerCareer,
  CentralPlayerDetail,
  CentralPlayerSeasonRow,
  CentralRecordLeader,
  CentralRecordLeaderMetric,
  CentralRecordsFilter,
  MilestoneOverlay,
  MilestoneTiers,
} from "@workspace/db/central-queries";
import { resolveCuration, type CurationOverlay } from "./central-curation";
import { isCapOnlyRow, loadCapOnlyPlayers } from "./cap-only-players";

/**
 * The per-tenant club overlay for central reads (hybrid stats plan U6 identity
 * slice; U10 adds corrections, the boundary and club history — see the second
 * half of this file).
 *
 * Today it carries player IDENTITY: the tenant's crosswalk (GUID -> app int id)
 * with its CONFIRMED merges applied, loaded once per request and handed to the
 * central reads and their route mapping. Every central-read handler used to
 * build its own `intByGuid` from `player_id_map`; they now load this instead,
 * so a confirmed merge folds everywhere at once.
 *
 * Rules (KTD2, docs/solutions/architecture-patterns/
 * central-read-player-identity-crosswalk.md):
 *   - `merges` goes into the central reads, which fold each merged-away GUID
 *     into its keeper BEFORE grouping (lib/db/src/central/merges.ts).
 *   - A merged group presents under ONE id: the keeper's crosswalk id (or, when
 *     the keeper has no row, the lowest id among the group). Merged-away GUIDs
 *     keep their own crosswalk rows (undo is lossless), and those ids resolve to
 *     the keeper — so a `/players/:id` link or a curated row (award, photo)
 *     that points at a merged-away id lands on the keeper.
 *   - Names: the keeper's curated name, else the central name passed in.
 *   - Privacy is a central fact: the central reads mark a keeper private when
 *     any GUID in its group is; identity-only surfaces (the scorecard) ask
 *     `mergedPrivateKeepers(identity.merges)`.
 *   - Always tenant-scoped: built from THIS tenant's crosswalk and curation.
 */
export interface ClubIdentity {
  /** Confirmed merges, merged-away GUID -> canonical keeper (chains collapsed). */
  merges: Map<string, string>;
  /** Curated display names (GUID -> name). */
  nameByGuid: Map<string, string>;
  /** Every mapped GUID (merged-away ones included) -> the app id its group presents as. */
  intByGuid: Map<string, number>;
  /** The keeper a GUID folds into (itself when not merged away). */
  canonicalOf(guid: string): string;
  /** A GUID's whole group, keeper first. */
  membersOf(guid: string): string[];
  /** Every crosswalk id the GUID's group owns, the presented id first. */
  intsOf(guid: string): number[];
  /** The keeper GUID behind any crosswalk id of this tenant, or null when unmapped. */
  guidForPlayerId(playerId: number): string | null;
  /** The group's display name: the keeper's curated name, else `fallback`. */
  nameFor(guid: string, fallback: string | null): string | null;
  /**
   * The tenant's cap-only players by id (lib/cap-only-players.ts): native rows
   * with a cap number and no stats. They are valid players for curated links
   * and the player page, and have NO GUID, crosswalk row or overlay key — so
   * no stat derivation, leaderboard, directory or count can include them.
   * Empty for every tenant but the one that owns the native players table.
   */
  capOnly: ReadonlyMap<number, Player>;
}

/**
 * Build the identity slice from a tenant's crosswalk rows and curation, plus
 * its cap-only native players (tenant 1 only). Pure.
 */
export function buildClubIdentity(
  crosswalk: readonly { participantId: string; playerId: number }[],
  curation: CurationOverlay,
  capOnlyPlayers: readonly Player[] = [],
): ClubIdentity {
  const merges = curation.canonicalByGuid;
  const canonicalOf = (guid: string) => merges.get(guid) ?? guid;

  const rawInt = new Map(crosswalk.map((r) => [r.participantId, r.playerId]));
  const guidByRawInt = new Map(crosswalk.map((r) => [r.playerId, r.participantId]));

  // Group members, keeper first.
  const groups = new Map<string, string[]>();
  for (const [from, keeper] of merges) {
    const g = groups.get(keeper) ?? [keeper];
    g.push(from);
    groups.set(keeper, g);
  }
  const membersOf = (guid: string): string[] => {
    const keeper = canonicalOf(guid);
    return groups.get(keeper) ?? [keeper];
  };

  // The id a group presents as: the keeper's own row, else the lowest member id.
  const presentedId = (keeper: string): number | undefined => {
    const own = rawInt.get(keeper);
    if (own !== undefined) return own;
    const ids = membersOf(keeper)
      .map((g) => rawInt.get(g))
      .filter((id): id is number => id !== undefined);
    return ids.length > 0 ? Math.min(...ids) : undefined;
  };

  const intByGuid = new Map(rawInt);
  for (const [keeper, members] of groups) {
    const id = presentedId(keeper);
    if (id === undefined) continue;
    for (const g of members) intByGuid.set(g, id);
  }

  // Cap-only players: an id the crosswalk owns is a crosswalk player instead.
  const capOnly = new Map<number, Player>();
  for (const p of capOnlyPlayers) {
    if (isCapOnlyRow(p) && !guidByRawInt.has(p.id)) capOnly.set(p.id, p);
  }

  return {
    capOnly,
    merges,
    nameByGuid: curation.nameByGuid,
    intByGuid,
    canonicalOf,
    membersOf,
    intsOf: (guid) => {
      const members = membersOf(guid);
      const first = intByGuid.get(members[0]!);
      const ids = members
        .map((g) => rawInt.get(g))
        .filter((id): id is number => id !== undefined && id !== first);
      return first === undefined ? ids : [first, ...ids];
    },
    guidForPlayerId: (playerId) => {
      const guid = guidByRawInt.get(playerId);
      return guid === undefined ? null : canonicalOf(guid);
    },
    nameFor: (guid, fallback) => {
      const keeper = canonicalOf(guid);
      return curation.nameByGuid.get(keeper) ?? fallback;
    },
  };
}

/**
 * Anything that can run the overlay's tenant-DB selects: the app pool (`db`,
 * the default everywhere in the API) or a transaction. The cut-over preview
 * (scripts/src/hh-cutover-preview.ts, U13) passes its READ ONLY transaction so
 * it loads the overlay through this exact code path.
 */
export type OverlayReader = Pick<typeof db, "select">;

/** Load the identity slice of a tenant's club overlay (crosswalk + confirmed merges). */
export async function loadClubIdentity(
  tenantId: number,
  reader: OverlayReader = db,
): Promise<ClubIdentity> {
  const [crosswalk, curation, capOnly] = await Promise.all([
    reader
      .select({
        participantId: playerIdMapTable.participantId,
        playerId: playerIdMapTable.playerId,
      })
      .from(playerIdMapTable)
      .where(eq(playerIdMapTable.tenantId, tenantId)),
    resolveCuration(tenantId, reader),
    loadCapOnlyPlayers(tenantId, reader),
  ]);
  return buildClubIdentity(crosswalk, curation, capOnly);
}

// ===========================================================================
// The full club overlay (hybrid stats plan U10; R7, R8, R12, R15; KTD1, KTD5,
// KTD7).
//
// Central supplies every (grade, season) from the club's boundary on; the club
// layer adds what central can't: pre-boundary history, reviewable corrections
// and fill-in exclusion, on top of the identity slice above. It is loaded once
// per request and applied AFTER the club-cached central reads, never inside
// them. The central reads it uses return (participant, app grade, season)
// partial aggregates (lib/db/src/central/partials.ts) and the overlay does the
// final aggregation, in this order (High-Level Technical Design):
//
//   1. Drop central buckets in a (grade, season) before the boundary.
//   2. Drop junior / unmapped grades and fill-ins (ids >= 90000).
//   3. Apply corrections as deltas to their (participant, grade, season)
//      bucket; a correction whose recorded previous value no longer matches
//      central is skipped and reported (KTD7).
//   4. Fold confirmed merges (already folded in the cached partials, keyed by
//      the tenant's merges exactly as U6's reads; corrections, which name a
//      raw GUID, fold here).
//   5. A keeper is private when any GUID folded into it is.
//   6. Map GUIDs to the tenant's player ids.
//   7. Union club history rows for the seasons before the boundary.
//      Career-grain rows (no season) add once to career totals and never to a
//      season view.
//   8. Aggregate (the views below).
//
// One source per (grade, season) (KTD5): with a boundary B for a grade, central
// supplies B and later and history supplies only seasons before B. With no
// boundary, central supplies everything and history adds nothing
// season-grained (career-grain rows still add).
//
// Safe to deploy before migration 0021: when the club-history tables are
// missing (undefined_table, 42P01) or empty the overlay is INACTIVE and every
// handler keeps its original central read, so today's numbers are unchanged.
// ===========================================================================

/** Ids at or above this are fill-ins / cap-only (never counted — R8). */
export const FILL_IN_ID_FLOOR = 90000;

export interface OverlayBoundary {
  grade: string | null;
  startSeason: number;
}

/** A club history row as the overlay reads it (figures nullable, like the store). */
export interface OverlayHistoryRow {
  /** The stored row's id (a history match's stable key in the match log). */
  id?: number;
  playerId: number;
  grade: string;
  season: number | null;
  grain: ClubHistoryGrain;
  /** Match descriptor (match grain only): ISO date, opposition text, round text. */
  matchDate?: string | null;
  opponent?: string | null;
  round?: string | null;
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
  /**
   * The row belongs to a SUPPLEMENT batch (`club_history_batches.source` =
   * `CLUB_HISTORY_SUPPLEMENT_SOURCE`): a hand-entered season the club keeps as
   * history even though it is at or after the grade's boundary. A supplement
   * season counts only when the player has no central bucket for that same
   * grade and season; otherwise it is ignored and reported, never counted
   * twice. Only season-grain rows can be supplements.
   */
  supplement?: boolean;
}

/** A supplement season the overlay left out because central supplies it. */
export interface IgnoredSupplement {
  playerId: number;
  /** The key the row's player presents under (keeper GUID or `player:<id>`). */
  participantId: string;
  grade: string;
  season: number;
  reason: "central_has_season";
}

/** An ACTIVE correction (removed ones are never loaded). */
export interface OverlayCorrection {
  id: number;
  playhqMatchId: string;
  participantId: string;
  field: CorrectableField;
  previousValue: number;
  newValue: number;
}

/** The tenant's club-layer data (everything beyond identity). */
export interface ClubOverlayData {
  boundaries: OverlayBoundary[];
  history: OverlayHistoryRow[];
  corrections: OverlayCorrection[];
}

export interface ClubOverlay {
  identity: ClubIdentity;
  data: ClubOverlayData;
  /**
   * True when the tenant has a boundary, a history row or an active
   * correction. Inactive = handlers keep their original central reads, so a
   * tenant with no club layer gets exactly today's numbers.
   */
  active: boolean;
}

export const EMPTY_OVERLAY_DATA: ClubOverlayData = {
  boundaries: [],
  history: [],
  corrections: [],
};

export function overlayIsActive(data: ClubOverlayData): boolean {
  return data.boundaries.length > 0 || data.history.length > 0 || data.corrections.length > 0;
}

/** One figure bucket after the overlay: a player's (grade, season) from ONE source. */
export interface ClubStatsBucket extends CentralPartialFigures {
  /** Keeper GUID; `player:<id>` for a history player with no crosswalk row. */
  participantId: string;
  grade: string;
  /** Season start year; null for career-grain history (and unparseable central seasons). */
  season: number | null;
  source: "central" | "history";
  /** Career-grain history: counts in career totals, never in a season view. */
  careerGrain: boolean;
}

export type StaleCorrectionReason = "mismatch" | "not_found" | "before_boundary";

export interface StaleCorrection extends OverlayCorrection {
  reason: StaleCorrectionReason;
  /** The central figure now (null when the line wasn't found). */
  centralValue: number | null;
}

/** Per-(keeper, match) corrected deltas, for the milestone walk. */
export type MatchDeltas = Map<string, { runs: number; wickets: number; dismissals: number }>;

export interface ClubStats {
  buckets: ClubStatsBucket[];
  /** Name + privacy per participant key (history-only players are public, unnamed unless curated). */
  players: Map<string, { displayName: string | null; isPrivate: boolean }>;
  /** GUID (or `player:<id>`) -> the tenant player id it presents as. */
  intByGuid: Map<string, number>;
  corrections: { applied: number; stale: StaleCorrection[] };
  matchDeltas: MatchDeltas;
  /** The corrected lines themselves, for the per-match surfaces. */
  correctedLines: CorrectedLine[];
  /**
   * Supplement seasons (hand-entered, at or after the boundary): how many rows
   * counted, and the ones left out because central has that grade and season.
   */
  supplements: { used: number; ignored: IgnoredSupplement[] };
}

/**
 * How a history row counts for a club (the ONE rule every surface uses):
 *   - "history": career grain, or a season before the grade's boundary;
 *   - "supplement": a supplement batch's SEASON row at or after the boundary
 *     (or with no boundary at all) — counts only where the player has no
 *     central bucket for that grade and season;
 *   - null: central supplies that season, so the row never counts.
 * Fill-ins / cap-only ids and non-senior grades never count.
 */
export function historyRowSource(
  r: OverlayHistoryRow,
  boundaries: readonly OverlayBoundary[],
  isSeniorGrade: (grade: string) => boolean,
): "history" | "supplement" | null {
  if (r.playerId <= 0 || r.playerId >= FILL_IN_ID_FLOOR) return null;
  if (!isSeniorGrade(r.grade)) return null;
  if (r.grain === "career") return "history";
  if (r.season === null) return null;
  const b = boundaryFor(boundaries, r.grade);
  if (b !== null && r.season < b) return "history";
  return r.supplement === true && r.grain === "season" ? "supplement" : null;
}

const HISTORY_PREFIX = "player:";

/** The overlay key for a tenant player id with no crosswalk row. */
export function historyKey(playerId: number): string {
  return `${HISTORY_PREFIX}${playerId}`;
}

/** True when central doesn't supply (grade, season) for this club: it's before the boundary. */
export function beforeBoundary(
  boundaries: readonly OverlayBoundary[],
  grade: string,
  season: number | null,
): boolean {
  if (season === null) return false;
  const b = boundaryFor(boundaries, grade);
  return b !== null && season < b;
}

// ── Corrections (KTD7) ──────────────────────────────────────────────────────

/** The central figure a correction field reads from one match line. */
export function lineFieldValue(line: CentralParticipantMatchLine, field: CorrectableField): number {
  const bat = line.batting;
  const bowl = line.bowling;
  const sum = <T>(xs: readonly T[], f: (x: T) => number | null) =>
    xs.reduce((s, x) => s + (f(x) ?? 0), 0);
  switch (field) {
    case "runs":
      return sum(bat, (b) => b.runs);
    case "balls_faced":
      return sum(bat, (b) => b.balls);
    case "fours":
      return sum(bat, (b) => b.fours);
    case "sixes":
      return sum(bat, (b) => b.sixes);
    case "not_out":
      return bat.filter((b) => b.kind === "notout").length;
    case "balls_bowled":
      return sum(bowl, (b) => b.balls);
    case "maidens":
      return sum(bowl, (b) => b.maidens);
    case "runs_conceded":
      return sum(bowl, (b) => b.runs);
    case "wickets":
      return sum(bowl, (b) => b.wickets);
    case "wides":
      return sum(bowl, (b) => b.wides);
    case "no_balls":
      return sum(bowl, (b) => b.noBalls);
    case "catches":
      return line.catches;
    case "stumpings":
      return line.stumpings;
    case "run_outs":
      return line.runOuts;
  }
}

/**
 * The line with one field set to `newValue`. Deltas land on the first played
 * innings / first spell (a match's figure is what a correction names; for a
 * two-innings match the first innings carries the change). A figure on a line
 * central doesn't have creates it. Pure — never mutates the (cached) input.
 *
 * Two-innings matches (decided deliberately, U10 follow-up): the corrections
 * journal is keyed on (PlayHQ match, participant, field) and records the
 * MATCH figure — it has no innings column, and its one-active-correction
 * unique index is on exactly that key — so a correction cannot name an
 * innings. The whole delta therefore lands on the first played innings (first
 * spell), which keeps every match and career total exact; only the split
 * between a player's two innings is first-innings-weighted. Naming an innings
 * needs an `innings` column and a wider unique key (a migration).
 */
export function correctLine(
  line: CentralParticipantMatchLine,
  field: CorrectableField,
  newValue: number,
): CentralParticipantMatchLine {
  const delta = newValue - lineFieldValue(line, field);
  const out: CentralParticipantMatchLine = {
    ...line,
    batting: line.batting.map((b) => ({ ...b })),
    bowling: line.bowling.map((b) => ({ ...b })),
  };
  const innings = (): CentralLineBatting => {
    let b = out.batting.find((x) => x.kind !== "dnb") ?? out.batting[0];
    if (!b) {
      b = { runs: 0, balls: null, fours: 0, sixes: 0, kind: "out" };
      out.batting.push(b);
    }
    if (b.kind === "dnb") b.kind = "out";
    return b;
  };
  const spell = (): CentralLineBowling => {
    let b = out.bowling[0];
    if (!b) {
      b = { balls: null, maidens: null, runs: 0, wickets: 0, wides: 0, noBalls: 0 };
      out.bowling.push(b);
    }
    return b;
  };
  switch (field) {
    case "runs":
      innings().runs += delta;
      break;
    case "balls_faced": {
      const b = innings();
      b.balls = (b.balls ?? 0) + delta;
      break;
    }
    case "fours":
      innings().fours += delta;
      break;
    case "sixes":
      innings().sixes += delta;
      break;
    case "not_out": {
      // 0 -> 1 turns the first "out" innings not out; 1 -> 0 the reverse.
      const from = delta > 0 ? "out" : "notout";
      const to = delta > 0 ? "notout" : "out";
      const b = out.batting.find((x) => x.kind === from) ?? (delta > 0 ? innings() : undefined);
      if (b) b.kind = to;
      break;
    }
    case "balls_bowled": {
      const b = spell();
      b.balls = (b.balls ?? 0) + delta;
      break;
    }
    case "maidens": {
      const b = spell();
      b.maidens = (b.maidens ?? 0) + delta;
      break;
    }
    case "runs_conceded":
      spell().runs += delta;
      break;
    case "wickets":
      spell().wickets += delta;
      break;
    case "wides":
      spell().wides += delta;
      break;
    case "no_balls":
      spell().noBalls += delta;
      break;
    case "catches":
      out.catches += delta;
      break;
    case "stumpings":
      out.stumpings += delta;
      break;
    case "run_outs":
      out.runOuts += delta;
      break;
  }
  return out;
}

/** A bucket's figures computed from its match lines — the partial read's rules, in JS. */
export function figuresOfLines(
  lines: readonly CentralParticipantMatchLine[],
): Omit<CentralPartialFigures, "games" | "batLines" | "bowlLines"> {
  const f = {
    innings: 0,
    notOuts: 0,
    runs: 0,
    ballsFaced: null as number | null,
    runsOffBallsFaced: null as number | null,
    fours: 0,
    sixes: 0,
    fifties: 0,
    hundreds: 0,
    highScore: null as number | null,
    highScoreNotOut: false,
    ballsBowled: null as number | null,
    runsOffBallsBowled: null as number | null,
    wicketsOffBallsBowled: null as number | null,
    maidens: null as number | null,
    runsConceded: 0,
    wickets: 0,
    wides: 0,
    noBalls: 0,
    fiveWickets: 0,
    bestBowlingWickets: null as number | null,
    bestBowlingRuns: null as number | null,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
  };
  for (const l of lines) {
    for (const b of l.batting) {
      if (b.kind === "dnb") continue;
      f.innings += 1;
      f.runs += b.runs;
      if (b.kind === "notout") f.notOuts += 1;
      if (b.balls !== null) f.ballsFaced = (f.ballsFaced ?? 0) + b.balls;
      if (b.balls !== null && b.balls > 0) {
        f.runsOffBallsFaced = (f.runsOffBallsFaced ?? 0) + b.runs;
      }
      f.fours += b.fours;
      f.sixes += b.sixes;
      if (b.runs >= 100) f.hundreds += 1;
      else if (b.runs >= 50) f.fifties += 1;
      const no = b.kind === "notout";
      if (f.highScore === null || b.runs > f.highScore || (b.runs === f.highScore && no)) {
        f.highScoreNotOut = f.highScore === b.runs ? f.highScoreNotOut || no : no;
        f.highScore = b.runs;
      }
    }
    for (const b of l.bowling) {
      if (b.balls !== null) f.ballsBowled = (f.ballsBowled ?? 0) + b.balls;
      if (b.balls !== null && b.balls > 0) {
        f.runsOffBallsBowled = (f.runsOffBallsBowled ?? 0) + b.runs;
        f.wicketsOffBallsBowled = (f.wicketsOffBallsBowled ?? 0) + b.wickets;
      }
      if (b.maidens !== null) f.maidens = (f.maidens ?? 0) + b.maidens;
      f.runsConceded += b.runs;
      f.wickets += b.wickets;
      f.wides += b.wides;
      f.noBalls += b.noBalls;
      if (b.wickets >= 5) f.fiveWickets += 1;
      if (
        f.bestBowlingWickets === null ||
        b.wickets > f.bestBowlingWickets ||
        (b.wickets === f.bestBowlingWickets && b.runs < (f.bestBowlingRuns ?? Infinity))
      ) {
        f.bestBowlingWickets = b.wickets;
        f.bestBowlingRuns = b.runs;
      }
    }
    f.catches += l.catches;
    f.stumpings += l.stumpings;
    f.runOuts += l.runOuts;
  }
  return f;
}

const ADDITIVE = [
  "innings",
  "notOuts",
  "runs",
  "fours",
  "sixes",
  "fifties",
  "hundreds",
  "runsConceded",
  "wickets",
  "wides",
  "noBalls",
  "fiveWickets",
  "catches",
  "stumpings",
  "runOuts",
] as const;
const ADDITIVE_NULLABLE = [
  "ballsFaced",
  "runsOffBallsFaced",
  "ballsBowled",
  "runsOffBallsBowled",
  "wicketsOffBallsBowled",
  "maidens",
] as const;

/** The per-bucket change a set of corrections makes (additive deltas + the new bests). */
export interface BucketAdjustment {
  participantId: string;
  grade: string;
  season: number | null;
  before: ReturnType<typeof figuresOfLines>;
  after: ReturnType<typeof figuresOfLines>;
}

export interface ResolvedCorrections {
  applied: number;
  stale: StaleCorrection[];
  adjustments: BucketAdjustment[];
  matchDeltas: MatchDeltas;
  /**
   * Every corrected line, as central has it (`before`) and with its applied
   * corrections (`after`) — what the per-match surfaces (match log, scorecard,
   * centuries, head-to-head, record progression) display.
   */
  lines: CorrectedLine[];
}

/** One participant's line in one match, before and after the club's corrections. */
export interface CorrectedLine {
  before: CentralParticipantMatchLine;
  after: CentralParticipantMatchLine;
}

const bucketKeyOf = (pid: string, grade: string, season: number | null) =>
  `${pid}\u0000${grade}\u0000${season ?? ""}`;

/**
 * Check every active correction against central and work out what it changes.
 * `lines` are every senior club-match line of the corrected participants'
 * merge groups (own GUIDs). Pure.
 */
export function resolveCorrections(
  corrections: readonly OverlayCorrection[],
  lines: readonly CentralParticipantMatchLine[],
  opts: {
    canonicalOf: (guid: string) => string;
    boundaries: readonly OverlayBoundary[];
  },
): ResolvedCorrections {
  const result: ResolvedCorrections = {
    applied: 0,
    stale: [],
    adjustments: [],
    matchDeltas: new Map(),
    lines: [],
  };
  if (corrections.length === 0) return result;

  const byMatch = new Map<string, CentralParticipantMatchLine>();
  for (const l of lines) {
    if (l.playhqMatchId) byMatch.set(`${l.participantId}\u0000${l.playhqMatchId}`, l);
  }
  // Corrected copies, keyed like `byMatch`; several fields of one line chain.
  const corrected = new Map<string, CentralParticipantMatchLine>();
  // Stable order: oldest correction first.
  for (const c of [...corrections].sort((a, b) => a.id - b.id)) {
    const k = `${c.participantId}\u0000${c.playhqMatchId}`;
    const line = byMatch.get(k);
    if (!line) {
      result.stale.push({ ...c, reason: "not_found", centralValue: null });
      continue;
    }
    const centralValue = lineFieldValue(line, c.field);
    if (beforeBoundary(opts.boundaries, line.grade, line.season)) {
      result.stale.push({ ...c, reason: "before_boundary", centralValue });
      continue;
    }
    if (centralValue !== c.previousValue) {
      result.stale.push({ ...c, reason: "mismatch", centralValue });
      continue;
    }
    corrected.set(k, correctLine(corrected.get(k) ?? line, c.field, c.newValue));
    result.applied += 1;
  }
  if (corrected.size === 0) return result;

  // Every affected (keeper, grade, season) bucket, recomputed from the whole
  // group's lines in it before and after — so the high score / best bowling
  // stay exact, not just the sums.
  const affected = new Map<string, { pid: string; grade: string; season: number | null }>();
  for (const l of corrected.values()) {
    const pid = opts.canonicalOf(l.participantId);
    affected.set(bucketKeyOf(pid, l.grade, l.season), { pid, grade: l.grade, season: l.season });
  }
  for (const { pid, grade, season } of affected.values()) {
    const inBucket = lines.filter(
      (l) => opts.canonicalOf(l.participantId) === pid && l.grade === grade && l.season === season,
    );
    const fixed = inBucket.map(
      (l) => corrected.get(`${l.participantId}\u0000${l.playhqMatchId}`) ?? l,
    );
    result.adjustments.push({
      participantId: pid,
      grade,
      season,
      before: figuresOfLines(inBucket),
      after: figuresOfLines(fixed),
    });
  }
  // Per-match deltas for the milestone walk.
  for (const [k, after] of corrected) {
    const before = byMatch.get(k)!;
    result.lines.push({ before, after });
    const pid = opts.canonicalOf(before.participantId);
    const b = figuresOfLines([before]);
    const a = figuresOfLines([after]);
    const mk = `${pid}\u0000${before.matchId}`;
    const prev = result.matchDeltas.get(mk) ?? { runs: 0, wickets: 0, dismissals: 0 };
    result.matchDeltas.set(mk, {
      runs: prev.runs + (a.runs - b.runs),
      wickets: prev.wickets + (a.wickets - b.wickets),
      dismissals:
        prev.dismissals +
        (a.catches + a.stumpings + a.runOuts - (b.catches + b.stumpings + b.runOuts)),
    });
  }
  return result;
}

/** Apply one adjustment to a bucket (mutates the bucket — a private copy). */
function adjustBucket(bucket: CentralPartialFigures, adj: BucketAdjustment): void {
  for (const k of ADDITIVE) bucket[k] += adj.after[k] - adj.before[k];
  for (const k of ADDITIVE_NULLABLE) {
    const d = (adj.after[k] ?? 0) - (adj.before[k] ?? 0);
    if (d !== 0 || adj.after[k] !== null) bucket[k] = (bucket[k] ?? 0) + d;
  }
  // The bucket's lines are exactly the group's lines in it, so the recomputed
  // bests are the bucket's bests.
  bucket.highScore = adj.after.highScore;
  bucket.highScoreNotOut = adj.after.highScoreNotOut;
  bucket.bestBowlingWickets = adj.after.bestBowlingWickets;
  bucket.bestBowlingRuns = adj.after.bestBowlingRuns;
}

// ── History rows ───────────────────────────────────────────────────────────

function historyFigures(r: OverlayHistoryRow): CentralPartialFigures {
  const match = r.grain === "match";
  const runs = r.runs ?? 0;
  const wickets = r.wickets ?? 0;
  const batted = r.innings !== null ? r.innings > 0 : r.runs !== null;
  const bowled = r.ballsBowled !== null || r.wickets !== null || r.runsConceded !== null;
  // A match row is one appearance; old books rarely fill every derived column,
  // so a match row's 50s / 100s / best figures derive from its own line.
  const innings = r.innings ?? (match && batted ? 1 : 0);
  return {
    games: r.games ?? (match ? 1 : 0),
    batLines: batted ? Math.max(innings, 1) : 0,
    innings,
    notOuts: r.notOuts ?? (match && r.highScoreNotOut ? 1 : 0),
    runs,
    ballsFaced: r.ballsFaced,
    // A history row's balls and runs are the same innings, so they pair up.
    runsOffBallsFaced: r.ballsFaced !== null && r.ballsFaced > 0 ? runs : null,
    fours: r.fours ?? 0,
    sixes: r.sixes ?? 0,
    fifties: r.fifties ?? (match && batted && runs >= 50 && runs < 100 ? 1 : 0),
    hundreds: r.hundreds ?? (match && batted && runs >= 100 ? 1 : 0),
    highScore: r.highScore ?? (match && batted ? runs : null),
    // A match row is one innings, so a not out IS the high score's not out.
    highScoreNotOut: r.highScoreNotOut ?? (match && (r.notOuts ?? 0) > 0),
    bowlLines: bowled ? 1 : 0,
    ballsBowled: r.ballsBowled,
    runsOffBallsBowled: r.ballsBowled !== null && r.ballsBowled > 0 ? (r.runsConceded ?? 0) : null,
    wicketsOffBallsBowled: r.ballsBowled !== null && r.ballsBowled > 0 ? wickets : null,
    maidens: r.maidens,
    runsConceded: r.runsConceded ?? 0,
    wickets,
    wides: 0,
    noBalls: 0,
    fiveWickets: r.fiveWickets ?? (match && wickets >= 5 ? 1 : 0),
    bestBowlingWickets: r.bestBowlingWickets ?? (match && bowled ? wickets : null),
    bestBowlingRuns:
      r.bestBowlingWickets !== null
        ? r.bestBowlingRuns
        : match && bowled
          ? (r.runsConceded ?? 0)
          : null,
    catches: r.catches ?? 0,
    stumpings: r.stumpings ?? 0,
    runOuts: r.runOuts ?? 0,
  };
}

function mergeFigures(into: CentralPartialFigures, add: CentralPartialFigures): void {
  into.games += add.games;
  into.batLines += add.batLines;
  into.bowlLines += add.bowlLines;
  for (const k of ADDITIVE) into[k] += add[k];
  for (const k of ADDITIVE_NULLABLE) {
    if (into[k] === null && add[k] === null) continue;
    into[k] = (into[k] ?? 0) + (add[k] ?? 0);
  }
  if (
    add.highScore !== null &&
    (into.highScore === null ||
      add.highScore > into.highScore ||
      (add.highScore === into.highScore && add.highScoreNotOut))
  ) {
    into.highScoreNotOut =
      into.highScore === add.highScore
        ? into.highScoreNotOut || add.highScoreNotOut
        : add.highScoreNotOut;
    into.highScore = add.highScore;
  }
  if (
    add.bestBowlingWickets !== null &&
    (into.bestBowlingWickets === null ||
      add.bestBowlingWickets > into.bestBowlingWickets ||
      (add.bestBowlingWickets === into.bestBowlingWickets &&
        (add.bestBowlingRuns ?? 0) < (into.bestBowlingRuns ?? Infinity)))
  ) {
    into.bestBowlingWickets = add.bestBowlingWickets;
    into.bestBowlingRuns = add.bestBowlingRuns;
  }
}

// ── Apply ──────────────────────────────────────────────────────────────────

export interface ApplyClubOverlayInput {
  partials: CentralPartials;
  /** Lines of the corrected participants' merge groups (empty without corrections). */
  lines: readonly CentralParticipantMatchLine[];
  identity: ClubIdentity;
  data: ClubOverlayData;
  /** Senior app-grade test (`isSeniorAppGrade`), injected so this stays pure. */
  isSeniorGrade: (grade: string) => boolean;
}

/** Steps 1–7 of the apply order. Pure: the (cached) partials are never mutated. */
export function applyClubOverlay(input: ApplyClubOverlayInput): ClubStats {
  const { partials, identity, data, isSeniorGrade } = input;
  const intByGuid = new Map(identity.intByGuid);
  const fillIn = (pid: string) => (intByGuid.get(pid) ?? 0) >= FILL_IN_ID_FLOOR;

  // 1–2: central buckets from the boundary on, senior grades, no fill-ins.
  const central = new Map<string, ClubStatsBucket>();
  for (const p of partials.buckets) {
    if (!isSeniorGrade(p.grade)) continue;
    if (beforeBoundary(data.boundaries, p.grade, p.season)) continue;
    if (fillIn(p.participantId)) continue;
    central.set(bucketKeyOf(p.participantId, p.grade, p.season), {
      ...p,
      source: "central",
      careerGrain: false,
    });
  }

  // 3–4: corrections (raw GUIDs fold to their keeper here).
  const resolved = resolveCorrections(data.corrections, input.lines, {
    canonicalOf: identity.canonicalOf,
    boundaries: data.boundaries,
  });
  for (const adj of resolved.adjustments) {
    const b = central.get(bucketKeyOf(adj.participantId, adj.grade, adj.season));
    if (b) adjustBucket(b, adj);
  }

  // 5: names + privacy (the partial read already folded merged privacy).
  const players = new Map<string, { displayName: string | null; isPrivate: boolean }>();
  for (const p of partials.players) {
    players.set(p.participantId, { displayName: p.displayName, isPrivate: p.isPrivate });
  }

  // 6–7: history rows before the boundary, keyed to the player's keeper —
  // plus SUPPLEMENT seasons (hand-entered, at or after the boundary), each
  // only where the player has no central bucket for that grade and season.
  const history = new Map<string, ClubStatsBucket>();
  const supplements: ClubStats["supplements"] = { used: 0, ignored: [] };
  for (const r of data.history) {
    // Season-grained history only where central does NOT supply the season.
    const rowSource = historyRowSource(r, data.boundaries, isSeniorGrade);
    if (rowSource === null) continue;
    const careerGrain = r.grain === "career";
    const guid = identity.guidForPlayerId(r.playerId);
    const pid = guid ?? historyKey(r.playerId);
    if (rowSource === "supplement") {
      if (fillIn(pid)) continue;
      // `central` holds every bucket central supplies for the keeper (a
      // roster-only appearance included), merges already folded.
      if (central.has(bucketKeyOf(pid, r.grade, r.season))) {
        supplements.ignored.push({
          playerId: r.playerId,
          participantId: pid,
          grade: r.grade,
          season: r.season as number,
          reason: "central_has_season",
        });
        continue;
      }
      supplements.used += 1;
    }
    if (guid === null) intByGuid.set(pid, r.playerId);
    if (fillIn(pid)) continue;
    const season = careerGrain ? null : r.season;
    const key = `${bucketKeyOf(pid, r.grade, season)}\u0000${careerGrain ? "c" : "s"}`;
    let b = history.get(key);
    if (!b) {
      b = {
        participantId: pid,
        grade: r.grade,
        season,
        source: "history",
        careerGrain,
        ...zeroFigures(),
      };
      history.set(key, b);
    }
    mergeFigures(b, historyFigures(r));
    if (!players.has(pid)) {
      players.set(pid, { displayName: identity.nameFor(pid, null), isPrivate: false });
    }
  }

  return {
    buckets: [...central.values(), ...history.values()],
    players,
    intByGuid,
    corrections: { applied: resolved.applied, stale: resolved.stale },
    matchDeltas: resolved.matchDeltas,
    correctedLines: resolved.lines,
    supplements,
  };
}

function zeroFigures(): CentralPartialFigures {
  return {
    games: 0,
    batLines: 0,
    innings: 0,
    notOuts: 0,
    runs: 0,
    ballsFaced: null,
    runsOffBallsFaced: null,
    fours: 0,
    sixes: 0,
    fifties: 0,
    hundreds: 0,
    highScore: null,
    highScoreNotOut: false,
    bowlLines: 0,
    ballsBowled: null,
    runsOffBallsBowled: null,
    wicketsOffBallsBowled: null,
    maidens: null,
    runsConceded: 0,
    wickets: 0,
    wides: 0,
    noBalls: 0,
    fiveWickets: 0,
    bestBowlingWickets: null,
    bestBowlingRuns: null,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
  };
}

// ── Views (step 8: aggregate) ───────────────────────────────────────────────

function sumBuckets(buckets: readonly ClubStatsBucket[]): CentralPartialFigures {
  const out = zeroFigures();
  for (const b of buckets) mergeFigures(out, b);
  return out;
}

function groupBy<T>(xs: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
// Central buckets have a high score only when they have a played innings; a
// history row may record one without an innings count.
const hsText = (f: CentralPartialFigures) =>
  f.highScore === null ? null : `${f.highScore}${f.highScoreNotOut ? "*" : ""}`;

/** Career rows, one per player — the shape `centralPlayerCareers` returns. */
export function clubCareers(stats: ClubStats): CentralPlayerCareer[] {
  const out: CentralPlayerCareer[] = [];
  for (const [pid, bs] of groupBy(stats.buckets, (b) => b.participantId)) {
    const f = sumBuckets(bs);
    const p = stats.players.get(pid);
    out.push({
      participantId: pid,
      displayName: p?.displayName ?? null,
      isPrivate: p?.isPrivate === true,
      games: f.games,
      runs: f.runs,
      wickets: f.wickets,
      grades: [...new Set(bs.map((b) => b.grade))].sort(),
    });
  }
  return out;
}

/** One player's detail (per-grade career + totals) — the `centralPlayerDetail` shape. */
export function clubPlayerDetail(
  stats: ClubStats,
  participantId: string,
): CentralPlayerDetail | null {
  const mine = stats.buckets.filter((b) => b.participantId === participantId);
  if (mine.length === 0) return null;
  const p = stats.players.get(participantId);
  const rows: PlayerGradeStat[] = [...groupBy(mine, (b) => b.grade)]
    .map(([grade, bs]) => {
      const f = sumBuckets(bs);
      const dismissals = f.innings - f.notOuts;
      return {
        id: 0,
        playerId: 0,
        surname: "",
        givenName: "",
        grade,
        season: null,
        games: f.games,
        innings: f.innings,
        notOuts: f.notOuts,
        runs: f.runs,
        batAvg: dismissals > 0 ? round2(f.runs / dismissals) : null,
        highScore: hsText(f),
        fifties: f.fifties,
        hundreds: f.hundreds,
        wickets: f.wickets,
        runsConceded: f.runsConceded,
        bowlAvg: f.wickets > 0 ? round2(f.runsConceded / f.wickets) : null,
        bestBowling:
          f.bestBowlingWickets !== null && f.bestBowlingWickets > 0
            ? `${f.bestBowlingWickets}/${f.bestBowlingRuns ?? 0}`
            : null,
        fiveWickets: f.fiveWickets,
        // Fielding from both sources: central's classified fielding rows from
        // the boundary on, the club's own history before it (the plain
        // central detail has no fielding at all, which left a history-only
        // career's catches blank).
        catches: f.catches,
        stumpings: f.stumpings,
        runOuts: f.runOuts,
      };
    })
    .sort((x, y) => x.grade.localeCompare(y.grade));
  return {
    participantId,
    displayName: p?.displayName ?? null,
    isPrivate: p?.isPrivate === true,
    games: rows.reduce((s, r) => s + (r.games ?? 0), 0),
    runs: rows.reduce((s, r) => s + (r.runs ?? 0), 0),
    wickets: rows.reduce((s, r) => s + (r.wickets ?? 0), 0),
    grades: rows.map((r) => r.grade),
    stats: rows,
  };
}

/**
 * One player's per-(grade, season) rows — the `centralPlayerSeasons` shape.
 * Career-grain history never appears here (it has no season). Private -> [].
 */
export function clubPlayerSeasons(
  stats: ClubStats,
  participantId: string,
): CentralPlayerSeasonRow[] {
  if (stats.players.get(participantId)?.isPrivate) return [];
  const mine = stats.buckets.filter(
    (b) => b.participantId === participantId && !b.careerGrain && b.season !== null,
  );
  const nz = (n: number): number | null => (n === 0 ? null : n);
  return [...groupBy(mine, (b) => `${b.grade}\u0000${b.season}`).values()]
    .map((bs) => {
      const f = sumBuckets(bs);
      const dismissals = f.innings - f.notOuts;
      return {
        grade: bs[0]!.grade,
        season: bs[0]!.season as number,
        games: nz(f.games),
        innings: nz(f.innings),
        notOuts: nz(f.notOuts),
        runs: nz(f.runs),
        batAvg: dismissals > 0 ? f.runs / dismissals : null,
        highScore: hsText(f),
        fifties: nz(f.fifties),
        hundreds: nz(f.hundreds),
        wickets: nz(f.wickets),
        runsConceded: nz(f.runsConceded),
        bowlAvg: f.wickets > 0 ? f.runsConceded / f.wickets : null,
        bestBowling:
          f.bestBowlingWickets !== null
            ? `${f.bestBowlingWickets}/${f.bestBowlingRuns ?? 0}`
            : null,
        fiveWickets: nz(f.fiveWickets),
        catches: nz(f.catches),
        stumpings: nz(f.stumpings),
        runOuts: nz(f.runOuts),
        ballsFaced: f.ballsFaced,
        ballsBowled: f.ballsBowled,
        maidens: f.maidens,
      };
    })
    .sort((x, y) => x.grade.localeCompare(y.grade) || x.season - y.season);
}

function splitName(displayName: string): { givenName: string; surname: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { givenName: "", surname: "" };
  if (parts.length === 1) return { givenName: parts[0] ?? "", surname: "" };
  return { givenName: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] ?? "" };
}

/**
 * The per-grade batting leaderboard — the `centralGradeLeaderboard` shape
 * (private players masked, bowling columns null). With `seasonStartYear`,
 * only that season's buckets (career-grain history excluded).
 */
export function clubGradeLeaderboard(
  stats: ClubStats,
  grade: string,
  opts: { seasonStartYear?: number; nameByGuid?: Map<string, string> } = {},
): PlayerGradeStat[] {
  const scoped = stats.buckets.filter(
    (b) =>
      b.grade === grade &&
      (opts.seasonStartYear === undefined || (!b.careerGrain && b.season === opts.seasonStartYear)),
  );
  const rows: PlayerGradeStat[] = [];
  for (const [pid, bs] of groupBy(scoped, (b) => b.participantId)) {
    const f = sumBuckets(bs);
    // A BATTING leaderboard: only players with a batting line in scope. Their
    // games, though, are every appearance in scope (R7) — a season they only
    // bowled in or only made the team sheet still counts, exactly as it does
    // in their career and on the plain central leaderboard.
    if (f.batLines === 0) continue;
    const p = stats.players.get(pid);
    const isPrivate = p?.isPrivate === true;
    const name = isPrivate
      ? { givenName: "Private", surname: "Player" }
      : splitName(opts.nameByGuid?.get(pid) ?? p?.displayName ?? pid);
    const dismissals = f.innings - f.notOuts;
    const id = stats.intByGuid.get(pid) ?? 0;
    rows.push({
      id,
      playerId: id,
      surname: name.surname,
      givenName: name.givenName,
      grade,
      season: null,
      games: f.games,
      innings: f.innings,
      notOuts: f.notOuts,
      runs: f.runs,
      batAvg: dismissals > 0 ? round2(f.runs / dismissals) : null,
      highScore: hsText(f),
      fifties: f.fifties,
      hundreds: f.hundreds,
      wickets: null,
      runsConceded: null,
      bowlAvg: null,
      bestBowling: null,
      fiveWickets: null,
      catches: f.catches,
      stumpings: f.stumpings,
      runOuts: f.runOuts,
    });
  }
  rows.sort(
    (x, y) =>
      (y.games ?? 0) - (x.games ?? 0) ||
      (y.runs ?? 0) - (x.runs ?? 0) ||
      x.surname.localeCompare(y.surname),
  );
  return rows;
}

/** Buckets inside a records filter. A season span excludes career-grain history. */
function inRecordsScope(b: ClubStatsBucket, filter: CentralRecordsFilter): boolean {
  if (filter.grade !== undefined && b.grade !== filter.grade) return false;
  if (filter.fromSeason !== undefined || filter.toSeason !== undefined) {
    if (b.careerGrain || b.season === null) return false;
    if (filter.fromSeason !== undefined && b.season < filter.fromSeason) return false;
    if (filter.toSeason !== undefined && b.season > filter.toSeason) return false;
  }
  return true;
}

/** Record leaders for one metric — the `centralRecordLeaders` shape. */
export function clubRecordLeaders(
  stats: ClubStats,
  metric: CentralRecordLeaderMetric,
  filter: CentralRecordsFilter = {},
): CentralRecordLeader[] {
  const lastSeason = new Map<string, number>();
  for (const b of stats.buckets) {
    if (b.season === null || b.careerGrain) continue;
    if (b.season > (lastSeason.get(b.participantId) ?? -Infinity)) {
      lastSeason.set(b.participantId, b.season);
    }
  }
  const pick = (f: CentralPartialFigures): number =>
    metric === "runs"
      ? f.runs
      : metric === "wickets"
        ? f.wickets
        : metric === "catches"
          ? f.catches
          : metric === "hundreds"
            ? f.hundreds
            : f.games;
  const out: CentralRecordLeader[] = [];
  const scoped = stats.buckets.filter((b) => inRecordsScope(b, filter));
  for (const [pid, bs] of groupBy(scoped, (b) => b.participantId)) {
    const p = stats.players.get(pid);
    if (p?.isPrivate) continue;
    const value = pick(sumBuckets(bs));
    if (value <= 0) continue;
    out.push({
      participantId: pid,
      displayName: p?.displayName ?? null,
      value,
      lastSeason: lastSeason.get(pid) ?? null,
    });
  }
  return out.sort(
    (a, b) => b.value - a.value || (a.displayName ?? "").localeCompare(b.displayName ?? ""),
  );
}

/** Top-N leaders for the overview widgets (the `centralAllTimeLeaders` shape). */
export function clubTopLeaders(
  stats: ClubStats,
  metric: "runs" | "wickets",
  filter: CentralRecordsFilter = {},
  limit = 5,
): { participantId: string; displayName: string | null; value: number }[] {
  return clubRecordLeaders(stats, metric, filter)
    .slice(0, limit)
    .map(({ participantId, displayName, value }) => ({ participantId, displayName, value }));
}

/** All-time club records — the `centralClubRecords` shape. */
export function clubRecords(
  stats: ClubStats,
  filter: CentralRecordsFilter = {},
): CentralClubRecords {
  const scoped = stats.buckets.filter((b) => inRecordsScope(b, filter));
  const isPrivate = (pid: string) => stats.players.get(pid)?.isPrivate === true;
  const nameOf = (pid: string) => stats.players.get(pid)?.displayName ?? null;
  const careers = [...groupBy(scoped, (b) => b.participantId)].map(([pid, bs]) => ({
    pid,
    f: sumBuckets(bs),
    grades: [...new Set(bs.map((b) => b.grade))].sort(),
  }));
  const topBy = (pickFn: (f: CentralPartialFigures) => number) => {
    let best: { pid: string; value: number; grades: string[] } | null = null;
    for (const c of careers) {
      if (isPrivate(c.pid)) continue;
      const value = pickFn(c.f);
      if (value <= 0) continue;
      if (!best || value > best.value) best = { pid: c.pid, value, grades: c.grades };
    }
    return best
      ? {
          participantId: best.pid,
          displayName: nameOf(best.pid),
          value: best.value,
          grades: best.grades,
        }
      : null;
  };
  let hs: ClubStatsBucket | null = null;
  let bb: ClubStatsBucket | null = null;
  for (const b of scoped) {
    if (isPrivate(b.participantId)) continue;
    if (b.highScore !== null) {
      if (
        !hs ||
        b.highScore > (hs.highScore ?? -1) ||
        (b.highScore === hs.highScore && b.highScoreNotOut && !hs.highScoreNotOut)
      ) {
        hs = b;
      }
    }
    if (b.bestBowlingWickets !== null && b.bestBowlingWickets > 0) {
      if (
        !bb ||
        b.bestBowlingWickets > (bb.bestBowlingWickets ?? 0) ||
        (b.bestBowlingWickets === bb.bestBowlingWickets &&
          (b.bestBowlingRuns ?? 0) < (bb.bestBowlingRuns ?? 0))
      ) {
        bb = b;
      }
    }
  }
  return {
    mostGames: topBy((f) => f.games),
    mostRuns: topBy((f) => f.runs),
    mostWickets: topBy((f) => f.wickets),
    mostCatches: topBy((f) => f.catches),
    mostFifties: topBy((f) => f.fifties),
    mostHundreds: topBy((f) => f.hundreds),
    highestScore: hs
      ? {
          participantId: hs.participantId,
          displayName: nameOf(hs.participantId),
          grade: hs.grade,
          value: hsText(hs) ?? "",
        }
      : null,
    bestBowling: bb
      ? {
          participantId: bb.participantId,
          displayName: nameOf(bb.participantId),
          grade: bb.grade,
          value: `${bb.bestBowlingWickets}/${bb.bestBowlingRuns ?? 0}`,
        }
      : null,
  };
}

/**
 * The milestone walk's overlay: drop pre-boundary central matches, seed each
 * keeper with its pre-boundary history totals, apply corrected per-match
 * deltas, and leave fill-ins out. Pure.
 *
 * SUPPLEMENT seasons (hand-entered, at or after the boundary) are carried in
 * the same base totals — they have no match to cross at — and, exactly as in
 * the careers, only where the keeper has no central match in that grade and
 * season. That test needs the walk's own `inputs`; without them no supplement
 * is carried (nothing is guessed).
 */
export function clubMilestoneOverlay(
  overlay: ClubOverlay,
  resolved: Pick<ResolvedCorrections, "matchDeltas">,
  isSeniorGrade: (grade: string) => boolean,
  inputs?: Pick<CentralMilestoneInputs, "metaOf" | "careers">,
): MilestoneOverlay {
  const { identity, data } = overlay;
  const baseTotals = new Map<
    string,
    { games: number; runs: number; wickets: number; dismissals: number }
  >();
  /** `${grade}\u0000${season}` of every central match the keeper appears in. */
  const centralSeasons = new Map<string, Set<string>>();
  const centralHas = (guid: string, grade: string, season: number | null): boolean => {
    let seen = centralSeasons.get(guid);
    if (!seen) {
      seen = new Set();
      const c = inputs?.careers.get(guid);
      const matchIds = c
        ? [...c.matches, ...c.runsByMatch.keys(), ...c.wktsByMatch.keys(), ...c.dismByMatch.keys()]
        : [];
      for (const matchId of matchIds) {
        const m = inputs?.metaOf.get(matchId);
        if (m?.grade) seen.add(`${m.grade}\u0000${m.season ?? ""}`);
      }
      centralSeasons.set(guid, seen);
    }
    return seen.has(`${grade}\u0000${season ?? ""}`);
  };
  for (const r of data.history) {
    const rowSource = historyRowSource(r, data.boundaries, isSeniorGrade);
    if (rowSource === null) continue;
    const guid = identity.guidForPlayerId(r.playerId);
    if (guid === null) continue; // history-only: no central match to cross at
    if (rowSource === "supplement" && (!inputs || centralHas(guid, r.grade, r.season))) continue;
    const f = historyFigures(r);
    const t = baseTotals.get(guid) ?? { games: 0, runs: 0, wickets: 0, dismissals: 0 };
    t.games += f.games;
    t.runs += f.runs;
    t.wickets += f.wickets;
    t.dismissals += f.catches + f.stumpings + f.runOuts;
    baseTotals.set(guid, t);
  }
  const exclude = new Set<string>();
  for (const [guid, id] of identity.intByGuid) if (id >= FILL_IN_ID_FLOOR) exclude.add(guid);
  return {
    dropBucket: (grade, season) => beforeBoundary(data.boundaries, grade, season),
    baseTotals,
    matchDeltas: resolved.matchDeltas,
    exclude,
  };
}

// ── Loading (tenant DB) ─────────────────────────────────────────────────────

/** Postgres undefined_table — the club-history tables before migration 0021. */
const UNDEFINED_TABLE = "42P01";
/** How long a "tables missing" answer is trusted before checking again. */
const MISSING_RETRY_MS = 60_000;
let tablesMissingUntil = 0;

function isUndefinedTable(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && i < 5; i++) {
    if ((e as { code?: unknown }).code === UNDEFINED_TABLE) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/** Test hook: forget a remembered "tables missing". */
export function resetClubOverlayTableProbe(): void {
  tablesMissingUntil = 0;
}

/**
 * The tenant's boundaries, history rows and ACTIVE corrections. Degrades to
 * empty (today's numbers) while migration 0021 isn't applied: the first
 * undefined_table is remembered for a minute so requests don't keep probing.
 */
export async function loadClubOverlayData(
  tenantId: number,
  reader: OverlayReader = db,
): Promise<ClubOverlayData> {
  if (Date.now() < tablesMissingUntil) return EMPTY_OVERLAY_DATA;
  try {
    const [boundaries, rows, supplementBatches, corrections] = await Promise.all([
      reader
        .select({
          grade: clubHistoryBoundariesTable.grade,
          startSeason: clubHistoryBoundariesTable.startSeason,
        })
        .from(clubHistoryBoundariesTable)
        .where(eq(clubHistoryBoundariesTable.tenantId, tenantId)),
      reader
        .select({
          id: clubHistoryRowsTable.id,
          batchId: clubHistoryRowsTable.batchId,
          playerId: clubHistoryRowsTable.playerId,
          grade: clubHistoryRowsTable.grade,
          season: clubHistoryRowsTable.season,
          grain: clubHistoryRowsTable.grain,
          matchDate: clubHistoryRowsTable.matchDate,
          opponent: clubHistoryRowsTable.opponent,
          round: clubHistoryRowsTable.round,
          games: clubHistoryRowsTable.games,
          innings: clubHistoryRowsTable.innings,
          notOuts: clubHistoryRowsTable.notOuts,
          runs: clubHistoryRowsTable.runs,
          highScore: clubHistoryRowsTable.highScore,
          highScoreNotOut: clubHistoryRowsTable.highScoreNotOut,
          ballsFaced: clubHistoryRowsTable.ballsFaced,
          fours: clubHistoryRowsTable.fours,
          sixes: clubHistoryRowsTable.sixes,
          fifties: clubHistoryRowsTable.fifties,
          hundreds: clubHistoryRowsTable.hundreds,
          ballsBowled: clubHistoryRowsTable.ballsBowled,
          maidens: clubHistoryRowsTable.maidens,
          runsConceded: clubHistoryRowsTable.runsConceded,
          wickets: clubHistoryRowsTable.wickets,
          bestBowlingWickets: clubHistoryRowsTable.bestBowlingWickets,
          bestBowlingRuns: clubHistoryRowsTable.bestBowlingRuns,
          fiveWickets: clubHistoryRowsTable.fiveWickets,
          catches: clubHistoryRowsTable.catches,
          stumpings: clubHistoryRowsTable.stumpings,
          runOuts: clubHistoryRowsTable.runOuts,
        })
        .from(clubHistoryRowsTable)
        .where(eq(clubHistoryRowsTable.tenantId, tenantId)),
      // Supplement batches (hand-entered seasons kept at or after the
      // boundary) are marked by their batch source — no schema change.
      reader
        .select({ id: clubHistoryBatchesTable.id })
        .from(clubHistoryBatchesTable)
        .where(
          and(
            eq(clubHistoryBatchesTable.tenantId, tenantId),
            eq(clubHistoryBatchesTable.source, CLUB_HISTORY_SUPPLEMENT_SOURCE),
          ),
        ),
      reader
        .select({
          id: clubCorrectionsTable.id,
          playhqMatchId: clubCorrectionsTable.playhqMatchId,
          participantId: clubCorrectionsTable.participantId,
          field: clubCorrectionsTable.field,
          previousValue: clubCorrectionsTable.previousValue,
          newValue: clubCorrectionsTable.newValue,
        })
        .from(clubCorrectionsTable)
        .where(
          and(eq(clubCorrectionsTable.tenantId, tenantId), isNull(clubCorrectionsTable.removedAt)),
        ),
    ]);
    const supplementIds = new Set(supplementBatches.map((b) => b.id));
    const history: OverlayHistoryRow[] = rows.map(({ batchId, ...r }) =>
      supplementIds.has(batchId) ? { ...r, supplement: true } : r,
    );
    return { boundaries, history, corrections };
  } catch (err) {
    if (!isUndefinedTable(err)) throw err;
    tablesMissingUntil = Date.now() + MISSING_RETRY_MS;
    return EMPTY_OVERLAY_DATA;
  }
}

/** Load a tenant's whole club overlay (identity + club layer), once per request. */
export async function loadClubOverlay(
  tenantId: number,
  reader: OverlayReader = db,
): Promise<ClubOverlay> {
  const [identity, data] = await Promise.all([
    loadClubIdentity(tenantId, reader),
    loadClubOverlayData(tenantId, reader),
  ]);
  return { identity, data, active: overlayIsActive(data) };
}

/**
 * The overlay only when the tenant HAS a club layer, else null — for handlers
 * that need no player identity on their original read (the grade cards), so a
 * tenant with no club layer pays for the club-layer probe and nothing more.
 */
export async function loadActiveClubOverlay(tenantId: number): Promise<ClubOverlay | null> {
  const data = await loadClubOverlayData(tenantId);
  if (!overlayIsActive(data)) return null;
  return { identity: await loadClubIdentity(tenantId), data, active: true };
}

/** Every GUID in the merge groups of the corrected participants. */
function correctedGroupMembers(overlay: ClubOverlay): string[] {
  const out = new Set<string>();
  for (const c of overlay.data.corrections) {
    for (const g of overlay.identity.membersOf(c.participantId)) out.add(g);
    out.add(c.participantId);
  }
  return [...out].filter((g) => !g.startsWith("club:"));
}

async function reportStale(tenantId: number, stale: readonly StaleCorrection[]): Promise<void> {
  if (stale.length === 0) return;
  const { logger } = await import("./logger");
  logger.warn(
    {
      tenantId,
      stale: stale.map((s) => ({
        id: s.id,
        playhqMatchId: s.playhqMatchId,
        participantId: s.participantId,
        field: s.field,
        previousValue: s.previousValue,
        centralValue: s.centralValue,
        reason: s.reason,
      })),
    },
    "club overlay: skipped stale corrections",
  );
}

/** Ignored supplement seasons already logged by this process (logged once each). */
const reportedSupplements = new Set<string>();

/**
 * Report supplement seasons the overlay left out because central now supplies
 * that player's grade and season. Each is logged once per process, not once
 * per request: an ignored supplement stays ignored until someone removes it.
 */
async function reportIgnoredSupplements(
  tenantId: number,
  ignored: readonly IgnoredSupplement[],
): Promise<void> {
  const fresh = ignored.filter((s) => {
    const key = `${tenantId}|${s.playerId}|${s.grade}|${s.season}`;
    if (reportedSupplements.has(key)) return false;
    reportedSupplements.add(key);
    return true;
  });
  if (fresh.length === 0) return;
  const { logger } = await import("./logger");
  logger.warn(
    { tenantId, ignored: fresh },
    "club overlay: supplement seasons ignored (central supplies that player's grade and season)",
  );
}

/**
 * The tenant's corrections checked against central — for the per-match
 * surfaces that need only the corrected lines, not the whole club's partials.
 * No active correction = no central read at all.
 */
export async function resolveClubCorrections(
  overlay: ClubOverlay,
  tenantId: number,
  clubId: number,
): Promise<ResolvedCorrections & { groupLines: CentralParticipantMatchLine[] }> {
  const members = correctedGroupMembers(overlay);
  const opts = {
    canonicalOf: overlay.identity.canonicalOf,
    boundaries: overlay.data.boundaries,
  };
  if (members.length === 0) {
    return { ...resolveCorrections(overlay.data.corrections, [], opts), groupLines: [] };
  }
  const central = await import("@workspace/db/central-queries");
  // Every senior club-match line of the corrected players' merge groups (the
  // same cached read `buildClubStats` uses).
  const groupLines = await central.centralParticipantMatchLines(clubId, members);
  const resolved = resolveCorrections(overlay.data.corrections, groupLines, opts);
  await reportStale(tenantId, resolved.stale);
  return { ...resolved, groupLines };
}

/**
 * The tenant's club stats with the whole overlay applied (steps 1–7). Uses the
 * club-cached partial read and, only when the tenant has corrections, the
 * corrected participants' own lines. Call only when `overlay.active`.
 */
export async function buildClubStats(
  overlay: ClubOverlay,
  tenantId: number,
  clubId: number,
): Promise<ClubStats> {
  const central = await import("@workspace/db/central-queries");
  const members = correctedGroupMembers(overlay);
  const [partials, lines] = await Promise.all([
    central.centralPlayerPartials(clubId, overlay.identity.merges),
    members.length > 0 ? central.centralParticipantMatchLines(clubId, members) : [],
  ]);
  const stats = applyClubOverlay({
    partials,
    lines,
    identity: overlay.identity,
    data: overlay.data,
    isSeniorGrade: central.isSeniorAppGrade,
  });
  await reportStale(tenantId, stats.corrections.stale);
  await reportIgnoredSupplements(tenantId, stats.supplements.ignored);
  return stats;
}

/**
 * The club's milestones with the overlay applied (boundary, history base,
 * corrections, fill-ins). Call only when `overlay.active`; otherwise the
 * plain `centralMilestones` read is today's numbers.
 */
export async function overlayMilestones(
  overlay: ClubOverlay,
  tenantId: number,
  clubId: number,
  tiers: MilestoneTiers,
): Promise<CentralMilestone[]> {
  const central = await import("@workspace/db/central-queries");
  const members = correctedGroupMembers(overlay);
  const [inputs, lines] = await Promise.all([
    central.centralMilestoneInputs(clubId, overlay.identity.merges),
    members.length > 0 ? central.centralParticipantMatchLines(clubId, members) : [],
  ]);
  const resolved = resolveCorrections(overlay.data.corrections, lines, {
    canonicalOf: overlay.identity.canonicalOf,
    boundaries: overlay.data.boundaries,
  });
  await reportStale(tenantId, resolved.stale);
  return central.walkCentralMilestones(
    inputs,
    tiers,
    clubMilestoneOverlay(overlay, resolved, central.isSeniorAppGrade, inputs),
  );
}

/**
 * The overlay key a tenant player id resolves to: its keeper GUID, or — for a
 * history-only id with no crosswalk row — `player:<id>` when club history
 * holds rows for it. Null when the id is unknown to this tenant.
 */
export function overlayKeyForPlayerId(overlay: ClubOverlay, playerId: number): string | null {
  const guid = overlay.identity.guidForPlayerId(playerId);
  if (guid !== null) return guid;
  if (!overlay.active) return null;
  return overlay.data.history.some((r) => r.playerId === playerId) ? historyKey(playerId) : null;
}
