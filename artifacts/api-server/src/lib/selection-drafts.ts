import { and, asc, desc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import {
  db,
  availabilityAwayTable,
  availabilitySettingsTable,
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
  type SelectionSlot,
  type TeamListPlayer,
} from "@workspace/db";
import {
  addDays,
  buildMemberMatcher,
  memberDisplayName,
  normaliseParticipantId,
  perthDate,
  roundWindow,
  type MemberIdentity,
  type ParticipantCrosswalk,
} from "./availability-grades";
import {
  DEFAULT_SIDE_SIZE,
  XI_SIZE,
  normaliseSlots,
  roleMemberIds,
  sideShape,
  twelfthMemberId,
  type SideShape,
  type SideSpec,
} from "@workspace/scorecard/selection-shape";
import { loadParticipantCrosswalk } from "./participant-crosswalk";
import { loadJuniorIdentity } from "./junior-shirt-numbers";
import { loadSideFixtures, sideFixtureKey } from "./selection-fixtures";
import { juniorMemberResolver } from "./shirt-number-squad";
import { gradeSideSpec, type SideSettings } from "./side-sizes";
import { juniorSideLabel } from "./selection-fixtures";

/**
 * Draft sides for a round.
 *
 * Every fixture in the round's Friday–Sunday window gets one draft `selections`
 * row. The board builds them whenever it loads the current or a future weekend
 * (ADR-008), and the availability send and cut-off build any still missing.
 *
 * A side starts from the same grade's (a junior team's) side in the previous
 * round that has one, final or draft, slot for slot with its captain and keeper
 * (`carryDraftSlots`). With no earlier selection, or when the grade has played
 * since (a newer team list), it starts from the grade's most recent earlier
 * team list (`buildDraftSlots`). Every carried player keeps their slot whatever
 * they replied: the board shows each status, so a No is flagged, not removed.
 * A listed name that matches no active member is a gap "not on register".
 * Nobody else is placed: a player who was not in the last side waits in the
 * pool, and nobody moves between grades on their own. Last game's captain and
 * keeper carry over only while still in the XI.
 *
 * Nobody is placed twice at once: fixtures are drafted in start order with one
 * round-wide ledger of placed members, seeded from the round's existing sides,
 * so a player on two grades' last sides goes to the earlier fixture and the
 * later one keeps an open slot "picked in another side". A grade with several
 * fixtures in the weekend maps them in start order to the previous round's
 * sides; a side with no earlier equivalent starts empty (only the first takes
 * the team list). An existing selection is never overwritten, so a re-run is a
 * no-op.
 */

/** Answers per member, keyed by Perth date (`YYYY-MM-DD`). */
export type ResponsesByMember = ReadonlyMap<number, ReadonlyMap<string, AvailabilityStatus>>;

export type DraftSide = {
  slots: SelectionSlot[];
  captainMemberId: number | null;
  keeperMemberId: number | null;
  /** Players in the side (12–14), from the grade's size: `selections.side_size`. */
  sideSize: number;
  /** A side of 12 where all 12 play (no "12th"): `selections.all_play`. */
  allPlay: boolean;
};

/** A side of 12 with no 12th: all 12 play. */
const isAllPlay = (shape: SideShape) => shape.size === DEFAULT_SIDE_SIZE && !shape.twelfthLabel;

const emptySlots = (size = DEFAULT_SIDE_SIZE): SelectionSlot[] =>
  Array.from({ length: size }, () => ({ memberId: null }));

/**
 * The club's side settings by grade: players per side
 * (`availability_settings.side_sizes`) and the grades whose side of 12 all
 * play (`all_play_grades`).
 */
async function loadSideSizes(tenantId: number): Promise<SideSettings> {
  const [row] = await db
    .select({
      sideSizes: availabilitySettingsTable.sideSizes,
      allPlayGrades: availabilitySettingsTable.allPlayGrades,
    })
    .from(availabilitySettingsTable)
    .where(eq(availabilitySettingsTable.tenantId, tenantId));
  return { sideSizes: row?.sideSizes ?? {}, allPlayGrades: row?.allPlayGrades ?? [] };
}

/** Members who can't play a game; the members a draft places are added. */
type Placed = { has(id: number): boolean; add(id: number): void };

/**
 * The draft for one fixture from its grade's last list (pure apart from
 * `placed`). `members` is the whole register: an entry that matches an
 * inactive member — or nobody, or a fill-in id — is a gap "not on register".
 * `placed` is the round's members already in a side at that time: such an
 * entry is a gap "picked in another side", and the members this draft places
 * are added to it. Everyone else listed is placed, whatever they replied.
 */
export function buildDraftSlots(input: {
  lastList: readonly TeamListPlayer[] | null;
  members: readonly MemberIdentity[];
  /**
   * Members who can't play this game (a clash with a side they're already in);
   * the members this draft places are added. A `Set` or a `PlacementLedger` view.
   */
  placed?: Placed;
  /** Breaks a tie between same-named members (see `buildMemberMatcher`). */
  prefer?: (m: MemberIdentity) => boolean;
  /** The club's remembered PlayHQ matches, tried first (see `buildMemberMatcher`). */
  participants?: ParticipantCrosswalk;
  /** The side's size and format (12 with a 12th when unset): the first `size` listed are placed. */
  size?: SideSpec;
}): DraftSide {
  const { lastList, members } = input;
  const elsewhere = input.placed ?? new Set<number>();
  const shape = sideShape(input.size);
  const slots = emptySlots(shape.size);
  let captainMemberId: number | null = null;
  let keeperMemberId: number | null = null;
  const sideSize = shape.size;
  const allPlay = isAllPlay(shape);
  if (!lastList || lastList.length === 0) {
    return { slots, captainMemberId, keeperMemberId, sideSize, allPlay };
  }

  const match = buildMemberMatcher(members, input.prefer, input.participants);
  const placed = new Set<number>();
  const entries = [...lastList].sort((a, b) => a.order - b.order).slice(0, shape.size);

  entries.forEach((entry, i) => {
    const m = match(entry);
    const name = entry.displayName.trim() || (m ? memberDisplayName(m) : "Unknown");
    if (!m || !m.active || placed.has(m.id)) {
      // The row's PlayHQ GUID rides on the gap, so the Hub can match it to a member.
      const participantId = entry.participantId?.trim().toLowerCase();
      slots[i] = {
        memberId: null,
        gap: { name, reason: "not_on_register", ...(participantId ? { participantId } : {}) },
      };
      return;
    }
    // Already in another side of the round: leave the slot open so a player is placed once.
    if (elsewhere.has(m.id)) {
      slots[i] = { memberId: null, gap: { name, reason: "picked_elsewhere" } };
      return;
    }
    placed.add(m.id);
    elsewhere.add(m.id);
    slots[i] = { memberId: m.id };
    // Captain and keeper come from the role slots only: a 12th player holds no
    // role, but above 12 any slot can.
    if (i >= shape.roleSlots) return;
    if (entry.role === "C" || entry.role === "C/WK") captainMemberId ??= m.id;
    if (entry.role === "WK" || entry.role === "C/WK") keeperMemberId ??= m.id;
  });

  return { slots, captainMemberId, keeperMemberId, sideSize, allPlay };
}

/**
 * The draft for one fixture carried over from the previous round's side (pure
 * apart from `placed`): slot for slot, the 12th staying 12th. A member no
 * longer active is a gap "not on register"; one already placed at the time a
 * gap "picked in another side". A carried "not on register" gap (an unmatched
 * PlayHQ name) is kept as it was, unless the club has since remembered its
 * PlayHQ participant (`participants`), when that member takes the slot; other
 * open slots start empty. The captain and keeper carry while still in a role
 * slot (the XI at 12, any slot above). The new side has its own size: a
 * previous side longer than it carries its first `size` slots.
 */
export function carryDraftSlots(input: {
  previous: Pick<SelectionRow, "slots" | "captainMemberId" | "keeperMemberId">;
  members: readonly MemberIdentity[];
  placed?: Placed;
  /** The club's remembered PlayHQ matches, for a carried "not on register" gap. */
  participants?: ParticipantCrosswalk;
  /** The new side's size and format (12 with a 12th when unset). */
  size?: SideSpec;
}): DraftSide {
  const elsewhere = input.placed ?? new Set<number>();
  const byId = new Map(input.members.map((m) => [m.id, m]));
  const shape = sideShape(input.size);
  const sideSize = shape.size;
  const slots = emptySlots(sideSize);
  const placed = new Set<number>();
  normaliseSlots(input.previous.slots, sideSize)
    .slice(0, sideSize)
    .forEach((slot, i) => {
      let memberId = slot.memberId;
      if (memberId == null) {
        const gap = slot.gap?.reason === "not_on_register" ? slot.gap : null;
        const key = normaliseParticipantId(gap?.participantId);
        const remembered = key != null ? input.participants?.get(key) : undefined;
        if (!gap || remembered == null || !byId.has(remembered)) {
          if (gap) slots[i] = { memberId: null, gap: { ...gap } };
          return;
        }
        memberId = remembered;
      }
      const m = byId.get(memberId);
      const name = m ? memberDisplayName(m) : "Unknown";
      if (!m || !m.active || placed.has(m.id)) {
        slots[i] = { memberId: null, gap: { name, reason: "not_on_register" } };
        return;
      }
      if (elsewhere.has(m.id)) {
        slots[i] = { memberId: null, gap: { name, reason: "picked_elsewhere" } };
        return;
      }
      placed.add(m.id);
      elsewhere.add(m.id);
      slots[i] = { memberId: m.id };
    });
  const roleIds = roleMemberIds(slots, input.size);
  const role = (id: number | null) => (id != null && roleIds.has(id) ? id : null);
  return {
    slots,
    captainMemberId: role(input.previous.captainMemberId),
    keeperMemberId: role(input.previous.keeperMemberId),
    sideSize,
    allPlay: isAllPlay(shape),
  };
}

/** Where a draft side started from, for its draft event. */
export type SeededFrom =
  | { kind: "selection"; id: number; fixtureId?: number; juniorFixtureId?: number }
  | { kind: "team_list"; id: number; fixtureId?: number; juniorFixtureId?: number }
  | null;

/** A side of an earlier round, as a seed. */
type PriorSide = {
  selectionId: number;
  fixtureId: number;
  weekendDate: string;
  startAt: Date;
  slots: SelectionSlot[];
  captainMemberId: number | null;
  keeperMemberId: number | null;
};

/**
 * Per key (a grade, or a junior team), the sides of the latest earlier round in
 * which any of that key's sides has a player, in start order. `rows` come
 * newest weekend first, then by start.
 */
function previousSides<T extends PriorSide>(
  rows: readonly T[],
  key: (r: T) => string,
): Map<string, T[]> {
  const byWeekend = new Map<string, Map<string, T[]>>();
  for (const r of rows) {
    const k = key(r);
    const weeks = byWeekend.get(k) ?? new Map<string, T[]>();
    weeks.set(r.weekendDate, [...(weeks.get(r.weekendDate) ?? []), r]);
    byWeekend.set(k, weeks);
  }
  const out = new Map<string, T[]>();
  for (const [k, weeks] of byWeekend) {
    // Map iteration keeps insertion order: newest weekend first.
    for (const sides of weeks.values()) {
      if (sides.some((s) => s.slots.some((x) => x.memberId != null))) {
        out.set(k, sides);
        break;
      }
    }
  }
  return out;
}

/**
 * The seed for the `index`-th fixture of a grade (or junior team) this weekend:
 * the previous round's side at the same position, else — for the first fixture
 * only — the last team list. A team list from a game after the previous
 * round's sides (the grade played a weekend the Hub didn't draft) wins over
 * them, so a draft never starts from a stale side.
 */
function pickSeed<L extends { startAt: Date | null }>(
  prior: readonly PriorSide[] | undefined,
  lastList: L | undefined,
  index: number,
): { kind: "selection"; side: PriorSide } | { kind: "team_list"; list: L } | null {
  const newest = prior?.reduce((t, s) => Math.max(t, s.startAt.getTime()), 0) ?? 0;
  const listNewer = lastList?.startAt != null && lastList.startAt.getTime() > newest;
  const side = !listNewer ? prior?.[index] : undefined;
  if (side && side.slots.some((x) => x.memberId != null || x.gap)) {
    return { kind: "selection", side };
  }
  if (index === 0 && lastList) return { kind: "team_list", list: lastList };
  return null;
}

export type RoundDraftSummary = {
  /** Selections created by this run. */
  created: number;
  /** Fixtures in the window that already had a selection. */
  skipped: number;
  /** Ids of the selections created, for the "drafts ready" notice. */
  selectionIds: number[];
};

/** When a side's game runs, for clash checks: start to start + its length. */
export type GameWindow = { from: number; to: number };

const HOUR = 3_600_000;

/**
 * A game's window. A T20 (or shorter) game or a junior game is about 3.5 hours;
 * anything else (a one-day or multi-day day's play) about 7. Two games clash
 * only when their windows overlap, so a player can play Saturday and Sunday, a
 * junior game and a senior one, or two T20s with spaced start times.
 */
export function gameWindow(
  startAt: Date,
  opts: { format?: string | null; junior?: boolean } = {},
): GameWindow {
  const short = opts.junior || /\bt\s?(10|20)\b|twenty/i.test(opts.format ?? "");
  const from = startAt.getTime();
  return { from, to: from + (short ? 3.5 : 7) * HOUR };
}

/**
 * Who is already playing when. A member clashes with a game only when one of
 * their placed games overlaps it in time; `view` gives `buildDraftSlots` the
 * set-like `placed` for one game.
 */
export class PlacementLedger {
  private readonly games = new Map<number, GameWindow[]>();

  place(memberId: number, w: GameWindow): void {
    const list = this.games.get(memberId) ?? [];
    list.push(w);
    this.games.set(memberId, list);
  }

  clashes(memberId: number, w: GameWindow): boolean {
    return (this.games.get(memberId) ?? []).some((g) => g.from < w.to && w.from < g.to);
  }

  view(w: GameWindow): { has(id: number): boolean; add(id: number): void } {
    return { has: (id) => this.clashes(id, w), add: (id) => this.place(id, w) };
  }
}

/** The ledger of a round's existing sides (senior and junior), by their games' times. */
async function roundLedger(tenantId: number, roundId: number): Promise<PlacementLedger> {
  const rows = await db
    .select({
      fixtureId: selectionsTable.fixtureId,
      juniorFixtureId: selectionsTable.juniorFixtureId,
      slots: selectionsTable.slots,
    })
    .from(selectionsTable)
    .where(and(eq(selectionsTable.tenantId, tenantId), eq(selectionsTable.roundId, roundId)));
  const fixtures = await loadSideFixtures(db, tenantId, rows);
  const ledger = new PlacementLedger();
  for (const r of rows) {
    const f = fixtures.get(sideFixtureKey(r));
    if (!f) continue;
    const w = gameWindow(f.startAt, {
      format: f.senior?.matchFormat ?? null,
      junior: f.kind === "junior",
    });
    for (const slot of r.slots) if (slot.memberId != null) ledger.place(slot.memberId, w);
  }
  return ledger;
}

/**
 * Creates the draft selection for every fixture in the round's window that has
 * none yet. Tenant-scoped throughout: a round id from another tenant finds no
 * round and creates nothing. Safe to run concurrently: a side another run
 * created first is counted as skipped (the per-fixture unique key).
 */
export async function buildRoundDrafts(
  tenantId: number,
  roundId: number,
  now: Date = new Date(),
): Promise<RoundDraftSummary> {
  const summary: RoundDraftSummary = { created: 0, skipped: 0, selectionIds: [] };
  const [round] = await db
    .select()
    .from(availabilityRoundsTable)
    .where(
      and(eq(availabilityRoundsTable.id, roundId), eq(availabilityRoundsTable.tenantId, tenantId)),
    );
  if (!round) return summary;

  const window = roundWindow(round.weekendDate);
  const fixtures = await db
    .select({
      id: fixturesTable.id,
      grade: fixturesTable.grade,
      startAt: fixturesTable.startAt,
      matchFormat: fixturesTable.matchFormat,
    })
    .from(fixturesTable)
    .where(
      and(
        eq(fixturesTable.tenantId, tenantId),
        gte(fixturesTable.startAt, window.from),
        lt(fixturesTable.startAt, window.to),
      ),
    )
    .orderBy(asc(fixturesTable.startAt), asc(fixturesTable.id));
  // Who already plays when, across every side of the round (senior and junior).
  const ledger = await roundLedger(tenantId, roundId);
  if (fixtures.length === 0) return draftJuniorSides(tenantId, round, now, summary, ledger);

  // Sides already drafted: their fixtures are skipped and their members are
  // placed, along with anyone in another side of this round.
  const existingRows = await db
    .select({
      fixtureId: selectionsTable.fixtureId,
      slots: selectionsTable.slots,
    })
    .from(selectionsTable)
    .where(
      and(
        eq(selectionsTable.tenantId, tenantId),
        or(
          eq(selectionsTable.roundId, roundId),
          inArray(
            selectionsTable.fixtureId,
            fixtures.map((f) => f.id),
          ),
        ),
      ),
    );
  const existing = new Set(existingRows.map((r) => r.fixtureId));

  // Each grade's most recent non-empty team list from before the round, and its
  // sides in the latest earlier round that drafted the grade.
  const grades = [...new Set(fixtures.map((f) => f.grade))];
  const [lastLists, priorRows] = await Promise.all([
    db
      .selectDistinctOn([fixturesTable.grade], {
        grade: fixturesTable.grade,
        fixtureId: fixturesTable.id,
        startAt: fixturesTable.startAt,
        teamListId: teamListsTable.id,
        players: teamListsTable.players,
      })
      .from(fixturesTable)
      .innerJoin(
        teamListsTable,
        and(
          eq(teamListsTable.fixtureId, fixturesTable.id),
          eq(teamListsTable.tenantId, fixturesTable.tenantId),
        ),
      )
      .where(
        and(
          eq(fixturesTable.tenantId, tenantId),
          inArray(fixturesTable.grade, grades),
          lt(fixturesTable.startAt, window.from),
          sql`jsonb_array_length(${teamListsTable.players}) > 0`,
        ),
      )
      .orderBy(fixturesTable.grade, desc(fixturesTable.startAt), desc(fixturesTable.id)),
    db
      .select({
        selectionId: selectionsTable.id,
        fixtureId: fixturesTable.id,
        grade: fixturesTable.grade,
        weekendDate: availabilityRoundsTable.weekendDate,
        startAt: fixturesTable.startAt,
        slots: selectionsTable.slots,
        captainMemberId: selectionsTable.captainMemberId,
        keeperMemberId: selectionsTable.keeperMemberId,
      })
      .from(selectionsTable)
      .innerJoin(
        availabilityRoundsTable,
        and(
          eq(availabilityRoundsTable.id, selectionsTable.roundId),
          eq(availabilityRoundsTable.tenantId, selectionsTable.tenantId),
        ),
      )
      .innerJoin(
        fixturesTable,
        and(
          eq(fixturesTable.id, selectionsTable.fixtureId),
          eq(fixturesTable.tenantId, selectionsTable.tenantId),
        ),
      )
      .where(
        and(
          eq(selectionsTable.tenantId, tenantId),
          lt(availabilityRoundsTable.weekendDate, round.weekendDate),
          inArray(fixturesTable.grade, grades),
        ),
      )
      .orderBy(
        desc(availabilityRoundsTable.weekendDate),
        asc(fixturesTable.startAt),
        asc(selectionsTable.id),
      ),
  ]);
  const lastByGrade = new Map(lastLists.map((l) => [l.grade, l]));
  const priorByGrade = previousSides(priorRows, (r) => r.grade);
  // Each new side is fixed at its grade's size now; a later change never reshapes it.
  const sideSizes = await loadSideSizes(tenantId);

  const members = await db
    .select({
      id: squadMembersTable.id,
      firstName: squadMembersTable.firstName,
      lastName: squadMembersTable.lastName,
      preferredName: squadMembersTable.preferredName,
      linkedPlayerId: squadMembersTable.linkedPlayerId,
      active: squadMembersTable.active,
      gradeHint: squadMembersTable.gradeHint,
      section: squadMembersTable.section,
    })
    .from(squadMembersTable)
    .where(eq(squadMembersTable.tenantId, tenantId));
  // Juniors play up in senior sides, so every member is matched; a name on both
  // registers is the senior record.
  const seniorRecord = new Set(members.filter((m) => m.section === "senior").map((m) => m.id));
  const participants = await loadParticipantCrosswalk(db, tenantId);

  // Each grade's fixtures this weekend, in start order, map to its previous sides.
  const gradeIndex = new Map<string, number>();
  for (const f of fixtures) {
    const index = gradeIndex.get(f.grade) ?? 0;
    gradeIndex.set(f.grade, index + 1);
    if (existing.has(f.id)) {
      summary.skipped++;
      continue;
    }
    const seed = pickSeed(priorByGrade.get(f.grade), lastByGrade.get(f.grade), index);
    const placed = ledger.view(gameWindow(f.startAt, { format: f.matchFormat }));
    const size = gradeSideSpec(sideSizes, f.grade);
    const draft =
      seed?.kind === "selection"
        ? carryDraftSlots({ previous: seed.side, members, placed, participants, size })
        : buildDraftSlots({
            lastList: seed?.list.players ?? null,
            members,
            placed,
            prefer: (m) => seniorRecord.has(m.id),
            participants,
            size,
          });
    const seededFrom: SeededFrom =
      seed?.kind === "selection"
        ? { kind: "selection", id: seed.side.selectionId, fixtureId: seed.side.fixtureId }
        : seed
          ? { kind: "team_list", id: seed.list.teamListId, fixtureId: seed.list.fixtureId }
          : null;

    const created = await insertDraft(tenantId, now, draft, seededFrom, {
      roundId,
      fixtureId: f.id,
    });
    // A concurrent run got there first: count it as already drafted.
    if (created == null) summary.skipped++;
    else {
      summary.created++;
      summary.selectionIds.push(created);
    }
  }
  return draftJuniorSides(tenantId, round, now, summary, ledger);
}

/**
 * Insert one draft side and its system "draft" event, or nothing when the
 * fixture already has a side (a concurrent run, or two selectors loading the
 * board at once): returns the new id, or null.
 */
async function insertDraft(
  tenantId: number,
  now: Date,
  draft: DraftSide,
  seededFrom: SeededFrom,
  side: { roundId: number; fixtureId: number } | { roundId: number; juniorFixtureId: number },
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const insert = tx.insert(selectionsTable).values({
      tenantId,
      ...side,
      slots: draft.slots,
      sideSize: draft.sideSize,
      allPlay: draft.allPlay,
      captainMemberId: draft.captainMemberId,
      keeperMemberId: draft.keeperMemberId,
      state: "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const [row] = await (
      "fixtureId" in side
        ? insert.onConflictDoNothing({ target: selectionsTable.fixtureId })
        : insert.onConflictDoNothing()
    ).returning({ id: selectionsTable.id });
    if (!row) return null;
    await tx.insert(selectionEventsTable).values({
      tenantId,
      selectionId: row.id,
      roundId: side.roundId,
      actorKind: "system",
      action: "draft",
      detail: {
        seededFrom,
        filled: draft.slots.slice(0, XI_SIZE).filter((s) => s.memberId != null).length,
        twelfth: twelfthMemberId(draft.slots, draft) != null,
        ...(draft.sideSize !== DEFAULT_SIDE_SIZE ? { sideSize: draft.sideSize } : {}),
        ...(draft.allPlay ? { allPlay: true } : {}),
      },
      createdAt: now,
    });
    return row.id;
  });
}

