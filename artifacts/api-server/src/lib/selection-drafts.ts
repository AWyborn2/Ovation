import { and, asc, desc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import {
  db,
  availabilityAwayTable,
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
  type SelectionSlot,
  type TeamListPlayer,
} from "@workspace/db";
import {
  addDays,
  buildMemberMatcher,
  memberDisplayName,
  perthDate,
  roundWindow,
  type MemberIdentity,
} from "./availability-grades";
import { loadJuniorIdentity } from "./junior-shirt-numbers";
import { juniorMemberResolver } from "./shirt-number-squad";

/**
 * Draft sides at cut-off.
 *
 * Every fixture in the round's Friday–Sunday window gets one draft `selections`
 * row, seeded from the team list of that grade's most recent fixture before the
 * round. Each listed player who answered Yes for the fixture's date keeps their
 * slot; everyone else leaves an open slot labelled "was <name> · <reason>" (no,
 * maybe, no reply, not on register) in the same position. The first 12 entries
 * seed the side (a list with a 12th player fills slot 12). Nobody else is
 * placed: a Yes player who was not in the last side waits in the pool,
 * and nobody moves between grades on their own. Last game's captain and keeper
 * carry over only while still in the XI.
 *
 * Nobody is placed twice in a round: fixtures are drafted in start order with
 * one round-wide set of placed members, seeded from the round's existing
 * sides, so a player on two grades' last lists goes to the earlier fixture and
 * the later one keeps an open slot. A grade with two fixtures in the weekend
 * seeds the first and starts the second empty. An existing selection is never
 * overwritten, so re-running the cut-off is a no-op.
 */

/** Every side has 12 slots: the XI in slots 1–11 and the 12th player in slot 12. */
export const SIDE_SIZE = 12;

/** The playing XI: slots 1–11. A side is complete with these; the 12th is optional. */
export const XI_SIZE = 11;

/** The 12th player's slot (zero-based). */
export const TWELFTH_INDEX = XI_SIZE;

/**
 * A stored or submitted side as 12 slots. Sides saved before the 12th player
 * have 11; they read as an empty 12th. Every reader and writer of
 * `selections.slots` goes through this, so the rest of the code sees 12.
 */
export function normaliseSlots<T extends { memberId: number | null }>(slots: readonly T[]): T[] {
  const out = [...slots];
  while (out.length < SIDE_SIZE) out.push({ memberId: null } as T);
  return out;
}

/** The members in the XI (slots 1–11), for captain and keeper. */
export function xiMemberIds(slots: readonly { memberId: number | null }[]): Set<number> {
  return new Set(slots.slice(0, XI_SIZE).flatMap((s) => (s.memberId != null ? [s.memberId] : [])));
}

/** Answers per member, keyed by Perth date (`YYYY-MM-DD`). */
export type ResponsesByMember = ReadonlyMap<number, ReadonlyMap<string, AvailabilityStatus>>;

export type DraftSide = {
  slots: SelectionSlot[];
  captainMemberId: number | null;
  keeperMemberId: number | null;
};

const emptySlots = (): SelectionSlot[] =>
  Array.from({ length: SIDE_SIZE }, () => ({ memberId: null }));

/**
 * The draft for one fixture from its grade's last list (pure apart from
 * `placed`). `members` is the whole register: an entry that matches an
 * inactive member — or nobody, or a fill-in id — is a gap "not on register".
 * `placed` is the round's members already in a side: such an entry leaves a
 * plain open slot, and the members this draft places are added to it.
 */
export function buildDraftSlots(input: {
  lastList: readonly TeamListPlayer[] | null;
  members: readonly MemberIdentity[];
  responses: ResponsesByMember;
  fixtureDate: string;
  placed?: Set<number>;
  /**
   * Keep a listed player only on a Yes (the availability flow, default). False
   * for a club not using availability: everyone listed stays unless they said No.
   */
  requireYes?: boolean;
}): DraftSide {
  const { lastList, members, responses, fixtureDate } = input;
  const elsewhere = input.placed ?? new Set<number>();
  const slots = emptySlots();
  let captainMemberId: number | null = null;
  let keeperMemberId: number | null = null;
  if (!lastList || lastList.length === 0) return { slots, captainMemberId, keeperMemberId };

  const match = buildMemberMatcher(members);
  const placed = new Set<number>();
  const entries = [...lastList].sort((a, b) => a.order - b.order).slice(0, SIDE_SIZE);

  entries.forEach((entry, i) => {
    const m = match(entry);
    const name = entry.displayName.trim() || (m ? memberDisplayName(m) : "Unknown");
    if (!m || !m.active || placed.has(m.id)) {
      slots[i] = { memberId: null, gap: { name, reason: "not_on_register" } };
      return;
    }
    // Already in another side of the round: leave the slot open so a player is placed once.
    if (elsewhere.has(m.id)) {
      slots[i] = { memberId: null, gap: { name, reason: "picked_elsewhere" } };
      return;
    }
    const status = responses.get(m.id)?.get(fixtureDate);
    const keep = input.requireYes === false ? status !== "no" : status === "yes";
    if (!keep && status !== "yes") {
      slots[i] = { memberId: null, gap: { name, reason: status ?? "no_reply" } };
      return;
    }
    placed.add(m.id);
    elsewhere.add(m.id);
    slots[i] = { memberId: m.id };
    // Captain and keeper come from the XI only; a 12th player holds no role.
    if (i >= XI_SIZE) return;
    if (entry.role === "C" || entry.role === "C/WK") captainMemberId ??= m.id;
    if (entry.role === "WK" || entry.role === "C/WK") keeperMemberId ??= m.id;
  });

  return { slots, captainMemberId, keeperMemberId };
}

export type RoundDraftSummary = {
  /** Selections created by this run. */
  created: number;
  /** Fixtures in the window that already had a selection. */
  skipped: number;
  /** Ids of the selections created, for the "drafts ready" notice. */
  selectionIds: number[];
};

/**
 * Creates the draft selection for every fixture in the round's window that has
 * none yet. Tenant-scoped throughout: a round id from another tenant finds no
 * round and creates nothing.
 */
export async function buildRoundDrafts(
  tenantId: number,
  roundId: number,
  now: Date = new Date(),
  opts: { requireYes?: boolean } = {},
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
    .select({ id: fixturesTable.id, grade: fixturesTable.grade, startAt: fixturesTable.startAt })
    .from(fixturesTable)
    .where(
      and(
        eq(fixturesTable.tenantId, tenantId),
        gte(fixturesTable.startAt, window.from),
        lt(fixturesTable.startAt, window.to),
      ),
    )
    .orderBy(asc(fixturesTable.startAt), asc(fixturesTable.id));
  if (fixtures.length === 0) return draftJuniorSides(tenantId, round, now, opts, summary);

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
  const placed = new Set<number>();
  for (const r of existingRows) {
    for (const s of r.slots) if (s.memberId != null) placed.add(s.memberId);
  }

  // Each grade's most recent non-empty team list from before the round.
  const grades = [...new Set(fixtures.map((f) => f.grade))];
  const lastLists = await db
    .selectDistinctOn([fixturesTable.grade], {
      grade: fixturesTable.grade,
      fixtureId: fixturesTable.id,
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
    .orderBy(fixturesTable.grade, desc(fixturesTable.startAt), desc(fixturesTable.id));
  const lastByGrade = new Map(lastLists.map((l) => [l.grade, l]));

  const members = await db
    .select({
      id: squadMembersTable.id,
      firstName: squadMembersTable.firstName,
      lastName: squadMembersTable.lastName,
      preferredName: squadMembersTable.preferredName,
      linkedPlayerId: squadMembersTable.linkedPlayerId,
      active: squadMembersTable.active,
      gradeHint: squadMembersTable.gradeHint,
    })
    .from(squadMembersTable)
    .where(eq(squadMembersTable.tenantId, tenantId));

  const responses = await loadResponses(tenantId, roundId, window.from, window.to);

  const seededGrades = new Set<string>();
  for (const f of fixtures) {
    // The grade's first fixture of the weekend takes the seeded side, even when
    // its selection already exists; any later one starts empty.
    const seed = seededGrades.has(f.grade) ? null : (lastByGrade.get(f.grade) ?? null);
    seededGrades.add(f.grade);
    if (existing.has(f.id)) {
      summary.skipped++;
      continue;
    }
    const draft = buildDraftSlots({
      lastList: seed?.players ?? null,
      members,
      responses,
      fixtureDate: perthDate(f.startAt),
      placed,
      requireYes: opts.requireYes,
    });

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(selectionsTable)
        .values({
          tenantId,
          roundId,
          fixtureId: f.id,
          slots: draft.slots,
          captainMemberId: draft.captainMemberId,
          keeperMemberId: draft.keeperMemberId,
          state: "draft",
          version: 1,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: selectionsTable.fixtureId })
        .returning({ id: selectionsTable.id });
      if (!row) return null;
      await tx.insert(selectionEventsTable).values({
        tenantId,
        selectionId: row.id,
        actorKind: "system",
        action: "draft",
        detail: {
          seededFromFixtureId: seed?.fixtureId ?? null,
          filled: draft.slots.slice(0, XI_SIZE).filter((s) => s.memberId != null).length,
          twelfth: draft.slots[TWELFTH_INDEX]?.memberId != null,
        },
        createdAt: now,
      });
      return row.id;
    });
    // A concurrent run got there first: count it as already drafted.
    if (created == null) summary.skipped++;
    else {
      summary.created++;
      summary.selectionIds.push(created);
    }
  }
  return draftJuniorSides(tenantId, round, now, opts, summary);
}

/**
 * A junior team list (PlayHQ participant ids) as the names the member matcher
 * knows: a participant matched to a junior squad member (`juniorMemberResolver`)
 * takes that member's name; anyone else keeps their PlayHQ name, so they read
 * as a gap "not on register".
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
      };
    });
}

/**
 * Junior sides: one per `junior_fixtures` row (junior PlayHQ sync) in the
 * round's window. A club can field several teams in one age group, so each
 * side is seeded from the same team's most recent junior team list. Those
 * lists hold PlayHQ participant ids, matched back to squad members the way a
 * junior side is published (`juniorMemberResolver`).
 */
async function draftJuniorSides(
  tenantId: number,
  round: AvailabilityRoundRow,
  now: Date,
  opts: { requireYes?: boolean },
  summary: RoundDraftSummary,
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
  const placed = new Set<number>();
  for (const r of roundSides)
    for (const x of r.slots) if (x.memberId != null) placed.add(x.memberId);

  // Each team's most recent non-empty junior list from before the round.
  const teams = [...new Set(fixtures.flatMap((f) => (f.teamName ? [f.teamName] : [])))];
  const lastLists =
    teams.length > 0
      ? await db
          .selectDistinctOn([juniorFixturesTable.teamName], {
            teamName: juniorFixturesTable.teamName,
            fixtureId: juniorFixturesTable.id,
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
          )
      : [];
  const lastByTeam = new Map(lastLists.map((l) => [l.teamName, l]));

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
  const responses = await loadResponses(tenantId, round.id, window.from, window.to);

  const seededTeams = new Set<string>();
  for (const f of fixtures) {
    const team = f.teamName ?? "";
    const seed = team && !seededTeams.has(team) ? (lastByTeam.get(team) ?? null) : null;
    if (team) seededTeams.add(team);
    if (existing.has(f.id)) {
      summary.skipped++;
      continue;
    }
    const lastList = seed ? asNames(seed.players) : null;
    const draft = buildDraftSlots({
      lastList,
      members,
      responses,
      fixtureDate: perthDate(f.startAt!),
      placed,
      requireYes: opts.requireYes,
    });
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(selectionsTable)
        .values({
          tenantId,
          roundId: round.id,
          juniorFixtureId: f.id,
          slots: draft.slots,
          captainMemberId: draft.captainMemberId,
          keeperMemberId: draft.keeperMemberId,
          state: "draft",
          version: 1,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: selectionsTable.id });
      if (!row) return null;
      await tx.insert(selectionEventsTable).values({
        tenantId,
        selectionId: row.id,
        actorKind: "system",
        action: "draft",
        detail: {
          seededFromJuniorFixtureId: seed?.fixtureId ?? null,
          filled: draft.slots.slice(0, XI_SIZE).filter((s) => s.memberId != null).length,
          twelfth: draft.slots[TWELFTH_INDEX]?.memberId != null,
        },
        createdAt: now,
      });
      return row.id;
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
