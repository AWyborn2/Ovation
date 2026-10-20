import { and, asc, eq } from "drizzle-orm";
import {
  db,
  selectionEventsTable,
  selectionsTable,
  squadMembersTable,
  type SquadSection,
} from "@workspace/db";
import { memberDisplayName } from "./availability-grades";
import {
  DEFAULT_SCHEDULE,
  ensureRound,
  findRound,
  loadAvailabilitySettings,
  roundWeekendFor,
} from "./availability-schedule";
import { forgetParticipant, rememberParticipant } from "./participant-crosswalk";
import { SelectionError, assertRoundOpen, canRemind, selectionRight } from "./selection-board";
import { normaliseSlots } from "@workspace/scorecard/selection-shape";
import { gameWindow } from "./selection-drafts";
import { loadSideFixtures, sideFixtureKey, sideSection } from "./selection-fixtures";
import type { SelectionActor } from "../middlewares/require-admin-or-captain";

/**
 * "Match to squad member" in the Selection Hub (ADR-008 §4). A PlayHQ list row
 * the matcher couldn't place — usually one PlayHQ names only "Private
 * Player" — leaves a gap "not on register". An admin or a captain who may edit
 * the side picks the member it is: the slot is filled and, when the gap
 * carries the row's PlayHQ participant GUID, the club remembers the match in
 * `squad_member_participants`, so the next draft or PlayHQ sync resolves that
 * player on its own. "Unmatch" forgets it; sides already drafted keep their
 * slots. Both are logged as `selection_events`.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function settingsOf(tenantId: number) {
  const settings = await loadAvailabilitySettings(tenantId);
  return {
    rule: settings?.selectionRule ?? "captains_own_grade",
    currentWeekend: (now: Date) => roundWeekendFor(settings ?? DEFAULT_SCHEDULE, now),
  };
}

/**
 * Fill gap `slot` (1–12) of a side with `memberId`. Throws `SelectionError`,
 * writing nothing, for: a side not found (404); a side the actor may not edit
 * (403); a finalised side, a stale version or a past weekend's round (409);
 * a slot that isn't an unmatched row, or a member who is unknown, inactive,
 * outside the side's section (a junior side takes juniors only; a senior
 * side may take a junior playing up, as its pool does), already in the side,
 * or in another side of the round at the same time (400).
 */
