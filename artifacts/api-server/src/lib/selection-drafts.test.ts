import { describe, it, expect } from "vitest";
import type { SelectionSlot, TeamListPlayer } from "@workspace/db";
import { PlacementLedger, buildDraftSlots, carryDraftSlots, gameWindow } from "./selection-drafts";
import type { MemberIdentity } from "./availability-grades";

/**
 * The draft rules (plan 2026-10-06-002 U6: R16–R18, R37, KTD7; ADR-008: every
 * carried player kept whatever they replied, carry-over from the last side).
 * Pure — the DB-backed round builder is covered in selection-drafts.int.test.ts.
 */

const NAMES = [
  "Ava Hill",
  "Ben Cole",
  "Cal Dunn",
  "Dan Ford",
  "Eli Grant",
  "Finn Hart",
  "Gus Ives",
  "Hal Jones",
  "Ian Kerr",
  "Jack Hale",
  "Kai Long",
];

const member = (id: number, name: string, extra: Partial<MemberIdentity> = {}): MemberIdentity => {
  const [firstName, lastName] = name.split(" ");
  return {
    id,
    firstName,
    lastName,
    preferredName: null,
    linkedPlayerId: null,
    active: true,
    gradeHint: null,
    ...extra,
  };
};

/** Members 1–11 for NAMES; Jack Hale (10) is linked to app player 410. */
const MEMBERS = NAMES.map((n, i) => member(i + 1, n, i === 9 ? { linkedPlayerId: 410 } : {}));

/** Last week's XI: names in order, with J. Hale listed by playerId under a short name. */
const LAST: TeamListPlayer[] = NAMES.map((n, i) =>
  i === 9
    ? { order: i + 1, playerId: 410, displayName: "J. Hale" }
    : { order: i + 1, displayName: n },
);

