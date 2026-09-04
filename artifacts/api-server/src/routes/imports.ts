import { Router, type IRouter, type Request } from "express";
import multer from "multer";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  db,
  importsTable,
  playersTable,
  playerGradeSeasonStatsTable,
  matchesTable,
  matchPlayerLinesTable,
  matchOppositionLinesTable,
  type ImportRecord,
} from "@workspace/db";
import { parsePlaycricketCsv, type ParsedCsvRow } from "../lib/playcricket-csv";
import {
  parseMatchScorecard,
  type ParsedMatch,
  type FinalsStage,
} from "../lib/match-scorecard";
import { recomputeAggregates } from "../lib/recompute";
import {
  syncCapsFromStats,
  getCappedPlayerIds,
  GRADE_TO_CAP_CATEGORY,
  type CapSyncResult,
} from "../lib/cap-sync";
import {
  buildNameMatcher,
  nameKey,
  type NameCandidate,
} from "../lib/name-match";
import { deriveSeasonSnapshotFromMatches } from "../lib/match-aggregate";
import { getTenantId } from "../middlewares/tenant-context";
import { shouldReadCentral } from "../lib/tenant";
import {
  snapshotCareerTotals,
  snapshotGradeGames,
  runPostCommitSocial,
  runBatchPostCommitSocial,
} from "../lib/post-commit-social";
import type {
  CreatedCap,
  MatchMilestoneContext,
} from "../lib/match-milestone-detector";
import {
  reverseCapsAfterRollback,
  cleanupOrphanPlayers,
} from "../lib/rollback";
import {
  reconcileBaseline,
  loadBackfillBaseFigures,
  type NegativeBaselineWarning,
} from "../lib/baseline-reconcile";
import { recomputeCapsFromStats } from "../lib/cap-sync";
import { requireAdmin } from "../middlewares/require-admin";
import { adminWriteRateLimiter } from "../middlewares/rate-limit";

import {
  buildResolutionMap,
  normalizeRoundStage,
  parseCommitRound,
  parseCommitStage,
} from "../lib/import-body-parsers";
import {
  type BackfillFigures,
  type BatchCandidate,
  parseReconcileMode,
  nameNegativeWarnings,
  loadRoster,
  resolveMatchPlayers,
  parseFileResolutions,
  expandUploads,
  classifyBatchFiles,
  toBatchFileDto,
} from "../lib/import-helpers";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// A whole-season batch can be many scorecards (or a .zip of them) at once.
const uploadBatch = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 80 },
});

type MulterRequest = Request & { file?: Express.Multer.File };
type MulterArrayRequest = Request & { files?: Express.Multer.File[] };

/**
 * Surface a refused auto-mint. `capsSync[].skipped` carries this to the client
 * too, but a club that imports and finds nobody capped needs a trail on the
 * server as well — the refusal is deliberate (see `MAX_AUTO_DEBUTS` in
 * cap-sync.ts) and nothing else records that it happened.
 */
function logSkippedCapMints(
  logger: import("pino").Logger,
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

// The import log is admin-only: filenames, grades and seasons of every upload
// are operational detail, not public stats. It also lives in the native
// (tenant #1) tables, so a central tenant gets an empty list rather than the
// demo club's history.
router.get("/imports", requireAdmin, async (req, res): Promise<void> => {
  if (await shouldReadCentral(req)) {
    res.json([]);
    return;
  }
  const rows = await db
    .select({
      id: importsTable.id,
      filename: importsTable.filename,
      grade: importsTable.grade,
      season: importsTable.season,
      round: importsTable.round,
      kind: importsTable.kind,
      rowCount: importsTable.rowCount,
      status: importsTable.status,
      importedAt: importsTable.importedAt,
    })
    .from(importsTable)
    .orderBy(desc(importsTable.importedAt));
  res.json(rows);
});

router.post(
  "/imports/playcricket-csv",
  requireAdmin,
  adminWriteRateLimiter,
  upload.single("file"),
  async (req: MulterRequest, res): Promise<void> => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Missing file field" });
      return;
    }
    const seasonRaw = req.body?.season;
    const season = seasonRaw != null ? parseInt(String(seasonRaw), 10) : NaN;
    if (!Number.isInteger(season) || season < 1900 || season > 2100) {
      res.status(400).json({ error: "season must be an integer year (e.g. 2025)" });
      return;
    }

    let parsed;
    try {
      parsed = parsePlaycricketCsv(file.buffer.toString("utf8"));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }

    if (parsed.rows.length === 0) {
      res.status(400).json({
        error:
          "No usable rows. " +
          (parsed.unmappedGrades.length > 0
            ? `Unrecognised PlayCricket grade(s): ${parsed.unmappedGrades.join(", ")}`
            : "Empty CSV."),
      });
      return;
    }

    // For now we assume a single-grade CSV (the PlayCricket export is per-grade).
    // If multiple grades appear, we still proceed and record `grade=null` on the
    // import row, but each snapshot row is keyed by its own grade.
    const importGrade = parsed.grades.length === 1 ? parsed.grades[0] : null;

    // Cap-eligibility for debut detection (A Grade / Female A Grade only).
    const capCategory = importGrade
      ? (GRADE_TO_CAP_CATEGORY[importGrade] ?? null)
      : null;
    const cappedIds = capCategory
      ? await getCappedPlayerIds(getTenantId(req), capCategory)
      : new Set<number>();

    // Match parsed names against the roster: exact, fuzzy suggestion, or new.
    const matcher = buildNameMatcher(await loadRoster());

    // Per-name season contribution (for the backfill net-effect preview).
    const seasonByKey = new Map<string, { games: number; runs: number; wickets: number }>();
    for (const row of parsed.rows) {
      const key = nameKey(row.surname, row.givenName);
      const s = seasonByKey.get(key) ?? { games: 0, runs: 0, wickets: 0 };
      s.games += row.games;
      s.runs += row.runs;
      s.wickets += row.wickets;
      seasonByKey.set(key, s);
    }

    const previewPlayers: Array<{
      surname: string;
      givenName: string;
      status: "matched" | "suggested" | "new";
      playerId: number | null;
      candidates: NameCandidate[];
      debut: boolean;
      resolvedId: number | null;
      key: string;
      backfill: BackfillFigures | null;
    }> = [];
    const seenKeys = new Set<string>();
    let matched = 0;
    let suggested = 0;
    let created = 0;
    let debuts = 0;
    for (const row of parsed.rows) {
      const key = nameKey(row.surname, row.givenName);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const m = matcher.resolve(row.surname, row.givenName);
      if (m.status === "matched") matched++;
      else if (m.status === "suggested") suggested++;
      else created++;
      // Best-guess resolved id for the initial debut flag: the exact match, the
      // top suggestion, or null (a brand-new player is always a debut).
      const resolvedId =
        m.status === "matched"
          ? m.playerId
          : (m.candidates[0]?.playerId ?? null);
      const debut =
        capCategory != null &&
        (resolvedId == null || !cappedIds.has(resolvedId));
      if (debut) debuts++;
      previewPlayers.push({
        surname: row.surname,
        givenName: row.givenName,
        status: m.status,
        playerId: m.status === "matched" ? m.playerId : null,
        candidates: m.candidates,
        debut,
        resolvedId,
        key,
        backfill: null,
      });
    }

    // Attach backfill net-effect figures for matched players (single-grade CSV
    // only; the baseline being peeled is per-grade).
    if (importGrade != null) {
      const ids = previewPlayers
        .map((p) => p.resolvedId)
        .filter((id): id is number => id != null);
      const base = await loadBackfillBaseFigures(importGrade, ids);
      for (const p of previewPlayers) {
        if (p.resolvedId == null) continue;
        const b = base.get(p.resolvedId);
        if (!b) continue;
        const s = seasonByKey.get(p.key) ?? { games: 0, runs: 0, wickets: 0 };
        p.backfill = {
          seasonGames: s.games,
          seasonRuns: s.runs,
          seasonWickets: s.wickets,
          ...b,
        };
      }
    }

    const gradeTotalsMap = new Map<string, { rows: number; games: number; runs: number; wickets: number }>();
    for (const r of parsed.rows) {
      const t = gradeTotalsMap.get(r.grade) ?? { rows: 0, games: 0, runs: 0, wickets: 0 };
      t.rows += 1;
      t.games += r.games;
      t.runs += r.runs;
      t.wickets += r.wickets;
      gradeTotalsMap.set(r.grade, t);
    }
    const gradeTotals = Array.from(gradeTotalsMap.entries())
      .map(([grade, v]) => ({ grade, ...v }))
      .sort((a, b) => a.grade.localeCompare(b.grade));

    const [imp] = await db
      .insert(importsTable)
      .values({
        filename: file.originalname,
        grade: importGrade,
        season,
        rowCount: parsed.rows.length,
        status: "pending",
        payload: { rows: parsed.rows, unmappedGrades: parsed.unmappedGrades },
      })
      .returning();

    res.json({
      importId: imp.id,
      filename: imp.filename,
      season,
      rowsParsed: parsed.rows.length,
      matchedPlayers: matched,
      newPlayers: created,
      suggestedPlayers: suggested,
      debuts,
      capCategory,
      cappedPlayerIds: [...cappedIds],
      unmappedGrades: parsed.unmappedGrades,
      gradeTotals,
      players: previewPlayers.map((p) => ({
        surname: p.surname,
        givenName: p.givenName,
        status: p.status,
        playerId: p.playerId,
        candidates: p.candidates,
        debut: p.debut,
        backfill: p.backfill,
      })),
    });
  },
);

