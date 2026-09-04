import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  juniorMatchBattingTable,
  juniorMatchBowlingTable,
  juniorStatCorrectionsTable,
} from "@workspace/db";
import {
  CreateJuniorBattingLineParams,
  CreateJuniorBattingLineBody,
  UpdateJuniorBattingLineParams,
  UpdateJuniorBattingLineBody,
  DeleteJuniorBattingLineParams,
  CreateJuniorBowlingLineParams,
  CreateJuniorBowlingLineBody,
  UpdateJuniorBowlingLineParams,
  UpdateJuniorBowlingLineBody,
  DeleteJuniorBowlingLineParams,
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
  ADMIN_JUNIOR_LINE_ID_BASE,
  serializeBattingLine,
  BATTING_STAT_COLS,
  serializeBowlingLine,
  BOWLING_STAT_COLS,
} from "../lib/junior-admin-helpers";
import { isCentralTenant } from "../lib/tenant";
import { isValidOversNotation, strikeRateOf, economyOf } from "../lib/junior-cricket";

/**
 * Juniors admin — batting and bowling line corrections.
 *
 * Create / update / delete of individual scorecard lines under
 * `/juniors/matches/:matchId/batting` and `/bowling`. Derived figures (strike
 * rate, economy) are recomputed server-side and stored in the journal patch so
 * the ETL re-apply stays dumb. See routes/juniors-admin.ts for the
 * write-through + journal model. Mounted there.
 */
const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Batting lines
// ---------------------------------------------------------------------------

router.post(
  "/juniors/matches/:matchId/batting",
  requireAdmin,
  juniorEditRateLimiter,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = CreateJuniorBattingLineParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = CreateJuniorBattingLineBody.safeParse(req.body);
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

    const runs = body.data.runs ?? null;
    const balls = body.data.balls ?? null;
    const values = {
      matchId: match.id,
      innings: body.data.innings,
      battingTeam: hhTeamName(match),
      isHallsHead: true,
      batOrder: body.data.batOrder ?? null,
      participantId: participant.participantId,
      playerName: participant.displayName,
      runs,
      balls,
      fours: body.data.fours ?? null,
      sixes: body.data.sixes ?? null,
      strikeRate: strikeRateOf(runs, balls),
      dismissal: body.data.dismissal ?? null,
    };

    const created = await db.transaction(async (tx) => {
      // Journal first: the new line's id derives from the journal id so the
      // ETL re-apply recreates it deterministically.
      const journalId = await journal(tx, {
        tenantId: getTenantId(req),
        targetTable: "junior_match_batting",
        targetId: "", // patched below once the id is known
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
        match_id: values.matchId,
        innings: values.innings,
        batting_team: values.battingTeam,
        is_halls_head: true,
        bat_order: values.batOrder,
        participant_id: values.participantId,
        player_name: values.playerName,
        runs: values.runs,
        balls: values.balls,
        fours: values.fours,
        sixes: values.sixes,
        strike_rate: values.strikeRate,
        dismissal: values.dismissal,
      };
      await tx
        .update(juniorStatCorrectionsTable)
        .set({ targetId: String(lineId), patch: fullRow })
        .where(eq(juniorStatCorrectionsTable.id, journalId));
      const [row] = await tx
        .insert(juniorMatchBattingTable)
        .values({ id: lineId, ...values })
        .returning();
      return row;
    });

    res.status(201).json(serializeBattingLine(created));
  },
);

