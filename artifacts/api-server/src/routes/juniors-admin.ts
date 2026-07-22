import { Router, type IRouter } from "express";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  db,
  juniorMatchesTable,
  juniorMatchBattingTable,
  juniorMatchBowlingTable,
  juniorMatchRostersTable,
  juniorParticipantsTable,
  juniorPremiershipPlayersTable,
  juniorOfficeBearersTable,
  juniorStatCorrectionsTable,
  juniorParticipantMergesTable,
  type JuniorMatchRow,
  type JuniorMatchBattingRow,
  type JuniorMatchBowlingRow,
  type JuniorMatchRosterRow,
  type JuniorStatCorrectionRow,
} from "@workspace/db";
import {
  UpdateJuniorMatchParams,
  UpdateJuniorMatchBody,
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
  AddJuniorRosterEntryParams,
  AddJuniorRosterEntryBody,
  RemoveJuniorRosterEntryParams,
  UpdateJuniorParticipantParams,
  UpdateJuniorParticipantBody,
  MergeJuniorParticipantParams,
  MergeJuniorParticipantBody,
  ListJuniorStatCorrectionsQueryParams,
  RevertJuniorStatCorrectionParams,
} from "@workspace/api-zod";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { adminWriteRateLimiter } from "../middlewares/rate-limit";
import { getTenantId } from "../middlewares/tenant-context";
import { shouldReadCentral } from "../lib/tenant";
import {
  isValidOversNotation,
  strikeRateOf,
  economyOf,
} from "../lib/junior-cricket";

/**
 * JUNIORS ADMIN (stat-correction) API. The junior_* tables are read-only dump
 * data fully replaced by every juniors ETL reload, so admins could never fix
 * source errors — until this module. Each endpoint is write-through + journal:
 *
 *   1. the target junior row is updated directly, so every live-computed
 *      junior aggregate (leaderboards, profiles, dashboards) is immediately
 *      correct with no recompute step; and
 *   2. the change is recorded in junior_stat_corrections (with a pre-image),
 *      which the ETL re-applies after its full replace — corrections survive
 *      reloads, and the journal doubles as the audit trail + revert source.
 *
 * The juniors-isolation rule holds: nothing here reads or writes a senior
 * table, and junior figures never feed a senior surface. Derived figures
 * (strike rate, economy) are recomputed server-side and stored in the journal
 * patch so the SQL re-apply stays dumb.
 */
const router: IRouter = Router();

/** Admin-created line ids live far above the dump's id range so a future dump
 * can never collide with them; derived from the journal id so ETL re-apply
 * reproduces the same id deterministically. */
const ADMIN_JUNIOR_LINE_ID_BASE = 100_000_000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type JournalEntry = {
  tenantId: number;
  targetTable:
    | "junior_matches"
    | "junior_match_batting"
    | "junior_match_bowling"
    | "junior_match_rosters"
    | "junior_participants";
  targetId: string;
  op: "update" | "insert" | "delete";
  patch: Record<string, unknown> | null;
  prevValues: Record<string, unknown> | null;
  matchId?: number | null;
  playhqMatchId?: string | null;
  participantId?: string | null;
  createdBy?: string | null;
};

async function journal(tx: Tx, entry: JournalEntry): Promise<number> {
  const [row] = await tx
    .insert(juniorStatCorrectionsTable)
    .values({
      tenantId: entry.tenantId,
      targetTable: entry.targetTable,
      targetId: entry.targetId,
      op: entry.op,
      patch: entry.patch,
      prevValues: entry.prevValues,
      matchId: entry.matchId ?? null,
      playhqMatchId: entry.playhqMatchId ?? null,
      participantId: entry.participantId ?? null,
      createdBy: entry.createdBy ?? null,
    })
    .returning({ id: juniorStatCorrectionsTable.id });
  return row.id;
}

function adminName(req: RequestWithAdmin): string | null {
  return req.admin?.username ?? null;
}

/** Resolve a junior match in the requesting tenant, or null. */
async function tenantMatch(
  req: RequestWithAdmin,
  matchId: number,
): Promise<JuniorMatchRow | null> {
  const [match] = await db
    .select()
    .from(juniorMatchesTable)
    .where(
      and(
        eq(juniorMatchesTable.id, matchId),
        eq(juniorMatchesTable.tenantId, getTenantId(req)),
      ),
    );
  return match ?? null;
}

