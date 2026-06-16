import { Router, type IRouter } from "express";
import { eq, ilike, or, and, desc, asc, count, sql, inArray } from "drizzle-orm";
import {
  db,
  playersTable,
  playerImagesTable,
  playerGradeStatsTable,
  playerGradeSeasonStatsTable,
  premiershipsTable,
  premiershipPlayersTable,
  capRegisterTable,
  lifeMembersTable,
  matchesTable,
  matchPlayerLinesTable,
  awardsTable,
  awardWinnersTable,
} from "@workspace/db";
import {
  CreatePlayerBody,
  UpdatePlayerBody,
  UpdatePlayerParams,
  DeletePlayerParams,
  GetPlayerParams,
  ListPlayersQueryParams,
  MergePlayerBody,
  MergePlayerParams,
  ListPlayerImagesParams,
  AddPlayerImageParams,
  AddPlayerImageBody,
  DeletePlayerImageParams,
  SetDefaultPlayerImageParams,
} from "@workspace/api-zod";
import { playerIdMapTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/require-admin";
import { recomputeAggregates } from "../lib/recompute";
import { getRequestCentralClubId } from "../lib/tenant";
import { getTenantId } from "../middlewares/tenant-context";

const router: IRouter = Router();

/** Split a central display name into given/surname (surname = last token). */
function splitCentralName(displayName: string): { givenName: string; surname: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { givenName: "", surname: "" };
  if (parts.length === 1) return { givenName: parts[0], surname: "" };
  return { givenName: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] };
}

router.get("/players", async (req, res): Promise<void> => {
  const query = ListPlayersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const {
    search,
    grade,
    sortBy = "name",
    sortOrder = "asc",
    page = 1,
    limit = 20,
  } = query.data;

  const offset = (Number(page) - 1) * Number(limit);
  const lim = Number(limit);

  // Feature flag (CENTRAL_READS=1): serve the directory from the central PCA DB,
  // filtered to the current tenant's club, with central GUIDs translated to this
  // tenant's int ids via player_id_map (so /players/:id links stay int-based).
  // Off → the unchanged tenant query below.
  if (process.env.CENTRAL_READS === "1") {
    const { centralPlayerCareers } = await import("@workspace/db/central-queries");
    const tenantId = getTenantId(req);
    const [careers, mapRows] = await Promise.all([
      centralPlayerCareers(await getRequestCentralClubId(req)),
      db
        .select({
          participantId: playerIdMapTable.participantId,
          playerId: playerIdMapTable.playerId,
        })
        .from(playerIdMapTable)
        .where(eq(playerIdMapTable.tenantId, tenantId)),
    ]);
    const intByGuid = new Map(mapRows.map((m) => [m.participantId, m.playerId]));

    let rows = careers
      // Privacy: private players are excluded from the directory. Unmapped GUIDs
      // (no minted int) are skipped so every row has a working /players/:id link.
      .filter((c) => !c.isPrivate && intByGuid.has(c.participantId))
      .map((c) => {
        const name = splitCentralName(c.displayName ?? c.participantId);
        return {
          id: intByGuid.get(c.participantId)!,
          surname: name.surname,
          givenName: name.givenName,
          gradesPlayed: c.grades.join(","),
          totalGames: c.games,
          totalRuns: c.runs,
          totalWickets: c.wickets,
          deceased: false,
          imageUrl: null as string | null,
          cardRole: null as string | null,
          cardRating: null as number | null,
          isFillIn: false,
          isCapOnly: false,
        };
      });

    if (grade) rows = rows.filter((r) => r.gradesPlayed.split(",").includes(grade));
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.surname.toLowerCase().includes(s) ||
          r.givenName.toLowerCase().includes(s),
      );
    }
    const dir = sortOrder === "desc" ? -1 : 1;
    rows.sort((a, b) => {
      const cmp =
        sortBy === "games"
          ? a.totalGames - b.totalGames
          : sortBy === "runs"
            ? a.totalRuns - b.totalRuns
            : sortBy === "wickets"
              ? a.totalWickets - b.totalWickets
              : a.surname.localeCompare(b.surname);
      return cmp * dir;
    });

    res.json({
      players: rows.slice(offset, offset + lim),
      total: rows.length,
      page: Number(page),
      limit: lim,
    });
    return;
  }

  const conditions: ReturnType<typeof ilike>[] = [];
  if (search) {
    conditions.push(
      ilike(playersTable.surname, `%${search}%`),
      ilike(playersTable.givenName, `%${search}%`),
    );
  }

  if (grade) {
    const playersInGrade = await db
      .selectDistinct({ playerId: playerGradeStatsTable.playerId })
      .from(playerGradeStatsTable)
      .where(eq(playerGradeStatsTable.grade, grade));

    const playerIds = playersInGrade.map((r) => r.playerId);
    if (playerIds.length === 0) {
      res.json({ players: [], total: 0, page: Number(page), limit: lim });
      return;
    }

    const whereClause = inArray(playersTable.id, playerIds);

    const orderCol = getPlayerOrderCol(sortBy, sortOrder);
    const [players, totalResult] = await Promise.all([
      db
        .select()
        .from(playersTable)
        .where(
          search ? sql`(${whereClause}) AND (${or(...conditions)})` : whereClause,
        )
        .orderBy(orderCol)
        .limit(lim)
        .offset(offset),
      db
        .select({ count: count() })
        .from(playersTable)
        .where(
          search ? sql`(${whereClause}) AND (${or(...conditions)})` : whereClause,
        ),
    ]);

    res.json({
      players,
      total: Number(totalResult[0]?.count ?? 0),
      page: Number(page),
      limit: lim,
    });
    return;
  }

  const whereClause = search ? or(...conditions) : undefined;
  const orderCol = getPlayerOrderCol(sortBy, sortOrder);

  const [players, totalResult] = await Promise.all([
    db
      .select()
      .from(playersTable)
      .where(whereClause)
      .orderBy(orderCol)
      .limit(lim)
      .offset(offset),
    db.select({ count: count() }).from(playersTable).where(whereClause),
  ]);

  res.json({
    players,
    total: Number(totalResult[0]?.count ?? 0),
    page: Number(page),
    limit: lim,
  });
});