export async function matchSelectionSlot(
  tenantId: number,
  actor: SelectionActor,
  selectionId: number,
  input: { slot: number; memberId: number; version: number },
  now: Date = new Date(),
): Promise<{ section: SquadSection; remembered: boolean }> {
  const { rule } = await settingsOf(tenantId);
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ roundId: selectionsTable.roundId })
      .from(selectionsTable)
      .where(and(eq(selectionsTable.tenantId, tenantId), eq(selectionsTable.id, selectionId)));
    if (!target) throw new SelectionError(404, "Side not found.");
    await assertRoundOpen(tenantId, target.roundId, now);
    // Every side of the round, locked, for the clash check.
    const rows = await tx
      .select()
      .from(selectionsTable)
      .where(
        and(eq(selectionsTable.tenantId, tenantId), eq(selectionsTable.roundId, target.roundId)),
      )
      .orderBy(asc(selectionsTable.id))
      .for("update");
    const fixtures = await loadSideFixtures(tx, tenantId, rows);
    const selection = rows.find((r) => r.id === selectionId);
    const fixture = selection ? fixtures.get(sideFixtureKey(selection)) : undefined;
    if (!selection || !fixture) throw new SelectionError(404, "Side not found.");

    const right = selectionRight(actor, rule, fixture.grade);
    if (!right.allowed) {
      throw new SelectionError(403, `${fixture.grade} is read-only to you. ${right.reason}`);
    }
    if (selection.state === "final") {
      throw new SelectionError(409, `${fixture.grade} is finalised. Re-open it to make changes.`);
    }
    if (selection.version !== input.version) {
      throw new SelectionError(
        409,
        `${fixture.grade} was changed by someone else. Reload to see the latest side.`,
      );
    }
    const slots = normaliseSlots(selection.slots);
    const index = input.slot - 1;
    const gap = slots[index]?.memberId == null ? slots[index]?.gap : undefined;
    if (!gap || gap.reason !== "not_on_register") {
      throw new SelectionError(400, "That slot isn't a player waiting to be matched.");
    }

    const [member] = await tx
      .select({
        id: squadMembersTable.id,
        firstName: squadMembersTable.firstName,
        lastName: squadMembersTable.lastName,
        preferredName: squadMembersTable.preferredName,
        active: squadMembersTable.active,
        section: squadMembersTable.section,
      })
      .from(squadMembersTable)
      .where(
        and(eq(squadMembersTable.tenantId, tenantId), eq(squadMembersTable.id, input.memberId)),
      );
    if (!member) throw new SelectionError(400, "That player isn't on the club's register.");
    const name = memberDisplayName(member);
    if (!member.active) throw new SelectionError(400, `${name} isn't an active squad member.`);
    const section = sideSection(fixture);
    if (section === "junior" && member.section !== "junior") {
      throw new SelectionError(400, `${name} isn't on the junior register.`);
    }
    if (slots.some((s) => s.memberId === member.id)) {
      throw new SelectionError(400, `${name} is already in ${fixture.grade}.`);
    }
    const window = gameWindow(fixture.startAt, {
      format: fixture.senior?.matchFormat ?? null,
      junior: fixture.kind === "junior",
    });
    for (const other of rows) {
      if (other.id === selection.id) continue;
      if (!other.slots.some((s) => s.memberId === member.id)) continue;
      const f = fixtures.get(sideFixtureKey(other));
      if (!f) continue;
      const w = gameWindow(f.startAt, {
        format: f.senior?.matchFormat ?? null,
        junior: f.kind === "junior",
      });
      if (w.from < window.to && window.from < w.to) {
        throw new SelectionError(400, `${name} is already in ${f.grade} at the same time.`);
      }
    }

    slots[index] = { memberId: member.id };
    await tx
      .update(selectionsTable)
      .set({ slots, version: selection.version + 1, updatedAt: now })
      .where(and(eq(selectionsTable.id, selection.id), eq(selectionsTable.tenantId, tenantId)));

    const participantId = gap.participantId ?? null;
    let previousMemberId: number | null = null;
    if (participantId) {
      ({ previousMemberId } = await rememberParticipant(
        tx,
        tenantId,
        participantId,
        member.id,
        actor.name,
        now,
      ));
    }
    await tx.insert(selectionEventsTable).values({
      tenantId,
      selectionId: selection.id,
      roundId: selection.roundId,
      actorKind: actor.kind,
      actorId: actor.id,
      actorName: actor.name,
      action: "match",
      detail: {
        slot: input.slot,
        listName: gap.name,
        member: { id: member.id, name },
        remembered: participantId != null,
        ...(participantId ? { participantId } : {}),
        ...(previousMemberId != null && previousMemberId !== member.id
          ? { replacedMemberId: previousMemberId }
          : {}),
      },
      createdAt: now,
    });
    return { section, remembered: participantId != null };
  });
}

/** The round an unmatch is logged against: the club's current weekend's. */
async function currentRoundId(tenantId: number, weekend: string): Promise<number> {
  return ((await findRound(tenantId, weekend)) ?? (await ensureRound(tenantId, weekend))).id;
}

/**
 * Forget the club's remembered match from `participantId` to member
 * `memberId`. Only later matching changes. Throws `SelectionError`: 403 for a
 * captain who picks no side at this club, 404 when the member isn't the
 * club's or has no such match.
 */
export async function unmatchParticipant(
  tenantId: number,
  actor: SelectionActor,
  memberId: number,
  participantId: string,
  now: Date = new Date(),
): Promise<{ section: SquadSection }> {
  const { rule, currentWeekend } = await settingsOf(tenantId);
  if (!canRemind(actor, rule)) {
    throw new SelectionError(403, "Only those who pick sides can change remembered matches.");
  }
  const roundId = await currentRoundId(tenantId, currentWeekend(now));
  return db.transaction(async (tx: Tx) => {
    const [member] = await tx
      .select({
        id: squadMembersTable.id,
        firstName: squadMembersTable.firstName,
        lastName: squadMembersTable.lastName,
        preferredName: squadMembersTable.preferredName,
        section: squadMembersTable.section,
      })
      .from(squadMembersTable)
      .where(and(eq(squadMembersTable.tenantId, tenantId), eq(squadMembersTable.id, memberId)));
    if (!member) throw new SelectionError(404, "No such match for this player.");
    const removed = await forgetParticipant(tx, tenantId, member.id, participantId);
    if (!removed) throw new SelectionError(404, "No such match for this player.");
    await tx.insert(selectionEventsTable).values({
      tenantId,
      roundId,
      actorKind: actor.kind,
      actorId: actor.id,
      actorName: actor.name,
      action: "unmatch",
      detail: {
        member: { id: member.id, name: memberDisplayName(member) },
        participantId: participantId.trim().toLowerCase(),
      },
      createdAt: now,
    });
    return { section: member.section };
  });
}
