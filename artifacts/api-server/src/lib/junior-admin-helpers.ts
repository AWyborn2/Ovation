import { and, eq, sql } from "drizzle-orm";
import {
  db,
  juniorMatchesTable,
  juniorMatchBattingTable,
  juniorMatchBowlingTable,
  juniorMatchRostersTable,
  juniorParticipantsTable,
  juniorStatCorrectionsTable,
  type JuniorMatchRow,
  type JuniorMatchBattingRow,
  type JuniorMatchBowlingRow,
  type JuniorMatchRosterRow,
  type JuniorStatCorrectionRow,
} from "@workspace/db";
import { getTenantId } from "../middlewares/tenant-context";
import type { RequestWithAdmin } from "../middlewares/require-admin";

/**
 * Shared helpers for the juniors admin (stat-correction) routes.
 *
 * Extracted from `routes/juniors-admin.ts`, which had grown past 1,600 lines
 * with match detail, leaderboards, participant CRUD, corrections and profile
 * merging in one file. These are the pieces every handler in there reaches for:
 * the correction journal, tenant-scoped lookups, and match serialisation.
 *
 * They only depend on the db layer and request context — never on a route — so
 * this cannot introduce an import cycle back into the router. Same pattern as
 * the existing `junior-helpers.ts`.
 */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type JournalEntry = {
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

/**
 * Record a correction in `junior_stat_corrections`. The junior tables are
 * wholesale-replaced by every ETL reload, so this journal is what makes an
 * admin's fix survive the next load — and doubles as the audit trail and the
 * revert source.
 */
export async function journal(tx: Tx, entry: JournalEntry): Promise<number> {
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

export function adminName(req: RequestWithAdmin): string | null {
  return req.admin?.username ?? null;
}

/** Resolve a junior match in the requesting tenant, or null. */
export async function tenantMatch(
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
export function hhTeamName(m: JuniorMatchRow): string | null {
  if (m.opponentName && m.team1 && m.team1 === m.opponentName) {
    return m.team2;
  }
  return m.team1;
}

/** Resolve an in-tenant, existing junior participant, or null. */
export async function tenantParticipant(
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

/** camelCase → snake_case column map for journalled junior_matches patches. */
export const MATCH_COLS = {
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

export function serializeMatchMeta(m: JuniorMatchRow) {
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

/** snake_case → camelCase, for reading journalled patches back out. */
export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Admin-created line ids live far above the dump's id range so a future dump
 * can never collide with them; derived from the journal id so ETL re-apply
 * reproduces the same id deterministically. */
export const ADMIN_JUNIOR_LINE_ID_BASE = 100_000_000;

export function serializeBattingLine(l: JuniorMatchBattingRow) {
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

export const BATTING_STAT_COLS = {
  runs: "runs",
  balls: "balls",
  fours: "fours",
  sixes: "sixes",
  dismissal: "dismissal",
  batOrder: "bat_order",
} as const;

export function serializeBowlingLine(l: JuniorMatchBowlingRow) {
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

export const BOWLING_STAT_COLS = {
  overs: "overs",
  maidens: "maidens",
  runs: "runs",
  wickets: "wickets",
  wides: "wides",
  noBalls: "no_balls",
} as const;

export function serializeRosterEntry(l: JuniorMatchRosterRow) {
  return {
    id: l.id,
    matchId: l.matchId,
    participantId: l.participantId,
    playerName: l.playerName,
  };
}

/** Recompute a keeper's stored dump-derived metadata from its live lines.
 * The ETL copies these columns verbatim from the dump and never recomputes
 * them, so after a merge they must be refreshed here. The SQL mirrors ETL
 * step 7f (set-based there, single-GUID here) — keep the two in sync. */
export async function recomputeParticipantMetadata(
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

export function serializeCorrection(c: JuniorStatCorrectionRow) {
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

/** Column-name maps for applying a revert's snake_case pre-image back onto the
 * Drizzle camelCase tables. */
export const SNAKE_TO_TABLE = {
  junior_matches: juniorMatchesTable,
  junior_match_batting: juniorMatchBattingTable,
  junior_match_bowling: juniorMatchBowlingTable,
  junior_match_rosters: juniorMatchRostersTable,
  junior_participants: juniorParticipantsTable,
} as const;
