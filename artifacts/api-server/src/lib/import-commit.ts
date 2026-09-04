import type { Logger } from "pino";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  db,
  importsTable,
  matchesTable,
  matchPlayerLinesTable,
  matchOppositionLinesTable,
  type ImportRecord,
} from "@workspace/db";
import type { ParsedMatch, FinalsStage } from "./match-scorecard";
import { recomputeAggregates } from "./recompute";
import {
  syncCapsFromStats,
  recomputeCapsFromStats,
  GRADE_TO_CAP_CATEGORY,
  type CapSyncResult,
  type CapSyncTx,
} from "./cap-sync";
import { deriveSeasonSnapshotFromMatches } from "./match-aggregate";
import {
  snapshotCareerTotals,
  snapshotGradeGames,
  runPostCommitSocial,
} from "./post-commit-social";
import type {
  CreatedCap,
  MatchMilestoneContext,
} from "./match-milestone-detector";
import { reverseCapsAfterRollback, cleanupOrphanPlayers } from "./rollback";
import {
  reconcileBaseline,
  type ReconcileMode,
  type NegativeBaselineWarning,
} from "./baseline-reconcile";
import {
  buildResolutionMap,
  normalizeRoundStage,
  parseCommitRound,
  parseCommitStage,
} from "./import-body-parsers";
import {
  parseReconcileMode,
  nameNegativeWarnings,
  resolveMatchPlayers,
  type NamedNegativeWarning,
} from "./import-helpers";

/**
 * The commit / rollback core shared by every import path (CSV season snapshot,
 * single .xlsx scorecard, whole-season batch, undo-season).
 *
 * Every commit follows the same spine inside ONE transaction:
 *
 *   write rows → derive season snapshot → (backfill) reconcile baseline
 *   → recomputeAggregates → sync caps
 *
 * and then, outside the transaction, logs refused cap mints and runs the
 * social/milestone pipeline (never for a backfill). The steps below are the
 * named pieces of that spine; `commitMatchImport` / `deleteMatchImport` wire
 * them together for a single scorecard, and the routers reuse the pieces for
 * the CSV and batch paths. Nothing here touches the request or response — the
 * routers translate the returned outcome to HTTP.
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/** A parsed scorecard player line resolved to a `players.id`. */
export type ResolvedMatchLine = ParsedMatch["players"][number] & {
  playerId: number;
};

/** A (grade, season) pair whose snapshot/aggregates a commit touches. */
export type AffectedSeason = { grade: string; season: number };

/**
 * Columns the import log and every commit response expose. The payload is
 * deliberately excluded — it is a parsed scorecard, not something to echo.
 */
export const IMPORT_SUMMARY_COLUMNS = {
  id: importsTable.id,
  filename: importsTable.filename,
  grade: importsTable.grade,
  season: importsTable.season,
  round: importsTable.round,
  kind: importsTable.kind,
  rowCount: importsTable.rowCount,
  status: importsTable.status,
  importedAt: importsTable.importedAt,
};

export type ImportSummary = Pick<
  ImportRecord,
  | "id"
  | "filename"
  | "grade"
  | "season"
  | "round"
  | "kind"
  | "rowCount"
  | "status"
  | "importedAt"
>;

/** Body returned by the CSV and single-match commit endpoints. */
export type ImportCommitResponse = ImportSummary & {
  capsSync: CapSyncResult[];
  reconcileMode: ReconcileMode | null;
  negativeWarnings: NamedNegativeWarning[];
};

/** Result of committing a single match import; the router maps it to HTTP. */
export type MatchCommitOutcome =
  | { ok: true; body: ImportCommitResponse }
  | { ok: false; status: 400; error: string };

// ---------------------------------------------------------------------------
// Step: audit / logging
// ---------------------------------------------------------------------------

/**
 * Surface a refused auto-mint. `capsSync[].skipped` carries this to the client
 * too, but a club that imports and finds nobody capped needs a trail on the
 * server as well — the refusal is deliberate (see `MAX_AUTO_DEBUTS` in
 * cap-sync.ts) and nothing else records that it happened.
 */