function getPlayerOrderCol(sortBy: string | undefined, sortOrder: string | undefined) {
  const dir = sortOrder === "desc" ? desc : asc;
  switch (sortBy) {
    case "games":
      return dir(playersTable.totalGames);
    case "runs":
      return dir(playersTable.totalRuns);
    case "wickets":
      return dir(playersTable.totalWickets);
    case "name":
    default:
      return dir(playersTable.surname);
  }
}

router.post("/players", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreatePlayerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [player] = await db
    .insert(playersTable)
    .values({
      surname: parsed.data.surname,
      givenName: parsed.data.givenName,
      deceased: parsed.data.deceased ?? false,
      imageUrl: parsed.data.imageUrl ?? null,
    })
    .returning();
  res.status(201).json(player);
});

router.get("/players/:id", async (req, res): Promise<void> => {
  const params = GetPlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [playerRow, stats, premRows, debutRow, awardRows] = await Promise.all([
    db.select().from(playersTable).where(eq(playersTable.id, params.data.id)).then((rows) => rows[0]),
    db.select().from(playerGradeStatsTable).where(eq(playerGradeStatsTable.playerId, params.data.id)).orderBy(asc(playerGradeStatsTable.grade)),
    db
      .select({
        id: premiershipsTable.id,
        year: premiershipsTable.year,
        grade: premiershipsTable.grade,
        competition: premiershipsTable.competition,
        venue: premiershipsTable.venue,
        matchDate: premiershipsTable.matchDate,
        result: premiershipsTable.result,
        mom: premiershipsTable.mom,
        isCaptain: premiershipPlayersTable.isCaptain,
      })
      .from(premiershipPlayersTable)
      .innerJoin(premiershipsTable, eq(premiershipsTable.id, premiershipPlayersTable.premiershipId))
      .where(eq(premiershipPlayersTable.playerId, params.data.id))
      .orderBy(desc(premiershipsTable.year), asc(premiershipsTable.grade)),
    // Debut inference from the season snapshot. A debut season is only reliable
    // for players whose entire record sits in the match-data ("scorecard") era:
    // any season=NULL baseline games mean the career predates reliable data, so
    // we leave the debut null rather than guess. firstSeason is the earliest
    // match-era season (start year); seasonsPlayed counts distinct match-era
    // seasons. Computed live so it stays in sync as matches are imported.
    db
      .select({
        baselineGames: sql<number>`COALESCE(SUM(${playerGradeSeasonStatsTable.games}) FILTER (WHERE ${playerGradeSeasonStatsTable.season} IS NULL), 0)`,
        firstSeason: sql<number | null>`MIN(${playerGradeSeasonStatsTable.season}) FILTER (WHERE ${playerGradeSeasonStatsTable.season} IS NOT NULL AND ${playerGradeSeasonStatsTable.games} > 0)`,
        seasonsPlayed: sql<number>`COUNT(DISTINCT ${playerGradeSeasonStatsTable.season}) FILTER (WHERE ${playerGradeSeasonStatsTable.season} IS NOT NULL AND ${playerGradeSeasonStatsTable.games} > 0)`,
      })
      .from(playerGradeSeasonStatsTable)
      .where(eq(playerGradeSeasonStatsTable.playerId, params.data.id))
      .then((rows) => rows[0]),
    // Published awards this player has won (one row per season won), used by the
    // trading card. Both the award and the individual winner row must be
    // published to appear publicly.
    db
      .select({
        key: awardsTable.key,
        title: awardsTable.title,
        season: awardWinnersTable.season,
      })
      .from(awardWinnersTable)
      .innerJoin(awardsTable, eq(awardsTable.id, awardWinnersTable.awardId))
      .where(
        and(
          eq(awardWinnersTable.playerId, params.data.id),
          eq(awardWinnersTable.published, true),
          eq(awardsTable.published, true),
        ),
      )
      .orderBy(asc(awardsTable.displayOrder), desc(awardWinnersTable.season)),
  ]);

  if (!playerRow) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  // Only date a debut when the player has zero pre-scorecard baseline games
  // (i.e. they "clearly started" in the reliable match-data era).
  const datable =
    debutRow != null && Number(debutRow.baselineGames) === 0 && debutRow.firstSeason != null;
  const debutSeason = datable ? Number(debutRow.firstSeason) : null;
  const seasonsPlayed = datable ? Number(debutRow.seasonsPlayed) : null;

  res.json({
    ...playerRow,
    premiershipsWon: premRows.length,
    premiershipsCaptained: premRows.filter((r) => r.isCaptain).length,
    debutSeason,
    seasonsPlayed,
    stats,
    premierships: premRows,
    awards: awardRows,
  });
});

