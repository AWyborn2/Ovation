import { and, eq } from "drizzle-orm";
import {
  db,
  selectionEventsTable,
  selectionsTable,
  squadMembersTable,
  type AvailabilityStatus,
  type SquadSection,
} from "@workspace/db";
import type { SelectionActor } from "../middlewares/require-admin-or-captain";
import { writeReplies } from "./availability-replies";
import { fixtureSection, memberDisplayName, perthDate, perthDow } from "./availability-grades";
import {
  ensureRound,
  findRound,
  loadAvailabilitySettings,
  loadRoundDates,
} from "./availability-schedule";
import { loadSideFixtures, sideFixtureKey, sideSection } from "./selection-fixtures";
import { SelectionError, assertRoundOpen, weekendIsPast } from "./selection-board";

/**
 * An answer an admin or captain was given in person or by phone, recorded in
 * the Selection Hub (ADR-008 §3). It is written as the member's reply for every
 * date of the weekend's round they're asked about or picked on, marked as set
 * by the caller; the member's own later answer from their link replaces it.
 * Works whether or not the club uses availability requests.
 */

export const ROUND_CLOSED = "That weekend has passed. Its round is read-only.";

/**
 * May this actor record answers for members of `section`? Admins always;
 * captains when the club's rule lets them pick a side of that section.
 */
function mayRecord(
  actor: SelectionActor,
  rule: "admins_only" | "captains_own_grade" | "captains_all_grades",
  section: SquadSection,
): boolean {
  if (actor.kind === "admin") return true;
  if (rule === "admins_only") return false;
  if (rule === "captains_all_grades") return true;
  return actor.grades.some((g) => fixtureSection(g) === section);
}

export async function setMemberStatus(
  tenantId: number,
  actor: SelectionActor,
  memberId: number,
  input: { weekend: string; status: AvailabilityStatus; note?: string | null },
  now: Date = new Date(),
): Promise<{ section: SquadSection; roundId: number; dates: string[] }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.weekend) || perthDow(input.weekend) !== 6) {
    throw new SelectionError(400, "The weekend is the round's Saturday (YYYY-MM-DD).");
  }
  const [member] = await db
    .select({
      id: squadMembersTable.id,
      firstName: squadMembersTable.firstName,
      lastName: squadMembersTable.lastName,
      preferredName: squadMembersTable.preferredName,
      gradeHint: squadMembersTable.gradeHint,
      linkedPlayerId: squadMembersTable.linkedPlayerId,
      active: squadMembersTable.active,
      section: squadMembersTable.section,
    })
    .from(squadMembersTable)
    .where(and(eq(squadMembersTable.tenantId, tenantId), eq(squadMembersTable.id, memberId)));
  if (!member) throw new SelectionError(404, "Squad member not found.");

  const settings = await loadAvailabilitySettings(tenantId);
  const rule = settings?.selectionRule ?? "captains_own_grade";
  if (!mayRecord(actor, rule, member.section)) {
    throw new SelectionError(
      403,
      member.section === "junior"
        ? "You can't record answers for junior players."
        : "You can't record answers for this section.",
    );
  }
  // The dates: those the member is asked about (their grade's fixtures that
  // weekend), plus those of any side they're picked in; failing both, every
  // date with a side in their section.
  // A past weekend is read-only, as on the board; its round is never created.
  const existing = await findRound(tenantId, input.weekend);
  if (existing) await assertRoundOpen(tenantId, existing.id, now);
  else if (await weekendIsPast(tenantId, input.weekend, now)) {
    throw new SelectionError(409, ROUND_CLOSED, "round_closed");
  }
  const sides = existing
    ? await db
        .select()
        .from(selectionsTable)
        .where(
          and(eq(selectionsTable.tenantId, tenantId), eq(selectionsTable.roundId, existing.id)),
        )
    : [];
  const fixtures = await loadSideFixtures(db, tenantId, sides);
  const dated = sides.flatMap((selection) => {
    const fixture = fixtures.get(sideFixtureKey(selection));
    return fixture ? [{ selection, fixture, date: perthDate(fixture.startAt) }] : [];
  });
  const picked = dated.filter((s) => s.selection.slots.some((slot) => slot.memberId === memberId));
  const asked = (await loadRoundDates(tenantId, input.weekend, [member])).get(memberId) ?? [];
  let dates = [...new Set([...asked, ...picked.map((s) => s.date)])];
  if (dates.length === 0) {
    dates = [
      ...new Set(dated.filter((s) => sideSection(s.fixture) === member.section).map((s) => s.date)),
    ];
  }
  if (dates.length === 0) {
    throw new SelectionError(409, "There are no fixtures for this player that weekend.");
  }
  dates.sort();

  const round = existing ?? (await ensureRound(tenantId, input.weekend));
  const note = input.note?.trim() || null;
  await writeReplies({
    tenantId,
    roundId: round.id,
    memberId,
    // An answer given in person replaces the whole answer, its note included.
    answers: dates.map((date) => ({ date, status: input.status, note })),
    late: round.cutoffCompletedAt != null,
    by: { source: "admin", adminId: actor.kind === "admin" ? actor.id : null, name: actor.name },
    now,
  });

  // Audited against each side the member is in, or the round when in none.
  const detail = {
    memberId,
    name: memberDisplayName(member),
    section: member.section,
    status: input.status,
    note,
    dates,
  };
  const base = {
    tenantId,
    roundId: round.id,
    actorKind: actor.kind,
    actorId: actor.id,
    actorName: actor.name,
    action: "status_set",
    createdAt: now,
  };
  await db
    .insert(selectionEventsTable)
    .values(
      picked.length > 0
        ? picked.map((s) => ({ ...base, selectionId: s.selection.id, detail }))
        : [{ ...base, selectionId: null, detail }],
    );
  return { section: member.section, roundId: round.id, dates };
}
