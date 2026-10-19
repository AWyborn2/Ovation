import type { Request } from "express";
import { and, asc, desc, eq, gt, gte, inArray, lt, ne, sql, type AnyColumn } from "drizzle-orm";
import {
  db,
  availabilityResponsesTable,
  availabilityRoundsTable,
  fixturesTable,
  juniorFixturesTable,
  juniorTeamListsTable,
  selectionEventsTable,
  selectionsTable,
  squadMembersTable,
  teamListsTable,
  type AvailabilityRoundRow,
  type AvailabilityStatus,
  type JuniorTeamListPlayer,
  type SelectionRow,
  type SelectionRule,
  type SelectionSlot,
  type SquadMemberRow,
  type SquadSection,
  type TeamListPlayer,
} from "@workspace/db";
import { FILL_IN_THRESHOLD, sortByGradeOrder } from "@workspace/scorecard";
import { loadClubGradeOrder } from "./club-grade-order";
import {
  loadSideFixture,
  loadSideFixtures,
  sideFixtureKey,
  sideSection,
  type SideFixture,
} from "./selection-fixtures";
import { loadJuniorIdentity } from "./junior-shirt-numbers";
import { juniorMemberResolver } from "./shirt-number-squad";
import {
  loadParticipantCrosswalk,
  loadParticipantMatches,
  type ParticipantMatch,
} from "./participant-crosswalk";
import {
  addDays,
  memberDisplayName,
  memberGrades,
  normaliseName,
  perthDate,
  perthDow,
  roundWindow,
} from "./availability-grades";
import {
  DEFAULT_SCHEDULE,
  datesForGrade,
  ensureRound,
  findRound,
  loadAvailabilitySettings,
  roundCounts,
  roundSlots,
  roundWeekendFor,
} from "./availability-schedule";
import { isUnder18, messageMember, notifyStaff, type MessageBatch } from "./availability-messaging";
import {
  SIDE_SIZE,
  TWELFTH_INDEX,
  XI_SIZE,
  buildDraftSlots,
  buildRoundDrafts,
  juniorListAsNames,
  loadResponses,
  normaliseSlots,
  xiMemberIds,
} from "./selection-drafts";
import type { SelectionActor } from "../middlewares/require-admin-or-captain";
import { logger as defaultLogger } from "./logger";
import {
  namedPublicly,
  publicName,
  selectionPublishedPlayers,
  loadSelectionParticipantIds,
} from "./selection-published-players";

/**
 * The Selection Hub's board.
 *
 * - `buildBoard` reads one section's view of the current round: the round
 *   header and counts, each side with its slots, roles and the caller's edit
 *   right, the pool (the whole active squad) and the latest changes. Member
 *   summaries are built from explicitly listed non-contact columns, so no
 *   mobile or email can reach a captain.
 * - `saveBoard` applies whole-side changes in one transaction with the round's
 *   sides locked: rights, the final lock, versions, 12 slots and "no
 *   member twice in the round" (for the members the save places) are all
 *   checked before anything is written; a captain or keeper no longer in their
 *   XI (left the side, or moved to 12th) is cleared and logged.
 * - A side is the XI (slots 1–11) plus an optional 12th player (slot 12).
 *   Sides stored before the 12th read as 12 slots via `normaliseSlots`.
 * - `finaliseSelection` publishes a side as the fixture's team list (source
 *   "selection"; a private member as "Private Player") and messages only the
 *   members the change affects; `reopenSelection` returns it to draft and
 *   leaves the list alone.
 * - `withdrawFromSelection` is a selected player's "can't make it".
 * - Finalise, re-open and withdraw are refused once the match has started.
 *
 * Edit rights come from the club's selection rule: admins edit any
 * side; captains edit their own grades, every grade, or none.
 */

type Logger = { warn: (obj: unknown, msg?: string) => void };

/** Who a `selection_events` row names. */
export type EventActor = {
  kind: SelectionActor["kind"] | "player" | "system";
  id: number | null;
  name: string | null;
};

/**
 * A refused board action, carried to the route as an HTTP status and message,
 * with a machine-readable `code` where a client acts on it (`round_closed`).
 */
export class SelectionError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 503,
    message: string,
    readonly code?: "round_closed",
  ) {
    super(message);
    this.name = "SelectionError";
  }
}

// --- Edit rights ---

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

/** May this actor remind non-responders? Anyone with an edit right somewhere. */
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
  linkedPlayerId: number | null;
  displayName: string;
  status: MemberStatus;
  note: string | null;
  lastGrade: string | null;
  junior: boolean;
  /** The register section: a junior in a senior board is playing up. */
  section: SquadSection;
  isPrivate: boolean;
  repliedAt: Date | null;
  late: boolean;
};

