import { Router, type IRouter, type Request } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, importsTable, matchesTable } from "@workspace/db";
import { parseMatchScorecard, type ParsedMatch } from "../lib/match-scorecard";
import { getCappedPlayerIds, GRADE_TO_CAP_CATEGORY } from "../lib/cap-sync";
import { buildNameMatcher } from "../lib/name-match";
import { getTenantId } from "../middlewares/tenant-context";
import { loadBackfillBaseFigures } from "../lib/baseline-reconcile";
import { requireAdmin } from "../middlewares/require-admin";
import { adminWriteRateLimiter } from "../middlewares/rate-limit";
import { type BackfillFigures, loadRoster } from "../lib/import-helpers";
import { scorecardUpload, type MulterRequest } from "../lib/import-upload";

/**
 * Per-match .xlsx scorecard import: upload + preview. The pending import it
 * creates is committed/deleted through the generic `/imports/:id` endpoints
 * (routes/imports-csv.ts), which delegate `match` kinds to
 * `lib/import-commit.ts`. Mounted by `routes/imports.ts`.
 */
const router: IRouter = Router();

router.post(
  "/imports/match-xlsx",
  requireAdmin,
  adminWriteRateLimiter,
  scorecardUpload.single("file"),
  async (req: Request, res): Promise<void> => {
    const file = (req as MulterRequest).file;
    if (!file) {
      res.status(400).json({ error: "Missing file field" });
      return;
    }

    let parsed: ParsedMatch;
    try {
      parsed = await parseMatchScorecard(file.buffer);
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

export default router;
