import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import {
  db,
  capRegisterTable,
  matchesTable,
  matchPlayerLinesTable,
  playerGradeSeasonStatsTable,
} from "@workspace/db";
import {
  ConfirmCapsBody,
  CreateCapBody,
  DeclineCapParams,
  DeleteCapParams,
  ReorderPendingCapsBody,
  RestoreCapParams,
  UpdateCapBody,
  UpdateCapParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { assertPlayerInTenantSpace, curatedIdsAreNative } from "../lib/curated-player-space";
import { CAP_CATEGORY_TO_GRADE, recomputeCapsFromStats } from "../lib/cap-sync";
import { syncDebutCaps } from "../lib/debut-caps";

const router: IRouter = Router();

// The public register is confirmed caps only: an automatically issued cap
// waits for an admin (GET /caps/review) before it shows here.
router.get("/caps", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(capRegisterTable)
    .where(
      and(
        eq(capRegisterTable.tenantId, getTenantId(req)),
        eq(capRegisterTable.status, "confirmed"),
      ),
    )
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
router.get("/caps/debutants", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const caps = await db
    .select({
      capNumber: capRegisterTable.capNumber,
      category: capRegisterTable.category,
      name: capRegisterTable.name,
      playerId: capRegisterTable.playerId,
    })
    .from(capRegisterTable)
    .where(
      and(
        eq(capRegisterTable.tenantId, tenantId),
        isNotNull(capRegisterTable.playerId),
        eq(capRegisterTable.status, "confirmed"),
      ),
    );

  // Debut dates come from the NATIVE match history, which holds only Halls
  // Head's players. Another club's cap ids are its own crosswalk ids (U8), so
  // reading them against native lines would date its caps by whichever Halls
  // Head player shares the integer — leave them undated instead.
  const native = await curatedIdsAreNative(tenantId);
  const grades = Object.values(CAP_CATEGORY_TO_GRADE);
  const lines = !native
    ? []
    : await db
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
    if (!cur || l.season < cur.season || (l.season === cur.season && l.round < cur.round)) {
      earliest.set(key, { season: l.season, round: l.round });
    }
  }

  // Per-(player, grade) snapshot games by season, to tell a true debut from an
  // established player who merely appears in an imported match. A match record
  // only dates a debut when the player has NO prior games in that grade before
  // that season (seeded baseline rows carry season = NULL = pre-records career).
  const snapshots = !native
    ? []
    : await db
        .select({
          playerId: playerGradeSeasonStatsTable.playerId,
          grade: playerGradeSeasonStatsTable.grade,
          season: playerGradeSeasonStatsTable.season,
          games: playerGradeSeasonStatsTable.games,
        })
        .from(playerGradeSeasonStatsTable)
        .where(inArray(playerGradeSeasonStatsTable.grade, grades));

  const snapsByKey = new Map<string, { season: number | null; games: number }[]>();
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
    const category = (c.category === "female" ? "female" : "male") as "male" | "female";
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

router.post(
  "/caps",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const parsed = CreateCapBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    await assertPlayerInTenantSpace(getTenantId(req), parsed.data.playerId);
    // Cached games come from the native stats, which are Halls Head's alone.
    const nativeStats = await curatedIdsAreNative(getTenantId(req));
    try {
      const category = parsed.data.category ?? "male";
      const playerId = parsed.data.playerId ?? null;
      const row = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(capRegisterTable)
          .values({
            tenantId: getTenantId(req),
            capNumber: parsed.data.capNumber,
            category,
            name: parsed.data.name,
            deceased: parsed.data.deceased ?? false,
            inStats: parsed.data.inStats ?? false,
            gamesAGrade: parsed.data.gamesAGrade ?? 0,
            playerId,
          })
          .returning();

        // A cap created already linked to a player should immediately reflect that
        // player's real grade games / on-record status from the existing stats,
        // rather than the (often 0) hand-entered values.
        if (playerId != null && nativeStats) {
          await recomputeCapsFromStats(tx, getTenantId(req), [
            category === "female" ? "female" : "male",
          ]);
          const [fresh] = await tx
            .select()
            .from(capRegisterTable)
            .where(eq(capRegisterTable.id, created.id));
          return fresh ?? created;
        }

        return created;
      });
      res.status(201).json(row);
    } catch (e) {
      const msg = (e as Error).message ?? "Insert failed";
      if (/duplicate|unique/i.test(msg)) {
        const category = parsed.data.category ?? "male";
        const label = category === "female" ? "Female A Grade" : "A Grade Male";
        res
          .status(409)
          .json({ error: `Cap #${parsed.data.capNumber} already exists in the ${label} list.` });
        return;
      }
      res.status(500).json({ error: msg });
    }
  },
);

