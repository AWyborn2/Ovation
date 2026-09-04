import { Router, type IRouter, type Request } from "express";
import { eq, sql } from "drizzle-orm";
import { db, importsTable, playersTable, playerGradeSeasonStatsTable } from "@workspace/db";
import { parsePlaycricketCsv, type ParsedCsvRow } from "../lib/playcricket-csv";
import { recomputeAggregates } from "../lib/recompute";
import { getCappedPlayerIds, GRADE_TO_CAP_CATEGORY, type CapSyncResult } from "../lib/cap-sync";
import { buildNameMatcher, nameKey, type NameCandidate } from "../lib/name-match";
import { getTenantId } from "../middlewares/tenant-context";
import { snapshotCareerTotals, runPostCommitSocial } from "../lib/post-commit-social";
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
  parseReconcileMode,
  nameNegativeWarnings,
  loadRoster,
} from "../lib/import-helpers";
import { scorecardUpload, type MulterRequest } from "../lib/import-upload";
import {
  commitMatchImport,
  deleteMatchImport,
  logSkippedCapMints,
  loadImportSummary,
  reconcileBackfillBaselines,
  syncGradeCaps,
  rollbackAggregatesAndCaps,
  type ImportCommitResponse,
} from "../lib/import-commit";

/**
 * PlayCricket CSV (whole-season stats snapshot) import, plus the generic
 * pending-import endpoints — `POST /imports/:id/commit` and
 * `DELETE /imports/:id` — which every upload kind shares. The CSV body of
 * those two lives inline here; `match` imports are delegated to
 * `lib/import-commit.ts` and a pending `match-batch` holder is simply dropped.
 * Mounted by `routes/imports.ts`.
 */
const router: IRouter = Router();

router.post(
  "/imports/playcricket-csv",
  requireAdmin,
  adminWriteRateLimiter,
  scorecardUpload.single("file"),
  async (req: Request, res): Promise<void> => {
    const file = (req as MulterRequest).file;
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
    const capCategory = importGrade ? (GRADE_TO_CAP_CATEGORY[importGrade] ?? null) : null;
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
      const resolvedId = m.status === "matched" ? m.playerId : (m.candidates[0]?.playerId ?? null);
      const debut = capCategory != null && (resolvedId == null || !cappedIds.has(resolvedId));
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
      const ids = previewPlayers.map((p) => p.resolvedId).filter((id): id is number => id != null);
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

    const gradeTotalsMap = new Map<
      string,
      { rows: number; games: number; runs: number; wickets: number }
    >();
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

router.post(
  "/imports/:id/commit",
  requireAdmin,
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
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
      const outcome = await commitMatchImport({
        tenantId: getTenantId(req),
        body: req.body,
        logger: req.log,
        imp,
      });
      if (!outcome.ok) {
        res.status(outcome.status).json({ error: outcome.error });
        return;
      }
      res.json(outcome.body);
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
      negativeWarnings.push(
        ...(await reconcileBackfillBaselines(
          tx,
          affectedGrades.map((grade) => ({ grade, season })),
          reconcileMode,
        )),
      );

      // Recompute aggregates in the SAME transaction so readers never see
      // half-applied state and the temp/connection-state caveat doesn't apply.
      await recomputeAggregates(tx, affectedGrades);

      // Auto-sync A Grade cap lists from the freshly-recomputed stats. New caps
      // are numbered in batting order, which the PlayCricket CSV does not carry,
      // so we fall back to CSV row order (the order rows appear in `resolved`).
      // A backfill only refreshes existing caps (see `syncGradeCaps`).
      for (const grade of affectedGrades) {
        const orderedPlayerIds = resolved.filter((r) => r.grade === grade).map((r) => r.playerId);
        const result = await syncGradeCaps(
          tx,
          getTenantId(req),
          grade,
          orderedPlayerIds,
          isBackfill,
        );
        if (result) capsSync.push(result);
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
    const summary = await loadImportSummary(id);
    const body: ImportCommitResponse = {
      ...summary,
      capsSync,
      reconcileMode: reconcileMode ?? null,
      negativeWarnings: namedWarnings,
    };
    res.json(body);
  },
);

router.delete(
  "/imports/:id",
  requireAdmin,
  adminWriteRateLimiter,
  async (req, res): Promise<void> => {
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
      await deleteMatchImport(getTenantId(req), id);
      res.sendStatus(204);
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
        await rollbackAggregatesAndCaps(tx, getTenantId(req), affectedGrades, candidatePlayerIds);
      }
    });

    res.sendStatus(204);
  },
);

export default router;