router.get("/players/:id/seasons", async (req, res): Promise<void> => {
  const params = GetPlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // One row per (grade, season) summed from the snapshot table. Averages are
  // derived from the summed totals (mirroring recompute.ts) since the snapshot
  // stores raw counts, not averages. High score / best bowling pick the best
  // value within each (grade, season). Baseline rows have season = null and
  // sort first so a grade reads as a career timeline.
  const rows = await db.execute(sql`
    SELECT
      s.grade AS grade,
      s.season AS season,
      NULLIF(COALESCE(SUM(s.games), 0), 0)::int AS games,
      NULLIF(COALESCE(SUM(s.innings), 0), 0)::int AS innings,
      NULLIF(COALESCE(SUM(s.not_outs), 0), 0)::int AS "notOuts",
      NULLIF(COALESCE(SUM(s.runs), 0), 0)::int AS runs,
      CASE
        WHEN COALESCE(SUM(s.innings), 0) - COALESCE(SUM(s.not_outs), 0) > 0
          THEN COALESCE(SUM(s.runs), 0)::real
               / (COALESCE(SUM(s.innings), 0) - COALESCE(SUM(s.not_outs), 0))
        ELSE NULL
      END AS "batAvg",
      (
        SELECT x.high_score FROM player_grade_season_stats x
        WHERE x.player_id = s.player_id AND x.grade = s.grade
          AND x.season IS NOT DISTINCT FROM s.season
          AND x.high_score IS NOT NULL AND x.high_score <> ''
        ORDER BY
          NULLIF(regexp_replace(x.high_score, '[^0-9]', '', 'g'), '')::int DESC NULLS LAST,
          (x.high_score ~ '\\*') DESC
        LIMIT 1
      ) AS "highScore",
      NULLIF(COALESCE(SUM(s.fifties), 0), 0)::int AS fifties,
      NULLIF(COALESCE(SUM(s.hundreds), 0), 0)::int AS hundreds,
      NULLIF(COALESCE(SUM(s.wickets), 0), 0)::int AS wickets,
      NULLIF(COALESCE(SUM(s.runs_conceded), 0), 0)::int AS "runsConceded",
      CASE
        WHEN COALESCE(SUM(s.wickets), 0) > 0
          THEN COALESCE(SUM(s.runs_conceded), 0)::real / SUM(s.wickets)
        ELSE NULL
      END AS "bowlAvg",
      (
        SELECT x.best_bowling FROM player_grade_season_stats x
        WHERE x.player_id = s.player_id AND x.grade = s.grade
          AND x.season IS NOT DISTINCT FROM s.season
          AND x.best_bowling IS NOT NULL AND x.best_bowling <> ''
          AND x.best_bowling ~ '^[0-9]+/[0-9]+$'
        ORDER BY
          split_part(x.best_bowling, '/', 1)::int DESC,
          split_part(x.best_bowling, '/', 2)::int ASC
        LIMIT 1
      ) AS "bestBowling",
      NULLIF(COALESCE(SUM(s.five_wickets), 0), 0)::int AS "fiveWickets",
      NULLIF(COALESCE(SUM(s.catches), 0), 0)::int AS catches,
      NULLIF(COALESCE(SUM(s.stumpings), 0), 0)::int AS stumpings,
      NULLIF(COALESCE(SUM(s.run_outs), 0), 0)::int AS "runOuts"
    FROM player_grade_season_stats s
    WHERE s.player_id = ${params.data.id}
    GROUP BY s.player_id, s.grade, s.season
    ORDER BY s.grade ASC, s.season ASC NULLS FIRST
  `);

  res.json(rows.rows);
});