/**
 * A junior team list (PlayHQ participant ids) as the names the member matcher
 * knows: a participant matched to a junior squad member (`juniorMemberResolver`)
 * takes that member's name; anyone else keeps their PlayHQ name, so they read
 * as a gap "not on register". Each entry keeps its participant id, for the
 * club's remembered matches.
 */
export async function juniorListAsNames(
  reader: Parameters<typeof loadJuniorIdentity>[0],
  tenantId: number,
  members: readonly Pick<
    MemberIdentity & { playhqProfileId: string | null },
    "firstName" | "lastName" | "preferredName" | "playhqProfileId"
  >[],
): Promise<(players: readonly JuniorTeamListPlayer[]) => TeamListPlayer[]> {
  const { participants, merges } = await loadJuniorIdentity(reader, tenantId);
  const resolve = juniorMemberResolver(participants, merges);
  const memberOf = new Map<string, (typeof members)[number]>();
  for (const m of members) {
    const id = resolve(m);
    if (id && !memberOf.has(id)) memberOf.set(id, m);
  }
  const nameOf = new Map(
    participants.map((p) => [p.participantId.toLowerCase(), p.displayName ?? ""]),
  );
  return (players) =>
    players.map((p) => {
      const id = p.participantId.toLowerCase();
      const m = memberOf.get(id);
      return {
        order: p.order,
        displayName: m ? memberDisplayName(m) : nameOf.get(id) || "Unknown",
        ...(p.role ? { role: p.role } : {}),
        participantId: id,
      };
    });
}

