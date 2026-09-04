import { eq } from "drizzle-orm";
import { centralDb, centralPlayersTable } from "../central";
import { inList } from "./where";

// ---------------------------------------------------------------------------
// Player privacy for central reads.
//
// `central.players.is_private` is an integer flag (1 = the participant opted
// out of public stats on PlayHQ). Every central read consults it through the
// helpers below — never by hand — and applies ONE of three treatments. The
// treatment is a property of the read's output shape, documented here so the
// policy is visible in one place. (Behaviour recorded as of the §5.1 split;
// none of it changed in the split.)
//
//  1. MASK — the row stays, the name becomes "Private Player":
//       centralGradeLeaderboard   (givenName "Private" / surname "Player", so
//                                  the club's own aggregate totals still add up)
//
//  2. OMIT — private players never appear in the output at all:
//       centralSeasonLeaders / centralAllTimeLeaders   (top-N then skip)
//       centralClubTotalsBySeason                      (per-grade leader picks)
//       centralClubRecords                             (holders + single-innings)
//       centralCenturies / centralFiveWicketHauls / centralMilestones
//       centralDashboard                               (top scorer/taker/fielder)
//       centralWeekendWrap                             (performer line only —
//                                                       the result line stays)
//       centralPlayerSeasons / centralPlayerMatchLog   (a private participant
//                                                       gets [] — same as no data)
//
//  3. FLAG — the row carries `isPrivate: boolean` and the CALLER masks (the API
//     route needs the GUID to build the crosswalk or the scorecard link, then
//     hides the name):
//       centralClubParticipants, centralPlayerCareers, centralPlayerDetail,
//       centralMatchScorecard (club-side `lines`)
//
// Rule of thumb for new reads: public-facing aggregates OMIT, identity/mapping
// reads FLAG, and MASK is reserved for the leaderboard contract that needs the
// totals to reconcile.
// ---------------------------------------------------------------------------

/** The subset of a `central.players` row the privacy check needs. */
export interface PrivacyRow {
  isPrivate: number | null;
}

/**
 * True when a `central.players` row (or the absence of one) marks the
 * participant private. Missing/unknown players are treated as public, which is
 * what every read did with its hand-written `(p?.isPrivate ?? 0) === 1`.
 */
export function isPrivateRow(p: PrivacyRow | null | undefined): boolean {
  return (p?.isPrivate ?? 0) === 1;
}

/** Private players get no public career breakdown ([] — same as no data). */
export async function isPrivateParticipant(participantId: string): Promise<boolean> {
  const [p] = await centralDb
    .select({ isPrivate: centralPlayersTable.isPrivate })
    .from(centralPlayersTable)
    .where(eq(centralPlayersTable.participantId, participantId));
  return isPrivateRow(p);
}

/**
 * Display name + privacy for a set of participants, one round trip. Used by the
 * honour-board reads (centuries, five-fors, milestones) whose id lists can span
 * every participant a club ever fielded — hence the array-bound `inList`.
 */
export async function centralPlayerNames(
  ids: string[],
): Promise<Map<string, { displayName: string | null; isPrivate: boolean }>> {
  if (ids.length === 0) return new Map();
  const players = await centralDb
    .select({
      participantId: centralPlayersTable.participantId,
      displayName: centralPlayersTable.displayName,
      isPrivate: centralPlayersTable.isPrivate,
    })
    .from(centralPlayersTable)
    .where(inList(centralPlayersTable.participantId, ids));
  return new Map(
    players.map((p) => [
      p.participantId,
      { displayName: p.displayName, isPrivate: isPrivateRow(p) },
    ]),
  );
}
