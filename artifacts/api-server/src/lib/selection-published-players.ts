import { and, eq, sql } from "drizzle-orm";
import { db, selectionsTable, squadMembersTable, type SelectionRow, type SquadMemberRow,
  type TeamListPlayer, type TeamListRow } from "@workspace/db";
import { normaliseParticipantId } from "@workspace/db/shirt-numbers";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import { memberDisplayName } from "./availability-grades";
import { normaliseSlots, SIDE_SIZE, TWELFTH_INDEX } from "./selection-drafts";

export const PRIVATE_PLAYER = "Private Player";
type PublishedMember = Pick<SquadMemberRow, "id" | "firstName" | "lastName" | "preferredName" |
  "isPrivate" | "linkedPlayerId" | "playhqProfileId">;
type PublishedSide = Pick<SelectionRow, "slots" | "captainMemberId" | "keeperMemberId">;

/** The same projection is used at publication and to verify legacy snapshots. */
export function selectionPublishedPlayers(side: PublishedSide, members: readonly PublishedMember[]): TeamListPlayer[] {
  const byId = new Map(members.map(m => [m.id, m]));
  const players: TeamListPlayer[] = [];
  normaliseSlots(side.slots).forEach((slot, index) => {
    const m = slot.memberId == null ? undefined : byId.get(slot.memberId);
    if (!m) return;
    const twelfth = index === TWELFTH_INDEX;
    const c = !twelfth && side.captainMemberId === m.id;
    const wk = !twelfth && side.keeperMemberId === m.id;
    const role = c && wk ? "C/WK" : c ? "C" : wk ? "WK" : undefined;
    const eligible = !m.isPrivate && (m.linkedPlayerId == null || m.linkedPlayerId < FILL_IN_THRESHOLD);
    const participantId = eligible ? normaliseParticipantId(m.playhqProfileId) : null;
    players.push({
      order: twelfth ? SIDE_SIZE : players.length + 1,
      ...(eligible && m.linkedPlayerId != null ? { playerId: m.linkedPlayerId } : {}),
      ...(participantId ? { participantId } : {}),
      displayName: m.isPrivate ? PRIVATE_PLAYER : memberDisplayName(m),
      ...(role ? { role } : {}),
    });
  });
  return players;
}

type PublishedList = Pick<TeamListRow, "tenantId" | "fixtureId" | "source" | "isPublished" | "players">;
const needsIdentity = (p: TeamListPlayer) =>
  p.playerId == null && !normaliseParticipantId(p.participantId) && p.displayName !== PRIVATE_PLAYER;

/**
 * Read-time compatibility for old Selection Hub publications. The published list
 * stays authoritative: add identity only after the entire finalised lineup agrees.
 * Never use a draft, names from a club-wide search, or mutate a saved publication.
 */
export async function recoverPublishedSelectionIdentities(tenantId: number, list: PublishedList):
Promise<{ players: TeamListPlayer[]; warning?: string }> {
  const unchanged = { players: list.players };
  if (list.tenantId !== tenantId || list.source !== "selection" || !list.isPublished ||
    !list.players.some(needsIdentity)) return unchanged;
  const refused = { ...unchanged, warning: "Some playing numbers could not be verified against the finalised selection. Check and re-finalise this side in Selection Hub." };
  // A single statement gives a consistent selection/member snapshot even while
  // another admin reopens the side. Only these non-contact columns are read.
  const rows = await db.select({
    side: selectionsTable,
    member: {
      id: squadMembersTable.id, firstName: squadMembersTable.firstName,
      lastName: squadMembersTable.lastName, preferredName: squadMembersTable.preferredName,
      isPrivate: squadMembersTable.isPrivate, linkedPlayerId: squadMembersTable.linkedPlayerId,
      playhqProfileId: squadMembersTable.playhqProfileId,
    },
  }).from(selectionsTable).innerJoin(squadMembersTable, and(
    eq(squadMembersTable.tenantId, selectionsTable.tenantId),
    sql`${squadMembersTable.id} IN (
      SELECT (slot->>'memberId')::integer FROM jsonb_array_elements(${selectionsTable.slots}) slot
    )`,
  )).where(and(eq(selectionsTable.tenantId, tenantId),
    eq(selectionsTable.fixtureId, list.fixtureId), eq(selectionsTable.state, "final")));
  const side = rows[0]?.side;
  if (!side?.finalisedAt) return refused;
  const ids = side.slots.flatMap(s => s.memberId == null ? [] : [s.memberId]);
  if (new Set(ids).size !== ids.length || rows.length !== ids.length) return refused;
  const expected = selectionPublishedPlayers(side, rows.map(r => r.member));
  const published = [...list.players].sort((a, b) => a.order - b.order);
  if (expected.length !== published.length || new Set(published.map(p => p.order)).size !== published.length ||
    expected.some((p, i) => {
      const old = published[i];
      return p.order !== old.order || p.displayName !== old.displayName ||
        (p.role ?? null) !== (old.role ?? null) || (p.playerId ?? null) !== (old.playerId ?? null) ||
        (!!normaliseParticipantId(old.participantId) &&
          normaliseParticipantId(p.participantId) !== normaliseParticipantId(old.participantId));
    })) return refused;
  // Same-name legacy rows lack enough evidence to choose between identities.
  const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
  const counts = new Map<string, number>();
  for (const p of published) counts.set(nameKey(p.displayName), (counts.get(nameKey(p.displayName)) ?? 0) + 1);
  const byOrder = new Map(expected.map(p => [p.order, p]));
  let unresolved = false;
  const players = list.players.map(p => {
    if (!needsIdentity(p)) return p;
    const verified = byOrder.get(p.order)!;
    if (counts.get(nameKey(p.displayName)) !== 1 || !verified.participantId) {
      unresolved = true;
      return p;
    }
    return { ...p, participantId: verified.participantId };
  });
  return { players, ...(unresolved ? { warning: refused.warning } : {}) };
}
