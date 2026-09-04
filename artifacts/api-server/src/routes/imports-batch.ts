import { Router, type IRouter, type Request } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import { db, importsTable, playersTable, matchesTable, matchPlayerLinesTable } from "@workspace/db";
import { parseMatchScorecard, type ParsedMatch, type FinalsStage } from "../lib/match-scorecard";
import { recomputeAggregates } from "../lib/recompute";
import { getCappedPlayerIds, GRADE_TO_CAP_CATEGORY, type CapSyncResult } from "../lib/cap-sync";
import { buildNameMatcher, nameKey, type NameCandidate } from "../lib/name-match";
import { getTenantId } from "../middlewares/tenant-context";
import {
  snapshotCareerTotals,
  snapshotGradeGames,
  runBatchPostCommitSocial,
} from "../lib/post-commit-social";
import type { MatchMilestoneContext } from "../lib/match-milestone-detector";
import {
  reconcileBaseline,
  loadBackfillBaseFigures,
  type NegativeBaselineWarning,
} from "../lib/baseline-reconcile";
import { requireAdmin } from "../middlewares/require-admin";
import { adminWriteRateLimiter } from "../middlewares/rate-limit";
import { buildResolutionMap } from "../lib/import-body-parsers";
import {
  type BackfillFigures,
  type BatchCandidate,
  parseReconcileMode,
  nameNegativeWarnings,
  loadRoster,
  parseFileResolutions,
  expandUploads,
  classifyBatchFiles,
  toBatchFileDto,
} from "../lib/import-helpers";
import { batchUpload, type MulterArrayRequest } from "../lib/import-upload";
import {
  logSkippedCapMints,
  replaceMatchRow,
  insertPlayerLines,
  insertOppositionLines,
  deriveSeasonSnapshots,
  reconcileBackfillBaselines,
  syncGradeCaps,
  collectCreatedCaps,
  toMilestoneLines,
  rollbackAggregatesAndCaps,
  type AffectedSeason,
  type ResolvedMatchLine,
} from "../lib/import-commit";

/**
 * Whole-season batch .xlsx (or .zip) scorecard import: upload/preview,
 * re-classify against the admin's per-file round/stage fixes, and commit —
 * plus `undo-season`, the inverse of a season commit. Mounted by
 * `routes/imports.ts`.
 */
const router: IRouter = Router();

router.post(
  "/imports/match-batch",
  requireAdmin,
  adminWriteRateLimiter,
  batchUpload.array("files", 80),
  async (req: Request, res): Promise<void> => {
    const files = (req as MulterArrayRequest).files;
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

    const candidates: BatchCandidate[] = await Promise.all(
      expanded.map(async (u): Promise<BatchCandidate> => {
        try {
          return { filename: u.filename, parsed: await parseMatchScorecard(u.buffer), error: null };
        } catch (e) {
          return { filename: u.filename, parsed: null, error: (e as Error).message };
        }
      }),
    );

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
        const debut = capCategory != null && (resolvedId == null || !cappedSet.has(resolvedId));
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
    const [imp] = await db.select().from(importsTable).where(eq(importsTable.id, id));
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
    const [imp] = await db.select().from(importsTable).where(eq(importsTable.id, id));
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
    const distinctGrades = Array.from(new Set(committables.map((c) => c.grade!)));
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
      resolvedLines: ResolvedMatchLine[];
      importId: number;
    };
    const prepared: Prepared[] = [];
    for (const c of committables) {
      const parsed = c.candidate.parsed!;
      const resolvedLines: ResolvedMatchLine[] = [];
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
    const roundOrder = (r: number | null): number => (r == null ? Number.MAX_SAFE_INTEGER : r);
    prepared.sort(
      (a, b) =>
        a.grade.localeCompare(b.grade) ||
        a.season - b.season ||
        roundOrder(a.round) - roundOrder(b.round) ||
        (a.stage ?? "").localeCompare(b.stage ?? ""),
    );

    // Distinct (grade, season) pairs and per-grade debut order for cap sync.
    const affectedMap = new Map<string, AffectedSeason>();
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
        const match = await replaceMatchRow(tx, {
          importId: matchImp.id,
          grade: pm.grade,
          season: pm.season,
          round: pm.round,
          stage: pm.stage,
          parsed: pm.parsed,
        });
        await insertPlayerLines(tx, match.id, pm.resolvedLines);
        await insertOppositionLines(tx, match.id, pm.parsed.opposition);

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
      const orderedByGrade = await deriveSeasonSnapshots(tx, affected);

      // Backfill: reconcile each affected (grade, season) baseline BEFORE the
      // recompute so career totals stay invariant (peel) or additive (add).
      negativeWarnings.push(...(await reconcileBackfillBaselines(tx, affected, reconcileMode)));

      // Recompute downstream aggregates for every affected grade once.
      await recomputeAggregates(tx, affectedGrades);

      // Sync caps once per grade, numbering new caps in batch debut order.
      // Backfill never mints out-of-order caps — refresh existing caps only.
      for (const grade of affectedGrades) {
        const result = await syncGradeCaps(
          tx,
          getTenantId(req),
          grade,
          orderedByGrade.get(grade) ?? [],
          isBackfill,
        );
        if (result) capsSync.push(result);
      }
    });

    const createdCaps = collectCreatedCaps(capsSync);

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
        lines: toMilestoneLines(pm.resolvedLines),
        createdCaps: isEarliest && cat ? createdCaps.filter((c) => c.category === cat) : [],
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

// The inverse of a season commit: drop every match import for a grade+season,
// restore the baseline, and roll back aggregates, caps and orphan players.
router.post(
  "/imports/undo-season",
  requireAdmin,
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
    const grade = typeof req.body?.grade === "string" ? req.body.grade : "";
    const seasonRaw = req.body?.season;
    const season = seasonRaw != null ? parseInt(String(seasonRaw), 10) : NaN;
    if (!grade || !Number.isInteger(season)) {
      res.status(400).json({ error: "grade (string) and season (year) are required" });
      return;
    }

    const matchRows = await db
      .select({ id: matchesTable.id, importId: matchesTable.importId })
      .from(matchesTable)
      .where(and(eq(matchesTable.grade, grade), eq(matchesTable.season, season)));

    if (matchRows.length === 0) {
      res.status(404).json({ error: `No matches found for ${grade} ${season}` });
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
      playersRemoved = await rollbackAggregatesAndCaps(
        tx,
        getTenantId(req),
        [grade],
        candidatePlayerIds,
      );
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
