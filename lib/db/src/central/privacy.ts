import { desc, eq, ilike } from "drizzle-orm";
import { centralDb, centralPlayersTable } from "../central";
import { foldPlayerNames, hasMerges, mergeGroupMembers, type CentralMerges } from "./merges";
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
//       centralGradeDistribution                       (ranks / "% of club best")
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

/** True when ANY of the participants is private — a merged group's privacy (KTD2). */
export async function isPrivateGroup(participantIds: readonly string[]): Promise<boolean> {
  if (participantIds.length === 0) return false;
  if (participantIds.length === 1) return isPrivateParticipant(participantIds[0]!);
  const rows = await centralDb
    .select({ isPrivate: centralPlayersTable.isPrivate })
    .from(centralPlayersTable)
    .where(inList(centralPlayersTable.participantId, [...participantIds]));
  return rows.some((r) => isPrivateRow(r));
}

/**
 * Display name + privacy for a set of participants, one round trip. Used by the
 * honour-board reads (centuries, five-fors, milestones) whose id lists can span
 * every participant a club ever fielded — hence the array-bound `inList`.
 *
 * With `merges`, `ids` are keepers: each keeps its own display name and is
 * private when any GUID merged into it is (the group is read in the same trip).
 */
export async function centralPlayerNames(
  ids: string[],
  merges?: CentralMerges | null,
): Promise<Map<string, { displayName: string | null; isPrivate: boolean }>> {
  if (ids.length === 0) return new Map();
  const lookup = hasMerges(merges) ? mergeGroupMembers(ids, merges) : ids;
  const players = await centralDb
    .select({
      participantId: centralPlayersTable.participantId,
      displayName: centralPlayersTable.displayName,
      isPrivate: centralPlayersTable.isPrivate,
    })
    .from(centralPlayersTable)
    .where(inList(centralPlayersTable.participantId, lookup));
  const byId = new Map(
    players.map((p) => [
      p.participantId,
      { displayName: p.displayName, isPrivate: isPrivateRow(p) },
    ]),
  );
  return hasMerges(merges) ? new Map(foldPlayerNames(byId, merges)) : byId;
}

/**
 * Keepers with a PRIVATE GUID merged into them — for reads that resolve the
 * keeper's own privacy in SQL, so they can still mask/omit the whole group.
 * One round trip over the merged-away GUIDs; empty (no query) without merges.
 */
export async function mergedPrivateKeepers(merges?: CentralMerges | null): Promise<Set<string>> {
  const out = new Set<string>();
  if (!hasMerges(merges)) return out;
  const rows = await centralDb
    .select({
      participantId: centralPlayersTable.participantId,
      isPrivate: centralPlayersTable.isPrivate,
    })
    .from(centralPlayersTable)
    .where(inList(centralPlayersTable.participantId, [...merges.keys()]));
  for (const r of rows) {
    const keeper = merges.get(r.participantId);
    if (keeper && isPrivateRow(r)) out.add(keeper);
  }
  return out;
}

/** One row of the platform privacy screen's player search (P8). */
export interface CentralPlayerPrivacyRow {
  participantId: string;
  displayName: string | null;
  isPrivate: boolean;
  currentClubId: number | null;
  lastSeason: string | null;
  matches: number | null;
}

/**
 * Platform-admin player search for the privacy override screen
 * (docs/plans/2026-10-04-001-feat-playhq-central-projection-plan.md, P8): by participant GUID,
 * or case-insensitively by display name. Uncached — the screen shows the flag just written.
 * Unlike every public read, it returns private players' names: only a platform admin sees it.
 */
export async function centralPlayersForPrivacy(
  query: string,
  limit = 25,
): Promise<CentralPlayerPrivacyRow[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
  const rows = await centralDb
    .select({
      participantId: centralPlayersTable.participantId,
      displayName: centralPlayersTable.displayName,
      isPrivate: centralPlayersTable.isPrivate,
      currentClubId: centralPlayersTable.currentClubId,
      lastSeason: centralPlayersTable.lastSeason,
      matches: centralPlayersTable.matches,
    })
    .from(centralPlayersTable)
    .where(
      isGuid
        ? eq(centralPlayersTable.participantId, q.toLowerCase())
        : ilike(centralPlayersTable.displayName, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`),
    )
    .orderBy(desc(centralPlayersTable.matches))
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows.map((r) => ({ ...r, isPrivate: isPrivateRow(r) }));
}