router.post("/imports/:id/commit", requireAdmin, adminWriteRateLimiter, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [imp] = await db.select().from(importsTable).where(eq(importsTable.id, id));
  if (!imp) {
    res.status(404).json({ error: "Import not found" });
    return;
  }
  if (imp.status !== "pending") {
    res.status(400).json({ error: `Import is already ${imp.status}` });
    return;
  }

  if (imp.kind === "match") {
    await commitMatchImport(req, res, imp);
    return;
  }

  const payload = imp.payload as { rows?: ParsedCsvRow[] } | null;
  const rows = payload?.rows;
  if (!rows || rows.length === 0) {
    res.status(400).json({ error: "Import payload is empty" });
    return;
  }
  if (imp.season == null) {
    res.status(400).json({ error: "Import has no season" });
    return;
  }
  const season = imp.season;

  // Backfill mode: when set, this import is for a PREVIOUS season — reconcile the
  // grade's season=NULL baseline (peel/add), suppress social/milestones, and only
  // refresh existing caps (never mint out-of-order caps).
  const reconcileMode = parseReconcileMode(req.body);
  const isBackfill = reconcileMode != null;

  // Admin's per-name resolutions chosen in the preview (link to existing player
  // or create new). Names without a resolution fall back to exact-match-or-create.
  const resolutions = buildResolutionMap(req.body);

  // Resolve / create players. Done outside the transaction is fine — newly
  // created players that aren't subsequently used are harmless.
  const allPlayers = await loadRoster();
  const playerByKey = new Map<string, number>();
  for (const p of allPlayers) {
    playerByKey.set(nameKey(p.surname, p.givenName), p.id);
  }
  // Created-player cache so the same name across multiple rows reuses one id.
  const createdByKey = new Map<string, number>();
  const createPlayer = async (surname: string, givenName: string, key: string) => {
    const cached = createdByKey.get(key);
    if (cached != null) return cached;
    const [created] = await db
      .insert(playersTable)
      .values({ surname, givenName })
      .returning({ id: playersTable.id });
    createdByKey.set(key, created.id);
    return created.id;
  };

  const resolved: Array<ParsedCsvRow & { playerId: number }> = [];
  for (const r of rows) {
    const key = nameKey(r.surname, r.givenName);
    const resolution = resolutions.get(key);
    let pid: number;
    if (resolution?.action === "link") {
      pid = resolution.playerId;
    } else if (resolution?.action === "create") {
      pid = await createPlayer(r.surname, r.givenName, key);
    } else {
      // No explicit resolution: exact match, else create.
      pid = playerByKey.get(key) ?? (await createPlayer(r.surname, r.givenName, key));
    }
    resolved.push({ ...r, playerId: pid });
  }

  const affectedGrades = Array.from(new Set(resolved.map((r) => r.grade)));

  // Snapshot per-player totals BEFORE the import so we can detect tier crossings.
  const beforeMap = await snapshotCareerTotals();

  const capsSync: CapSyncResult[] = [];
  const negativeWarnings: NegativeBaselineWarning[] = [];

  await db.transaction(async (tx) => {
    // Wipe any prior snapshots for (grade, season) so re-importing is idempotent.
    for (const grade of affectedGrades) {
      await tx.execute(sql`
        DELETE FROM player_grade_season_stats
        WHERE grade = ${grade} AND season = ${season}
      `);
    }

    // Insert new snapshot rows.
    await tx.insert(playerGradeSeasonStatsTable).values(
      resolved.map((r) => ({
        importId: imp.id,
        playerId: r.playerId,
        grade: r.grade,
        season,
        games: r.games,
        innings: r.innings,
        notOuts: r.notOuts,
        runs: r.runs,
        highScore: r.highScore,
        fifties: r.fifties,
        hundreds: r.hundreds,
        wickets: r.wickets,
        runsConceded: r.runsConceded,
        bestBowling: r.bestBowling,
        fiveWickets: r.fiveWickets,
        catches: r.catches,
        stumpings: r.stumpings,
        runOuts: r.runOuts,
      })),
    );

    await tx
      .update(importsTable)
      .set({ status: "committed", payload: null })
      .where(eq(importsTable.id, imp.id));

    // Backfill: reconcile each affected grade's season=NULL baseline BEFORE
    // recomputing aggregates so career totals stay invariant (peel) or are left
    // additive (add). Collect any players whose baseline floored at zero.
    if (isBackfill) {
      for (const grade of affectedGrades) {
        const result = await reconcileBaseline(tx, grade, season, reconcileMode);
        negativeWarnings.push(...result.negativeWarnings);
      }
    }

    // Recompute aggregates in the SAME transaction so readers never see
    // half-applied state and the temp/connection-state caveat doesn't apply.
    await recomputeAggregates(tx, affectedGrades);

    // Auto-sync A Grade cap lists from the freshly-recomputed stats. Only
    // A Grade (male) and Female A Grade (female) map to a cap category; other
    // grades are ignored. New caps are numbered in batting order, which the
    // PlayCricket CSV does not carry, so we fall back to CSV row order (the
    // order rows appear in `resolved`).
    //
    // For a backfill (previous season) NEVER mint out-of-order caps — only
    // refresh existing linked caps via recomputeCapsFromStats. Debutants are
    // surfaced in the preview for the club to cap manually.
    for (const grade of affectedGrades) {
      if (isBackfill) {
        const category = GRADE_TO_CAP_CATEGORY[grade];
        if (category) await recomputeCapsFromStats(tx, getTenantId(req), [category]);
      } else {
        const orderedPlayerIds = resolved
          .filter((r) => r.grade === grade)
          .map((r) => r.playerId);
        const result = await syncCapsFromStats(
          tx,
          getTenantId(req),
          grade,
          orderedPlayerIds,
        );
        if (result) capsSync.push(result);
      }
    }
  });

  logSkippedCapMints(req.log, getTenantId(req), capsSync);

  // Milestone detection + round-up drafts (shared with the per-match import path).
  // Suppressed for backfills — previous-season imports must not trigger social.
  if (!isBackfill) {
    await runPostCommitSocial({
      tenantId: getTenantId(req),
      importId: imp.id,
      affectedGrades,
      season,
      beforeMap,
      logger: req.log,
    });
  }

  const namedWarnings = await nameNegativeWarnings(negativeWarnings);

  const [updated] = await db
    .select({
      id: importsTable.id,
      filename: importsTable.filename,
      grade: importsTable.grade,
      season: importsTable.season,
      round: importsTable.round,
      kind: importsTable.kind,
      rowCount: importsTable.rowCount,
      status: importsTable.status,
      importedAt: importsTable.importedAt,
    })
    .from(importsTable)
    .where(eq(importsTable.id, id));

  const importFields = updated satisfies Pick<
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
  res.json({
    ...importFields,
    capsSync,
    reconcileMode: reconcileMode ?? null,
    negativeWarnings: namedWarnings,
  });
});

