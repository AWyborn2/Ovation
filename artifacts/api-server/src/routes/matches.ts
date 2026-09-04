import { Router, type IRouter } from "express";
import { eq, and, ne, desc, asc, count, sql, type SQL } from "drizzle-orm";
import {
  db,
  matchesTable,
  matchPlayerLinesTable,
  matchHatTricksTable,
  matchDisplaySettingsTable,
  importsTable,
  clubsTable,
} from "@workspace/db";
import {
  ListMatchesQueryParams,
  GetMatchParams,
  UpdateMatchRoundParams,
  UpdateMatchRoundBody,
  SetMatchHatTrickParams,
  SetMatchHatTrickBody,
  UpdateMatchDisplaySettingsBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { dataSource } from "../lib/tenant";
import { loadMatchDetail, loadMatchDetailForRequest } from "../lib/match-detail";
import { opponentClubColumns, toOpponentClub, notEmptyFixture } from "../lib/grades-helpers";
import { getOrCreateSettings } from "../lib/settings";
import {
  getOpponentBrandsByAppClubId,
  getOpponentBrandsByCentralClubId,
  mergeOpponentBrand,
} from "../lib/club-brand";

const router: IRouter = Router();

// Per-tenant match-display settings (one row per tenant, unique on tenantId),
// created with schema defaults on first access. Was a single global id=1 row +
// module cache, which meant one tenant's admin PATCH reshaped every tenant's
// public Matches page. The indexed per-tenant lookup replaces the cache.
function ensureMatchDisplaySettings(tenantId: number) {
  return getOrCreateSettings(matchDisplaySettingsTable, tenantId);
}

function serializeMatchDisplaySettings(row: typeof matchDisplaySettingsTable.$inferSelect) {
  return {
    defaultGrade: row.defaultGrade,
    defaultSeasonMode: row.defaultSeasonMode as "latest" | "specific" | "all",
    defaultSeason: row.defaultSeason,
    gradeOrder: row.gradeOrder,
    roundOrder: row.roundOrder as "asc" | "desc",
  };
}

// Columns selected from the club register to brand a match's opposition.
router.get("/matches", async (req, res): Promise<void> => {
  const query = ListMatchesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { grade, season, limit, offset } = query.data;
  const off = offset ?? 0;

  // Per-tenant data source: central tenants get their game-by-game list from
  // central.matches (symmetric home/away), shaped from the club's perspective.
  const source = await dataSource(req);
  if (source.kind === "central") {
    const { centralClubMatches } = await import("@workspace/db/central-queries");
    const rows = await centralClubMatches(source.clubId, {
      grade: grade || undefined,
      season,
      limit,
      offset: off,
    });
    // central.clubs has no logo; overlay any opponent that is itself a tenant
    // with an uploaded brand (keyed by its central club id) so its crest shows.
    const overlays = await getOpponentBrandsByCentralClubId(
      rows.map((r) => r.opponentClub?.id).filter((id): id is number => id != null),
    );
    res.json(
      rows.map((r) => ({
        ...r,
        opponentClub: r.opponentClub
          ? mergeOpponentBrand(r.opponentClub, overlays.get(r.opponentClub.id))
          : null,
      })),
    );
    return;
  }

  const conditions: SQL[] = [];
  if (grade) conditions.push(eq(matchesTable.grade, grade));
  if (season !== undefined) conditions.push(eq(matchesTable.season, season));
  // Always hide empty placeholder fixtures (see notEmptyFixture in lib/grades-helpers).
  conditions.push(notEmptyFixture);

  // Within-season round direction is admin-configurable; season stays newest-first.
  const settings = await ensureMatchDisplaySettings(getTenantId(req));
  const roundDir = settings.roundOrder === "asc" ? asc : desc;
  const idDir = settings.roundOrder === "asc" ? asc : desc;
  // Finals carry no round number (round IS NULL) so they cluster together; order
  // them by the date they were played (same direction as rounds). For ordinary
  // rounds this only acts as a tiebreaker since round numbers are already distinct.
  // match_date is free text ("12:20 PM, Saturday, 14 Mar 2026"), so parse it to a
  // real timestamp for ordering; the regex guard makes any malformed/blank value
  // sort as NULL instead of throwing. Finals with no stored date (most historical
  // ones) fall through to the id tiebreaker below.
  const matchDateExpr = sql`CASE WHEN ${matchesTable.matchDate} ~ '^[0-9]{1,2}:[0-9]{2} (AM|PM), [A-Za-z]+, [0-9]{1,2} [A-Za-z]{3} [0-9]{4}$' THEN to_timestamp(${matchesTable.matchDate}, 'HH12:MI AM, Day, DD Mon YYYY') END`;
  // NULLS LAST so dated finals always outrank undated/blank-date finals (which
  // then fall through to the id tiebreaker), regardless of the asc/desc direction.
  const dateOrder =
    settings.roundOrder === "asc"
      ? sql`${matchDateExpr} asc nulls last`
      : sql`${matchDateExpr} desc nulls last`;

  const baseQuery = db
    .select({
      id: matchesTable.id,
      grade: matchesTable.grade,
      season: matchesTable.season,
      round: matchesTable.round,
      stage: matchesTable.stage,
      competition: matchesTable.competition,
      matchDate: matchesTable.matchDate,
      venue: matchesTable.venue,
      result: matchesTable.result,
      opponent: matchesTable.opponent,
      clubScore: matchesTable.hhccScore,
      opponentScore: matchesTable.opponentScore,
      abandoned: matchesTable.abandoned,
      playerCount: count(matchPlayerLinesTable.id),
      ...opponentClubColumns,
    })
    .from(matchesTable)
    .leftJoin(matchPlayerLinesTable, eq(matchPlayerLinesTable.matchId, matchesTable.id))
    .leftJoin(clubsTable, eq(clubsTable.id, matchesTable.opponentClubId))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(matchesTable.id, clubsTable.id)
    .orderBy(
      desc(matchesTable.season),
      roundDir(matchesTable.round),
      dateOrder,
      idDir(matchesTable.id),
    )
    .$dynamic();

  // limit/offset are optional — omitted = the historical all-rows behaviour.
  const rows = await (limit !== undefined
    ? baseQuery.limit(limit).offset(off)
    : off
      ? baseQuery.offset(off)
      : baseQuery);

  // Overlay tenant-uploaded brands over the register defaults for any opponent
  // clubs that are themselves tenants (batched, one lookup for the whole page).
  const overlays = await getOpponentBrandsByAppClubId(
    rows.map((r) => r.opponentClubId).filter((id): id is number => id != null),
  );

  res.json(
    rows.map(
      ({
        opponentClubId,
        opponentClubName,
        opponentClubShortName,
        opponentClubLogoUrl,
        opponentClubLogoUrl128,
        opponentClubBackgroundColour,
        opponentClubPrimaryColour,
        ...rest
      }) => {
        const opponentClub = toOpponentClub({
          opponentClubId,
          opponentClubName,
          opponentClubShortName,
          opponentClubLogoUrl,
          opponentClubLogoUrl128,
          opponentClubBackgroundColour,
          opponentClubPrimaryColour,
        });
        return {
          ...rest,
          opponentClub: opponentClub
            ? mergeOpponentBrand(opponentClub, overlays.get(opponentClub.id))
            : null,
        };
      },
    ),
  );
});
router.get("/matches/:id", async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const detail = await loadMatchDetailForRequest(req, params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  res.json(detail);
});

router.patch("/matches/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateMatchRoundParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateMatchRoundBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, params.data.id));
  if (!match) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  // A match identity is a numeric round XOR a finals stage. A stage always
  // wins and clears the round; otherwise the round stands and the stage is
  // cleared. If neither is supplied, the identity is left unchanged.
  const hasRound = body.data.round != null;
  const hasStage = body.data.stage != null;
  const newStage = hasStage ? body.data.stage! : null;
  const newRound = hasStage ? null : (body.data.round ?? null);

  if (!hasRound && !hasStage) {
    res.status(400).json({ error: "Provide a round or a finals stage to update the match." });
    return;
  }

  const seasonLabel = `${match.season}/${String((match.season + 1) % 100).padStart(2, "0")}`;
  const identityLabel = newStage ? `The ${newStage}` : `Round ${newRound}`;
  const conflictMessage = `${identityLabel} is already used by another ${match.grade} match in ${seasonLabel}.`;

  if (match.round !== newRound || match.stage !== newStage) {
    // Identity is unique per (grade, season). Check before writing so we can
    // return a clear 409 rather than a raw DB constraint error.
    const [conflict] = await db
      .select({ id: matchesTable.id })
      .from(matchesTable)
      .where(
        and(
          eq(matchesTable.grade, match.grade),
          eq(matchesTable.season, match.season),
          newRound == null ? sql`${matchesTable.round} IS NULL` : eq(matchesTable.round, newRound),
          newStage == null ? sql`${matchesTable.stage} IS NULL` : eq(matchesTable.stage, newStage),
          ne(matchesTable.id, match.id),
        ),
      );
    if (conflict) {
      res.status(409).json({ error: conflictMessage });
      return;
    }

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(matchesTable)
          .set({ round: newRound, stage: newStage })
          .where(eq(matchesTable.id, match.id));
        // Keep the originating import row's round in sync so the admin
        // imports list doesn't show a stale round.
        await tx
          .update(importsTable)
          .set({ round: newRound })
          .where(eq(importsTable.id, match.importId));
      });
    } catch (err) {
      // Safety net for a concurrent insert racing past the check above.
      if ((err as { code?: string }).code === "23505") {
        res.status(409).json({ error: conflictMessage });
        return;
      }
      throw err;
    }
  }

  const detail = await loadMatchDetail(match.id, getTenantId(req));
  res.json(detail);
});