/**
 * Junior sides: one per `junior_fixtures` row (junior PlayHQ sync) in the
 * round's window. A club can field several teams in one age group, so each
 * side is seeded from the same team's side in the previous round that has one,
 * else from the team's most recent junior team list. Those lists hold PlayHQ
 * participant ids, matched back to squad members the way a junior side is
 * published (`juniorMemberResolver`).
 */
async function draftJuniorSides(
  tenantId: number,
  round: AvailabilityRoundRow,
  now: Date,
  summary: RoundDraftSummary,
  ledger: PlacementLedger,
): Promise<RoundDraftSummary> {
  const window = roundWindow(round.weekendDate);
  const fixtures = await db
    .select()
    .from(juniorFixturesTable)
    .where(
      and(
        eq(juniorFixturesTable.tenantId, tenantId),
        gte(juniorFixturesTable.startAt, window.from),
        lt(juniorFixturesTable.startAt, window.to),
      ),
    )
    .orderBy(asc(juniorFixturesTable.startAt), asc(juniorFixturesTable.id));
  if (fixtures.length === 0) return summary;

  const roundSides = await db
    .select({ juniorFixtureId: selectionsTable.juniorFixtureId, slots: selectionsTable.slots })
    .from(selectionsTable)
    .where(
      and(
        eq(selectionsTable.tenantId, tenantId),
        or(
          eq(selectionsTable.roundId, round.id),
          inArray(
            selectionsTable.juniorFixtureId,
            fixtures.map((f) => f.id),
          ),
        ),
      ),
    );
  const existing = new Set(roundSides.map((r) => r.juniorFixtureId));

  // Each team's most recent non-empty junior list from before the round, and its
  // sides in the latest earlier round that drafted the team.
  const teams = [...new Set(fixtures.flatMap((f) => (f.teamName ? [f.teamName] : [])))];
  const [lastLists, priorRows] =
    teams.length > 0
      ? await Promise.all([
          db
            .selectDistinctOn([juniorFixturesTable.teamName], {
              teamName: juniorFixturesTable.teamName,
              fixtureId: juniorFixturesTable.id,
              startAt: juniorFixturesTable.startAt,
              teamListId: juniorTeamListsTable.id,
              players: juniorTeamListsTable.players,
            })
            .from(juniorFixturesTable)
            .innerJoin(
              juniorTeamListsTable,
              and(
                eq(juniorTeamListsTable.juniorFixtureId, juniorFixturesTable.id),
                eq(juniorTeamListsTable.tenantId, juniorFixturesTable.tenantId),
              ),
            )
            .where(
              and(
                eq(juniorFixturesTable.tenantId, tenantId),
                inArray(juniorFixturesTable.teamName, teams),
                lt(juniorFixturesTable.startAt, window.from),
                sql`jsonb_array_length(${juniorTeamListsTable.players}) > 0`,
              ),
            )
            .orderBy(
              juniorFixturesTable.teamName,
              desc(juniorFixturesTable.startAt),
              desc(juniorFixturesTable.id),
            ),
          db
            .select({
              selectionId: selectionsTable.id,
              fixtureId: juniorFixturesTable.id,
              teamName: juniorFixturesTable.teamName,
              weekendDate: availabilityRoundsTable.weekendDate,
              startAt: juniorFixturesTable.startAt,
              slots: selectionsTable.slots,
              captainMemberId: selectionsTable.captainMemberId,
              keeperMemberId: selectionsTable.keeperMemberId,
            })
            .from(selectionsTable)
            .innerJoin(
              availabilityRoundsTable,
              and(
                eq(availabilityRoundsTable.id, selectionsTable.roundId),
                eq(availabilityRoundsTable.tenantId, selectionsTable.tenantId),
              ),
            )
            .innerJoin(
              juniorFixturesTable,
              and(
                eq(juniorFixturesTable.id, selectionsTable.juniorFixtureId),
                eq(juniorFixturesTable.tenantId, selectionsTable.tenantId),
              ),
            )
            .where(
              and(
                eq(selectionsTable.tenantId, tenantId),
                lt(availabilityRoundsTable.weekendDate, round.weekendDate),
                inArray(juniorFixturesTable.teamName, teams),
              ),
            )
            .orderBy(
              desc(availabilityRoundsTable.weekendDate),
              asc(juniorFixturesTable.startAt),
              asc(selectionsTable.id),
            ),
        ])
      : [[], []];
  const lastByTeam = new Map(lastLists.map((l) => [l.teamName ?? "", l]));
  const priorByTeam = previousSides(
    priorRows.flatMap((r) => (r.startAt ? [{ ...r, startAt: r.startAt }] : [])),
    (r) => r.teamName ?? "",
  );

  const members = (
    await db
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
  ).filter((m) => m.section === "junior");
  const asNames = await juniorListAsNames(db, tenantId, members);
  // Junior members only, so a remembered match to a senior record never lands here.
  const participants = await loadParticipantCrosswalk(db, tenantId);
  const sideSizes = await loadSideSizes(tenantId);

  const teamIndex = new Map<string, number>();
  for (const f of fixtures) {
    const team = f.teamName ?? "";
    const index = teamIndex.get(team) ?? 0;
    if (team) teamIndex.set(team, index + 1);
    if (existing.has(f.id)) {
      summary.skipped++;
      continue;
    }
    // A fixture with no team name has nothing to carry from.
    const seed = team ? pickSeed(priorByTeam.get(team), lastByTeam.get(team), index) : null;
    const placed = ledger.view(gameWindow(f.startAt!, { junior: true }));
    // A junior side's size is keyed by the label it goes by on the board.
    const size = gradeSideSpec(sideSizes, juniorSideLabel(f));
    const draft =
      seed?.kind === "selection"
        ? carryDraftSlots({ previous: seed.side, members, placed, participants, size })
        : buildDraftSlots({
            lastList: seed ? asNames(seed.list.players) : null,
            members,
            placed,
            participants,
            size,
          });
    const seededFrom: SeededFrom =
      seed?.kind === "selection"
        ? { kind: "selection", id: seed.side.selectionId, juniorFixtureId: seed.side.fixtureId }
        : seed
          ? { kind: "team_list", id: seed.list.teamListId, juniorFixtureId: seed.list.fixtureId }
          : null;
    const created = await insertDraft(tenantId, now, draft, seededFrom, {
      roundId: round.id,
      juniorFixtureId: f.id,
    });
    if (created == null) summary.skipped++;
    else {
      summary.created++;
      summary.selectionIds.push(created);
    }
  }
  return summary;
}

