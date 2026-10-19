import {
  db,
  availabilityResponsesTable,
  type AvailabilityStatus,
  type RecipientSlot,
  type ReplySource,
} from "@workspace/db";

/**
 * The one write path for availability answers: a member's own answer from their
 * link, or an answer an admin or captain recorded in the Selection Hub after being
 * told in person or by phone (ADR-008). One row per (round, member, date); the
 * latest answer wins, so a member's own later answer replaces an admin-set one and
 * clears who set it.
 */

export type ReplyAnswer = {
  date: string;
  status: AvailabilityStatus;
  /** Undefined leaves a stored note as it is; null or blank clears it. */
  note?: string | null;
};

export type ReplyWriter =
  | { source: "member"; slot: RecipientSlot | null }
  | { source: "admin"; adminId: number | null; name: string };

export async function writeReplies(input: {
  tenantId: number;
  roundId: number;
  memberId: number;
  answers: ReplyAnswer[];
  /** After the round's cut-off. */
  late: boolean;
  by: ReplyWriter;
  now: Date;
}): Promise<void> {
  const { tenantId, roundId, memberId, late, by, now } = input;
  const source: ReplySource = by.source;
  const who =
    by.source === "member"
      ? { respondedBySlot: by.slot, setByAdminId: null, setByName: null }
      : { respondedBySlot: null, setByAdminId: by.adminId, setByName: by.name };
  for (const a of input.answers) {
    const note = a.note === undefined ? undefined : a.note?.trim() || null;
    await db
      .insert(availabilityResponsesTable)
      .values({
        tenantId,
        roundId,
        memberId,
        date: a.date,
        status: a.status,
        note: note ?? null,
        respondedAt: now,
        late,
        source,
        ...who,
      })
      .onConflictDoUpdate({
        target: [
          availabilityResponsesTable.roundId,
          availabilityResponsesTable.memberId,
          availabilityResponsesTable.date,
        ],
        set: {
          status: a.status,
          ...(note !== undefined ? { note } : {}),
          respondedAt: now,
          late,
          source,
          ...who,
        },
      });
  }
}
