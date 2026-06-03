import { Router, type IRouter, type Request } from "express";
import multer from "multer";
import JSZip from "jszip";
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
import { requireAdmin } from "../middlewares/require-admin";

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

// ---------------------------------------------------------------------------
// Whole-season batch .xlsx (or .zip) scorecard import
// ---------------------------------------------------------------------------

/** Per-file outcome in a batch. Committable: ready | abandoned | duplicate. */
type BatchFileStatus =
  | "ready"
  | "abandoned"
  | "duplicate"
  | "duplicateInBatch"
  | "missingRound"
  | "unmappableGrade"
  | "parseError";

/** A single uploaded scorecard, parsed (or with a parse error). */
type BatchCandidate = {
  filename: string;
  parsed: ParsedMatch | null;
  error: string | null;
};

type ClassifiedFile = {
  candidate: BatchCandidate;
  status: BatchFileStatus;
  committable: boolean;
  matchExists: boolean;
  grade: string | null;
  season: number | null;
  round: number | null;
};

/**
 * Expand uploaded files into individual scorecard buffers: a `.zip` is unpacked
 * to its `.xlsx` entries, a `.xlsx` is taken as-is, anything else is ignored.
 */
async function expandUploads(
  files: Express.Multer.File[],
): Promise<Array<{ filename: string; buffer: Buffer }>> {
  const out: Array<{ filename: string; buffer: Buffer }> = [];
  for (const f of files) {
    const lower = f.originalname.toLowerCase();
    if (lower.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(f.buffer);
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        const name = entry.name;
        if (name.startsWith("__MACOSX")) continue;
        if (!name.toLowerCase().endsWith(".xlsx")) continue;
        const buf = await entry.async("nodebuffer");
        out.push({ filename: name.split("/").pop() || name, buffer: buf });
      }
    } else if (lower.endsWith(".xlsx")) {
      out.push({ filename: f.originalname, buffer: f.buffer });
    }
  }
  return out;
}

/**
 * Classify each parsed candidate into a commit decision. A file is committable
 * when it parsed, maps to a grade+season, carries a round, and isn't a duplicate
 * of an earlier committable file in the same batch. A file whose grade+season+
 * round already exists in the DB is "duplicate" (committable — it replaces the
 * stored match). Ordering matters: the FIRST file for a given round wins; later
 * ones become `duplicateInBatch`.
 */
async function classifyBatchFiles(
  candidates: BatchCandidate[],
): Promise<ClassifiedFile[]> {
  // Existing (grade, season, round) tuples in the DB for fast duplicate checks.
  const validKeys = new Set<string>();
  for (const c of candidates) {
    const p = c.parsed;
    if (p && p.grade && p.season != null && p.round != null) {
      validKeys.add(`${p.grade}|${p.season}`);
    }
  }
  const existing = new Set<string>();
  for (const gs of validKeys) {
    const [grade, seasonStr] = gs.split("|");
    const season = parseInt(seasonStr, 10);
    const rows = await db
      .select({ round: matchesTable.round })
      .from(matchesTable)
      .where(and(eq(matchesTable.grade, grade), eq(matchesTable.season, season)));
    for (const r of rows) {
      if (r.round != null) existing.add(`${grade}|${season}|${r.round}`);
    }
  }

  const seenInBatch = new Set<string>();
  const out: ClassifiedFile[] = [];
  for (const c of candidates) {
    const p = c.parsed;
    if (!p || c.error) {
      out.push({
        candidate: c,
        status: "parseError",
        committable: false,
        matchExists: false,
        grade: null,
        season: null,
        round: null,
      });
      continue;
    }
    const grade = p.grade;
    const season = p.season;
    const round = p.round;
    if (!grade || season == null) {
      out.push({
        candidate: c,
        status: "unmappableGrade",
        committable: false,
        matchExists: false,
        grade,
        season,
        round,
      });
      continue;
    }
    if (round == null) {
      out.push({
        candidate: c,
        status: "missingRound",
        committable: false,
        matchExists: false,
        grade,
        season,
        round,
      });
      continue;
    }
    const key = `${grade}|${season}|${round}`;
    if (seenInBatch.has(key)) {
      out.push({
        candidate: c,
        status: "duplicateInBatch",
        committable: false,
        matchExists: existing.has(key),
        grade,
        season,
        round,
      });
      continue;
    }
    seenInBatch.add(key);
    const matchExists = existing.has(key);
    const status: BatchFileStatus = matchExists
      ? "duplicate"
      : p.abandoned
        ? "abandoned"
        : "ready";
    out.push({
      candidate: c,
      status,
      committable: true,
      matchExists,
      grade,
      season,
      round,
    });
  }
  return out;
}