// Admin: toggle a hat-trick flag for one player in a match. Uniqueness is
// enforced here (check-then insert/delete) rather than by a DB constraint —
// see lib/db/src/schema/matches.ts for why.
router.post("/matches/:id/hat-tricks", requireAdmin, async (req, res): Promise<void> => {
  const params = SetMatchHatTrickParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SetMatchHatTrickBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const matchId = params.data.id;
  const { playerId, hatTrick } = body.data;

  // The player must have a line in this match for the flag to make sense.
  const [line] = await db
    .select({ id: matchPlayerLinesTable.id })
    .from(matchPlayerLinesTable)
    .where(
      and(eq(matchPlayerLinesTable.matchId, matchId), eq(matchPlayerLinesTable.playerId, playerId)),
    );
  if (!line) {
    res.status(404).json({ error: "Player did not play in this match." });
    return;
  }

  const [existing] = await db
    .select({ id: matchHatTricksTable.id })
    .from(matchHatTricksTable)
    .where(
      and(eq(matchHatTricksTable.matchId, matchId), eq(matchHatTricksTable.playerId, playerId)),
    );

  if (hatTrick && !existing) {
    await db.insert(matchHatTricksTable).values({ matchId, playerId });
  } else if (!hatTrick && existing) {
    await db.delete(matchHatTricksTable).where(eq(matchHatTricksTable.id, existing.id));
  }

  const detail = await loadMatchDetail(matchId, getTenantId(req));
  res.json(detail);
});

router.get("/match-display-settings", async (req, res): Promise<void> => {
  const settings = await ensureMatchDisplaySettings(getTenantId(req));
  res.json(serializeMatchDisplaySettings(settings));
});

router.patch("/match-display-settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateMatchDisplaySettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  await ensureMatchDisplaySettings(tenantId);
  const [row] = await db
    .update(matchDisplaySettingsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(matchDisplaySettingsTable.tenantId, tenantId))
    .returning();
  res.json(serializeMatchDisplaySettings(row));
});

export default router;