export function logSkippedCapMints(
  logger: Logger,
  tenantId: number,
  capsSync: CapSyncResult[],
): void {
  for (const r of capsSync) {
    if (r.skipped === 0) continue;
    logger.warn(
      { tenantId, grade: r.grade, category: r.category, skipped: r.skipped },
      `Declined to auto-issue ${r.skipped} ${r.grade} caps: too much of the squad is uncapped, which reads as an unlinked cap register rather than a round of debuts. Cap these players by hand.`,
    );
  }
}

/** Re-read an import's summary row after commit for the response body. */
export async function loadImportSummary(id: number): Promise<ImportSummary> {
  const [updated] = await db
    .select(IMPORT_SUMMARY_COLUMNS)
    .from(importsTable)
    .where(eq(importsTable.id, id));
  return updated satisfies ImportSummary;
}

// ---------------------------------------------------------------------------
// Step: write the match and its lines
// ---------------------------------------------------------------------------

/**
 * Replace any existing match for this grade+season+(round|stage) so
 * re-importing the same round or final is idempotent, then insert the new
 * match row. Returns the inserted row.
 */
export async function replaceMatchRow(
  tx: CapSyncTx,
  opts: {
    importId: number;
    grade: string;
    season: number;
    round: number | null;
    stage: FinalsStage | null;
    parsed: ParsedMatch;
  },
): Promise<typeof matchesTable.$inferSelect> {
  const { importId, grade, season, round, stage, parsed } = opts;
  await tx
    .delete(matchesTable)
    .where(
      and(
        eq(matchesTable.grade, grade),
        eq(matchesTable.season, season),
        round == null
          ? sql`${matchesTable.round} IS NULL`
          : eq(matchesTable.round, round),
        stage == null
          ? sql`${matchesTable.stage} IS NULL`
          : eq(matchesTable.stage, stage),
      ),
    );

  const [match] = await tx
    .insert(matchesTable)
    .values({
      importId,
      grade,
      season,
      round,
      stage,
      competition: parsed.competition ?? null,
      matchDate: parsed.matchDate ?? null,
      venue: parsed.venue ?? null,
      result: parsed.result ?? null,
      opponent: parsed.opponent ?? null,
      hhccScore: parsed.hhccScore ?? null,
      opponentScore: parsed.opponentScore ?? null,
      abandoned: parsed.abandoned,
    })
    .returning();
  return match;
}

/** Insert the club's player lines for a match (no-op when there are none). */
export async function insertPlayerLines(
  tx: CapSyncTx,
  matchId: number,
  lines: ResolvedMatchLine[],
): Promise<void> {
  if (lines.length === 0) return;
  await tx.insert(matchPlayerLinesTable).values(
    lines.map((l) => ({
      matchId,
      playerId: l.playerId,
      batted: l.batted,
      battingPos: l.battingPos ?? null,
      runs: l.runs ?? null,
      balls: l.balls ?? null,
      fours: l.fours ?? null,
      sixes: l.sixes ?? null,
      notOut: l.notOut,
      dismissal: l.dismissal ?? null,
      bowled: l.bowled,
      overs: l.overs ?? null,
      maidens: l.maidens ?? null,
      runsConceded: l.runsConceded ?? null,
      wickets: l.wickets ?? null,
      wides: l.wides ?? null,
      noBalls: l.noBalls ?? null,
      catches: l.catches,
      stumpings: l.stumpings,
      runOuts: l.runOuts,
    })),
  );
}

/**
 * Insert the opposition's lines: display-only, no player FK, cascade with the
 * match (no-op when there are none).
 */
export async function insertOppositionLines(
  tx: CapSyncTx,
  matchId: number,
  opposition: ParsedMatch["opposition"],
): Promise<void> {
  if (opposition.length === 0) return;
  await tx.insert(matchOppositionLinesTable).values(
    opposition.map((o) => ({
      matchId,
      name: o.name,
      batted: o.batted,
      battingPos: o.battingPos ?? null,
      runs: o.runs ?? null,
      balls: o.balls ?? null,
      fours: o.fours ?? null,
      sixes: o.sixes ?? null,
      notOut: o.notOut,
      dismissal: o.dismissal ?? null,
      bowled: o.bowled,
      overs: o.overs ?? null,
      maidens: o.maidens ?? null,
      runsConceded: o.runsConceded ?? null,
      wickets: o.wickets ?? null,
      wides: o.wides ?? null,
      noBalls: o.noBalls ?? null,
      catches: o.catches,
      stumpings: o.stumpings,
      runOuts: o.runOuts,
    })),
  );
}