router.delete("/imports/:id", requireAdmin, adminWriteRateLimiter, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [imp] = await db.select().from(importsTable).where(eq(importsTable.id, id));
  if (!imp) {
    res.status(404).json({ error: "Import not found" });
    return;
  }

  if (imp.kind === "match") {
    await deleteMatchImport(req, res, id);
    return;
  }

  // A pending batch holder owns no snapshot/match rows yet — cancelling it is
  // just dropping the holder row.
  if (imp.kind === "match-batch") {
    await db.delete(importsTable).where(eq(importsTable.id, id));
    res.sendStatus(204);
    return;
  }

  // Find which grades + players were touched before we drop the snapshots.
  const affected = await db
    .selectDistinct({
      grade: playerGradeSeasonStatsTable.grade,
      playerId: playerGradeSeasonStatsTable.playerId,
    })
    .from(playerGradeSeasonStatsTable)
    .where(eq(playerGradeSeasonStatsTable.importId, id));
  const affectedGrades = Array.from(new Set(affected.map((r) => r.grade)));
  const candidatePlayerIds = Array.from(new Set(affected.map((r) => r.playerId)));

  await db.transaction(async (tx) => {
    // Snapshots cascade-delete via FK when the import row goes.
    await tx.delete(importsTable).where(eq(importsTable.id, id));
    if (affectedGrades.length > 0) {
      // Restore any peeled baseline for this (grade, season). The season
      // snapshots are now gone, so reconcile (no mode) just adds the stored
      // deltas back and re-peels nothing.
      if (imp.season != null) {
        for (const grade of affectedGrades) {
          await reconcileBaseline(tx, grade, imp.season);
        }
      }
      await recomputeAggregates(tx, affectedGrades);
      await reverseCapsAfterRollback(tx, getTenantId(req), affectedGrades);
      await cleanupOrphanPlayers(tx, candidatePlayerIds);
    }
  });

  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// Per-match .xlsx scorecard import
// ---------------------------------------------------------------------------

type MatchCommitReq = Request & { log: import("pino").Logger };

router.post(
  "/imports/match-xlsx",
  requireAdmin,
  adminWriteRateLimiter,
  upload.single("file"),
  async (req: MulterRequest, res): Promise<void> => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Missing file field" });
      return;
    }

    let parsed: ParsedMatch;
    try {
      parsed = parseMatchScorecard(file.buffer);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }

    if (!parsed.abandoned && (!parsed.grade || parsed.season == null)) {
      res.status(400).json({
        error:
          "Could not determine grade and season from the scorecard. " +
          "Check the file header.",
      });
      return;
    }

    // Cap-eligibility for debut detection (A Grade / Female A Grade only).
    const capCategory = parsed.grade
      ? (GRADE_TO_CAP_CATEGORY[parsed.grade] ?? null)
      : null;
    const cappedIds = capCategory
      ? await getCappedPlayerIds(getTenantId(req), capCategory)
      : new Set<number>();

    // Match parsed players against the roster: exact, fuzzy suggestion, or new.
    const matcher = buildNameMatcher(await loadRoster());

    let matched = 0;
    let suggested = 0;
    let created = 0;
    let debuts = 0;
    const previewPlayers = parsed.players.map((p) => {
      const m = matcher.resolve(p.surname, p.givenName);
      if (m.status === "matched") matched++;
      else if (m.status === "suggested") suggested++;
      else created++;
      const resolvedId =
        m.status === "matched"
          ? m.playerId
          : (m.candidates[0]?.playerId ?? null);
      const debut =
        capCategory != null &&
        (resolvedId == null || !cappedIds.has(resolvedId));
      if (debut) debuts++;
      return {
        surname: p.surname,
        givenName: p.givenName,
        status: m.status,
        playerId: m.status === "matched" ? m.playerId : null,
        candidates: m.candidates,
        debut,
        resolvedId,
        batted: p.batted,
        battingPos: p.battingPos ?? null,
        runs: p.runs ?? null,
        balls: p.balls ?? null,
        notOut: p.notOut,
        dismissal: p.dismissal ?? null,
        bowled: p.bowled,
        overs: p.overs ?? null,
        wickets: p.wickets ?? null,
        runsConceded: p.runsConceded ?? null,
        catches: p.catches,
        stumpings: p.stumpings,
        runOuts: p.runOuts,
        backfill: null as BackfillFigures | null,
      };
    });

    // Attach backfill net-effect figures (this match's per-player contribution
    // vs. the current baseline/career) so the UI can preview a peel. The commit
    // re-derives the full season total and is authoritative.
    if (parsed.grade != null) {
      const ids = previewPlayers
        .map((p) => p.resolvedId)
        .filter((id): id is number => id != null);
      const base = await loadBackfillBaseFigures(parsed.grade, ids);
      for (const p of previewPlayers) {
        if (p.resolvedId == null) continue;
        const b = base.get(p.resolvedId);
        if (!b) continue;
        p.backfill = {
          seasonGames: p.batted || p.bowled ? 1 : 0,
          seasonRuns: p.runs ?? 0,
          seasonWickets: p.wickets ?? 0,
          ...b,
        };
      }
    }

    // Was this grade+season+(round|stage) already imported?
    let matchExists = false;
    if (parsed.grade && parsed.season != null) {
      const existingMatch = await db
        .select({ id: matchesTable.id })
        .from(matchesTable)
        .where(
          and(
            eq(matchesTable.grade, parsed.grade),
            eq(matchesTable.season, parsed.season),
            parsed.round == null
              ? sql`${matchesTable.round} IS NULL`
              : eq(matchesTable.round, parsed.round),
            parsed.stage == null
              ? sql`${matchesTable.stage} IS NULL`
              : eq(matchesTable.stage, parsed.stage),
          ),
        );
      matchExists = existingMatch.length > 0;
    }

    const warnings: string[] = [];
    if (parsed.abandoned) {
      warnings.push(
        "This match looks abandoned — it will be recorded for history but adds no stats.",
      );
    }
    if (matchExists) {
      warnings.push(
        parsed.stage
          ? `A ${parsed.stage} for this grade and season already exists. Committing will replace it.`
          : "A match for this grade, season and round already exists. Committing will replace it.",
      );
    }

    const [imp] = await db
      .insert(importsTable)
      .values({
        filename: file.originalname,
        kind: "match",
        grade: parsed.grade,
        season: parsed.season,
        round: parsed.round,
        rowCount: parsed.players.length,
        status: "pending",
        payload: parsed as unknown as Record<string, unknown>,
      })
      .returning();

    res.json({
      importId: imp.id,
      filename: imp.filename,
      grade: parsed.grade,
      season: parsed.season,
      round: parsed.round,
      stage: parsed.stage,
      competition: parsed.competition,
      matchDate: parsed.matchDate,
      venue: parsed.venue,
      result: parsed.result,
      abandoned: parsed.abandoned,
      opponent: parsed.opponent,
      hhccScore: parsed.hhccScore,
      opponentScore: parsed.opponentScore,
      matchExists,
      matchedPlayers: matched,
      newPlayers: created,
      suggestedPlayers: suggested,
      debuts,
      capCategory,
      cappedPlayerIds: [...cappedIds],
      warnings,
      players: previewPlayers.map(({ resolvedId: _resolvedId, ...rest }) => rest),
    });
  },
);