// ── Cap confirmation (Ash, 5 Oct 2026) ─────────────────────────────────────
// Caps issued automatically start "pending". An admin confirms them onto the
// public register, renumbers them if they were issued in the wrong order, or
// declines one (kept as "declined", numbered -id, so the player is never capped
// again automatically; restorable).

type CapTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Number `orderedIds` (pending caps of one category) straight after the
 * category's highest confirmed cap. Moved through temporary negative numbers
 * first, so the per-tenant unique cap number never trips mid-way.
 */
async function renumberPending(
  tx: CapTx,
  tenantId: number,
  category: string,
  orderedIds: readonly number[],
): Promise<void> {
  if (orderedIds.length === 0) return;
  const [top] = await tx
    .select({ max: sql<number | null>`max(${capRegisterTable.capNumber})` })
    .from(capRegisterTable)
    .where(
      and(
        eq(capRegisterTable.tenantId, tenantId),
        eq(capRegisterTable.category, category),
        ne(capRegisterTable.status, "pending"),
      ),
    );
  const base = Math.max(0, Number(top?.max ?? 0));
  const own = (id: number) =>
    and(eq(capRegisterTable.tenantId, tenantId), eq(capRegisterTable.id, id));
  for (const id of orderedIds) {
    await tx
      .update(capRegisterTable)
      .set({ capNumber: -1_000_000 - id })
      .where(own(id));
  }
  for (const [i, id] of orderedIds.entries()) {
    await tx
      .update(capRegisterTable)
      .set({ capNumber: base + 1 + i })
      .where(own(id));
  }
}

async function pendingCaps(reader: Pick<typeof db, "select">, tenantId: number, category: string) {
  return reader
    .select()
    .from(capRegisterTable)
    .where(
      and(
        eq(capRegisterTable.tenantId, tenantId),
        eq(capRegisterTable.category, category),
        eq(capRegisterTable.status, "pending"),
      ),
    )
    .orderBy(asc(capRegisterTable.capNumber));
}

router.get("/caps/review", requireAdmin, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(capRegisterTable)
    .where(
      and(
        eq(capRegisterTable.tenantId, getTenantId(req)),
        inArray(capRegisterTable.status, ["pending", "declined"]),
      ),
    )
    .orderBy(asc(capRegisterTable.category), asc(capRegisterTable.capNumber));
  // Pending (positive numbers) first, then declined.
  res.json([
    ...rows.filter((r) => r.status === "pending"),
    ...rows.filter((r) => r.status !== "pending"),
  ]);
});

router.post(
  "/caps/review/confirm",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const body = ConfirmCapsBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (body.data.ids.length === 0) {
      res.json({ updated: 0 });
      return;
    }
    const rows = await db
      .update(capRegisterTable)
      .set({ status: "confirmed" })
      .where(
        and(
          eq(capRegisterTable.tenantId, getTenantId(req)),
          eq(capRegisterTable.status, "pending"),
          inArray(capRegisterTable.id, body.data.ids),
        ),
      )
      .returning({ id: capRegisterTable.id });
    res.json({ updated: rows.length });
  },
);

// Catch-up for debutants the hourly sweep's window has passed (e.g. a season
// loaded in bulk): every cap it issues is pending, so the admin still confirms.
router.post(
  "/caps/review/catch-up",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const { plans, minted } = await syncDebutCaps(getTenantId(req), { since: null, commit: true });
    res.json({
      issued: minted,
      olderUncapped: plans.reduce((n, p) => n + p.olderUncapped.length, 0),
      held: plans.flatMap((p) =>
        p.held && !/no cap register/.test(p.held) ? [`${p.grade}: ${p.held}`] : [],
      ),
    });
  },
);

router.post(
  "/caps/review/reorder",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const body = ReorderPendingCapsBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const { category, ids } = body.data;
    const result = await db.transaction(async (tx) => {
      const current = await pendingCaps(tx, tenantId, category);
      const want = new Set(ids);
      if (
        want.size !== ids.length ||
        current.length !== ids.length ||
        current.some((c) => !want.has(c.id))
      ) {
        return null;
      }
      await renumberPending(tx, tenantId, category, ids);
      return pendingCaps(tx, tenantId, category);
    });
    if (!result) {
      res.status(400).json({ error: "List every pending cap in this category exactly once." });
      return;
    }
    res.json(result);
  },
);

