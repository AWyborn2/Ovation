import type { Request } from "express";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  db,
  availabilityResponsesTable,
  fixturesTable,
  selectionEventsTable,
  selectionsTable,
  squadMembersTable,
  teamListsTable,
  type AvailabilityRoundRow,
  type AvailabilityStatus,
  type FixtureRow,
  type SelectionRow,
  type SelectionRule,
  type SelectionSlot,
  type SquadMemberRow,
  type SquadSection,
  type TeamListPlayer,
} from "@workspace/db";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import {
  fixtureSection,
  memberDisplayName,
  memberGrades,
  normaliseName,
  perthDate,
  roundWindow,
  type GradeList,
} from "./availability-grades";
import {
  DEFAULT_SCHEDULE,
  datesForGrade,
  findRound,
  loadAvailabilitySettings,
  roundCounts,
  roundSlots,
  roundWeekendFor,
} from "./availability-schedule";
import { isUnder18, messageMember, notifyStaff } from "./availability-messaging";
import { SIDE_SIZE, loadResponses } from "./selection-drafts";
import type { SelectionActor } from "../middlewares/require-admin-or-captain";
import { logger as defaultLogger } from "./logger";

/**
 * The Selection Hub's board (plan 2026-10-06-002 U7; R19–R39, KTD6, KTD8,
 * KTD9; F2, F3).
 *
 * - `buildBoard` reads one section's view of the current round: the round
 *   header and counts, each side with its slots, roles and the caller's edit
 *   right, the pool of unplaced active members and the latest changes. Member
 *   summaries are built from explicitly listed non-contact columns, so no
 *   mobile or email can reach a captain (R6).
 * - `saveBoard` applies whole-side changes in one transaction with the round's
 *   sides locked (KTD8): rights, the final lock, versions, 11 slots and "no
 *   member twice in the round" are all checked before anything is written; a
 *   captain or keeper no longer in their side is cleared and logged (R38).
 * - `finaliseSelection` publishes a side as the fixture's team list (source
 *   "selection", KTD6) and messages only the members the change affects (R31,
 *   R32); `reopenSelection` returns it to draft and leaves the list alone.
 * - `withdrawFromSelection` is a selected player's "can't make it" (R33).
 *
 * Edit rights come from the club's selection rule (KTD9): admins edit any
 * side; captains edit their own grades, every grade, or none.
 */

type Logger = { warn: (obj: unknown, msg?: string) => void };

/** Who a `selection_events` row names (R29). */
export type EventActor = {
  kind: "admin" | "captain" | "player" | "system";
  id: number | null;
  name: string | null;
};

/** A refused board action, carried to the route as an HTTP status and message. */
export class SelectionError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "SelectionError";
  }
}

// --- Edit rights (KTD9) ---

/**
 * A grade label for comparison: lower case, spaces collapsed, and a trailing
 * "grade" dropped, so "A", "a grade" and "A Grade" are one grade.
 */
export function normaliseGrade(grade: string | null | undefined): string {
  return (grade ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ ?grade$/, "")
    .trim();
}

export type SelectionRight = { allowed: boolean; reason: string | null };

/**
 * May this actor change a side of `grade` under the club's rule? Ignores the
 * final lock: finalise and re-open use this same right.
 */
export function selectionRight(
  actor: SelectionActor,
  rule: SelectionRule,
  grade: string,
): SelectionRight {
  if (actor.kind === "admin") return { allowed: true, reason: null };
  if (rule === "admins_only") {
    return { allowed: false, reason: "Only admins pick sides at this club." };
  }
  if (rule === "captains_all_grades") return { allowed: true, reason: null };
  const own = normaliseGrade(grade);
  if (actor.grades.some((g) => normaliseGrade(g) === own)) return { allowed: true, reason: null };
  const yours = actor.grades.length > 0 ? actor.grades.join(", ") : "no grades";
  return {
    allowed: false,
    reason: `Captains pick their own grade only, and you captain ${yours}.`,
  };
}

/** May this actor remind non-responders (R28)? Anyone with an edit right somewhere. */
export function canRemind(actor: SelectionActor, rule: SelectionRule): boolean {
  if (actor.kind === "admin") return true;
  if (rule === "admins_only") return false;
  return rule === "captains_all_grades" || actor.grades.length > 0;
}

export function eventActor(actor: SelectionActor): EventActor {
  return { kind: actor.kind, id: actor.id, name: actor.name };
}

async function selectionRule(tenantId: number): Promise<SelectionRule> {
  return (await loadAvailabilitySettings(tenantId))?.selectionRule ?? "captains_own_grade";
}

// --- Board read ---

export type MemberStatus = AvailabilityStatus | "none";

export type BoardMember = {
  id: number;
  displayName: string;
  status: MemberStatus;
  note: string | null;
  lastGrade: string | null;
  junior: boolean;
  isPrivate: boolean;
  repliedAt: Date | null;
  late: boolean;
};

