import { Router, type IRouter } from "express";
import { and, asc, eq, or } from "drizzle-orm";
import {
  db,
  sponsorsTable,
  sponsorPlayersTable,
  cardThemesTable,
  cardAudioTracksTable,
} from "@workspace/db";
import {
  CreateSponsorBody,
  UpdateSponsorBody,
  UpdateSponsorParams,
  DeleteSponsorParams,
  GetPlayerSponsorsParams,
  CreateCardThemeBody,
  UpdateCardThemeBody,
  UpdateCardThemeParams,
  DeleteCardThemeParams,
  CreateCardAudioTrackBody,
  UpdateCardAudioTrackBody,
  UpdateCardAudioTrackParams,
  DeleteCardAudioTrackParams,
} from "@workspace/api-zod";
import { requireAdmin, resolveAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { migrateSponsorLogos } from "../lib/sponsor-logo-migration";
import { loadActiveSponsors, withSponsorPlayers } from "../lib/active-sponsors";
import { cardSponsors } from "@workspace/scorecard/card-sponsors";
import { nonSeniorPlayerIds } from "../lib/club-photo-library";
import { linkedPlayerNames } from "../lib/squad-link";
import { getTenantId } from "../middlewares/tenant-context";

import { ensureThemes } from "../lib/social-cards-helpers";

/**
 * Social studio — brand assets: sponsors, card colour themes and audio tracks.
 * Reading is public (the public card renderer needs them); authoring is
 * admin-only and gated on the socialStudio entitlement. Mounted by
 * routes/social-cards.ts.
 */
const router: IRouter = Router();

/** A sponsor's teams: trimmed, blanks and repeats dropped. */
function cleanGrades(grades: readonly string[] | undefined): string[] {
  return [...new Set((grades ?? []).map((g) => g.trim()).filter(Boolean))];
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PlayerTags = { ok: true; tags: Array<{ id: number; name: string }> } | { ok: false };

/**
 * A sponsor's players (player sponsors), checked and named: duplicates
 * dropped, and a newly added player who isn't one of this club's senior
 * players rejected (junior participants and fill-ins are never tagged, as on
 * photos). Players already tagged (`kept`, id to saved name) are never
 * re-checked, so a wrong or stale tag can always be removed, even when it or
 * another tag left on the sponsor no longer passes the senior check. Each tag
 * keeps the player's name as a label for the admin screen.
 */
async function playerTags(
  tenantId: number,
  playerIds: readonly number[],
  kept: ReadonlyMap<number, string> = new Map(),
): Promise<PlayerTags> {
  const ids = [...new Set(playerIds)];
  if (ids.length === 0) return { ok: true, tags: [] };
  const added = ids.filter((id) => !kept.has(id));
  if ((await nonSeniorPlayerIds(tenantId, added)).length > 0) return { ok: false };
  const names = await linkedPlayerNames(tenantId, ids);
  return {
    ok: true,
    tags: ids.map((id) => ({ id, name: names.get(id) ?? kept.get(id) ?? `Player #${id}` })),
  };
}

/** A sponsor's tagged players now, id to saved name (empty for another club's sponsor). */
async function currentPlayerTags(
  tenantId: number,
  sponsorId: number,
): Promise<Map<number, string>> {
  const rows = await db
    .select({ id: sponsorPlayersTable.playerId, name: sponsorPlayersTable.playerName })
    .from(sponsorPlayersTable)
    .where(
      and(eq(sponsorPlayersTable.tenantId, tenantId), eq(sponsorPlayersTable.sponsorId, sponsorId)),
    );
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Replace a sponsor's players with `tags`, inside the sponsor's transaction. */
async function writePlayerTags(
  tx: Tx,
  tenantId: number,
  sponsorId: number,
  tags: Array<{ id: number; name: string }>,
): Promise<void> {
  await tx
    .delete(sponsorPlayersTable)
    .where(
      and(eq(sponsorPlayersTable.tenantId, tenantId), eq(sponsorPlayersTable.sponsorId, sponsorId)),
    );
  if (tags.length === 0) return;
  await tx
    .insert(sponsorPlayersTable)
    .values(tags.map((t) => ({ tenantId, sponsorId, playerId: t.id, playerName: t.name })));
}

const SENIOR_ONLY = "Only senior players can be tagged on a sponsor.";

router.get("/sponsors", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const rows = await db
    .select()
    .from(sponsorsTable)
    .where(eq(sponsorsTable.tenantId, tenantId))
    .orderBy(asc(sponsorsTable.displayOrder), asc(sponsorsTable.id));
  // Player names go to the club's admins only; public readers get the ids.
  const withNames = (await resolveAdmin(req)) !== null;
  res.json(
    await withSponsorPlayers(tenantId, await migrateSponsorLogos(rows, req.log), { withNames }),
  );
});

/**
 * A senior player's own sponsors for their public profile: the active sponsors
 * a player card about them would carry (the shared card-sponsors rule, so the
 * date window and order match the cards). Club-wide sponsors never show here;
 * no tags, a fill-in or another club's player gives an empty list.
 */
router.get("/players/:id/sponsors", async (req, res): Promise<void> => {
  const params = GetPlayerSponsorsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const active = await loadActiveSponsors(getTenantId(req), req.log);
  const { playerSponsors } = cardSponsors(active, { kind: "player", playerId: params.data.id });
  res.json(
    playerSponsors.map((sp) => ({ id: sp.id, name: sp.name, logoUrl: sp.logoUrl, link: sp.link })),
  );
});

router.post(
  "/sponsors",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const parsed = CreateSponsorBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const isPresenting = parsed.data.isPresenting ?? false;
    const players = await playerTags(tenantId, parsed.data.playerIds ?? []);
    if (!players.ok) {
      res.status(400).json({ error: SENIOR_ONLY });
      return;
    }
    const row = await db.transaction(async (tx) => {
      // At most one presenting sponsor per tenant: clear any prior one first so the
      // partial unique index never trips (mirrors the card-themes isDefault flow).
      if (isPresenting) {
        await tx
          .update(sponsorsTable)
          .set({ isPresenting: false })
          .where(eq(sponsorsTable.tenantId, tenantId));
      }
      const [created] = await tx
        .insert(sponsorsTable)
        .values({
          tenantId,
          name: parsed.data.name,
          logoUrl: parsed.data.logoUrl,
          link: parsed.data.link ?? "",
          activeFrom: parsed.data.activeFrom ?? null,
          activeTo: parsed.data.activeTo ?? null,
          cardKinds: parsed.data.cardKinds ?? [],
          grades: cleanGrades(parsed.data.grades),
          isPresenting,
          displayOrder: parsed.data.displayOrder ?? 0,
          tier: parsed.data.tier ?? "standard",
        })
        .returning();
      await writePlayerTags(tx, tenantId, created.id, players.tags);
      return created;
    });
    const [withPlayers] = await withSponsorPlayers(tenantId, [row], { withNames: true });
    res.status(201).json(withPlayers);
  },
);

router.patch(
  "/sponsors/:id",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const params = UpdateSponsorParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateSponsorBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const scoped = and(eq(sponsorsTable.id, params.data.id), eq(sponsorsTable.tenantId, tenantId));
    const { playerIds, ...fields } = body.data;
    // Only players newly added are checked: removing a tag always works.
    const players =
      playerIds === undefined
        ? null
        : await playerTags(tenantId, playerIds, await currentPlayerTags(tenantId, params.data.id));
    if (players && !players.ok) {
      res.status(400).json({ error: SENIOR_ONLY });
      return;
    }
    const row = await db.transaction(async (tx) => {
      // Promoting this sponsor to presenting clears any other presenting sponsor
      // for the tenant first, keeping at most one (partial unique index guard).
      if (body.data.isPresenting === true) {
        await tx
          .update(sponsorsTable)
          .set({ isPresenting: false })
          .where(eq(sponsorsTable.tenantId, tenantId));
      }
      // A change to the players alone leaves the sponsor row as it is.
      const changesRow = Object.values(fields).some((v) => v !== undefined);
      const [updated] = !changesRow
        ? await tx.select().from(sponsorsTable).where(scoped)
        : await tx
            .update(sponsorsTable)
            .set({
              ...fields,
              grades: fields.grades === undefined ? undefined : cleanGrades(fields.grades),
              activeFrom: fields.activeFrom === undefined ? undefined : fields.activeFrom,
              activeTo: fields.activeTo === undefined ? undefined : fields.activeTo,
            })
            .where(scoped)
            .returning();
      if (updated && players?.ok) await writePlayerTags(tx, tenantId, updated.id, players.tags);
      return updated;
    });
    if (!row) {
      res.status(404).json({ error: "Sponsor not found" });
      return;
    }
    const [withPlayers] = await withSponsorPlayers(tenantId, [row], { withNames: true });
    res.json(withPlayers);
  },
);

