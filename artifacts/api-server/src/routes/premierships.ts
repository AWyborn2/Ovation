import { Router, type IRouter } from "express";
import { asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  premiershipsTable,
  premiershipPlayersTable,
  matchesTable,
} from "@workspace/db";
import {
  CreatePremiershipBody,
  UpdatePremiershipBody,
  UpdatePremiershipParams,
  DeletePremiershipParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

interface PlayerInput {
  playerId?: number | null;
  name: string;
  isCaptain: boolean;
  battingOrder?: number | null;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Parse a free-text match_date (e.g. "12:00 PM, Saturday, 21 Mar 2026") into a
 * sortable timestamp; null when no day-month-year can be extracted. */
function parseMatchDate(d: string | null | undefined): number | null {
  if (!d) return null;
  const m = d.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (!m) return null;
  const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (mon === undefined) return null;
  return new Date(Number(m[3]), mon, Number(m[1])).getTime();
}

const OPP_STOP_WORDS = new Set([
  "GRADE", "SENIOR", "MEN", "T20", "BLUE", "GOLD", "THE", "AND", "CUP",
]);

/** Heuristic: does the match opponent name appear in the premiership result
 * text? Strips generic "Cricket Club" wording and tries a substring match, then
 * falls back to matching any meaningful token. */
function opponentInResult(
  opponent: string | null | undefined,
  result: string | null | undefined,
): boolean {
  if (!opponent || !result) return false;
  const res = result.toUpperCase();
  const cleaned = opponent
    .toUpperCase()
    .replace(/CRICKET CLUB|CRICKET|CLUB/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned && res.includes(cleaned)) return true;
  const tokens = cleaned
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length >= 4 && !OPP_STOP_WORDS.has(t));
  return tokens.some((t) => res.includes(t));
}

type GfMatch = Pick<
  typeof matchesTable.$inferSelect,
  "id" | "grade" | "season" | "opponent" | "matchDate" | "result"
>;

/** Choose the single Grand Final match for a premiership from its candidates.
 * Prefers a match whose opponent appears in the result text, then the most
 * recent parsed matchDate, falling back to the lowest id. */
function pickGrandFinal(
  candidates: GfMatch[],
  premResult: string | null | undefined,
): number | null {
  if (candidates.length === 0) return null;
  const ranked = candidates
    .map((m) => ({
      id: m.id,
      opp: opponentInResult(m.opponent, premResult),
      date: parseMatchDate(m.matchDate),
    }))
    .sort((a, b) => {
      if (a.opp !== b.opp) return a.opp ? -1 : 1;
      const ad = a.date ?? -Infinity;
      const bd = b.date ?? -Infinity;
      if (ad !== bd) return bd - ad;
      return a.id - b.id;
    });
  return ranked[0].id;
}

async function loadWithPlayers(id: number) {
  const [prem] = await db.select().from(premiershipsTable).where(eq(premiershipsTable.id, id));
  if (!prem) return null;
  const players = await db
    .select()
    .from(premiershipPlayersTable)
    .where(eq(premiershipPlayersTable.premiershipId, id))
    .orderBy(asc(premiershipPlayersTable.battingOrder), asc(premiershipPlayersTable.id));
  return { ...prem, players };
}

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

  const gfMatches = await db
    .select({
      id: matchesTable.id,
      grade: matchesTable.grade,
      season: matchesTable.season,
      opponent: matchesTable.opponent,
      matchDate: matchesTable.matchDate,
      result: matchesTable.result,
    })
    .from(matchesTable)
    .where(eq(matchesTable.stage, "Grand Final"));

  const gfByKey = new Map<string, GfMatch[]>();
  for (const m of gfMatches) {
    const key = `${m.grade}|${m.season}`;
    if (!gfByKey.has(key)) gfByKey.set(key, []);
    gfByKey.get(key)!.push(m);
  }

  res.json(
    prems.map((p) => ({
      ...p,
      players: byPrem.get(p.id) ?? [],
      matchId: pickGrandFinal(gfByKey.get(`${p.grade}|${p.year}`) ?? [], p.result),
    })),
  );
});

router.post("/premierships", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreatePremiershipBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const created = await db.transaction(async (tx) => {
    const [prem] = await tx
      .insert(premiershipsTable)
      .values({
        year: parsed.data.year,
        grade: parsed.data.grade,
        competition: parsed.data.competition,
        venue: parsed.data.venue ?? null,
        matchDate: parsed.data.matchDate ?? null,
        result: parsed.data.result ?? null,
        mom: parsed.data.mom ?? null,
        notes: parsed.data.notes ?? null,
      })
      .returning();
    const players: PlayerInput[] = parsed.data.players ?? [];
    if (players.length > 0) {
      await tx.insert(premiershipPlayersTable).values(
        players.map((p) => ({
          premiershipId: prem.id,
          playerId: p.playerId ?? null,
          name: p.name,
          isCaptain: p.isCaptain ?? false,
          battingOrder: p.battingOrder ?? null,
        })),
      );
    }
    return prem;
  });
  const full = await loadWithPlayers(created.id);
  res.status(201).json(full);
});

router.patch("/premierships/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdatePremiershipParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdatePremiershipBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { players, ...meta } = body.data;
  const updated = await db.transaction(async (tx) => {
    const updateFields: Partial<typeof premiershipsTable.$inferInsert> = {};
    for (const [k, v] of Object.entries(meta)) {
      if (v !== undefined) (updateFields as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(updateFields).length > 0) {
      const [row] = await tx
        .update(premiershipsTable)
        .set(updateFields)
        .where(eq(premiershipsTable.id, params.data.id))
        .returning();
      if (!row) throw new Error("__NOT_FOUND__");
    } else {
      const [row] = await tx
        .select()
        .from(premiershipsTable)
        .where(eq(premiershipsTable.id, params.data.id));
      if (!row) throw new Error("__NOT_FOUND__");
    }
    if (players !== undefined) {
      await tx
        .delete(premiershipPlayersTable)
        .where(eq(premiershipPlayersTable.premiershipId, params.data.id));
      if (players.length > 0) {
        await tx.insert(premiershipPlayersTable).values(
          players.map((p) => ({
            premiershipId: params.data.id,
            playerId: p.playerId ?? null,
            name: p.name,
            isCaptain: p.isCaptain ?? false,
            battingOrder: p.battingOrder ?? null,
          })),
        );
      }
    }
    return true;
  }).catch((e) => {
    if ((e as Error).message === "__NOT_FOUND__") return false;
    throw e;
  });
  if (!updated) {
    res.status(404).json({ error: "Premiership not found" });
    return;
  }
  const full = await loadWithPlayers(params.data.id);
  res.json(full);
});

router.delete("/premierships/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeletePremiershipParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(premiershipsTable)
    .where(eq(premiershipsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Premiership not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