/** The Halls Head side's team name, mirroring splitScores in juniors.ts. */
function hhTeamName(m: JuniorMatchRow): string | null {
  if (m.opponentName && m.team1 && m.team1 === m.opponentName) {
    return m.team2;
  }
  return m.team1;
}

/** Resolve an in-tenant, existing junior participant, or null. */
async function tenantParticipant(
  req: RequestWithAdmin,
  participantId: string,
): Promise<{ participantId: string; displayName: string | null } | null> {
  const [p] = await db
    .select({
      participantId: juniorParticipantsTable.participantId,
      displayName: juniorParticipantsTable.displayName,
    })
    .from(juniorParticipantsTable)
    .where(
      and(
        eq(juniorParticipantsTable.participantId, participantId),
        eq(juniorParticipantsTable.tenantId, getTenantId(req)),
      ),
    );
  return p ?? null;
}

// ---------------------------------------------------------------------------
// PATCH /juniors/matches/:id — correct match metadata
// ---------------------------------------------------------------------------

/** camelCase → snake_case column map for journalled junior_matches patches. */
const MATCH_COLS = {
  team1Score: "team1_score",
  team2Score: "team2_score",
  hhResult: "hh_result",
  winner: "winner",
  tossWinner: "toss_winner",
  hhBattedFirst: "hh_batted_first",
  status: "status",
  matchDate: "match_date",
  round: "round",
  venue: "venue",
} as const;

function serializeMatchMeta(m: JuniorMatchRow) {
  return {
    id: m.id,
    team1: m.team1,
    team2: m.team2,
    team1Score: m.team1Score,
    team2Score: m.team2Score,
    hhResult: m.hhResult,
    winner: m.winner,
    tossWinner: m.tossWinner,
    hhBattedFirst: m.hhBattedFirst,
    status: m.status,
    matchDate: m.matchDate,
    round: m.round,
    venue: m.venue,
  };
}

