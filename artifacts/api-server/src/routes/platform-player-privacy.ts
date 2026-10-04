import { Router, type IRouter, type Request } from "express";
import { desc, eq } from "drizzle-orm";
import { db, playerPrivacyOverridesTable } from "@workspace/db";
import {
  GetPlatformPlayerPrivacyQueryParams,
  SetPlayerPrivacyOverrideBody,
} from "@workspace/api-zod";
import {
  applyPrivacyOverrides,
  assertProjectorScope,
  centralProjectorConfigured,
  getCentralProjectorPool,
} from "@workspace/db/playhq-ingest";
import {
  requirePlatformAdmin,
  type RequestWithPlatformAdmin,
} from "../middlewares/require-platform-admin";
import { clearMilestonesCache } from "../lib/milestones-cache";

/**
 * Platform-admin privacy overrides for central players
 * (docs/plans/2026-10-04-001-feat-playhq-central-projection-plan.md, D4 / P8).
 *
 * Central players are shared by every club, so this is a platform decision keyed by the PlayHQ
 * participant GUID. Saving an override records it app-side and then — when the central
 * projector is configured — applies it to `central.players.is_private` straight away through the
 * projector's scoped pool (the app's own central handle stays read-only). Without the projector it
 * waits for the next sync that touches the player.
 */
const router: IRouter = Router();

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CentralFlags = Map<string, { displayName: string | null; isPrivate: boolean }>;

async function centralFlags(ids: string[]): Promise<CentralFlags> {
  if (!ids.length) return new Map();
  const { centralPlayerNames } = await import("@workspace/db/central-queries");
  return centralPlayerNames(ids);
}

/** Apply now through the projector pool; false when it isn't configured or fails. */
async function applyNow(participantId: string, log: Request["log"]): Promise<boolean> {
  if (!centralProjectorConfigured()) return false;
  try {
    const pool = getCentralProjectorPool();
    await assertProjectorScope(pool);
    await applyPrivacyOverrides(pool, [participantId]);
    const { clearCentralQueriesCache } = await import("@workspace/db/central-queries");
    clearCentralQueriesCache();
    clearMilestonesCache();
    return true;
  } catch (err) {
    log?.error({ err, participantId }, "player privacy override not applied");
    return false;
  }
}

router.get(
  "/platform/admin/player-privacy",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const parsed = GetPlatformPlayerPrivacyQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const overrides = await db
      .select()
      .from(playerPrivacyOverridesTable)
      .orderBy(desc(playerPrivacyOverridesTable.setAt));
    const { centralPlayersForPrivacy } = await import("@workspace/db/central-queries");
    const players = parsed.data.q ? await centralPlayersForPrivacy(parsed.data.q) : [];
    const flags = await centralFlags(overrides.map((o) => o.participantId));
    const overrideOf = new Map(overrides.map((o) => [o.participantId, o.isPrivate]));
    res.json({
      projectorConfigured: centralProjectorConfigured(),
      overrides: overrides.map((o) => ({
        participantId: o.participantId,
        isPrivate: o.isPrivate,
        reason: o.reason,
        setAt: o.setAt.toISOString(),
        displayName: flags.get(o.participantId)?.displayName ?? null,
        applied: flags.get(o.participantId)?.isPrivate === o.isPrivate,
      })),
      players: players.map((p) => ({ ...p, override: overrideOf.get(p.participantId) ?? null })),
    });
  },
);

router.put(
  "/platform/admin/player-privacy/:participantId",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const participantId = String(req.params.participantId ?? "").toLowerCase();
    if (!GUID_RE.test(participantId)) {
      res.status(400).json({ error: "participantId must be a PlayHQ participant GUID" });
      return;
    }
    const parsed = SetPlayerPrivacyOverrideBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const before = await centralFlags([participantId]);
    if (!before.has(participantId)) {
      res.status(404).json({ error: "No central player with that participant id" });
      return;
    }
    const admin = (req as RequestWithPlatformAdmin).platformAdmin!;
    const values = {
      isPrivate: parsed.data.isPrivate,
      reason: parsed.data.reason?.trim() || null,
      setByPlatformAdminId: admin.id,
      setAt: new Date(),
    };
    const [row] = await db
      .insert(playerPrivacyOverridesTable)
      .values({ participantId, ...values })
      .onConflictDoUpdate({ target: playerPrivacyOverridesTable.participantId, set: values })
      .returning();
    const applied = await applyNow(participantId, req.log);
    const after = applied ? await centralFlags([participantId]) : before;
    req.log?.info(
      {
        event: "player_privacy_override_set",
        platformAdminId: admin.id,
        participantId,
        isPrivate: row!.isPrivate,
        applied,
      },
      "platform admin set a player privacy override",
    );
    res.json({
      participantId,
      isPrivate: row!.isPrivate,
      reason: row!.reason,
      setAt: row!.setAt.toISOString(),
      displayName: after.get(participantId)?.displayName ?? null,
      applied: after.get(participantId)?.isPrivate === row!.isPrivate,
    });
  },
);

router.delete(
  "/platform/admin/player-privacy/:participantId",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const participantId = String(req.params.participantId ?? "").toLowerCase();
    const [row] = await db
      .delete(playerPrivacyOverridesTable)
      .where(eq(playerPrivacyOverridesTable.participantId, participantId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "No such override" });
      return;
    }
    const admin = (req as RequestWithPlatformAdmin).platformAdmin!;
    req.log?.info(
      { event: "player_privacy_override_removed", platformAdminId: admin.id, participantId },
      "platform admin removed a player privacy override",
    );
    res.status(204).end();
  },
);

export default router;