export type BoardSide = {
  id: number;
  roundId: number;
  fixture: {
    /** A senior `fixtures` row or a `junior_fixtures` row (junior PlayHQ sync). */
    kind: "senior" | "junior";
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
  /**
   * Players in the side PlayHQ has published for this fixture (synced from
   * PlayHQ), or null when it has none yet: the Hub offers to use it.
   */
  playhqPlayers: number | null;
  readOnlyReason: string | null;
  warnings: {
    /** Players in the XI (slots 1–11). */
    filled: number;
    /** Open slots in the XI; an empty 12th is not one. */
    open: number;
    /** Slot 12 is filled. */
    twelfth: boolean;
    unconfirmed: number;
    saidNo: number;
    noCaptain: boolean;
    noKeeper: boolean;
  };
};

export type Board = {
  section: SquadSection;
  /** The club uses availability requests; off, statuses and the round steps don't apply. */
  availability: boolean;
  actor: {
    kind: SelectionActor["kind"];
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
  /** The weekends the Hub can move between, by their Saturday. */
  weekends: { previous: string | null; current: string; next: string | null };
  /** A past weekend: shown as it was, never changed or created. */
  readOnly: boolean;
  selections: BoardSide[];
  pool: BoardMember[];
  events: {
    id: number;
    selectionId: number | null;
    grade: string;
    actorKind: string;
    actorName: string | null;
    action: string;
    detail: Record<string, unknown>;
    createdAt: Date;
  }[];
  /** The club's remembered PlayHQ matches for this section's players ("Unmatch" in the Hub). */
  participantMatches: ParticipantMatch[];
};

/** The member columns the board reads — deliberately no contact column. */
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
  showNamePublicly: squadMembersTable.showNamePublicly,
  linkedPlayerId: squadMembersTable.linkedPlayerId,
  playhqProfileId: squadMembersTable.playhqProfileId,
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

/** The club's settings, its schedule (or the defaults) and the current weekend. */
async function clubWeek(tenantId: number, now: Date) {
  const settings = await loadAvailabilitySettings(tenantId);
  const schedule = settings ?? {
    ...DEFAULT_SCHEDULE,
    selectionRule: "captains_own_grade" as const,
  };
  return { settings, schedule, current: roundWeekendFor(schedule, now) };
}

/** The current round of the club, or null (for the remind route). */
export async function loadCurrentRound(
  tenantId: number,
  now: Date = new Date(),
): Promise<AvailabilityRoundRow | null> {
  return findRound(tenantId, (await clubWeek(tenantId, now)).current);
}

const PAST_ROUND =
  "This weekend has passed, so its sides can be viewed but not changed. Move to this weekend to pick sides.";

/** Is `weekendDate` (a Saturday) before the club's current weekend? */
export async function weekendIsPast(
  tenantId: number,
  weekendDate: string,
  now: Date = new Date(),
): Promise<boolean> {
  return weekendDate < (await clubWeek(tenantId, now)).current;
}

/**
 * Refuse a change to a past weekend's round: 409 `round_closed`. The current
 * round stays open all weekend, so a side can still be finalised after its
 * match has started. Unknown rounds pass (the caller's own lookup 404s).
 */
export async function assertRoundOpen(
  tenantId: number,
  roundId: number,
  now: Date = new Date(),
): Promise<void> {
  const [round] = await db
    .select({ weekendDate: availabilityRoundsTable.weekendDate })
    .from(availabilityRoundsTable)
    .where(
      and(eq(availabilityRoundsTable.tenantId, tenantId), eq(availabilityRoundsTable.id, roundId)),
    );
  if (round && (await weekendIsPast(tenantId, round.weekendDate, now))) {
    throw new SelectionError(409, PAST_ROUND, "round_closed");
  }
}

/**
 * The weekend (its Saturday) of a side's round, so a route answers with the
 * board the side is on; undefined when the side isn't the tenant's.
 */
export async function selectionWeekend(
  tenantId: number,
  selectionId: number,
): Promise<string | undefined> {
  const [row] = await db
    .select({ weekendDate: availabilityRoundsTable.weekendDate })
    .from(selectionsTable)
    .innerJoin(
      availabilityRoundsTable,
      and(
        eq(availabilityRoundsTable.id, selectionsTable.roundId),
        eq(availabilityRoundsTable.tenantId, selectionsTable.tenantId),
      ),
    )
    .where(and(eq(selectionsTable.tenantId, tenantId), eq(selectionsTable.id, selectionId)));
  return row?.weekendDate;
}

/** The Saturday of the weekend (Friday to Sunday, Perth) an instant falls in. */
function weekendOf(at: Date): string {
  const date = perthDate(at);
  const dow = perthDow(at);
  return addDays(date, dow === 5 ? 1 : dow === 0 ? -1 : 0);
}

/** A fixture on a Friday, Saturday or Sunday in Perth (a weekend round's window). */
const onAWeekend = (startAt: AnyColumn) =>
  sql`extract(isodow from ${startAt} at time zone 'Australia/Perth') in (5, 6, 7)`;

/** The first weekend after `weekendDate` with a senior or junior fixture, or null. */
async function nextFixtureWeekend(tenantId: number, weekendDate: string): Promise<string | null> {
  const after = roundWindow(weekendDate).to;
  const [[senior], [junior]] = await Promise.all([
    db
      .select({ startAt: fixturesTable.startAt })
      .from(fixturesTable)
      .where(
        and(
          eq(fixturesTable.tenantId, tenantId),
          gte(fixturesTable.startAt, after),
          onAWeekend(fixturesTable.startAt),
        ),
      )
      .orderBy(asc(fixturesTable.startAt))
      .limit(1),
    db
      .select({ startAt: juniorFixturesTable.startAt })
      .from(juniorFixturesTable)
      .where(
        and(
          eq(juniorFixturesTable.tenantId, tenantId),
          gte(juniorFixturesTable.startAt, after),
          onAWeekend(juniorFixturesTable.startAt),
        ),
      )
      .orderBy(asc(juniorFixturesTable.startAt))
      .limit(1),
  ]);
  const first = [senior?.startAt, junior?.startAt]
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return first ? weekendOf(first) : null;
}

/**
 * The weekends either side of the one shown. Back: the nearest earlier weekend
 * with a round. Forward from a past weekend: the next one with a round, up to
 * the current weekend; from the current weekend on, the next weekend with
 * fixtures (nothing beyond what PlayHQ has published).
 */
async function boardWeekends(
  tenantId: number,
  shown: string,
  current: string,
): Promise<Board["weekends"]> {
  const [[prev], [later]] = await Promise.all([
    db
      .select({ weekendDate: availabilityRoundsTable.weekendDate })
      .from(availabilityRoundsTable)
      .where(
        and(
          eq(availabilityRoundsTable.tenantId, tenantId),
          lt(availabilityRoundsTable.weekendDate, shown),
        ),
      )
      .orderBy(desc(availabilityRoundsTable.weekendDate))
      .limit(1),
    shown < current
      ? db
          .select({ weekendDate: availabilityRoundsTable.weekendDate })
          .from(availabilityRoundsTable)
          .where(
            and(
              eq(availabilityRoundsTable.tenantId, tenantId),
              gt(availabilityRoundsTable.weekendDate, shown),
              lt(availabilityRoundsTable.weekendDate, current),
            ),
          )
          .orderBy(asc(availabilityRoundsTable.weekendDate))
          .limit(1)
      : [],
  ]);
  const next =
    shown < current ? (later?.weekendDate ?? current) : await nextFixtureWeekend(tenantId, shown);
  return { previous: prev?.weekendDate ?? null, current: shown, next };
}

/** Does the weekend's window hold any senior or junior fixture of the club? */
async function hasFixtures(tenantId: number, weekendDate: string): Promise<boolean> {
  const window = roundWindow(weekendDate);
  const [[senior], [junior]] = await Promise.all([
    db
      .select({ id: fixturesTable.id })
      .from(fixturesTable)
      .where(
        and(
          eq(fixturesTable.tenantId, tenantId),
          gte(fixturesTable.startAt, window.from),
          lt(fixturesTable.startAt, window.to),
        ),
      )
      .limit(1),
    db
      .select({ id: juniorFixturesTable.id })
      .from(juniorFixturesTable)
      .where(
        and(
          eq(juniorFixturesTable.tenantId, tenantId),
          gte(juniorFixturesTable.startAt, window.from),
          lt(juniorFixturesTable.startAt, window.to),
        ),
      )
      .limit(1),
  ]);
  return senior != null || junior != null;
}

/**
 * One section's board for a weekend (its Saturday; default the current one).
 *
 * The current or a future weekend is drafted on every load, whatever the
 * availability settings or how far the round's steps have got (ADR-008): the
 * round is created if missing and any fixture without a side gets one. Both
 * are idempotent and never touch a saved or finalised side, and two selectors
 * loading at once can't create a side twice. A future weekend with no fixtures
 * is not created. A past weekend is read-only and is never created or drafted.
 * With no round, the board has no header or sides and the whole active
 * section is the pool.
 */
export async function buildBoard(
  tenantId: number,
  actor: SelectionActor,
  section: SquadSection,
  now: Date = new Date(),
  weekend?: string,
): Promise<Board> {
  const { settings, schedule, current } = await clubWeek(tenantId, now);
  const rule = schedule.selectionRule;
  const weekendDate = weekend ?? current;
  const readOnly = weekendDate < current;
  const stepSlots = roundSlots(schedule, weekendDate);
  const availability = settings?.enabled === true;
  const window = roundWindow(weekendDate);
  let round = await findRound(tenantId, weekendDate);
  if (
    !readOnly &&
    (round || weekendDate === current || (await hasFixtures(tenantId, weekendDate)))
  ) {
    round ??= await ensureRound(tenantId, weekendDate);
    await buildRoundDrafts(tenantId, round.id, now);
  }
  const weekends = await boardWeekends(tenantId, weekendDate, current);

  // Independent reads, run together. `sides` is every side of the round (any
  // section); `statusByDate` is
  // each member's status per Perth date (away periods count as No) and
  // `replies` the reply details — a row the system recorded (away) is not a
  // reply; `windowFixtures`, `grades` and `lists` give each member's last grade
  // and the dates they were asked about.
  const [members, sides, statusByDate, replies, windowFixtures, grades, lists, gradeOrder] =
    await Promise.all([
      db
        .select(MEMBER_COLUMNS)
        .from(squadMembersTable)
        .where(eq(squadMembersTable.tenantId, tenantId)),
      round ? loadRoundSides(tenantId, round.id) : [],
      round
        ? loadResponses(tenantId, round.id, window.from, window.to)
        : new Map<number, ReadonlyMap<string, AvailabilityStatus>>(),
      round
        ? db
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
        : [],
      db
        .select({ grade: fixturesTable.grade, startAt: fixturesTable.startAt })
        .from(fixturesTable)
        .where(
          and(
            eq(fixturesTable.tenantId, tenantId),
            gte(fixturesTable.startAt, window.from),
            lt(fixturesTable.startAt, window.to),
          ),
        ),
      db
        .selectDistinct({ grade: fixturesTable.grade })
        .from(fixturesTable)
        .where(eq(fixturesTable.tenantId, tenantId)),
      db
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
        ),
      loadClubGradeOrder(tenantId),
    ]);
  const byId = new Map(members.map((m) => [m.id, m]));
  const placed = new Set<number>();
  for (const s of sides) {
    for (const slot of s.selection.slots) if (slot.memberId != null) placed.add(slot.memberId);
  }
  const replyOf = new Map<number, { note: string | null; at: Date | null; late: boolean }>();
  for (const r of replies) {
    const prev = replyOf.get(r.memberId) ?? { note: null, at: null, late: false };
    replyOf.set(r.memberId, {
      note: r.note?.trim() ? r.note.trim() : prev.note,
      at: r.respondedBySlot != null ? r.respondedAt : prev.at,
      late: prev.late || r.late,
    });
  }

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
      linkedPlayerId:
        section === "senior" && m.section === "senior" && !m.isPrivate ? m.linkedPlayerId : null,
      displayName: memberDisplayName(m),
      status,
      note: reply?.note ?? null,
      lastGrade: lastGrade.get(m.id) ?? null,
      junior: section === "senior" && (m.section === "junior" || isUnder18(m.dateOfBirth, now)),
      section: m.section,
      isPrivate: m.isPrivate,
      repliedAt: reply?.at ?? null,
      late: reply?.late ?? false,
    };
  };

  // Stable sort retains fixture start/id order for multiple sides of the same grade.
  const sectionSides = sortByGradeOrder(
    sides.filter((s) => sideSection(s.fixture) === section),
    (s) => s.fixture.grade,
    gradeOrder,
  );
  const playhqCounts = await loadPlayhqListSizes(
    tenantId,
    sectionSides.map((s) => s.fixture),
  );
  const selections: BoardSide[] = sectionSides.map(({ selection: sel, fixture: f }) => {
    const date = perthDate(f.startAt);
    const right = selectionRight(actor, rule, f.grade);
    const final = sel.state === "final";
    const slots = normaliseSlots(sel.slots).map((slot) => {
      const m = slot.memberId != null ? byId.get(slot.memberId) : undefined;
      return {
        memberId: slot.memberId,
        gap: slot.memberId == null ? (slot.gap ?? null) : null,
        member: m ? summary(m, date) : null,
      };
    });
    const picked = slots.flatMap((s) => (s.member ? [s.member] : []));
    const inXi = slots.slice(0, XI_SIZE).filter((s) => s.member).length;
    return {
      id: sel.id,
      roundId: sel.roundId,
      fixture: {
        kind: f.kind,
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
      canEdit: right.allowed && !final && !readOnly,
      canFinalise: right.allowed && !readOnly,
      readOnlyReason: readOnly
        ? PAST_ROUND
        : !right.allowed
          ? right.reason
          : final
            ? "This side is finalised. Re-open it to make changes."
            : null,
      playhqPlayers: playhqCounts.get(`${f.kind}:${f.id}`) ?? null,
      warnings: {
        filled: inXi,
        open: XI_SIZE - inXi,
        twelfth: slots[TWELFTH_INDEX]?.member != null,
        unconfirmed: availability
          ? picked.filter((m) => m.status === "maybe" || m.status === "none").length
          : 0,
        saidNo: picked.filter((m) => m.status === "no").length,
        noCaptain: sel.captainMemberId == null,
        noKeeper: sel.keeperMemberId == null,
      },
    };
  });

  const pool = members
    // A senior side may pick a junior (shown apart in the pool); a junior side juniors only.
    // The whole squad: a player already in a side can still be added to another
    // (a junior plays up, a senior plays Saturday and Sunday); the board shows where.
    .filter((m) => m.active && (m.section === section || section === "senior"))
    .map((m) => summary(m, null))
    // Not yet picked first, then by name.
    .sort(
      (a, b) =>
        Number(placed.has(a.id)) - Number(placed.has(b.id)) ||
        a.displayName.localeCompare(b.displayName),
    );

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
    availability,
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
    weekends,
    readOnly,
    selections,
    pool,
    events: events.map((e) => ({
      id: e.id,
      selectionId: e.selectionId,
      grade: (e.selectionId == null ? undefined : gradeOf.get(e.selectionId)) ?? "",
      actorKind: e.actorKind,
      actorName: e.actorName,
      action: e.action,
      detail: e.detail,
      createdAt: e.createdAt,
    })),
    participantMatches: await loadParticipantMatches(db, tenantId, section),
  };
}