// ---------------------------------------------------------------------------
// Step: season snapshot → baseline → aggregates → caps
// ---------------------------------------------------------------------------

/**
 * Re-derive the season snapshot for each affected (grade, season) from its
 * matches, collecting the cap-numbering order per grade (concatenated across
 * that grade's seasons in the order given; first appearance wins).
 */
export async function deriveSeasonSnapshots(
  tx: CapSyncTx,
  affected: AffectedSeason[],
): Promise<Map<string, number[]>> {
  const orderedByGrade = new Map<string, number[]>();
  const seenByGrade = new Map<string, Set<number>>();
  for (const { grade, season } of affected) {
    const { orderedPlayerIds } = await deriveSeasonSnapshotFromMatches(
      tx,
      grade,
      season,
    );
    let order = orderedByGrade.get(grade);
    let seen = seenByGrade.get(grade);
    if (!order || !seen) {
      order = [];
      seen = new Set<number>();
      orderedByGrade.set(grade, order);
      seenByGrade.set(grade, seen);
    }
    for (const pid of orderedPlayerIds) {
      if (!seen.has(pid)) {
        seen.add(pid);
        order.push(pid);
      }
    }
  }
  return orderedByGrade;
}

/**
 * Backfill only: reconcile each affected (grade, season) baseline BEFORE the
 * recompute so career totals stay invariant (peel) or additive (add). Returns
 * the players whose baseline floored at zero; nothing happens (and nothing is
 * returned) when `reconcileMode` is unset, i.e. a current-season import.
 */
export async function reconcileBackfillBaselines(
  tx: CapSyncTx,
  affected: AffectedSeason[],
  reconcileMode: ReconcileMode | undefined,
): Promise<NegativeBaselineWarning[]> {
  if (reconcileMode == null) return [];
  const warnings: NegativeBaselineWarning[] = [];
  for (const { grade, season } of affected) {
    const result = await reconcileBaseline(tx, grade, season, reconcileMode);
    warnings.push(...result.negativeWarnings);
  }
  return warnings;
}

/**
 * Sync one grade's cap list from the freshly-recomputed stats. Only A Grade
 * (male) and Female A Grade (female) map to a cap category; other grades are
 * ignored and yield `null`.
 *
 * For a backfill (previous season) NEVER mint out-of-order caps — only
 * refresh existing linked caps, and report nothing. Debutants are surfaced in
 * the preview for the club to cap manually.
 */
export async function syncGradeCaps(
  tx: CapSyncTx,
  tenantId: number,
  grade: string,
  orderedPlayerIds: number[],
  isBackfill: boolean,
): Promise<CapSyncResult | null> {
  if (isBackfill) {
    const category = GRADE_TO_CAP_CATEGORY[grade];
    if (category) await recomputeCapsFromStats(tx, tenantId, [category]);
    return null;
  }
  return syncCapsFromStats(tx, tenantId, grade, orderedPlayerIds);
}

// ---------------------------------------------------------------------------
// Step: social / milestone hand-off
// ---------------------------------------------------------------------------

/** Flatten the caps each grade's sync minted into detector-ready records. */
export function collectCreatedCaps(capsSync: CapSyncResult[]): CreatedCap[] {
  return capsSync.flatMap((r) =>
    r.createdCaps.map((c) => ({
      capNumber: c.capNumber,
      category: r.category,
      playerId: c.playerId,
    })),
  );
}

