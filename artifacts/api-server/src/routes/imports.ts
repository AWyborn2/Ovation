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
  type ImportRecord,
} from "@workspace/db";
import { parsePlaycricketCsv, type ParsedCsvRow } from "../lib/playcricket-csv";
import {
  parseMatchScorecard,
  type ParsedMatch,
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
  type RosterPlayer,
} from "../lib/name-match";
import { deriveSeasonSnapshotFromMatches } from "../lib/match-aggregate";
import {
  snapshotCareerTotals,
  snapshotGradeGames,
  runPostCommitSocial,
} from "../lib/post-commit-social";
import type { CreatedCap } from "../lib/match-milestone-detector";
import {
  reverseCapsAfterRollback,
  cleanupOrphanPlayers,
} from "../lib/rollback";
import { requireAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

type MulterRequest = Request & { file?: Express.Multer.File };

/** An admin's per-name decision sent in the commit body. */
type PlayerResolution =
  | { action: "link"; playerId: number }
  | { action: "create" };

/**
 * Parse the optional `resolutions` array from a commit request body into a map
 * keyed by the canonical name key, so the parsed row a resolution refers to can
 * be looked up unambiguously. Invalid/partial entries are ignored.
 */
function buildResolutionMap(body: unknown): Map<string, PlayerResolution> {
  const map = new Map<string, PlayerResolution>();
  const list = (body as { resolutions?: unknown } | null)?.resolutions;
  if (!Array.isArray(list)) return map;
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const { surname, givenName, action, playerId } = r as Record<
      string,
      unknown
    >;
    if (typeof surname !== "string" || typeof givenName !== "string") continue;
    const key = nameKey(surname, givenName);
    if (action === "link" && typeof playerId === "number") {
      map.set(key, { action: "link", playerId });
    } else if (action === "create") {
      map.set(key, { action: "create" });
    }
  }
  return map;
}

/** Load the full roster as matcher input. */
async function loadRoster(): Promise<RosterPlayer[]> {
  return db
    .select({
      id: playersTable.id,
      surname: playersTable.surname,
      givenName: playersTable.givenName,
    })
    .from(playersTable);
}

router.get("/imports", async (_req, res): Promise<void> => {
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
      ? await getCappedPlayerIds(capCategory)
      : new Set<number>();

    // Match parsed names against the roster: exact, fuzzy suggestion, or new.
    const matcher = buildNameMatcher(await loadRoster());

    const previewPlayers: Array<{
      surname: string;
      givenName: string;
      status: "matched" | "suggested" | "new";
      playerId: number | null;
      candidates: NameCandidate[];
      debut: boolean;
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
      });
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

  // Milestone detection + round-up drafts (shared with the per-match import path).
  await runPostCommitSocial({
    importId: imp.id,
    affectedGrades,
    season,
    beforeMap,
    logger: req.log,
  });

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

  if (imp.kind === "match") {
    await deleteMatchImport(req, res, id);
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
      await recomputeAggregates(tx, affectedGrades);
      await reverseCapsAfterRollback(tx, affectedGrades);
      await cleanupOrphanPlayers(tx, candidatePlayerIds);
    }
  });

  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// Per-match .xlsx scorecard import
// ---------------------------------------------------------------------------

type MatchCommitReq = Request & { log: import("pino").Logger };

/**
 * Resolve every parsed match player to a player id, honouring the admin's
 * preview resolutions (link to existing / create new); names without a
 * resolution fall back to exact-match-or-create. Returns the parsed players
 * augmented with their `playerId`.
 */