// --- Board save ---

export type SideChange = {
  selectionId: number;
  version: number;
  slots: { memberId: number | null; gap?: SelectionSlot["gap"] | null }[];
  captainMemberId: number | null;
  keeperMemberId: number | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type LockedSide = { selection: SelectionRow; fixture: SideFixture };

/** A round's sides with their fixtures (senior or junior), by start then id. */
async function loadRoundSides(tenantId: number, roundId: number): Promise<LockedSide[]> {
  const rows = await db
    .select()
    .from(selectionsTable)
    .where(and(eq(selectionsTable.tenantId, tenantId), eq(selectionsTable.roundId, roundId)));
  const fixtures = await loadSideFixtures(db, tenantId, rows);
  return rows
    .flatMap((selection) => {
      const fixture = fixtures.get(sideFixtureKey(selection));
      return fixture ? [{ selection, fixture }] : [];
    })
    .sort(
      (a, b) =>
        a.fixture.startAt.getTime() - b.fixture.startAt.getTime() ||
        a.selection.id - b.selection.id,
    );
}

/** Lock every side of a round, with its fixture (tenant-scoped). */
async function lockRound(tx: Tx, tenantId: number, roundId: number): Promise<LockedSide[]> {
  const rows = await tx
    .select()
    .from(selectionsTable)
    .where(and(eq(selectionsTable.tenantId, tenantId), eq(selectionsTable.roundId, roundId)))
    .orderBy(asc(selectionsTable.id))
    .for("update");
  if (rows.length === 0) return [];
  const fixtures = await loadSideFixtures(tx, tenantId, rows);
  return rows.flatMap((selection) => {
    const fixture = fixtures.get(sideFixtureKey(selection));
    return fixture ? [{ selection, fixture }] : [];
  });
}

const memberIdsOf = (slots: readonly { memberId: number | null }[]) =>
  slots.flatMap((s) => (s.memberId != null ? [s.memberId] : []));

/**
 * Apply whole-side changes atomically. Throws `SelectionError` (and
 * writes nothing) for: a side not found (404); a side — or a member taken from
 * a side — the actor may not edit (403); a finalised side or a stale version
 * (409); not 12 (or a legacy 11) slots, a member twice in the round, an unknown member or a
 * newly placed inactive one (400). Returns the section of the first change.
 */
export async function saveBoard(
  tenantId: number,
  actor: SelectionActor,
  input: readonly SideChange[],
  now: Date = new Date(),
): Promise<{ section: SquadSection; selectionIds: number[] }> {
  if (input.length === 0) throw new SelectionError(400, "Nothing to save.");
  const ids = input.map((c) => c.selectionId);
  if (new Set(ids).size !== ids.length) {
    throw new SelectionError(400, "Each side can appear only once in a save.");
  }
  // 12 slots; an older client's 11 read as an empty 12th.
  const changes = input.map((c) => {
    if (c.slots.length !== SIDE_SIZE && c.slots.length !== XI_SIZE) {
      throw new SelectionError(400, `A side has exactly ${SIDE_SIZE} slots.`);
    }
    return { ...c, slots: normaliseSlots(c.slots) };
  });
  const rule = await selectionRule(tenantId);

  return db.transaction(async (tx) => {
    const [first] = await tx
      .select({ roundId: selectionsTable.roundId })
      .from(selectionsTable)
      .where(and(eq(selectionsTable.tenantId, tenantId), eq(selectionsTable.id, ids[0])));
    if (!first) throw new SelectionError(404, "Side not found.");
    await assertRoundOpen(tenantId, first.roundId, now);
    const sides = await lockRound(tx, tenantId, first.roundId);
    const sideOf = new Map(sides.map((s) => [s.selection.id, s]));
    for (const id of ids) {
      if (!sideOf.has(id)) throw new SelectionError(404, "Side not found.");
    }

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

    for (const c of changes) {
      const before = new Set(memberIdsOf(sideOf.get(c.selectionId)!.selection.slots));
      for (const id of memberIdsOf(c.slots)) {
        const m = memberOf.get(id);
        if (!m) throw new SelectionError(400, "A player in the side isn't on the club's register.");
        if (!before.has(id) && !m.active) {
          throw new SelectionError(400, `${nameOf(id)} isn't an active squad member.`);
        }
      }
    }

    // A player can be in several sides of a round (a junior playing up, a senior
    // on Saturday and Sunday), but only once in a side.
    for (const c of changes) {
      const ids = memberIdsOf(c.slots);
      const dup = ids.find((id, i) => ids.indexOf(id) !== i);
      if (dup != null) {
        const { fixture } = sideOf.get(c.selectionId)!;
        throw new SelectionError(400, `${nameOf(dup)} is in ${fixture.grade} twice.`);
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
      const inXi = xiMemberIds(slots);
      // A captain or keeper must be in their own XI (not the 12th); otherwise the role clears.
      const rolesCleared: {
        role: "captain" | "keeper";
        memberId: number;
        name: string;
        twelfth?: true;
      }[] = [];
      const clear = (role: "captain" | "keeper", id: number) =>
        rolesCleared.push({
          role,
          memberId: id,
          name: nameOf(id),
          ...(inSide.has(id) ? { twelfth: true as const } : {}),
        });
      let captain = c.captainMemberId;
      let keeper = c.keeperMemberId;
      if (captain != null && !inXi.has(captain)) {
        clear("captain", captain);
        captain = null;
      }
      if (keeper != null && !inXi.has(keeper)) {
        clear("keeper", keeper);
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
        JSON.stringify(normaliseSlots(selection.slots).map((s) => s.memberId)) !==
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
    return { section: sideSection(firstSide.fixture), selectionIds: ids };
  });
}

// --- PlayHQ's published side ---

/** Sizes of the non-empty lists PlayHQ has published for these fixtures, keyed "kind:id". */
async function loadPlayhqListSizes(
  tenantId: number,
  fixtures: readonly Pick<SideFixture, "kind" | "id">[],
): Promise<Map<string, number>> {
  const senior = fixtures.filter((f) => f.kind === "senior").map((f) => f.id);
  const junior = fixtures.filter((f) => f.kind === "junior").map((f) => f.id);
  const [s, j] = await Promise.all([
    senior.length > 0
      ? db
          .select({ id: teamListsTable.fixtureId, players: teamListsTable.players })
          .from(teamListsTable)
          .where(
            and(
              eq(teamListsTable.tenantId, tenantId),
              eq(teamListsTable.source, "playhq"),
              inArray(teamListsTable.fixtureId, senior),
            ),
          )
      : [],
    junior.length > 0
      ? db
          .select({
            id: juniorTeamListsTable.juniorFixtureId,
            players: juniorTeamListsTable.players,
          })
          .from(juniorTeamListsTable)
          .where(
            and(
              eq(juniorTeamListsTable.tenantId, tenantId),
              eq(juniorTeamListsTable.source, "playhq"),
              inArray(juniorTeamListsTable.juniorFixtureId, junior),
            ),
          )
      : [],
  ]);
  const out = new Map<string, number>();
  for (const r of s) if (r.players.length > 0) out.set(`senior:${r.id}`, r.players.length);
  for (const r of j) if (r.players.length > 0) out.set(`junior:${r.id}`, r.players.length);
  return out;
}

/**
 * Replace a draft side with the side PlayHQ has published for its fixture
 * (synced from PlayHQ into the fixture's team list). Each PlayHQ player is
 * matched to a squad member as a draft is seeded: a member placed in another
 * side of the round, or nobody, leaves a named gap. Captain and keeper come
 * from PlayHQ's roles. Same refusals as a save: rights, finalised, stale
 * version, started; 404 when PlayHQ has published no side yet.
 */
export async function syncSideFromPlayhq(
  tenantId: number,
  actor: SelectionActor,
  selectionId: number,
  version: number,
  now: Date = new Date(),
): Promise<{ section: SquadSection; matched: number; gaps: number }> {
  const rule = await selectionRule(tenantId);
  return db.transaction(async (tx) => {
    const { selection, fixture } = await lockSide(tx, tenantId, selectionId);
    await assertRoundOpen(tenantId, selection.roundId, now);
    const right = selectionRight(actor, rule, fixture.grade);
    if (!right.allowed) {
      throw new SelectionError(403, `${fixture.grade} is read-only to you. ${right.reason}`);
    }
    if (selection.state === "final") {
      throw new SelectionError(409, `${fixture.grade} is finalised. Re-open it to make changes.`);
    }
    if (selection.version !== version) {
      throw new SelectionError(
        409,
        `${fixture.grade} was changed by someone else. Reload to see the latest side.`,
      );
    }
    const section = sideSection(fixture);
    const members = (
      await tx
        .select({
          id: squadMembersTable.id,
          firstName: squadMembersTable.firstName,
          lastName: squadMembersTable.lastName,
          preferredName: squadMembersTable.preferredName,
          linkedPlayerId: squadMembersTable.linkedPlayerId,
          active: squadMembersTable.active,
          gradeHint: squadMembersTable.gradeHint,
          playhqProfileId: squadMembersTable.playhqProfileId,
          section: squadMembersTable.section,
        })
        .from(squadMembersTable)
        .where(eq(squadMembersTable.tenantId, tenantId))
    ).filter((m) => section === "senior" || m.section === "junior");
    // Juniors play up in senior sides; a junior side takes juniors only. A name on
    // both registers is the senior record in a senior side.

    let list: TeamListPlayer[] = [];
    if (fixture.kind === "junior") {
      const [row] = await tx
        .select({ players: juniorTeamListsTable.players })
        .from(juniorTeamListsTable)
        .where(
          and(
            eq(juniorTeamListsTable.tenantId, tenantId),
            eq(juniorTeamListsTable.juniorFixtureId, fixture.id),
            eq(juniorTeamListsTable.source, "playhq"),
          ),
        );
      if (row) list = (await juniorListAsNames(tx, tenantId, members))(row.players);
    } else {
      const [row] = await tx
        .select({ players: teamListsTable.players })
        .from(teamListsTable)
        .where(
          and(
            eq(teamListsTable.tenantId, tenantId),
            eq(teamListsTable.fixtureId, fixture.id),
            eq(teamListsTable.source, "playhq"),
          ),
        );
      if (row) list = row.players;
    }
    if (list.length === 0) {
      throw new SelectionError(404, `PlayHQ hasn't published a side for ${fixture.grade} yet.`);
    }

    // PlayHQ overrules: a player named there goes in, whatever other sides
    // of the round hold (juniors play up, seniors play Saturday and Sunday).
    const draft = buildDraftSlots({
      lastList: list,
      members,
      prefer: (m) => members.find((x) => x.id === m.id)?.section === section,
      // `members` is already the side's section, so a remembered match can't widen it.
      participants: await loadParticipantCrosswalk(tx, tenantId),
    });
    await tx
      .update(selectionsTable)
      .set({
        slots: draft.slots,
        captainMemberId: draft.captainMemberId,
        keeperMemberId: draft.keeperMemberId,
        version: selection.version + 1,
        updatedAt: now,
      })
      .where(and(eq(selectionsTable.id, selection.id), eq(selectionsTable.tenantId, tenantId)));
    const matched = draft.slots.filter((x) => x.memberId != null).length;
    const gaps = draft.slots.filter((x) => x.gap != null).length;
    await tx.insert(selectionEventsTable).values({
      tenantId,
      selectionId: selection.id,
      actorKind: actor.kind,
      actorId: actor.id,
      actorName: actor.name,
      action: "playhq_sync",
      detail: { playhqPlayers: list.length, matched, gaps },
      createdAt: now,
    });
    return { section, matched, gaps };
  });
}

// --- Junior sides ---

type JuniorPublishMember = Pick<
  SquadMemberRow,
  "id" | "firstName" | "lastName" | "preferredName" | "playhqProfileId"
>;

/**
 * Publish a junior side as its fixture's `junior_team_lists` row (source
 * "selection", published). Junior lists hold PlayHQ participant ids, never
 * names, so each member is matched to one of the club's junior participants
 * (`juniorMemberResolver`); anyone who matches none is left off and named in
 * `unlisted`. A list PlayHQ supplied is never replaced.
 */
async function publishJuniorSide(
  tx: Tx,
  tenantId: number,
  juniorFixtureId: number,
  side: Pick<SelectionRow, "slots" | "captainMemberId" | "keeperMemberId">,
  members: readonly JuniorPublishMember[],
): Promise<{ players: JuniorTeamListPlayer[]; unlisted: string[] }> {
  const { participants, merges } = await loadJuniorIdentity(tx, tenantId);
  const resolve = juniorMemberResolver(participants, merges);
  const byId = new Map(members.map((m) => [m.id, m]));
  const players: JuniorTeamListPlayer[] = [];
  const unlisted: string[] = [];
  const used = new Set<string>();
  normaliseSlots(side.slots).forEach((slot, index) => {
    const m = slot.memberId == null ? undefined : byId.get(slot.memberId);
    if (!m) return;
    const participantId = resolve(m);
    if (!participantId || used.has(participantId)) {
      unlisted.push(memberDisplayName(m));
      return;
    }
    used.add(participantId);
    const twelfth = index === TWELFTH_INDEX;
    const role = twelfth ? undefined : roleOf(m.id, side);
    players.push({
      order: twelfth ? SIDE_SIZE : players.filter((p) => p.order <= XI_SIZE).length + 1,
      participantId,
      ...(role ? { role } : {}),
    });
  });
  try {
    await tx
      .insert(juniorTeamListsTable)
      .values({ tenantId, juniorFixtureId, players, isPublished: true, source: "selection" })
      .onConflictDoUpdate({
        target: [juniorTeamListsTable.tenantId, juniorTeamListsTable.juniorFixtureId],
        set: { players, isPublished: true, source: "selection", updatedAt: new Date() },
        setWhere: ne(juniorTeamListsTable.source, "playhq"),
      });
  } catch (e) {
    // A database that missed migration 0043's widened source check (the publish
    // schema sync doesn't rewrite a CHECK) refuses the row: say so plainly.
    const code =
      (e as { code?: string } | null)?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
    if (code === "23514") {
      throw new SelectionError(
        503,
        "Junior sides can't be published yet: the club's database is missing an update (junior team list source 'selection', migration 0043). Ask your Ovation admin to apply it.",
      );
    }
    throw e;
  }
  return { players, unlisted };
}

/** Drop a withdrawn member from a junior side's published Hub list. */
async function withdrawFromJuniorList(
  tx: Tx,
  tenantId: number,
  juniorFixtureId: number,
  member: JuniorPublishMember,
): Promise<void> {
  const [list] = await tx
    .select()
    .from(juniorTeamListsTable)
    .where(
      and(
        eq(juniorTeamListsTable.tenantId, tenantId),
        eq(juniorTeamListsTable.juniorFixtureId, juniorFixtureId),
        eq(juniorTeamListsTable.source, "selection"),
      ),
    );
  if (!list) return;
  const { participants, merges } = await loadJuniorIdentity(tx, tenantId);
  const participantId = juniorMemberResolver(participants, merges)(member);
  if (!participantId) return;
  const players = list.players
    .filter((p) => p.participantId !== participantId)
    .map((p, i) => (p.order > XI_SIZE ? p : { ...p, order: i + 1 }));
  if (players.length === list.players.length) return;
  await tx
    .update(juniorTeamListsTable)
    .set({ players, updatedAt: new Date() })
    .where(and(eq(juniorTeamListsTable.id, list.id), eq(juniorTeamListsTable.tenantId, tenantId)));
}

// --- Finalise and re-open ---

/** Lock one side of the tenant with its fixture, or throw 404. */
async function lockSide(tx: Tx, tenantId: number, selectionId: number): Promise<LockedSide> {
  const [selection] = await tx
    .select()
    .from(selectionsTable)
    .where(and(eq(selectionsTable.tenantId, tenantId), eq(selectionsTable.id, selectionId)))
    .for("update");
  if (!selection) throw new SelectionError(404, "Side not found.");
  const fixture = await loadSideFixture(tx, tenantId, selection);
  if (!fixture) throw new SelectionError(404, "Side not found.");
  return { selection, fixture };
}

/**
 * A player can't withdraw (from their availability link) once the match has
 * started. A captain or admin can still sync, finalise and re-open a side after
 * the start, to publish it and print the team sheet.
 */
function refuseIfStarted(fixture: SideFixture, now: Date, action: string): void {
  if (fixture.startAt.getTime() <= now.getTime()) {
    throw new SelectionError(
      409,
      `${fixture.grade} v ${fixture.opponentName} has started, so the side can't be ${action}.`,
    );
  }
}

/** The name a team list shows: a private member is "Private Player", as on central. */
export { PRIVATE_PLAYER } from "./selection-published-players";

/** The team-list role for a member of the side. */
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
  messaged: { selected: number; deselected: number; failed: number };
  /**
   * Junior side: players left off the published junior team list because they
   * match none of the club's PlayHQ junior participants.
   */
  unlisted: string[];
};

/**
 * Finalise a side at the version the caller loaded: lock it, publish its XI as
 * the fixture's team list (source "selection", published; a list PlayHQ
 * supplied is left alone), then message the members newly selected since the
 * last finalise and — on a re-finalise — those dropped. The notified set is
 * stored in the same transaction, so a concurrent second finalise can't
 * message anyone twice. Messaging is best-effort: a member every delivery
 * failed for is counted and taken back out of the notified set (a failed
 * "dropped" message is put back in), so the next finalise tries them again.
 */
export async function finaliseSelection(
  tenantId: number,
  actor: SelectionActor,
  selectionId: number,
  version: number,
  opts: { now?: Date; req?: Request; logger?: Logger } = {},
): Promise<FinaliseResult> {
  const now = opts.now ?? new Date();
  const rule = await selectionRule(tenantId);
  const settings = await loadAvailabilitySettings(tenantId);

  const plan = await db.transaction(async (tx) => {
    const { selection, fixture } = await lockSide(tx, tenantId, selectionId);
    await assertRoundOpen(tenantId, selection.roundId, now);
    const right = selectionRight(actor, rule, fixture.grade);
    if (!right.allowed) {
      throw new SelectionError(403, `${fixture.grade} is read-only to you. ${right.reason}`);
    }
    if (selection.state === "final")
      throw new SelectionError(409, `${fixture.grade} is already final.`);
    if (selection.version !== version) {
      throw new SelectionError(
        409,
        `${fixture.grade} was changed by someone else. Reload to see the latest side.`,
      );
    }

    const sideSlots = normaliseSlots(selection.slots);
    const picked = memberIdsOf(sideSlots);
    const twelfthId = sideSlots[TWELFTH_INDEX]?.memberId ?? null;
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
    let players: { order: number }[];
    let unlisted: string[] = [];
    if (fixture.kind === "junior") {
      const published = await publishJuniorSide(tx, tenantId, fixture.id, selection, members);
      players = published.players;
      unlisted = published.unlisted;
    } else {
      const participantIds =
        sideSection(fixture) === "senior"
          ? await loadSelectionParticipantIds(tx, tenantId, fixture.startAt)
          : new Map<number, string>();
      const list = selectionPublishedPlayers(selection, members, participantIds);
      players = list;
      await tx
        .insert(teamListsTable)
        .values({
          tenantId,
          fixtureId: fixture.id,
          players: list,
          isPublished: true,
          source: "selection",
        })
        .onConflictDoUpdate({
          target: [teamListsTable.tenantId, teamListsTable.fixtureId],
          set: { players: list, isPublished: true, source: "selection" },
          // PlayHQ's list for the fixture is never replaced.
          setWhere: ne(teamListsTable.source, "playhq"),
        });
    }

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
        open: XI_SIZE - players.filter((p) => p.order <= XI_SIZE).length,
        twelfth: twelfthId != null && memberOf.has(twelfthId),
        captainMemberId: selection.captainMemberId,
        keeperMemberId: selection.keeperMemberId,
        notified: { selected: toSelect, deselected: toDeselect },
        ...(unlisted.length > 0 ? { unlisted } : {}),
      },
      createdAt: now,
    });
    return { selection, fixture, toSelect, toDeselect, twelfthId, unlisted };
  });

  const { selection, fixture } = plan;
  // A club not using availability publishes the side without messaging anyone,
  // and nobody is messaged once the match has started.
  const started = fixture.startAt.getTime() <= now.getTime();
  const toMessage = settings?.enabled && !started ? [...plan.toSelect, ...plan.toDeselect] : [];
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
  const logger = opts.logger ?? defaultLogger;
  const messaged = { selected: 0, deselected: 0, failed: 0 };
  const failed = { selected: [] as number[], deselected: [] as number[] };
  const batch: MessageBatch = {};
  const send = async (id: number, kind: "selected" | "deselected") => {
    const member = rowOf.get(id);
    if (!member) return;
    let ok: boolean;
    try {
      const out = await messageMember(
        {
          tenantId,
          member,
          kind,
          context: {
            roundId: selection.roundId,
            fixture: matchFixture,
            role:
              kind === "selected" && id !== plan.twelfthId ? (roleOf(id, selection) ?? null) : null,
            twelfth: kind === "selected" && id === plan.twelfthId,
            req: opts.req,
          },
          smsEnabled: settings?.smsEnabled ?? true,
          now,
          batch,
        },
        logger,
      );
      if (out.results.length === 0) return;
      // Failed entirely: nothing went out and a channel failed (not merely off or opted out).
      ok =
        out.results.some((r) => r.sms === "sent" || r.email === "sent") ||
        !out.results.some((r) => r.sms === "failed" || r.email === "failed");
    } catch (err) {
      // Ids and the error's type only: a message could carry a contact.
      logger.warn(
        {
          tenantId,
          selectionId: selection.id,
          memberId: id,
          error: err instanceof Error ? err.name : typeof err,
        },
        "selection message failed",
      );
      ok = false;
    }
    if (ok) messaged[kind]++;
    else {
      messaged.failed++;
      failed[kind].push(id);
    }
  };
  for (const id of plan.toSelect) await send(id, "selected");
  for (const id of plan.toDeselect) await send(id, "deselected");

  if (failed.selected.length > 0 || failed.deselected.length > 0) {
    try {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select({ notifiedMemberIds: selectionsTable.notifiedMemberIds })
          .from(selectionsTable)
          .where(and(eq(selectionsTable.id, selection.id), eq(selectionsTable.tenantId, tenantId)))
          .for("update");
        if (!row) return;
        const unsent = new Set(failed.selected);
        const notified = row.notifiedMemberIds.filter((id) => !unsent.has(id));
        for (const id of failed.deselected) if (!notified.includes(id)) notified.push(id);
        await tx
          .update(selectionsTable)
          .set({ notifiedMemberIds: notified })
          .where(and(eq(selectionsTable.id, selection.id), eq(selectionsTable.tenantId, tenantId)));
      });
    } catch (err) {
      logger.warn(
        { err, tenantId, selectionId: selection.id },
        "selection notified set not updated",
      );
    }
  }
  return { section: sideSection(fixture), messaged, unlisted: plan.unlisted };
}