router.post(
  "/caps/:id/decline",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const params = DeclineCapParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const row = await db.transaction(async (tx) => {
      const [declined] = await tx
        .update(capRegisterTable)
        .set({ status: "declined", capNumber: -params.data.id })
        .where(
          and(
            eq(capRegisterTable.tenantId, tenantId),
            eq(capRegisterTable.id, params.data.id),
            eq(capRegisterTable.status, "pending"),
          ),
        )
        .returning();
      if (!declined) return null;
      // The remaining pending caps close the gap, in their current order.
      const rest = await pendingCaps(tx, tenantId, declined.category);
      await renumberPending(
        tx,
        tenantId,
        declined.category,
        rest.map((c) => c.id),
      );
      return declined;
    });
    if (!row) {
      res.status(404).json({ error: "No pending cap with this id" });
      return;
    }
    res.json(row);
  },
);

router.post(
  "/caps/:id/restore",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const params = RestoreCapParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const row = await db.transaction(async (tx) => {
      const [cap] = await tx
        .select()
        .from(capRegisterTable)
        .where(
          and(
            eq(capRegisterTable.tenantId, tenantId),
            eq(capRegisterTable.id, params.data.id),
            eq(capRegisterTable.status, "declined"),
          ),
        );
      if (!cap) return null;
      const [top] = await tx
        .select({ max: sql<number | null>`max(${capRegisterTable.capNumber})` })
        .from(capRegisterTable)
        .where(
          and(eq(capRegisterTable.tenantId, tenantId), eq(capRegisterTable.category, cap.category)),
        );
      const [restored] = await tx
        .update(capRegisterTable)
        .set({ status: "pending", capNumber: Math.max(0, Number(top?.max ?? 0)) + 1 })
        .where(eq(capRegisterTable.id, cap.id))
        .returning();
      return restored ?? null;
    });
    if (!row) {
      res.status(404).json({ error: "No declined cap with this id" });
      return;
    }
    res.json(row);
  },
);

router.patch(
  "/caps/:id",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
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
    await assertPlayerInTenantSpace(getTenantId(req), body.data.playerId);
    const nativeStats = await curatedIdsAreNative(getTenantId(req));
    try {
      const row = await db.transaction(async (tx) => {
        const [updatedRow] = await tx
          .update(capRegisterTable)
          .set(body.data)
          .where(
            and(
              eq(capRegisterTable.tenantId, getTenantId(req)),
              eq(capRegisterTable.id, params.data.id),
            ),
          )
          .returning();
        if (!updatedRow) return null;

        // When the player link is part of this update, refresh the cap's cached
        // games / on-record status from the existing stats so a manual link picks
        // up the linked player's real grade games (and an unlink clears them).
        if (body.data.playerId !== undefined) {
          if (updatedRow.playerId == null) {
            await tx
              .update(capRegisterTable)
              .set({ inStats: false, gamesAGrade: 0 })
              .where(eq(capRegisterTable.id, updatedRow.id));
          } else if (nativeStats) {
            const category = updatedRow.category === "female" ? "female" : "male";
            await recomputeCapsFromStats(tx, getTenantId(req), [category]);
          }
          const [fresh] = await tx
            .select()
            .from(capRegisterTable)
            .where(eq(capRegisterTable.id, updatedRow.id));
          return fresh ?? updatedRow;
        }

        return updatedRow;
      });

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
  },
);

/**
 * Admin: recompute every linked cap's games + on-record status from the current
 * stats, across both A Grade lists. Import-independent reconciliation so manual
 * cap additions/links can be refreshed in one click.
 */
router.post(
  "/caps/recompute",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    // Only a native-stats club's caps can be reconciled against the native
    // stats; another club's linked ids are its own crosswalk ids (U8).
    if (!(await curatedIdsAreNative(getTenantId(req)))) {
      res.json({
        updated: 0,
        categories: (["male", "female"] as const).map((category) => ({
          category,
          grade: CAP_CATEGORY_TO_GRADE[category],
          updated: 0,
        })),
      });
      return;
    }
    const categories = await db.transaction((tx) => recomputeCapsFromStats(tx, getTenantId(req)));
    const updated = categories.reduce((sum, c) => sum + c.updated, 0);
    res.json({ updated, categories });
  },
);

router.delete(
  "/caps/:id",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const params = DeleteCapParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .delete(capRegisterTable)
      .where(
        and(
          eq(capRegisterTable.tenantId, getTenantId(req)),
          eq(capRegisterTable.id, params.data.id),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Cap entry not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
