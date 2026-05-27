import { Router, type IRouter } from "express";
import { asc, desc, inArray } from "drizzle-orm";
import {
  db,
  premiershipsTable,
  premiershipPlayersTable,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/premierships", async (_req, res): Promise<void> => {
  const prems = await db
    .select()
    .from(premiershipsTable)
    .orderBy(desc(premiershipsTable.year), asc(premiershipsTable.grade));

  if (prems.length === 0) {
    res.json([]);
    return;
  }

  const ids = prems.map((p) => p.id);
  const players = await db
    .select()
    .from(premiershipPlayersTable)
    .where(inArray(premiershipPlayersTable.premiershipId, ids))
    .orderBy(
      asc(premiershipPlayersTable.premiershipId),
      asc(premiershipPlayersTable.battingOrder),
    );

  const byPrem = new Map<number, typeof players>();
  for (const p of players) {
    if (!byPrem.has(p.premiershipId)) byPrem.set(p.premiershipId, []);
    byPrem.get(p.premiershipId)!.push(p);
  }

  res.json(
    prems.map((p) => ({
      ...p,
      players: byPrem.get(p.id) ?? [],
    })),
  );
});

export default router;