describe("buildDraftSlots", () => {
  it("keeps every listed player in place, whatever they replied (ADR-008)", () => {
    const draft = buildDraftSlots({ lastList: LAST, members: MEMBERS });
    expect(draft.slots).toHaveLength(12);
    expect(draft.slots.slice(0, 11).map((s) => s.memberId)).toEqual(MEMBERS.map((m) => m.id));
    expect(draft.slots[11]).toEqual({ memberId: null });
  });

  it("carries the captain and keeper from the XI", () => {
    const list = LAST.map((p) =>
      p.order === 1
        ? { ...p, role: "C" as const }
        : p.order === 2
          ? { ...p, role: "WK" as const }
          : p,
    );
    const draft = buildDraftSlots({ lastList: list, members: MEMBERS });
    expect(draft.captainMemberId).toBe(1);
    expect(draft.keeperMemberId).toBe(2);
  });

  it("carries a C/WK player as both captain and keeper", () => {
    const list = LAST.map((p) => (p.order === 4 ? { ...p, role: "C/WK" as const } : p));
    const draft = buildDraftSlots({
      lastList: list,
      members: MEMBERS,
    });
    expect(draft.captainMemberId).toBe(4);
    expect(draft.keeperMemberId).toBe(4);
  });

  it("never places a fill-in id: it is a gap 'not on register'", () => {
    const list = LAST.map((p) =>
      p.order === 5 ? { order: 5, playerId: 90012, displayName: "Eli Grant" } : p,
    );
    const draft = buildDraftSlots({
      lastList: list,
      members: MEMBERS,
    });
    expect(draft.slots[4]).toEqual({
      memberId: null,
      gap: { name: "Eli Grant", reason: "not_on_register" },
    });
  });

  it("a name on two registers takes the preferred record, else stays unmatched", () => {
    const senior = member(60, "Sam Reid");
    const junior = member(61, "Sam Reid");
    const list: TeamListPlayer[] = [{ order: 1, displayName: "Sam Reid" }];
    const base = {
      lastList: list,
      members: [senior, junior],
    };
    expect(buildDraftSlots({ ...base, prefer: (m) => m.id === 60 }).slots[0]).toEqual({
      memberId: 60,
    });
    expect(buildDraftSlots(base).slots[0].memberId).toBeNull();
  });

  it("a sibling's wrong link never puts them in the other's slot (shared PlayHQ account)", () => {
    // Ben's record is linked to Noah's player (700); Noah's is unlinked.
    const ben = member(70, "Ben Dreckow", { linkedPlayerId: 700 });
    const noah = member(71, "Noah Dreckow");
    const list: TeamListPlayer[] = [
      { order: 1, playerId: 700, displayName: "Noah Dreckow" },
      { order: 2, playerId: 701, displayName: "Ben Dreckow" },
    ];
    const draft = buildDraftSlots({
      lastList: list,
      members: [ben, noah],
    });
    expect(draft.slots.slice(0, 2)).toEqual([{ memberId: 71 }, { memberId: 70 }]);
  });

  it("a parent's id on a child's record matches nobody, not the child", () => {
    // Noah's record is linked to his father Ben's player (700); Ben isn't on the squad.
    const noah = member(72, "Noah Dreckow", { linkedPlayerId: 700 });
    const draft = buildDraftSlots({
      lastList: [{ order: 1, playerId: 700, displayName: "Ben Dreckow" }],
      members: [noah],
    });
    expect(draft.slots[0]).toEqual({
      memberId: null,
      gap: { name: "Ben Dreckow", reason: "not_on_register" },
    });
  });

  it("a close spelling of one member's name matches them (Tahj / Taj Bashford)", () => {
    const taj = member(95, "Taj Bashford");
    const draft = buildDraftSlots({
      lastList: [{ order: 1, playerId: 950, displayName: "Tahj Bashford" }],
      members: [taj],
    });
    expect(draft.slots[0]).toEqual({ memberId: 95 });
  });

  it("a close spelling never picks between two members, nor a different first name", () => {
    const jayden = member(96, "Jayden Roe");
    const jaiden = member(97, "Jaiden Roe");
    const brody = member(98, "Brody Dreckow");
    const pick = (displayName: string, members: ReturnType<typeof member>[]) =>
      buildDraftSlots({
        lastList: [{ order: 1, displayName }],
        members,
      }).slots[0];
    expect(pick("Jaden Roe", [jayden, jaiden]).memberId).toBeNull();
    expect(pick("Ben Dreckow", [brody]).memberId).toBeNull();
  });

  it("a link two members share is ignored; their names decide", () => {
    const mason = member(80, "Mason Head", { linkedPlayerId: 800 });
    const philip = member(81, "Philip Head", { linkedPlayerId: 800 });
    const list: TeamListPlayer[] = [
      { order: 1, playerId: 800, displayName: "Philip Head" },
      { order: 2, playerId: 801, displayName: "Mason Head" },
    ];
    const draft = buildDraftSlots({
      lastList: list,
      members: [mason, philip],
    });
    expect(draft.slots.slice(0, 2)).toEqual([{ memberId: 81 }, { memberId: 80 }]);
  });

  it("a correct link still wins for a different spelling of the name", () => {
    const tom = member(90, "Thomas Brooks", { linkedPlayerId: 900 });
    const draft = buildDraftSlots({
      lastList: [{ order: 1, playerId: 900, displayName: "T. Brooks" }],
      members: [tom],
    });
    expect(draft.slots[0]).toEqual({ memberId: 90 });
  });

  it("matches an unlinked entry by preferred name plus last name", () => {
    const tom = member(50, "Thomas Brooks", { preferredName: "Tom" });
    const list: TeamListPlayer[] = [{ order: 1, displayName: "Tom Brooks" }];
    const draft = buildDraftSlots({
      lastList: list,
      members: [tom],
    });
    expect(draft.slots[0]).toEqual({ memberId: 50 });
  });

  it("treats unknown names and inactive members as not on register", () => {
    const members = MEMBERS.map((m) => (m.id === 7 ? { ...m, active: false } : m));
    const list = LAST.map((p) => (p.order === 8 ? { ...p, displayName: "New Signing" } : p));
    const draft = buildDraftSlots({
      lastList: list,
      members,
    });
    expect(draft.slots[6]).toEqual({
      memberId: null,
      gap: { name: "Gus Ives", reason: "not_on_register" },
    });
    expect(draft.slots[7]).toEqual({
      memberId: null,
      gap: { name: "New Signing", reason: "not_on_register" },
    });
  });

  it("starts with 12 open slots and no roles when there is no earlier list", () => {
    const draft = buildDraftSlots({
      lastList: null,
      members: MEMBERS,
    });
    expect(draft.slots).toEqual(Array.from({ length: 12 }, () => ({ memberId: null })));
    expect(draft.captainMemberId).toBeNull();
    expect(draft.keeperMemberId).toBeNull();
  });

  it("leaves a Yes player who was not in the last side out, for the pool (R18)", () => {
    const extra = member(99, "Zed Young");
    const draft = buildDraftSlots({
      lastList: LAST,
      members: [...MEMBERS, extra],
    });
    expect(draft.slots.map((s) => s.memberId)).not.toContain(99);
    expect(draft.slots.slice(0, 11).every((s) => s.memberId != null)).toBe(true);
    // An 11-player list leaves the 12th open.
    expect(draft.slots[11]).toEqual({ memberId: null });
  });

  it("orders by the list's order, pads a short list and trims a long one to 12", () => {
    const short = [...LAST.slice(0, 3)].reverse();
    const d1 = buildDraftSlots({
      lastList: short,
      members: MEMBERS,
    });
    expect(d1.slots.map((s) => s.memberId)).toEqual([1, 2, 3, ...Array(9).fill(null)]);
    expect(d1.slots[3]).toEqual({ memberId: null });

    const extra = [member(12, "Leo Mann"), member(13, "Max Nash")];
    const long = [
      ...LAST,
      { order: 12, displayName: "Leo Mann" },
      { order: 13, displayName: "Max Nash" },
    ];
    const d2 = buildDraftSlots({
      lastList: long,
      members: [...MEMBERS, ...extra],
    });
    expect(d2.slots).toHaveLength(12);
    expect(d2.slots.map((s) => s.memberId)).not.toContain(13);
  });

  it("seeds the 12th player from a 12-entry list; a gap there is labelled like any other", () => {
    const list = [...LAST, { order: 12, displayName: "Leo Mann" }];
    const d = buildDraftSlots({ lastList: list, members: [...MEMBERS, member(12, "Leo Mann")] });
    expect(d.slots.map((s) => s.memberId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    const gone = buildDraftSlots({ lastList: list, members: MEMBERS });
    expect(gone.slots[11]).toEqual({
      memberId: null,
      gap: { name: "Leo Mann", reason: "not_on_register" },
    });
  });

  it("a captain or keeper listed 12th doesn't carry over", () => {
    const list: TeamListPlayer[] = [...LAST, { order: 12, displayName: "Leo Mann", role: "C/WK" }];
    const d = buildDraftSlots({
      lastList: list,
      members: [...MEMBERS, member(12, "Leo Mann")],
    });
    expect(d.slots[11]).toEqual({ memberId: 12 });
    expect(d.captainMemberId).toBeNull();
    expect(d.keeperMemberId).toBeNull();
  });

  it("places a member listed twice only once", () => {
    const list = [...LAST.slice(0, 10), { order: 11, displayName: "Ava Hill" }];
    const draft = buildDraftSlots({
      lastList: list,
      members: MEMBERS,
    });
    expect(draft.slots.filter((s) => s.memberId === 1)).toHaveLength(1);
    expect(draft.slots[10]).toEqual({
      memberId: null,
      gap: { name: "Ava Hill", reason: "not_on_register" },
    });
  });

  it("leaves a member already placed in another side of the round as an open slot", () => {
    const placed = new Set([1, 50]);
    const draft = buildDraftSlots({
      lastList: LAST,
      members: MEMBERS,
      placed,
    });
    expect(draft.slots[0]).toEqual({
      memberId: null,
      gap: { name: LAST[0].displayName, reason: "picked_elsewhere" },
    });
    expect(draft.slots[1]).toEqual({ memberId: 2 });
    // The shared set now holds this side's members too, for the next fixture.
    expect([...placed].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 50]);
  });
});

describe("game clashes (PlacementLedger)", () => {
  const at = (iso: string) => new Date(iso);
  // Saturday 12:00 Perth one-day game (04:00Z, about 7 hours).
  const satOneDay = gameWindow(at("2026-10-17T04:00:00Z"), { format: "One Day" });

  it("a Saturday game and a Sunday game don't clash", () => {
    const ledger = new PlacementLedger();
    ledger.place(1, satOneDay);
    expect(ledger.clashes(1, gameWindow(at("2026-10-18T01:00:00Z"), { format: "One Day" }))).toBe(
      false,
    );
  });

  it("two one-day games the same afternoon clash", () => {
    const ledger = new PlacementLedger();
    ledger.place(1, satOneDay);
    expect(ledger.clashes(1, gameWindow(at("2026-10-17T04:15:00Z")))).toBe(true);
  });

  it("two T20s with spaced start times on one day don't clash", () => {
    const ledger = new PlacementLedger();
    ledger.place(1, gameWindow(at("2026-10-17T01:00:00Z"), { format: "T20" }));
    expect(ledger.clashes(1, gameWindow(at("2026-10-17T05:00:00Z"), { format: "T20" }))).toBe(
      false,
    );
  });

  it("a morning junior game and an afternoon senior game don't clash; two at once do", () => {
    const ledger = new PlacementLedger();
    ledger.place(1, gameWindow(at("2026-10-17T00:30:00Z"), { junior: true }));
    expect(ledger.clashes(1, satOneDay)).toBe(false);
    expect(ledger.clashes(1, gameWindow(at("2026-10-17T01:00:00Z"), { junior: true }))).toBe(true);
  });

  it("drafting leaves a gap only for a clashing game", () => {
    const ledger = new PlacementLedger();
    ledger.place(1, satOneDay);
    const sunday = buildDraftSlots({
      lastList: LAST,
      members: MEMBERS,
      placed: ledger.view(gameWindow(at("2026-10-18T01:00:00Z"))),
    });
    expect(sunday.slots[0]).toEqual({ memberId: 1 });
    const sameTime = buildDraftSlots({
      lastList: LAST,
      members: MEMBERS,
      placed: ledger.view(gameWindow(at("2026-10-17T05:00:00Z"))),
    });
    expect(sameTime.slots[0]).toEqual({
      memberId: null,
      gap: { name: LAST[0].displayName, reason: "picked_elsewhere" },
    });
  });
});

describe("carryDraftSlots", () => {
  const side = (ids: (number | null)[], extra: Partial<Record<number, SelectionSlot>> = {}) =>
    Array.from({ length: 12 }, (_, i): SelectionSlot => extra[i] ?? { memberId: ids[i] ?? null });

  it("carries last round's side slot for slot, the 12th staying 12th, with its roles", () => {
    const previous = {
      slots: side([1, 2, 3, null, 5, 6, 7, 8, 9, 10, 11, 12]),
      captainMemberId: 3,
      keeperMemberId: 5,
    };
    const d = carryDraftSlots({ previous, members: [...MEMBERS, member(12, "Leo Mann")] });
    expect(d.slots.map((s) => s.memberId)).toEqual([1, 2, 3, null, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(d.captainMemberId).toBe(3);
    expect(d.keeperMemberId).toBe(5);
  });

  it("clears a role whose holder is 12th or gone, and gaps a member no longer active", () => {
    const members = MEMBERS.map((m) => (m.id === 2 ? { ...m, active: false } : m));
    const d = carryDraftSlots({
      previous: {
        slots: side([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
        captainMemberId: 2,
        keeperMemberId: 12,
      },
      members: [...members, member(12, "Leo Mann")],
    });
    expect(d.slots[1]).toEqual({
      memberId: null,
      gap: { name: "Ben Cole", reason: "not_on_register" },
    });
    expect(d.captainMemberId).toBeNull();
    expect(d.keeperMemberId).toBeNull();
  });

  it("keeps an unmatched PlayHQ name as its gap; other open slots start empty", () => {
    const d = carryDraftSlots({
      previous: {
        slots: side([1], {
          1: {
            memberId: null,
            gap: { name: "Private Player", reason: "not_on_register", participantId: "g-1" },
          },
          2: { memberId: null, gap: { name: "Cal Dunn", reason: "withdrew" } },
        }),
        captainMemberId: null,
        keeperMemberId: null,
      },
      members: MEMBERS,
    });
    expect(d.slots[1]).toEqual({
      memberId: null,
      gap: { name: "Private Player", reason: "not_on_register", participantId: "g-1" },
    });
    expect(d.slots[2]).toEqual({ memberId: null });
  });

  it("leaves a member already playing at that time as a gap 'picked in another side'", () => {
    const placed = new Set([1]);
    const d = carryDraftSlots({
      previous: { slots: side([1, 2]), captainMemberId: 1, keeperMemberId: null },
      members: MEMBERS,
      placed,
    });
    expect(d.slots[0]).toEqual({
      memberId: null,
      gap: { name: "Ava Hill", reason: "picked_elsewhere" },
    });
    expect(d.slots[1]).toEqual({ memberId: 2 });
    expect(d.captainMemberId).toBeNull();
    expect(placed.has(2)).toBe(true);
  });
});

describe("buildDraftSlots: Private Player rows (ADR-008 §4)", () => {
  const GUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const list = LAST.map((p) =>
    p.order === 3 ? { order: 3, displayName: "Private Player", participantId: GUID } : p,
  );

  it("an unmatched row's gap carries its PlayHQ participant id", () => {
    const draft = buildDraftSlots({
      lastList: list,
      members: MEMBERS,
    });
    expect(draft.slots[2]).toEqual({
      memberId: null,
      gap: { name: "Private Player", reason: "not_on_register", participantId: GUID },
    });
  });

  it("a remembered participant places its member", () => {
    const draft = buildDraftSlots({
      lastList: list,
      members: MEMBERS,
      participants: new Map([[GUID, 3]]),
    });
    expect(draft.slots[2]).toEqual({ memberId: 3 });
  });

  it("a carried Private Player gap takes its member once the club has remembered it", () => {
    const slots = Array.from({ length: 12 }, (_, i): SelectionSlot =>
      i === 1
        ? {
            memberId: null,
            gap: { name: "Private Player", reason: "not_on_register", participantId: GUID },
          }
        : { memberId: i === 0 ? 1 : null },
    );
    const previous = { slots, captainMemberId: null, keeperMemberId: null };
    expect(carryDraftSlots({ previous, members: MEMBERS }).slots[1]).toEqual(slots[1]);
    const d = carryDraftSlots({ previous, members: MEMBERS, participants: new Map([[GUID, 3]]) });
    expect(d.slots[1]).toEqual({ memberId: 3 });
    // Already placed at that time: a gap "picked in another side", as any carried member.
    const busy = carryDraftSlots({
      previous,
      members: MEMBERS,
      placed: new Set([3]),
      participants: new Map([[GUID, 3]]),
    });
    expect(busy.slots[1]).toEqual({
      memberId: null,
      gap: { name: "Cal Dunn", reason: "picked_elsewhere" },
    });
  });
});

describe("side size (ADR-009)", () => {
  const EXTRA = ["Leo Mann", "Max Nash", "Ned Ochs", "Oli Park"];
  const SQUAD = [...MEMBERS, ...EXTRA.map((n, i) => member(12 + i, n))];
  /** A PlayHQ list of 15 names, the 13th captain and the 14th keeper. */
  const LIST15: TeamListPlayer[] = [...NAMES, ...EXTRA].map((n, i) => ({
    order: i + 1,
    displayName: i === 9 ? "J. Hale" : n,
    ...(i === 9 ? { playerId: 410 } : {}),
    ...(i === 12 ? { role: "C" as const } : i === 13 ? { role: "WK" as const } : {}),
  }));

  it("seeds up to the side's size, and above 12 a role past slot 11 carries", () => {
    const draft = buildDraftSlots({ lastList: LIST15, members: SQUAD, size: 14 });
    expect(draft.sideSize).toBe(14);
    expect(draft.slots).toHaveLength(14);
    expect(draft.slots.map((s) => s.memberId)).toEqual([...MEMBERS.map((m) => m.id), 12, 13, 14]);
    expect(draft.captainMemberId).toBe(13);
    expect(draft.keeperMemberId).toBe(14);
  });

  it("at 12 (unset) seeds 12 and the 12th holds no role", () => {
    const draft = buildDraftSlots({ lastList: LIST15, members: SQUAD });
    expect(draft.sideSize).toBe(12);
    expect(draft.slots).toHaveLength(12);
    expect(draft.slots[11].memberId).toBe(12);
    expect(draft.captainMemberId).toBeNull();
    expect(draft.keeperMemberId).toBeNull();
  });

  it("a side of 12 that all play: slot 12 can hold a role, and the draft says all play", () => {
    const list = LIST15.slice(0, 12).map((p, i) => (i === 11 ? { ...p, role: "WK" as const } : p));
    const allPlay = buildDraftSlots({
      lastList: list,
      members: SQUAD,
      size: { sideSize: 12, allPlay: true },
    });
    expect(allPlay.allPlay).toBe(true);
    expect(allPlay.slots[11].memberId).toBe(12);
    expect(allPlay.keeperMemberId).toBe(12);
    // The same list in a side of 12 with a 12th: the 12th holds no role.
    const twelfth = buildDraftSlots({ lastList: list, members: SQUAD, size: 12 });
    expect(twelfth.allPlay).toBe(false);
    expect(twelfth.keeperMemberId).toBeNull();
  });

  it("carries a keeper in slot 12 of a side that all play", () => {
    const previous = {
      slots: SQUAD.slice(0, 12).map((m) => ({ memberId: m.id }) as SelectionSlot),
      captainMemberId: 1,
      keeperMemberId: 12,
    };
    const draft = carryDraftSlots({
      previous,
      members: SQUAD,
      size: { sideSize: 12, allPlay: true },
    });
    expect(draft.allPlay).toBe(true);
    expect(draft.keeperMemberId).toBe(12);
  });

  it("an empty list still gives the side its size", () => {
    const draft = buildDraftSlots({ lastList: null, members: SQUAD, size: 13 });
    expect(draft.slots).toHaveLength(13);
    expect(draft.sideSize).toBe(13);
  });

  it("carries a side of 14 slot for slot, roles anywhere in it", () => {
    const previous = {
      slots: SQUAD.slice(0, 14).map((m) => ({ memberId: m.id }) as SelectionSlot),
      captainMemberId: 13,
      keeperMemberId: 14,
    };
    const draft = carryDraftSlots({ previous, members: SQUAD, size: 14 });
    expect(draft.slots.map((s) => s.memberId)).toEqual(SQUAD.slice(0, 14).map((m) => m.id));
    expect(draft.captainMemberId).toBe(13);
    expect(draft.keeperMemberId).toBe(14);
  });

  it("a side of 14 carried into a grade now 12 takes the first 12; a role past the XI clears", () => {
    const previous = {
      slots: SQUAD.slice(0, 14).map((m) => ({ memberId: m.id }) as SelectionSlot),
      captainMemberId: 13,
      keeperMemberId: 2,
    };
    const draft = carryDraftSlots({ previous, members: SQUAD, size: 12 });
    expect(draft.slots.map((s) => s.memberId)).toEqual(SQUAD.slice(0, 12).map((m) => m.id));
    expect(draft.captainMemberId).toBeNull();
    expect(draft.keeperMemberId).toBe(2);
  });
});