export type BoardSide = {
  id: number;
  roundId: number;
  fixture: {
    id: number;
    grade: string;
    opponentName: string;
    startAt: Date;
    venue: string | null;
    isHome: boolean;
    roundLabel: string | null;
  };
  date: string;
  state: "draft" | "final";
  version: number;
  slots: {
    memberId: number | null;
    gap: SelectionSlot["gap"] | null;
    member: BoardMember | null;
  }[];
  captainMemberId: number | null;
  keeperMemberId: number | null;
  finalisedAt: Date | null;
  finalisedBy: string | null;
  canEdit: boolean;
  canFinalise: boolean;
  readOnlyReason: string | null;
  warnings: {
    filled: number;
    open: number;
    unconfirmed: number;
    saidNo: number;
    noCaptain: boolean;
    noKeeper: boolean;
  };
};

export type Board = {
  section: SquadSection;
  actor: {
    kind: "admin" | "captain";
    name: string;
    selectionRule: SelectionRule;
    canRemind: boolean;
  };
  round: {
    roundId: number;
    weekendDate: string;
    sendAt: Date;
    reminderAt: Date;
    cutoffAt: Date;
    finaliseAt: Date;
    sendStartedAt: Date | null;
    reminderStartedAt: Date | null;
    cutoffStartedAt: Date | null;
    cutoffCompletedAt: Date | null;
    counts: Awaited<ReturnType<typeof roundCounts>>;
  } | null;
  selections: BoardSide[];
  pool: BoardMember[];
  events: {
    id: number;
    selectionId: number;
    grade: string;
    actorKind: string;
    actorName: string | null;
    action: string;
    detail: Record<string, unknown>;
    createdAt: Date;
  }[];
};

/** The member columns the board reads — deliberately no contact column (R6). */
const MEMBER_COLUMNS = {
  id: squadMembersTable.id,
  firstName: squadMembersTable.firstName,
  lastName: squadMembersTable.lastName,
  preferredName: squadMembersTable.preferredName,
  dateOfBirth: squadMembersTable.dateOfBirth,
  section: squadMembersTable.section,
  active: squadMembersTable.active,
  gradeHint: squadMembersTable.gradeHint,
  isPrivate: squadMembersTable.isPrivate,
  linkedPlayerId: squadMembersTable.linkedPlayerId,
};

type BoardMemberRow = Pick<SquadMemberRow, keyof typeof MEMBER_COLUMNS>;

const EVENT_LIMIT = 30;

/** Strongest answer first: Yes, then Maybe, then No; none when nothing was said. */
function strongest(statuses: Iterable<AvailabilityStatus>): MemberStatus {
  const set = new Set(statuses);
  if (set.has("yes")) return "yes";
  if (set.has("maybe")) return "maybe";
  if (set.has("no")) return "no";
  return "none";
}

/** Rounds with the club's schedule (or the defaults) and the current weekend. */
async function currentRound(tenantId: number, now: Date) {
  const settings = await loadAvailabilitySettings(tenantId);
  const schedule = settings ?? {
    ...DEFAULT_SCHEDULE,
    selectionRule: "captains_own_grade" as const,
  };
  const weekendDate = roundWeekendFor(schedule, now);
  const round = await findRound(tenantId, weekendDate);
  return {
    settings,
    rule: schedule.selectionRule,
    weekendDate,
    slots: roundSlots(schedule, weekendDate),
    round,
  };
}

/** The current round of the club, or null (for the remind route). */
export async function loadCurrentRound(
  tenantId: number,
  now: Date = new Date(),
): Promise<AvailabilityRoundRow | null> {
  return (await currentRound(tenantId, now)).round;
}

/**
 * One section's board for the current round (R20–R23, R27). With no round yet,
 * the board has no header or sides and the whole active section is the pool.
 */