/**
 * Re-open a finalised side: back to draft and logged. The published team
 * list stays as last finalised until the next finalise.
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
    await assertRoundOpen(tenantId, selection.roundId, now);
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
    return { section: sideSection(fixture) };
  });
}

// --- "Can't make it" ---

/**
 * A selected player withdraws: in every side of the round holding them,
 * their slot becomes a gap "was <name> · withdrew", any captain or keeper role
 * they held clears, a finalised side returns to draft, and their entry is
 * removed from the fixture's published Hub list (the rest stays
 * published). They leave the side's notified set, so a re-finalise doesn't
 * also send them a "no longer selected" message. Captains and admins are alerted.
 * Returns the sides changed; none when the member isn't placed. Throws a 409
 * `SelectionError` (and changes nothing) once a side holding them has started.
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
  await assertRoundOpen(tenantId, roundId, now);
  const name = memberDisplayName(member);

  const changed = await db.transaction(async (tx) => {
    const sides = (await lockRound(tx, tenantId, roundId)).filter((s) =>
      s.selection.slots.some((slot) => slot.memberId === memberId),
    );
    for (const { fixture } of sides) refuseIfStarted(fixture, now, "changed");
    const out: LockedSide[] = [];
    for (const side of sides) {
      const { selection, fixture } = side;
      const slots: SelectionSlot[] = normaliseSlots(selection.slots).map((s) =>
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
      if (fixture.kind === "junior") {
        await withdrawFromJuniorList(tx, tenantId, fixture.id, member);
      }
      const [list] =
        fixture.kind === "senior"
          ? await tx
              .select()
              .from(teamListsTable)
              .where(
                and(
                  eq(teamListsTable.tenantId, tenantId),
                  eq(teamListsTable.fixtureId, fixture.id),
                  eq(teamListsTable.source, "selection"),
                ),
              )
          : [];
      if (list) {
        const linked =
          member.linkedPlayerId != null && member.linkedPlayerId < FILL_IN_THRESHOLD
            ? member.linkedPlayerId
            : null;
        // A private member not named publicly is listed without an id as "Private
        // Player": drop one such entry, preferring the one with the role they held.
        const masked = !namedPublicly(member, now);
        const key = normaliseName(publicName(member, now));
        const role = roleOf(memberId, selection);
        const privateAt = masked
          ? (() => {
              const at = list.players
                .map((p, i) => [p, i] as const)
                .filter(([p]) => p.playerId == null && normaliseName(p.displayName) === key);
              return (at.find(([p]) => p.role === role) ?? at[0])?.[1] ?? -1;
            })()
          : -1;
        const players = list.players
          .filter((p, i) =>
            masked
              ? i !== privateAt
              : linked != null && p.playerId != null
                ? p.playerId !== linked
                : normaliseName(p.displayName) !== key,
          )
          // The XI renumbers; a 12th player keeps order 12.
          .map((p, i) => (p.order > XI_SIZE ? p : { ...p, order: i + 1 }));
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