router.patch(
  "/juniors/matches/:matchId/batting/:lineId",
  requireAdmin,
  juniorEditRateLimiter,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = UpdateJuniorBattingLineParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateJuniorBattingLineBody.safeParse(req.body);
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
    const [line] = await db
      .select()
      .from(juniorMatchBattingTable)
      .where(eq(juniorMatchBattingTable.id, params.data.lineId));
    if (!line || line.matchId !== match.id) {
      res.status(404).json({ error: "Batting line not found" });
      return;
    }

    const set: Record<string, unknown> = {};
    const patch: Record<string, unknown> = {};
    const prev: Record<string, unknown> = {};
    for (const [camel, snake] of Object.entries(BATTING_STAT_COLS)) {
      const value = (body.data as Record<string, unknown>)[camel];
      if (value === undefined) continue;
      set[camel] = value;
      patch[snake] = value;
      prev[snake] = (line as unknown as Record<string, unknown>)[camel] ?? null;
    }

    // Re-attribution: HH lines only, and the target must be a known
    // participant in this tenant (opposition lines have no participant row).
    if (body.data.participantId !== undefined) {
      if (!line.isHallsHead) {
        res.status(400).json({ error: "Only Halls Head lines can be re-attributed" });
        return;
      }
      const participant = await tenantParticipant(req, body.data.participantId);
      if (!participant) {
        res.status(404).json({ error: "Participant not found" });
        return;
      }
      set.participantId = participant.participantId;
      set.playerName = participant.displayName;
      patch.participant_id = participant.participantId;
      patch.player_name = participant.displayName;
      prev.participant_id = line.participantId;
      prev.player_name = line.playerName;
    }

    if (Object.keys(set).length === 0) {
      res.json(serializeBattingLine(line));
      return;
    }

    // Recompute the derived strike rate from the post-patch figures and store
    // it in the journal patch so the SQL re-apply never has to derive it.
    const nextRuns = (set.runs !== undefined ? set.runs : line.runs) as number | null;
    const nextBalls = (set.balls !== undefined ? set.balls : line.balls) as number | null;
    if (set.runs !== undefined || set.balls !== undefined) {
      const sr = strikeRateOf(nextRuns, nextBalls);
      set.strikeRate = sr;
      patch.strike_rate = sr;
      prev.strike_rate = line.strikeRate;
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(juniorMatchBattingTable)
        .set(set)
        .where(eq(juniorMatchBattingTable.id, line.id))
        .returning();
      await journal(tx, {
        tenantId: getTenantId(req),
        targetTable: "junior_match_batting",
        targetId: String(line.id),
        op: "update",
        patch,
        prevValues: prev,
        matchId: match.id,
        playhqMatchId: match.playhqMatchId,
        participantId: line.participantId,
        createdBy: adminName(req),
      });
      return row;
    });

    res.json(serializeBattingLine(updated));
  },
);