router.delete(
  "/sponsors/:id",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const params = DeleteSponsorParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const result = await db
      .delete(sponsorsTable)
      .where(
        and(eq(sponsorsTable.id, params.data.id), eq(sponsorsTable.tenantId, getTenantId(req))),
      )
      .returning({ id: sponsorsTable.id });
    if (result.length === 0) {
      res.status(404).json({ error: "Sponsor not found" });
      return;
    }
    res.status(204).end();
  },
);

router.get("/card-themes", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  await ensureThemes(tenantId);
  const rows = await db
    .select()
    .from(cardThemesTable)
    .where(eq(cardThemesTable.tenantId, tenantId))
    .orderBy(asc(cardThemesTable.displayOrder), asc(cardThemesTable.id));
  res.json(rows);
});

router.post(
  "/card-themes",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const parsed = CreateCardThemeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const row = await db.transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx
          .update(cardThemesTable)
          .set({ isDefault: false })
          .where(eq(cardThemesTable.tenantId, tenantId));
      }
      const [created] = await tx
        .insert(cardThemesTable)
        .values({
          tenantId,
          name: parsed.data.name,
          bgDark: parsed.data.bgDark,
          bgPanel: parsed.data.bgPanel,
          accent: parsed.data.accent,
          textLight: parsed.data.textLight,
          displayFont: parsed.data.displayFont ?? null,
          backgroundImageUrl: parsed.data.backgroundImageUrl ?? null,
          logoUrl: parsed.data.logoUrl ?? null,
          isDefault: parsed.data.isDefault ?? false,
          displayOrder: parsed.data.displayOrder ?? 0,
        })
        .returning();
      return created;
    });
    res.status(201).json(row);
  },
);

