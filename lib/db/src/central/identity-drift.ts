import { eq } from "drizzle-orm";
import {
  centralDb,
  centralFieldingTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
} from "../central";

/**
 * Every participant GUID that has a line for the club in central RIGHT NOW:
 * roster ∪ batting ∪ bowling ∪ fielding, any grade, any season (hybrid stats
 * plan U17). The identity drift check compares a tenant's stored GUIDs
 * (crosswalk, merges) against this set to find the ones a central reload
 * dropped or re-keyed.
 *
 * Deliberately UNCACHED (like ./corrections): the check exists to see central
 * as it is after a reload, not as it was a cache window ago. It is a wider set
 * than `centralClubParticipants` (the mint source, which has no fielding) so a
 * fielding-only link is never reported as drift. Existence only — no figures
 * are read, so junior lines count as "still there" without blending any
 * junior stats.
 */
export async function centralClubParticipantIdsNow(clubId: number): Promise<Set<string>> {
  const [rosters, batting, bowling, fielding] = await Promise.all([
    centralDb
      .selectDistinct({ participantId: centralMatchRostersTable.participantId })
      .from(centralMatchRostersTable)
      .where(eq(centralMatchRostersTable.clubId, clubId)),
    centralDb
      .selectDistinct({ participantId: centralMatchBattingTable.participantId })
      .from(centralMatchBattingTable)
      .where(eq(centralMatchBattingTable.clubId, clubId)),
    centralDb
      .selectDistinct({ participantId: centralMatchBowlingTable.participantId })
      .from(centralMatchBowlingTable)
      .where(eq(centralMatchBowlingTable.clubId, clubId)),
    centralDb
      .selectDistinct({ participantId: centralFieldingTable.participantId })
      .from(centralFieldingTable)
      .where(eq(centralFieldingTable.clubId, clubId)),
  ]);
  const out = new Set<string>();
  for (const r of [...rosters, ...batting, ...bowling, ...fielding]) {
    if (r.participantId) out.add(r.participantId);
  }
  return out;
}