// ---------------------------------------------------------------------------
// Whole-season batch .xlsx (or .zip) scorecard import
// ---------------------------------------------------------------------------

router.post(
  "/imports/match-batch",
  requireAdmin,
  adminWriteRateLimiter,
  uploadBatch.array("files", 80),
  async (req: MulterArrayRequest, res): Promise<void> => {
    const files = req.files;
    if (!files || files.length === 0) {
      res.status(400).json({ error: "Missing files field" });
      return;
    }

    let expanded: Array<{ filename: string; buffer: Buffer }>;
    try {
      expanded = await expandUploads(files);
    } catch (e) {
      res.status(400).json({ error: `Could not read upload: ${(e as Error).message}` });
      return;
    }
    if (expanded.length === 0) {
      res.status(400).json({ error: "No .xlsx scorecards found in the upload." });
      return;
    }

    const candidates: BatchCandidate[] = expanded.map((u) => {
      try {
        return { filename: u.filename, parsed: parseMatchScorecard(u.buffer), error: null };
      } catch (e) {
        return { filename: u.filename, parsed: null, error: (e as Error).message };
      }
    });

    const classified = await classifyBatchFiles(candidates);
    const committables = classified.filter((c) => c.committable);

    // Which cap categories are in play (drives debut detection + capped sets).
    const usedCategories = new Set<"male" | "female">();
    const gradesByKey = new Map<string, Set<string>>();
    for (const c of committables) {
      const parsed = c.candidate.parsed;
      if (!parsed) continue;
      const cat = c.grade ? GRADE_TO_CAP_CATEGORY[c.grade] : undefined;
      if (cat) usedCategories.add(cat);
      for (const pl of parsed.players) {
        const k = nameKey(pl.surname, pl.givenName);
        let set = gradesByKey.get(k);
        if (!set) {
          set = new Set<string>();
          gradesByKey.set(k, set);
        }
        if (c.grade) set.add(c.grade);
      }
    }
    const cappedMale = usedCategories.has("male")
      ? await getCappedPlayerIds(getTenantId(req), "male")
      : new Set<number>();
    const cappedFemale = usedCategories.has("female")
      ? await getCappedPlayerIds(getTenantId(req), "female")
      : new Set<number>();

    const capCategoryFor = (grades: Set<string>): "male" | "female" | null => {
      for (const g of grades) {
        const cat = GRADE_TO_CAP_CATEGORY[g];
        if (cat) return cat;
      }
      return null;
    };

    // Resolve every unique name across the committable matches exactly once.
    const matcher = buildNameMatcher(await loadRoster());
    const seenKeys = new Set<string>();
    let matched = 0;
    let suggested = 0;
    let created = 0;
    let debuts = 0;
    // Sum each name's season contribution across the batch's committable
    // matches (games = appearances, runs, wickets) for the backfill preview.
    const seasonByKey = new Map<string, { games: number; runs: number; wickets: number }>();
    for (const c of committables) {
      const parsed = c.candidate.parsed;
      if (!parsed) continue;
      for (const pl of parsed.players) {
        const key = nameKey(pl.surname, pl.givenName);
        const s = seasonByKey.get(key) ?? { games: 0, runs: 0, wickets: 0 };
        s.games += pl.batted || pl.bowled ? 1 : 0;
        s.runs += pl.runs ?? 0;
        s.wickets += pl.wickets ?? 0;
        seasonByKey.set(key, s);
      }
    }

    const previewPlayers: Array<{
      surname: string;
      givenName: string;
      status: "matched" | "suggested" | "new";
      playerId: number | null;
      candidates: NameCandidate[];
      debut: boolean;
      capCategory: "male" | "female" | null;
      resolvedId: number | null;
      key: string;
      grade: string | null;
      backfill: BackfillFigures | null;
    }> = [];
    for (const c of committables) {
      const parsed = c.candidate.parsed;
      if (!parsed) continue;
      for (const pl of parsed.players) {
        const key = nameKey(pl.surname, pl.givenName);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        const m = matcher.resolve(pl.surname, pl.givenName);
        if (m.status === "matched") matched++;
        else if (m.status === "suggested") suggested++;
        else created++;
        const capCategory = capCategoryFor(gradesByKey.get(key) ?? new Set());
        const resolvedId =
          m.status === "matched" ? m.playerId : (m.candidates[0]?.playerId ?? null);
        const cappedSet = capCategory === "male" ? cappedMale : cappedFemale;
        const debut =
          capCategory != null && (resolvedId == null || !cappedSet.has(resolvedId));
        if (debut) debuts++;
        const grades = gradesByKey.get(key);
        previewPlayers.push({
          surname: pl.surname,
          givenName: pl.givenName,
          status: m.status,
          playerId: m.status === "matched" ? m.playerId : null,
          candidates: m.candidates,
          debut,
          capCategory,
          resolvedId,
          key,
          grade: grades && grades.size > 0 ? [...grades][0] : null,
          backfill: null,
        });
      }
    }

    // Attach backfill net-effect figures per matched player, grouped by their
    // (first) grade for the baseline lookup. The commit re-derives per
    // (grade, season) and is authoritative.
    const idsByGrade = new Map<string, number[]>();
    for (const p of previewPlayers) {
      if (p.resolvedId == null || p.grade == null) continue;
      const arr = idsByGrade.get(p.grade) ?? [];
      arr.push(p.resolvedId);
      idsByGrade.set(p.grade, arr);
    }
    const baseByGrade = new Map<string, Awaited<ReturnType<typeof loadBackfillBaseFigures>>>();
    for (const [grade, ids] of idsByGrade) {
      baseByGrade.set(grade, await loadBackfillBaseFigures(grade, ids));
    }
    for (const p of previewPlayers) {
      if (p.resolvedId == null || p.grade == null) continue;
      const b = baseByGrade.get(p.grade)?.get(p.resolvedId);
      if (!b) continue;
      const s = seasonByKey.get(p.key) ?? { games: 0, runs: 0, wickets: 0 };
      p.backfill = {
        seasonGames: s.games,
        seasonRuns: s.runs,
        seasonWickets: s.wickets,
        ...b,
      };
    }

    const warnings: string[] = [];
    if (committables.length === 0) {
      warnings.push("No committable matches in this upload — see the per-file problems below.");
    }
    const excluded = classified.length - committables.length;
    if (excluded > 0) {
      warnings.push(
        `${excluded} file(s) need attention (parse error, missing round/stage, unmappable grade, or duplicate).`,
      );
    }

    const [imp] = await db
      .insert(importsTable)
      .values({
        filename: `Season batch (${committables.length} match${
          committables.length === 1 ? "" : "es"
        }, ${expanded.length} file${expanded.length === 1 ? "" : "s"})`,
        kind: "match-batch",
        grade: null,
        season: null,
        round: null,
        rowCount: committables.length,
        status: "pending",
        payload: { files: candidates } as unknown as Record<string, unknown>,
      })
      .returning();

    res.json({
      importId: imp.id,
      files: classified.map(toBatchFileDto),
      players: previewPlayers.map((p) => ({
        surname: p.surname,
        givenName: p.givenName,
        status: p.status,
        playerId: p.playerId,
        candidates: p.candidates,
        debut: p.debut,
        capCategory: p.capCategory,
        backfill: p.backfill,
      })),
      matchedPlayers: matched,
      newPlayers: created,
      suggestedPlayers: suggested,
      debuts,
      committableMatches: committables.length,
      cappedPlayerIds: [...new Set([...cappedMale, ...cappedFemale])],
      warnings,
    });
  },
);