router.patch(
  "/card-themes/:id",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const params = UpdateCardThemeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateCardThemeBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const scoped = and(
      eq(cardThemesTable.id, params.data.id),
      eq(cardThemesTable.tenantId, tenantId),
    );
    const row = await db.transaction(async (tx) => {
      if (body.data.isDefault === true) {
        await tx
          .update(cardThemesTable)
          .set({ isDefault: false })
          .where(eq(cardThemesTable.tenantId, tenantId));
      }
      const [updated] = await tx.update(cardThemesTable).set(body.data).where(scoped).returning();
      if (!updated) return undefined;
      // Never leave zero defaults: if this update unset the last default, promote
      // the first remaining theme (within the same tenant).
      if (body.data.isDefault === false) {
        const remaining = await tx
          .select({ id: cardThemesTable.id })
          .from(cardThemesTable)
          .where(and(eq(cardThemesTable.tenantId, tenantId), eq(cardThemesTable.isDefault, true)));
        if (remaining.length === 0) {
          const [first] = await tx
            .select()
            .from(cardThemesTable)
            .where(eq(cardThemesTable.tenantId, tenantId))
            .orderBy(asc(cardThemesTable.displayOrder), asc(cardThemesTable.id))
            .limit(1);
          if (first) {
            await tx
              .update(cardThemesTable)
              .set({ isDefault: true })
              .where(eq(cardThemesTable.id, first.id));
            if (first.id === updated.id) updated.isDefault = true;
          }
        }
      }
      return updated;
    });
    if (!row) {
      res.status(404).json({ error: "Card theme not found" });
      return;
    }
    res.json(row);
  },
);

