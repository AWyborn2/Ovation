import { and, eq } from "drizzle-orm";
import {
  db,
  juniorMatchesTable,
  juniorParticipantsTable,
  juniorStatCorrectionsTable,
  type JuniorMatchRow,
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