/** Project resolved scorecard lines to what the milestone detector reads. */
export function toMilestoneLines(
  lines: ResolvedMatchLine[],
): MatchMilestoneContext["lines"] {
  return lines.map((l) => ({
    playerId: l.playerId,
    runs: l.runs ?? null,
    balls: l.balls ?? null,
    notOut: l.notOut,
    wickets: l.wickets ?? null,
    runsConceded: l.runsConceded ?? null,
    overs: l.overs ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Step: rollback tail
// ---------------------------------------------------------------------------

/**
 * After import/match rows are gone: recompute the affected grades, reverse any
 * caps that no longer have a basis, and drop players left with no lines.
 * Returns how many players were removed.
 */
export async function rollbackAggregatesAndCaps(
  tx: CapSyncTx,
  tenantId: number,
  affectedGrades: string[],
  candidatePlayerIds: number[],
): Promise<number> {
  await recomputeAggregates(tx, affectedGrades);
  await reverseCapsAfterRollback(tx, tenantId, affectedGrades);
  return cleanupOrphanPlayers(tx, candidatePlayerIds);
}

// ---------------------------------------------------------------------------
// Single-match commit
// ---------------------------------------------------------------------------

type MatchTarget = {
  grade: string;
  season: number;
  round: number | null;
  stage: FinalsStage | null;
};

/**
 * Work out which (grade, season, round|stage) slot the match lands in. The
 * admin can set/correct the round OR the finals stage in the preview before
 * committing; their value wins over the parsed/header value, and a stage
 * always forces round to null. Returns null when grade or season is unknown.
 */
function resolveMatchTarget(
  body: unknown,
  parsed: ParsedMatch,
  imp: ImportRecord,
): MatchTarget | null {
  const grade = parsed.grade ?? imp.grade;
  const season = parsed.season ?? imp.season;
  const overrideRound = parseCommitRound(body);
  const overrideStage = parseCommitStage(body);
  const rawRound =
    overrideRound !== undefined
      ? overrideRound
      : (parsed.round ?? imp.round ?? null);
  const rawStage =
    overrideStage !== undefined ? overrideStage : (parsed.stage ?? null);
  const { round, stage } = normalizeRoundStage(rawRound, rawStage);
  if (!grade || season == null) return null;
  return { grade, season, round, stage };
}

/**
 * Commit a pending single-match import: write the match + lines (replacing any
 * earlier import of the same round/final), mark the import committed, then
 * re-derive the season snapshot and downstream aggregates and caps — all in
 * one transaction — before handing off to the social/milestone pipeline.
 */
export async function commitMatchImport(opts: {
  tenantId: number;
  /** The commit request body (round/stage overrides, resolutions, reconcileMode). */
  body: unknown;
  logger: Logger;
  imp: ImportRecord;
}): Promise<MatchCommitOutcome> {
  const { tenantId, body, logger, imp } = opts;
  const parsed = imp.payload as ParsedMatch | null;
  if (!parsed) {
    return { ok: false, status: 400, error: "Import payload is empty" };
  }
  const target = resolveMatchTarget(body, parsed, imp);
  if (!target) {
    return {
      ok: false,
      status: 400,
      error: "Match import has no grade/season; cannot commit.",
    };
  }
  const { grade, season, round, stage } = target;

  // Backfill mode: previous-season match import reconciles the baseline and
  // suppresses social / out-of-order caps.
  const reconcileMode = parseReconcileMode(body);
  const isBackfill = reconcileMode != null;

  const resolvedLines = await resolveMatchPlayers(
    parsed.players,
    buildResolutionMap(body),
  );

  const beforeMap = await snapshotCareerTotals();
  // Per-grade game counts before the commit — debut detection compares these to
  // who appears in the match (0→1 in a cap-register grade = a debut).
  const gradeGamesBefore = await snapshotGradeGames(grade);
  const capsSync: CapSyncResult[] = [];
  const negativeWarnings: NegativeBaselineWarning[] = [];
  const affected: AffectedSeason[] = [{ grade, season }];

  await db.transaction(async (tx) => {
    const match = await replaceMatchRow(tx, {
      importId: imp.id,
      grade,
      season,
      round,
      stage,
      parsed,
    });
    await insertPlayerLines(tx, match.id, resolvedLines);
    await insertOppositionLines(tx, match.id, parsed.opposition);

    await tx
      .update(importsTable)
      .set({ status: "committed", payload: null, round })
      .where(eq(importsTable.id, imp.id));

    // Re-derive the season snapshot from every match in this grade+season and
    // recompute the downstream aggregates in the same transaction.
    const orderedByGrade = await deriveSeasonSnapshots(tx, affected);
    negativeWarnings.push(
      ...(await reconcileBackfillBaselines(tx, affected, reconcileMode)),
    );
    await recomputeAggregates(tx, [grade]);
    const capResult = await syncGradeCaps(
      tx,
      tenantId,
      grade,
      orderedByGrade.get(grade) ?? [],
      isBackfill,
    );
    if (capResult) capsSync.push(capResult);
  });

  logSkippedCapMints(logger, tenantId, capsSync);

  // Suppressed for backfills — previous-season match imports must not trigger
  // milestone detection or social drafts.
  if (!isBackfill) {
    await runPostCommitSocial({
      tenantId,
      importId: imp.id,
      affectedGrades: [grade],
      season,
      beforeMap,
      logger,
      matchContext: {
        tenantId,
        importId: imp.id,
        grade,
        season,
        round,
        opponent: parsed.opponent ?? null,
        abandoned: parsed.abandoned,
        lines: toMilestoneLines(resolvedLines),
        createdCaps: collectCreatedCaps(capsSync),
        gradeGamesBefore,
      },
    });
  }

  const namedWarnings = await nameNegativeWarnings(negativeWarnings);
  const summary = await loadImportSummary(imp.id);
  return {
    ok: true,
    body: {
      ...summary,
      capsSync,
      reconcileMode: reconcileMode ?? null,
      negativeWarnings: namedWarnings,
    },
  };
}

// ---------------------------------------------------------------------------
// Single-match delete
// ---------------------------------------------------------------------------

/**
 * What a match import owns: its (grade, season) slots and the players who
 * appeared in its matches — candidates for orphan cleanup once their lines
 * are gone.
 */
async function loadMatchImportFootprint(importId: number): Promise<{
  matchRows: AffectedSeason[];
  candidatePlayerIds: number[];
}> {
  const matchRows = await db
    .select({ grade: matchesTable.grade, season: matchesTable.season })
    .from(matchesTable)
    .where(eq(matchesTable.importId, importId));

  const matchIdRows = await db
    .select({ id: matchesTable.id })
    .from(matchesTable)
    .where(eq(matchesTable.importId, importId));
  const matchIds = matchIdRows.map((m) => m.id);
  let candidatePlayerIds: number[] = [];
  if (matchIds.length > 0) {
    const lineRows = await db
      .selectDistinct({ playerId: matchPlayerLinesTable.playerId })
      .from(matchPlayerLinesTable)
      .where(inArray(matchPlayerLinesTable.matchId, matchIds));
    candidatePlayerIds = lineRows.map((l) => l.playerId);
  }
  return { matchRows, candidatePlayerIds };
}

/**
 * Delete a single match import. Cascades the match + its lines, then re-derives
 * the season snapshot from the remaining matches (if any) and rolls back any
 * caps / orphan players that no longer have a basis.
 */
export async function deleteMatchImport(
  tenantId: number,
  importId: number,
): Promise<void> {
  const { matchRows, candidatePlayerIds } =
    await loadMatchImportFootprint(importId);
  const affectedGrades = Array.from(new Set(matchRows.map((m) => m.grade)));

  await db.transaction(async (tx) => {
    // Cascades matches + match_player_lines for this import.
    await tx.delete(importsTable).where(eq(importsTable.id, importId));
    for (const { grade, season } of matchRows) {
      await deriveSeasonSnapshotFromMatches(tx, grade, season);
      // Re-reconcile any peeled baseline against the (now smaller) season total.
      // No mode: reverse the prior peel and re-peel the remaining season total.
      await reconcileBaseline(tx, grade, season);
    }
    if (affectedGrades.length > 0) {
      await rollbackAggregatesAndCaps(
        tx,
        tenantId,
        affectedGrades,
        candidatePlayerIds,
      );
    }
  });
}
