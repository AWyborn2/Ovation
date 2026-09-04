import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  juniorMatchesTable,
  juniorMatchRostersTable,
  juniorStatCorrectionsTable,
} from "@workspace/db";
import {
  UpdateJuniorMatchParams,
  UpdateJuniorMatchBody,
  AddJuniorRosterEntryParams,
  AddJuniorRosterEntryBody,
  RemoveJuniorRosterEntryParams,
} from "@workspace/api-zod";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { juniorEditRateLimiter } from "../middlewares/rate-limit";
import { getTenantId } from "../middlewares/tenant-context";
import {
  journal,
  adminName,
  tenantMatch,
  hhTeamName,
  tenantParticipant,
  serializeMatchMeta,
  MATCH_COLS,
  ADMIN_JUNIOR_LINE_ID_BASE,
  serializeRosterEntry,
} from "../lib/junior-admin-helpers";
import { isCentralTenant } from "../lib/tenant";

/**
 * Juniors admin — match metadata and roster corrections.
 *
 * `PATCH /juniors/matches/:id` edits the match header (dates, teams, scores,
 * result) and `POST/DELETE /juniors/matches/:matchId/roster` fixes who is
 * recorded as having played. Write-through + journal like every juniors admin
 * endpoint — see routes/juniors-admin.ts for the model. Mounted there.
 */
const router: IRouter = Router();

router.patch(
  "/juniors/matches/:id",
  requireAdmin,
  juniorEditRateLimiter,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = UpdateJuniorMatchParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateJuniorMatchBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (await isCentralTenant(req)) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    const match = await tenantMatch(req, params.data.id);
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const set: Record<string, unknown> = {};
    const patch: Record<string, unknown> = {};
    const prev: Record<string, unknown> = {};
    for (const [camel, snake] of Object.entries(MATCH_COLS)) {
      const value = (body.data as Record<string, unknown>)[camel];
      if (value === undefined) continue;
      set[camel] = value;
      patch[snake] = value;
      prev[snake] = (match as unknown as Record<string, unknown>)[camel] ?? null;
    }
    if (Object.keys(set).length === 0) {
      res.json(serializeMatchMeta(match));
      return;
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(juniorMatchesTable)
        .set(set)
        .where(eq(juniorMatchesTable.id, match.id))
        .returning();
      await journal(tx, {
        tenantId: getTenantId(req),
        targetTable: "junior_matches",
        targetId: String(match.id),
        op: "update",
        patch,
        prevValues: prev,
        matchId: match.id,
        playhqMatchId: match.playhqMatchId,
        createdBy: adminName(req),
      });
      return row;
    });

    res.json(serializeMatchMeta(updated));
  },
);

// ---------------------------------------------------------------------------
// Roster entries
// ---------------------------------------------------------------------------

router.post(
  "/juniors/matches/:matchId/roster",
  requireAdmin,
  juniorEditRateLimiter,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = AddJuniorRosterEntryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = AddJuniorRosterEntryBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (await isCentralTenant(req)) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    const match = await tenantMatch(req, params.data.matchId);
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    const participant = await tenantParticipant(req, body.data.participantId);
    if (!participant) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }
    const [existing] = await db
      .select({ id: juniorMatchRostersTable.id })
      .from(juniorMatchRostersTable)
      .where(
        and(
          eq(juniorMatchRostersTable.matchId, match.id),
          eq(juniorMatchRostersTable.participantId, participant.participantId),
          eq(juniorMatchRostersTable.isHallsHead, true),
        ),
      );
    if (existing) {
      res
        .status(409)
        .json({ error: "Participant is already on this match roster" });
      return;
    }

    const created = await db.transaction(async (tx) => {
      const journalId = await journal(tx, {
        tenantId: getTenantId(req),
        targetTable: "junior_match_rosters",
        targetId: "",
        op: "insert",
        patch: null,
        prevValues: null,
        matchId: match.id,
        playhqMatchId: match.playhqMatchId,
        participantId: participant.participantId,
        createdBy: adminName(req),
      });
      const lineId = ADMIN_JUNIOR_LINE_ID_BASE + journalId;
      const fullRow: Record<string, unknown> = {
        id: lineId,
        match_id: match.id,
        team_name: hhTeamName(match),
        is_halls_head: true,
        participant_id: participant.participantId,
        player_name: participant.displayName,
      };
      await tx
        .update(juniorStatCorrectionsTable)
        .set({ targetId: String(lineId), patch: fullRow })
        .where(eq(juniorStatCorrectionsTable.id, journalId));
      const [row] = await tx
        .insert(juniorMatchRostersTable)
        .values({
          id: lineId,
          matchId: match.id,
          teamName: hhTeamName(match),
          isHallsHead: true,
          participantId: participant.participantId,
          playerName: participant.displayName,
        })
        .returning();
      return row;
    });

    res.status(201).json(serializeRosterEntry(created));
  },
);

router.delete(
  "/juniors/matches/:matchId/roster/:lineId",
  requireAdmin,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = RemoveJuniorRosterEntryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (await isCentralTenant(req)) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    const match = await tenantMatch(req, params.data.matchId);
    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    const [line] = await db
      .select()
      .from(juniorMatchRostersTable)
      .where(eq(juniorMatchRostersTable.id, params.data.lineId));
    if (!line || line.matchId !== match.id) {
      res.status(404).json({ error: "Roster entry not found" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(juniorMatchRostersTable)
        .where(eq(juniorMatchRostersTable.id, line.id));
      await journal(tx, {
        tenantId: getTenantId(req),
        targetTable: "junior_match_rosters",
        targetId: String(line.id),
        op: "delete",
        patch: null,
        prevValues: {
          id: line.id,
          match_id: line.matchId,
          team_name: line.teamName,
          is_halls_head: line.isHallsHead,
          participant_id: line.participantId,
          player_name: line.playerName,
        },
        matchId: match.id,
        playhqMatchId: match.playhqMatchId,
        participantId: line.participantId,
        createdBy: adminName(req),
      });
    });

    res.status(204).end();
  },
);

export default router;
