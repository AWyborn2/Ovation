/**
 * seed-hh-club-layer-core.ts — PURE planning behind scripts/src/seed-hh-club-layer.ts
 * (hybrid stats plan U12; R11, R12, R20, R21; KTD3, KTD5, KTD7, KTD9). No
 * database access and no I/O, so every rule is unit-tested
 * (seed-hh-club-layer.test.ts).
 *
 * Halls Head's own history moves into its club layer from its native tables:
 *
 *   1. Boundary (R12, KTD5): the club default is 2003/04; each grade whose
 *      central batting lines for club 1 start in another season gets an
 *      override at that first season (e.g. B and C Grade 2004/05). A native
 *      grade central never covers keeps the default and is flagged.
 *   2. History (KTD4): native career baselines (`player_grade_season_stats`
 *      with season NULL) become career-grain rows; native season rows BEFORE
 *      their grade's boundary become season rows; rows at or after it are
 *      skipped (central supplies them). Player ids are the native
 *      `players.id`s, which ARE tenant 1's ids (KTD3).
 *   3. Fill-ins (id >= 90000) never produce history rows, and are never pinned.
 *   4. U4's review players (AMBIGUOUS, WEAK_ONLY …) each end as a crosswalk row
 *      to their native id or a recorded decision to leave them unmapped — from
 *      a decisions CSV Ash fills in; nothing is guessed.
 *   5. Baseline-only players (no scorecard lines, so no GUID) — and any other
 *      history-bearing player with no GUID — get a synthetic crosswalk entry
 *      PINNED to their existing native id, so curated links keep resolving
 *      after cut-over. A pinned row is also how "left unmapped" is recorded.
 *   6. A review list of players whose runs or wickets differ from central in
 *      the seasons central supplies. Nothing becomes a correction here: only
 *      items Ash confirms do, later (KTD7).
 *
 * Plus, for U13: career baselines that look like they overlap central seasons.
 */
import { boundaryFor, isSyntheticParticipantKey } from "@workspace/db";
import {
  historyFigureProblems,
  parseBestBowling,
  parseHighScore,
  seasonLabel,
  type HistoryFigures,
  type PreparedHistoryRow,
} from "../../artifacts/api-server/src/lib/history-import";
import {
  csvCell,
  isFillIn,
  type NativeLine,
  type NativePlayer,
  type ParticipantEvidence,
  type PlayerLink,
} from "./hh-central-crosswalk-core";
import type { ExistingMapRow, ReviewRow } from "./persist-hh-crosswalk-core";

export const HH_TENANT_ID = 1;
/** The club default boundary: 2003/04 (R12, AE1). */
export const DEFAULT_BOUNDARY_SEASON = 2003;
/** `club_history_batches.source` of this seed (the schema's documented example). */
export const SEED_SOURCE = "hh-native-seed";
export const SEED_LABEL = "Halls Head native history (career baselines + pre-boundary seasons)";

type Boundary = { grade: string | null; startSeason: number };
type GradeNormaliser = (raw: string) => string | null;

// ── Args ─────────────────────────────────────────────────────────────────────

export const SEED_ALLOWED_FLAGS = new Set([
  "--tenant",
  "--commit",
  "--out",
  "--decisions",
  "--undo",
  "--help",
  "-h",
]);

export interface SeedArgs {
  tenantId: number;
  commit: boolean;
  out: string | undefined;
  decisions: string | undefined;
  undo: number | undefined;
}

const flagValue = (argv: string[], flag: string): string | undefined =>
  argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

/** Validate argv (KTD9): `--tenant=1` required, preview unless `--commit`. */
export function parseSeedArgs(argv: string[]): SeedArgs | { error: string } {
  for (const a of argv) {
    const flag = a.split("=")[0] ?? a;
    if (!SEED_ALLOWED_FLAGS.has(flag)) return { error: `Unknown argument: ${a}` };
  }
  const tenantRaw = flagValue(argv, "--tenant");
  if (tenantRaw == null) return { error: "--tenant=1 is required." };
  if (tenantRaw !== "1") {
    return { error: `--tenant=${tenantRaw} refused: only Halls Head (tenant 1) is supported.` };
  }
  const undoRaw = flagValue(argv, "--undo");
  let undo: number | undefined;
  if (undoRaw !== undefined) {
    if (!/^\d+$/.test(undoRaw) || Number(undoRaw) <= 0) {
      return { error: `--undo=${undoRaw} must be a history batch id.` };
    }
    undo = Number(undoRaw);
  }
  const decisions = flagValue(argv, "--decisions");
  if (undo !== undefined && decisions !== undefined) {
    return { error: "--undo can't be combined with --decisions." };
  }
  return {
    tenantId: HH_TENANT_ID,
    commit: argv.includes("--commit"),
    out: flagValue(argv, "--out"),
    decisions,
    undo,
  };
}

// ── 1. Boundary ──────────────────────────────────────────────────────────────

