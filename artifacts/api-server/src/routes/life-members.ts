import { Router, type IRouter } from "express";
import { asc, eq, inArray } from "drizzle-orm";
import { db, lifeMembersTable, playerGradeStatsTable } from "@workspace/db";
import {
  CreateLifeMemberBody,
  UpdateLifeMemberBody,
  UpdateLifeMemberParams,
  DeleteLifeMemberParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

interface AggregatedStats {
  games: number;
  innings: number;
  notOuts: number;
  runs: number;
  highScore: string | null;
  fifties: number;
  hundreds: number;
  wickets: number;
  runsConceded: number;
  bestBowling: string | null;
  fiveWickets: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  gradesPlayed: string[];
}

const GRADE_ORDER = [
  "A Grade",
  "B Grade",
  "C Grade",
  "D Grade",
  "E Grade",
  "F Grade",
  "Female A Grade",
  "Female B Grade",
  "PPL",
  "Colts",
];

const parseHighScore = (hs: string | null | undefined): number => {
  if (!hs) return 0;
  const n = parseInt(String(hs).replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
};

const parseBestBowling = (
  bb: string | null | undefined,
): { wkts: number; runs: number } => {
  if (!bb) return { wkts: 0, runs: 0 };
  const m = String(bb).match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return { wkts: 0, runs: 0 };
  return { wkts: parseInt(m[1], 10), runs: parseInt(m[2], 10) };
};

router.get("/life-members", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(lifeMembersTable)
    .orderBy(asc(lifeMembersTable.inductionYear), asc(lifeMembersTable.name));

  const playerIds = rows
    .map((r) => r.playerId)
    .filter((id): id is number => id !== null);

  const statsByPlayer = new Map<number, AggregatedStats>();
  if (playerIds.length > 0) {
    const allStats = await db
      .select()
      .from(playerGradeStatsTable)
      .where(inArray(playerGradeStatsTable.playerId, playerIds));

    for (const s of allStats) {
      let agg = statsByPlayer.get(s.playerId);
      if (!agg) {
        agg = {
          games: 0,
          innings: 0,
          notOuts: 0,
          runs: 0,
          highScore: null,
          fifties: 0,
          hundreds: 0,
          wickets: 0,
          runsConceded: 0,
          bestBowling: null,
          fiveWickets: 0,
          catches: 0,
          stumpings: 0,
          runOuts: 0,
          gradesPlayed: [],
        };
        statsByPlayer.set(s.playerId, agg);
      }
      if (s.grade === "CLUB TOTAL") continue;

      agg.games += s.games ?? 0;
      agg.innings += s.innings ?? 0;
      agg.notOuts += s.notOuts ?? 0;
      agg.runs += s.runs ?? 0;
      agg.fifties += s.fifties ?? 0;
      agg.hundreds += s.hundreds ?? 0;
      agg.wickets += s.wickets ?? 0;
      agg.runsConceded += s.runsConceded ?? 0;
      agg.fiveWickets += s.fiveWickets ?? 0;
      agg.catches += s.catches ?? 0;
      agg.stumpings += s.stumpings ?? 0;
      agg.runOuts += s.runOuts ?? 0;

      const hs = parseHighScore(s.highScore);
      if (hs > parseHighScore(agg.highScore)) agg.highScore = s.highScore ?? null;

      const bb = parseBestBowling(s.bestBowling);
      const cur = parseBestBowling(agg.bestBowling);
      if (
        bb.wkts > cur.wkts ||
        (bb.wkts === cur.wkts && bb.wkts > 0 && bb.runs < cur.runs)
      ) {
        agg.bestBowling = s.bestBowling ?? null;
      }

      if (!agg.gradesPlayed.includes(s.grade)) agg.gradesPlayed.push(s.grade);
    }

    for (const agg of statsByPlayer.values()) {
      agg.gradesPlayed.sort((a, b) => {
        const ai = GRADE_ORDER.indexOf(a);
        const bi = GRADE_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    }
  }

  res.json(
    rows.map((r) => ({
      ...r,
      stats: r.playerId !== null ? statsByPlayer.get(r.playerId) ?? null : null,
    })),
  );
});

router.post("/life-members", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateLifeMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(lifeMembersTable)
    .values({
      name: parsed.data.name,
      inductionYear: parsed.data.inductionYear,
      isPlayingMember: parsed.data.isPlayingMember ?? true,
      playerId: parsed.data.playerId ?? null,
      roleLabel: parsed.data.roleLabel ?? null,
      blurb: parsed.data.blurb ?? "",
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/life-members/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateLifeMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateLifeMemberBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [row] = await db
    .update(lifeMembersTable)
    .set(body.data)
    .where(eq(lifeMembersTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Life member not found" });
    return;
  }
  res.json(row);
});

router.delete("/life-members/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteLifeMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(lifeMembersTable)
    .where(eq(lifeMembersTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Life member not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