router.delete(
  "/juniors/matches/:matchId/batting/:lineId",
  requireAdmin,
  juniorEditRateLimiter,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = DeleteJuniorBattingLineParams.safeParse(req.params);
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
      .from(juniorMatchBattingTable)
      .where(eq(juniorMatchBattingTable.id, params.data.lineId));
    if (!line || line.matchId !== match.id) {
      res.status(404).json({ error: "Batting line not found" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.delete(juniorMatchBattingTable).where(eq(juniorMatchBattingTable.id, line.id));
      await journal(tx, {
        tenantId: getTenantId(req),
        targetTable: "junior_match_batting",
        targetId: String(line.id),
        op: "delete",
        patch: null,
        prevValues: {
          id: line.id,
          match_id: line.matchId,
          innings: line.innings,
          batting_team: line.battingTeam,
          is_halls_head: line.isHallsHead,
          bat_order: line.batOrder,
          participant_id: line.participantId,
          player_name: line.playerName,
          runs: line.runs,
          balls: line.balls,
          fours: line.fours,
          sixes: line.sixes,
          strike_rate: line.strikeRate,
          dismissal: line.dismissal,
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

// ---------------------------------------------------------------------------
// Bowling lines
// ---------------------------------------------------------------------------

router.post(
  "/juniors/matches/:matchId/bowling",
  requireAdmin,
  juniorEditRateLimiter,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = CreateJuniorBowlingLineParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = CreateJuniorBowlingLineBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (body.data.overs != null && !isValidOversNotation(body.data.overs)) {
      res.status(400).json({
        error: "overs must be cricket ball notation (fractional digit 0-5)",
      });
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

    const overs = body.data.overs ?? null;
    const runs = body.data.runs ?? null;
    const values = {
      matchId: match.id,
      innings: body.data.innings,
      bowlingTeam: hhTeamName(match),
      isHallsHead: true,
      participantId: participant.participantId,
      playerName: participant.displayName,
      overs,
      maidens: body.data.maidens ?? null,
      runs,
      wickets: body.data.wickets ?? null,
      economy: economyOf(runs, overs),
      wides: body.data.wides ?? null,
      noBalls: body.data.noBalls ?? null,
    };

    const created = await db.transaction(async (tx) => {
      const journalId = await journal(tx, {
        tenantId: getTenantId(req),
        targetTable: "junior_match_bowling",
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
        match_id: values.matchId,
        innings: values.innings,
        bowling_team: values.bowlingTeam,
        is_halls_head: true,
        participant_id: values.participantId,
        player_name: values.playerName,
        overs: values.overs,
        maidens: values.maidens,
        runs: values.runs,
        wickets: values.wickets,
        economy: values.economy,
        wides: values.wides,
        no_balls: values.noBalls,
      };
      await tx
        .update(juniorStatCorrectionsTable)
        .set({ targetId: String(lineId), patch: fullRow })
        .where(eq(juniorStatCorrectionsTable.id, journalId));
      const [row] = await tx
        .insert(juniorMatchBowlingTable)
        .values({ id: lineId, ...values })
        .returning();
      return row;
    });

    res.status(201).json(serializeBowlingLine(created));
  },
);

router.patch(
  "/juniors/matches/:matchId/bowling/:lineId",
  requireAdmin,
  juniorEditRateLimiter,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = UpdateJuniorBowlingLineParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateJuniorBowlingLineBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (body.data.overs != null && !isValidOversNotation(body.data.overs)) {
      res.status(400).json({
        error: "overs must be cricket ball notation (fractional digit 0-5)",
      });
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
      .from(juniorMatchBowlingTable)
      .where(eq(juniorMatchBowlingTable.id, params.data.lineId));
    if (!line || line.matchId !== match.id) {
      res.status(404).json({ error: "Bowling line not found" });
      return;
    }

    const set: Record<string, unknown> = {};
    const patch: Record<string, unknown> = {};
    const prev: Record<string, unknown> = {};
    for (const [camel, snake] of Object.entries(BOWLING_STAT_COLS)) {
      const value = (body.data as Record<string, unknown>)[camel];
      if (value === undefined) continue;
      set[camel] = value;
      patch[snake] = value;
      prev[snake] = (line as unknown as Record<string, unknown>)[camel] ?? null;
    }

    if (body.data.participantId !== undefined) {
      if (!line.isHallsHead) {
        res.status(400).json({ error: "Only Halls Head lines can be re-attributed" });
        return;
      }
      const participant = await tenantParticipant(req, body.data.participantId);
      if (!participant) {
        res.status(404).json({ error: "Participant not found" });
        return;
      }
      set.participantId = participant.participantId;
      set.playerName = participant.displayName;
      patch.participant_id = participant.participantId;
      patch.player_name = participant.displayName;
      prev.participant_id = line.participantId;
      prev.player_name = line.playerName;
    }

    if (Object.keys(set).length === 0) {
      res.json(serializeBowlingLine(line));
      return;
    }

    const nextRuns = (set.runs !== undefined ? set.runs : line.runs) as number | null;
    const nextOvers = (set.overs !== undefined ? set.overs : line.overs) as number | null;
    if (set.runs !== undefined || set.overs !== undefined) {
      const econ = economyOf(nextRuns, nextOvers);
      set.economy = econ;
      patch.economy = econ;
      prev.economy = line.economy;
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(juniorMatchBowlingTable)
        .set(set)
        .where(eq(juniorMatchBowlingTable.id, line.id))
        .returning();
      await journal(tx, {
        tenantId: getTenantId(req),
        targetTable: "junior_match_bowling",
        targetId: String(line.id),
        op: "update",
        patch,
        prevValues: prev,
        matchId: match.id,
        playhqMatchId: match.playhqMatchId,
        participantId: line.participantId,
        createdBy: adminName(req),
      });
      return row;
    });

    res.json(serializeBowlingLine(updated));
  },
);

router.delete(
  "/juniors/matches/:matchId/bowling/:lineId",
  requireAdmin,
  juniorEditRateLimiter,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = DeleteJuniorBowlingLineParams.safeParse(req.params);
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
      .from(juniorMatchBowlingTable)
      .where(eq(juniorMatchBowlingTable.id, params.data.lineId));
    if (!line || line.matchId !== match.id) {
      res.status(404).json({ error: "Bowling line not found" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.delete(juniorMatchBowlingTable).where(eq(juniorMatchBowlingTable.id, line.id));
      await journal(tx, {
        tenantId: getTenantId(req),
        targetTable: "junior_match_bowling",
        targetId: String(line.id),
        op: "delete",
        patch: null,
        prevValues: {
          id: line.id,
          match_id: line.matchId,
          innings: line.innings,
          bowling_team: line.bowlingTeam,
          is_halls_head: line.isHallsHead,
          participant_id: line.participantId,
          player_name: line.playerName,
          overs: line.overs,
          maidens: line.maidens,
          runs: line.runs,
          wickets: line.wickets,
          economy: line.economy,
          wides: line.wides,
          no_balls: line.noBalls,
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