router.patch(
  "/juniors/matches/:id",
  requireAdmin,
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
    if (await shouldReadCentral(req)) {
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
// Batting lines
// ---------------------------------------------------------------------------

function serializeBattingLine(l: JuniorMatchBattingRow) {
  return {
    id: l.id,
    matchId: l.matchId,
    innings: l.innings,
    batOrder: l.batOrder,
    participantId: l.participantId,
    playerName: l.playerName,
    runs: l.runs,
    balls: l.balls,
    fours: l.fours,
    sixes: l.sixes,
    strikeRate: l.strikeRate,
    dismissal: l.dismissal,
  };
}

const BATTING_STAT_COLS = {
  runs: "runs",
  balls: "balls",
  fours: "fours",
  sixes: "sixes",
  dismissal: "dismissal",
  batOrder: "bat_order",
} as const;

router.post(
  "/juniors/matches/:matchId/batting",
  requireAdmin,
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
    if (await shouldReadCentral(req)) {
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
    if (await shouldReadCentral(req)) {
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
        res
          .status(400)
          .json({ error: "Only Halls Head lines can be re-attributed" });
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
    const nextRuns = (set.runs !== undefined ? set.runs : line.runs) as
      | number
      | null;
    const nextBalls = (set.balls !== undefined ? set.balls : line.balls) as
      | number
      | null;
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
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = DeleteJuniorBattingLineParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (await shouldReadCentral(req)) {
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
      await tx
        .delete(juniorMatchBattingTable)
        .where(eq(juniorMatchBattingTable.id, line.id));
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

function serializeBowlingLine(l: JuniorMatchBowlingRow) {
  return {
    id: l.id,
    matchId: l.matchId,
    innings: l.innings,
    participantId: l.participantId,
    playerName: l.playerName,
    overs: l.overs,
    maidens: l.maidens,
    runs: l.runs,
    wickets: l.wickets,
    economy: l.economy,
    wides: l.wides,
    noBalls: l.noBalls,
  };
}

const BOWLING_STAT_COLS = {
  overs: "overs",
  maidens: "maidens",
  runs: "runs",
  wickets: "wickets",
  wides: "wides",
  noBalls: "no_balls",
} as const;

router.post(
  "/juniors/matches/:matchId/bowling",
  requireAdmin,
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
    if (await shouldReadCentral(req)) {
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
    if (await shouldReadCentral(req)) {
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
        res
          .status(400)
          .json({ error: "Only Halls Head lines can be re-attributed" });
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

    const nextRuns = (set.runs !== undefined ? set.runs : line.runs) as
      | number
      | null;
    const nextOvers = (set.overs !== undefined ? set.overs : line.overs) as
      | number
      | null;
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
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = DeleteJuniorBowlingLineParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (await shouldReadCentral(req)) {
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
      await tx
        .delete(juniorMatchBowlingTable)
        .where(eq(juniorMatchBowlingTable.id, line.id));
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

// ---------------------------------------------------------------------------
// Roster entries
// ---------------------------------------------------------------------------

function serializeRosterEntry(l: JuniorMatchRosterRow) {
  return {
    id: l.id,
    matchId: l.matchId,
    participantId: l.participantId,
    playerName: l.playerName,
  };
}

router.post(
  "/juniors/matches/:matchId/roster",
  requireAdmin,
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
    if (await shouldReadCentral(req)) {
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
    if (await shouldReadCentral(req)) {
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

// ---------------------------------------------------------------------------
// PATCH /juniors/participants/:id — display name / privacy corrections
// ---------------------------------------------------------------------------

router.patch(
  "/juniors/participants/:id",
  requireAdmin,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = UpdateJuniorParticipantParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateJuniorParticipantBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (await shouldReadCentral(req)) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }
    const [participant] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(
        and(
          eq(juniorParticipantsTable.participantId, params.data.id),
          eq(juniorParticipantsTable.tenantId, getTenantId(req)),
        ),
      );
    if (!participant) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }

    const set: Record<string, unknown> = {};
    const patch: Record<string, unknown> = {};
    const prev: Record<string, unknown> = {};
    if (body.data.displayName !== undefined) {
      set.displayName = body.data.displayName;
      patch.display_name = body.data.displayName;
      prev.display_name = participant.displayName;
    }
    if (body.data.isPrivate !== undefined) {
      set.isPrivate = body.data.isPrivate;
      patch.is_private = body.data.isPrivate;
      prev.is_private = participant.isPrivate;
    }
    if (Object.keys(set).length === 0) {
      res.json({
        participantId: participant.participantId,
        displayName: participant.displayName ?? "",
        isPrivate: participant.isPrivate,
      });
      return;
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(juniorParticipantsTable)
        .set(set)
        .where(
          eq(juniorParticipantsTable.participantId, participant.participantId),
        )
        .returning();
      // A display-name change flows onto the participant's stored line names
      // so scorecards/rosters keep matching the directory. Journalled via the
      // participant patch only — the ETL re-apply refreshes line names from
      // the participant row the same way.
      if (body.data.displayName !== undefined) {
        await tx
          .update(juniorMatchBattingTable)
          .set({ playerName: body.data.displayName })
          .where(
            and(
              eq(
                juniorMatchBattingTable.participantId,
                participant.participantId,
              ),
              eq(juniorMatchBattingTable.isHallsHead, true),
            ),
          );
        await tx
          .update(juniorMatchBowlingTable)
          .set({ playerName: body.data.displayName })
          .where(
            and(
              eq(
                juniorMatchBowlingTable.participantId,
                participant.participantId,
              ),
              eq(juniorMatchBowlingTable.isHallsHead, true),
            ),
          );
        await tx
          .update(juniorMatchRostersTable)
          .set({ playerName: body.data.displayName })
          .where(
            and(
              eq(
                juniorMatchRostersTable.participantId,
                participant.participantId,
              ),
              eq(juniorMatchRostersTable.isHallsHead, true),
            ),
          );
      }
      await journal(tx, {
        tenantId: getTenantId(req),
        targetTable: "junior_participants",
        targetId: participant.participantId,
        op: "update",
        patch,
        prevValues: prev,
        participantId: participant.participantId,
        createdBy: adminName(req),
      });
      return row;
    });

    res.json({
      participantId: updated.participantId,
      displayName: updated.displayName ?? "",
      isPrivate: updated.isPrivate,
    });
  },
);

// ---------------------------------------------------------------------------
// POST /juniors/participants/:id/merge — absorb a duplicate junior profile
//
// PlayHQ occasionally minted two participant GUIDs for the same child. This
// PERMANENTLY merges the duplicate (:id) into the keeper: every junior line
// is reassigned, the duplicate profile row is deleted, and the merge is
// recorded in junior_participant_merges so the juniors ETL re-applies it
// after every full-replace reload (step 7) — without that record the dump
// would silently resurrect the duplicate. The map stays FLAT: absorbing a
// GUID that is itself a keeper re-points its merge rows to the new keeper.
// Requesting a keeper that has itself been merged away returns 409 with the
// canonical keeper rather than silently redirecting the merge.
// ---------------------------------------------------------------------------

/** Recompute a keeper's stored dump-derived metadata from its live lines.
 * The ETL copies these columns verbatim from the dump and never recomputes
 * them, so after a merge they must be refreshed here. The SQL mirrors ETL
 * step 7f (set-based there, single-GUID here) — keep the two in sync. */
async function recomputeParticipantMetadata(
  tx: Tx,
  participantId: string,
): Promise<void> {
  await tx.execute(sql`
    UPDATE junior_participants p SET
      scorecard_lines =
        (SELECT count(*) FROM junior_match_batting b
          WHERE b.participant_id = p.participant_id AND b.is_halls_head)
      + (SELECT count(*) FROM junior_match_bowling w
          WHERE w.participant_id = p.participant_id AND w.is_halls_head),
      roster_appearances =
        (SELECT count(*) FROM junior_match_rosters r
          WHERE r.participant_id = p.participant_id AND r.is_halls_head),
      first_season = (
        SELECT m.season FROM junior_matches m
        JOIN (
          SELECT match_id FROM junior_match_batting
            WHERE participant_id = p.participant_id AND is_halls_head
          UNION SELECT match_id FROM junior_match_bowling
            WHERE participant_id = p.participant_id AND is_halls_head
          UNION SELECT match_id FROM junior_match_rosters
            WHERE participant_id = p.participant_id AND is_halls_head
        ) t ON t.match_id = m.id
        WHERE m.season IS NOT NULL
        ORDER BY m.season_start_year ASC NULLS LAST LIMIT 1),
      last_season = (
        SELECT m.season FROM junior_matches m
        JOIN (
          SELECT match_id FROM junior_match_batting
            WHERE participant_id = p.participant_id AND is_halls_head
          UNION SELECT match_id FROM junior_match_bowling
            WHERE participant_id = p.participant_id AND is_halls_head
          UNION SELECT match_id FROM junior_match_rosters
            WHERE participant_id = p.participant_id AND is_halls_head
        ) t ON t.match_id = m.id
        WHERE m.season IS NOT NULL
        ORDER BY m.season_start_year DESC NULLS LAST LIMIT 1),
      teams = (
        SELECT string_agg(DISTINCT r.team_name, ', ' ORDER BY r.team_name)
        FROM junior_match_rosters r
        WHERE r.participant_id = p.participant_id AND r.is_halls_head
          AND r.team_name IS NOT NULL)
    WHERE p.participant_id = ${participantId}
  `);
}

router.post(
  "/juniors/participants/:id/merge",
  requireAdmin,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = MergeJuniorParticipantParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = MergeJuniorParticipantBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const duplicateId = params.data.id;
    const keeperId = body.data.keeperParticipantId;
    if (duplicateId === keeperId) {
      res.status(400).json({ error: "Cannot merge a profile into itself" });
      return;
    }
    if (await shouldReadCentral(req)) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }
    const tenantId = getTenantId(req);

    try {
      const result = await db.transaction(async (tx) => {
        const [dup] = await tx
          .select()
          .from(juniorParticipantsTable)
          .where(
            and(
              eq(juniorParticipantsTable.participantId, duplicateId),
              eq(juniorParticipantsTable.tenantId, tenantId),
            ),
          );
        if (!dup) throw new Error("__DUP_NOT_FOUND__");
        const [keeper] = await tx
          .select()
          .from(juniorParticipantsTable)
          .where(
            and(
              eq(juniorParticipantsTable.participantId, keeperId),
              eq(juniorParticipantsTable.tenantId, tenantId),
            ),
          );
        if (!keeper) {
          // A missing keeper that is a recorded duplicate means the client is
          // stale — refuse with the canonical keeper instead of silently
          // merging into a profile the admin never looked at.
          const [merged] = await tx
            .select({
              keeper: juniorParticipantMergesTable.keeperParticipantId,
            })
            .from(juniorParticipantMergesTable)
            .where(
              and(
                eq(juniorParticipantMergesTable.tenantId, tenantId),
                eq(
                  juniorParticipantMergesTable.duplicateParticipantId,
                  keeperId,
                ),
              ),
            );
          if (merged) {
            const err = new Error("__KEEPER_MERGED_AWAY__") as Error & {
              canonicalKeeper?: string;
            };
            err.canonicalKeeper = merged.keeper;
            throw err;
          }
          throw new Error("__KEEPER_NOT_FOUND__");
        }

        // Reassign every junior line from the duplicate to the keeper. The
        // HH flag is untouched — a line carrying this GUID is the same human
        // whichever side of the card it sits on.
        const batting = await tx
          .update(juniorMatchBattingTable)
          .set({ participantId: keeperId })
          .where(eq(juniorMatchBattingTable.participantId, duplicateId))
          .returning({ id: juniorMatchBattingTable.id });
        const bowling = await tx
          .update(juniorMatchBowlingTable)
          .set({ participantId: keeperId })
          .where(eq(juniorMatchBowlingTable.participantId, duplicateId))
          .returning({ id: juniorMatchBowlingTable.id });
        const rosters = await tx
          .update(juniorMatchRostersTable)
          .set({ participantId: keeperId })
          .where(eq(juniorMatchRostersTable.participantId, duplicateId))
          .returning({ id: juniorMatchRostersTable.id });

        // Same-match roster duplicates cannot double-count Games (canonical
        // figure is COUNT(DISTINCT match_id)) but are deduped for tidiness.
        const dedupedRes = await tx.execute(sql`
          DELETE FROM junior_match_rosters a
          USING junior_match_rosters b
          WHERE a.participant_id = ${keeperId}
            AND b.participant_id = ${keeperId}
            AND a.match_id = b.match_id
            AND a.id > b.id
        `);
        const rostersDeduped = Number(
          (dedupedRes as unknown as { rowCount?: number }).rowCount ?? 0,
        );

        const premPlayers = await tx
          .update(juniorPremiershipPlayersTable)
          .set({ participantId: keeperId })
          .where(eq(juniorPremiershipPlayersTable.participantId, duplicateId))
          .returning({ id: juniorPremiershipPlayersTable.id });
        await tx.execute(sql`
          DELETE FROM junior_premiership_players a
          USING junior_premiership_players b
          WHERE a.participant_id = ${keeperId}
            AND b.participant_id = ${keeperId}
            AND a.premiership_id = b.premiership_id
            AND a.id > b.id
        `);
        const officeBearers = await tx
          .update(juniorOfficeBearersTable)
          .set({ participantId: keeperId })
          .where(
            and(
              eq(juniorOfficeBearersTable.participantId, duplicateId),
              eq(juniorOfficeBearersTable.tenantId, tenantId),
            ),
          )
          .returning({ id: juniorOfficeBearersTable.id });

        // Keeper's directory name flows onto its (now combined) HH lines so
        // scorecards keep matching the directory — mirrors the rename
        // propagation in PATCH /juniors/participants/:id.
        if (keeper.displayName) {
          await tx
            .update(juniorMatchBattingTable)
            .set({ playerName: keeper.displayName })
            .where(
              and(
                eq(juniorMatchBattingTable.participantId, keeperId),
                eq(juniorMatchBattingTable.isHallsHead, true),
              ),
            );
          await tx
            .update(juniorMatchBowlingTable)
            .set({ playerName: keeper.displayName })
            .where(
              and(
                eq(juniorMatchBowlingTable.participantId, keeperId),
                eq(juniorMatchBowlingTable.isHallsHead, true),
              ),
            );
          await tx
            .update(juniorMatchRostersTable)
            .set({ playerName: keeper.displayName })
            .where(
              and(
                eq(juniorMatchRostersTable.participantId, keeperId),
                eq(juniorMatchRostersTable.isHallsHead, true),
              ),
            );
        }

        // Carry the senior cross-link (keeper's own wins) and privacy
        // (sticky: private if either side was private).
        const [updatedKeeper] = await tx
          .update(juniorParticipantsTable)
          .set({
            seniorPlayerId: keeper.seniorPlayerId ?? dup.seniorPlayerId,
            isPrivate: keeper.isPrivate || dup.isPrivate,
          })
          .where(eq(juniorParticipantsTable.participantId, keeperId))
          .returning();

        await recomputeParticipantMetadata(tx, keeperId);

        // Snapshot then delete the absorbed profile row.
        await tx
          .delete(juniorParticipantsTable)
          .where(eq(juniorParticipantsTable.participantId, duplicateId));

        // Keep the map flat: earlier merges that pointed at the duplicate now
        // point at the new keeper.
        await tx
          .update(juniorParticipantMergesTable)
          .set({ keeperParticipantId: keeperId })
          .where(
            and(
              eq(juniorParticipantMergesTable.tenantId, tenantId),
              eq(
                juniorParticipantMergesTable.keeperParticipantId,
                duplicateId,
              ),
            ),
          );

        await tx.insert(juniorParticipantMergesTable).values({
          tenantId,
          duplicateParticipantId: duplicateId,
          keeperParticipantId: keeperId,
          duplicateRow: {
            participant_id: dup.participantId,
            display_name: dup.displayName,
            is_private: dup.isPrivate,
            scorecard_lines: dup.scorecardLines,
            roster_appearances: dup.rosterAppearances,
            first_season: dup.firstSeason,
            last_season: dup.lastSeason,
            teams: dup.teams,
            senior_player_id: dup.seniorPlayerId,
          },
          createdBy: adminName(req),
        });

        return {
          keeper: updatedKeeper,
          counts: {
            batting: batting.length,
            bowling: bowling.length,
            rosters: rosters.length,
            rostersDeduped,
            premiershipPlayers: premPlayers.length,
            officeBearers: officeBearers.length,
          },
        };
      });

      res.json({
        keeperParticipantId: result.keeper.participantId,
        duplicateParticipantId: duplicateId,
        displayName: result.keeper.displayName ?? "",
        isPrivate: result.keeper.isPrivate,
        seniorPlayerId: result.keeper.seniorPlayerId,
        reassigned: result.counts,
      });
    } catch (err) {
      const e = err as Error & { canonicalKeeper?: string };
      if (e.message === "__DUP_NOT_FOUND__") {
        res.status(404).json({ error: "Duplicate participant not found" });
        return;
      }
      if (e.message === "__KEEPER_NOT_FOUND__") {
        res.status(404).json({ error: "Keeper participant not found" });
        return;
      }
      if (e.message === "__KEEPER_MERGED_AWAY__") {
        res.status(409).json({
          error:
            "The requested keeper has itself been merged away — retry with the canonical keeper",
          canonicalKeeperParticipantId: e.canonicalKeeper,
        });
        return;
      }
      throw err;
    }
  },
);

// ---------------------------------------------------------------------------
// Corrections journal — list + revert
// ---------------------------------------------------------------------------

function serializeCorrection(c: JuniorStatCorrectionRow) {
  return {
    id: c.id,
    targetTable: c.targetTable,
    targetId: c.targetId,
    op: c.op,
    patch: c.patch ?? null,
    prevValues: c.prevValues ?? null,
    matchId: c.matchId,
    playhqMatchId: c.playhqMatchId,
    participantId: c.participantId,
    note: c.note,
    createdBy: c.createdBy,
    createdAt: c.createdAt.toISOString(),
  };
}

router.get(
  "/juniors/corrections",
  requireAdmin,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const query = ListJuniorStatCorrectionsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    if (await shouldReadCentral(req)) {
      res.json([]);
      return;
    }
    const conds = [
      eq(juniorStatCorrectionsTable.tenantId, getTenantId(req)),
    ];
    if (query.data.matchId !== undefined) {
      conds.push(eq(juniorStatCorrectionsTable.matchId, query.data.matchId));
    }
    const rows = await db
      .select()
      .from(juniorStatCorrectionsTable)
      .where(and(...conds))
      .orderBy(desc(juniorStatCorrectionsTable.id));
    res.json(rows.map(serializeCorrection));
  },
);

/** Column-name maps for applying a revert's snake_case pre-image back onto the
 * Drizzle camelCase tables. */
const SNAKE_TO_TABLE = {
  junior_matches: juniorMatchesTable,
  junior_match_batting: juniorMatchBattingTable,
  junior_match_bowling: juniorMatchBowlingTable,
  junior_match_rosters: juniorMatchRostersTable,
  junior_participants: juniorParticipantsTable,
} as const;

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

router.delete(
  "/juniors/corrections/:id",
  requireAdmin,
  adminWriteRateLimiter,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = RevertJuniorStatCorrectionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (await shouldReadCentral(req)) {
      res.status(404).json({ error: "Correction not found" });
      return;
    }
    const tenantId = getTenantId(req);
    const [correction] = await db
      .select()
      .from(juniorStatCorrectionsTable)
      .where(
        and(
          eq(juniorStatCorrectionsTable.id, params.data.id),
          eq(juniorStatCorrectionsTable.tenantId, tenantId),
        ),
      );
    if (!correction) {
      res.status(404).json({ error: "Correction not found" });
      return;
    }

    // Reverts must run newest-first per target row: restoring an older
    // pre-image over a newer correction would silently wipe the newer edit.
    const [newer] = await db
      .select({ id: juniorStatCorrectionsTable.id })
      .from(juniorStatCorrectionsTable)
      .where(
        and(
          eq(juniorStatCorrectionsTable.tenantId, tenantId),
          eq(juniorStatCorrectionsTable.targetTable, correction.targetTable),
          eq(juniorStatCorrectionsTable.targetId, correction.targetId),
          gt(juniorStatCorrectionsTable.id, correction.id),
        ),
      );
    if (newer) {
      res.status(409).json({
        error:
          "A newer correction targets the same row — revert that one first",
      });
      return;
    }

    const table =
      SNAKE_TO_TABLE[correction.targetTable as keyof typeof SNAKE_TO_TABLE];
    if (!table) {
      res.status(500).json({ error: "Unknown correction target" });
      return;
    }

    await db.transaction(async (tx) => {
      if (correction.op === "update") {
        const prev = (correction.prevValues ?? {}) as Record<string, unknown>;
        const set: Record<string, unknown> = {};
        for (const [snake, value] of Object.entries(prev)) {
          set[snakeToCamel(snake)] = value;
        }
        if (Object.keys(set).length > 0) {
          if (correction.targetTable === "junior_participants") {
            await tx
              .update(juniorParticipantsTable)
              .set(set)
              .where(
                eq(
                  juniorParticipantsTable.participantId,
                  correction.targetId,
                ),
              );
          } else {
            await tx
              .update(table)
              .set(set)
              .where(
                eq(
                  (table as typeof juniorMatchesTable).id,
                  Number(correction.targetId),
                ),
              );
          }
        }
      } else if (correction.op === "insert") {
        // Undo a created row by deleting it.
        if (correction.targetTable !== "junior_participants") {
          await tx
            .delete(table)
            .where(
              eq(
                (table as typeof juniorMatchesTable).id,
                Number(correction.targetId),
              ),
            );
        }
      } else if (correction.op === "delete") {
        // Undo a deletion by re-inserting the full pre-image.
        const prev = (correction.prevValues ?? {}) as Record<string, unknown>;
        const values: Record<string, unknown> = {};
        for (const [snake, value] of Object.entries(prev)) {
          values[snakeToCamel(snake)] = value;
        }
        if (Object.keys(values).length > 0) {
          await tx
            .insert(table)
            .values(values as never)
            .onConflictDoNothing();
        }
      }
      await tx
        .delete(juniorStatCorrectionsTable)
        .where(eq(juniorStatCorrectionsTable.id, correction.id));
    });

    res.status(204).end();
  },
);

export default router;
