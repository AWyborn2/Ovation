import { and, eq, sql } from "drizzle-orm";
import {
  db,
  selectionsTable,
  squadMembersTable,
  shirtNumbersTable,
  type SelectionRow,
  type SquadMemberRow,
  type TeamListPlayer,
  type TeamListRow,
} from "@workspace/db";
import { normaliseParticipantId } from "@workspace/db/shirt-numbers";
import { seasonStartYearFor } from "@workspace/db/seasons";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import { isUnder18OnDate, memberDisplayName, perthDate } from "./availability-grades";
import { normaliseSlots, SIDE_SIZE, TWELFTH_INDEX } from "./selection-drafts";

export const PRIVATE_PLAYER = "Private Player";

type PrivacyFields = Pick<SquadMemberRow, "isPrivate"> &
  Partial<Pick<SquadMemberRow, "showNamePublicly" | "section" | "dateOfBirth">>;

/**
 * Whether a member is named on the club's public surfaces (published team list,
 * site, social cards). A public member always is. A private member is only when
 * an admin turned on `showNamePublicly`, and never a junior or under-18 member
 * (ADR-008): junior privacy stays with ADR-007. The Hub and the team sheet show
 * real names regardless. A reader that doesn't select the flag reads it as off.
 */
export function namedPublicly(m: PrivacyFields, now: Date = new Date()): boolean {
  if (!m.isPrivate) return true;
  if (m.showNamePublicly !== true || m.section !== "senior") return false;
  return isUnder18OnDate(m.dateOfBirth, perthDate(now)) !== true;
}

/** The name a member goes by on public surfaces: their own, or "Private Player". */
export function publicName(
  m: PrivacyFields & Pick<SquadMemberRow, "firstName" | "lastName" | "preferredName">,
  now?: Date,
): string {
  return namedPublicly(m, now) ? memberDisplayName(m) : PRIVATE_PLAYER;
}

type PublishedMember = Pick<
  SquadMemberRow,
  "id" | "firstName" | "lastName" | "preferredName" | "isPrivate" | "linkedPlayerId"
> &
  Partial<Pick<SquadMemberRow, "showNamePublicly" | "section" | "dateOfBirth">>;
type PublishedSide = Pick<SelectionRow, "slots" | "captainMemberId" | "keeperMemberId">;
const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Profile IDs are NOT participant GUIDs. Never copy that field into a team list.
 * The season register is the authority: linked members use its player link.
 * For Held members require BOTH an exact ID hint and a unique full-name match
 * to the same register record. A name alone or an ID alone is not evidence.
 * Distinct IDs without a player link remain unresolved, not guessed.
 */
export async function loadSelectionParticipantIds(
  reader: Pick<typeof db, "select">,
  tenantId: number,
  startAt: Date,
): Promise<ReadonlyMap<number, string>> {
  const [registerRows, roster] = await Promise.all([
    reader
      .select({
        participantId: shirtNumbersTable.participantId,
        playerId: shirtNumbersTable.playerId,
        name: shirtNumbersTable.name,
      })
      .from(shirtNumbersTable)
      .where(
        and(
          eq(shirtNumbersTable.tenantId, tenantId),
          eq(shirtNumbersTable.season, seasonStartYearFor(startAt)),
        ),
      ),
    reader
      .select({
        id: squadMembersTable.id,
        firstName: squadMembersTable.firstName,
        lastName: squadMembersTable.lastName,
        preferredName: squadMembersTable.preferredName,
        linkedPlayerId: squadMembersTable.linkedPlayerId,
        playhqProfileId: squadMembersTable.playhqProfileId,
        isPrivate: squadMembersTable.isPrivate,
        section: squadMembersTable.section,
      })
      .from(squadMembersTable)
      .where(eq(squadMembersTable.tenantId, tenantId)),
  ]);
  // One person on both senior registers (men and female, migration 0047) is one
  // candidate, not two: collapse rows that are the same entry in another category.
  const seenEntry = new Set<string>();
  const register = registerRows.filter((r) => {
    const key = `${r.playerId ?? ""}|${normaliseParticipantId(r.participantId) ?? ""}|${nameKey(r.name)}`;
    if (seenEntry.has(key)) return false;
    seenEntry.add(key);
    return true;
  });
  const namesOf = (m: (typeof roster)[number]) =>
    new Set([nameKey(memberDisplayName(m)), nameKey(`${m.firstName.trim()} ${m.lastName.trim()}`)]);
  const owners = new Map<string, Set<number>>();
  for (const m of roster)
    for (const key of namesOf(m)) {
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key)!.add(m.id);
    }
  const result = new Map<number, string>();
  for (const m of roster) {
    if (
      m.section !== "senior" ||
      m.isPrivate ||
      (m.linkedPlayerId != null && m.linkedPlayerId >= FILL_IN_THRESHOLD)
    )
      continue;
    let candidates;
    if (m.linkedPlayerId != null) {
      candidates = register.filter((r) => r.playerId === m.linkedPlayerId);
    } else {
      const names = namesOf(m);
      // First require a unique register/roster full name, then corroborate its
      // identity hint. The returned ID comes from the register, never the CSV.
      candidates = register.filter((r) => names.has(nameKey(r.name)));
      if (
        candidates.length !== 1 ||
        owners.get(nameKey(candidates[0].name))?.size !== 1 ||
        candidates[0].playerId != null ||
        !normaliseParticipantId(m.playhqProfileId) ||
        normaliseParticipantId(candidates[0].participantId) !==
          normaliseParticipantId(m.playhqProfileId)
      )
        continue;
    }
    if (candidates.length !== 1) continue;
    const participantId = normaliseParticipantId(candidates[0].participantId);
    if (participantId) result.set(m.id, participantId);
  }
  return result;
}