export interface CentralBattingCoverage {
  /** Senior app grade. */
  grade: string;
  season: number;
  /** Central batting lines club 1 has in that grade and season. */
  lines: number;
}

export interface BoundaryTableRow {
  grade: string;
  firstCentralSeason: number | null;
  firstSeasonLines: number;
  boundary: number;
  source: "default" | "override" | "no-central";
}

/**
 * The boundary from central scorecard coverage: the default plus an override
 * for each grade whose first season with batting lines isn't the default.
 */
export function deriveBoundaries(
  coverage: readonly CentralBattingCoverage[],
  nativeGrades: readonly string[],
  defaultSeason = DEFAULT_BOUNDARY_SEASON,
): { boundaries: Boundary[]; table: BoundaryTableRow[] } {
  const first = new Map<string, { season: number; lines: number }>();
  for (const c of coverage) {
    if (c.lines <= 0) continue;
    const f = first.get(c.grade);
    if (!f || c.season < f.season) first.set(c.grade, { season: c.season, lines: c.lines });
    else if (c.season === f.season) f.lines += c.lines;
  }
  const boundaries: Boundary[] = [{ grade: null, startSeason: defaultSeason }];
  for (const [grade, f] of [...first].sort(([a], [b]) => a.localeCompare(b))) {
    if (f.season !== defaultSeason) boundaries.push({ grade, startSeason: f.season });
  }
  const grades = [...new Set([...first.keys(), ...nativeGrades])].sort((a, b) =>
    a.localeCompare(b),
  );
  const table = grades.map((grade): BoundaryTableRow => {
    const f = first.get(grade);
    return {
      grade,
      firstCentralSeason: f?.season ?? null,
      firstSeasonLines: f?.lines ?? 0,
      boundary: boundaryFor(boundaries, grade)!,
      source: !f ? "no-central" : f.season === defaultSeason ? "default" : "override",
    };
  });
  return { boundaries, table };
}

const boundaryKey = (bs: readonly Boundary[]): string =>
  JSON.stringify(
    [...bs]
      .map((b) => [b.grade ?? "", b.startSeason])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );

// ── 2/3. History rows ────────────────────────────────────────────────────────

/** A native `player_grade_season_stats` row (season NULL = career baseline). */
export interface NativeStatRow {
  playerId: number;
  grade: string;
  season: number | null;
  games: number | null;
  innings: number | null;
  notOuts: number | null;
  runs: number | null;
  highScore: string | null;
  fifties: number | null;
  hundreds: number | null;
  wickets: number | null;
  runsConceded: number | null;
  bestBowling: string | null;
  fiveWickets: number | null;
  catches: number | null;
  stumpings: number | null;
  runOuts: number | null;
}

export interface HistoryWarning {
  playerId: number;
  grade: string;
  season: number | null;
  message: string;
}

export interface GradeCounts {
  grade: string;
  careerRows: number;
  seasonRows: number;
  skippedAtOrAfterBoundary: number;
}

export interface HistoryPlan {
  rows: PreparedHistoryRow[];
  perGrade: GradeCounts[];
  skipped: {
    fillIn: number;
    nonSeniorGrade: Array<{ grade: string; rows: number }>;
    empty: number;
    atOrAfterBoundary: number;
  };
  warnings: HistoryWarning[];
  /** (player, grade, season) groups that had more than one native row (summed). */
  mergedDuplicates: number;
}

const COUNT_FIELDS = [
  "games",
  "innings",
  "notOuts",
  "runs",
  "fifties",
  "hundreds",
  "wickets",
  "runsConceded",
  "fiveWickets",
  "catches",
  "stumpings",
  "runOuts",
] as const;

const addNullable = (a: number | null, b: number | null): number | null =>
  a === null ? b : b === null ? a : a + b;

/** Native figures to the store's shape; unparseable text cells become null + a warning. */
function toFigures(r: NativeStatRow, warn: (m: string) => void): HistoryFigures {
  const hs = r.highScore ? parseHighScore(r.highScore.trim(), (_c, m) => warn(m)) : null;
  const bb = r.bestBowling ? parseBestBowling(r.bestBowling.trim(), (_c, m) => warn(m)) : null;
  return {
    games: r.games,
    innings: r.innings,
    notOuts: r.notOuts,
    runs: r.runs,
    highScore: hs?.value ?? null,
    highScoreNotOut: hs ? hs.notOut : null,
    ballsFaced: null,
    fours: null,
    sixes: null,
    fifties: r.fifties,
    hundreds: r.hundreds,
    // Native snapshots keep no balls bowled or maidens.
    ballsBowled: null,
    maidens: null,
    runsConceded: r.runsConceded,
    wickets: r.wickets,
    bestBowlingWickets: bb?.wickets ?? null,
    bestBowlingRuns: bb?.runs ?? null,
    fiveWickets: r.fiveWickets,
    catches: r.catches,
    stumpings: r.stumpings,
    runOuts: r.runOuts,
  };
}