async function commitMatchImport(
  req: MatchCommitReq,
  res: Parameters<Parameters<typeof router.post>[1]>[1],
  imp: typeof importsTable.$inferSelect,
): Promise<void> {
  const parsed = imp.payload as ParsedMatch | null;
  if (!parsed) {
    res.status(400).json({ error: "Import payload is empty" });
    return;
  }
  const grade = parsed.grade ?? imp.grade;
  const season = parsed.season ?? imp.season;
  // The admin can set/correct the round OR the finals stage in the preview
  // before committing. Use their value when supplied, otherwise fall back to the
  // parsed/header value. A stage always wins and forces round to null.
  const overrideRound = parseCommitRound(req.body);
  const overrideStage = parseCommitStage(req.body);
  const rawRound =
    overrideRound !== undefined
      ? overrideRound
      : (parsed.round ?? imp.round ?? null);
  const rawStage =
    overrideStage !== undefined ? overrideStage : (parsed.stage ?? null);
  const { round, stage } = normalizeRoundStage(rawRound, rawStage);

  if (!grade || season == null) {
    res
      .status(400)
      .json({ error: "Match import has no grade/season; cannot commit." });
    return;
  }

  // Backfill mode: previous-season match import reconciles the baseline and
  // suppresses social / out-of-order caps.
  const reconcileMode = parseReconcileMode(req.body);
  const isBackfill = reconcileMode != null;

  const resolutions = buildResolutionMap(req.body);
  const resolvedLines = await resolveMatchPlayers(parsed.players, resolutions);

  const beforeMap = await snapshotCareerTotals();
  // Per-grade game counts before the commit — debut detection compares these to
  // who appears in the match (0→1 in a cap-register grade = a debut).
  const gradeGamesBefore = await snapshotGradeGames(grade);
  const capsSync: CapSyncResult[] = [];
  const negativeWarnings: NegativeBaselineWarning[] = [];

  await db.transaction(async (tx) => {
    // Replace any existing match for this grade+season+(round|stage) so
    // re-importing the same round or final is idempotent.
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
        importId: imp.id,
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

    if (resolvedLines.length > 0) {
      await tx.insert(matchPlayerLinesTable).values(
        resolvedLines.map((l) => ({
          matchId: match.id,
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

    // Opposition lines: display-only, no player FK, cascade with the match.
    if (parsed.opposition.length > 0) {
      await tx.insert(matchOppositionLinesTable).values(
        parsed.opposition.map((o) => ({
          matchId: match.id,
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

    await tx
      .update(importsTable)
      .set({ status: "committed", payload: null, round })
      .where(eq(importsTable.id, imp.id));

    // Re-derive the season snapshot from every match in this grade+season and
    // recompute the downstream aggregates in the same transaction.
    const { orderedPlayerIds } = await deriveSeasonSnapshotFromMatches(
      tx,
      grade,
      season,
    );
    // Backfill: reconcile the baseline for this grade+season BEFORE recompute.
    if (isBackfill) {
      const result = await reconcileBaseline(tx, grade, season, reconcileMode);
      negativeWarnings.push(...result.negativeWarnings);
    }
    await recomputeAggregates(tx, [grade]);
    if (isBackfill) {
      // Never mint out-of-order caps for a previous season; refresh only.
      const category = GRADE_TO_CAP_CATEGORY[grade];
      if (category) await recomputeCapsFromStats(tx, getTenantId(req), [category]);
    } else {
      const result = await syncCapsFromStats(
        tx,
        getTenantId(req),
        grade,
        orderedPlayerIds,
      );
      if (result) capsSync.push(result);
    }
  });

  const createdCaps: CreatedCap[] = capsSync.flatMap((r) =>
    r.createdCaps.map((c) => ({
      capNumber: c.capNumber,
      category: r.category,
      playerId: c.playerId,
    })),
  );

  logSkippedCapMints(req.log, getTenantId(req), capsSync);

  // Suppressed for backfills — previous-season match imports must not trigger
  // milestone detection or social drafts.
  if (!isBackfill) {
    await runPostCommitSocial({
      tenantId: getTenantId(req),
      importId: imp.id,
      affectedGrades: [grade],
      season,
      beforeMap,
      logger: req.log,
      matchContext: {
        tenantId: getTenantId(req),
        importId: imp.id,
        grade,
        season,
        round,
        opponent: parsed.opponent ?? null,
        abandoned: parsed.abandoned,
        lines: resolvedLines.map((l) => ({
          playerId: l.playerId,
          runs: l.runs ?? null,
          balls: l.balls ?? null,
          notOut: l.notOut,
          wickets: l.wickets ?? null,
          runsConceded: l.runsConceded ?? null,
          overs: l.overs ?? null,
        })),
        createdCaps,
        gradeGamesBefore,
      },
    });
  }

  const namedWarnings = await nameNegativeWarnings(negativeWarnings);

  const [updated] = await db
    .select({
      id: importsTable.id,
      filename: importsTable.filename,
      grade: importsTable.grade,
      season: importsTable.season,
      round: importsTable.round,
      kind: importsTable.kind,
      rowCount: importsTable.rowCount,
      status: importsTable.status,
      importedAt: importsTable.importedAt,
    })
    .from(importsTable)
    .where(eq(importsTable.id, imp.id));

  const importFields = updated satisfies Pick<
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
  res.json({
    ...importFields,
    capsSync,
    reconcileMode: reconcileMode ?? null,
    negativeWarnings: namedWarnings,
  });
}

// Re-classify a pending batch holder against the admin's current per-file
// round/stage fixes and return the updated statuses + committable count. Reads
// the parsed scorecards already stored on the holder; writes nothing. Lets the
// admin remap a duplicate/duplicateInBatch file and see the collision clear
// before committing.
router.post(
  "/imports/match-batch/:id/revalidate",
  requireAdmin,
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [imp] = await db
      .select()
      .from(importsTable)
      .where(eq(importsTable.id, id));
    if (!imp || imp.kind !== "match-batch") {
      res.status(404).json({ error: "Batch import not found" });
      return;
    }
    if (imp.status !== "pending") {
      res.status(400).json({ error: `Import is already ${imp.status}` });
      return;
    }
    const payload = imp.payload as { files?: BatchCandidate[] } | null;
    const candidates = payload?.files ?? [];
    const fileResolutions = parseFileResolutions(req.body);
    const classified = await classifyBatchFiles(candidates, fileResolutions);
    const committableMatches = classified.filter((c) => c.committable).length;
    res.json({
      files: classified.map(toBatchFileDto),
      committableMatches,
    });
  },
);

router.post(
  "/imports/match-batch/:id/commit",
  requireAdmin,
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [imp] = await db
      .select()
      .from(importsTable)
      .where(eq(importsTable.id, id));
    if (!imp || imp.kind !== "match-batch") {
      res.status(404).json({ error: "Batch import not found" });
      return;
    }
    if (imp.status !== "pending") {
      res.status(400).json({ error: `Import is already ${imp.status}` });
      return;
    }

    const payload = imp.payload as { files?: BatchCandidate[] } | null;
    const candidates = payload?.files ?? [];
    // Re-classify with the admin's per-file round/stage assignments so finals (or
    // any file that parsed without a round) become committable on commit.
    const fileResolutions = parseFileResolutions(req.body);
    const classified = await classifyBatchFiles(candidates, fileResolutions);
    const committables = classified.filter((c) => c.committable);
    if (committables.length === 0) {
      res.status(400).json({ error: "Nothing committable in this batch." });
      return;
    }

    // Backfill mode applies to the whole batch (all matches are previous-season).
    const reconcileMode = parseReconcileMode(req.body);
    const isBackfill = reconcileMode != null;

    const resolutions = buildResolutionMap(req.body);

    // One shared resolver across the whole batch so a name appearing in many
    // matches resolves to a single (possibly newly-created) player id.
    const roster = await loadRoster();
    const playerByKey = new Map<string, number>();
    for (const p of roster) playerByKey.set(nameKey(p.surname, p.givenName), p.id);
    const createdByKey = new Map<string, number>();
    const resolvePid = async (surname: string, givenName: string): Promise<number> => {
      const key = nameKey(surname, givenName);
      const r = resolutions.get(key);
      if (r?.action === "link") return r.playerId;
      const cached = createdByKey.get(key);
      if (cached != null) return cached;
      if (r?.action === "create" || !playerByKey.has(key)) {
        const [created] = await db
          .insert(playersTable)
          .values({ surname, givenName })
          .returning({ id: playersTable.id });
        createdByKey.set(key, created.id);
        return created.id;
      }
      return playerByKey.get(key)!;
    };

    // Snapshot career + per-grade game counts BEFORE writing anything so social
    // milestone detection can see crossings and debuts for the whole batch.
    const beforeMap = await snapshotCareerTotals();
    const distinctGrades = Array.from(
      new Set(committables.map((c) => c.grade!)),
    );
    const gradeGamesBefore = new Map<string, Map<number, number>>();
    for (const grade of distinctGrades) {
      gradeGamesBefore.set(grade, await snapshotGradeGames(grade));
    }

    // Prepare matches in round order so cap numbering + de-dup are deterministic.
    type Prepared = {
      candidate: BatchCandidate;
      parsed: ParsedMatch;
      grade: string;
      season: number;
      round: number | null;
      stage: FinalsStage | null;
      resolvedLines: Array<ParsedMatch["players"][number] & { playerId: number }>;
      importId: number;
    };
    const prepared: Prepared[] = [];
    for (const c of committables) {
      const parsed = c.candidate.parsed!;
      const resolvedLines: Prepared["resolvedLines"] = [];
      for (const pl of parsed.players) {
        const pid = await resolvePid(pl.surname, pl.givenName);
        resolvedLines.push({ ...pl, playerId: pid });
      }
      prepared.push({
        candidate: c.candidate,
        parsed,
        grade: c.grade!,
        season: c.season!,
        round: c.round,
        stage: c.stage,
        resolvedLines,
        importId: 0,
      });
    }
    // Order: regular rounds (ascending) first, then finals after them so cap
    // numbering proceeds chronologically. A null round sorts last.
    const roundOrder = (r: number | null): number =>
      r == null ? Number.MAX_SAFE_INTEGER : r;
    prepared.sort(
      (a, b) =>
        a.grade.localeCompare(b.grade) ||
        a.season - b.season ||
        roundOrder(a.round) - roundOrder(b.round) ||
        (a.stage ?? "").localeCompare(b.stage ?? ""),
    );

    // Distinct (grade, season) pairs and per-grade debut order for cap sync.
    const affectedMap = new Map<string, { grade: string; season: number }>();
    for (const pm of prepared) {
      affectedMap.set(`${pm.grade}|${pm.season}`, {
        grade: pm.grade,
        season: pm.season,
      });
    }
    const affected = Array.from(affectedMap.values()).sort(
      (a, b) => a.grade.localeCompare(b.grade) || a.season - b.season,
    );
    const affectedGrades = Array.from(new Set(affected.map((a) => a.grade)));

    const capsSync: CapSyncResult[] = [];
    const negativeWarnings: NegativeBaselineWarning[] = [];
    const committedMatches: Array<{
      importId: number;
      filename: string;
      grade: string;
      season: number;
      round: number | null;
      stage: FinalsStage | null;
    }> = [];

    await db.transaction(async (tx) => {
      for (const pm of prepared) {
        const [matchImp] = await tx
          .insert(importsTable)
          .values({
            filename: pm.candidate.filename,
            kind: "match",
            grade: pm.grade,
            season: pm.season,
            round: pm.round,
            rowCount: pm.parsed.players.length,
            status: "committed",
            payload: null,
          })
          .returning();
        pm.importId = matchImp.id;

        // Replace any existing match for this grade+season+(round|stage)
        // (idempotent re-import of the same round or final).
        await tx
          .delete(matchesTable)
          .where(
            and(
              eq(matchesTable.grade, pm.grade),
              eq(matchesTable.season, pm.season),
              pm.round == null
                ? sql`${matchesTable.round} IS NULL`
                : eq(matchesTable.round, pm.round),
              pm.stage == null
                ? sql`${matchesTable.stage} IS NULL`
                : eq(matchesTable.stage, pm.stage),
            ),
          );
        const [match] = await tx
          .insert(matchesTable)
          .values({
            importId: matchImp.id,
            grade: pm.grade,
            season: pm.season,
            round: pm.round,
            stage: pm.stage,
            competition: pm.parsed.competition ?? null,
            matchDate: pm.parsed.matchDate ?? null,
            venue: pm.parsed.venue ?? null,
            result: pm.parsed.result ?? null,
            opponent: pm.parsed.opponent ?? null,
            hhccScore: pm.parsed.hhccScore ?? null,
            opponentScore: pm.parsed.opponentScore ?? null,
            abandoned: pm.parsed.abandoned,
          })
          .returning();

        if (pm.resolvedLines.length > 0) {
          await tx.insert(matchPlayerLinesTable).values(
            pm.resolvedLines.map((l) => ({
              matchId: match.id,
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

        // Opposition lines: display-only, no player FK, cascade with the match.
        if (pm.parsed.opposition.length > 0) {
          await tx.insert(matchOppositionLinesTable).values(
            pm.parsed.opposition.map((o) => ({
              matchId: match.id,
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

        committedMatches.push({
          importId: matchImp.id,
          filename: pm.candidate.filename,
          grade: pm.grade,
          season: pm.season,
          round: pm.round,
          stage: pm.stage,
        });
      }

      // Drop the pending holder now that per-match rows own the data.
      await tx.delete(importsTable).where(eq(importsTable.id, imp.id));

      // Re-derive each affected season snapshot once, collecting the debut order
      // per grade (concatenated across that grade's seasons, first-seen wins).
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
        if (!order) {
          order = [];
          seen = new Set<number>();
          orderedByGrade.set(grade, order);
          seenByGrade.set(grade, seen);
        }
        for (const pid of orderedPlayerIds) {
          if (!seen!.has(pid)) {
            seen!.add(pid);
            order.push(pid);
          }
        }
      }

      // Backfill: reconcile each affected (grade, season) baseline BEFORE the
      // recompute so career totals stay invariant (peel) or additive (add).
      if (isBackfill) {
        for (const { grade, season } of affected) {
          const result = await reconcileBaseline(tx, grade, season, reconcileMode);
          negativeWarnings.push(...result.negativeWarnings);
        }
      }

      // Recompute downstream aggregates for every affected grade once.
      await recomputeAggregates(tx, affectedGrades);

      // Sync caps once per grade, numbering new caps in batch debut order.
      // Backfill never mints out-of-order caps — refresh existing caps only.
      for (const grade of affectedGrades) {
        if (isBackfill) {
          const category = GRADE_TO_CAP_CATEGORY[grade];
          if (category) await recomputeCapsFromStats(tx, getTenantId(req), [category]);
        } else {
          const result = await syncCapsFromStats(
            tx,
            getTenantId(req),
            grade,
            orderedByGrade.get(grade) ?? [],
          );
          if (result) capsSync.push(result);
        }
      }
    });

    const createdCaps: CreatedCap[] = capsSync.flatMap((r) =>
      r.createdCaps.map((c) => ({
        capNumber: c.capNumber,
        category: r.category,
        playerId: c.playerId,
      })),
    );

    logSkippedCapMints(req.log, getTenantId(req), capsSync);

    // Attach created caps to the earliest-round match per grade only; the match
    // milestone detector's fire-once de-dup handles the rest.
    const earliestImportIdByGrade = new Map<string, number>();
    for (const pm of prepared) {
      const cur = earliestImportIdByGrade.get(pm.grade);
      if (cur == null) earliestImportIdByGrade.set(pm.grade, pm.importId);
    }
    const matchContexts: MatchMilestoneContext[] = prepared.map((pm) => {
      const cat = GRADE_TO_CAP_CATEGORY[pm.grade];
      const isEarliest = earliestImportIdByGrade.get(pm.grade) === pm.importId;
      return {
        tenantId: getTenantId(req),
        importId: pm.importId,
        grade: pm.grade,
        season: pm.season,
        round: pm.round,
        opponent: pm.parsed.opponent ?? null,
        abandoned: pm.parsed.abandoned,
        lines: pm.resolvedLines.map((l) => ({
          playerId: l.playerId,
          runs: l.runs ?? null,
          balls: l.balls ?? null,
          notOut: l.notOut,
          wickets: l.wickets ?? null,
          runsConceded: l.runsConceded ?? null,
          overs: l.overs ?? null,
        })),
        createdCaps:
          isEarliest && cat ? createdCaps.filter((c) => c.category === cat) : [],
        gradeGamesBefore: gradeGamesBefore.get(pm.grade) ?? new Map(),
      };
    });

    // Suppressed for backfills — previous-season batches must not trigger social.
    if (!isBackfill) {
      await runBatchPostCommitSocial({
        tenantId: getTenantId(req),
        sourceImportId: committedMatches[0]?.importId ?? imp.id,
        beforeMap,
        affected,
        matchContexts,
        logger: req.log,
      });
    }

    const namedWarnings = await nameNegativeWarnings(negativeWarnings);

    res.json({
      committed: committedMatches.length,
      matches: committedMatches,
      capsSync,
      reconcileMode: reconcileMode ?? null,
      negativeWarnings: namedWarnings,
    });
  },
);

/**
 * Delete a single match import. Cascades the match + its lines, then re-derives
 * the season snapshot from the remaining matches (if any) and rolls back any
 * caps / orphan players that no longer have a basis.
 */
async function deleteMatchImport(
  req: Request,
  res: Parameters<Parameters<typeof router.delete>[1]>[1],
  id: number,
): Promise<void> {
  const matchRows = await db
    .select({ grade: matchesTable.grade, season: matchesTable.season })
    .from(matchesTable)
    .where(eq(matchesTable.importId, id));

  // Players who appeared in this import's matches — candidates for orphan
  // cleanup once their lines are gone.
  const matchIdRows = await db
    .select({ id: matchesTable.id })
    .from(matchesTable)
    .where(eq(matchesTable.importId, id));
  const matchIds = matchIdRows.map((m) => m.id);
  let candidatePlayerIds: number[] = [];
  if (matchIds.length > 0) {
    const lineRows = await db
      .selectDistinct({ playerId: matchPlayerLinesTable.playerId })
      .from(matchPlayerLinesTable)
      .where(inArray(matchPlayerLinesTable.matchId, matchIds));
    candidatePlayerIds = lineRows.map((l) => l.playerId);
  }

  const affectedGrades = Array.from(new Set(matchRows.map((m) => m.grade)));

  await db.transaction(async (tx) => {
    // Cascades matches + match_player_lines for this import.
    await tx.delete(importsTable).where(eq(importsTable.id, id));
    for (const { grade, season } of matchRows) {
      await deriveSeasonSnapshotFromMatches(tx, grade, season);
      // Re-reconcile any peeled baseline against the (now smaller) season total.
      // No mode: reverse the prior peel and re-peel the remaining season total.
      await reconcileBaseline(tx, grade, season);
    }
    if (affectedGrades.length > 0) {
      await recomputeAggregates(tx, affectedGrades);
      await reverseCapsAfterRollback(tx, getTenantId(req), affectedGrades);
      await cleanupOrphanPlayers(tx, candidatePlayerIds);
    }
  });

  res.sendStatus(204);
}

router.post(
  "/imports/undo-season",
  requireAdmin,
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const grade = typeof req.body?.grade === "string" ? req.body.grade : "";
    const seasonRaw = req.body?.season;
    const season =
      seasonRaw != null ? parseInt(String(seasonRaw), 10) : NaN;
    if (!grade || !Number.isInteger(season)) {
      res
        .status(400)
        .json({ error: "grade (string) and season (year) are required" });
      return;
    }

    const matchRows = await db
      .select({ id: matchesTable.id, importId: matchesTable.importId })
      .from(matchesTable)
      .where(and(eq(matchesTable.grade, grade), eq(matchesTable.season, season)));

    if (matchRows.length === 0) {
      res
        .status(404)
        .json({ error: `No matches found for ${grade} ${season}` });
      return;
    }

    const matchIds = matchRows.map((m) => m.id);
    const importIds = Array.from(new Set(matchRows.map((m) => m.importId)));

    const lineRows = await db
      .selectDistinct({ playerId: matchPlayerLinesTable.playerId })
      .from(matchPlayerLinesTable)
      .where(inArray(matchPlayerLinesTable.matchId, matchIds));
    const candidatePlayerIds = lineRows.map((l) => l.playerId);

    let playersRemoved = 0;
    await db.transaction(async (tx) => {
      // Deleting the import rows cascades their matches + lines away.
      await tx.delete(importsTable).where(inArray(importsTable.id, importIds));
      // Derived season snapshot rows carry import_id = NULL, so drop them too.
      await tx.execute(sql`
        DELETE FROM player_grade_season_stats
        WHERE grade = ${grade} AND season = ${season}
      `);
      // Restore any peeled baseline for this (grade, season). The season is now
      // empty, so reconcile (no mode) just adds the stored deltas back.
      await reconcileBaseline(tx, grade, season);
      await recomputeAggregates(tx, [grade]);
      await reverseCapsAfterRollback(tx, getTenantId(req), [grade]);
      playersRemoved = await cleanupOrphanPlayers(tx, candidatePlayerIds);
    });

    res.json({
      grade,
      season,
      matchesDeleted: matchIds.length,
      playersRemoved,
    });
  },
);

export default router;