export async function buildBoard(
  tenantId: number,
  actor: SelectionActor,
  section: SquadSection,
  now: Date = new Date(),
): Promise<Board> {
  const { rule, weekendDate, slots: stepSlots, round } = await currentRound(tenantId, now);
  const window = roundWindow(weekendDate);

  const members: BoardMemberRow[] = await db
    .select(MEMBER_COLUMNS)
    .from(squadMembersTable)
    .where(eq(squadMembersTable.tenantId, tenantId));
  const byId = new Map(members.map((m) => [m.id, m]));

  // Every side of the round (any section), so a member placed anywhere is out of the pool.
  const sides = round
    ? await db
        .select({ selection: selectionsTable, fixture: fixturesTable })
        .from(selectionsTable)
        .innerJoin(
          fixturesTable,
          and(
            eq(fixturesTable.id, selectionsTable.fixtureId),
            eq(fixturesTable.tenantId, selectionsTable.tenantId),
          ),
        )
        .where(and(eq(selectionsTable.tenantId, tenantId), eq(selectionsTable.roundId, round.id)))
        .orderBy(asc(fixturesTable.startAt), asc(fixturesTable.id))
    : [];
  const placed = new Set<number>();
  for (const s of sides) {
    for (const slot of s.selection.slots) if (slot.memberId != null) placed.add(slot.memberId);
  }

  // Answers: status per Perth date (away periods count as No), plus the reply
  // details — a row the system recorded (away) is not a reply.
  const statusByDate = round
    ? await loadResponses(tenantId, round.id, window.from, window.to)
    : new Map<number, ReadonlyMap<string, AvailabilityStatus>>();
  const replies = round
    ? await db
        .select({
          memberId: availabilityResponsesTable.memberId,
          note: availabilityResponsesTable.note,
          respondedAt: availabilityResponsesTable.respondedAt,
          respondedBySlot: availabilityResponsesTable.respondedBySlot,
          late: availabilityResponsesTable.late,
        })
        .from(availabilityResponsesTable)
        .where(
          and(
            eq(availabilityResponsesTable.tenantId, tenantId),
            eq(availabilityResponsesTable.roundId, round.id),
          ),
        )
        .orderBy(asc(availabilityResponsesTable.respondedAt))
    : [];
  const replyOf = new Map<number, { note: string | null; at: Date | null; late: boolean }>();
  for (const r of replies) {
    const prev = replyOf.get(r.memberId) ?? { note: null, at: null, late: false };
    replyOf.set(r.memberId, {
      note: r.note?.trim() ? r.note.trim() : prev.note,
      at: r.respondedBySlot != null ? r.respondedAt : prev.at,
      late: prev.late || r.late,
    });
  }

  // Last grade (KTD12) and the dates each member was asked about.
  const windowFixtures = await db
    .select({ grade: fixturesTable.grade, startAt: fixturesTable.startAt })
    .from(fixturesTable)
    .where(
      and(
        eq(fixturesTable.tenantId, tenantId),
        gte(fixturesTable.startAt, window.from),
        lt(fixturesTable.startAt, window.to),
      ),
    );
  const grades = await db
    .selectDistinct({ grade: fixturesTable.grade })
    .from(fixturesTable)
    .where(eq(fixturesTable.tenantId, tenantId));
  const lists: GradeList[] = await db
    .select({
      grade: fixturesTable.grade,
      startAt: fixturesTable.startAt,
      players: teamListsTable.players,
    })
    .from(teamListsTable)
    .innerJoin(
      fixturesTable,
      and(
        eq(fixturesTable.id, teamListsTable.fixtureId),
        eq(fixturesTable.tenantId, teamListsTable.tenantId),
      ),
    )
    .where(
      and(
        eq(teamListsTable.tenantId, tenantId),
        lt(fixturesTable.startAt, window.from),
        sql`jsonb_array_length(${teamListsTable.players}) > 0`,
      ),
    );
  const lastGrade = memberGrades(
    members,
    lists,
    grades.map((g) => g.grade),
  );

  const summary = (m: BoardMemberRow, date: string | null): BoardMember => {
    const answers = statusByDate.get(m.id);
    let status: MemberStatus = "none";
    if (answers) {
      if (date) status = answers.get(date) ?? "none";
      else {
        const asked = datesForGrade(lastGrade.get(m.id) ?? null, m.section, windowFixtures);
        const own = asked.map((d) => answers.get(d)).filter((s): s is AvailabilityStatus => !!s);
        status = strongest(own.length > 0 ? own : answers.values());
      }
    }
    const reply = replyOf.get(m.id);
    return {
      id: m.id,
      displayName: memberDisplayName(m),
      status,
      note: reply?.note ?? null,
      lastGrade: lastGrade.get(m.id) ?? null,
      junior: section === "senior" && (m.section === "junior" || isUnder18(m.dateOfBirth, now)),
      isPrivate: m.isPrivate,
      repliedAt: reply?.at ?? null,
      late: reply?.late ?? false,
    };
  };

  const sectionSides = sides.filter((s) => fixtureSection(s.fixture.grade) === section);
  const selections: BoardSide[] = sectionSides.map(({ selection: sel, fixture: f }) => {
    const date = perthDate(f.startAt);
    const right = selectionRight(actor, rule, f.grade);
    const final = sel.state === "final";
    const slots = sel.slots.map((slot) => {
      const m = slot.memberId != null ? byId.get(slot.memberId) : undefined;
      return {
        memberId: slot.memberId,
        gap: slot.memberId == null ? (slot.gap ?? null) : null,
        member: m ? summary(m, date) : null,
      };
    });
    const picked = slots.flatMap((s) => (s.member ? [s.member] : []));
    return {
      id: sel.id,
      roundId: sel.roundId,
      fixture: {
        id: f.id,
        grade: f.grade,
        opponentName: f.opponentName,
        startAt: f.startAt,
        venue: f.venue,
        isHome: f.isHome,
        roundLabel: f.roundLabel,
      },
      date,
      state: sel.state,
      version: sel.version,
      slots,
      captainMemberId: sel.captainMemberId,
      keeperMemberId: sel.keeperMemberId,
      finalisedAt: sel.finalisedAt,
      finalisedBy: sel.finalisedBy,
      canEdit: right.allowed && !final,
      canFinalise: right.allowed,
      readOnlyReason: !right.allowed
        ? right.reason
        : final
          ? "This side is finalised. Re-open it to make changes."
          : null,
      warnings: {
        filled: picked.length,
        open: SIDE_SIZE - picked.length,
        unconfirmed: picked.filter((m) => m.status === "maybe" || m.status === "none").length,
        saidNo: picked.filter((m) => m.status === "no").length,
        noCaptain: sel.captainMemberId == null,
        noKeeper: sel.keeperMemberId == null,
      },
    };
  });

  const pool = members
    .filter((m) => m.active && m.section === section && !placed.has(m.id))
    .map((m) => summary(m, null))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const sideIds = sectionSides.map((s) => s.selection.id);
  const gradeOf = new Map(sectionSides.map((s) => [s.selection.id, s.fixture.grade]));
  const events =
    sideIds.length > 0
      ? await db
          .select()
          .from(selectionEventsTable)
          .where(
            and(
              eq(selectionEventsTable.tenantId, tenantId),
              inArray(selectionEventsTable.selectionId, sideIds),
            ),
          )
          .orderBy(desc(selectionEventsTable.createdAt), desc(selectionEventsTable.id))
          .limit(EVENT_LIMIT)
      : [];

  const sectionMembers = new Set(members.filter((m) => m.section === section).map((m) => m.id));
  return {
    section,
    actor: {
      kind: actor.kind,
      name: actor.name,
      selectionRule: rule,
      canRemind: canRemind(actor, rule),
    },
    round: round
      ? {
          roundId: round.id,
          weekendDate: round.weekendDate,
          sendAt: stepSlots.send,
          reminderAt: stepSlots.reminder,
          cutoffAt: stepSlots.cutoff,
          finaliseAt: stepSlots.finalise,
          sendStartedAt: round.sendStartedAt,
          reminderStartedAt: round.reminderStartedAt,
          cutoffStartedAt: round.cutoffStartedAt,
          cutoffCompletedAt: round.cutoffCompletedAt,
          counts: await roundCounts(tenantId, round.id, sectionMembers),
        }
      : null,
    selections,
    pool,
    events: events.map((e) => ({
      id: e.id,
      selectionId: e.selectionId,
      grade: gradeOf.get(e.selectionId) ?? "",
      actorKind: e.actorKind,
      actorName: e.actorName,
      action: e.action,
      detail: e.detail,
      createdAt: e.createdAt,
    })),
  };
}

