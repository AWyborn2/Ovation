import { describe, it, expect } from "vitest";
import type { AvailabilityStatus, TeamListPlayer } from "@workspace/db";
import { buildDraftSlots, type ResponsesByMember } from "./selection-drafts";
import type { MemberIdentity } from "./availability-grades";

/**
 * The cut-off draft rules (plan 2026-10-06-002 U6: R16–R18, R37, KTD7, AE1).
 * Pure — the DB-backed round builder is covered in selection-drafts.int.test.ts.
 */

const DATE = "2026-10-17";
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

const answers = (byId: Record<number, AvailabilityStatus>, date = DATE): ResponsesByMember => {
  const m = new Map<number, Map<string, AvailabilityStatus>>();
  for (const [id, s] of Object.entries(byId)) m.set(Number(id), new Map([[date, s]]));
  return m;
};

const allYes = (except: number[] = []) =>
  Object.fromEntries(
    MEMBERS.filter((m) => !except.includes(m.id)).map((m) => [m.id, "yes" as const]),
  );

describe("buildDraftSlots", () => {
  it("keeps Yes players in place and leaves labelled gaps for No, Maybe and no reply (AE1)", () => {
    const responses = answers({ ...allYes([3, 6, 10]), 3: "no", 6: "maybe" });
    const draft = buildDraftSlots({
      lastList: LAST,
      members: MEMBERS,
      responses,
      fixtureDate: DATE,
    });
    expect(draft.slots).toHaveLength(11);
    expect(draft.slots.filter((s) => s.memberId != null)).toHaveLength(8);
    expect(draft.slots[0]).toEqual({ memberId: 1 });
    expect(draft.slots[2]).toEqual({ memberId: null, gap: { name: "Cal Dunn", reason: "no" } });
    expect(draft.slots[5]).toEqual({ memberId: null, gap: { name: "Finn Hart", reason: "maybe" } });
    expect(draft.slots[9]).toEqual({
      memberId: null,
      gap: { name: "J. Hale", reason: "no_reply" },
    });
  });

  it("carries the captain who stays and drops the keeper who said No (R37)", () => {
    const list = LAST.map((p) =>
      p.order === 1
        ? { ...p, role: "C" as const }
        : p.order === 2
          ? { ...p, role: "WK" as const }
          : p,
    );
    const draft = buildDraftSlots({
      lastList: list,
      members: MEMBERS,
      responses: answers({ ...allYes([2]), 2: "no" }),
      fixtureDate: DATE,
    });
    expect(draft.captainMemberId).toBe(1);
    expect(draft.keeperMemberId).toBeNull();
  });

  it("carries a C/WK player as both captain and keeper", () => {
    const list = LAST.map((p) => (p.order === 4 ? { ...p, role: "C/WK" as const } : p));
    const draft = buildDraftSlots({
      lastList: list,
      members: MEMBERS,
      responses: answers(allYes()),
      fixtureDate: DATE,
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
      responses: answers(allYes()),
      fixtureDate: DATE,
    });
    expect(draft.slots[4]).toEqual({
      memberId: null,
      gap: { name: "Eli Grant", reason: "not_on_register" },
    });
  });

  it("matches an unlinked entry by preferred name plus last name", () => {
    const tom = member(50, "Thomas Brooks", { preferredName: "Tom" });
    const list: TeamListPlayer[] = [{ order: 1, displayName: "Tom Brooks" }];
    const draft = buildDraftSlots({
      lastList: list,
      members: [tom],
      responses: answers({ 50: "yes" }),
      fixtureDate: DATE,
    });
    expect(draft.slots[0]).toEqual({ memberId: 50 });
  });

  it("treats unknown names and inactive members as not on register", () => {
    const members = MEMBERS.map((m) => (m.id === 7 ? { ...m, active: false } : m));
    const list = LAST.map((p) => (p.order === 8 ? { ...p, displayName: "New Signing" } : p));
    const draft = buildDraftSlots({
      lastList: list,
      members,
      responses: answers(allYes()),
      fixtureDate: DATE,
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

  it("starts with 11 open slots and no roles when there is no earlier list", () => {
    const draft = buildDraftSlots({
      lastList: null,
      members: MEMBERS,
      responses: answers(allYes()),
      fixtureDate: DATE,
    });
    expect(draft.slots).toEqual(Array.from({ length: 11 }, () => ({ memberId: null })));
    expect(draft.captainMemberId).toBeNull();
    expect(draft.keeperMemberId).toBeNull();
  });

  it("leaves a Yes player who was not in the last side out, for the pool (R18)", () => {
    const extra = member(99, "Zed Young");
    const draft = buildDraftSlots({
      lastList: LAST,
      members: [...MEMBERS, extra],
      responses: answers({ ...allYes(), 99: "yes" }),
      fixtureDate: DATE,
    });
    expect(draft.slots.map((s) => s.memberId)).not.toContain(99);
    expect(draft.slots.every((s) => s.memberId != null)).toBe(true);
  });

  it("only counts answers for the fixture's own date", () => {
    const draft = buildDraftSlots({
      lastList: LAST,
      members: MEMBERS,
      responses: answers(allYes(), "2026-10-18"),
      fixtureDate: DATE,
    });
    expect(draft.slots.every((s) => s.gap?.reason === "no_reply")).toBe(true);
  });

  it("orders by the list's order, pads a short list and trims a long one to 11", () => {
    const short = [...LAST.slice(0, 3)].reverse();
    const d1 = buildDraftSlots({
      lastList: short,
      members: MEMBERS,
      responses: answers(allYes()),
      fixtureDate: DATE,
    });
    expect(d1.slots.map((s) => s.memberId)).toEqual([1, 2, 3, ...Array(8).fill(null)]);
    expect(d1.slots[3]).toEqual({ memberId: null });

    const twelfth = member(12, "Leo Mann");
    const long = [...LAST, { order: 12, displayName: "Leo Mann" }];
    const d2 = buildDraftSlots({
      lastList: long,
      members: [...MEMBERS, twelfth],
      responses: answers({ ...allYes(), 12: "yes" }),
      fixtureDate: DATE,
    });
    expect(d2.slots).toHaveLength(11);
    expect(d2.slots.map((s) => s.memberId)).not.toContain(12);
  });

  it("places a member listed twice only once", () => {
    const list = [...LAST.slice(0, 10), { order: 11, displayName: "Ava Hill" }];
    const draft = buildDraftSlots({
      lastList: list,
      members: MEMBERS,
      responses: answers(allYes()),
      fixtureDate: DATE,
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
      responses: answers(allYes()),
      fixtureDate: DATE,
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
