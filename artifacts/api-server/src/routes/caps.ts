import { Router, type IRouter } from "express";
import { asc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  capRegisterTable,
  matchesTable,
  matchPlayerLinesTable,
  playerGradeSeasonStatsTable,
} from "@workspace/db";
import {
  CreateCapBody,
  UpdateCapBody,
  UpdateCapParams,
  DeleteCapParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

const CAP_CATEGORY_TO_GRADE: Record<"male" | "female", string> = {
  male: "A Grade",
  female: "Female A Grade",
};

router.get("/caps", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(capRegisterTable)
    .orderBy(asc(capRegisterTable.capNumber));
  res.json(rows);
});

/**
 * Recent first-cap debutants, derived directly from the cap register (so this
 * is ungated by the social-milestone engine). Each capped player appears once
 * with their grade (from the cap category), cap number, and — when a matching
 * per-match record exists — the season/round they debuted. Ordered freshest
 * debut first: dated debuts (by season, then round) ahead of seeded caps with
 * no match record, with cap number as the tiebreak.
 */
router.get("/caps/debutants", async (_req, res): Promise<void> => {
  const caps = await db
    .select({
      capNumber: capRegisterTable.capNumber,
      category: capRegisterTable.category,
      name: capRegisterTable.name,
      playerId: capRegisterTable.playerId,
    })
    .from(capRegisterTable)
    .where(isNotNull(capRegisterTable.playerId));

  const grades = Object.values(CAP_CATEGORY_TO_GRADE);
  const lines = await db
    .select({
      playerId: matchPlayerLinesTable.playerId,
      grade: matchesTable.grade,
      season: matchesTable.season,
      round: matchesTable.round,
    })
    .from(matchPlayerLinesTable)
    .innerJoin(matchesTable, eq(matchesTable.id, matchPlayerLinesTable.matchId))
    .where(inArray(matchesTable.grade, grades));

  // Earliest (season, round) per (playerId, grade) from the permanent history.
  // Skip lines missing a season/round — they can't be ordered as a debut date.
  const earliest = new Map<string, { season: number; round: number }>();
  for (const l of lines) {
    if (l.season == null || l.round == null) continue;
    const key = `${l.playerId}|${l.grade}`;
    const cur = earliest.get(key);
    if (
      !cur ||
      l.season < cur.season ||
      (l.season === cur.season && l.round < cur.round)
    ) {
      earliest.set(key, { season: l.season, round: l.round });
    }
  }

  // Per-(player, grade) snapshot games by season, to tell a true debut from an
  // established player who merely appears in an imported match. A match record
  // only dates a debut when the player has NO prior games in that grade before
  // that season (seeded baseline rows carry season = NULL = pre-records career).
  const snapshots = await db
    .select({
      playerId: playerGradeSeasonStatsTable.playerId,
      grade: playerGradeSeasonStatsTable.grade,
      season: playerGradeSeasonStatsTable.season,
      games: playerGradeSeasonStatsTable.games,
    })
    .from(playerGradeSeasonStatsTable)
    .where(inArray(playerGradeSeasonStatsTable.grade, grades));

  const snapsByKey = new Map<
    string,
    { season: number | null; games: number }[]
  >();
  for (const s of snapshots) {
    const key = `${s.playerId}|${s.grade}`;
    const arr = snapsByKey.get(key) ?? [];
    arr.push({ season: s.season, games: s.games ?? 0 });
    snapsByKey.set(key, arr);
  }

  // Games the player logged in the grade BEFORE the given season (NULL baseline
  // rows always count as prior, since they predate per-match records).
  const priorGames = (key: string, season: number): number => {
    let total = 0;
    for (const s of snapsByKey.get(key) ?? []) {
      if (s.season == null || s.season < season) total += s.games;
    }
    return total;
  };

  const entries = caps.map((c) => {
    const category = (c.category === "female" ? "female" : "male") as
      | "male"
      | "female";
    const grade = CAP_CATEGORY_TO_GRADE[category];
    const key = c.playerId != null ? `${c.playerId}|${grade}` : "";
    const debut = key ? earliest.get(key) : undefined;
    const isTrueDebut = !!debut && priorGames(key, debut.season) === 0;
    return {
      playerId: c.playerId as number,
      name: c.name,
      grade,
      category,
      capNumber: c.capNumber,
      season: isTrueDebut ? debut!.season : null,
      round: isTrueDebut ? debut!.round : null,
    };
  });

  // Freshest first: dated debuts ahead of undated, then by season/round desc,
  // with cap number descending as the final tiebreak.
  entries.sort((a, b) => {
    const aDated = a.season != null;
    const bDated = b.season != null;
    if (aDated !== bDated) return aDated ? -1 : 1;
    if (aDated && bDated) {
      if (a.season !== b.season) return (b.season as number) - (a.season as number);
      if (a.round !== b.round) return (b.round as number) - (a.round as number);
    }
    return b.capNumber - a.capNumber;
  });

  res.json(entries);
});

router.post("/caps", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateCapBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const category = parsed.data.category ?? "male";
    const [row] = await db
      .insert(capRegisterTable)
      .values({
        capNumber: parsed.data.capNumber,
        category,
        name: parsed.data.name,
        deceased: parsed.data.deceased ?? false,
        inStats: parsed.data.inStats ?? false,
        gamesAGrade: parsed.data.gamesAGrade ?? 0,
        playerId: parsed.data.playerId ?? null,
      })
      .returning();
    res.status(201).json(row);
  } catch (e) {
    const msg = (e as Error).message ?? "Insert failed";
    if (/duplicate|unique/i.test(msg)) {
      const category = parsed.data.category ?? "male";
      const label = category === "female" ? "Female A Grade" : "A Grade Male";
      res.status(409).json({ error: `Cap #${parsed.data.capNumber} already exists in the ${label} list.` });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

router.patch("/caps/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateCapParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateCapBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const [row] = await db
      .update(capRegisterTable)
      .set(body.data)
      .where(eq(capRegisterTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Cap entry not found" });
      return;
    }
    res.json(row);
  } catch (e) {
    const msg = (e as Error).message ?? "Update failed";
    if (/duplicate|unique/i.test(msg)) {
      res.status(409).json({ error: `Cap number already in use.` });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

router.delete("/caps/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteCapParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(capRegisterTable)
    .where(eq(capRegisterTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Cap entry not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