router.get("/players/:id/matches", async (req, res): Promise<void> => {
  const params = GetPlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = await db
    .select({
      matchId: matchesTable.id,
      grade: matchesTable.grade,
      season: matchesTable.season,
      round: matchesTable.round,
      stage: matchesTable.stage,
      matchDate: matchesTable.matchDate,
      opponent: matchesTable.opponent,
      venue: matchesTable.venue,
      result: matchesTable.result,
      batted: matchPlayerLinesTable.batted,
      battingPos: matchPlayerLinesTable.battingPos,
      runs: matchPlayerLinesTable.runs,
      balls: matchPlayerLinesTable.balls,
      fours: matchPlayerLinesTable.fours,
      sixes: matchPlayerLinesTable.sixes,
      notOut: matchPlayerLinesTable.notOut,
      dismissal: matchPlayerLinesTable.dismissal,
      bowled: matchPlayerLinesTable.bowled,
      overs: matchPlayerLinesTable.overs,
      maidens: matchPlayerLinesTable.maidens,
      runsConceded: matchPlayerLinesTable.runsConceded,
      wickets: matchPlayerLinesTable.wickets,
      wides: matchPlayerLinesTable.wides,
      noBalls: matchPlayerLinesTable.noBalls,
      catches: matchPlayerLinesTable.catches,
      stumpings: matchPlayerLinesTable.stumpings,
      runOuts: matchPlayerLinesTable.runOuts,
    })
    .from(matchPlayerLinesTable)
    .innerJoin(matchesTable, eq(matchesTable.id, matchPlayerLinesTable.matchId))
    .where(eq(matchPlayerLinesTable.playerId, params.data.id))
    .orderBy(desc(matchesTable.season), desc(matchesTable.round));

  res.json(rows);
});

router.patch("/players/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdatePlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePlayerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [player] = await db
    .update(playersTable)
    .set(parsed.data)
    .where(eq(playersTable.id, params.data.id))
    .returning();
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  // Sync denormalised name into per-grade stats rows so the UI/leaderboards reflect renames.
  if (parsed.data.surname !== undefined || parsed.data.givenName !== undefined) {
    await db
      .update(playerGradeStatsTable)
      .set({
        surname: player.surname,
        givenName: player.givenName,
      })
      .where(eq(playerGradeStatsTable.playerId, player.id));
  }
  res.json(player);
});

router.delete("/players/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeletePlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // Cascade deletes wipe stats; recompute affected grades so summaries stay correct.
  const grades = await db
    .selectDistinct({ grade: playerGradeStatsTable.grade })
    .from(playerGradeStatsTable)
    .where(eq(playerGradeStatsTable.playerId, params.data.id));
  await db.transaction(async (tx) => {
    const [player] = await tx
      .delete(playersTable)
      .where(eq(playersTable.id, params.data.id))
      .returning();
    if (!player) {
      throw new Error("__NOT_FOUND__");
    }
    if (grades.length > 0) {
      await recomputeAggregates(tx, grades.map((g) => g.grade));
    }
  }).then(
    () => res.sendStatus(204),
    (err) => {
      if (err?.message === "__NOT_FOUND__") {
        res.status(404).json({ error: "Player not found" });
      } else {
        throw err;
      }
    },
  );
});