/** Sum two figure sets the way the native career sums snapshots. */
function mergeFigures(a: HistoryFigures, b: HistoryFigures): HistoryFigures {
  const out = { ...a };
  for (const k of COUNT_FIELDS) out[k] = addNullable(a[k], b[k]);
  if (b.highScore !== null && (a.highScore === null || b.highScore > a.highScore)) {
    out.highScore = b.highScore;
    out.highScoreNotOut = b.highScoreNotOut;
  }
  const better =
    b.bestBowlingWickets !== null &&
    (a.bestBowlingWickets === null ||
      b.bestBowlingWickets > a.bestBowlingWickets ||
      (b.bestBowlingWickets === a.bestBowlingWickets &&
        (b.bestBowlingRuns ?? Infinity) < (a.bestBowlingRuns ?? Infinity)));
  if (better) {
    out.bestBowlingWickets = b.bestBowlingWickets;
    out.bestBowlingRuns = b.bestBowlingRuns;
  }
  return out;
}

const hasFigures = (f: HistoryFigures): boolean =>
  Object.entries(f).some(([k, v]) => k !== "highScoreNotOut" && v !== null);

/**
 * Native snapshots → club history rows for tenant 1. Career baselines load as
 * career grain; seasons strictly before the grade's boundary load as season
 * grain; everything at or after it is central's. Fill-ins and non-senior
 * grades never load.
 */
export function planHistoryRows(input: {
  pgss: readonly NativeStatRow[];
  boundaries: readonly Boundary[];
  seniorGrade: GradeNormaliser;
}): HistoryPlan {
  const skipped: HistoryPlan["skipped"] = {
    fillIn: 0,
    nonSeniorGrade: [],
    empty: 0,
    atOrAfterBoundary: 0,
  };
  const nonSenior = new Map<string, number>();
  const counts = new Map<string, GradeCounts>();
  const countsFor = (grade: string): GradeCounts => {
    let c = counts.get(grade);
    if (!c) {
      c = { grade, careerRows: 0, seasonRows: 0, skippedAtOrAfterBoundary: 0 };
      counts.set(grade, c);
    }
    return c;
  };
  const warnings: HistoryWarning[] = [];
  const groups = new Map<
    string,
    { playerId: number; grade: string; season: number | null; f: HistoryFigures; n: number }
  >();

  for (const r of input.pgss) {
    if (isFillIn(r.playerId)) {
      skipped.fillIn += 1;
      continue;
    }
    const grade = input.seniorGrade(r.grade);
    if (!grade) {
      nonSenior.set(r.grade, (nonSenior.get(r.grade) ?? 0) + 1);
      continue;
    }
    if (r.season !== null) {
      const b = boundaryFor(input.boundaries, grade);
      if (b === null || r.season >= b) {
        skipped.atOrAfterBoundary += 1;
        countsFor(grade).skippedAtOrAfterBoundary += 1;
        continue;
      }
    }
    const f = toFigures(r, (message) =>
      warnings.push({ playerId: r.playerId, grade, season: r.season, message }),
    );
    const key = `${r.playerId}|${grade}|${r.season ?? ""}`;
    const g = groups.get(key);
    if (g) {
      g.f = mergeFigures(g.f, f);
      g.n += 1;
    } else groups.set(key, { playerId: r.playerId, grade, season: r.season, f, n: 1 });
  }

  let mergedDuplicates = 0;
  const rows: PreparedHistoryRow[] = [];
  for (const g of groups.values()) {
    const grain = g.season === null ? "career" : "season";
    if (g.n > 1) {
      mergedDuplicates += 1;
      warnings.push({
        playerId: g.playerId,
        grade: g.grade,
        season: g.season,
        message: `${g.n} native rows for this ${grain} were summed into one.`,
      });
    }
    if (!hasFigures(g.f)) {
      skipped.empty += 1;
      continue;
    }
    for (const message of historyFigureProblems(grain, g.f)) {
      warnings.push({ playerId: g.playerId, grade: g.grade, season: g.season, message });
    }
    rows.push({ ...g.f, playerId: g.playerId, grade: g.grade, grain, season: g.season });
    if (grain === "career") countsFor(g.grade).careerRows += 1;
    else countsFor(g.grade).seasonRows += 1;
  }
  rows.sort(
    (a, b) =>
      a.playerId - b.playerId ||
      a.grade.localeCompare(b.grade) ||
      (a.season ?? -1) - (b.season ?? -1),
  );
  skipped.nonSeniorGrade = [...nonSenior]
    .map(([grade, n]) => ({ grade, rows: n }))
    .sort((a, b) => a.grade.localeCompare(b.grade));
  return {
    rows,
    perGrade: [...counts.values()].sort((a, b) => a.grade.localeCompare(b.grade)),
    skipped,
    warnings,
    mergedDuplicates,
  };
}

// ── 4/5. Identity: review decisions and pinned players ──────────────────────

export type SeedDecision =
  { kind: "map"; participantId: string } | { kind: "unmapped"; note: string };

