import { eq, and } from "drizzle-orm";
import { db, juniorParticipantsTable, juniorMatchesTable } from "@workspace/db";

const MASK_NAME = "Private Player";

export { MASK_NAME };

export async function getPrivateIds(tenantId: number): Promise<Set<string>> {
  const rows = await db
    .select({ id: juniorParticipantsTable.participantId })
    .from(juniorParticipantsTable)
    .where(
      and(
        eq(juniorParticipantsTable.tenantId, tenantId),
        eq(juniorParticipantsTable.isPrivate, true),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

type MatchRow = typeof juniorMatchesTable.$inferSelect;

export function splitScores(m: MatchRow): {
  hhScore: string | null;
  opponentScore: string | null;
} {
  if (m.opponentName && m.team1 && m.team1 === m.opponentName) {
    return { hhScore: m.team2Score ?? null, opponentScore: m.team1Score ?? null };
  }
  return { hhScore: m.team1Score ?? null, opponentScore: m.team2Score ?? null };
}
