import { Router, type IRouter } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  db,
  juniorPremiershipsTable,
  juniorPremiershipPlayersTable,
  juniorOfficeBearersTable,
} from "@workspace/db";
import { getPrivateIds, MASK_NAME, officeBearersOrdered } from "../lib/junior-helpers";
import {
  CreateJuniorOfficeBearerBody,
  UpdateJuniorOfficeBearerBody,
  UpdateJuniorOfficeBearerParams,
  DeleteJuniorOfficeBearerParams,
  UpdateJuniorPremiershipParams,
  UpdateJuniorPremiershipBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { isCentralTenant } from "../lib/tenant";

/**
 * Junior curated honours: premierships and office bearers — tenant-scoped
 * content kept COMPLETELY SEPARATE from the senior honour tables.
 *
 * JUNIORS read API — see routes/juniors.ts for the isolation and privacy
 * rules every handler here follows. Mounted by routes/juniors.ts.
 */
const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /juniors/premierships
// ---------------------------------------------------------------------------
router.get("/juniors/premierships", async (req, res): Promise<void> => {
  // Junior data is tenant-local / seniors-only in central — empty for central tenants.
  if (await isCentralTenant(req)) {
    res.json([]);
    return;
  }
  const privateIds = await getPrivateIds(getTenantId(req));
  const prems = await db
    .select()
    .from(juniorPremiershipsTable)
    .orderBy(desc(juniorPremiershipsTable.season), desc(juniorPremiershipsTable.id));
  const players = await db
    .select()
    .from(juniorPremiershipPlayersTable)
    .orderBy(juniorPremiershipPlayersTable.id);

  const byPrem = new Map<number, typeof players>();
  for (const p of players) {
    const list = byPrem.get(p.premiershipId) ?? [];
    list.push(p);
    byPrem.set(p.premiershipId, list);
  }

  res.json(
    prems.map((pr) => ({
      id: pr.id,
      season: pr.season,
      ageGroup: pr.ageGroup,
      teamName: pr.teamName,
      competition: pr.competition,
      association: pr.association,
      matchDate: pr.matchDate,
      venue: pr.venue,
      venueOval: pr.venueOval,
      opponent: pr.opponent,
      hhScore: pr.hhScore,
      oppScore: pr.oppScore,
      resultText: pr.resultText,
      mom: pr.mom,
      matchId: pr.matchId,
      players: (byPrem.get(pr.id) ?? []).map((pl) => {
        const priv = !!pl.participantId && privateIds.has(pl.participantId);
        return {
          id: pl.id,
          participantId: priv ? null : pl.participantId,
          playerName: priv ? MASK_NAME : (pl.playerName ?? ""),
          isCaptain: pl.isCaptain,
        };
      }),
    })),
  );
});

// ---------------------------------------------------------------------------
// PATCH /juniors/premierships/:id (admin) — set man-of-the-match + captain
// flags. Junior premierships come from the dump (no create/delete here); admins
// only enrich them with captain + MoM, which the ETL preserves across reloads.
// ---------------------------------------------------------------------------
router.patch("/juniors/premierships/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateJuniorPremiershipParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateJuniorPremiershipBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const id = params.data.id;

  const [prem] = await db
    .select()
    .from(juniorPremiershipsTable)
    .where(eq(juniorPremiershipsTable.id, id));
  if (!prem) {
    res.status(404).json({ error: "Premiership not found" });
    return;
  }

  const { mom, captainPlayerIds } = body.data;
  await db.transaction(async (tx) => {
    if (mom !== undefined) {
      await tx
        .update(juniorPremiershipsTable)
        .set({ mom: mom ?? null })
        .where(eq(juniorPremiershipsTable.id, id));
    }
    if (captainPlayerIds !== undefined) {
      await tx
        .update(juniorPremiershipPlayersTable)
        .set({ isCaptain: false })
        .where(eq(juniorPremiershipPlayersTable.premiershipId, id));
      if (captainPlayerIds.length > 0) {
        await tx
          .update(juniorPremiershipPlayersTable)
          .set({ isCaptain: true })
          .where(
            and(
              eq(juniorPremiershipPlayersTable.premiershipId, id),
              inArray(juniorPremiershipPlayersTable.id, captainPlayerIds),
            ),
          );
      }
    }
  });

  const privateIds = await getPrivateIds(getTenantId(req));
  const [updated] = await db
    .select()
    .from(juniorPremiershipsTable)
    .where(eq(juniorPremiershipsTable.id, id));
  const players = await db
    .select()
    .from(juniorPremiershipPlayersTable)
    .where(eq(juniorPremiershipPlayersTable.premiershipId, id))
    .orderBy(juniorPremiershipPlayersTable.id);

  res.json({
    id: updated.id,
    season: updated.season,
    ageGroup: updated.ageGroup,
    teamName: updated.teamName,
    competition: updated.competition,
    association: updated.association,
    matchDate: updated.matchDate,
    venue: updated.venue,
    venueOval: updated.venueOval,
    opponent: updated.opponent,
    hhScore: updated.hhScore,
    oppScore: updated.oppScore,
    resultText: updated.resultText,
    mom: updated.mom,
    matchId: updated.matchId,
    players: players.map((pl) => {
      const priv = !!pl.participantId && privateIds.has(pl.participantId);
      return {
        id: pl.id,
        participantId: priv ? null : pl.participantId,
        playerName: priv ? MASK_NAME : (pl.playerName ?? ""),
        isCaptain: pl.isCaptain,
      };
    }),
  });
});

// ---------------------------------------------------------------------------
// Junior office bearers — admin-managed, kept COMPLETELY SEPARATE from the
// senior club_roles table. Public list returns published rows only.
// ---------------------------------------------------------------------------
router.get("/juniors/office-bearers", async (req, res): Promise<void> => {
  // Curated content is tenant-scoped: only this tenant's published rows.
  const rows = await officeBearersOrdered().where(
    and(
      eq(juniorOfficeBearersTable.published, true),
      eq(juniorOfficeBearersTable.tenantId, getTenantId(req)),
    ),
  );
  res.json(rows);
});

router.get("/juniors/office-bearers/all", requireAdmin, async (req, res): Promise<void> => {
  const rows = await officeBearersOrdered().where(
    eq(juniorOfficeBearersTable.tenantId, getTenantId(req)),
  );
  res.json(rows);
});

router.post("/juniors/office-bearers", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateJuniorOfficeBearerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(juniorOfficeBearersTable)
    .values({
      season: parsed.data.season,
      role: parsed.data.role,
      name: parsed.data.name,
      participantId: parsed.data.participantId ?? null,
      displayOrder: parsed.data.displayOrder ?? 0,
      published: parsed.data.published ?? false,
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/juniors/office-bearers/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateJuniorOfficeBearerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateJuniorOfficeBearerBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [row] = await db
    .update(juniorOfficeBearersTable)
    .set(body.data)
    .where(eq(juniorOfficeBearersTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Junior office bearer not found" });
    return;
  }
  res.json(row);
});

router.delete("/juniors/office-bearers/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteJuniorOfficeBearerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(juniorOfficeBearersTable)
    .where(eq(juniorOfficeBearersTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Junior office bearer not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