router.delete(
  "/card-themes/:id",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const params = DeleteCardThemeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const result = await db
      .delete(cardThemesTable)
      .where(and(eq(cardThemesTable.id, params.data.id), eq(cardThemesTable.tenantId, tenantId)))
      .returning({ id: cardThemesTable.id, isDefault: cardThemesTable.isDefault });
    if (result.length === 0) {
      res.status(404).json({ error: "Card theme not found" });
      return;
    }
    // If we deleted the default, promote the first remaining theme (within the
    // same tenant) to default.
    if (result[0]?.isDefault) {
      const [first] = await db
        .select()
        .from(cardThemesTable)
        .where(eq(cardThemesTable.tenantId, tenantId))
        .orderBy(asc(cardThemesTable.displayOrder), asc(cardThemesTable.id))
        .limit(1);
      if (first) {
        await db
          .update(cardThemesTable)
          .set({ isDefault: true })
          .where(eq(cardThemesTable.id, first.id));
      }
    }
    res.status(204).end();
  },
);

// --- Card audio tracks (background music for animated clips) ---------------
// A track is OPTIONAL on any clip; no track = silent export. There is no
// "default" track — silence is the default — so this CRUD is a plain ordered
// list with no default-promotion logic (unlike themes).

router.get("/card-audio-tracks", async (req, res): Promise<void> => {
  // The curated built-in library (isCurated) is a shared, platform-wide asset
  // (seeded once, not per-tenant) — every tenant sees it, plus their own
  // uploads. Only a tenant's own uploads are ever editable/deletable by them
  // (see PATCH/DELETE below).
  const rows = await db
    .select()
    .from(cardAudioTracksTable)
    .where(
      or(
        eq(cardAudioTracksTable.tenantId, getTenantId(req)),
        eq(cardAudioTracksTable.isCurated, true),
      ),
    )
    .orderBy(asc(cardAudioTracksTable.displayOrder), asc(cardAudioTracksTable.id));
  res.json(rows);
});

router.post(
  "/card-audio-tracks",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const parsed = CreateCardAudioTrackBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [created] = await db
      .insert(cardAudioTracksTable)
      .values({
        tenantId: getTenantId(req),
        name: parsed.data.name,
        url: parsed.data.url,
        durationMs: parsed.data.durationMs ?? null,
        isCurated: parsed.data.isCurated ?? false,
        displayOrder: parsed.data.displayOrder ?? 0,
      })
      .returning();
    res.status(201).json(created);
  },
);

router.patch(
  "/card-audio-tracks/:id",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const params = UpdateCardAudioTrackParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateCardAudioTrackBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [updated] = await db
      .update(cardAudioTracksTable)
      .set(body.data)
      .where(
        and(
          eq(cardAudioTracksTable.id, params.data.id),
          eq(cardAudioTracksTable.tenantId, getTenantId(req)),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Card audio track not found" });
      return;
    }
    res.json(updated);
  },
);

router.delete(
  "/card-audio-tracks/:id",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const params = DeleteCardAudioTrackParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const result = await db
      .delete(cardAudioTracksTable)
      .where(
        and(
          eq(cardAudioTracksTable.id, params.data.id),
          eq(cardAudioTracksTable.tenantId, getTenantId(req)),
        ),
      )
      .returning({ id: cardAudioTracksTable.id });
    if (result.length === 0) {
      res.status(404).json({ error: "Card audio track not found" });
      return;
    }
    res.status(204).end();
  },
);

export default router;