// --- Board save (KTD8) ---

export type SideChange = {
  selectionId: number;
  version: number;
  slots: { memberId: number | null; gap?: SelectionSlot["gap"] | null }[];
  captainMemberId: number | null;
  keeperMemberId: number | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type LockedSide = { selection: SelectionRow; fixture: FixtureRow };

/** Lock every side of a round, with its fixture (tenant-scoped). */
async function lockRound(tx: Tx, tenantId: number, roundId: number): Promise<LockedSide[]> {
  const rows = await tx
    .select()
    .from(selectionsTable)
    .where(and(eq(selectionsTable.tenantId, tenantId), eq(selectionsTable.roundId, roundId)))
    .orderBy(asc(selectionsTable.id))
    .for("update");
  if (rows.length === 0) return [];
  const fixtures = await tx
    .select()
    .from(fixturesTable)
    .where(
      and(
        eq(fixturesTable.tenantId, tenantId),
        inArray(
          fixturesTable.id,
          rows.map((r) => r.fixtureId),
        ),
      ),
    );
  const fixtureOf = new Map(fixtures.map((f) => [f.id, f]));
  return rows.flatMap((selection) => {
    const fixture = fixtureOf.get(selection.fixtureId);
    return fixture ? [{ selection, fixture }] : [];
  });
}

const memberIdsOf = (slots: readonly { memberId: number | null }[]) =>
  slots.flatMap((s) => (s.memberId != null ? [s.memberId] : []));

/**
 * Apply whole-side changes atomically (KTD8). Throws `SelectionError` (and
 * writes nothing) for: a side not found (404); a side — or a member taken from
 * a side — the actor may not edit (403); a finalised side or a stale version
 * (409); not 11 slots, a member twice in the round, an unknown member or a
 * newly placed inactive one (400). Returns the section of the first change.
 */
export async function saveBoard(
  tenantId: number,
  actor: SelectionActor,
  changes: readonly SideChange[],
  now: Date = new Date(),
): Promise<{ section: SquadSection; selectionIds: number[] }> {
  if (changes.length === 0) throw new SelectionError(400, "Nothing to save.");
  const ids = changes.map((c) => c.selectionId);
  if (new Set(ids).size !== ids.length) {
    throw new SelectionError(400, "Each side can appear only once in a save.");
  }
  for (const c of changes) {
    if (c.slots.length !== SIDE_SIZE) {
      throw new SelectionError(400, `A side has exactly ${SIDE_SIZE} slots.`);
    }
  }
  const rule = await selectionRule(tenantId);

  return db.transaction(async (tx) => {
    const [first] = await tx
      .select({ roundId: selectionsTable.roundId })
      .from(selectionsTable)
      .where(and(eq(selectionsTable.tenantId, tenantId), eq(selectionsTable.id, ids[0])));
    if (!first) throw new SelectionError(404, "Side not found.");
    const sides = await lockRound(tx, tenantId, first.roundId);
    const sideOf = new Map(sides.map((s) => [s.selection.id, s]));
    for (const id of ids) {
      if (!sideOf.has(id)) throw new SelectionError(404, "Side not found.");
    }
    const changing = new Set(ids);

    // Rights, the final lock and versions of the sides being changed.
    for (const c of changes) {
      const { selection, fixture } = sideOf.get(c.selectionId)!;
      const right = selectionRight(actor, rule, fixture.grade);
      if (!right.allowed) {
        throw new SelectionError(403, `${fixture.grade} is read-only to you. ${right.reason}`);
      }
      if (selection.state === "final") {
        throw new SelectionError(409, `${fixture.grade} is finalised. Re-open it to make changes.`);
      }
      if (selection.version !== c.version) {
        throw new SelectionError(
          409,
          `${fixture.grade} was changed by someone else. Reload to see the latest side.`,
        );
      }
    }

    // Members: in this club; anyone newly placed in a side must be active.
    const involved = new Set<number>();
    for (const c of changes) {
      for (const id of memberIdsOf(c.slots)) involved.add(id);
      for (const id of memberIdsOf(sideOf.get(c.selectionId)!.selection.slots)) involved.add(id);
    }
    const members =
      involved.size > 0
        ? await tx
            .select(MEMBER_COLUMNS)
            .from(squadMembersTable)
            .where(
              and(
                eq(squadMembersTable.tenantId, tenantId),
                inArray(squadMembersTable.id, [...involved]),
              ),
            )
        : [];
    const memberOf = new Map(members.map((m) => [m.id, m]));
    const nameOf = (id: number) => {
      const m = memberOf.get(id);
      return m ? memberDisplayName(m) : `#${id}`;
    };

    // Where each member sits before the save.
    const holderOf = new Map<number, LockedSide>();
    for (const s of sides) for (const id of memberIdsOf(s.selection.slots)) holderOf.set(id, s);

    for (const c of changes) {
      const before = new Set(memberIdsOf(sideOf.get(c.selectionId)!.selection.slots));
      for (const id of memberIdsOf(c.slots)) {
        const m = memberOf.get(id);
        if (!m) throw new SelectionError(400, "A player in the side isn't on the club's register.");
        if (!before.has(id) && !m.active) {
          throw new SelectionError(400, `${nameOf(id)} isn't an active squad member.`);
        }
        // Taking a member from a side the save doesn't change (R27).
        const holder = holderOf.get(id);
        if (holder && holder.selection.id !== c.selectionId && !changing.has(holder.selection.id)) {
          const right = selectionRight(actor, rule, holder.fixture.grade);
          if (!right.allowed || holder.selection.state === "final") {
            throw new SelectionError(
              403,
              `${nameOf(id)} is in ${holder.fixture.grade}, which you can't change.`,
            );
          }
        }
      }
    }

    // No member twice in the round once every change is applied.
    const after = new Map<number, readonly { memberId: number | null }[]>(
      sides.map((s) => [s.selection.id, s.selection.slots]),
    );
    for (const c of changes) after.set(c.selectionId, c.slots);
    const seen = new Set<number>();
    for (const slots of after.values()) {
      for (const id of memberIdsOf(slots)) {
        if (seen.has(id)) {
          throw new SelectionError(400, `${nameOf(id)} can only be picked once in a round.`);
        }
        seen.add(id);
      }
    }

    for (const c of changes) {
      const { selection } = sideOf.get(c.selectionId)!;
      const slots: SelectionSlot[] = c.slots.map((s) =>
        s.memberId != null
          ? { memberId: s.memberId }
          : s.gap
            ? { memberId: null, gap: s.gap }
            : { memberId: null },
      );
      const inSide = new Set(memberIdsOf(slots));
      // A captain or keeper must be in their own side; otherwise the role clears (R38).
      const rolesCleared: { role: "captain" | "keeper"; memberId: number; name: string }[] = [];
      let captain = c.captainMemberId;
      let keeper = c.keeperMemberId;
      if (captain != null && !inSide.has(captain)) {
        rolesCleared.push({ role: "captain", memberId: captain, name: nameOf(captain) });
        captain = null;
      }
      if (keeper != null && !inSide.has(keeper)) {
        rolesCleared.push({ role: "keeper", memberId: keeper, name: nameOf(keeper) });
        keeper = null;
      }

      await tx
        .update(selectionsTable)
        .set({
          slots,
          captainMemberId: captain,
          keeperMemberId: keeper,
          version: selection.version + 1,
          updatedAt: now,
        })
        .where(and(eq(selectionsTable.id, selection.id), eq(selectionsTable.tenantId, tenantId)));

      const was = memberIdsOf(selection.slots);
      const wasSet = new Set(was);
      const added = [...inSide].filter((id) => !wasSet.has(id));
      const removed = was.filter((id) => !inSide.has(id));
      const reordered =
        added.length === 0 &&
        removed.length === 0 &&
        JSON.stringify(selection.slots.map((s) => s.memberId)) !==
          JSON.stringify(slots.map((s) => s.memberId));
      const role = (from: number | null, to: number | null) =>
        from === to
          ? undefined
          : {
              from: from != null ? { id: from, name: nameOf(from) } : null,
              to: to != null ? { id: to, name: nameOf(to) } : null,
            };
      const detail: Record<string, unknown> = {};
      if (added.length > 0) detail.added = added.map((id) => ({ id, name: nameOf(id) }));
      if (removed.length > 0) detail.removed = removed.map((id) => ({ id, name: nameOf(id) }));
      if (reordered) detail.reordered = true;
      const captainChange = role(selection.captainMemberId, captain);
      const keeperChange = role(selection.keeperMemberId, keeper);
      if (captainChange) detail.captain = captainChange;
      if (keeperChange) detail.keeper = keeperChange;
      if (rolesCleared.length > 0) detail.rolesCleared = rolesCleared;
      if (Object.keys(detail).length > 0) {
        await tx.insert(selectionEventsTable).values({
          tenantId,
          selectionId: selection.id,
          actorKind: actor.kind,
          actorId: actor.id,
          actorName: actor.name,
          action: "update",
          detail,
          createdAt: now,
        });
      }
    }

    const firstSide = sideOf.get(ids[0])!;
    return { section: fixtureSection(firstSide.fixture.grade), selectionIds: ids };
  });
}

// --- Finalise and re-open (R30–R32, R39) ---

/** Lock one side of the tenant with its fixture, or throw 404. */
async function lockSide(tx: Tx, tenantId: number, selectionId: number): Promise<LockedSide> {
  const [selection] = await tx
    .select()
    .from(selectionsTable)
    .where(and(eq(selectionsTable.tenantId, tenantId), eq(selectionsTable.id, selectionId)))
    .for("update");
  if (!selection) throw new SelectionError(404, "Side not found.");
  const [fixture] = await tx
    .select()
    .from(fixturesTable)
    .where(and(eq(fixturesTable.tenantId, tenantId), eq(fixturesTable.id, selection.fixtureId)));
  if (!fixture) throw new SelectionError(404, "Side not found.");
  return { selection, fixture };
}

/** The team-list role for a member of the side (R35). */
function roleOf(
  memberId: number,
  side: Pick<SelectionRow, "captainMemberId" | "keeperMemberId">,
): TeamListPlayer["role"] | undefined {
  const c = side.captainMemberId === memberId;
  const wk = side.keeperMemberId === memberId;
  return c && wk ? "C/WK" : c ? "C" : wk ? "WK" : undefined;
}

export type FinaliseResult = {
  section: SquadSection;
  messaged: { selected: number; deselected: number };
};

/**
 * Finalise a side (R31, R32, R39): lock it, publish its XI as the fixture's
 * team list (source "selection", published), then message the members newly
 * selected since the last finalise and — on a re-finalise — those dropped.
 * The notified set is stored in the same transaction, so a concurrent second
 * finalise can't message anyone twice. Messaging is best-effort.
 */
export async function finaliseSelection(
  tenantId: number,
  actor: SelectionActor,
  selectionId: number,
  opts: { now?: Date; req?: Request; logger?: Logger } = {},
): Promise<FinaliseResult> {
  const now = opts.now ?? new Date();
  const rule = await selectionRule(tenantId);
  const settings = await loadAvailabilitySettings(tenantId);

  const plan = await db.transaction(async (tx) => {
    const { selection, fixture } = await lockSide(tx, tenantId, selectionId);
    const right = selectionRight(actor, rule, fixture.grade);
    if (!right.allowed) {
      throw new SelectionError(403, `${fixture.grade} is read-only to you. ${right.reason}`);
    }
    if (selection.state === "final")
      throw new SelectionError(409, `${fixture.grade} is already final.`);

    const picked = memberIdsOf(selection.slots);
    const members =
      picked.length > 0
        ? await tx
            .select(MEMBER_COLUMNS)
            .from(squadMembersTable)
            .where(
              and(eq(squadMembersTable.tenantId, tenantId), inArray(squadMembersTable.id, picked)),
            )
        : [];
    const memberOf = new Map(members.map((m) => [m.id, m]));
    const players: TeamListPlayer[] = [];
    for (const id of picked) {
      const m = memberOf.get(id);
      if (!m) continue;
      const role = roleOf(id, selection);
      players.push({
        order: players.length + 1,
        // Fill-in ids never reach a team list (R7).
        ...(m.linkedPlayerId != null && m.linkedPlayerId < FILL_IN_THRESHOLD
          ? { playerId: m.linkedPlayerId }
          : {}),
        displayName: memberDisplayName(m),
        ...(role ? { role } : {}),
      });
    }
    await tx
      .insert(teamListsTable)
      .values({ tenantId, fixtureId: fixture.id, players, isPublished: true, source: "selection" })
      .onConflictDoUpdate({
        target: [teamListsTable.tenantId, teamListsTable.fixtureId],
        set: { players, isPublished: true, source: "selection" },
      });

    const notified = new Set(selection.notifiedMemberIds);
    const current = picked.filter((id) => memberOf.has(id));
    const toSelect = current.filter((id) => !notified.has(id));
    const toDeselect = [...notified].filter((id) => !current.includes(id));
    await tx
      .update(selectionsTable)
      .set({
        state: "final",
        finalisedAt: now,
        finalisedBy: actor.name,
        version: selection.version + 1,
        notifiedMemberIds: current,
        updatedAt: now,
      })
      .where(and(eq(selectionsTable.id, selection.id), eq(selectionsTable.tenantId, tenantId)));
    await tx.insert(selectionEventsTable).values({
      tenantId,
      selectionId: selection.id,
      actorKind: actor.kind,
      actorId: actor.id,
      actorName: actor.name,
      action: "finalise",
      detail: {
        players: players.length,
        open: SIDE_SIZE - players.length,
        captainMemberId: selection.captainMemberId,
        keeperMemberId: selection.keeperMemberId,
        notified: { selected: toSelect, deselected: toDeselect },
      },
      createdAt: now,
    });
    return { selection, fixture, toSelect, toDeselect };
  });

  const { selection, fixture } = plan;
  const toMessage = [...plan.toSelect, ...plan.toDeselect];
  const rows =
    toMessage.length > 0
      ? await db
          .select()
          .from(squadMembersTable)
          .where(
            and(eq(squadMembersTable.tenantId, tenantId), inArray(squadMembersTable.id, toMessage)),
          )
      : [];
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  const matchFixture = {
    grade: fixture.grade,
    opponentName: fixture.opponentName,
    startAt: fixture.startAt,
    venue: fixture.venue,
  };
  const messaged = { selected: 0, deselected: 0 };
  const send = async (id: number, kind: "selected" | "deselected") => {
    const member = rowOf.get(id);
    if (!member) return;
    const out = await messageMember(
      {
        tenantId,
        member,
        kind,
        context: {
          roundId: selection.roundId,
          fixture: matchFixture,
          role: kind === "selected" ? (roleOf(id, selection) ?? null) : null,
          req: opts.req,
        },
        smsEnabled: settings?.smsEnabled ?? true,
        now,
      },
      opts.logger ?? defaultLogger,
    );
    if (out.results.length > 0) messaged[kind]++;
  };
  for (const id of plan.toSelect) await send(id, "selected");
  for (const id of plan.toDeselect) await send(id, "deselected");
  return { section: fixtureSection(fixture.grade), messaged };
}

/**
 * Re-open a finalised side (R32): back to draft and logged. The published team
 * list stays as last finalised until the next finalise (KTD6).
 */
export async function reopenSelection(
  tenantId: number,
  actor: SelectionActor,
  selectionId: number,
  now: Date = new Date(),
): Promise<{ section: SquadSection }> {
  const rule = await selectionRule(tenantId);
  return db.transaction(async (tx) => {
    const { selection, fixture } = await lockSide(tx, tenantId, selectionId);
    const right = selectionRight(actor, rule, fixture.grade);
    if (!right.allowed) {
      throw new SelectionError(403, `${fixture.grade} is read-only to you. ${right.reason}`);
    }
    if (selection.state !== "final") {
      throw new SelectionError(409, `${fixture.grade} isn't finalised.`);
    }
    await tx
      .update(selectionsTable)
      .set({ state: "draft", version: selection.version + 1, updatedAt: now })
      .where(and(eq(selectionsTable.id, selection.id), eq(selectionsTable.tenantId, tenantId)));
    await tx.insert(selectionEventsTable).values({
      tenantId,
      selectionId: selection.id,
      actorKind: actor.kind,
      actorId: actor.id,
      actorName: actor.name,
      action: "reopen",
      detail: {},
      createdAt: now,
    });
    return { section: fixtureSection(fixture.grade) };
  });
}

// --- "Can't make it" (R33, F3) ---

/**
 * A selected player withdraws (R33): in every side of the round holding them,
 * their slot becomes a gap "was <name> · withdrew", any captain or keeper role
 * they held clears (R38), a finalised side returns to draft, and their entry is
 * removed from the fixture's published Hub list (the rest stays published,
 * KTD6). They leave the side's notified set, so a re-finalise doesn't also send
 * them a "no longer selected" message. Captains and admins are alerted.
 * Returns the sides changed; none when the member isn't placed.
 */
export async function withdrawFromSelection(
  tenantId: number,
  memberId: number,
  roundId: number,
  actor: EventActor,
  opts: { now?: Date; logger?: Logger } = {},
): Promise<{ selectionIds: number[] }> {
  const now = opts.now ?? new Date();
  const [member] = await db
    .select(MEMBER_COLUMNS)
    .from(squadMembersTable)
    .where(and(eq(squadMembersTable.tenantId, tenantId), eq(squadMembersTable.id, memberId)));
  if (!member) return { selectionIds: [] };
  const name = memberDisplayName(member);

  const changed = await db.transaction(async (tx) => {
    const sides = await lockRound(tx, tenantId, roundId);
    const out: LockedSide[] = [];
    for (const side of sides) {
      const { selection, fixture } = side;
      if (!selection.slots.some((s) => s.memberId === memberId)) continue;
      const slots: SelectionSlot[] = selection.slots.map((s) =>
        s.memberId === memberId ? { memberId: null, gap: { name, reason: "withdrew" } } : s,
      );
      const rolesCleared: string[] = [];
      if (selection.captainMemberId === memberId) rolesCleared.push("captain");
      if (selection.keeperMemberId === memberId) rolesCleared.push("keeper");
      await tx
        .update(selectionsTable)
        .set({
          slots,
          captainMemberId:
            selection.captainMemberId === memberId ? null : selection.captainMemberId,
          keeperMemberId: selection.keeperMemberId === memberId ? null : selection.keeperMemberId,
          state: "draft",
          version: selection.version + 1,
          notifiedMemberIds: selection.notifiedMemberIds.filter((id) => id !== memberId),
          updatedAt: now,
        })
        .where(and(eq(selectionsTable.id, selection.id), eq(selectionsTable.tenantId, tenantId)));

      // Drop them from the published Hub list; a list PlayHQ has since replaced is left alone.
      const [list] = await tx
        .select()
        .from(teamListsTable)
        .where(
          and(
            eq(teamListsTable.tenantId, tenantId),
            eq(teamListsTable.fixtureId, fixture.id),
            eq(teamListsTable.source, "selection"),
          ),
        );
      if (list) {
        const linked =
          member.linkedPlayerId != null && member.linkedPlayerId < FILL_IN_THRESHOLD
            ? member.linkedPlayerId
            : null;
        const key = normaliseName(name);
        const players = list.players
          .filter((p) =>
            linked != null && p.playerId != null
              ? p.playerId !== linked
              : normaliseName(p.displayName) !== key,
          )
          .map((p, i) => ({ ...p, order: i + 1 }));
        if (players.length !== list.players.length) {
          await tx
            .update(teamListsTable)
            .set({ players })
            .where(and(eq(teamListsTable.id, list.id), eq(teamListsTable.tenantId, tenantId)));
        }
      }

      await tx.insert(selectionEventsTable).values({
        tenantId,
        selectionId: selection.id,
        actorKind: actor.kind,
        actorId: actor.id,
        actorName: actor.name,
        action: "withdraw",
        detail: {
          memberId,
          name,
          wasFinal: selection.state === "final",
          ...(rolesCleared.length > 0 ? { rolesCleared } : {}),
        },
        createdAt: now,
      });
      out.push(side);
    }
    return out;
  });

  for (const { selection, fixture } of changed) {
    try {
      await notifyStaff(
        {
          tenantId,
          kind: "selection_slot_reopened",
          title: `${name} can't make it`,
          body: `${name} has withdrawn from ${fixture.grade} v ${fixture.opponentName} on ${perthDate(fixture.startAt)}. Their slot is open again in the Selection Hub.`,
          link: "/admin/selection",
          payload: { selectionId: selection.id, memberId, roundId },
        },
        opts.logger ?? defaultLogger,
      );
    } catch (err) {
      (opts.logger ?? defaultLogger).warn(
        { err, tenantId, selectionId: selection.id },
        "selection withdraw notice failed",
      );
    }
  }
  return { selectionIds: changed.map((s) => s.selection.id) };
}