// --- Player photo gallery -------------------------------------------------
// player_images is the gallery; players.image_url mirrors whichever row is the
// default so existing single-photo readers keep working.

router.get("/players/:id/images", async (req, res): Promise<void> => {
  const params = ListPlayerImagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const playerId = params.data.id;
  const order = [
    desc(playerImagesTable.isDefault),
    asc(playerImagesTable.sortOrder),
    asc(playerImagesTable.id),
  ] as const;

  let images = await db
    .select()
    .from(playerImagesTable)
    .where(eq(playerImagesTable.playerId, playerId))
    .orderBy(...order);

  // Self-healing backfill: a player that pre-dates the gallery may have a legacy
  // photo in players.image_url but no gallery row. Surface it as the default so
  // the admin gallery and per-card pickers always include the existing photo,
  // even if the post-merge backfill hasn't run. Insert is guarded so concurrent
  // GETs can't create duplicates.
  if (images.length === 0) {
    const [player] = await db
      .select({ imageUrl: playersTable.imageUrl })
      .from(playersTable)
      .where(eq(playersTable.id, playerId));
    if (player?.imageUrl) {
      await db.execute(sql`
        INSERT INTO player_images (player_id, image_url, sort_order, is_default)
        SELECT ${playerId}, ${player.imageUrl}, 0, true
        WHERE NOT EXISTS (
          SELECT 1 FROM player_images WHERE player_id = ${playerId}
        )
      `);
      images = await db
        .select()
        .from(playerImagesTable)
        .where(eq(playerImagesTable.playerId, playerId))
        .orderBy(...order);
    }
  }
  res.json(images);
});

router.post(
  "/players/:id/images",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = AddPlayerImageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = AddPlayerImageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const playerId = params.data.id;
    const { imageUrl, makeDefault } = parsed.data;

    const created = await db.transaction(async (tx) => {
      const [player] = await tx
        .select({ id: playersTable.id })
        .from(playersTable)
        .where(eq(playersTable.id, playerId));
      if (!player) {
        throw new Error("__NOT_FOUND__");
      }

      const existing = await tx
        .select({ id: playerImagesTable.id, sortOrder: playerImagesTable.sortOrder })
        .from(playerImagesTable)
        .where(eq(playerImagesTable.playerId, playerId));

      const nextSort =
        existing.length === 0
          ? 0
          : Math.max(...existing.map((r) => r.sortOrder)) + 1;
      // First image is always the default; otherwise honour makeDefault.
      const shouldBeDefault = existing.length === 0 || makeDefault === true;

      const [row] = await tx
        .insert(playerImagesTable)
        .values({
          playerId,
          imageUrl,
          sortOrder: nextSort,
          isDefault: shouldBeDefault,
        })
        .returning();

      if (shouldBeDefault) {
        await tx
          .update(playerImagesTable)
          .set({ isDefault: false })
          .where(eq(playerImagesTable.playerId, playerId));
        await tx
          .update(playerImagesTable)
          .set({ isDefault: true })
          .where(eq(playerImagesTable.id, row.id));
        await tx
          .update(playersTable)
          .set({ imageUrl })
          .where(eq(playersTable.id, playerId));
        row.isDefault = true;
      }
      return row;
    }).catch((err) => {
      if (err?.message === "__NOT_FOUND__") return null;
      throw err;
    });

    if (!created) {
      res.status(404).json({ error: "Player not found" });
      return;
    }
    res.status(201).json(created);
  },
);