/**
 * The round's answers by member and Perth date. A date inside one of the
 * member's away periods with no explicit answer counts as No.
 */
export async function loadResponses(
  tenantId: number,
  roundId: number,
  from: Date,
  to: Date,
): Promise<ResponsesByMember> {
  const out = new Map<number, Map<string, AvailabilityStatus>>();
  const rows = await db
    .select({
      memberId: availabilityResponsesTable.memberId,
      date: availabilityResponsesTable.date,
      status: availabilityResponsesTable.status,
    })
    .from(availabilityResponsesTable)
    .where(
      and(
        eq(availabilityResponsesTable.tenantId, tenantId),
        eq(availabilityResponsesTable.roundId, roundId),
      ),
    );
  for (const r of rows) {
    const byDate = out.get(r.memberId) ?? new Map<string, AvailabilityStatus>();
    byDate.set(r.date, r.status);
    out.set(r.memberId, byDate);
  }

  const first = perthDate(from);
  const last = perthDate(new Date(to.getTime() - 1));
  const away = await db
    .select({
      memberId: availabilityAwayTable.memberId,
      fromDate: availabilityAwayTable.fromDate,
      toDate: availabilityAwayTable.toDate,
    })
    .from(availabilityAwayTable)
    .where(
      and(
        eq(availabilityAwayTable.tenantId, tenantId),
        lte(availabilityAwayTable.fromDate, last),
        gte(availabilityAwayTable.toDate, first),
      ),
    );
  for (const a of away) {
    const byDate = out.get(a.memberId) ?? new Map<string, AvailabilityStatus>();
    for (let d = first; d <= last; d = addDays(d, 1)) {
      if (d >= a.fromDate && d <= a.toDate && !byDate.has(d)) byDate.set(d, "no");
    }
    out.set(a.memberId, byDate);
  }
  return out;
}