async function resolveMatchPlayers(
  players: ParsedMatch["players"],
  resolutions: Map<string, PlayerResolution>,
): Promise<Array<ParsedMatch["players"][number] & { playerId: number }>> {
  const allPlayers = await loadRoster();
  const playerByKey = new Map<string, number>();
  for (const p of allPlayers) {
    playerByKey.set(nameKey(p.surname, p.givenName), p.id);
  }
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

  const resolved: Array<
    ParsedMatch["players"][number] & { playerId: number }
  > = [];
  for (const p of players) {
    const key = nameKey(p.surname, p.givenName);
    const resolution = resolutions.get(key);
    let pid: number;
    if (resolution?.action === "link") {
      pid = resolution.playerId;
    } else if (resolution?.action === "create") {
      pid = await createPlayer(p.surname, p.givenName, key);
    } else {
      pid = playerByKey.get(key) ?? (await createPlayer(p.surname, p.givenName, key));
    }
    resolved.push({ ...p, playerId: pid });
  }
  return resolved;
}

router.post(
  "/imports/match-xlsx",
  requireAdmin,
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
      ? await getCappedPlayerIds(capCategory)
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
      };
    });

    // Was this grade+season+round already imported?
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
        "A match for this grade, season and round already exists. Committing will replace it.",
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
      players: previewPlayers,
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
  const round = parsed.round ?? imp.round ?? null;

  if (!grade || season == null) {
    res
      .status(400)
      .json({ error: "Match import has no grade/season; cannot commit." });
    return;
  }

  const resolutions = buildResolutionMap(req.body);
  const resolvedLines = await resolveMatchPlayers(parsed.players, resolutions);

  const beforeMap = await snapshotCareerTotals();
  // Per-grade game counts before the commit — debut detection compares these to
  // who appears in the match (0→1 in a cap-register grade = a debut).
  const gradeGamesBefore = await snapshotGradeGames(grade);
  const capsSync: CapSyncResult[] = [];

  await db.transaction(async (tx) => {
    // Replace any existing match for this grade+season+round so re-importing a
    // round is idempotent.
    await tx
      .delete(matchesTable)
      .where(
        and(
          eq(matchesTable.grade, grade),
          eq(matchesTable.season, season),
          round == null
            ? sql`${matchesTable.round} IS NULL`
            : eq(matchesTable.round, round),
        ),
      );

    const [match] = await tx
      .insert(matchesTable)
      .values({
        importId: imp.id,
        grade,
        season,
        round,
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

    await tx
      .update(importsTable)
      .set({ status: "committed", payload: null })
      .where(eq(importsTable.id, imp.id));

    // Re-derive the season snapshot from every match in this grade+season and
    // recompute the downstream aggregates in the same transaction.
    const { orderedPlayerIds } = await deriveSeasonSnapshotFromMatches(
      tx,
      grade,
      season,
    );
    await recomputeAggregates(tx, [grade]);
    const result = await syncCapsFromStats(tx, grade, orderedPlayerIds);
    if (result) capsSync.push(result);
  });

  const createdCaps: CreatedCap[] = capsSync.flatMap((r) =>
    r.createdCaps.map((c) => ({
      capNumber: c.capNumber,
      category: r.category,
      playerId: c.playerId,
      name: c.name,
    })),
  );

  await runPostCommitSocial({
    importId: imp.id,
    affectedGrades: [grade],
    season,
    beforeMap,
    logger: req.log,
    matchContext: {
      importId: imp.id,
      grade,
      season,
      round,
      opponent: parsed.opponent ?? null,
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
  res.json({ ...importFields, capsSync });
}

/**
 * Delete a single match import. Cascades the match + its lines, then re-derives
 * the season snapshot from the remaining matches (if any) and rolls back any
 * caps / orphan players that no longer have a basis.
 */
async function deleteMatchImport(
  _req: Request,
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
    }
    if (affectedGrades.length > 0) {
      await recomputeAggregates(tx, affectedGrades);
      await reverseCapsAfterRollback(tx, affectedGrades);
      await cleanupOrphanPlayers(tx, candidatePlayerIds);
    }
  });

  res.sendStatus(204);
}

router.post(
  "/imports/undo-season",
  requireAdmin,
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
      await recomputeAggregates(tx, [grade]);
      await reverseCapsAfterRollback(tx, [grade]);
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
