import { and, asc, eq } from "drizzle-orm";
import { squadMemberParticipantsTable, squadMembersTable } from "@workspace/db";
import type { db, SquadSection } from "@workspace/db";
import {
  memberDisplayName,
  normaliseParticipantId,
  type ParticipantCrosswalk,
} from "./availability-grades";

/**
 * The club's remembered PlayHQ matches (`squad_member_participants`, ADR-008):
 * which squad member a PlayHQ participant GUID is. A "Private Player" row on a
 * PlayHQ team list carries no name to match, but it usually carries the GUID,
 * so once an admin has matched it in the Hub the member matcher resolves it
 * first (`buildMemberMatcher`). Tenant-scoped throughout; a row only changes
 * later matching, never a side already drafted.
 */

type Reader = Pick<typeof db, "select">;

/** The tenant's crosswalk, keyed by normalised participant GUID. */
export async function loadParticipantCrosswalk(
  reader: Reader,
  tenantId: number,
): Promise<ParticipantCrosswalk> {
  const rows = await reader
    .select({
      participantId: squadMemberParticipantsTable.participantId,
      memberId: squadMemberParticipantsTable.memberId,
    })
    .from(squadMemberParticipantsTable)
    .where(eq(squadMemberParticipantsTable.tenantId, tenantId));
  const out = new Map<string, number>();
  for (const r of rows) {
    const key = normaliseParticipantId(r.participantId);
    if (key) out.set(key, r.memberId);
  }
  return out;
}

type Writer = Pick<typeof db, "insert" | "delete">;

/**
 * Remember (or re-point) a participant GUID as this member. Returns the
 * member it pointed at before, or null when it is new.
 */
export async function rememberParticipant(
  writer: Writer & Reader,
  tenantId: number,
  participantId: string,
  memberId: number,
  createdBy: string | null,
  now: Date = new Date(),
): Promise<{ previousMemberId: number | null }> {
  const key = normaliseParticipantId(participantId);
  if (!key) throw new RangeError("rememberParticipant: blank participant id");
  const [before] = await writer
    .select({ memberId: squadMemberParticipantsTable.memberId })
    .from(squadMemberParticipantsTable)
    .where(
      and(
        eq(squadMemberParticipantsTable.tenantId, tenantId),
        eq(squadMemberParticipantsTable.participantId, key),
      ),
    );
  await writer
    .insert(squadMemberParticipantsTable)
    .values({ tenantId, participantId: key, memberId, createdBy, createdAt: now })
    .onConflictDoUpdate({
      target: [squadMemberParticipantsTable.tenantId, squadMemberParticipantsTable.participantId],
      set: { memberId, createdBy, createdAt: now },
    });
  return { previousMemberId: before?.memberId ?? null };
}

/** Forget a member's remembered participant GUID. True when a row was removed. */
export async function forgetParticipant(
  writer: Writer,
  tenantId: number,
  memberId: number,
  participantId: string,
): Promise<boolean> {
  const key = normaliseParticipantId(participantId);
  if (!key) return false;
  const removed = await writer
    .delete(squadMemberParticipantsTable)
    .where(
      and(
        eq(squadMemberParticipantsTable.tenantId, tenantId),
        eq(squadMemberParticipantsTable.memberId, memberId),
        eq(squadMemberParticipantsTable.participantId, key),
      ),
    )
    .returning({ id: squadMemberParticipantsTable.id });
  return removed.length > 0;
}

export type ParticipantMatch = {
  participantId: string;
  memberId: number;
  memberName: string;
  createdBy: string | null;
  createdAt: Date;
};

/**
 * The club's remembered matches a section's board shows: junior members' on
 * the junior board; every member's on the senior board, as its pool includes
 * juniors playing up. By member surname.
 */
export async function loadParticipantMatches(
  reader: Reader,
  tenantId: number,
  section: SquadSection,
): Promise<ParticipantMatch[]> {
  const rows = await reader
    .select({
      participantId: squadMemberParticipantsTable.participantId,
      memberId: squadMemberParticipantsTable.memberId,
      createdBy: squadMemberParticipantsTable.createdBy,
      createdAt: squadMemberParticipantsTable.createdAt,
      firstName: squadMembersTable.firstName,
      lastName: squadMembersTable.lastName,
      preferredName: squadMembersTable.preferredName,
    })
    .from(squadMemberParticipantsTable)
    .innerJoin(
      squadMembersTable,
      and(
        eq(squadMembersTable.id, squadMemberParticipantsTable.memberId),
        eq(squadMembersTable.tenantId, squadMemberParticipantsTable.tenantId),
      ),
    )
    .where(
      and(
        eq(squadMemberParticipantsTable.tenantId, tenantId),
        section === "junior" ? eq(squadMembersTable.section, "junior") : undefined,
      ),
    )
    .orderBy(asc(squadMembersTable.lastName), asc(squadMembersTable.firstName));
  return rows.map((r) => ({
    participantId: r.participantId,
    memberId: r.memberId,
    memberName: memberDisplayName(r),
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  }));
}