/** The same projection is used at publication and to verify legacy snapshots. */
export function selectionPublishedPlayers(
  side: PublishedSide,
  members: readonly PublishedMember[],
  participantIds: ReadonlyMap<number, string> = new Map(),
): TeamListPlayer[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const players: TeamListPlayer[] = [];
  normaliseSlots(side.slots).forEach((slot, index) => {
    const m = slot.memberId == null ? undefined : byId.get(slot.memberId);
    if (!m) return;
    const twelfth = index === TWELFTH_INDEX;
    const c = !twelfth && side.captainMemberId === m.id;
    const wk = !twelfth && side.keeperMemberId === m.id;
    const role = c && wk ? "C/WK" : c ? "C" : wk ? "WK" : undefined;
    const eligible =
      !m.isPrivate && (m.linkedPlayerId == null || m.linkedPlayerId < FILL_IN_THRESHOLD);
    const participantId = eligible ? participantIds.get(m.id) : null;
    players.push({
      order: twelfth ? SIDE_SIZE : players.length + 1,
      ...(eligible && m.linkedPlayerId != null ? { playerId: m.linkedPlayerId } : {}),
      ...(participantId ? { participantId } : {}),
      displayName: publicName(m),
      ...(role ? { role } : {}),
    });
  });
  return players;
}

type PublishedList = Pick<
  TeamListRow,
  "tenantId" | "fixtureId" | "source" | "isPublished" | "players"
>;
const needsIdentity = (p: TeamListPlayer) =>
  p.playerId == null &&
  !normaliseParticipantId(p.participantId) &&
  p.displayName !== PRIVATE_PLAYER;

/**
 * Read-time compatibility for old Selection Hub publications. The published list
 * stays authoritative: add identity only after the entire finalised lineup agrees.
 * Never use a draft, names from a club-wide search, or mutate a saved publication.
 */
export async function recoverPublishedSelectionIdentities(
  tenantId: number,
  list: PublishedList,
  startAt: Date,
): Promise<{ players: TeamListPlayer[]; warning?: string }> {
  const unchanged = { players: list.players };
  if (
    list.tenantId !== tenantId ||
    list.source !== "selection" ||
    !list.isPublished ||
    !list.players.some(needsIdentity)
  )
    return unchanged;
  const refused = {
    ...unchanged,
    warning:
      "Some playing numbers could not be verified against the finalised selection. Check and re-finalise this side in Selection Hub.",
  };
  // A single statement gives a consistent selection/member snapshot even while
  // another admin reopens the side. Only these non-contact columns are read (the
  // date of birth only to keep an under-18's name masked, as at publication).
  const rows = await db
    .select({
      side: selectionsTable,
      member: {
        id: squadMembersTable.id,
        firstName: squadMembersTable.firstName,
        lastName: squadMembersTable.lastName,
        preferredName: squadMembersTable.preferredName,
        isPrivate: squadMembersTable.isPrivate,
        showNamePublicly: squadMembersTable.showNamePublicly,
        section: squadMembersTable.section,
        dateOfBirth: squadMembersTable.dateOfBirth,
        linkedPlayerId: squadMembersTable.linkedPlayerId,
      },
    })
    .from(selectionsTable)
    .innerJoin(
      squadMembersTable,
      and(
        eq(squadMembersTable.tenantId, selectionsTable.tenantId),
        sql`${squadMembersTable.id} IN (
      SELECT (slot->>'memberId')::integer FROM jsonb_array_elements(${selectionsTable.slots}) slot
    )`,
      ),
    )
    .where(
      and(
        eq(selectionsTable.tenantId, tenantId),
        eq(selectionsTable.fixtureId, list.fixtureId),
        eq(selectionsTable.state, "final"),
      ),
    );
  const side = rows[0]?.side;
  if (!side?.finalisedAt) return refused;
  const ids = side.slots.flatMap((s) => (s.memberId == null ? [] : [s.memberId]));
  if (new Set(ids).size !== ids.length || rows.length !== ids.length) return refused;
  const participantIds = await loadSelectionParticipantIds(db, tenantId, startAt);
  const expected = selectionPublishedPlayers(
    side,
    rows.map((r) => r.member),
    participantIds,
  );
  const published = [...list.players].sort((a, b) => a.order - b.order);
  if (
    expected.length !== published.length ||
    new Set(published.map((p) => p.order)).size !== published.length ||
    expected.some((p, i) => {
      const old = published[i];
      return (
        p.order !== old.order ||
        p.displayName !== old.displayName ||
        (p.role ?? null) !== (old.role ?? null) ||
        (p.playerId ?? null) !== (old.playerId ?? null) ||
        (!!normaliseParticipantId(old.participantId) &&
          normaliseParticipantId(p.participantId) !== normaliseParticipantId(old.participantId))
      );
    })
  )
    return refused;
  // Same-name legacy rows lack enough evidence to choose between identities.
  const counts = new Map<string, number>();
  for (const p of published)
    counts.set(nameKey(p.displayName), (counts.get(nameKey(p.displayName)) ?? 0) + 1);
  const byOrder = new Map(expected.map((p) => [p.order, p]));
  let unresolved = false;
  const players = list.players.map((p) => {
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