export interface DecisionNeeded {
  nativePlayerId: number;
  name: string;
  reasons: string[];
  details: string[];
  candidates: ParticipantEvidence[];
  /** The decision in force: from the file, or recorded by an existing row. */
  decision: SeedDecision | null;
  /** "file", "recorded" (already in the crosswalk), or null (open). */
  decidedBy: "file" | "recorded" | null;
}

export interface PinnedPlayer {
  playerId: number;
  displayName: string;
  reason: "BASELINE_ONLY" | "NO_GUID_WITH_HISTORY" | "DECIDED_UNMAPPED";
}

export interface PlannedDecisionMap {
  nativePlayerId: number;
  participantId: string;
  playerId: number;
}

export interface IdentityPlan {
  decisionsNeeded: DecisionNeeded[];
  undecided: number[];
  decisionMapInserts: PlannedDecisionMap[];
  decisionMapUnchanged: PlannedDecisionMap[];
  pins: PinnedPlayer[];
  pinsUnchanged: Array<{ playerId: number; participantId: string }>;
  errors: string[];
}

export interface IdentityInput {
  players: readonly NativePlayer[];
  links: readonly PlayerLink[];
  /** U4's review list (planPersistence against the current crosswalk). */
  review: readonly ReviewRow[];
  /** Native ids whose keeper row U4 would still insert (persistence not run). */
  pendingKeeperIds: readonly number[];
  existingMap: readonly ExistingMapRow[];
  /** Native ids with at least one history row in this seed. */
  historyPlayerIds: ReadonlySet<number>;
  decisions: ReadonlyMap<number, SeedDecision>;
  privateByGuid: ReadonlyMap<string, boolean>;
  /** GUIDs with a merge pointer in tenant 1's curation (never a keeper). */
  mergedAway: ReadonlySet<string>;
}

const nameOf = (p: NativePlayer | undefined): string =>
  p ? `${p.givenName} ${p.surname}`.replace(/\s+/g, " ").trim() : "";

export function planIdentity(input: IdentityInput): IdentityPlan {
  const plan: IdentityPlan = {
    decisionsNeeded: [],
    undecided: [],
    decisionMapInserts: [],
    decisionMapUnchanged: [],
    pins: [],
    pinsUnchanged: [],
    errors: [],
  };
  const playerById = new Map(input.players.map((p) => [p.id, p]));
  const linkById = new Map(input.links.map((l) => [l.nativePlayerId, l]));
  const pending = new Set(input.pendingKeeperIds);
  const rowByPlayerId = new Map(input.existingMap.map((r) => [r.playerId, r.participantId]));
  const idByGuid = new Map(input.existingMap.map((r) => [r.participantId, r.playerId]));

  // Players U4 left for a person to decide: any keeper-level review reason
  // (per-merge refusals are on players that already have their keeper row).
  const waiting = new Map<number, ReviewRow[]>();
  for (const r of input.review) {
    if (r.reason.startsWith("MERGE_") || isFillIn(r.nativePlayerId)) continue;
    if (pending.has(r.nativePlayerId)) continue;
    const arr = waiting.get(r.nativePlayerId) ?? [];
    arr.push(r);
    waiting.set(r.nativePlayerId, arr);
  }
  for (const id of input.decisions.keys()) {
    if (!waiting.has(id)) {
      plan.errors.push(`Decision for player ${id}: that player isn't waiting for a decision.`);
    }
  }

  const unmappedDecided = new Set<number>();
  const guidsClaimed = new Map<string, number>();
  for (const [id, rows] of [...waiting].sort(([a], [b]) => a - b)) {
    const l = linkById.get(id);
    const candidates = l?.candidates ?? [];
    const current = rowByPlayerId.get(id);
    const fromFile = input.decisions.get(id) ?? null;
    let decision: SeedDecision | null = fromFile;
    let decidedBy: DecisionNeeded["decidedBy"] = fromFile ? "file" : null;
    if (!fromFile && current !== undefined) {
      decision = isSyntheticParticipantKey(current)
        ? { kind: "unmapped", note: "recorded by its pinned crosswalk row" }
        : { kind: "map", participantId: current };
      decidedBy = "recorded";
    }
    plan.decisionsNeeded.push({
      nativePlayerId: id,
      name: nameOf(playerById.get(id)),
      reasons: [...new Set(rows.map((r) => r.reason))],
      details: rows.map((r) => (r.participantId ? `${r.participantId}: ${r.detail}` : r.detail)),
      candidates,
      decision,
      decidedBy,
    });
    if (!decision) {
      plan.undecided.push(id);
      continue;
    }
    if (decision.kind === "unmapped") {
      if (current !== undefined && !isSyntheticParticipantKey(current)) {
        plan.errors.push(
          `Player ${id}: decided "unmapped", but the crosswalk already maps ${current} to it.`,
        );
        continue;
      }
      unmappedDecided.add(id);
      continue;
    }
    const g = decision.participantId;
    const err = (m: string) => plan.errors.push(`Player ${id} → ${g}: ${m}`);
    if (!candidates.some((c) => c.participantId === g)) {
      err("that GUID isn't one of the player's scorecard candidates.");
      continue;
    }
    if (input.privateByGuid.get(g) === true) {
      err("central marks that GUID private; it can't be mapped (KTD2).");
      continue;
    }
    if (input.mergedAway.has(g)) {
      err("that GUID is merged into another player; map the keeper instead.");
      continue;
    }
    const mappedTo = idByGuid.get(g);
    if (mappedTo !== undefined && mappedTo !== id) {
      err(`the crosswalk already maps that GUID to player ${mappedTo}.`);
      continue;
    }
    if (current !== undefined && current !== g) {
      err(`player id ${id} is already used by ${current} in the crosswalk.`);
      continue;
    }
    const other = guidsClaimed.get(g);
    if (other !== undefined) {
      err(`player ${other} is being mapped to the same GUID.`);
      continue;
    }
    guidsClaimed.set(g, id);
    const row = { nativePlayerId: id, participantId: g, playerId: id };
    if (current === g) plan.decisionMapUnchanged.push(row);
    else plan.decisionMapInserts.push(row);
  }

  // Pins: native players with no crosswalk row at their id who need one.
  for (const p of [...input.players].sort((a, b) => a.id - b.id)) {
    const id = p.id;
    if (isFillIn(id) || id <= 0 || pending.has(id)) continue;
    const current = rowByPlayerId.get(id);
    const waitingOpen = waiting.has(id) && !unmappedDecided.has(id);
    if (waitingOpen) continue; // decided map, or still undecided
    let reason: PinnedPlayer["reason"] | null = null;
    if (unmappedDecided.has(id)) reason = "DECIDED_UNMAPPED";
    else if (linkById.get(id)?.status === "NO_LINES") reason = "BASELINE_ONLY";
    else if (input.historyPlayerIds.has(id)) reason = "NO_GUID_WITH_HISTORY";
    if (!reason) continue;
    if (current !== undefined) {
      // Already pinned (unchanged), or a GUID holds the id (mapped: nothing to pin).
      if (isSyntheticParticipantKey(current)) {
        plan.pinsUnchanged.push({ playerId: id, participantId: current });
      }
      continue;
    }
    plan.pins.push({ playerId: id, displayName: nameOf(p) || `Player ${id}`, reason });
  }
  return plan;
}