router.delete(
  "/players/:id/images/:imageId",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeletePlayerImageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const { id: playerId, imageId } = params.data;

    await db
      .transaction(async (tx) => {
        const [deleted] = await tx
          .delete(playerImagesTable)
          .where(
            sql`${playerImagesTable.id} = ${imageId} AND ${playerImagesTable.playerId} = ${playerId}`,
          )
          .returning();
        if (!deleted) {
          throw new Error("__NOT_FOUND__");
        }
        if (deleted.isDefault) {
          // Promote the next remaining image, or clear the pointer entirely.
          const [next] = await tx
            .select()
            .from(playerImagesTable)
            .where(eq(playerImagesTable.playerId, playerId))
            .orderBy(asc(playerImagesTable.sortOrder), asc(playerImagesTable.id))
            .limit(1);
          if (next) {
            await tx
              .update(playerImagesTable)
              .set({ isDefault: true })
              .where(eq(playerImagesTable.id, next.id));
            await tx
              .update(playersTable)
              .set({ imageUrl: next.imageUrl })
              .where(eq(playersTable.id, playerId));
          } else {
            await tx
              .update(playersTable)
              .set({ imageUrl: null })
              .where(eq(playersTable.id, playerId));
          }
        }
      })
      .then(
        () => res.sendStatus(204),
        (err) => {
          if (err?.message === "__NOT_FOUND__") {
            res.status(404).json({ error: "Image not found" });
          } else {
            throw err;
          }
        },
      );
  },
);

router.post(
  "/players/:id/images/:imageId/default",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = SetDefaultPlayerImageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const { id: playerId, imageId } = params.data;

    const updated = await db
      .transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(playerImagesTable)
          .where(
            sql`${playerImagesTable.id} = ${imageId} AND ${playerImagesTable.playerId} = ${playerId}`,
          );
        if (!target) {
          throw new Error("__NOT_FOUND__");
        }
        await tx
          .update(playerImagesTable)
          .set({ isDefault: false })
          .where(eq(playerImagesTable.playerId, playerId));
        const [row] = await tx
          .update(playerImagesTable)
          .set({ isDefault: true })
          .where(eq(playerImagesTable.id, imageId))
          .returning();
        await tx
          .update(playersTable)
          .set({ imageUrl: row.imageUrl })
          .where(eq(playersTable.id, playerId));
        return row;
      })
      .catch((err) => {
        if (err?.message === "__NOT_FOUND__") return null;
        throw err;
      });

    if (!updated) {
      res.status(404).json({ error: "Image not found" });
      return;
    }
    res.json(updated);
  },
);

router.post("/players/:id/merge", requireAdmin, async (req, res): Promise<void> => {
  const params = MergePlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = MergePlayerBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const duplicateId = params.data.id;
  const keeperId = body.data.keeperId;
  if (duplicateId === keeperId) {
    res.status(400).json({ error: "keeperId must differ from duplicate id" });
    return;
  }

  try {
    const keeper = await db.transaction(async (tx) => {
      const [dup] = await tx.select().from(playersTable).where(eq(playersTable.id, duplicateId));
      const [kpr] = await tx.select().from(playersTable).where(eq(playersTable.id, keeperId));
      if (!dup) throw new Error("__DUP_NOT_FOUND__");
      if (!kpr) throw new Error("__KEEPER_NOT_FOUND__");

      const dupGrades = await tx
        .selectDistinct({ grade: playerGradeSeasonStatsTable.grade })
        .from(playerGradeSeasonStatsTable)
        .where(eq(playerGradeSeasonStatsTable.playerId, duplicateId));

      // Reassign every reference from duplicate → keeper.
      await tx
        .update(playerGradeSeasonStatsTable)
        .set({ playerId: keeperId })
        .where(eq(playerGradeSeasonStatsTable.playerId, duplicateId));
      await tx
        .update(premiershipPlayersTable)
        .set({ playerId: keeperId })
        .where(eq(premiershipPlayersTable.playerId, duplicateId));
      await tx
        .update(capRegisterTable)
        .set({ playerId: keeperId })
        .where(eq(capRegisterTable.playerId, duplicateId));
      await tx
        .update(lifeMembersTable)
        .set({ playerId: keeperId })
        .where(eq(lifeMembersTable.playerId, duplicateId));

      // Delete duplicate (cascades aggregates rows).
      await tx.delete(playersTable).where(eq(playersTable.id, duplicateId));

      const affected = dupGrades.map((g) => g.grade);
      if (affected.length > 0) {
        await recomputeAggregates(tx, affected);
      }

      const [refreshed] = await tx.select().from(playersTable).where(eq(playersTable.id, keeperId));
      return refreshed;
    });

    res.json(keeper);
  } catch (err) {
    if ((err as Error)?.message === "__DUP_NOT_FOUND__") {
      res.status(404).json({ error: "Duplicate player not found" });
      return;
    }
    if ((err as Error)?.message === "__KEEPER_NOT_FOUND__") {
      res.status(404).json({ error: "Keeper player not found" });
      return;
    }
    throw err;
  }
});

export default router;
