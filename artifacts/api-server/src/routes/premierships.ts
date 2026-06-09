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

interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

/** Parse a free-text match_date (e.g. "12:00 PM, Saturday, 21 Mar 2026") into
 * day/month/year parts; null when no day-month-year can be extracted. */
function parseMatchDateParts(d: string | null | undefined): DateParts | null {
  if (!d) return null;
  const m = d.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (!m) return null;
  const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (mon === undefined) return null;
  return { year: Number(m[3]), month: mon + 1, day: Number(m[1]) };
}

/** Parse a premiership match_date (stored as ISO-ish text "2026-03-21"). */
function parsePremDateParts(d: string | null | undefined): DateParts | null {
  if (!d) return null;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function partsToTime(p: DateParts | null): number | null {
  return p ? new Date(p.year, p.month - 1, p.day).getTime() : null;
}

/** Cricket season start-year for a premiership. Matches store `season` as the
 * season start-year (e.g. 2023 = 2023/24, whose Grand Final is in March 2024),
 * but a premiership's `year` is the calendar year of the win. Derive the season
 * from the (more precise) final date: mid-season finals (Jul-Dec) keep the
 * calendar year, season-ending finals (Jan-Jun) belong to the previous year. */
export function premiershipSeasons(year: number, matchDate: string | null | undefined): number[] {
  const parts = parsePremDateParts(matchDate);
  if (parts) return [parts.month >= 7 ? parts.year : parts.year - 1];
  // No usable final date: a calendar-year-`year` win is either the end of
  // season `year-1` or a mid-season final of season `year`. Consider both.
  return [year - 1, year];
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

interface PremForLink {
  result: string | null;
  competition: string;
  matchDate: string | null;
}

/** Resolve the scorecard match for a premiership from pre-grouped candidate
 * pools keyed by `grade|season`. Most competitions label their decider
 * "Grand Final", but a few (e.g. the PPL T20 Cup, PCA Colts) label it
 * generically as "Finals". Prefer an explicit Grand Final; only fall back to a
 * "Finals"-stage decider when the grade+season has no Grand Final at all. This
 * keeps the link working without per-match source_key hardcoding in the ETL. */
export function linkPremiershipMatch(
  prem: PremForLink & { year: number; grade: string },
  gfByKey: Map<string, GfMatch[]>,
  finalsByKey: Map<string, GfMatch[]>,
): number | null {
  const seasons = premiershipSeasons(prem.year, prem.matchDate);
  let candidates = seasons.flatMap(
    (season) => gfByKey.get(`${prem.grade}|${season}`) ?? [],
  );
  if (candidates.length === 0) {
    candidates = seasons.flatMap(
      (season) => finalsByKey.get(`${prem.grade}|${season}`) ?? [],
    );
  }
  return pickGrandFinal(candidates, prem);
}

const isT20 = (s: string | null | undefined): boolean => /\bt20\b/i.test(s ?? "");
const isUndecidedResult = (r: string | null | undefined): boolean =>
  /WASHOUT|ABANDON|SHARED|TIED|NO RESULT/i.test(r ?? "");

/** Choose the single Grand Final match for a premiership from its candidates
 * (already restricted to the right grade + season). A season can hold more than
 * one Grand Final (e.g. a season-ending cup final plus a mid-season T20), so we
 * disambiguate in priority order:
 *   1. exact final date (premiership date == match date)
 *   2. T20-vs-not alignment with the premiership's competition
 *   3. a Won result (premierships are wins, unless washed-out/shared/tied)
 *   4. opponent name appearing in the premiership result text
 *   5. most recent date, then lowest id
 */
export function pickGrandFinal(
  candidates: GfMatch[],
  prem: PremForLink,
): number | null {
  if (candidates.length === 0) return null;
  const premDate = parsePremDateParts(prem.matchDate);
  const premT20 = isT20(prem.competition) || isT20(prem.result);
  const undecided = isUndecidedResult(prem.result);
  const ranked = candidates
    .map((m) => {
      const md = parseMatchDateParts(m.matchDate);
      const exact =
        premDate != null &&
        md != null &&
        premDate.year === md.year &&
        premDate.month === md.month &&
        premDate.day === md.day;
      return {
        id: m.id,
        exact,
        t20align: isT20(m.opponent) === premT20,
        won: (m.result ?? "").toUpperCase() === "WON",
        opp: opponentInResult(m.opponent, prem.result),
        date: partsToTime(md),
      };
    })
    .sort((a, b) => {
      if (a.exact !== b.exact) return a.exact ? -1 : 1;
      if (a.t20align !== b.t20align) return a.t20align ? -1 : 1;
      if (!undecided && a.won !== b.won) return a.won ? -1 : 1;
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

  // Most competitions label their decider "Grand Final", but a few (e.g. the
  // PPL T20 Cup and PCA Colts) label it generically as "Finals". Fetch both so
  // a premiership whose grade+season has no "Grand Final" can fall back to the
  // "Finals" decider — without per-match source_key hardcoding in the ETL.
  const finalMatches = await db
    .select({
      id: matchesTable.id,
      grade: matchesTable.grade,
      season: matchesTable.season,
      opponent: matchesTable.opponent,
      matchDate: matchesTable.matchDate,
      result: matchesTable.result,
      stage: matchesTable.stage,
    })
    .from(matchesTable)
    .where(inArray(matchesTable.stage, ["Grand Final", "Finals"]));

  const gfByKey = new Map<string, GfMatch[]>();
  const finalsByKey = new Map<string, GfMatch[]>();
  for (const m of finalMatches) {
    const key = `${m.grade}|${m.season}`;
    const target = m.stage === "Grand Final" ? gfByKey : finalsByKey;
    if (!target.has(key)) target.set(key, []);
    target.get(key)!.push(m);
  }

  res.json(
    prems.map((p) => ({
      ...p,
      players: byPrem.get(p.id) ?? [],
      matchId: linkPremiershipMatch(p, gfByKey, finalsByKey),
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
