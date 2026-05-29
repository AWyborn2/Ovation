import { Router, type IRouter, type Request } from "express";
import multer from "multer";
import { eq, desc, sql } from "drizzle-orm";
import {
  db,
  importsTable,
  playersTable,
  playerGradeSeasonStatsTable,
  playerGradeStatsTable,
  milestoneEventsTable,
  socialDraftsTable,
  type ImportRecord,
} from "@workspace/db";
import { parsePlaycricketCsv, type ParsedCsvRow } from "../lib/playcricket-csv";
import { recomputeAggregates } from "../lib/recompute";
import { syncCapsFromStats, type CapSyncResult } from "../lib/cap-sync";
import {
  detectCrossings,
  BOARD_STAT_LABEL,
  TIER_THRESHOLDS,
  type BoardKey,
} from "../lib/milestone-detector";
import { generateRoundUpDrafts } from "../lib/roundup";
import {
  db as _db,
  socialSettingsTable,
} from "@workspace/db";
import { requireAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

type MulterRequest = Request & { file?: Express.Multer.File };

router.get("/imports", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: importsTable.id,
      filename: importsTable.filename,
      grade: importsTable.grade,
      season: importsTable.season,
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

    // Match against existing players (case-insensitive surname+givenName).
    const allPlayers = await db
      .select({ id: playersTable.id, surname: playersTable.surname, givenName: playersTable.givenName })
      .from(playersTable);
    const playerByKey = new Map<string, number>();
    for (const p of allPlayers) {
      playerByKey.set(`${p.surname.toLowerCase()}|${p.givenName.toLowerCase()}`, p.id);
    }

    const previewPlayers: Array<{
      surname: string;
      givenName: string;
      status: "matched" | "new";
      playerId: number | null;
    }> = [];
    const seenKeys = new Set<string>();
    let matched = 0;
    let created = 0;
    for (const row of parsed.rows) {
      const key = `${row.surname.toLowerCase()}|${row.givenName.toLowerCase()}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const existing = playerByKey.get(key);
      if (existing) {
        matched++;
        previewPlayers.push({ surname: row.surname, givenName: row.givenName, status: "matched", playerId: existing });
      } else {
        created++;
        previewPlayers.push({ surname: row.surname, givenName: row.givenName, status: "new", playerId: null });
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

    // For now we assume a single-grade CSV (the PlayCricket export is per-grade).
    // If multiple grades appear, we still proceed and record `grade=null` on the
    // import row, but each snapshot row is keyed by its own grade.
    const importGrade = parsed.grades.length === 1 ? parsed.grades[0] : null;

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
      unmappedGrades: parsed.unmappedGrades,
      gradeTotals,
      players: previewPlayers,
    });
  },
);

router.post("/imports/:id/commit", requireAdmin, async (req, res): Promise<void> => {
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

  // Resolve / create players. Done outside the transaction is fine — newly
  // created players that aren't subsequently used are harmless.
  const allPlayers = await db
    .select({ id: playersTable.id, surname: playersTable.surname, givenName: playersTable.givenName })
    .from(playersTable);
  const playerByKey = new Map<string, number>();
  for (const p of allPlayers) {
    playerByKey.set(`${p.surname.toLowerCase()}|${p.givenName.toLowerCase()}`, p.id);
  }

  const resolved: Array<ParsedCsvRow & { playerId: number }> = [];
  for (const r of rows) {
    const key = `${r.surname.toLowerCase()}|${r.givenName.toLowerCase()}`;
    let pid = playerByKey.get(key);
    if (!pid) {
      const [created] = await db
        .insert(playersTable)
        .values({ surname: r.surname, givenName: r.givenName })
        .returning({ id: playersTable.id });
      pid = created.id;
      playerByKey.set(key, pid);
    }
    resolved.push({ ...r, playerId: pid });
  }

  const affectedGrades = Array.from(new Set(resolved.map((r) => r.grade)));

  // Snapshot per-player totals BEFORE the import so we can detect tier crossings.
  const beforeTotalsRows = await db
    .select({
      playerId: playerGradeStatsTable.playerId,
      games: sql<number>`coalesce(sum(${playerGradeStatsTable.games}), 0)`,
      runs: sql<number>`coalesce(sum(${playerGradeStatsTable.runs}), 0)`,
      wickets: sql<number>`coalesce(sum(${playerGradeStatsTable.wickets}), 0)`,
      dismissals: sql<number>`coalesce(sum(${playerGradeStatsTable.catches} + ${playerGradeStatsTable.stumpings}), 0)`,
    })
    .from(playerGradeStatsTable)
    .groupBy(playerGradeStatsTable.playerId);
  const beforeMap = new Map<number, { games: number; runs: number; wickets: number; dismissals: number }>();
  for (const r of beforeTotalsRows) {
    beforeMap.set(r.playerId, {
      games: Number(r.games),
      runs: Number(r.runs),
      wickets: Number(r.wickets),
      dismissals: Number(r.dismissals),
    });
  }

  const capsSync: CapSyncResult[] = [];

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

    // Recompute aggregates in the SAME transaction so readers never see
    // half-applied state and the temp/connection-state caveat doesn't apply.
    await recomputeAggregates(tx, affectedGrades);

    // Auto-sync A Grade cap lists from the freshly-recomputed stats. Only
    // A Grade (male) and Female A Grade (female) map to a cap category; other
    // grades are ignored. New caps are numbered in batting order, which the
    // PlayCricket CSV does not carry, so we fall back to CSV row order (the
    // order rows appear in `resolved`).
    for (const grade of affectedGrades) {
      const orderedPlayerIds = resolved
        .filter((r) => r.grade === grade)
        .map((r) => r.playerId);
      const result = await syncCapsFromStats(tx, grade, orderedPlayerIds);
      if (result) capsSync.push(result);
    }
  });

  // Load social settings once to gate auto-generation engines.
  const [socialSettings] = await db.select().from(socialSettingsTable).limit(1);

  // Milestone detection: compare post-recompute totals to before and queue drafts.
  try {
    if (!socialSettings?.engineMilestone) throw new Error("__skip_milestone__");
    const afterTotalsRows = await db
      .select({
        playerId: playerGradeStatsTable.playerId,
        games: sql<number>`coalesce(sum(${playerGradeStatsTable.games}), 0)`,
        runs: sql<number>`coalesce(sum(${playerGradeStatsTable.runs}), 0)`,
        wickets: sql<number>`coalesce(sum(${playerGradeStatsTable.wickets}), 0)`,
        dismissals: sql<number>`coalesce(sum(${playerGradeStatsTable.catches} + ${playerGradeStatsTable.stumpings}), 0)`,
      })
      .from(playerGradeStatsTable)
      .groupBy(playerGradeStatsTable.playerId);
    const afterMap = new Map<number, { games: number; runs: number; wickets: number; dismissals: number }>();
    for (const r of afterTotalsRows) {
      afterMap.set(r.playerId, {
        games: Number(r.games),
        runs: Number(r.runs),
        wickets: Number(r.wickets),
        dismissals: Number(r.dismissals),
      });
    }
    const crossings = detectCrossings(beforeMap, afterMap);
    if (crossings.length > 0) {
      const playerIds = Array.from(new Set(crossings.map((c) => c.playerId)));
      const playerRows = await db
        .select({ id: playersTable.id, surname: playersTable.surname, givenName: playersTable.givenName })
        .from(playersTable)
        .where(sql`${playersTable.id} = ANY(${playerIds})`);
      const nameById = new Map(playerRows.map((p) => [p.id, `${p.givenName} ${p.surname}`.trim()]));
      for (const c of crossings) {
        const name = nameById.get(c.playerId) ?? "Unknown";
        const [event] = await db
          .insert(milestoneEventsTable)
          .values({
            playerId: c.playerId,
            boardKey: c.boardKey,
            tierIndex: c.tierIndex,
            tierLabel: c.tierLabel,
            value: c.value,
            threshold: c.threshold,
            source: "import",
            sourceImportId: imp.id,
            payload: { name },
          })
          .returning();
        await db.insert(socialDraftsTable).values({
          engine: "milestone",
          status: "pending",
          cardInput: {
            kind: "milestone",
            playerName: name,
            tierLabel: c.tierLabel,
            tierIndex: c.tierIndex,
            milestoneLabel: BOARD_STAT_LABEL[c.boardKey as BoardKey],
            currentValue: c.value,
            threshold: c.threshold,
          },
          appPath: `/players/${c.playerId}`,
          milestoneEventId: event.id,
          sourceImportId: imp.id,
        });
      }
    }
  } catch (err) {
    if (!(err instanceof Error) || err.message !== "__skip_milestone__") {
      req.log.error({ err }, "milestone detection failed");
    }
  }
  void TIER_THRESHOLDS;

  // Auto-generate round-up drafts per affected grade, gated on engineRoundUp.
  try {
    if (socialSettings?.engineRoundUp) {
      for (const grade of affectedGrades) {
        await generateRoundUpDrafts(grade, season, imp.id);
      }
    }
  } catch (err) {
    req.log.error({ err }, "auto roundup failed");
  }
  void _db;

  const [updated] = await db
    .select({
      id: importsTable.id,
      filename: importsTable.filename,
      grade: importsTable.grade,
      season: importsTable.season,
      rowCount: importsTable.rowCount,
      status: importsTable.status,
      importedAt: importsTable.importedAt,
    })
    .from(importsTable)
    .where(eq(importsTable.id, id));

  const importFields = updated satisfies Pick<
    ImportRecord,
    "id" | "filename" | "grade" | "season" | "rowCount" | "status" | "importedAt"
  >;
  res.json({ ...importFields, capsSync });
});

router.delete("/imports/:id", requireAdmin, async (req, res): Promise<void> => {
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

  // Find which grades were touched before we drop the snapshots.
  const affected = await db
    .selectDistinct({ grade: playerGradeSeasonStatsTable.grade })
    .from(playerGradeSeasonStatsTable)
    .where(eq(playerGradeSeasonStatsTable.importId, id));
  const affectedGrades = affected.map((r) => r.grade);

  await db.transaction(async (tx) => {
    // Snapshots cascade-delete via FK when the import row goes.
    await tx.delete(importsTable).where(eq(importsTable.id, id));
    if (affectedGrades.length > 0) {
      await recomputeAggregates(tx, affectedGrades);
    }
  });

  res.sendStatus(204);
});

export default router;