// ── Decisions CSV ────────────────────────────────────────────────────────────

/** Minimal RFC 4180 reader (quotes, doubled quotes, CRLF). */
export function readCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export const DECISIONS_HEADER = [
  "native_player_id",
  "native_name",
  "reasons",
  "detail",
  "candidates",
  "decision",
  "participant_id",
  "note",
];

/** The decisions file for Ash: one row per waiting player, decision columns to fill in. */
export function decisionsCsv(
  needed: readonly DecisionNeeded[],
  centralName: ReadonlyMap<string, string | null>,
  privateByGuid: ReadonlyMap<string, boolean> = new Map(),
): string {
  const lines = [DECISIONS_HEADER.join(",")];
  for (const d of needed) {
    const candidates = d.candidates
      .map(
        (c) =>
          `${c.participantId} (${centralName.get(c.participantId) ?? "?"}) x${c.lines} ` +
          `s${c.strong}/m${c.medium}/w${c.weak}${privateByGuid.get(c.participantId) ? " PRIVATE" : ""}`,
      )
      .join(" | ");
    const decision = d.decision?.kind ?? "";
    const pid = d.decision?.kind === "map" ? d.decision.participantId : "";
    const note = d.decision?.kind === "unmapped" ? d.decision.note : "";
    lines.push(
      [
        d.nativePlayerId,
        d.name,
        d.reasons.join(" "),
        d.details.join("; "),
        candidates,
        decision,
        pid,
        note,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** Parse Ash's filled-in decisions file. Blank decisions are skipped (still open). */
export function parseDecisionsCsv(text: string): {
  decisions: Map<number, SeedDecision>;
  errors: Array<{ row: number; message: string }>;
} {
  const decisions = new Map<number, SeedDecision>();
  const errors: Array<{ row: number; message: string }> = [];
  const rows = readCsvRows(text);
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  for (const need of ["native_player_id", "decision", "participant_id"]) {
    if (col(need) < 0) errors.push({ row: 1, message: `Missing column "${need}".` });
  }
  if (errors.length > 0) return { decisions, errors };
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]!;
    if (cells.every((c) => c.trim() === "")) continue;
    const row = i + 1;
    const get = (name: string) => (col(name) < 0 ? "" : (cells[col(name)] ?? "").trim());
    const idRaw = get("native_player_id");
    const kind = get("decision").toLowerCase();
    if (!/^\d+$/.test(idRaw)) {
      errors.push({ row, message: `native_player_id "${idRaw}" isn't a player id.` });
      continue;
    }
    const id = Number(idRaw);
    if (kind === "") continue;
    if (decisions.has(id)) {
      errors.push({ row, message: `Player ${id} is decided twice.` });
      continue;
    }
    if (kind === "map") {
      const pid = get("participant_id");
      if (!pid) {
        errors.push({ row, message: `"map" needs the participant_id to map player ${id} to.` });
        continue;
      }
      decisions.set(id, { kind: "map", participantId: pid });
    } else if (kind === "unmapped") {
      decisions.set(id, { kind: "unmapped", note: get("note") });
    } else {
      errors.push({ row, message: `decision must be "map" or "unmapped" (got "${kind}").` });
    }
  }
  return { decisions, errors };
}

// ── 6. Review lists ──────────────────────────────────────────────────────────

export interface DifferenceRow {
  playerId: number;
  grade: string;
  season: number;
  nativeRuns: number;
  centralRuns: number;
  nativeWickets: number;
  centralWickets: number;
  runsDiffer: boolean;
  wicketsDiffer: boolean;
}

/**
 * Native vs central runs and wickets, per (player, grade, season), in the
 * seasons central supplies (at or after the boundary) where native has a
 * season row. A player's GUIDs include confirmed merges. Review only: these
 * never become corrections here (KTD7).
 */
export function planDifferenceReview(input: {
  pgss: readonly NativeStatRow[];
  boundaries: readonly Boundary[];
  seniorGrade: GradeNormaliser;
  guidsByPlayer: ReadonlyMap<number, readonly string[]>;
  /** GUID → "grade|season" → central runs / wickets (senior, club 1). */
  centralBuckets: ReadonlyMap<string, ReadonlyMap<string, { runs: number; wickets: number }>>;
}): { rows: DifferenceRow[]; playersRunsDiffer: number[]; playersWicketsDiffer: number[] } {
  const native = new Map<string, { runs: number; wickets: number }>();
  for (const r of input.pgss) {
    if (r.season === null || isFillIn(r.playerId)) continue;
    if (!input.guidsByPlayer.has(r.playerId)) continue;
    const grade = input.seniorGrade(r.grade);
    if (!grade) continue;
    const b = boundaryFor(input.boundaries, grade);
    if (b === null || r.season < b) continue;
    const key = `${r.playerId}|${grade}|${r.season}`;
    const n = native.get(key) ?? { runs: 0, wickets: 0 };
    n.runs += r.runs ?? 0;
    n.wickets += r.wickets ?? 0;
    native.set(key, n);
  }
  const rows: DifferenceRow[] = [];
  for (const [key, n] of native) {
    const [pid, grade, season] = key.split("|") as [string, string, string];
    const playerId = Number(pid);
    let runs = 0;
    let wickets = 0;
    for (const g of input.guidsByPlayer.get(playerId) ?? []) {
      const c = input.centralBuckets.get(g)?.get(`${grade}|${season}`);
      if (c) {
        runs += c.runs;
        wickets += c.wickets;
      }
    }
    if (n.runs === runs && n.wickets === wickets) continue;
    rows.push({
      playerId,
      grade,
      season: Number(season),
      nativeRuns: n.runs,
      centralRuns: runs,
      nativeWickets: n.wickets,
      centralWickets: wickets,
      runsDiffer: n.runs !== runs,
      wicketsDiffer: n.wickets !== wickets,
    });
  }
  rows.sort(
    (a, b) => a.playerId - b.playerId || a.grade.localeCompare(b.grade) || a.season - b.season,
  );
  const ids = (pred: (r: DifferenceRow) => boolean) =>
    [...new Set(rows.filter(pred).map((r) => r.playerId))].sort((a, b) => a - b);
  return {
    rows,
    playersRunsDiffer: ids((r) => r.runsDiffer),
    playersWicketsDiffer: ids((r) => r.wicketsDiffer),
  };
}

export interface MatchDifferenceRow {
  playerId: number;
  nativeMatchId: number;
  playhqMatchId: string | null;
  participantId: string;
  grade: string;
  season: number;
  field: "runs" | "wickets";
  nativeValue: number;
  centralValue: number;
}

/**
 * Per-match candidates behind the review list: a linked match (at or after
 * the boundary) where the player batted (or bowled) on both sides and the
 * runs (or wickets) disagree. Keyed exactly as a correction would be — PlayHQ
 * match id + participant GUID + field — so a confirmed item can become one.
 */
export function planMatchDifferences(input: {
  lines: readonly NativeLine[];
  nativeMatches: ReadonlyMap<number, { season: number; grade: string; abandoned: boolean }>;
  linkByNativeMatch: ReadonlyMap<number, number>;
  playhqByCentral: ReadonlyMap<number, string | null>;
  appearances: ReadonlyMap<
    number,
    ReadonlyMap<string, { batted: boolean; runs: number; bowled: boolean; wickets: number }>
  >;
  guidsByPlayer: ReadonlyMap<number, readonly string[]>;
  boundaries: readonly Boundary[];
  seniorGrade: GradeNormaliser;
}): MatchDifferenceRow[] {
  const out: MatchDifferenceRow[] = [];
  for (const l of input.lines) {
    if (isFillIn(l.playerId)) continue;
    const guids = input.guidsByPlayer.get(l.playerId);
    if (!guids) continue;
    const m = input.nativeMatches.get(l.matchId);
    if (!m || m.abandoned) continue;
    const grade = input.seniorGrade(m.grade);
    if (!grade) continue;
    const b = boundaryFor(input.boundaries, grade);
    if (b === null || m.season < b) continue;
    const cid = input.linkByNativeMatch.get(l.matchId);
    if (cid === undefined) continue;
    const apps = input.appearances.get(cid);
    const g = guids.find((x) => apps?.has(x));
    if (!g) continue;
    const a = apps!.get(g)!;
    const base = {
      playerId: l.playerId,
      nativeMatchId: l.matchId,
      playhqMatchId: input.playhqByCentral.get(cid) ?? null,
      participantId: g,
      grade,
      season: m.season,
    };
    if (l.batted && a.batted && (l.runs ?? 0) !== a.runs) {
      out.push({ ...base, field: "runs", nativeValue: l.runs ?? 0, centralValue: a.runs });
    }
    if (l.bowled && a.bowled && (l.wickets ?? 0) !== a.wickets) {
      out.push({ ...base, field: "wickets", nativeValue: l.wickets ?? 0, centralValue: a.wickets });
    }
  }
  return out.sort(
    (a, b) =>
      a.playerId - b.playerId ||
      a.nativeMatchId - b.nativeMatchId ||
      a.field.localeCompare(b.field),
  );
}

export interface OverlapFlag {
  playerId: number;
  grade: string;
  flag: "CENTRAL_SEASONS_NOT_IN_NATIVE" | "PEELED_CENTRAL_SEASONS";
  seasons: number[];
}

/**
 * Career baselines that may overlap central seasons (for U13's preview, KTD5).
 * Career-grain history counts as pre-boundary, so a baseline that secretly
 * holds a central season would double count it after cut-over:
 *   - CENTRAL_SEASONS_NOT_IN_NATIVE: central has the player in a season at or
 *     after the boundary that native never loaded as its own season row — the
 *     baseline may already include it.
 *   - PEELED_CENTRAL_SEASONS: a peel backfill (baseline_adjustments) took a
 *     central season out of this baseline — it once held it; confirm the peel
 *     removed all of it.
 */
export function flagBaselineOverlaps(input: {
  pgss: readonly NativeStatRow[];
  boundaries: readonly Boundary[];
  seniorGrade: GradeNormaliser;
  guidsByPlayer: ReadonlyMap<number, readonly string[]>;
  /** GUID → grade → central seasons with an appearance. */
  centralSeasons: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<number>>>;
  adjustments: ReadonlyArray<{ playerId: number; grade: string; season: number }>;
}): OverlapFlag[] {
  const baselines = new Set<string>();
  const nativeSeasons = new Map<string, Set<number>>();
  for (const r of input.pgss) {
    if (isFillIn(r.playerId)) continue;
    const grade = input.seniorGrade(r.grade);
    if (!grade) continue;
    const key = `${r.playerId}|${grade}`;
    if (r.season === null) baselines.add(key);
    else {
      const s = nativeSeasons.get(key) ?? new Set<number>();
      s.add(r.season);
      nativeSeasons.set(key, s);
    }
  }
  const out: OverlapFlag[] = [];
  for (const key of [...baselines].sort()) {
    const [pid, grade] = key.split("|") as [string, string];
    const playerId = Number(pid);
    const b = boundaryFor(input.boundaries, grade);
    if (b === null) continue;
    const central = new Set<number>();
    for (const g of input.guidsByPlayer.get(playerId) ?? []) {
      for (const s of input.centralSeasons.get(g)?.get(grade) ?? []) if (s >= b) central.add(s);
    }
    const own = nativeSeasons.get(key) ?? new Set<number>();
    const uncovered = [...central].filter((s) => !own.has(s)).sort((x, y) => x - y);
    if (uncovered.length > 0) {
      out.push({ playerId, grade, flag: "CENTRAL_SEASONS_NOT_IN_NATIVE", seasons: uncovered });
    }
    const peeled = [
      ...new Set(
        input.adjustments
          .filter(
            (a) => a.playerId === playerId && input.seniorGrade(a.grade) === grade && a.season >= b,
          )
          .map((a) => a.season),
      ),
    ].sort((x, y) => x - y);
    if (peeled.length > 0) {
      out.push({ playerId, grade, flag: "PEELED_CENTRAL_SEASONS", seasons: peeled });
    }
  }
  return out.sort(
    (a, b) =>
      a.playerId - b.playerId || a.grade.localeCompare(b.grade) || a.flag.localeCompare(b.flag),
  );
}

// ── Whole plan ───────────────────────────────────────────────────────────────

export interface SeedPlanInput {
  coverage: readonly CentralBattingCoverage[];
  pgss: readonly NativeStatRow[];
  seniorGrade: GradeNormaliser;
  players: readonly NativePlayer[];
  links: readonly PlayerLink[];
  review: readonly ReviewRow[];
  pendingKeeperIds: readonly number[];
  privateByGuid: ReadonlyMap<string, boolean>;
  decisions: ReadonlyMap<number, SeedDecision>;
  existing: {
    map: readonly ExistingMapRow[];
    mergedAway: ReadonlySet<string>;
    boundaries: readonly Boundary[];
    seedBatches: ReadonlyArray<{ id: number; label: string; source: string }>;
    /** Migrations 0021 / 0022 aren't applied: the store can't be read or written. */
    storeMissing: boolean;
  };
}

export interface SeedPlan {
  boundaries: {
    desired: Boundary[];
    current: Boundary[];
    changed: boolean;
    table: BoundaryTableRow[];
  };
  history: HistoryPlan;
  batch: {
    existing: Array<{ id: number; label: string; source: string }>;
    write: boolean;
  };
  identity: IdentityPlan;
  blockers: string[];
}

export function planSeed(input: SeedPlanInput): SeedPlan {
  const nativeGrades = [
    ...new Set(
      input.pgss
        .filter((r) => !isFillIn(r.playerId))
        .map((r) => input.seniorGrade(r.grade))
        .filter((g): g is string => g !== null),
    ),
  ];
  const { boundaries: desired, table } = deriveBoundaries(input.coverage, nativeGrades);
  const current = [...input.existing.boundaries];
  const changed = boundaryKey(desired) !== boundaryKey(current);
  const history = planHistoryRows({
    pgss: input.pgss,
    boundaries: desired,
    seniorGrade: input.seniorGrade,
  });
  const historyPlayerIds = new Set(history.rows.map((r) => r.playerId));
  const identity = planIdentity({
    players: input.players,
    links: input.links,
    review: input.review,
    pendingKeeperIds: input.pendingKeeperIds,
    existingMap: input.existing.map,
    historyPlayerIds,
    decisions: input.decisions,
    privateByGuid: input.privateByGuid,
    mergedAway: input.existing.mergedAway,
  });
  const existingBatches = input.existing.seedBatches.filter((b) => b.source === SEED_SOURCE);

  const blockers: string[] = [];
  if (input.existing.storeMissing) {
    blockers.push(
      "The club history tables aren't in this database yet: apply migrations 0021 and 0022 " +
        "before seeding (preview shown against an empty store).",
    );
  }
  if (input.pendingKeeperIds.length > 0) {
    blockers.push(
      `${input.pendingKeeperIds.length} Halls Head keeper crosswalk row(s) aren't persisted yet: ` +
        "run persist-hh-crosswalk (U4) with --commit first.",
    );
  }
  if (identity.undecided.length > 0) {
    blockers.push(
      `${identity.undecided.length} player(s) still need a decision (map or unmapped) in the ` +
        `decisions file: ${identity.undecided.join(", ")}.`,
    );
  }
  blockers.push(...identity.errors);
  if (existingBatches.length > 0 && changed) {
    const ids = existingBatches.map((b) => `#${b.id}`).join(", ");
    blockers.push(
      `The derived boundaries differ from the ones in place, and seed batch ${ids} was loaded ` +
        `under them: undo batch ${ids} first (--undo=<id> --commit), then re-seed.`,
    );
  }
  const idsInSpace = new Set<number>([
    ...input.existing.map.map((r) => r.playerId),
    ...identity.decisionMapInserts.map((r) => r.playerId),
    ...identity.pins.map((p) => p.playerId),
  ]);
  const unresolved = [...historyPlayerIds]
    .filter((id) => !idsInSpace.has(id))
    .sort((a, b) => a - b);
  if (existingBatches.length === 0 && unresolved.length > 0) {
    blockers.push(
      `${unresolved.length} player(s) with history rows would have no tenant player id ` +
        `(no crosswalk row, no pin): ${unresolved.slice(0, 20).join(", ")}` +
        `${unresolved.length > 20 ? " …" : ""}.`,
    );
  }

  return {
    boundaries: { desired, current, changed, table },
    history,
    batch: {
      existing: existingBatches,
      write: existingBatches.length === 0 && history.rows.length > 0,
    },
    identity,
    blockers,
  };
}

/** Stable fingerprint of what a commit would write, to prove commit == preview. */
export function seedWriteSet(plan: SeedPlan): string {
  return JSON.stringify({
    boundaries: plan.boundaries.changed ? plan.boundaries.desired : null,
    maps: plan.identity.decisionMapInserts.map((r) => `${r.participantId}=${r.playerId}`).sort(),
    pins: plan.identity.pins.map((p) => p.playerId).sort((a, b) => a - b),
    batchRows: plan.batch.write ? plan.history.rows.length : 0,
  });
}

/** "2003/04" labels for a list of start years. */
export const seasonList = (seasons: readonly number[]): string =>
  seasons.map((s) => seasonLabel(s)).join(" ");