router.post(
  "/imports/match-batch",
  requireAdmin,
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
      ? await getCappedPlayerIds("male")
      : new Set<number>();
    const cappedFemale = usedCategories.has("female")
      ? await getCappedPlayerIds("female")
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
    const previewPlayers: Array<{
      surname: string;
      givenName: string;
      status: "matched" | "suggested" | "new";
      playerId: number | null;
      candidates: NameCandidate[];
      debut: boolean;
      capCategory: "male" | "female" | null;
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
        previewPlayers.push({
          surname: pl.surname,
          givenName: pl.givenName,
          status: m.status,
          playerId: m.status === "matched" ? m.playerId : null,
          candidates: m.candidates,
          debut,
          capCategory,
        });
      }
    }

    const warnings: string[] = [];
    if (committables.length === 0) {
      warnings.push("No committable matches in this upload — see the per-file problems below.");
    }
    const excluded = classified.length - committables.length;
    if (excluded > 0) {
      warnings.push(
        `${excluded} file(s) will be skipped (parse error, missing round, unmappable grade, or duplicate).`,
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
      files: classified.map((c) => {
        const p = c.candidate.parsed;
        return {
          filename: c.candidate.filename,
          status: c.status,
          committable: c.committable,
          grade: p?.grade ?? null,
          season: p?.season ?? null,
          round: p?.round ?? null,
          competition: p?.competition ?? null,
          matchDate: p?.matchDate ?? null,
          venue: p?.venue ?? null,
          result: p?.result ?? null,
          opponent: p?.opponent ?? null,
          hhccScore: p?.hhccScore ?? null,
          opponentScore: p?.opponentScore ?? null,
          abandoned: p?.abandoned ?? false,
          matchExists: c.matchExists,
          playerCount: p?.players.length ?? 0,
          warnings: p?.warnings ?? [],
          error: c.candidate.error,
        };
      }),
      players: previewPlayers,
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

router.post(
  "/imports/match-batch/:id/commit",
  requireAdmin,
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
    const classified = await classifyBatchFiles(candidates);
    const committables = classified.filter((c) => c.committable);
    if (committables.length === 0) {
      res.status(400).json({ error: "Nothing committable in this batch." });
      return;
    }

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
      round: number;
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
        round: c.round!,
        resolvedLines,
        importId: 0,
      });
    }
    prepared.sort(
      (a, b) => a.grade.localeCompare(b.grade) || a.season - b.season || a.round - b.round,
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
    const committedMatches: Array<{
      importId: number;
      filename: string;
      grade: string;
      season: number;
      round: number | null;
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

        // Replace any existing match for this grade+season+round (idempotent).
        await tx
          .delete(matchesTable)
          .where(
            and(
              eq(matchesTable.grade, pm.grade),
              eq(matchesTable.season, pm.season),
              eq(matchesTable.round, pm.round),
            ),
          );
        const [match] = await tx
          .insert(matchesTable)
          .values({
            importId: matchImp.id,
            grade: pm.grade,
            season: pm.season,
            round: pm.round,
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

        committedMatches.push({
          importId: matchImp.id,
          filename: pm.candidate.filename,
          grade: pm.grade,
          season: pm.season,
          round: pm.round,
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

      // Recompute downstream aggregates for every affected grade once.
      await recomputeAggregates(tx, affectedGrades);

      // Sync caps once per grade, numbering new caps in batch debut order.
      for (const grade of affectedGrades) {
        const result = await syncCapsFromStats(
          tx,
          grade,
          orderedByGrade.get(grade) ?? [],
        );
        if (result) capsSync.push(result);
      }
    });

    const createdCaps: CreatedCap[] = capsSync.flatMap((r) =>
      r.createdCaps.map((c) => ({
        capNumber: c.capNumber,
        category: r.category,
        playerId: c.playerId,
        name: c.name,
      })),
    );

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
        importId: pm.importId,
        grade: pm.grade,
        season: pm.season,
        round: pm.round,
        opponent: pm.parsed.opponent ?? null,
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

    await runBatchPostCommitSocial({
      sourceImportId: committedMatches[0]?.importId ?? imp.id,
      beforeMap,
      affected,
      matchContexts,
      logger: req.log,
    });

    res.json({ committed: committedMatches.length, matches: committedMatches, capsSync });
  },
);

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
